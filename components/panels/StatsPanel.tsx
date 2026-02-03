'use client';

import React from 'react';
import { parseBackgroundPosition } from '@/lib/utils';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';

interface StatsPanelProps {
  vol24h?: string;
  price?: string;
  change5m?: string;
  change1h?: string;
  change6h?: string;
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

export function StatsPanel({
  vol24h = '$0.0K',
  price = '$0.00000',
  change5m = '+0.00%',
  change1h = '+0.00%',
  change6h = '+0.00%',
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  backgroundBlurhash,
  overlayColor,
  overlayOpacity,
  textBackgroundColor
}: StatsPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  // Helper for text background style - apply when any custom background exists (image or color)
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground ? {
    backgroundColor: `${textBackgroundColor || '#0c0c0e'}cc`,
  } : undefined;
  const stats = [
    { label: 'Vol 24h', value: vol24h, isChange: false },
    { label: 'Price', value: price, isChange: false },
    { label: '5m', value: change5m, isChange: true },
    { label: '1h', value: change1h, isChange: true },
    { label: '6h', value: change6h, isChange: true },
  ];

  const getChangeColor = (value: string) => {
    if (value.startsWith('+')) return 'text-green-500';
    if (value.startsWith('-')) return 'text-red-500';
    return 'text-white';
  };

  return (
    <div className="rounded-2xl overflow-hidden flex w-full relative p-3 sm:p-5">
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
      <div className="flex relative w-full" style={{ zIndex: 2 }}>
        {stats.map((stat, index) => (
          <div key={index} className="flex-1 text-center flex flex-col items-center">
            <div
              className={`text-xs sm:typo-caption text-muted-foreground mb-1 sm:mb-2 ${hasCustomBackground ? 'backdrop-blur-sm px-1.5 sm:px-2 py-0.5 rounded' : ''}`}
              style={textBgStyle}
            >
              {stat.label}
            </div>
            <div
              className={`text-[11px] sm:text-sm font-medium ${stat.isChange ? getChangeColor(stat.value) : 'text-white'} ${hasCustomBackground ? 'backdrop-blur-sm px-1.5 sm:px-2 py-0.5 rounded' : ''}`}
              style={{ ...textBgStyle, ...(!stat.isChange && textColor ? { color: textColor } : {}) }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

