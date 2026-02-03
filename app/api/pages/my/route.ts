import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getUserFromToken, createServerSupabaseClient } from '@/lib/supabase-server';

// GET /api/pages/my - Get pages created by the current authenticated user
export async function GET(request: NextRequest) {
  try {
    // Get the current authenticated user
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);
    
    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user profile
    const user = await SupabaseDB.getUserById(authUser.id, supabaseClient);
    if (!user) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Fetch pages created by this user
    // Exclude auto-generated token discussion pages (slug starts with 'token-')
    const { data: pages, error: pagesError } = await supabaseClient
      .from('pages')
      .select(`
        *,
        author:users!pages_author_id_fkey(id, username, avatar, points, verified)
      `)
      .eq('author_id', user.id)
      .not('slug', 'like', 'token-%')
      .order('created_at', { ascending: false });

    if (pagesError) throw pagesError;

    // Calculate discussion count for each page
    const pagesWithCounts = await Promise.all(
      (pages || []).map(async (page) => {
        const count = await SupabaseDB.getCommentCountByPageId(page.id);
        return {
          ...page,
          discussion_count: count,
        };
      })
    );

    return NextResponse.json(pagesWithCounts);
  } catch (error) {
    console.error('Error fetching user pages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pages' },
      { status: 500 }
    );
  }
}

