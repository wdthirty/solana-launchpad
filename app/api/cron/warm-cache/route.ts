import { NextRequest, NextResponse } from 'next/server';
import { getFeaturedTokenCount, getTopFeaturedTokens } from '@/lib/algorithms/simple-featured-score';

// Vercel Cron job to check featured cache health
// Now just a health check since featured scoring is real-time (updated on every swap)
// The sorted set `featured:tokens:ranked` is maintained by swap-processor.ts

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const startTime = Date.now();

    // Just check the health of the real-time sorted set
    const [tokenCount, topTokens] = await Promise.all([
      getFeaturedTokenCount(),
      getTopFeaturedTokens(0, 5), // Sample top 5
    ]);

    return NextResponse.json({
      success: true,
      message: 'Featured scoring is real-time (no cache warming needed)',
      tokensInSortedSet: tokenCount,
      sampleTopTokens: topTokens,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    console.error('[Cron] Featured health check failed:', error);
    return NextResponse.json(
      { error: 'Featured health check failed' },
      { status: 500 }
    );
  }
}
