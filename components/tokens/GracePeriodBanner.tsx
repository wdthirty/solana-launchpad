'use client';

/**
 * GracePeriodBanner Component
 *
 * Displays a floating banner at the top of the token page showing
 * real-time countdown and fee during the grace period.
 */

import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import {
  getCurrentGracePeriodFee,
  formatFeeBasisPoints,
  isGracePeriodActive,
  getGracePeriodTimeRemaining,
  GRACE_PERIOD_DURATION,
} from '@/lib/utils/grace-period';
import { FeeTier } from '@/lib/config/dbc-configs';

export interface GracePeriodBannerProps {
  launchTimestamp: string;
  feeTier: FeeTier;
}

export function GracePeriodBanner({
  launchTimestamp,
  feeTier,
}: GracePeriodBannerProps) {
  const launchTime = new Date(launchTimestamp).getTime();

  const [currentFee, setCurrentFee] = useState(() =>
    getCurrentGracePeriodFee(feeTier, launchTime)
  );
  const [timeRemaining, setTimeRemaining] = useState(() =>
    getGracePeriodTimeRemaining(launchTime)
  );
  const [active, setActive] = useState(() => isGracePeriodActive(launchTime));

  // Update every 100ms for smooth animation
  useEffect(() => {
    const interval = setInterval(() => {
      const stillActive = isGracePeriodActive(launchTime);
      setActive(stillActive);

      if (stillActive) {
        setCurrentFee(getCurrentGracePeriodFee(feeTier, launchTime));
        setTimeRemaining(getGracePeriodTimeRemaining(launchTime));
      } else {
        // Grace period ended
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [launchTime, feeTier]);

  // Don't render if grace period is over
  if (!active) {
    return null;
  }

  // Format time remaining as seconds with 1 decimal
  const formattedTime = timeRemaining.toFixed(1);

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500 shadow-lg"
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <Shield className="w-4 h-4 text-orange-400" />
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-orange-400">
          Grace Period Active:
        </span>
        <span className="font-mono text-sm font-semibold text-orange-300">
          {formatFeeBasisPoints(currentFee)} fee applied
        </span>
      </div>
      <div className="w-px h-4 bg-orange-500/30" />
      <span className="font-mono text-sm text-orange-300">
        {formattedTime}s
      </span>
    </div>
  );
}
