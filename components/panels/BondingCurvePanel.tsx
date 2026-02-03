'use client';

import React from 'react';
import { parseBackgroundPosition } from '@/lib/utils';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';

interface BondingCurvePanelProps {
  progress?: number;
  solInCurve?: number;
  isMigrated?: boolean;
  isUnavailable?: boolean;
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundBlurhash?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  textBackgroundColor?: string;
}

export function BondingCurvePanel({
  progress = 0,
  solInCurve,
  isMigrated = false,
  isUnavailable = false,
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  backgroundBlurhash,
  overlayColor,
  overlayOpacity,
  textBackgroundColor
}: BondingCurvePanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  // Helper for text background style - apply when any custom background exists (image or color)
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground ? {
    backgroundColor: `${textBackgroundColor || '#0c0c0e'}cc`,
  } : undefined;
  const formatNumber = (num: number): string => {
    return num.toFixed(3);
  };

  return (
    <div className="overflow-hidden relative rounded-2xl p-3 sm:p-5">
      {/* Optimized background with lazy loading and blur placeholder */}
      <OptimizedBackground
        src={backgroundImage}
        blurhash={backgroundBlurhash}
        backgroundColor={backgroundImage ? 'transparent' : (backgroundColor || '#0a0a0c')}
        backgroundSize={backgroundSize || 'cover'}
        backgroundPosition={backgroundSize === 'repeat' ? 'top left' : bgPos.position}
        overlayColor={overlayColor}
        overlayOpacity={overlayOpacity}
        lazy={true}
      />
      <div className="relative" style={{ zIndex: 2 }}>
        {/* Title and Percentage */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <span
            className={`text-sm sm:text-base font-bold text-white ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-0.5 rounded' : ''}`}
            style={{ ...textBgStyle, ...(textColor ? { color: textColor } : {}) }}
          >
            <span className="sm:hidden">Bonding Curve</span>
            <span className="hidden sm:inline">Bonding Curve Progress</span>
          </span>
          <span
            className={`text-sm sm:text-base font-bold text-white ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-0.5 rounded' : ''}`}
            style={{ ...textBgStyle, ...(textColor ? { color: textColor } : {}) }}
          >
            {isUnavailable ? 'N/A' : `${progress.toFixed(1)}%`}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-2 sm:mb-3">
          <div
            className="w-full rounded-full overflow-hidden h-2 sm:h-2.5"
            style={{ backgroundColor: hasCustomBackground ? '#0c0c0ecc' : 'hsl(var(--border) / 0.5)' }}
          >
            {!isUnavailable && (
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  backgroundColor: isMigrated ? '#FFD700' : '#34C759',
                  width: `${progress}%`
                }}
              />
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center justify-between">
          <span
            className={`text-xs sm:typo-caption text-muted-foreground ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-0.5 rounded' : ''}`}
            style={{ ...textBgStyle, ...(textColor ? { color: textColor } : {}) }}
          >
            {isUnavailable ? (
              '-'
            ) : isMigrated ? (
              'Graduated! 🎓 🎉'
            ) : solInCurve !== undefined ? (
              <>
                <span className="sm:hidden">{formatNumber(solInCurve)} SOL in curve</span>
                <span className="hidden sm:inline">{formatNumber(solInCurve)} SOL in bonding curve</span>
              </>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}

