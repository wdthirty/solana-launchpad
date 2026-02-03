/**
 * POST /api/token/release
 *
 * Releases a reserved mint keypair back to the pool.
 * Called when user rejects/cancels the transaction.
 *
 * Security:
 * - Requires JWT authentication (JWKS verified)
 * - Only authenticated users can release keypairs
 * - Note: We don't track who reserved the keypair, but requiring auth
 *   prevents random attackers from releasing keypairs they don't know about
 *
 * Flow:
 * 1. Verify JWT authentication
 * 2. User prepares token creation (keypair allocated)
 * 3. User views transaction in wallet
 * 4. User rejects/cancels
 * 5. Frontend calls this endpoint to release the keypair
 * 6. Keypair becomes available for other users
 */

import { NextRequest, NextResponse } from 'next/server';
import { MintKeypairService } from '@/lib/services/mint-keypair-service';
import { z } from 'zod';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';

// Validation schema
const releaseSchema = z.object({
  mintPubkey: z.string().min(32).max(64), // Base58 encoded public key
});

export async function POST(request: NextRequest) {
  try {
    // Verify JWT authentication
    const { user, error: authError } = await requireWalletAuth(request);

    if (authError || !user) {
      return NextResponse.json(
        { error: authError || 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validated = releaseSchema.parse(body);

    // Release the keypair back to the pool
    await MintKeypairService.releaseKeypair(validated.mintPubkey);

    return NextResponse.json({
      success: true,
      message: 'Keypair released successfully',
    });
  } catch (error: any) {
    console.error('❌ Token release error:', error);

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

    // Generic error (don't fail hard - this is a cleanup operation)
    return NextResponse.json(
      {
        success: false,
        error: 'RELEASE_FAILED',
        message: 'Failed to release keypair (non-critical)',
      },
      { status: 200 } // Return 200 even on error - this is a best-effort cleanup
    );
  }
}
