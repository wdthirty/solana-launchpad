/**
 * POST /api/project/submit
 *
 * Submits user-signed transactions for project token creation.
 * Backend adds final signatures and submits to network.
 *
 * Can handle:
 * 1. Config transaction only (step 1 of new flow)
 * 2. Pool transaction(s) only (step 2 of new flow, or when reusing existing config)
 *
 * NOTE: This endpoint does NOT create the token record in the database.
 * The stream service will detect the new token on-chain, look up the
 * project_tokens_pending record by mint pubkey, create the complete
 * token record, publish to Ably, and clean up the pending record.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';
import { MintKeypairService } from '@/lib/services/mint-keypair-service';
import bs58 from 'bs58';

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com';

const getPlatformSigner = (): Keypair => {
  const secretKey = process.env.PLATFORM_SIGNER_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PLATFORM_SIGNER_SECRET_KEY not configured');
  }
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(secretKey)));
};

// Request validation schema
const submitSchema = z.object({
  transactions: z.array(z.object({
    name: z.string(),
    serializedTx: z.string(),
  })),
  mintPubkey: z.string().optional(), // Optional for config-only submission
  configPubkey: z.string().optional(),
  step: z.enum(['config', 'pool']).optional(), // Which step we're submitting
});

export async function POST(request: NextRequest) {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');

  try {
    // Verify JWT
    const { user, error: authError } = await requireWalletAuth(request);
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Authentication required' }, { status: 401 });
    }

    // Parse request
    const body = await request.json();
    const validated = submitSchema.parse(body);

    const isConfigStep = validated.step === 'config';
    const isPoolStep = validated.step === 'pool' || !validated.step; // Default to pool for backwards compatibility

    const platformSigner = getPlatformSigner();
    const signatures: string[] = [];

    // For pool step, validate pending project and mint keypair
    let mintEntry: Awaited<ReturnType<typeof MintKeypairService.getCachedKeypair>> | null = null;
    if (isPoolStep && validated.mintPubkey) {
      // Get pending project data
      const { data: pendingProject, error: pendingError } = await supabase
        .from('project_tokens_pending')
        .select('*')
        .eq('mint_pubkey', validated.mintPubkey)
        .single();

      if (pendingError || !pendingProject) {
        return NextResponse.json({
          error: 'EXPIRED',
          message: 'Project creation session expired. Please try again.',
        }, { status: 400 });
      }

      // Get mint keypair
      mintEntry = await MintKeypairService.getCachedKeypair(validated.mintPubkey);
      if (!mintEntry) {
        return NextResponse.json({
          error: 'EXPIRED',
          message: 'Mint keypair expired. Please try again.',
        }, { status: 400 });
      }
    }

    // Get config keypair if this is a new config
    let configKeypair: Keypair | null = null;
    if (validated.configPubkey) {
      const { data: pendingConfig } = await supabase
        .from('project_configs_pending')
        .select('config_secret')
        .eq('config_address', validated.configPubkey)
        .single();

      if (pendingConfig?.config_secret) {
        const secretKey = Buffer.from(pendingConfig.config_secret, 'base64');
        configKeypair = Keypair.fromSecretKey(secretKey);
      }
    }

    // Process and submit each transaction sequentially
    for (const txData of validated.transactions) {
      const transaction = Transaction.from(Buffer.from(txData.serializedTx, 'base64'));

      // Add appropriate signatures based on transaction type
      if (txData.name === 'createConfigTx' && configKeypair) {
        transaction.partialSign(configKeypair);
      } else if (txData.name === 'createPoolTx' && mintEntry) {
        transaction.partialSign(mintEntry.keypair, platformSigner);
      }
      // swapBuyTx only needs user signature (already added by frontend)

      try {
        const signature = await connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          }
        );

        // Wait for confirmation before proceeding to next transaction
        await connection.confirmTransaction(signature, 'confirmed');
        signatures.push(signature);

        console.log(`✅ Transaction ${txData.name} confirmed: ${signature}`);
      } catch (sendError: any) {
        // Check if already processed
        if (sendError.message?.includes('already been processed')) {
          const txSig = transaction.signatures[0]?.signature;
          if (txSig) {
            signatures.push(bs58.encode(txSig));
            continue;
          }
        }

        console.error(`❌ Transaction ${txData.name} failed:`, sendError);
        throw new Error(`Transaction ${txData.name} failed: ${sendError.message}`);
      }
    }

    // For config step: move config from pending to confirmed after successful submission
    if (isConfigStep && validated.configPubkey && configKeypair) {
      const { data: pendingConfig } = await supabase
        .from('project_configs_pending')
        .select('*')
        .eq('config_address', validated.configPubkey)
        .single();

      if (pendingConfig) {
        await supabase.from('project_configs').insert({
          config_address: pendingConfig.config_address,
          config_hash: pendingConfig.config_hash,
          graduation_threshold: pendingConfig.graduation_threshold,
          fee_tier_bps: pendingConfig.fee_tier_bps,
          vesting_config: pendingConfig.vesting_config,
          created_at: new Date().toISOString(),
        });

        // Delete pending config (secret no longer needed)
        await supabase.from('project_configs_pending')
          .delete()
          .eq('config_address', validated.configPubkey);
      }
    }

    // For pool step: mark mint keypair as used
    if (isPoolStep && validated.mintPubkey) {
      await MintKeypairService.markAsUsed(validated.mintPubkey, user.walletAddress);
    }

    // NOTE: We do NOT create the token record here or delete the pending project data.
    // The stream service will:
    // 1. Detect the new token on-chain
    // 2. Look up project_tokens_pending by mint_pubkey
    // 3. Create the complete token record with all project fields
    // 4. Publish to Ably for real-time feed updates
    // 5. Delete the pending record

    return NextResponse.json({
      success: true,
      data: {
        signatures,
        mintAddress: validated.mintPubkey,
        configAddress: validated.configPubkey,
        step: validated.step,
      },
    });
  } catch (error: any) {
    console.error('❌ Project submit error:', error);

    // Release mint keypair on failure (only for pool step)
    const body = await request.clone().json().catch(() => null);
    if (body?.mintPubkey && body?.step !== 'config') {
      await MintKeypairService.releaseKeypair(body.mintPubkey);
    }

    if (error.message?.includes('Blockhash not found') || error.message?.includes('block height exceeded')) {
      return NextResponse.json({
        error: 'BLOCKHASH_EXPIRED',
        message: 'Transaction expired. Please try again.',
      }, { status: 400 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: error.errors,
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'INTERNAL_ERROR',
      message: error.message || 'Failed to submit project token creation',
    }, { status: 500 });
  }
}
