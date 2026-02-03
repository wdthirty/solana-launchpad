/**
 * POST /api/project/prepare
 *
 * Step 1 of project token creation: Prepares the config transaction.
 *
 * Flow:
 * 1. Check if config with same parameters exists (skip to prepare-pool if so)
 * 2. If new config needed: return createConfigTx for signing
 * 3. Frontend signs + submits config tx, waits for confirmation
 * 4. Frontend calls /api/project/prepare-pool to get pool tx
 *
 * This two-step approach ensures the config is confirmed on-chain
 * before the pool transaction is built (SDK requires this).
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Keypair, Connection, Transaction } from '@solana/web3.js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';
import { MintKeypairService } from '@/lib/services/mint-keypair-service';
import { MetadataUploadService } from '@/lib/services/metadata-upload-service';
import { projectConfigService, VestingConfig } from '@/lib/services/project-config-service';

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com';

// Copycat deterrence window in minutes
const COPYCAT_LOCK_MINUTES = 10;

// Allowed image URL domains
const ALLOWED_IMAGE_DOMAINS = [
  'cdn.launchpad.fun',
  'YOUR_SUPABASE_PROJECT_ID.supabase.co',
];

// Vesting config schema
const vestingSchema = z.object({
  enabled: z.boolean(),
  vestingPercentage: z.number().min(1).max(100),
  vestingDuration: z.number().min(1),
  vestingDurationUnit: z.enum(['days', 'weeks', 'months']),
  unlockSchedule: z.enum(['daily', 'weekly', 'bi-weekly', 'monthly']),
  cliffEnabled: z.boolean(),
  cliffDuration: z.number().min(0),
  cliffDurationUnit: z.enum(['days', 'weeks', 'months']),
  cliffPercentage: z.number().min(0).max(100),
});

// Roadmap milestone schema
const milestoneSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  targetDate: z.string(),
  status: z.enum(['planned', 'in_progress', 'completed']),
  description: z.string(),
});

// Request validation schema
const prepareSchema = z.object({
  // Token basics
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url().refine((url) => {
    try {
      const parsed = new URL(url);
      return ALLOWED_IMAGE_DOMAINS.includes(parsed.hostname);
    } catch {
      return false;
    }
  }, { message: 'Image must be uploaded through the platform' }),

  // Socials (required for projects)
  website: z.string().url(),
  twitter: z.string().min(1),
  telegram: z.string().optional(),

  // Project details
  category: z.string().min(1),
  industry: z.string().min(1),
  stage: z.string().min(1),

  // Roadmap & Vesting
  roadmap: z.array(milestoneSchema).optional(),
  vesting: vestingSchema.optional(),

  // Launch settings
  graduationThreshold: z.number().min(10), // Minimum 10 SOL
  feeTierBps: z.number().default(100), // Default 1%
  initialBuy: z.number().min(0).optional(),
  graceMode: z.boolean().optional(), // Grace period anti-sniper feature
});

export async function POST(request: NextRequest) {
  try {
    // Verify JWT
    const { user, error: authError } = await requireWalletAuth(request);
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Authentication required' }, { status: 401 });
    }

    const creatorPubkey = new PublicKey(user.walletAddress);

    // Check if wallet is whitelisted
    const { data: whitelistData, error: whitelistError } = await supabase
      .from('whitelisted_wallets')
      .select('id')
      .eq('wallet_address', user.walletAddress)
      .eq('is_active', true)
      .single();

    if (whitelistError && whitelistError.code !== 'PGRST116') {
      console.error('Error checking whitelist:', whitelistError);
      return NextResponse.json({ error: 'Failed to verify access' }, { status: 500 });
    }

    if (!whitelistData) {
      return NextResponse.json({
        error: 'NOT_WHITELISTED',
        message: 'Your wallet is not whitelisted for token creation. Apply for access at launchpad.fun',
      }, { status: 403 });
    }

    // Parse and validate request
    const body = await request.json();
    const validated = prepareSchema.parse(body);

    const trimmedName = validated.name.trim();
    const trimmedSymbol = validated.symbol.trim();

    // Check for duplicate token with time-based lock
    // Lock rules:
    // 1. If graduated (is_migrated = true): always locked
    // 2. If not graduated: locked for 10 minutes after creation, then released
    const { data: existingToken } = await supabase
      .from('tokens')
      .select('id, is_migrated, created_at')
      .eq('is_active', true)
      .ilike('name', trimmedName)
      .ilike('symbol', trimmedSymbol)
      .limit(1);

    if (existingToken && existingToken.length > 0) {
      const token = existingToken[0];
      let isLocked = false;

      if (token.is_migrated) {
        // Graduated tokens are permanently locked
        isLocked = true;
      } else {
        // Non-graduated tokens: check if within 10-minute window
        const createdAt = new Date(token.created_at);
        const now = new Date();
        const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);

        if (minutesSinceCreation < COPYCAT_LOCK_MINUTES) {
          isLocked = true;
        }
      }

      if (isLocked) {
        return NextResponse.json({
          error: 'DUPLICATE_TOKEN',
          message: token.is_migrated
            ? `A graduated token with name "${trimmedName}" and symbol "${trimmedSymbol}" exists`
            : `A token with name "${trimmedName}" and symbol "${trimmedSymbol}" was recently created`,
        }, { status: 409 });
      }
    }

    // Get mint keypair (check for assigned keypairs first)
    const mintEntry = await MintKeypairService.getNextKeypair(user.walletAddress);
    const mintPubkey = mintEntry.publicKey;

    // Upload metadata with project-specific fields
    const metadataUri = await MetadataUploadService.createAndUploadMetadata({
      name: trimmedName,
      symbol: trimmedSymbol,
      description: validated.description || '',
      imageUrl: validated.imageUrl,
      creator: creatorPubkey.toBase58(),
      website: validated.website,
      twitter: validated.twitter,
      telegram: validated.telegram || '',
      createdOn: 'https://www.launchpad.fun',
      // Project-specific metadata fields
      tokenType: 'project',
      category: validated.category,
      industry: validated.industry,
      stage: validated.stage,
    });

    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const { blockhash } = await connection.getLatestBlockhash('finalized');

    // Check for existing config with same parameters
    const configHash = generateConfigHash(
      validated.graduationThreshold,
      validated.feeTierBps,
      validated.graceMode || false,
      validated.vesting
    );

    const { data: existingConfig } = await supabase
      .from('project_configs')
      .select('config_address')
      .eq('config_hash', configHash)
      .limit(1);

    // Store pending project data for later use
    const { error: upsertError } = await supabase.from('project_tokens_pending').upsert({
      mint_pubkey: mintPubkey,
      roadmap: validated.roadmap || [],
      vesting_config: validated.vesting || null,
      graduation_threshold: validated.graduationThreshold,
      grace_mode: validated.graceMode || false,
      fee_tier_bps: validated.feeTierBps,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'mint_pubkey' });

    if (upsertError) {
      console.error('prepare: Failed to save pending project', upsertError);
      throw new Error('Failed to save pending project data');
    }

    if (existingConfig && existingConfig.length > 0) {
      // Config already exists on-chain - skip config step, go directly to pool
      // Return response indicating frontend should call prepare-pool directly
      return NextResponse.json({
        success: true,
        data: {
          step: 'pool', // Indicates config exists, go to pool step
          configPubkey: existingConfig[0].config_address,
          mintPubkey,
          metadataUri,
          name: trimmedName,
          symbol: trimmedSymbol,
          initialBuy: validated.initialBuy || 0,
        },
      });
    }

    // Need to create new config first
    const vestingConfig: VestingConfig | undefined = validated.vesting?.enabled
      ? validated.vesting as VestingConfig
      : undefined;

    const result = await projectConfigService.createConfigTransaction({
      payer: creatorPubkey,
      poolCreator: creatorPubkey,
      mintKeypair: mintEntry.keypair,
      name: trimmedName,
      symbol: trimmedSymbol,
      uri: metadataUri,
      graduationThreshold: validated.graduationThreshold,
      feeTierBps: validated.feeTierBps,
      vesting: vestingConfig,
      initialBuy: validated.initialBuy,
      graceMode: validated.graceMode,
    });

    const configPubkey = result.configKeypair.publicKey.toBase58();
    const configKeypairSecret = Buffer.from(result.configKeypair.secretKey).toString('base64');

    // Prepare config transaction for signing
    const configTx = result.configTx;
    configTx.recentBlockhash = blockhash;
    configTx.feePayer = creatorPubkey;
    configTx.setSigners(creatorPubkey, result.configKeypair.publicKey);

    // Store config for later
    await supabase.from('project_configs_pending').upsert({
      config_address: configPubkey,
      config_hash: configHash,
      config_secret: configKeypairSecret,
      graduation_threshold: validated.graduationThreshold,
      fee_tier_bps: validated.feeTierBps,
      vesting_config: validated.vesting || null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        step: 'config', // Indicates config needs to be created first
        configTx: configTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        configPubkey,
        mintPubkey,
        metadataUri,
        name: trimmedName,
        symbol: trimmedSymbol,
        initialBuy: validated.initialBuy || 0,
        expiresAt: Date.now() + 60000, // 1 minute expiry for blockhash
      },
    });
  } catch (error: any) {
    console.error('❌ Project prepare error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: error.errors,
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'INTERNAL_ERROR',
      message: error.message || 'Failed to prepare project token creation',
    }, { status: 500 });
  }
}

/**
 * Generate a hash for config parameters to enable reuse
 */
function generateConfigHash(
  graduationThreshold: number,
  feeTierBps: number,
  graceMode: boolean,
  vesting?: z.infer<typeof vestingSchema>
): string {
  const params = {
    graduationThreshold,
    feeTierBps,
    graceMode,
    vesting: vesting?.enabled ? {
      vestingPercentage: vesting.vestingPercentage,
      vestingDuration: vesting.vestingDuration,
      vestingDurationUnit: vesting.vestingDurationUnit,
      unlockSchedule: vesting.unlockSchedule,
      cliffEnabled: vesting.cliffEnabled,
      cliffDuration: vesting.cliffDuration,
      cliffDurationUnit: vesting.cliffDurationUnit,
      cliffPercentage: vesting.cliffPercentage,
    } : null,
  };

  // Simple hash using JSON string
  const str = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
