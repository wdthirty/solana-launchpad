// Dex Paid Status API
// GET: Return cached is_dex_paid status from DB
// POST: Queue token for server-side verification

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { redis, REDIS_KEYS } from '@/lib/redis/client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/tokens/[address]/dex-status
// Returns the cached is_dex_paid status from the database
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return NextResponse.json(
        { error: 'Token address is required' },
        { status: 400 }
      );
    }

    // Fetch is_dex_paid from database
    const { data: token, error } = await supabase
      .from('tokens')
      .select('is_dex_paid')
      .eq('address', address)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Token not found in our DB - return null (unknown)
        return NextResponse.json({ is_dex_paid: null });
      }
      throw error;
    }

    return NextResponse.json({ is_dex_paid: token.is_dex_paid });
  } catch (error) {
    console.error('Error fetching dex status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dex status' },
      { status: 500 }
    );
  }
}

// POST /api/tokens/[address]/dex-status
// Queue token for verification after client reports it as paid
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return NextResponse.json(
        { error: 'Token address is required' },
        { status: 400 }
      );
    }

    // First check if already verified in DB - no need to re-queue
    const { data: token, error } = await supabase
      .from('tokens')
      .select('is_dex_paid')
      .eq('address', address)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // If already verified as paid, skip queueing
    if (token?.is_dex_paid === true) {
      return NextResponse.json({
        queued: false,
        reason: 'already_verified'
      });
    }

    // Add to verification queue (sorted set with timestamp as score)
    // Using ZADD with NX - only adds if not already in set (deduplication)
    const added = await redis.zadd(
      REDIS_KEYS.dexVerifyQueue(),
      { nx: true },
      { score: Date.now(), member: address }
    );

    // Check queue size for monitoring
    const queueSize = await redis.zcard(REDIS_KEYS.dexVerifyQueue());

    if (queueSize > 1000) {
      console.warn('[DexVerify] Queue size warning:', queueSize);
    }

    return NextResponse.json({
      queued: added === 1,
      reason: added === 1 ? 'added_to_queue' : 'already_in_queue',
      queue_size: queueSize
    });
  } catch (error) {
    console.error('Error queueing dex verification:', error);
    return NextResponse.json(
      { error: 'Failed to queue verification' },
      { status: 500 }
    );
  }
}
