/**
 * Token Roadmap API
 *
 * PATCH /api/token/roadmap
 * Updates the roadmap for a project token.
 * Only the token creator can update the roadmap.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireWalletAuth } from '@/lib/auth/jwt-verify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Roadmap milestone schema
const milestoneSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(100),
  targetDate: z.string().min(1).max(50),
  status: z.enum(['planned', 'in_progress', 'completed']),
  description: z.string().max(500),
});

const updateRoadmapSchema = z.object({
  tokenAddress: z.string().min(1),
  roadmap: z.array(milestoneSchema),
});

export async function PATCH(request: NextRequest) {
  try {
    // Verify JWT and get wallet address
    const { user, error: authError } = await requireWalletAuth(request);
    if (authError || !user) {
      return NextResponse.json(
        { error: authError || 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validated = updateRoadmapSchema.parse(body);

    // Get the token and verify ownership
    const { data: token, error: tokenError } = await supabase
      .from('tokens')
      .select('creator_wallet, token_type')
      .eq('address', validated.tokenAddress)
      .single();

    if (tokenError || !token) {
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 404 }
      );
    }

    // Verify the user is the creator
    if (token.creator_wallet?.toLowerCase() !== user.walletAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Only the token creator can update the roadmap' },
        { status: 403 }
      );
    }

    // Verify this is a project token
    if (token.token_type !== 'project') {
      return NextResponse.json(
        { error: 'Roadmap can only be updated for project tokens' },
        { status: 400 }
      );
    }

    // Update the roadmap
    const { error: updateError } = await supabase
      .from('tokens')
      .update({ roadmap: validated.roadmap })
      .eq('address', validated.tokenAddress);

    if (updateError) {
      console.error('Failed to update roadmap:', updateError);
      return NextResponse.json(
        { error: 'Failed to update roadmap' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Roadmap updated successfully',
    });
  } catch (error: any) {
    console.error('Roadmap update error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update roadmap' },
      { status: 500 }
    );
  }
}
