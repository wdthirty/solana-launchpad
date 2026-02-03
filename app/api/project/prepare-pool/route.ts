/**
 * POST /api/project/prepare-pool
 *
 * Step 2 of project token creation: Prepares the pool transaction.
 * Called AFTER the config transaction is confirmed on-chain.
 *
 * This endpoint builds the createPool (+ optional swap) transaction
 * using the now-confirmed config address.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Keypair, Connection, Transaction, TransactionInstruction } from '@solana/web3.js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';
import { MintKeypairService } from '@/lib/services/mint-keypair-service';
import { projectConfigService } from '@/lib/services/project-config-service';

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com';
const PLATFORM_SIGNER_ADDRESS = process.env.PLATFORM_SIGNER_ADDRESS!;

const getPlatformSigner = (): Keypair => {
  const secretKey = process.env.PLATFORM_SIGNER_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PLATFORM_SIGNER_SECRET_KEY not configured');
  }
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(secretKey)));
};

// Request validation schema
const preparePoolSchema = z.object({
  configPubkey: z.string(),
  mintPubkey: z.string(),
  metadataUri: z.string(),
  name: z.string(),
  symbol: z.string(),
  initialBuy: z.number().min(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Verify JWT
    const { user, error: authError } = await requireWalletAuth(request);
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Authentication required' }, { status: 401 });
    }

    const creatorPubkey = new PublicKey(user.walletAddress);

    // Parse and validate request
    const body = await request.json();
    const validated = preparePoolSchema.parse(body);

    // Verify pending project exists
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
    const mintEntry = await MintKeypairService.getCachedKeypair(validated.mintPubkey);
    if (!mintEntry) {
      return NextResponse.json({
        error: 'EXPIRED',
        message: 'Mint keypair expired. Please try again.',
      }, { status: 400 });
    }

    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    const platformSigner = getPlatformSigner();

    // Build pool transaction (config should now be confirmed on-chain)
    console.log('prepare-pool: Building pool transaction', {
      configPubkey: validated.configPubkey,
      initialBuy: validated.initialBuy,
      hasInitialBuy: validated.initialBuy && validated.initialBuy > 0,
    });

    const poolResult = await projectConfigService.createPoolTransaction({
      configPubkey: new PublicKey(validated.configPubkey),
      payer: creatorPubkey,
      poolCreator: creatorPubkey,
      mintKeypair: mintEntry.keypair,
      name: validated.name,
      symbol: validated.symbol,
      uri: validated.metadataUri,
      initialBuy: validated.initialBuy,
    });

    console.log('prepare-pool: Pool result', {
      hasPoolTx: !!poolResult.poolTx,
    });

    const transactions: { name: string; serializedTx: string }[] = [];

    // Prepare pool transaction (includes initial buy if specified - combined into single tx)
    const poolTx = poolResult.poolTx;
    poolTx.recentBlockhash = blockhash;
    poolTx.feePayer = creatorPubkey;
    addPlatformMemo(poolTx, platformSigner.publicKey);
    poolTx.setSigners(creatorPubkey, mintEntry.keypair.publicKey, platformSigner.publicKey);

    transactions.push({
      name: 'createPoolTx',
      serializedTx: poolTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    });

    return NextResponse.json({
      success: true,
      data: {
        transactions,
        mintPubkey: validated.mintPubkey,
        configPubkey: validated.configPubkey,
        expiresAt: Date.now() + 60000, // 1 minute expiry for blockhash
      },
    });
  } catch (error: any) {
    console.error('❌ Project prepare-pool error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: error.errors,
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'INTERNAL_ERROR',
      message: error.message || 'Failed to prepare pool transaction',
    }, { status: 500 });
  }
}

/**
 * Add platform memo instruction for token detection
 */
function addPlatformMemo(tx: Transaction, platformSignerPubkey: PublicKey): void {
  const memoInstruction = new TransactionInstruction({
    keys: [{ pubkey: platformSignerPubkey, isSigner: true, isWritable: false }],
    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    data: Buffer.from(`Platform: ${PLATFORM_SIGNER_ADDRESS}`, 'utf-8'),
  });
  tx.instructions.unshift(memoInstruction);
}
