import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('bug_bounty_config')
      .select('rewards_max, rewards_remaining')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('Error fetching bug bounty config:', error);
      // Return defaults if table doesn't exist yet
      return NextResponse.json({
        rewards_max: 25000,
        rewards_remaining: 25000,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching bug bounty config:', error);
    return NextResponse.json({
      rewards_max: 25000,
      rewards_remaining: 25000,
    });
  }
}
