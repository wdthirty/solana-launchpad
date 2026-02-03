import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserFromToken, createServerSupabaseClient } from '@/lib/supabase-server';

// GET - Fetch page layout
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;

    // Try to get authenticated client, fallback to unauthenticated
    const { supabase: supabaseClient } = await getUserFromToken(request);
    const client = supabaseClient || createServerSupabaseClient();

    // Fetch layout from database
    const { data, error } = await client
      .from('page_layouts')
      .select('*')
      .eq('page_id', pageId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching layout:', error);
      return NextResponse.json(
        { error: 'Failed to fetch layout' },
        { status: 500 }
      );
    }

    return NextResponse.json({ layout: data?.layout || null });
  } catch (error) {
    console.error('Error in layout API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save page layout (requires authentication + ownership verification)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const body = await request.json();
    const { layout } = body;

    if (!layout) {
      return NextResponse.json(
        { error: 'Layout data is required' },
        { status: 400 }
      );
    }

    // SECURITY: Require authentication
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);
    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // SECURITY: Verify the user owns this page
    const { data: page, error: pageError } = await supabase
      .from('pages')
      .select('author_id')
      .eq('id', pageId)
      .single();

    if (pageError) {
      if (pageError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Page not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching page:', pageError);
      return NextResponse.json(
        { error: 'Failed to verify page ownership' },
        { status: 500 }
      );
    }

    if (page.author_id !== authUser.id) {
      console.warn(`Unauthorized page layout save attempt: user ${authUser.id} tried to modify page ${pageId} owned by ${page.author_id}`);
      return NextResponse.json(
        { error: 'You are not the owner of this page' },
        { status: 403 }
      );
    }

    // Upsert layout (insert or update) using authenticated client
    const { data, error } = await supabaseClient
      .from('page_layouts')
      .upsert({
        page_id: pageId,
        layout,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'page_id',
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
  } catch (error) {
    console.error('Error in layout save API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

