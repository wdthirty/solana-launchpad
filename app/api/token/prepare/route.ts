/**
 * POST /api/token/prepare
 *
 * Prepares an unsigned token creation transaction for user to sign.
 * Returns serialized transaction + mint public key.
 *
 * Security:
 * - Requires JWT authentication (JWKS verified)
 * - Creator wallet is extracted from verified JWT, not request body
 * - Rate limited per wallet address
 *
 * Flow:
 * 1. Verify JWT and extract wallet address
 * 2. Allocates mint keypair from pool
 * 3. Builds token creation transaction with fresh blockhash
 * 4. Partially signs with mint keypair
 * 5. Returns serialized tx for user to sign
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { TokenCreationService } from '@/lib/services/token-creation-service';
import { getDBCConfigPubkey, FeeTier, FEE_TIERS } from '@/lib/config/dbc-configs';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';

// Rate limiting (simple in-memory implementation)
const prepareRateLimit = new Map<string, { count: number; resetAt: number }>();
// Rate limit per wallet per hour
const PREPARE_RATE_LIMIT = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet' ? 100 : 50; // 100/hour on devnet, 50/hour on mainnet
const PREPARE_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

// Copycat deterrence window in minutes
const COPYCAT_LOCK_MINUTES = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = prepareRateLimit.get(ip);

  if (!record || now > record.resetAt) {
    prepareRateLimit.set(ip, { count: 1, resetAt: now + PREPARE_RATE_WINDOW });
    return true;
  }

  if (record.count >= PREPARE_RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

// Allowed image URL domains for token logos
const ALLOWED_IMAGE_DOMAINS = [
  'cdn.launchpad.fun',
  'YOUR_SUPABASE_PROJECT_ID.supabase.co', // Supabase storage fallback
];

// Validation schema
// Note: 'creator' field is now ignored - we use the verified wallet from JWT
const prepareSchema = z.object({
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
  }, { message: 'Image must be uploaded through the platform. External URLs are not allowed.' }),
  creator: z.string().optional(), // Deprecated: ignored, using JWT wallet instead
  customSuffix: z.string().optional(),
  config: z.string().optional(), // DBC config address (legacy, will be overridden by feeTier + graceMode)
  initialBuy: z.number().min(0).optional(),
  pageStyle: z.string().optional(),
  selectedPageId: z.string().optional(),
  feeTier: z.number().optional(), // Fee tier in basis points (25, 100, 200, 300, 400, 500)
  graceMode: z.boolean().optional(),
  website: z.string().optional(),
  twitter: z.string().optional(),
  telegram: z.string().optional(),
  createdOn: z.string().optional(),
});


export async function POST(request: NextRequest) {
  try {
    // Verify JWT and extract wallet address
    const { user, error: authError } = await requireWalletAuth(request);

    if (authError || !user) {
      return NextResponse.json(
        { error: authError || 'Authentication required' },
        { status: 401 }
      );
    }

    // Use verified wallet address from JWT (not from request body)
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
      return NextResponse.json(
        { error: 'Failed to verify access' },
        { status: 500 }
      );
    }

    if (!whitelistData) {
      return NextResponse.json(
        {
          error: 'NOT_WHITELISTED',
          message: 'Your wallet is not whitelisted for token creation. Apply for access at launchpad.fun',
        },
        { status: 403 }
      );
    }

    // Rate limit by wallet address (more secure than IP)
    if (!checkRateLimit(user.walletAddress)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in 1 hour.' },
        { status: 429 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validated = prepareSchema.parse(body);

    // Check for duplicate name/symbol combination
    const trimmedName = validated.name.trim();
    const trimmedSymbol = validated.symbol.trim();
    const trimmedSymbolUpper = trimmedSymbol.toUpperCase();

    // Check for reserved names/symbols (case-insensitive exact match)
    const RESERVED_NAMES: string[] = [];
    const RESERVED_SYMBOLS: string[] = [];
    // Names/symbols that should appear as "already taken" (our platform tokens)
    const TAKEN_NAMES: string[] = [];
    const TAKEN_SYMBOLS: string[] = [];

    if (RESERVED_NAMES.includes(trimmedName.toLowerCase())) {
      return NextResponse.json(
        {
          error: 'RESERVED_NAME',
          message: 'This is a reserved name and cannot be used',
        },
        { status: 400 }
      );
    }
    if (TAKEN_NAMES.includes(trimmedName.toLowerCase())) {
      return NextResponse.json(
        {
          error: 'DUPLICATE_TOKEN',
          message: `Token name "${trimmedName}" is already taken`,
        },
        { status: 409 }
      );
    }
    if (RESERVED_SYMBOLS.includes(trimmedSymbolUpper.toLowerCase())) {
      return NextResponse.json(
        {
          error: 'RESERVED_SYMBOL',
          message: 'This is a reserved symbol and cannot be used',
        },
        { status: 400 }
      );
    }
    if (TAKEN_SYMBOLS.includes(trimmedSymbolUpper.toLowerCase())) {
      return NextResponse.json(
        {
          error: 'DUPLICATE_TOKEN',
          message: `Symbol "${trimmedSymbol}" is already taken`,
        },
        { status: 409 }
      );
    }

    const { data: existingToken, error: checkError } = await supabase
      .from('tokens')
      .select('id, name, symbol, is_migrated, created_at')
      .eq('is_active', true)
      .ilike('name', trimmedName)
      .ilike('symbol', trimmedSymbolUpper)
      .limit(1);

    if (checkError) {
      console.error('Error checking for duplicate token:', checkError);
      return NextResponse.json(
        { error: 'Failed to validate token name/symbol' },
        { status: 500 }
      );
    }

    // Check if token exists and should be locked
    // Lock rules:
    // 1. If graduated (is_migrated = true): always locked
    // 2. If not graduated: locked for 10 minutes after creation, then released
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
        return NextResponse.json(
          {
            error: 'DUPLICATE_TOKEN',
            message: token.is_migrated
              ? `A graduated token with name "${trimmedName}" and symbol "${trimmedSymbol}" exists`
              : `A token with name "${trimmedName}" and symbol "${trimmedSymbol}" was recently created`,
          },
          { status: 409 }
        );
      }
    }

    // Determine DBC config based on feeTier and graceMode
    let configPubkey: PublicKey | undefined;

    if (validated.feeTier !== undefined && validated.graceMode !== undefined) {
      // New method: Use feeTier and graceMode to select config
      const feeTier = validated.feeTier as FeeTier;

      // Validate fee tier
      if (!FEE_TIERS.includes(feeTier)) {
        return NextResponse.json(
          { error: `Invalid fee tier: ${feeTier}. Must be one of: ${FEE_TIERS.join(', ')}` },
          { status: 400 }
        );
      }

      try {
        configPubkey = getDBCConfigPubkey(feeTier, validated.graceMode);
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message || 'Failed to get DBC config' },
          { status: 400 }
        );
      }
    } else if (validated.config) {
      // Legacy method: Direct config address
      try {
        configPubkey = new PublicKey(validated.config);
      } catch {
        return NextResponse.json(
          { error: 'Invalid config address' },
          { status: 400 }
        );
      }
    }
    // If neither method provided, service will use default config

    // Create token creation service
    const service = new TokenCreationService();

    // Prepare transaction (symbol preserves original casing)
    const result = await service.prepareTokenCreation({
      name: validated.name,
      symbol: trimmedSymbol,
      description: validated.description || '',
      imageUrl: validated.imageUrl,
      creator: creatorPubkey,
      customSuffix: validated.customSuffix,
      config: configPubkey,
      initialBuy: validated.initialBuy,
      website: validated.website || '',
      twitter: validated.twitter || '',
      telegram: validated.telegram || '',
      createdOn: validated.createdOn || '',
    });

    // Note: pageStyle and selectedPageId will be passed in the submit request

    // Grace period settings will be automatically detected from the transaction
    // by the stream service when the token is created on-chain

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('❌ Token prepare error:', error);

    // Handle specific errors
    if (error.message?.includes('No available mint keypairs')) {
      return NextResponse.json(
        {
          error: 'SERVICE_UNAVAILABLE',
          message: 'Token creation temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Failed to prepare token creation',
      },
      { status: 500 }
    );
  }
}
