import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/supabase-server';
import { checkUploadRateLimit } from '@/lib/redis/rate-limit';
import { fileTypeFromBuffer } from 'file-type';

// Allowed MIME types for profile images
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// Allowed file extensions
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

// Max file size: 2MB
const MAX_FILE_SIZE = 2 * 1024 * 1024;

// Dangerous patterns that could indicate embedded scripts
const DANGEROUS_PATTERNS = [
  '<?php',
  '<?=',
  '<script',
  '<%',
  'javascript:',
  'vbscript:',
  'data:text/html',
];

// POST /api/users/current/avatar - Upload and update user avatar
export async function POST(request: NextRequest) {
  try {
    // Get the current authenticated user from Supabase Auth
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);

    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check rate limit (50 uploads per hour)
    const rateLimit = await checkUploadRateLimit(authUser.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Upload rate limit exceeded. Please try again in ${Math.ceil(rateLimit.resetInSeconds / 60)} minutes.`,
          retryAfter: rateLimit.resetInSeconds,
        },
        { status: 429 }
      );
    }

    // Get the form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // 1. Check declared MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' },
        { status: 415 }
      );
    }

    // 2. Check file extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: 'Invalid file extension. Only .jpg, .jpeg, .png, .gif, and .webp are allowed.' },
        { status: 415 }
      );
    }

    // 3. Validate file size (max 2MB)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size too large. Maximum size is 2MB.' },
        { status: 400 }
      );
    }

    // Convert File to Buffer for validation
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Validate magic bytes (CRITICAL - prevents spoofed MIME types)
    const detectedType = await fileTypeFromBuffer(buffer);

    if (!detectedType || !ALLOWED_MIME_TYPES.has(detectedType.mime)) {
      return NextResponse.json(
        { error: 'File content does not match an allowed image type.' },
        { status: 415 }
      );
    }

    // 5. Check for embedded scripts/PHP in the file content
    const contentSample = buffer.toString('utf-8', 0, Math.min(buffer.length, 1000));
    const contentLower = contentSample.toLowerCase();

    if (DANGEROUS_PATTERNS.some(pattern => contentLower.includes(pattern.toLowerCase()))) {
      return NextResponse.json(
        { error: 'Malicious content detected in file.' },
        { status: 415 }
      );
    }

    // 6. Generate safe filename (never trust user input)
    const safeFilename = `${Date.now()}-${crypto.randomUUID()}.${detectedType.ext}`;
    const filePath = `${authUser.id}/${safeFilename}`;

    // Upload to Supabase Storage with detected content type
    const { error: uploadError } = await supabaseClient.storage
      .from('profile-images')
      .upload(filePath, buffer, {
        contentType: detectedType.mime,
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading to Supabase Storage:', uploadError);
      return NextResponse.json(
        { error: `Failed to upload image: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL and replace Supabase domain with custom CDN domain
    const { data: publicUrlData } = supabaseClient.storage
      .from('profile-images')
      .getPublicUrl(filePath);

    // Replace Supabase domain with custom CDN domain
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseDomain = new URL(supabaseUrl).hostname;
    const avatarUrl = publicUrlData.publicUrl.replace(supabaseDomain, 'cdn.launchpad.fun');

    // Update user avatar in database
    const { data: updatedUser, error: updateError } = await supabaseClient
      .from('users')
      .update({ avatar: avatarUrl })
      .eq('id', authUser.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating user avatar:', updateError);
      // Try to delete the uploaded file if database update fails
      await supabaseClient.storage.from('profile-images').remove([filePath]);
      return NextResponse.json(
        { error: `Failed to update user profile: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: updatedUser.id,
      username: updatedUser.username,
      avatar: updatedUser.avatar,
      points: updatedUser.points,
      wallet_address: updatedUser.wallet_address,
    });
  } catch (error: any) {
    console.error('Error uploading avatar:', error);
    return NextResponse.json(
      { error: `Failed to upload avatar: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
