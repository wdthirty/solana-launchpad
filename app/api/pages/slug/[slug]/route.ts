import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';

// GET /api/pages/slug/[slug] - Get a page by slug
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json(
        { error: 'Slug is required' },
        { status: 400 }
      );
    }

    // Find the page by slug
    const page = await SupabaseDB.getPageBySlug(slug);

    if (!page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }

    // Calculate discussion count
    const count = await SupabaseDB.getCommentCountByPageId(page.id);

    return NextResponse.json({
      ...page,
      discussion_count: count,
    });
  } catch (error) {
    console.error('Error fetching page by slug:', error);
    return NextResponse.json(
      { error: 'Failed to fetch page' },
      { status: 500 }
    );
  }
}

