'use client';

import { useCurrentDateTicker } from '@/lib/environment/date';

/**
 * Component that updates the current date atom every second
 * This enables live updating of relative timestamps throughout the app
 */
export function CurrentDateTicker() {
  useCurrentDateTicker();
  return null; // This component doesn't render anything
}

