import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role client for checking whitelist
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');

    if (!wallet) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Check if wallet is in the whitelisted_wallets table and is active
    const { data, error } = await supabaseAdmin
      .from('whitelisted_wallets')
      .select('id, wallet_address, label, is_active')
      .eq('wallet_address', wallet)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is expected for non-whitelisted wallets
      console.error('Error checking whitelist:', error);
      return NextResponse.json(
        { error: 'Failed to check whitelist status' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      isWhitelisted: !!data,
      wallet,
    });
  } catch (error) {
    console.error('Whitelist check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
