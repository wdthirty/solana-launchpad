import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromToken } from '@/lib/supabase-server';

// Cache headers for layout responses - layouts change less frequently
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
};

// Create Supabase admin client with service role for backend write operations
const getSupabaseAdmin = () => {
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

// Regular client for read operations
const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(supabaseUrl, supabaseAnonKey);
};

// GET - Fetch token layout (optimized with parallel queries)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const supabase = getSupabaseClient();

    if (!address) {
      return NextResponse.json(
        { error: 'Token address is required' },
        { status: 400 }
      );
    }

    // Fetch token page_id and token_layouts in parallel for faster response
    const [tokenResult, tokenLayoutResult] = await Promise.all([
      supabase
        .from('tokens')
        .select('page_id')
        .eq('address', address)
        .single(),
      supabase
        .from('token_layouts')
        .select('layout')
        .eq('token_address', address)
        .single(),
    ]);

    const { data: token, error: tokenError } = tokenResult;
    const { data: tokenLayout, error: tokenLayoutError } = tokenLayoutResult;

    // Check for fatal errors (not just "not found")
    if (tokenError && tokenError.code !== 'PGRST116') {
      console.error('Error fetching token:', tokenError);
      return NextResponse.json(
        { error: 'Failed to fetch token', details: tokenError.message },
        { status: 500 }
      );
    }

    // If token has a page_id, fetch layout from page tables (in parallel)
    if (token?.page_id) {
      const [pageLayoutResult, pageResult] = await Promise.all([
        supabase
          .from('page_layouts')
          .select('layout')
          .eq('page_id', token.page_id)
          .single(),
        supabase
          .from('pages')
          .select('layout')
          .eq('id', token.page_id)
          .single(),
      ]);

      // Prefer page_layouts table
      if (!pageLayoutResult.error && pageLayoutResult.data?.layout) {
        return NextResponse.json({ layout: pageLayoutResult.data.layout }, { headers: CACHE_HEADERS });
      }

      // Fallback to pages table
      if (!pageResult.error && pageResult.data?.layout) {
        return NextResponse.json({ layout: pageResult.data.layout }, { headers: CACHE_HEADERS });
      }
    }

    // Use token_layouts if available
    if (!tokenLayoutError && tokenLayout?.layout) {
      return NextResponse.json({ layout: tokenLayout.layout }, { headers: CACHE_HEADERS });
    }

    // No layout found
    if (tokenLayoutError && tokenLayoutError.code !== 'PGRST116') {
      console.error('Error fetching token layout:', tokenLayoutError);
      return NextResponse.json(
        { error: 'Failed to fetch layout', details: tokenLayoutError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ layout: null }, { headers: CACHE_HEADERS });
  } catch (error: any) {
    console.error('Error in layout API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Save token layout (requires authentication + creator verification)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const supabaseAdmin = getSupabaseAdmin();

    if (!address) {
      return NextResponse.json(
        { error: 'Token address is required' },
        { status: 400 }
      );
    }

    // SECURITY: Require authentication
    const { user: authUser } = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get the authenticated user's wallet address from the database
    // Don't trust user_metadata alone - verify against the users table
    const { data: dbUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, wallet_address')
      .eq('id', authUser.id)
      .single();

    if (userError || !dbUser?.wallet_address) {
      console.error('Error fetching user wallet:', userError);
      return NextResponse.json(
        { error: 'Could not verify user identity' },
        { status: 403 }
      );
    }

    const userWalletAddress = dbUser.wallet_address;

    // SECURITY: Verify the user is the token creator or an editor
    const { data: token, error: tokenError } = await supabaseAdmin
      .from('tokens')
      .select('creator_wallet, creator_user_id, editor_wallets')
      .eq('address', address)
      .single();

    if (tokenError) {
      if (tokenError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Token not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching token:', tokenError);
      return NextResponse.json(
        { error: 'Failed to verify token ownership' },
        { status: 500 }
      );
    }

    // Check if the authenticated user is the creator or an editor
    // Match by creator_user_id (if they've logged in before) OR by wallet address OR editor_wallets
    const isCreator =
      (token.creator_user_id && token.creator_user_id === authUser.id) ||
      (token.creator_wallet && token.creator_wallet.toLowerCase() === userWalletAddress.toLowerCase());

    const isEditor =
      Array.isArray(token.editor_wallets) &&
      token.editor_wallets.some(
        (wallet: string) => wallet.toLowerCase() === userWalletAddress.toLowerCase()
      );

    if (!isCreator && !isEditor) {
      console.warn(`Unauthorized layout save attempt: user ${authUser.id} (${userWalletAddress}) tried to modify token ${address} owned by ${token.creator_wallet}`);
      return NextResponse.json(
        { error: 'You are not authorized to edit this token' },
        { status: 403 }
      );
    }

    // Parse and validate layout
    const body = await request.json();
    const { layout } = body;

    if (!layout) {
      return NextResponse.json(
        { error: 'Layout data is required' },
        { status: 400 }
      );
    }

    // Upsert layout (insert or update) using admin client to bypass RLS
    const { data, error } = await supabaseAdmin
      .from('token_layouts')
      .upsert({
        token_address: address,
        layout,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'token_address',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving layout:', error);
      return NextResponse.json(
        { error: 'Failed to save layout', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, layout: data });
  } catch (error: any) {
    console.error('Error in layout save API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
