import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getUserFromToken } from '@/lib/supabase-server';

// GET /api/pages/[pageId] - Get a single page by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    // Find the page by ID
    const page = await SupabaseDB.getPageById(pageId);

    if (!page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }

    // Calculate discussion count
    const count = await SupabaseDB.getCommentCountByPageId(pageId);

    return NextResponse.json({
      ...page,
      discussion_count: count,
    });
  } catch (error) {
    console.error('❌ Error fetching page by ID:', error);
    return NextResponse.json(
      { error: 'Failed to fetch page' },
      { status: 500 }
    );
  }
}

// DELETE /api/pages/[pageId] - Delete a page and all its comments
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    // Get the current authenticated user
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);
    
    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Find the page first to check if it exists and verify ownership
    const page = await SupabaseDB.getPageById(pageId);
    if (!page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }

    // Check if user owns the page
    if (page.author_id !== authUser.id) {
      return NextResponse.json(
        { error: 'Not authorized to delete this page' },
        { status: 403 }
      );
    }

    // Delete all comments associated with this page (cascade delete will handle this)
    const { error: commentsError } = await supabaseClient
      .from('comments')
      .delete()
      .eq('page_id', pageId);

    if (commentsError) {
      console.error('Error deleting comments:', commentsError);
    }

    // Delete the page
    const { error: pageError } = await supabaseClient
      .from('pages')
      .delete()
      .eq('id', pageId);

    if (pageError) {
      throw pageError;
    }

    return NextResponse.json({
      success: true,
      message: 'Page and all comments deleted successfully',
      deletedPage: pageId
    });
  } catch (error) {
    console.error('❌ Error deleting page:', error);
    return NextResponse.json(
      { error: 'Failed to delete page' },
      { status: 500 }
    );
  }
}