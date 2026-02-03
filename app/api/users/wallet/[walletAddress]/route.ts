import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';

// GET /api/users/wallet/[walletAddress] - Get user by wallet address
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;

    // Find user by wallet address
    const user = await SupabaseDB.getUserByWalletAddress(walletAddress);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      points: user.points,
      wallet_address: user.wallet_address,
    });
  } catch (error) {
    console.error('Error getting user by wallet address:', error);
    return NextResponse.json(
      { error: 'Failed to get user by wallet address' },
      { status: 500 }
    );
  }
}
