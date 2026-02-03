// Token Exists Check API
// Lightweight endpoint to check if a token exists in our database
// Returns 200 if exists, 404 if not - no body needed for efficiency

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return new NextResponse(null, { status: 400 });
    }

    // Efficient existence check - only fetch the address column, count only
    const { count, error } = await supabase
      .from('tokens')
      .select('address', { count: 'exact', head: true })
      .eq('address', address);

    if (error) {
      console.error('Error checking token existence:', error);
      return new NextResponse(null, { status: 500 });
    }

    const exists = (count ?? 0) > 0;

    // Return 200 if found, 404 if not - no body for efficiency
    return new NextResponse(null, {
      status: exists ? 200 : 404,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    });
  } catch (error) {
    console.error('Error checking token existence:', error);
    return new NextResponse(null, { status: 500 });
  }
}
