/**
 * POST /api/token/submit
 *
 * Receives user-signed transaction, adds backend signature, and submits to network.
 *
 * Security:
 * - Requires JWT authentication (JWKS verified)
 * - User wallet is extracted from verified JWT, not request body
 * - Rate limited per verified wallet address
 *
 * Flow:
 * 1. Verify JWT and extract wallet address
 * 2. Receives serialized transaction signed by user
 * 3. Retrieves cached mint keypair
 * 4. Adds mint signature
 * 5. Submits to Solana network
 * 6. Marks keypair as used on success
 */

import { NextRequest, NextResponse } from 'next/server';
import { TokenCreationService } from '@/lib/services/token-creation-service';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { generateLayoutFromPageStyle } from '@/lib/utils/page-style';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';

/**
 * Get Supabase client with service role for backend operations
 */
function getServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase service role credentials');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Save token layout to database
 */
async function saveTokenLayout(
  tokenAddress: string,
  pageStyle?: string,
  selectedPageId?: string
): Promise<void> {
  const supabase = getServiceRoleClient();
  let layout: any = null;

  if (selectedPageId) {
    // Fetch the selected page layout
    const { data: pageData, error: pageError } = await supabase
      .from('pages')
      .select('layout')
      .eq('id', selectedPageId)
      .single();

    if (!pageError && pageData?.layout) {
      layout = pageData.layout;
    }
  } else if (pageStyle) {
    // Generate layout from page style
    layout = generateLayoutFromPageStyle(pageStyle);
  }

  if (!layout) {
    return; // No layout to save
  }

  // Save layout to token_layouts table
  const { error } = await supabase
    .from('token_layouts')
    .upsert({
      token_address: tokenAddress,
      layout,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'token_address',
    });

  if (error) {
    throw new Error(`Failed to save layout: ${error.message}`);
  }
}

// Rate limiting for submissions
const submitRateLimit = new Map<string, { count: number; resetAt: number }>();
// More permissive for devnet testing
const SUBMIT_RATE_LIMIT_PER_WALLET = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet' ? 1000 : 10; // 1000/day on devnet, 10/day on mainnet
const SUBMIT_RATE_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

function checkSubmitRateLimit(wallet: string): boolean {
  const now = Date.now();
  const record = submitRateLimit.get(wallet);

  if (!record || now > record.resetAt) {
    submitRateLimit.set(wallet, { count: 1, resetAt: now + SUBMIT_RATE_WINDOW });
    return true;
  }

  if (record.count >= SUBMIT_RATE_LIMIT_PER_WALLET) {
    return false;
  }

  record.count++;
  return true;
}

// Validation schema
// Note: 'userWallet' field is now ignored - we use the verified wallet from JWT
const submitSchema = z.object({
  signedTx: z.string(), // Base64 encoded signed transaction
  mintPubkey: z.string(), // Mint public key from prepare step
  userWallet: z.string().optional(), // Deprecated: ignored, using JWT wallet instead
  pageStyle: z.string().optional(), // Page style ID
  selectedPageId: z.string().optional(), // Selected user page ID
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

    // Use verified wallet address from JWT
    const userWallet = user.walletAddress;

    // Parse and validate request body
    const body = await request.json();
    const validated = submitSchema.parse(body);

    // Check wallet rate limit (using verified wallet)
    if (!checkSubmitRateLimit(userWallet)) {
      return NextResponse.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'You have reached the daily token creation limit (10 tokens/day). Please try again tomorrow.',
        },
        { status: 429 }
      );
    }

    // Create token creation service
    const service = new TokenCreationService();

    // Submit transaction (using verified wallet)
    const result = await service.submitTokenCreation(
      validated.signedTx,
      validated.mintPubkey,
      userWallet
    );

    // Update token record with page_id if provided
    // Note: Token might not be in DB yet (saved by stream service), so we retry
    if (validated.selectedPageId) {
      const supabase = getServiceRoleClient();
      
      // First, verify that the page exists
      const { data: pageExists, error: pageCheckError } = await supabase
        .from('pages')
        .select('id')
        .eq('id', validated.selectedPageId)
        .single();

      if (pageCheckError || !pageExists) {
        console.error('⚠️ Selected page does not exist:', validated.selectedPageId, pageCheckError);
        // Don't fail the token creation, just log the warning
        console.warn('⚠️ Skipping page_id update - page not found. Token created successfully.');
      } else {
        let retries = 3;
        let updated = false;

        while (retries > 0 && !updated) {
          try {
            const { error: updateError, data } = await supabase
              .from('tokens')
              .update({ page_id: validated.selectedPageId })
              .eq('address', result.mintAddress)
              .select();

            if (updateError) {
              // If token doesn't exist yet, wait and retry
              if (updateError.code === 'PGRST116' || updateError.message?.includes('No rows')) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                retries--;
              } else {
                // Log the full error for debugging
                console.error('⚠️ Failed to update token with page_id:', {
                  error: updateError,
                  code: updateError.code,
                  message: updateError.message,
                  details: updateError.details,
                  hint: updateError.hint,
                  pageId: validated.selectedPageId,
                  tokenAddress: result.mintAddress,
                });
                break;
              }
            } else if (data && data.length > 0) {
              updated = true;
            }
          } catch (updateError: any) {
            console.error('⚠️ Error updating token with page_id:', {
              error: updateError,
              message: updateError?.message,
              stack: updateError?.stack,
            });
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (!updated && retries === 0) {
          console.warn(`⚠️ Could not update token with page_id after retries. Token may not be in DB yet.`);
        }
      }
    }

    // Save page style/layout if provided
    if (validated.pageStyle || validated.selectedPageId) {
      try {
        await saveTokenLayout(result.mintAddress, validated.pageStyle, validated.selectedPageId);
      } catch (layoutError) {
        // Log but don't fail the request - layout can be saved later
        console.error('⚠️ Failed to save page layout (non-critical):', layoutError);
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('❌ Token submit error:', error);

    // Handle blockhash expiration
    if (error.message === 'BLOCKHASH_EXPIRED') {
      return NextResponse.json(
        {
          error: 'BLOCKHASH_EXPIRED',
          message: 'Transaction expired. Please try creating the token again.',
          retryable: true,
        },
        { status: 410 } // 410 Gone
      );
    }

    // Handle mint keypair not found (expired from cache)
    if (error.message?.includes('Mint keypair not found or expired')) {
      return NextResponse.json(
        {
          error: 'KEYPAIR_EXPIRED',
          message: 'Transaction preparation expired. Please start over.',
          retryable: true,
        },
        { status: 410 }
      );
    }

    // Handle validation errors
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

    // Handle RPC/network errors
    if (error.message?.includes('insufficient funds')) {
      return NextResponse.json(
        {
          error: 'INSUFFICIENT_FUNDS',
          message: 'Insufficient SOL balance to create token. Please add funds to your wallet.',
        },
        { status: 402 }
      );
    }

    if (error.message?.includes('Transaction simulation failed')) {
      return NextResponse.json(
        {
          error: 'SIMULATION_FAILED',
          message: 'Transaction validation failed. Please check your wallet balance and try again.',
        },
        { status: 400 }
      );
    }

    // Generic error
    return NextResponse.json(
      {
        error: 'SUBMISSION_FAILED',
        message: 'Failed to submit token creation transaction',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
