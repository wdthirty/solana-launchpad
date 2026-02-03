import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

// GET /api/tokens/[address]/announcements/[slug] - Get a single announcement by slug
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string; slug: string }> }
) {
  try {
    const { address, slug } = await params;
    const supabase = createServerSupabaseClient();

    // Construct the full slug pattern
    const fullSlug = `token-${address}-announcement-${slug}`;

    // Fetch the specific thread
    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .select(`
        *,
        author:users!threads_author_id_fkey(id, username, avatar, points, wallet_address, verified)
      `)
      .eq('token_address', address)
      .or(`slug.eq.${fullSlug},slug.ilike.%-${slug}`)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      );
    }

    // Get the corresponding thread_page for comments
    const { data: threadPage } = await supabase
      .from('thread_pages')
      .select('id')
      .eq('thread_id', thread.id)
      .single();

    // Transform to match the expected announcement format
    const announcement = {
      id: thread.id,
      title: thread.title,
      description: thread.description,
      author: thread.author,
      created_at: thread.created_at,
      slug: thread.slug,
      pageId: threadPage?.id || null,
      metadata: {
        image: thread.image_url,
        websiteLink: thread.website_link,
        ...thread.metadata,
      },
    };

    return NextResponse.json(announcement);
  } catch (error: any) {
    console.error('Error fetching announcement:', error);
    return NextResponse.json(
      { error: 'Failed to fetch announcement', details: error.message },
      { status: 500 }
    );
  }
}
