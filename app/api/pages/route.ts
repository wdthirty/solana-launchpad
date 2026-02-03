import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getUserFromToken } from '@/lib/supabase-server';
import { DEFAULT_AVATAR_URL } from '@/lib/config/app-config';

// GET /api/pages - Get all pages
export async function GET() {
  try {
    const pages = await SupabaseDB.getPages();

    // Calculate discussion count for each page by counting non-deleted comments
    const pagesWithCounts = await Promise.all(
      pages.map(async (page) => {
        const count = await SupabaseDB.getCommentCountByPageId(page.id);
        return {
          ...page,
          discussion_count: count,
        };
      })
    );

    return NextResponse.json(pagesWithCounts);
  } catch (error) {
    console.error('Error fetching pages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pages' },
      { status: 500 }
    );
  }
}

// POST /api/pages - Create a new page
export async function POST(request: NextRequest) {
  try {
    const { title, description } = await request.json();

    if (!title || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // Description is optional, use empty string if not provided
    const pageDescription = description?.trim() || '';

    // Get the current authenticated user
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);

    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get or create user profile
    let user = await SupabaseDB.getUserById(authUser.id);
    if (!user) {
      // Get wallet address from the request headers or user metadata
      const walletAddress = authUser.user_metadata?.wallet_address || 
                           authUser.user_metadata?.public_key ||
                           authUser.user_metadata?.address;
      
      user = await SupabaseDB.createUser({
        id: authUser.id,
        username: `@${authUser.id.slice(0, 8)}`,
        avatar: DEFAULT_AVATAR_URL,
        wallet_address: walletAddress,
      }, supabaseClient);
    }

    // Create the page
    const page = await SupabaseDB.createPage({
      title: title.trim(),
      description: pageDescription,
      author_id: user.id,
    }, supabaseClient);

    // Update user points for creating a page
    await SupabaseDB.updateUserPoints(user.id, 10, supabaseClient);

    return NextResponse.json({
      ...page,
      commentCount: 0,
    }, { status: 201 });
  } catch (error) {
    console.error('❌ Error creating page:', error);
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown'
    });
    return NextResponse.json(
      { 
        error: 'Failed to create page', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
