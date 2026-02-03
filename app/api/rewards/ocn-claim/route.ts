/**
 * POST /api/rewards/ocn-claim
 *
 * Custom claim endpoint for OCN token rewards.
 * The platform wallet holds the Meteora DAMM v2 LP token, so:
 * 1. Platform wallet claims full USDC rewards
 * 2. 66.66% (2/3) is transferred to the creator
 * 3. 33.33% (1/3) stays in the platform wallet
 *
 * Returns a partially-signed transaction for the creator to sign.
 * The creator signs a memo instruction to acknowledge receipt.
 *
 * Security:
 * - Requires JWT authentication
 * - Only the token creator can initiate claims
 * - Platform wallet private key stored securely in env
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { CpAmm, getUnClaimLpFee, getTokenProgram } from '@meteora-ag/cp-amm-sdk';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';
import {
  OCN_LP_HOLDER_WALLET,
  OCN_CREATOR_SHARE,
  USDC_MINT,
  isOcnToken,
} from '@/lib/config/ocn-rewards';
import bs58 from 'bs58';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

// Memo program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export interface OcnClaimRequest {
  tokenAddress: string;
}

export interface OcnClaimResponse {
  success: boolean;
  data?: {
    claimId: string;
    serializedTransaction: string; // Base64 encoded partially-signed transaction
    creatorShareUsdc: number;
    platformShareUsdc: number;
    totalUsdc: number;
  };
  error?: string;
}

// Pool state type from Meteora SDK
interface PoolState {
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAFlag: number;
  tokenBFlag: number;
}

// Position type from Meteora SDK
interface Position {
  position: PublicKey;
  positionNftAccount: PublicKey;
}

// Helper to fetch DAMM v2 LP fees from platform wallet
async function fetchDammFeesFromPlatform(
  dammClient: CpAmm,
  dammV2PoolAddress: string,
  platformWallet: PublicKey
): Promise<{
  totalUsdcRaw: number;
  totalUsdc: number;
  poolState: PoolState | null;
  positions: Position[];
}> {
  try {
    const poolPubkey = new PublicKey(dammV2PoolAddress);
    const [poolState, positions] = await Promise.all([
      dammClient.fetchPoolState(poolPubkey),
      dammClient.getUserPositionByPool(poolPubkey, platformWallet),
    ]);

    if (!poolState || !positions || positions.length === 0) {
      return { totalUsdcRaw: 0, totalUsdc: 0, poolState, positions: positions || [] };
    }

    // Identify USDC token (A or B)
    const tokenAMint = poolState.tokenAMint?.toBase58?.() || String(poolState.tokenAMint);
    const tokenBMint = poolState.tokenBMint?.toBase58?.() || String(poolState.tokenBMint);

    let totalUsdcRaw = 0;

    // Sum up unclaimed USDC fees from all positions
    for (const pos of positions) {
      try {
        const positionState = await dammClient.fetchPositionState(pos.position);
        if (positionState) {
          const unclaimedFees = getUnClaimLpFee(poolState, positionState);

          // Add USDC fees (whichever token is USDC)
          if (tokenAMint === USDC_MINT) {
            totalUsdcRaw += unclaimedFees.feeTokenA.toNumber();
          }
          if (tokenBMint === USDC_MINT) {
            totalUsdcRaw += unclaimedFees.feeTokenB.toNumber();
          }
        }
      } catch {
        // Skip positions we can't fetch
      }
    }

    return {
      totalUsdcRaw,
      totalUsdc: totalUsdcRaw / 1e6, // USDC has 6 decimals
      poolState,
      positions,
    };
  } catch {
    return { totalUsdcRaw: 0, totalUsdc: 0, poolState: null, positions: [] };
  }
}

// Get platform wallet keypair from env
function getPlatformKeypair(): Keypair {
  const privateKeyBase58 = process.env.OCN_REWARDS_CLAIM_WALLET_PRIVATE_KEY;
  if (!privateKeyBase58) {
    throw new Error('OCN_REWARDS_CLAIM_WALLET_PRIVATE_KEY not configured');
  }

  const privateKeyBytes = bs58.decode(privateKeyBase58);
  return Keypair.fromSecretKey(privateKeyBytes);
}

export async function POST(request: NextRequest) {
  try {
    // Verify JWT and extract wallet address
    const { user, error: authError } = await requireWalletAuth(request);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: authError || 'Authentication required' } as OcnClaimResponse,
        { status: 401 }
      );
    }

    const creatorWallet = user.walletAddress;

    const body: OcnClaimRequest = await request.json();
    const { tokenAddress } = body;

    // Validate this is the OCN token
    if (!tokenAddress || !isOcnToken(tokenAddress)) {
      return NextResponse.json(
        { success: false, error: 'This endpoint only handles OCN token claims' } as OcnClaimResponse,
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the requester is the OCN token creator
    const { data: tokenData, error: tokenError } = await supabase
      .from('tokens')
      .select('creator_wallet, damm_v2_pool_address')
      .eq('address', tokenAddress)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { success: false, error: 'Token not found' } as OcnClaimResponse,
        { status: 404 }
      );
    }

    if (tokenData.creator_wallet !== creatorWallet) {
      return NextResponse.json(
        { success: false, error: 'Only the token creator can claim rewards' } as OcnClaimResponse,
        { status: 403 }
      );
    }

    if (!tokenData.damm_v2_pool_address) {
      return NextResponse.json(
        { success: false, error: 'No DAMM v2 pool found for this token' } as OcnClaimResponse,
        { status: 400 }
      );
    }

    // Initialize Solana clients
    const connection = new Connection(rpcUrl, 'confirmed');
    const dammClient = new CpAmm(connection);

    // Get platform wallet (holds the LP token)
    const platformKeypair = getPlatformKeypair();
    const platformWallet = platformKeypair.publicKey;

    // Verify platform wallet matches expected
    if (platformWallet.toBase58() !== OCN_LP_HOLDER_WALLET) {
      console.error('Platform wallet mismatch:', platformWallet.toBase58(), 'vs', OCN_LP_HOLDER_WALLET);
      return NextResponse.json(
        { success: false, error: 'Platform wallet configuration error' } as OcnClaimResponse,
        { status: 500 }
      );
    }

    const creatorPubkey = new PublicKey(creatorWallet);

    // Fetch claimable fees from platform wallet's LP position
    const feesResult = await fetchDammFeesFromPlatform(
      dammClient,
      tokenData.damm_v2_pool_address,
      platformWallet
    );

    if (feesResult.totalUsdc < 0.01 || !feesResult.poolState || feesResult.positions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No USDC fees available to claim' } as OcnClaimResponse,
        { status: 400 }
      );
    }

    // Calculate shares using integer math to avoid floating point rounding errors
    // Creator gets 2/3, platform keeps 1/3
    // We use integer division: creatorShare = floor(total * 2 / 3)
    // Platform gets remainder: platformShare = total - creatorShare
    // This guarantees: creatorShare + platformShare === total (no rounding errors)
    const totalUsdcRaw = feesResult.totalUsdcRaw;
    const creatorShareRaw = Math.floor((totalUsdcRaw * 2) / 3);
    const platformShareRaw = totalUsdcRaw - creatorShareRaw;

    const totalUsdc = totalUsdcRaw / 1e6;
    const creatorShareUsdc = creatorShareRaw / 1e6;
    const platformShareUsdc = platformShareRaw / 1e6;

    // Build the transaction
    const instructions: TransactionInstruction[] = [];
    const dammV2PoolAddress = new PublicKey(tokenData.damm_v2_pool_address);
    const firstPosition = feesResult.positions[0];

    // Get token addresses from pool state
    const tokenAMint = new PublicKey(feesResult.poolState.tokenAMint);
    const tokenBMint = new PublicKey(feesResult.poolState.tokenBMint);
    const tokenAVault = new PublicKey(feesResult.poolState.tokenAVault);
    const tokenBVault = new PublicKey(feesResult.poolState.tokenBVault);
    const position = new PublicKey(firstPosition.position);
    const positionNftAccount = new PublicKey(firstPosition.positionNftAccount);

    // 1. Claim DAMM fees to platform wallet
    // The SDK's claimPositionFee2 returns a transaction, we need the instructions
    const claimTx = await dammClient.claimPositionFee2({
      owner: platformWallet,
      receiver: platformWallet, // Claim to platform wallet first
      pool: dammV2PoolAddress,
      position,
      positionNftAccount,
      tokenAVault,
      tokenBVault,
      tokenAMint,
      tokenBMint,
      tokenAProgram: getTokenProgram(feesResult.poolState.tokenAFlag),
      tokenBProgram: getTokenProgram(feesResult.poolState.tokenBFlag),
      feePayer: platformWallet,
    });

    // Add claim instructions
    instructions.push(...claimTx.instructions);

    // 2. Get USDC token accounts
    const usdcMint = new PublicKey(USDC_MINT);
    const platformUsdcAccount = await getAssociatedTokenAddress(usdcMint, platformWallet);
    const creatorUsdcAccount = await getAssociatedTokenAddress(usdcMint, creatorPubkey);

    // Check if creator has USDC account, create if needed
    try {
      await getAccount(connection, creatorUsdcAccount);
    } catch {
      // Creator doesn't have USDC account, add instruction to create it
      instructions.push(
        createAssociatedTokenAccountInstruction(
          platformWallet, // payer
          creatorUsdcAccount,
          creatorPubkey,
          usdcMint
        )
      );
    }

    // 3. Transfer creator's share (2/3) of USDC
    instructions.push(
      createTransferInstruction(
        platformUsdcAccount,
        creatorUsdcAccount,
        platformWallet,
        BigInt(creatorShareRaw),
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // 4. Add memo instruction for creator to sign (shows +USDC in wallet)
    const memoText = `OCN Creator Rewards: ${creatorShareUsdc.toFixed(2)} USDC`;
    instructions.push(
      new TransactionInstruction({
        keys: [{ pubkey: creatorPubkey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoText, 'utf-8'),
      })
    );

    // Build versioned transaction
    const { blockhash } = await connection.getLatestBlockhash('confirmed');

    const message = new TransactionMessage({
      payerKey: platformWallet, // Platform pays for transaction
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    // Partially sign with platform wallet (claim + transfer instructions)
    transaction.sign([platformKeypair]);

    // Serialize for frontend
    const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

    // Generate claim ID and store pending claim
    const claimId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store with same schema as regular claims, using total_sol field for backwards compat
    // The actual USDC amount is tracked in damm_fees_sol field (we can add usdc columns later)
    await supabase.from('pending_claims').insert({
      id: claimId,
      token_address: tokenAddress,
      creator_wallet: creatorWallet,
      dbc_fees_sol: 0,
      migration_fee_sol: 0,
      damm_fees_sol: creatorShareUsdc, // Storing USDC amount here for OCN claim
      total_sol: creatorShareUsdc, // Creator's USDC share
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        claimId,
        serializedTransaction,
        creatorShareUsdc,
        platformShareUsdc,
        totalUsdc,
      },
    } as OcnClaimResponse);
  } catch (error: unknown) {
    console.error('Error in OCN claim:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to prepare OCN claim: ${errorMessage}` } as OcnClaimResponse,
      { status: 500 }
    );
  }
}
