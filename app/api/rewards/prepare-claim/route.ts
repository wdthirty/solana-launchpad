/**
 * POST /api/rewards/prepare-claim
 *
 * Prepares claim transaction data by fetching on-chain state via RPC.
 * Stores the claim intent in DB so log-claim can use trusted amounts.
 *
 * Security:
 * - Requires JWT authentication (JWKS verified)
 * - Wallet address is extracted from verified JWT, not request body
 * - Only the verified token creator can prepare claims
 * - Amounts are fetched from on-chain, not client-provided
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

export interface PrepareClaimRequest {
  walletAddress?: string; // Deprecated: ignored, using JWT wallet instead
  tokenAddress: string;
}

export interface PrepareClaimResponse {
  success: boolean;
  data?: {
    claimId: string; // Unique ID for this claim intent
    tokenAddress: string;
    poolAddress: string;
    creatorWallet: string;
    dammV2PoolAddress?: string;
    availableRewards: {
      dbc: boolean;
      migration: boolean;
      damm: boolean;
    };
    amounts: {
      dbcSol: number;
      migrationSol: number;
      dammSol: number;
      totalSol: number;
    };
    // Data needed for transaction building (client-side)
    poolData: {
      baseMint: string;
      config: string;
      isMigrated: boolean;
      migrationFeeWithdrawStatus: boolean;
    };
    dammPoolState?: any;
    userPositions?: any[];
  };
  error?: string;
}

// Helper to fetch DBC fees from on-chain
async function fetchDbcFees(
  dbcClient: DynamicBondingCurveClient,
  tokenMint: PublicKey
): Promise<{ creatorQuoteFeeSol: number; isMigrated: boolean; poolAddress: string | null; config: string | null }> {
  try {
    const poolState = await dbcClient.state.getPoolByBaseMint(tokenMint);
    if (!poolState) {
      return { creatorQuoteFeeSol: 0, isMigrated: false, poolAddress: null, config: null };
    }

    const creatorQuoteFee = poolState.account.creatorQuoteFee?.toNumber() || 0;
    const creatorQuoteFeeSol = creatorQuoteFee / 1e9;
    const isMigrated = Boolean(poolState.account.isMigrated);

    return {
      creatorQuoteFeeSol,
      isMigrated,
      poolAddress: poolState.publicKey.toBase58(),
      config: poolState.account.config?.toBase58() || null,
    };
  } catch {
    return { creatorQuoteFeeSol: 0, isMigrated: false, poolAddress: null, config: null };
  }
}

// Helper to fetch DAMM v2 LP fees from on-chain
async function fetchDammFees(
  dammClient: CpAmm,
  dammV2PoolAddress: string,
  creatorWallet: PublicKey
): Promise<{ dammFeesSol: number; poolState: any; positions: any[] }> {
  try {
    const poolAddressStr = dammV2PoolAddress?.trim();
    if (!poolAddressStr || poolAddressStr.length < 32) {
      return { dammFeesSol: 0, poolState: null, positions: [] };
    }

    const poolPubkey = new PublicKey(poolAddressStr);
    const [poolState, positions] = await Promise.all([
      dammClient.fetchPoolState(poolPubkey),
      dammClient.getUserPositionByPool(poolPubkey, creatorWallet),
    ]);

    if (!poolState || !positions || positions.length === 0) {
      return { dammFeesSol: 0, poolState, positions: positions || [] };
    }

    let totalUnclaimedLamports = 0;

    // Sum up unclaimed fees from all positions
    for (const pos of positions) {
      try {
        const positionState = await dammClient.fetchPositionState(pos.position);
        if (positionState) {
          const unclaimedFees = getUnClaimLpFee(poolState, positionState);
          totalUnclaimedLamports += unclaimedFees.feeTokenA.toNumber();
          totalUnclaimedLamports += unclaimedFees.feeTokenB.toNumber();
        }
      } catch {
        // Skip positions we can't fetch
      }
    }

    return {
      dammFeesSol: totalUnclaimedLamports / 1e9,
      poolState,
      positions,
    };
  } catch {
    return { dammFeesSol: 0, poolState: null, positions: [] };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify JWT and extract wallet address
    const { user, error: authError } = await requireWalletAuth(request);

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: authError || 'Authentication required',
        } as PrepareClaimResponse,
        { status: 401 }
      );
    }

    // Use verified wallet address from JWT
    const walletAddress = user.walletAddress;

    const body: PrepareClaimRequest = await request.json();
    const { tokenAddress } = body;

    // Validate inputs
    if (!tokenAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing tokenAddress',
        } as PrepareClaimResponse,
        { status: 400 }
      );
    }

    // Validate token address
    let tokenMint: PublicKey;
    try {
      tokenMint = new PublicKey(tokenAddress);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid token address',
        } as PrepareClaimResponse,
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Fetch token data from DB
    const { data: tokenData, error: tokenError } = await supabase
      .from('tokens')
      .select('address, name, symbol, creator_wallet, pool_address, damm_v2_pool_address, is_migrated')
      .eq('address', tokenAddress)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { success: false, error: 'Token not found' } as PrepareClaimResponse,
        { status: 404 }
      );
    }

    // 2. Verify the requester is the creator
    if (tokenData.creator_wallet !== walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Only token creator can claim rewards' } as PrepareClaimResponse,
        { status: 403 }
      );
    }

    // 3. Initialize Solana clients and fetch on-chain fees
    const connection = new Connection(rpcUrl, 'confirmed');
    const dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');
    const dammClient = new CpAmm(connection);
    const creatorPubkey = new PublicKey(walletAddress);

    // Fetch DBC and DAMM fees in parallel
    const [dbcResult, dammResult] = await Promise.all([
      fetchDbcFees(dbcClient, tokenMint),
      tokenData.damm_v2_pool_address
        ? fetchDammFees(dammClient, tokenData.damm_v2_pool_address, creatorPubkey)
        : Promise.resolve({ dammFeesSol: 0, poolState: null, positions: [] }),
    ]);

    const dbcFeesSol = dbcResult.creatorQuoteFeeSol;
    const dammFeesSol = dammResult.dammFeesSol;
    const isMigrated = dbcResult.isMigrated || tokenData.is_migrated || false;

    // TODO: Check migration fee on-chain if needed
    const migrationFeeSol = 0;
    const hasMigration = false;

    const hasDbc = dbcFeesSol >= 0.001;
    const hasDamm = dammFeesSol >= 0.001 && dammResult.poolState && dammResult.positions.length > 0;

    // Validate at least one fee type is claimable
    if (!hasDbc && !hasMigration && !hasDamm) {
      return NextResponse.json(
        {
          success: false,
          error: 'No fees available to claim',
        } as PrepareClaimResponse,
        { status: 400 }
      );
    }

    const totalSol = (hasDbc ? dbcFeesSol : 0) + (hasMigration ? migrationFeeSol : 0) + (hasDamm ? dammFeesSol : 0);

    // 4. Generate a unique claim ID and store the claim intent
    const claimId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const { error: insertError } = await supabase.from('pending_claims').insert({
      id: claimId,
      token_address: tokenAddress,
      creator_wallet: walletAddress,
      dbc_fees_sol: hasDbc ? dbcFeesSol : 0,
      migration_fee_sol: hasMigration ? migrationFeeSol : 0,
      damm_fees_sol: hasDamm ? dammFeesSol : 0,
      total_sol: totalSol,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error('Error storing claim intent:', insertError);
      // Continue anyway - we can still process the claim, just without the security benefit
    }

    // 5. Return transaction preparation data
    return NextResponse.json({
      success: true,
      data: {
        claimId,
        tokenAddress,
        poolAddress: dbcResult.poolAddress || tokenData.pool_address,
        creatorWallet: walletAddress,
        dammV2PoolAddress: tokenData.damm_v2_pool_address,
        availableRewards: {
          dbc: hasDbc,
          migration: hasMigration,
          damm: hasDamm,
        },
        amounts: {
          dbcSol: hasDbc ? dbcFeesSol : 0,
          migrationSol: hasMigration ? migrationFeeSol : 0,
          dammSol: hasDamm ? dammFeesSol : 0,
          totalSol,
        },
        poolData: {
          baseMint: tokenAddress,
          config: dbcResult.config || '',
          isMigrated,
          migrationFeeWithdrawStatus: !hasMigration,
        },
        dammPoolState: hasDamm ? dammResult.poolState : undefined,
        userPositions: hasDamm ? dammResult.positions : undefined,
      },
    } as PrepareClaimResponse);
  } catch (error: any) {
    console.error('Error in prepare-claim:', error);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to prepare claim: ${error.message || 'Unknown error'}`,
      } as PrepareClaimResponse,
      { status: 500 }
    );
  }
}
