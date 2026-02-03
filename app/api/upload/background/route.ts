import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/supabase-server';
import { checkUploadRateLimit } from '@/lib/redis/rate-limit';
import { encode } from 'blurhash';

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

// Max file size: 10MB for backgrounds (larger than token images)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Background image dimension constraints (more permissive)
const TARGET_MAX_DIMENSION = 2560; // Max dimension for backgrounds (2K)
const ABSOLUTE_MAX_SIZE = 4096; // Only crop if exceeds 4K

// CDN base URL
const CDN_BASE_URL = 'https://cdn.launchpad.fun';

// Supabase storage bucket for background images (uses existing token-images bucket with backgrounds/ prefix)
const STORAGE_BUCKET = 'token-images';

/**
 * Generate a blurhash from an image buffer for blur placeholder
 * Returns a compact string that can be decoded to show a blurred preview
 */
async function generateBlurhash(buffer: Buffer, mimeType: string): Promise<string | null> {
  // Skip blurhash for GIFs (they're animated)
  if (mimeType === 'image/gif') {
    return null;
  }

  try {
    const sharp = (await import('sharp')).default;

    // Resize to small dimensions for faster blurhash encoding
    const { data, info } = await sharp(buffer)
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Encode to blurhash (4x3 components is a good balance)
    const blurhash = encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      4,
      3
    );

    return blurhash;
  } catch (error) {
    console.error('Error generating blurhash:', error);
    return null;
  }
}

/**
 * Process background image: only resize if extremely large
 * - Keeps GIFs intact to preserve animation
 * - Only resizes if dimensions exceed absolute max
 * - More permissive than token image processing
 */
async function processBackgroundImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  // Skip processing for GIFs to preserve animation
  if (mimeType === 'image/gif') {
    return buffer;
  }

  try {
    const sharp = (await import('sharp')).default;
    let sharpInstance = sharp(buffer);

    // Get image metadata to check dimensions
    const metadata = await sharpInstance.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // Only resize if image exceeds max dimension
    if (width > ABSOLUTE_MAX_SIZE || height > ABSOLUTE_MAX_SIZE) {
      sharpInstance = sharpInstance.resize(TARGET_MAX_DIMENSION, TARGET_MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Apply light compression while maintaining quality
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      return await sharpInstance.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    } else if (mimeType === 'image/png') {
      return await sharpInstance.png({ quality: 90, compressionLevel: 6 }).toBuffer();
    } else if (mimeType === 'image/webp') {
      return await sharpInstance.webp({ quality: 90 }).toBuffer();
    } else {
      return await sharpInstance.toBuffer();
    }
  } catch (error) {
    console.error('Error processing background image:', error);
    return buffer;
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
          { error: 'Unauthorized - Please connect your wallet and sign in.' },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: 'Unauthorized - Invalid or expired token. Please sign in again.' },
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

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer as ArrayBuffer);

    // Process image (resize if extremely large)
    const originalSize = buffer.length;
    const processedBuffer = await processBackgroundImage(buffer, file.type);
    buffer = Buffer.from(processedBuffer);
    const finalSize = buffer.length;

    // Generate blurhash for blur placeholder (runs in parallel with upload)
    const blurhashPromise = generateBlurhash(buffer, file.type);

    // Generate unique filename with user folder and backgrounds prefix
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `backgrounds/${user.id}/${fileName}`;

    try {
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await userSupabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('❌ Supabase upload failed:', uploadError);
        throw new Error(uploadError.message);
      }

      // Construct CDN URL
      const cdnUrl = `${CDN_BASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;

      // Also get the standard Supabase public URL as fallback
      const { data: publicUrlData } = userSupabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

      const supabaseUrl = publicUrlData.publicUrl;

      // Wait for blurhash to complete
      const blurhash = await blurhashPromise;

      return NextResponse.json({
        success: true,
        url: cdnUrl,
        supabaseUrl: supabaseUrl,
        path: filePath,
        blurhash, // Blur placeholder hash for fast loading
        originalSize,
        compressedSize: finalSize,
      });

    } catch (error: any) {
      console.error('❌ Error uploading to Supabase:', error);
      return NextResponse.json(
        {
          error: 'Failed to upload image',
          details: error.message,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error uploading background:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
