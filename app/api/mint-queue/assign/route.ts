/**
 * POST /api/mint-queue/assign
 *
 * Assigns a specific mint keypair to a wallet address.
 * This reserves the keypair for exclusive use by that wallet.
 *
 * Body:
 * - publicKey: The mint public key to assign
 * - wallet: The wallet address to assign it to
 * - note: Optional note about the assignment (e.g., project name)
 *
 * Security:
 * - Requires admin password via x-admin-password header
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const assignSchema = z.object({
  publicKey: z.string().min(32).max(50),
  wallet: z.string().min(32).max(50),
  note: z.string().max(500).optional(),
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password');
  return password === ADMIN_PASSWORD;
}

export async function POST(request: NextRequest) {
  try {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = assignSchema.parse(body);

    const supabase = getSupabaseClient();

    // Call the assign function
    const { data, error } = await supabase.rpc('assign_mint_keypair', {
      p_public_key: validated.publicKey,
      p_wallet: validated.wallet,
      p_note: validated.note || null,
    });

    if (error) {
      console.error('Error assigning keypair:', error);
      return NextResponse.json(
        { error: 'Failed to assign keypair' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Keypair not found, already used, or already assigned' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Keypair ${validated.publicKey} assigned to ${validated.wallet}`,
    });
  } catch (error: any) {
    console.error('Assign keypair error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mint-queue/assign
 *
 * Removes assignment from a keypair, making it available to anyone.
 *
 * Body:
 * - publicKey: The mint public key to unassign
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { publicKey } = z.object({ publicKey: z.string() }).parse(body);

    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('unassign_mint_keypair', {
      p_public_key: publicKey,
    });

    if (error) {
      console.error('Error unassigning keypair:', error);
      return NextResponse.json(
        { error: 'Failed to unassign keypair' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Keypair not found or already used' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Keypair ${publicKey} unassigned`,
    });
  } catch (error: any) {
    console.error('Unassign keypair error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
