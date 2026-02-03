/**
 * Ably Client Authentication Endpoint
 *
 * Provides secure tokens for client-side Ably connections.
 * Tokens are subscribe-only and scoped to public token feed channels.
 *
 * Security:
 * - No user authentication required (public feed)
 * - Rate limited by IP to prevent abuse (10 tokens/IP/minute)
 * - Tokens are subscribe-only (cannot publish)
 * - Tokens expire after 1 hour
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateClientToken } from '@/lib/ably/config';

// Rate limit: 10 tokens per IP per minute (generous for page refreshes)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000; // 1 minute

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

// Clean up old entries periodically to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 60 * 1000); // Clean up every minute

/**
 * POST /api/ably/auth
 * Generate Ably authentication token for client
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many token requests. Please wait a moment.',
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const clientId =
      body.clientId ||
      `anon-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const token = await generateClientToken(clientId);

    if (!token) {
      throw new Error('Failed to generate Ably token');
    }

    return NextResponse.json(
      {
        token,
        clientId,
        expiresIn: 3600,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('[Ably Auth] Error generating token:', error);

    if (error.message?.includes('ABLY_API_KEY')) {
      return NextResponse.json(
        {
          error: 'Ably is not configured',
          message: 'Real-time features are currently unavailable',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to generate authentication token',
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ably/auth
 * Alternative method for getting Ably token (supports GET requests)
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many token requests. Please wait a moment.',
        },
        { status: 429 }
      );
    }

    const clientId = `anon-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const token = await generateClientToken(clientId);

    if (!token) {
      throw new Error('Failed to generate Ably token');
    }

    return NextResponse.json(
      {
        token,
        clientId,
        expiresIn: 3600,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('[Ably Auth] Error generating token:', error);

    if (error.message?.includes('ABLY_API_KEY')) {
      return NextResponse.json(
        {
          error: 'Ably is not configured',
          message: 'Real-time features are currently unavailable',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to generate authentication token',
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
