// Cron job to verify dex paid status
// Runs every minute, processes up to 59 tokens from the queue
// Rate limit: 60 calls/minute to DexScreener API

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { redis, REDIS_KEYS } from '@/lib/redis/client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DexScreener API endpoint
const DEXSCREENER_API = 'https://api.dexscreener.com/orders/v1/solana';

// Max tokens to process per run (leaving 1 call buffer for safety)
const BATCH_SIZE = 59;

interface DexScreenerOrder {
  status: string;
  type?: string;
  paymentTimestamp?: number;
}

interface DexScreenerResponse {
  orders?: DexScreenerOrder[];
  boosts?: unknown[];
}

/**
 * Check if a token has paid for DexScreener listing
 */
async function checkDexScreenerPaid(address: string): Promise<boolean> {
  try {
    const response = await fetch(`${DEXSCREENER_API}/${address}`, {
      method: 'GET',
      headers: { 'Accept': '*/*' },
    });

    if (!response.ok) {
      return false;
    }

    const data: DexScreenerResponse | DexScreenerOrder[] = await response.json();

    // API returns { orders: [...], boosts: [...] } or just [...] for backwards compat
    const orders = Array.isArray(data) ? data : (data?.orders || []);

    // Check if any order has status "approved"
    return Array.isArray(orders) && orders.some(order => order.status === 'approved');
  } catch (error) {
    console.error(`[DexVerify] Error checking ${address}:`, error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    processed: 0,
    verified_paid: 0,
    verified_not_paid: 0,
    errors: 0,
    queue_remaining: 0,
  };

  try {
    // Pop up to BATCH_SIZE tokens from the queue (oldest first)
    // zpopmin returns array of [member, score, member, score, ...]
    const queueItems = await redis.zpopmin(REDIS_KEYS.dexVerifyQueue(), BATCH_SIZE);

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Queue empty, nothing to verify',
        duration: Date.now() - startTime,
      });
    }

    // Parse the queue items - zpopmin returns alternating member/score pairs
    const tokensToVerify: string[] = [];
    for (let i = 0; i < queueItems.length; i += 2) {
      const token = queueItems[i];
      if (typeof token === 'string') {
        tokensToVerify.push(token);
      }
    }

    // Process each token with a small delay between calls to be safe
    for (const address of tokensToVerify) {
      results.processed++;

      try {
        const isPaid = await checkDexScreenerPaid(address);

        if (isPaid) {
          // Update database - mark as permanently paid
          const { error } = await supabase
            .from('tokens')
            .update({ is_dex_paid: true })
            .eq('address', address);

          if (error) {
            console.error(`[DexVerify] DB update error for ${address}:`, error);
            results.errors++;
          } else {
            results.verified_paid++;
          }
        } else {
          // Not paid - we don't update the DB, just leave is_dex_paid as null
          // This allows the client to re-check later if the user pays
          results.verified_not_paid++;
        }

        // Small delay between API calls (10ms) to avoid hammering
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        console.error(`[DexVerify] Error processing ${address}:`, error);
        results.errors++;
      }
    }

    // Check remaining queue size
    results.queue_remaining = await redis.zcard(REDIS_KEYS.dexVerifyQueue());

    return NextResponse.json({
      success: true,
      ...results,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    console.error('[DexVerify] Cron job failed:', error);
    return NextResponse.json(
      { error: 'Dex verification cron failed', details: String(error) },
      { status: 500 }
    );
  }
}
