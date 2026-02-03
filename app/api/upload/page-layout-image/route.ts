import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/supabase-server';
import { checkUploadRateLimit } from '@/lib/redis/rate-limit';
import { fileTypeFromBuffer } from 'file-type';

// Allowed image MIME types
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// Allowed file extensions
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

// Max file size: 10MB (before compression)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

// Compress image using sharp (server-side)
async function compressImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  // Skip compression for GIFs to preserve animation
  if (mimeType === 'image/gif') {
    return buffer;
  }

  try {
    const sharp = (await import('sharp')).default;
    let sharpInstance = sharp(buffer);

    // Resize if image is larger than 1920px on any side
    sharpInstance = sharpInstance.resize(1920, 1920, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Apply format-specific compression while maintaining quality
    if (mimeType === 'image/jpeg') {
      return await sharpInstance.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    } else if (mimeType === 'image/png') {
      return await sharpInstance.png({ quality: 85, compressionLevel: 9 }).toBuffer();
    } else if (mimeType === 'image/webp') {
      return await sharpInstance.webp({ quality: 85 }).toBuffer();
    } else {
      return await sharpInstance.toBuffer();
    }
  } catch (error) {
    console.error('Error compressing image:', error);
    return buffer;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user
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

    // 3. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

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

    // Compress image while maintaining quality (GIFs are skipped to preserve animation)
    buffer = await compressImage(buffer, detectedType.mime);

    // 6. Generate safe filename (never trust user input)
    const safeFilename = `${Date.now()}-${crypto.randomUUID()}.${detectedType.ext}`;
    const filePath = `${authUser.id}/${safeFilename}`;

    // Upload to Supabase Storage in "page-layout-images" bucket
    const { error: uploadError } = await supabaseClient.storage
      .from('page-layout-images')
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

    // Get public URL with cache-busting parameter
    const { data: publicUrlData } = supabaseClient.storage
      .from('page-layout-images')
      .getPublicUrl(filePath);

    // Add timestamp to bust browser cache when image is updated
    const imageUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    return NextResponse.json({
      success: true,
      url: imageUrl,
      path: filePath,
    });
  } catch (error: any) {
    console.error('Error uploading page layout image:', error);
    return NextResponse.json(
      { error: `Failed to upload image: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
