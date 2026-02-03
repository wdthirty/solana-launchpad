// Token Like API
// GET: Check if user has liked a token and get like count
// POST: Like a token
// DELETE: Unlike a token

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to get authenticated user
async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// GET - Check if user has liked and get like count
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

    // Get like count from tokens table
    const { data: token, error: tokenError } = await supabaseAdmin
      .from('tokens')
      .select('like_count')
      .eq('address', address)
      .single();

    if (tokenError && tokenError.code !== 'PGRST116') {
      throw tokenError;
    }

    const likeCount = token?.like_count || 0;

    // Check if current user has liked (if authenticated)
    const user = await getAuthenticatedUser();
    let hasLiked = false;

    if (user) {
      const { data: like } = await supabaseAdmin
        .from('token_likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('token_address', address)
        .single();

      hasLiked = !!like;
    }

    return NextResponse.json({
      likeCount,
      hasLiked,
    });
  } catch (error) {
    console.error('Error fetching token like status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch like status' },
      { status: 500 }
    );
  }
}

// POST - Like a token
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

    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if token exists
    const { data: token, error: tokenError } = await supabaseAdmin
      .from('tokens')
      .select('address')
      .eq('address', address)
      .single();

    if (tokenError || !token) {
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 404 }
      );
    }

    // Check if already liked
    const { data: existingLike } = await supabaseAdmin
      .from('token_likes')
      .select('id')
      .eq('user_id', user.id)
      .eq('token_address', address)
      .single();

    if (existingLike) {
      return NextResponse.json(
        { error: 'Already liked' },
        { status: 409 }
      );
    }

    // Create the like
    const { error: insertError } = await supabaseAdmin
      .from('token_likes')
      .insert({
        user_id: user.id,
        token_address: address,
      });

    if (insertError) {
      throw insertError;
    }

    // Fetch updated like count
    const { data: updatedToken } = await supabaseAdmin
      .from('tokens')
      .select('like_count')
      .eq('address', address)
      .single();

    return NextResponse.json({
      success: true,
      likeCount: updatedToken?.like_count || 1,
      hasLiked: true,
    });
  } catch (error) {
    console.error('Error liking token:', error);
    return NextResponse.json(
      { error: 'Failed to like token' },
      { status: 500 }
    );
  }
}

// DELETE - Unlike a token
export async function DELETE(
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

    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Delete the like
    const { error: deleteError } = await supabaseAdmin
      .from('token_likes')
      .delete()
      .eq('user_id', user.id)
      .eq('token_address', address);

    if (deleteError) {
      throw deleteError;
    }

    // Fetch updated like count
    const { data: updatedToken } = await supabaseAdmin
      .from('tokens')
      .select('like_count')
      .eq('address', address)
      .single();

    return NextResponse.json({
      success: true,
      likeCount: updatedToken?.like_count || 0,
      hasLiked: false,
    });
  } catch (error) {
    console.error('Error unliking token:', error);
    return NextResponse.json(
      { error: 'Failed to unlike token' },
      { status: 500 }
    );
  }
}
