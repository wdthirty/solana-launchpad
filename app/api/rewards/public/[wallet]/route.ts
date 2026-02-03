/**
 * GET /api/rewards/public/[wallet]
 *
 * Public endpoint to fetch claimable rewards for any creator wallet.
 * Fetches LIVE on-chain data - no authentication required.
 * Supports both SOL and USDC quote tokens.
 *
 * This is a read-only endpoint for displaying rewards on profiles.
 * For claiming rewards, use the authenticated /api/rewards/[wallet] endpoint.
 *
 * Rate limiting: Consider adding rate limiting in production to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk';
import {
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

// Validate Solana wallet address format
function isValidSolanaAddress(address: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

export interface PublicRewardsResponse {
  success: boolean;
  data?: {
    creatorWallet: string;
    totalClaimableSol: number;
    totalClaimableUsdc: number;
    totalClaimedSol: number;
    totalClaimedUsdc: number;
  };
  error?: string;
}

interface DbcFeesResult {
  quoteFee: number; // In quote token units (SOL or USDC)
  quoteToken: 'SOL' | 'USDC';
}

interface DammFeesResult {
  feeTokenA: number; // Usually SOL
  feeTokenB: number; // Usually the meme token
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
      return { quoteFee: 0, quoteToken: 'SOL' };
    }

    const creatorQuoteFee = poolState.account.creatorQuoteFee?.toNumber() || 0;
    const quoteMint = poolState.account.quoteMint?.toBase58();

    // Determine quote token type
    // USDC has 6 decimals, SOL has 9 decimals
    const isUsdc = quoteMint === USDC_MINT;
    const decimals = isUsdc ? 6 : 9;

    return {
      quoteFee: creatorQuoteFee / Math.pow(10, decimals),
      quoteToken: isUsdc ? 'USDC' : 'SOL',
    };
  } catch {
    return { quoteFee: 0, quoteToken: 'SOL' };
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
    feeTokenB: 0,
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

    let totalFeeA = 0;
    let totalFeeB = 0;

    for (const pos of positions) {
      try {
        const positionState = await dammClient.fetchPositionState(pos.position);
        if (positionState) {
          const unclaimedFees = getUnClaimLpFee(poolState, positionState);
          totalFeeA += unclaimedFees.feeTokenA.toNumber();
          totalFeeB += unclaimedFees.feeTokenB.toNumber();
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
      feeTokenA: totalFeeA / Math.pow(10, tokenADecimals),
      feeTokenB: totalFeeB / Math.pow(10, tokenBDecimals),
      tokenAMint,
      tokenBMint,
    };
  } catch {
    return emptyResult;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    // Validate wallet address format
    if (!wallet || !isValidSolanaAddress(wallet)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid wallet address',
        } as PublicRewardsResponse,
        { status: 400 }
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
        .select('address, damm_v2_pool_address')
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
          error: 'Failed to fetch tokens',
        } as PublicRewardsResponse,
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
        },
      } as PublicRewardsResponse);
    }

    // Initialize Solana clients
    const connection = new Connection(rpcUrl, 'confirmed');
    const dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');
    const dammClient = new CpAmm(connection);
    const creatorPubkey = new PublicKey(wallet);

    // OCN token uses platform wallet for LP position
    const ocnLpHolderPubkey = new PublicKey(OCN_LP_HOLDER_WALLET);

    // Fetch on-chain fees for all tokens in parallel
    const feesPromises = creatorTokens.map(async (token) => {
      const tokenMint = new PublicKey(token.address);
      const isOcn = isOcnToken(token.address);

      // For OCN token, fetch DAMM fees from platform wallet (LP holder)
      const dammFeeWallet = isOcn ? ocnLpHolderPubkey : creatorPubkey;

      const [dbcResult, dammResult] = await Promise.all([
        fetchDbcFees(dbcClient, tokenMint),
        token.damm_v2_pool_address
          ? fetchDammFees(dammClient, token.damm_v2_pool_address, dammFeeWallet)
          : Promise.resolve({ feeTokenA: 0, feeTokenB: 0, tokenAMint: SOL_MINT, tokenBMint: '' } as DammFeesResult),
      ]);

      // Calculate SOL and USDC separately
      let solFees = 0;
      let usdcFees = 0;

      // DBC fees
      if (dbcResult.quoteToken === 'USDC') {
        usdcFees += dbcResult.quoteFee;
      } else {
        solFees += dbcResult.quoteFee;
      }

      // DAMM fees - only count SOL or USDC fees (not the meme token)
      let dammSolFees = 0;
      let dammUsdcFees = 0;

      if (dammResult.tokenAMint === SOL_MINT) {
        dammSolFees += dammResult.feeTokenA;
      } else if (dammResult.tokenAMint === USDC_MINT) {
        dammUsdcFees += dammResult.feeTokenA;
      }

      if (dammResult.tokenBMint === SOL_MINT) {
        dammSolFees += dammResult.feeTokenB;
      } else if (dammResult.tokenBMint === USDC_MINT) {
        dammUsdcFees += dammResult.feeTokenB;
      }

      // For OCN token: only show USDC rewards (apply creator share 2/3), zero out SOL
      if (isOcn) {
        solFees = 0; // OCN only shows USDC
        dammSolFees = 0;
        dammUsdcFees *= OCN_CREATOR_SHARE;
      }

      solFees += dammSolFees;
      usdcFees += dammUsdcFees;

      return { sol: solFees, usdc: usdcFees };
    });

    const allFees = await Promise.all(feesPromises);
    const totalClaimableSol = allFees.reduce((sum, fee) => sum + fee.sol, 0);
    const totalClaimableUsdc = allFees.reduce((sum, fee) => sum + fee.usdc, 0);

    // Cache for 30 seconds to reduce RPC load from anonymous traffic
    const headers = new Headers();
    headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

    return NextResponse.json(
      {
        success: true,
        data: {
          creatorWallet: wallet,
          totalClaimableSol,
          totalClaimableUsdc,
          totalClaimedSol,
          totalClaimedUsdc,
        },
      } as PublicRewardsResponse,
      { headers }
    );
  } catch (error) {
    console.error('Unexpected error in GET /api/rewards/public/[wallet]:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      } as PublicRewardsResponse,
      { status: 500 }
    );
  }
}
