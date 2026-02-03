/**
 * GET /api/mint-queue
 *
 * Returns the list of upcoming mint addresses in queue order.
 * This allows teams to know their CA before launching.
 *
 * Query params:
 * - limit: Number of results (default: 20, max: 100)
 * - offset: Pagination offset (default: 0)
 * - wallet: Filter to show only keypairs assigned to this wallet
 *
 * Security:
 * - Requires admin password via x-admin-password header
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password');
  return password === ADMIN_PASSWORD;
}

export async function GET(request: NextRequest) {
  try {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const wallet = searchParams.get('wallet');

    const supabase = getSupabaseClient();

    // Build query - use the mint_queue view which only exposes public keys
    let query = supabase
      .from('mint_queue')
      .select('queue_position, public_key, assigned_to, assigned_at, assignment_note, is_reserved, created_at')
      .order('queue_position', { ascending: true })
      .range(offset, offset + limit - 1);

    // Filter by wallet if provided
    if (wallet) {
      query = query.eq('assigned_to', wallet);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching mint queue:', error);
      return NextResponse.json(
        { error: 'Failed to fetch mint queue' },
        { status: 500 }
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('mint_keypairs')
      .select('*', { count: 'exact', head: true })
      .eq('used', false);

    if (wallet) {
      countQuery = countQuery.eq('assigned_to', wallet);
    }

    const { count } = await countQuery;

    return NextResponse.json({
      success: true,
      data: {
        queue: data || [],
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: (count || 0) > offset + limit,
        },
      },
    });
  } catch (error: any) {
    console.error('Mint queue error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
