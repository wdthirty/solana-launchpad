import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getUserFromToken } from '@/lib/supabase-server';
import { generateUsername } from 'unique-username-generator';
import { DEFAULT_AVATAR_URL } from '@/lib/config/app-config';
import { validateUsername } from '@/lib/utils/username-validation';

// GET /api/users/current - Get the current authenticated user
export async function GET(request: NextRequest) {
  try {
    // Get the current authenticated user from Supabase Auth
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);

    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get wallet address from request header (sent from client with wallet adapter)
    const walletAddress = request.headers.get('x-wallet-address');

    // Get user data from our users table
    let user = await SupabaseDB.getUserById(authUser.id);

    if (!user) {
      // Generate a random username
      const randomUsername = generateUsername('', 0, 12);

      // Create user profile if it doesn't exist
      user = await SupabaseDB.createUser({
        id: authUser.id,
        username: randomUsername,
        avatar: DEFAULT_AVATAR_URL,
        wallet_address: walletAddress || undefined,
      }, supabaseClient);
    } else if (!user.wallet_address && walletAddress) {
      // Update existing user if wallet_address is null
      const { data: updatedUser, error: updateError } = await supabaseClient
        .from('users')
        .update({ wallet_address: walletAddress })
        .eq('id', authUser.id)
        .select()
        .single();

      if (!updateError && updatedUser) {
        user = updatedUser;
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Failed to create or retrieve user' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      points: user.points,
      wallet_address: user.wallet_address,
      verified: user.verified,
    });
  } catch (error) {
    console.error('Error getting current user:', error);
    return NextResponse.json(
      { error: 'Failed to get current user' },
      { status: 500 }
    );
  }
}

// PATCH /api/users/current - Update the current authenticated user's profile
export async function PATCH(request: NextRequest) {
  try {
    // Get the current authenticated user from Supabase Auth
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);

    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { username } = body;

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Validate username (length, reserved names, etc.)
    const validationError = validateUsername(username);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    // Check if username is already taken by another user (case-insensitive)
    const { data: existingUser, error: checkError } = await supabaseClient
      .from('users')
      .select('id')
      .ilike('username', username.trim())
      .neq('id', authUser.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username is already taken' },
        { status: 409 }
      );
    }

    // Update the username
    const { data: updatedUser, error: updateError } = await supabaseClient
      .from('users')
      .update({ username: username.trim() })
      .eq('id', authUser.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      id: updatedUser.id,
      username: updatedUser.username,
      avatar: updatedUser.avatar,
      points: updatedUser.points,
      wallet_address: updatedUser.wallet_address,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}
