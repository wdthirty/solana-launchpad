import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/supabase-server';

// DELETE /api/comments/[commentId] - Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params;

    if (!commentId) {
      return NextResponse.json(
        { error: 'Comment ID is required' },
        { status: 400 }
      );
    }

    // Get the current authenticated user and client
    const { user: authUser, supabase } = await getUserFromToken(request);

    if (!authUser || !supabase) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get the comment to verify ownership
    const { data: comment, error: fetchError } = await supabase
      .from('comments')
      .select('author_id, is_deleted')
      .eq('id', commentId)
      .single();

    if (fetchError || !comment) {
      console.error('Error fetching comment:', fetchError);
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Check if user is the author
    if (comment.author_id !== authUser.id) {
      return NextResponse.json(
        { error: 'You can only delete your own comments' },
        { status: 403 }
      );
    }

    // Soft delete the comment (set is_deleted to true)
    const { error: deleteError } = await supabase
      .from('comments')
      .update({ is_deleted: true })
      .eq('id', commentId);

    if (deleteError) {
      console.error('Error deleting comment:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete comment', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/comments/[commentId]:', error);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
