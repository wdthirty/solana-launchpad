import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';

// GET /api/users/wallet/[walletAddress]/tokens - Get tokens created by a wallet
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    
    const tokens = await SupabaseDB.getTokensByCreator(walletAddress, limit);
    
    return NextResponse.json(tokens);
  } catch (error) {
    console.error('Error getting tokens by creator:', error);
    return NextResponse.json(
      { error: 'Failed to get tokens' },
      { status: 500 }
    );
  }
}


