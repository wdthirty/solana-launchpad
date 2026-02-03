'use client';

import React, { useMemo } from 'react';
import { formatMarketCap } from '@/lib/solana/jupiter-data-client';

// Rapid flash keyframes for ATH glow on the bar and text
const glowKeyframes = `
@keyframes athGlow {
  0%, 100% { box-shadow: 0 0 8px 2px #00eb2f; }
  50% { box-shadow: 0 0 3px 1px #00eb2f40; }
}
@keyframes athTextGlow {
  0%, 100% { text-shadow: 0 0 8px #00eb2f; }
  50% { text-shadow: 0 0 3px #00eb2f40; }
}
`;

interface AthBarProps {
  marketCap?: number;
  athMarketCap?: number;
}

export function AthBar({ marketCap = 0, athMarketCap = 0 }: AthBarProps) {
  // Use raw backend values for ATH comparison
  // effectiveAth is the higher of athMarketCap or current marketCap (for when we break ATH)
  const effectiveAth = Math.max(athMarketCap, marketCap);

  // Check if at ATH using raw values - true when current market cap >= stored ATH
  const isAtAth = marketCap >= athMarketCap && athMarketCap > 0;

  const athProgress = useMemo(() => {
    if (!effectiveAth || effectiveAth <= 0) return 100;
    return Math.min(100, (marketCap / effectiveAth) * 100);
  }, [marketCap, effectiveAth]);

  // Don't show if no ATH data
  if (!athMarketCap || athMarketCap <= 0) {
    return null;
  }

  return (
    <>
      <style>{glowKeyframes}</style>
      <div className="flex items-center gap-2">
        {/* ATH value */}
        <span className="typo-body whitespace-nowrap leading-none flex items-center gap-1">
          <span className="text-muted-foreground">ATH</span>
          <span
            className={isAtAth ? 'text-primary' : 'text-white'}
            style={isAtAth ? { animation: 'athTextGlow 1s ease-in-out infinite' } : undefined}
          >
            {formatMarketCap(effectiveAth)}
          </span>
        </span>
        {/* Progress bar - fixed width to prevent shifting */}
        <div className="w-24 h-3 rounded-full bg-[#1a1a1f] flex-shrink-0 relative">
          {/* Progress fill */}
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                backgroundColor: '#00eb2f',
                width: `${athProgress}%`
              }}
            />
          </div>
          {/* Glow overlay - sits on top */}
          {isAtAth && (
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                animation: 'athGlow 1s ease-in-out infinite'
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
