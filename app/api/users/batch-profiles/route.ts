import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/users/batch-profiles
 *
 * Batch fetch minimal creator profiles by wallet addresses.
 * Used for hydrating creator data on tokens received via Ably real-time events.
 *
 * Request body: { wallets: string[] }
 * Response: { profiles: { [wallet: string]: { id, username, avatar, points } | null } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const wallets: string[] = body.wallets;

    if (!Array.isArray(wallets) || wallets.length === 0) {
      return NextResponse.json({ profiles: {} });
    }

    // Limit to 50 wallets per request to prevent abuse
    const limitedWallets = wallets.slice(0, 50);

    const { data, error } = await supabase
      .from('users')
      .select('id, username, avatar, points, wallet_address, verified')
      .in('wallet_address', limitedWallets);

    if (error) {
      console.error('Error fetching batch profiles:', error);
      return NextResponse.json({ profiles: {} });
    }

    // Convert to a map keyed by wallet address
    const profiles: Record<string, { id: string; username: string; avatar: string | null; points: number; verified?: boolean } | null> = {};

    for (const wallet of limitedWallets) {
      const user = data?.find(u => u.wallet_address === wallet);
      profiles[wallet] = user ? {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        points: user.points,
        verified: user.verified,
      } : null;
    }

    // Cache for 30 seconds
    const headers = new Headers();
    headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');

    return NextResponse.json({ profiles }, { headers });
  } catch (error) {
    console.error('Error in batch-profiles:', error);
    return NextResponse.json({ profiles: {} }, { status: 500 });
  }
}
