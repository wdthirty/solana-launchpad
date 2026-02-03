'use client';

/**
 * GracePeriodBadge Component
 *
 * Displays real-time countdown and fee for tokens in grace period.
 */

import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import {
  getCurrentGracePeriodFee,
  formatFeeBasisPoints,
  isGracePeriodActive,
} from '@/lib/utils/grace-period';
import { FeeTier } from '@/lib/config/dbc-configs';

export interface GracePeriodBadgeProps {
  launchTimestamp: string;
  feeTier: FeeTier;
  className?: string;
}

export function GracePeriodBadge({
  launchTimestamp,
  feeTier,
  className,
}: GracePeriodBadgeProps) {
  const launchTime = new Date(launchTimestamp).getTime();

  const [currentFee, setCurrentFee] = useState(() =>
    getCurrentGracePeriodFee(feeTier, launchTime)
  );
  const [active, setActive] = useState(() => isGracePeriodActive(launchTime));

  // Update every 100ms for smooth animation
  useEffect(() => {
    const interval = setInterval(() => {
      const stillActive = isGracePeriodActive(launchTime);
      setActive(stillActive);

      if (stillActive) {
        setCurrentFee(getCurrentGracePeriodFee(feeTier, launchTime));
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

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded relative text-orange-400 text-xs font-semibold backdrop-blur-xs ${className}`}
      style={{ zIndex: 9999, backgroundColor: 'rgba(249, 115, 22, 0.15)' }}
    >
      <Shield className="w-3 h-3" />
      <span className="font-mono text-xs font-semibold">
        {formatFeeBasisPoints(currentFee)} Fee
      </span>
    </div>
  );
}
