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

// Max file size: 3MB (before compression)
const MAX_FILE_SIZE = 3 * 1024 * 1024;

// Image dimension constraints
const TARGET_SIZE = 512; // Target max dimension (width or height)

// CDN base URL for token images
const CDN_BASE_URL = 'https://cdn.launchpad.fun';

// Supabase storage bucket for token images
const STORAGE_BUCKET = 'token-images';

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

/**
 * Process image: resize to target dimensions maintaining aspect ratio
 * - Resize so max dimension is 512px (maintaining aspect ratio)
 * - Example: 1920x1200 -> 512x320
 */
async function processImage(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; processed: boolean; dimensions?: { width: number; height: number } }> {
  // Skip processing for GIFs to preserve animation
  if (mimeType === 'image/gif') {
    return { buffer, processed: false };
  }

  try {
    const sharp = (await import('sharp')).default;
    const sharpInstance = sharp(buffer);

    // Get image metadata to check dimensions
    const metadata = await sharpInstance.metadata();

    // Resize so max dimension is TARGET_SIZE (512px), maintaining aspect ratio
    let resizedInstance = sharpInstance.resize(TARGET_SIZE, TARGET_SIZE, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Apply format-specific compression
    let resultBuffer: Buffer;
    if (mimeType === 'image/jpeg') {
      resultBuffer = await resizedInstance.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    } else if (mimeType === 'image/png') {
      resultBuffer = await resizedInstance.png({ quality: 85, compressionLevel: 9 }).toBuffer();
    } else if (mimeType === 'image/webp') {
      resultBuffer = await resizedInstance.webp({ quality: 85 }).toBuffer();
    } else {
      resultBuffer = await resizedInstance.toBuffer();
    }

    // Verify final dimensions
    const finalMetadata = await sharp(resultBuffer).metadata();

    return {
      buffer: resultBuffer,
      processed: true,
      dimensions: { width: finalMetadata.width || 0, height: finalMetadata.height || 0 }
    };
  } catch (error) {
    console.error('Error processing image with sharp:', error);
    return { buffer, processed: false };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user
    const { user, supabase: userSupabase } = await getUserFromToken(request);

    if (!user || !userSupabase) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized - No authentication token provided. Please connect your wallet and sign in.' },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: 'Unauthorized - Invalid or expired authentication token. Please reconnect your wallet and sign in again.' },
        { status: 401 }
      );
    }

    // Check rate limit (50 uploads per hour)
    const rateLimit = await checkUploadRateLimit(user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Upload rate limit exceeded. Please try again in ${Math.ceil(rateLimit.resetInSeconds / 60)} minutes.`,
          retryAfter: rateLimit.resetInSeconds,
        },
        { status: 429 }
      );
    }

    // Parse the form data
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
    let buffer = Buffer.from(arrayBuffer as ArrayBuffer);

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

    // Process image (resize, compress) - use detected MIME type
    const originalSize = buffer.length;
    const processResult = await processImage(buffer, detectedType.mime);
    buffer = Buffer.from(processResult.buffer);
    const finalSize = buffer.length;
    const wasProcessed = processResult.processed;
    const finalDimensions = processResult.dimensions;

    // 6. Generate safe filename (never trust user input)
    const safeFilename = `${Date.now()}-${crypto.randomUUID()}.${detectedType.ext}`;
    const filePath = `${user.id}/${safeFilename}`;

    try {
      // Upload to Supabase Storage with detected content type
      const { error: uploadError } = await userSupabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, {
          contentType: detectedType.mime,
          upsert: false,
        });

      if (uploadError) {
        console.error('Supabase upload failed:', uploadError);
        throw new Error(uploadError.message);
      }

      // Construct CDN URL
      const cdnUrl = `${CDN_BASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;

      // Also get the standard Supabase public URL as fallback
      const { data: publicUrlData } = userSupabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

      const supabaseUrl = publicUrlData.publicUrl;

      // Return response with the CDN URL as primary
      return NextResponse.json({
        success: true,
        url: cdnUrl,
        supabaseUrl: supabaseUrl,
        path: filePath,
        originalSize,
        compressedSize: finalSize,
        processed: wasProcessed,
        dimensions: finalDimensions,
      });

    } catch (error: any) {
      console.error('Error uploading to Supabase:', error);

      return NextResponse.json(
        {
          error: 'Failed to upload image',
          details: error.message,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
