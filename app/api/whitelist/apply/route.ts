import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client with service role to bypass RLS
const getServiceRoleClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      walletAddress,
      projectName,
      projectDescription,
      twitterHandle,
      telegramHandle,
      websiteUrl,
      previousWork,
      communitySize,
    } = body;

    // Validate required fields
    if (!walletAddress || !projectName || !projectDescription) {
      return NextResponse.json(
        { error: 'Wallet address, project name, and description are required' },
        { status: 400 }
      );
    }

    // Validate wallet address format (basic Solana address check)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    // Validate project name length
    if (projectName.length < 2 || projectName.length > 100) {
      return NextResponse.json(
        { error: 'Project name must be between 2 and 100 characters' },
        { status: 400 }
      );
    }

    // Validate description length
    if (projectDescription.length < 50 || projectDescription.length > 2000) {
      return NextResponse.json(
        { error: 'Project description must be between 50 and 2000 characters' },
        { status: 400 }
      );
    }

    const supabase = getServiceRoleClient();

    // Check for existing pending application from this wallet
    const { data: existingApplication } = await supabase
      .from('whitelist_applications')
      .select('id, status')
      .eq('wallet_address', walletAddress)
      .eq('status', 'pending')
      .single();

    if (existingApplication) {
      return NextResponse.json(
        { error: 'You already have a pending application. Please wait for it to be reviewed.' },
        { status: 400 }
      );
    }

    // Insert application
    const { data: application, error: insertError } = await supabase
      .from('whitelist_applications')
      .insert({
        wallet_address: walletAddress,
        project_name: projectName,
        project_description: projectDescription,
        twitter_handle: twitterHandle || null,
        telegram_handle: telegramHandle || null,
        website_url: websiteUrl || null,
        previous_work: previousWork || null,
        community_size: communitySize || null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating whitelist application:', insertError);
      return NextResponse.json(
        { error: 'Failed to submit application. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully! We will review it within 48 hours.',
      applicationId: application.id,
    });
  } catch (error) {
    console.error('Error in whitelist application:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Check application status by wallet
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    const supabase = getServiceRoleClient();

    const { data: applications, error } = await supabase
      .from('whitelist_applications')
      .select('id, project_name, status, created_at')
      .eq('wallet_address', walletAddress)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching applications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch applications' },
        { status: 500 }
      );
    }

    return NextResponse.json({ applications });
  } catch (error) {
    console.error('Error fetching whitelist applications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
