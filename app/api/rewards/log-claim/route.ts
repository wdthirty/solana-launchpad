/**
 * POST /api/rewards/log-claim
 *
 * Records a successful claim to claimed_rewards_history.
 * Uses trusted amounts from pending_claims table (set by prepare-claim).
 *
 * Security:
 * - Requires JWT authentication (JWKS verified)
 * - Creator wallet is extracted from verified JWT, not request body
 * - Verifies transaction exists on-chain and was signed by authenticated wallet
 * - Uses server-side amounts from prepare-claim, not client-provided
 * - Idempotency check using transaction_signature
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection } from '@solana/web3.js';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';
import { isOcnToken, OCN_LP_HOLDER_WALLET } from '@/lib/config/ocn-rewards';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

export interface LogClaimRequest {
  claimId: string; // The claim ID from prepare-claim
  transactionSignature: string;
}

export interface LogClaimResponse {
  success: boolean;
  message?: string;
  error?: string;
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
        } as LogClaimResponse,
        { status: 401 }
      );
    }

    // Use verified wallet address from JWT
    const creatorWallet = user.walletAddress;

    const body: LogClaimRequest = await request.json();
    const { claimId, transactionSignature } = body;

    // Validate inputs
    if (!claimId || !transactionSignature) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing claimId or transactionSignature',
        } as LogClaimResponse,
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Check for duplicate transaction signature (idempotency)
    const { data: existingClaim } = await supabase
      .from('claimed_rewards_history')
      .select('id')
      .eq('transaction_signature', transactionSignature)
      .single();

    if (existingClaim) {
      return NextResponse.json(
        {
          success: false,
          error: 'This transaction has already been logged',
        } as LogClaimResponse,
        { status: 409 }
      );
    }

    // 2. Fetch the pending claim to get trusted amounts
    const { data: pendingClaim, error: pendingError } = await supabase
      .from('pending_claims')
      .select('*')
      .eq('id', claimId)
      .single();

    if (pendingError || !pendingClaim) {
      return NextResponse.json(
        {
          success: false,
          error: 'Claim not found. Please prepare the claim again.',
        } as LogClaimResponse,
        { status: 404 }
      );
    }

    // Verify the pending claim belongs to the authenticated wallet
    if (pendingClaim.creator_wallet !== creatorWallet) {
      return NextResponse.json(
        {
          success: false,
          error: 'This claim does not belong to your wallet',
        } as LogClaimResponse,
        { status: 403 }
      );
    }

    // Check if claim has expired
    if (new Date(pendingClaim.expires_at) < new Date()) {
      // Delete expired claim
      await supabase.from('pending_claims').delete().eq('id', claimId);
      return NextResponse.json(
        {
          success: false,
          error: 'Claim has expired. Please prepare the claim again.',
        } as LogClaimResponse,
        { status: 400 }
      );
    }

    // 3. Verify transaction exists on-chain and was successful
    const connection = new Connection(rpcUrl, 'confirmed');
    try {
      const txInfo = await connection.getTransaction(transactionSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!txInfo) {
        return NextResponse.json(
          {
            success: false,
            error: 'Transaction not found on-chain. Please wait for confirmation.',
          } as LogClaimResponse,
          { status: 400 }
        );
      }

      if (txInfo.meta?.err) {
        return NextResponse.json(
          {
            success: false,
            error: 'Transaction failed on-chain',
          } as LogClaimResponse,
          { status: 400 }
        );
      }

      // Verify the transaction signer matches expected wallet
      const signers = txInfo.transaction.message.getAccountKeys().staticAccountKeys;
      const firstSigner = signers[0]?.toBase58();

      // For OCN token claims, the platform wallet is the fee payer (first signer)
      // but the creator still signs the memo instruction
      const isOcn = isOcnToken(pendingClaim.token_address);
      const expectedFirstSigner = isOcn ? OCN_LP_HOLDER_WALLET : creatorWallet;

      if (firstSigner !== expectedFirstSigner) {
        return NextResponse.json(
          {
            success: false,
            error: 'Transaction was not signed by expected wallet',
          } as LogClaimResponse,
          { status: 403 }
        );
      }

      // For OCN claims, verify creator is also a signer (they sign the memo)
      if (isOcn) {
        const allSigners = signers.map((s: { toBase58: () => string }) => s.toBase58());
        if (!allSigners.includes(creatorWallet)) {
          return NextResponse.json(
            {
              success: false,
              error: 'Creator wallet did not sign the transaction',
            } as LogClaimResponse,
            { status: 403 }
          );
        }
      }
    } catch (txError: unknown) {
      console.error('Error verifying transaction:', txError);
      return NextResponse.json(
        {
          success: false,
          error: 'Could not verify transaction on-chain',
        } as LogClaimResponse,
        { status: 400 }
      );
    }

    // 4. Use trusted amounts from pending claim
    const dbcSol = parseFloat(pendingClaim.dbc_fees_sol || '0');
    const migrationSol = parseFloat(pendingClaim.migration_fee_sol || '0');
    const dammSol = parseFloat(pendingClaim.damm_fees_sol || '0');
    const totalClaimedSol = parseFloat(pendingClaim.total_sol || '0');
    const tokenAddress = pendingClaim.token_address;

    // For OCN token, the amounts are in USDC not SOL
    const isOcn = isOcnToken(tokenAddress);
    const totalClaimedUsdc = isOcn ? totalClaimedSol : 0; // OCN stores USDC in sol fields

    // 5. Get or create fee record for this token
    const { data: currentFees } = await supabase
      .from('creator_fees')
      .select('*')
      .eq('token_address', tokenAddress)
      .single();

    if (!currentFees) {
      const { error: insertError } = await supabase.from('creator_fees').insert({
        token_address: tokenAddress,
        creator_wallet: creatorWallet,
        dbc_fees_lamports: 0,
        dbc_fees_sol: 0,
        damm_fees_lamports: 0,
        damm_fees_sol: 0,
        migration_fee_claimable: false,
        migration_fee_sol: 0,
        total_claimable_sol: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (insertError) {
        console.warn('Could not create fee record:', insertError);
      }
    }

    // 6. Get previous cumulative total for this creator
    const { data: previousClaims } = await supabase
      .from('claimed_rewards_history')
      .select('cumulative_earned_sol')
      .eq('creator_wallet', creatorWallet)
      .order('claimed_at', { ascending: false })
      .limit(1);

    const previousCumulative = previousClaims?.[0]?.cumulative_earned_sol
      ? parseFloat(previousClaims[0].cumulative_earned_sol)
      : 0;
    const cumulativeEarnedSol = previousCumulative + totalClaimedSol;

    // 7. Record claim in history with cumulative total
    const historyRecord: Record<string, string | number> = {
      token_address: tokenAddress,
      creator_wallet: creatorWallet,
      dbc_fees_sol: isOcn ? 0 : dbcSol,
      migration_fee_sol: isOcn ? 0 : migrationSol,
      damm_fees_sol: isOcn ? 0 : dammSol,
      total_claimed_sol: isOcn ? 0 : totalClaimedSol,
      total_claimed_usdc: totalClaimedUsdc,
      cumulative_earned_sol: isOcn ? previousCumulative : cumulativeEarnedSol,
      transaction_signature: transactionSignature,
      claimed_at: new Date().toISOString(),
    };

    const { error: historyError } = await supabase
      .from('claimed_rewards_history')
      .insert(historyRecord);

    if (historyError) {
      console.error('Error recording claim history:', historyError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to record claim history',
        } as LogClaimResponse,
        { status: 500 }
      );
    }

    // 8. Delete the pending claim (it's been used)
    await supabase.from('pending_claims').delete().eq('id', claimId);

    // 9. Update creator_fees to reset claimed amounts (for backwards compatibility)
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (dbcSol > 0) {
      updates.dbc_fees_lamports = 0;
      updates.dbc_fees_sol = 0;
    }

    if (dammSol > 0) {
      updates.damm_fees_lamports = 0;
      updates.damm_fees_sol = 0;
    }

    if (migrationSol > 0) {
      updates.migration_fee_claimable = false;
      updates.migration_fee_sol = 0;
    }

    updates.total_claimable_sol = 0;

    await supabase
      .from('creator_fees')
      .update(updates)
      .eq('token_address', tokenAddress);

    const successMessage = isOcn
      ? `Successfully logged claim of ${totalClaimedUsdc.toFixed(2)} USDC`
      : `Successfully logged claim of ${totalClaimedSol.toFixed(4)} SOL`;

    return NextResponse.json({
      success: true,
      message: successMessage,
    } as LogClaimResponse);
  } catch (error: any) {
    console.error('Error in log-claim:', error);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to log claim: ${error.message || 'Unknown error'}`,
      } as LogClaimResponse,
      { status: 500 }
    );
  }
}
