import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromToken } from '@/lib/supabase-server';

const DAILY_LIMIT = 15;

// Create Supabase client with service role to bypass RLS for storage operations
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
const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const STORAGE_BUCKET = 'bug-report-images';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { user, supabase } = await getUserFromToken(request);

    if (!user || !supabase) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check rate limit (15 reports per day per user)
    const serviceRoleSupabase = getServiceRoleClient();
    const { data: countData, error: countError } = await serviceRoleSupabase
      .rpc('get_user_bug_reports_today', { p_user_id: user.id });

    if (countError) {
      console.error('Error checking rate limit:', countError);
      // Continue anyway - don't block on rate limit check failure
    } else if (countData >= DAILY_LIMIT) {
      return NextResponse.json(
        { error: `You can only submit ${DAILY_LIMIT} bug reports per day. Please try again tomorrow.` },
        { status: 429 }
      );
    }

    // Parse form data
    const formData = await request.formData();

    const walletAddress = formData.get('walletAddress') as string;
    const contactInfo = formData.get('contactInfo') as string | null;
    const description = formData.get('description') as string;
    const stepsToReproduce = formData.get('stepsToReproduce') as string | null;
    const expectedBehavior = formData.get('expectedBehavior') as string | null;
    const actualBehavior = formData.get('actualBehavior') as string | null;

    // Validate required fields
    if (!walletAddress || !description) {
      return NextResponse.json(
        { error: 'Wallet address and description are required' },
        { status: 400 }
      );
    }

    // Get attachments
    const attachments: File[] = [];
    for (let i = 0; i < MAX_ATTACHMENTS; i++) {
      const file = formData.get(`attachment_${i}`) as File | null;
      if (file && file.size > 0) {
        // Validate file
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
          return NextResponse.json(
            { error: `Invalid file type: ${file.type}. Only images are allowed.` },
            { status: 400 }
          );
        }
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: `File ${file.name} is too large. Maximum size is 3MB.` },
            { status: 400 }
          );
        }
        attachments.push(file);
      }
    }

    // Create bug report
    const { data: bugReport, error: insertError } = await supabase
      .from('bug_reports')
      .insert({
        user_id: user.id,
        wallet_address: walletAddress,
        contact_info: contactInfo || null,
        description,
        steps_to_reproduce: stepsToReproduce || null,
        expected_behavior: expectedBehavior || null,
        actual_behavior: actualBehavior || null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating bug report:', insertError);
      return NextResponse.json(
        { error: 'Failed to create bug report' },
        { status: 500 }
      );
    }

    // Upload attachments to Supabase Storage
    const uploadedAttachments: { file_url: string; file_name: string; file_size: number }[] = [];

    for (const file of attachments) {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${bugReport.id}/${crypto.randomUUID()}.${fileExt}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await serviceRoleSupabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Error uploading attachment:', uploadError);
        // Continue with other attachments
        continue;
      }

      // Get public URL
      const { data: urlData } = serviceRoleSupabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName);

      uploadedAttachments.push({
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_size: file.size,
      });
    }

    // Insert attachment records
    if (uploadedAttachments.length > 0) {
      const { error: attachmentError } = await supabase
        .from('bug_report_attachments')
        .insert(
          uploadedAttachments.map((att) => ({
            bug_report_id: bugReport.id,
            file_url: att.file_url,
            file_name: att.file_name,
            file_size: att.file_size,
          }))
        );

      if (attachmentError) {
        console.error('Error saving attachment records:', attachmentError);
        // Bug report was created, just log the error
      }
    }

    return NextResponse.json({
      success: true,
      bugReport: {
        id: bugReport.id,
        status: bugReport.status,
        attachments: uploadedAttachments.length,
      },
    });
  } catch (error) {
    console.error('Error in bug report submission:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get user's own bug reports
export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getUserFromToken(request);

    if (!user || !supabase) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { data: reports, error } = await supabase
      .from('bug_reports')
      .select(`
        *,
        bug_report_attachments (*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bug reports:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bug reports' },
        { status: 500 }
      );
    }

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Error fetching bug reports:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
