import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { z } from 'zod';

const checkNameSchema = z.object({
  name: z.string().min(3).max(32),
  symbol: z.string().min(1).max(10).optional(),
});

// Copycat deterrence window in minutes
const COPYCAT_LOCK_MINUTES = 10;

// Rate limiting: 100 checks per 10 minutes per IP
const checkNameRateLimit = new Map<string, { count: number; resetAt: number }>();
const CHECK_NAME_RATE_LIMIT = 100;
const CHECK_NAME_RATE_WINDOW = 10 * 60 * 1000; // 10 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = checkNameRateLimit.get(ip);

  if (!record || now > record.resetAt) {
    checkNameRateLimit.set(ip, { count: 1, resetAt: now + CHECK_NAME_RATE_WINDOW });
    return true;
  }

  if (record.count >= CHECK_NAME_RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { name, symbol } = checkNameSchema.parse(body);

    const trimmedName = name.trim();
    const trimmedSymbol = symbol?.trim();
    const trimmedSymbolUpper = trimmedSymbol?.toUpperCase();

    if (!trimmedName || trimmedName.length === 0) {
      return NextResponse.json(
        { exists: false, message: 'Token name is required' },
        { status: 400 }
      );
    }

    if (trimmedName.length < 3) {
      return NextResponse.json(
        { exists: false, message: 'Token name must be at least 3 characters long' },
        { status: 400 }
      );
    }

    // If symbol is provided, check for both name AND symbol combination
    // If symbol is not provided, only check name (for backwards compatibility)
    const { supabase } = await import('@/lib/supabase');
    let query = supabase
      .from('tokens')
      .select('id, name, symbol, address, is_migrated, created_at')
      .eq('is_active', true);

    if (trimmedSymbolUpper && trimmedSymbolUpper.length > 0) {
      // Check for both name AND symbol combination (case-insensitive)
      query = query
        .ilike('name', trimmedName)
        .ilike('symbol', trimmedSymbolUpper);
    } else {
      // Only check name if symbol is not provided
      query = query.ilike('name', trimmedName);
    }

    const { data, error } = await query.limit(1);

    if (error) {
      console.error('Error checking token name/symbol:', error);
      return NextResponse.json(
        { error: 'Failed to check token name/symbol' },
        { status: 500 }
      );
    }

    // Check if token exists and should be locked
    // Lock rules:
    // 1. If graduated (is_migrated = true): always locked
    // 2. If not graduated: locked for 10 minutes after creation, then released
    let isLocked = false;
    let lockReason: 'graduated' | 'recent' | null = null;

    if (data && data.length > 0) {
      const token = data[0];

      if (token.is_migrated) {
        // Graduated tokens are permanently locked
        isLocked = true;
        lockReason = 'graduated';
      } else {
        // Non-graduated tokens: check if within 10-minute window
        const createdAt = new Date(token.created_at);
        const now = new Date();
        const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);

        if (minutesSinceCreation < COPYCAT_LOCK_MINUTES) {
          isLocked = true;
          lockReason = 'recent';
        }
      }
    }

    if (trimmedSymbolUpper && trimmedSymbolUpper.length > 0) {
      return NextResponse.json({
        exists: isLocked,
        message: isLocked
          ? lockReason === 'graduated'
            ? `A graduated token with name "${trimmedName}" and symbol "${trimmedSymbol}" exists`
            : `A token with name "${trimmedName}" and symbol "${trimmedSymbol}" was recently created`
          : `Token name "${trimmedName}" and symbol "${trimmedSymbol}" are available`,
      });
    } else {
      return NextResponse.json({
        exists: isLocked,
        message: isLocked
          ? lockReason === 'graduated'
            ? `Token name "${trimmedName}" belongs to a graduated token`
            : `Token name "${trimmedName}" was recently created`
          : `Token name "${trimmedName}" is available`,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error in check-name endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

