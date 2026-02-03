/**
 * GET /api/rewards/[wallet]
 *
 * Fetches all claimable rewards for a creator wallet.
 * Now fetches LIVE on-chain data instead of relying on database.
 * Supports both SOL and USDC quote tokens.
 *
 * Security:
 * - Requires JWT authentication (JWKS verified)
 * - Only returns rewards for the authenticated user's wallet
 * - URL [wallet] param must match JWT wallet address
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';
import {
  OCN_TOKEN_ADDRESS,
  OCN_LP_HOLDER_WALLET,
  OCN_CREATOR_SHARE,
  isOcnToken,
} from '@/lib/config/ocn-rewards';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

// Known mint addresses
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface TokenRewards {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenLogo: string | null;
  quoteToken: 'SOL' | 'USDC';
  dbcFeesRaw: string;
  dbcFeesSol: number;
  dbcFeesUsdc: number;
  dammFeesRaw: string;
  dammFeesSol: number;
  dammFeesUsdc: number;
  migrationFeeClaimable: boolean;
  migrationFeeSol: number;
  totalClaimableSol: number;
  totalClaimableUsdc: number;
  dbcLastSwapAt: string | null;
  dammLastSwapAt: string | null;
  migratedAt: string | null;
  // OCN special token flag - uses custom claim flow with platform LP holder
  isOcnToken?: boolean;
}

export interface RewardsResponse {
  success: boolean;
  data?: {
    creatorWallet: string;
    totalClaimableSol: number;
    totalClaimableUsdc: number;
    totalClaimedSol: number;
    totalClaimedUsdc: number;
    tokens: TokenRewards[];
  };
  error?: string;
}

interface DbcFeesResult {
  quoteFee: number;
  quoteFeeRaw: number;
  quoteToken: 'SOL' | 'USDC';
  isMigrated: boolean;
}

interface DammFeesResult {
  feeTokenA: number;
  feeTokenARaw: number;
  feeTokenB: number;
  feeTokenBRaw: number;
  tokenAMint: string;
  tokenBMint: string;
}

// Helper to fetch DBC fees for a token
async function fetchDbcFees(
  dbcClient: DynamicBondingCurveClient,
  tokenMint: PublicKey
): Promise<DbcFeesResult> {
  try {
    const poolState = await dbcClient.state.getPoolByBaseMint(tokenMint);
    if (!poolState) {
      return { quoteFee: 0, quoteFeeRaw: 0, quoteToken: 'SOL', isMigrated: false };
    }

    const creatorQuoteFee = poolState.account.creatorQuoteFee?.toNumber() || 0;
    const quoteMint = poolState.account.quoteMint?.toBase58();
    const isMigrated = Boolean(poolState.account.isMigrated);

    // Determine quote token type
    // USDC has 6 decimals, SOL has 9 decimals
    const isUsdc = quoteMint === USDC_MINT;
    const decimals = isUsdc ? 6 : 9;

    return {
      quoteFee: creatorQuoteFee / Math.pow(10, decimals),
      quoteFeeRaw: creatorQuoteFee,
      quoteToken: isUsdc ? 'USDC' : 'SOL',
      isMigrated,
    };
  } catch {
    return { quoteFee: 0, quoteFeeRaw: 0, quoteToken: 'SOL', isMigrated: false };
  }
}

// Helper to fetch DAMM v2 LP fees for a token
async function fetchDammFees(
  dammClient: CpAmm,
  dammV2PoolAddress: string,
  creatorWallet: PublicKey
): Promise<DammFeesResult> {
  const emptyResult: DammFeesResult = {
    feeTokenA: 0,
    feeTokenARaw: 0,
    feeTokenB: 0,
    feeTokenBRaw: 0,
    tokenAMint: SOL_MINT,
    tokenBMint: '',
  };

  try {
    const poolAddressStr = dammV2PoolAddress?.trim();
    if (!poolAddressStr || poolAddressStr.length < 32) {
      return emptyResult;
    }

    const poolPubkey = new PublicKey(poolAddressStr);
    const [poolState, positions] = await Promise.all([
      dammClient.fetchPoolState(poolPubkey),
      dammClient.getUserPositionByPool(poolPubkey, creatorWallet),
    ]);

    if (!poolState || !positions || positions.length === 0) {
      return emptyResult;
    }

    // Get token mints to identify which is SOL/USDC
    const tokenAMint = poolState.tokenAMint?.toBase58?.() || String(poolState.tokenAMint);
    const tokenBMint = poolState.tokenBMint?.toBase58?.() || String(poolState.tokenBMint);

    let totalFeeARaw = 0;
    let totalFeeBRaw = 0;

    // Sum up unclaimed fees from all positions
    for (const pos of positions) {
      try {
        const positionState = await dammClient.fetchPositionState(pos.position);
        if (positionState) {
          const unclaimedFees = getUnClaimLpFee(poolState, positionState);
          totalFeeARaw += unclaimedFees.feeTokenA.toNumber();
          totalFeeBRaw += unclaimedFees.feeTokenB.toNumber();
        }
      } catch {
        // Skip positions we can't fetch
      }
    }

    // Determine decimals based on token type
    const tokenAIsUsdc = tokenAMint === USDC_MINT;
    const tokenAIsSol = tokenAMint === SOL_MINT;
    const tokenADecimals = tokenAIsUsdc ? 6 : tokenAIsSol ? 9 : 9;

    const tokenBIsUsdc = tokenBMint === USDC_MINT;
    const tokenBIsSol = tokenBMint === SOL_MINT;
    const tokenBDecimals = tokenBIsUsdc ? 6 : tokenBIsSol ? 9 : 9;

    return {
      feeTokenA: totalFeeARaw / Math.pow(10, tokenADecimals),
      feeTokenARaw: totalFeeARaw,
      feeTokenB: totalFeeBRaw / Math.pow(10, tokenBDecimals),
      feeTokenBRaw: totalFeeBRaw,
      tokenAMint,
      tokenBMint,
    };
  } catch {
    return emptyResult;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    // Verify JWT and extract wallet address
    const { user, error: authError } = await requireWalletAuth(request);

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: authError || 'Authentication required',
        } as RewardsResponse,
        { status: 401 }
      );
    }

    const { wallet } = await params;

    // Validate wallet address format
    if (!wallet || typeof wallet !== 'string' || wallet.length < 32 || wallet.length > 44) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid wallet address',
        } as RewardsResponse,
        { status: 400 }
      );
    }

    // Security: Verify the requested wallet matches the authenticated wallet
    if (wallet !== user.walletAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'You can only view your own rewards',
        } as RewardsResponse,
        { status: 403 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Query tokens created by this wallet AND claim history in parallel
    const [tokensResult, historyResult] = await Promise.all([
      supabase
        .from('tokens')
        .select('address, name, symbol, metadata, pool_address, damm_v2_pool_address, is_migrated')
        .eq('creator_wallet', wallet)
        .order('created_at', { ascending: false }),
      supabase
        .from('claimed_rewards_history')
        .select('total_claimed_sol, total_claimed_usdc')
        .eq('creator_wallet', wallet),
    ]);

    const { data: creatorTokens, error: tokensError } = tokensResult;
    const { data: claimHistory } = historyResult;

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch tokens: ${tokensError.message}`,
        } as RewardsResponse,
        { status: 500 }
      );
    }

    // Calculate total claimed from history (both SOL and USDC)
    const totalClaimedSol = (claimHistory || []).reduce(
      (sum: number, claim: any) => sum + parseFloat(claim.total_claimed_sol || '0'),
      0
    );
    const totalClaimedUsdc = (claimHistory || []).reduce(
      (sum: number, claim: any) => sum + parseFloat(claim.total_claimed_usdc || '0'),
      0
    );

    if (!creatorTokens || creatorTokens.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          creatorWallet: wallet,
          totalClaimableSol: 0,
          totalClaimableUsdc: 0,
          totalClaimedSol,
          totalClaimedUsdc,
          tokens: [],
        },
      } as RewardsResponse);
    }

    // Initialize Solana clients
    const connection = new Connection(rpcUrl, 'confirmed');
    const dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');
    const dammClient = new CpAmm(connection);
    const creatorPubkey = new PublicKey(wallet);

    // OCN token uses platform wallet for LP position
    const ocnLpHolderPubkey = new PublicKey(OCN_LP_HOLDER_WALLET);

    // Fetch on-chain fees for all tokens in parallel
    const tokenRewardsPromises = creatorTokens.map(async (token) => {
      const tokenMint = new PublicKey(token.address);
      const isOcn = isOcnToken(token.address);

      // For OCN token, fetch DAMM fees from platform wallet (LP holder)
      // For other tokens, fetch from creator wallet
      const dammFeeWallet = isOcn ? ocnLpHolderPubkey : creatorPubkey;

      // Fetch DBC and DAMM fees in parallel
      const [dbcResult, dammResult] = await Promise.all([
        fetchDbcFees(dbcClient, tokenMint),
        token.damm_v2_pool_address
          ? fetchDammFees(dammClient, token.damm_v2_pool_address, dammFeeWallet)
          : Promise.resolve({
              feeTokenA: 0,
              feeTokenARaw: 0,
              feeTokenB: 0,
              feeTokenBRaw: 0,
              tokenAMint: SOL_MINT,
              tokenBMint: '',
            } as DammFeesResult),
      ]);

      // Calculate SOL and USDC separately
      let dbcFeesSol = 0;
      let dbcFeesUsdc = 0;
      let dammFeesSol = 0;
      let dammFeesUsdc = 0;

      // DBC fees
      if (dbcResult.quoteToken === 'USDC') {
        dbcFeesUsdc = dbcResult.quoteFee;
      } else {
        dbcFeesSol = dbcResult.quoteFee;
      }

      // DAMM fees - only count SOL or USDC fees (not the meme token)
      if (dammResult.tokenAMint === SOL_MINT) {
        dammFeesSol += dammResult.feeTokenA;
      } else if (dammResult.tokenAMint === USDC_MINT) {
        dammFeesUsdc += dammResult.feeTokenA;
      }

      if (dammResult.tokenBMint === SOL_MINT) {
        dammFeesSol += dammResult.feeTokenB;
      } else if (dammResult.tokenBMint === USDC_MINT) {
        dammFeesUsdc += dammResult.feeTokenB;
      }

      // For OCN token: only show USDC rewards (apply creator share 2/3), zero out SOL
      if (isOcn) {
        dbcFeesSol = 0;
        dbcFeesUsdc = 0; // OCN doesn't have DBC fees
        dammFeesSol = 0; // Only show USDC for OCN
        dammFeesUsdc *= OCN_CREATOR_SHARE;
      }

      const totalClaimableSol = dbcFeesSol + dammFeesSol;
      const totalClaimableUsdc = dbcFeesUsdc + dammFeesUsdc;

      return {
        tokenAddress: token.address,
        tokenName: token.name || 'Unknown',
        tokenSymbol: token.symbol || '???',
        tokenLogo: token.metadata?.logo || null,
        quoteToken: dbcResult.quoteToken,
        dbcFeesRaw: dbcResult.quoteFeeRaw.toString(),
        dbcFeesSol,
        dbcFeesUsdc,
        dammFeesRaw: (dammResult.feeTokenARaw + dammResult.feeTokenBRaw).toString(),
        dammFeesSol,
        dammFeesUsdc,
        migrationFeeClaimable: false, // TODO: Check migration fee status on-chain if needed
        migrationFeeSol: 0,
        totalClaimableSol,
        totalClaimableUsdc,
        dbcLastSwapAt: null,
        dammLastSwapAt: null,
        migratedAt: token.is_migrated ? new Date().toISOString() : null,
        isOcnToken: isOcn,
      } as TokenRewards;
    });

    const allTokenRewards = await Promise.all(tokenRewardsPromises);

    // Filter out tokens with no claimable rewards and sort by total amount
    const tokensWithRewards = allTokenRewards
      .filter((t) => t.totalClaimableSol > 0 || t.totalClaimableUsdc > 0)
      .sort((a, b) => {
        // Sort by total value (SOL + USDC, treating USDC as ~1/200 SOL for sorting)
        const aTotal = a.totalClaimableSol + a.totalClaimableUsdc / 200;
        const bTotal = b.totalClaimableSol + b.totalClaimableUsdc / 200;
        return bTotal - aTotal;
      });

    // Calculate totals
    const totalClaimableSol = tokensWithRewards.reduce((sum, t) => sum + t.totalClaimableSol, 0);
    const totalClaimableUsdc = tokensWithRewards.reduce((sum, t) => sum + t.totalClaimableUsdc, 0);

    return NextResponse.json({
      success: true,
      data: {
        creatorWallet: wallet,
        totalClaimableSol,
        totalClaimableUsdc,
        totalClaimedSol,
        totalClaimedUsdc,
        tokens: tokensWithRewards,
      },
    } as RewardsResponse);
  } catch (error) {
    console.error('Unexpected error in GET /api/rewards/[wallet]:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      } as RewardsResponse,
      { status: 500 }
    );
  }
}
