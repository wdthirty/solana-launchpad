/**
 * GET /api/mint-queue/my-assignments
 *
 * Returns keypairs assigned to the authenticated user's wallet.
 * This allows teams to see their reserved CAs before launching.
 *
 * Security:
 * - Requires JWT authentication
 * - Only returns keypairs assigned to the authenticated wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';

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

export async function GET(request: NextRequest) {
  try {
    // Verify JWT and extract wallet address
    const { user, error: authError } = await requireWalletAuth(request);

    if (authError || !user) {
      return NextResponse.json(
        { error: authError || 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = getSupabaseClient();

    // Get keypairs assigned to this wallet
    const { data, error } = await supabase
      .from('mint_queue')
      .select('queue_position, public_key, assigned_at, assignment_note, is_reserved, created_at')
      .eq('assigned_to', user.walletAddress)
      .order('queue_position', { ascending: true });

    if (error) {
      console.error('Error fetching assignments:', error);
      return NextResponse.json(
        { error: 'Failed to fetch assignments' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        wallet: user.walletAddress,
        assignments: data || [],
        count: data?.length || 0,
      },
    });
  } catch (error: any) {
    console.error('My assignments error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
