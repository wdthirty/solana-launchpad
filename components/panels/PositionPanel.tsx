'use client';

import React from 'react';
import { Minus } from 'lucide-react';
import { parseBackgroundPosition } from '@/lib/utils';

interface PositionPanelProps {
  value?: string;
  amount?: string;
  tokenSymbol?: string;
  profitLoss?: number;
  showMinimize?: boolean;
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  overlayColor?: string;
  overlayOpacity?: number;
}

export function PositionPanel({
  value = '$0.00',
  amount = '0',
  tokenSymbol = 'TOKEN',
  profitLoss = 0,
  showMinimize = true,
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  overlayColor,
  overlayOpacity
}: PositionPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  return (
    <div className="overflow-hidden relative rounded-2xl p-5">
      {/* Background container */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          zIndex: 0,
        }}
      >
        {/* Overlay - child above background */}
        {overlayColor && overlayOpacity !== undefined && overlayOpacity > 0 && (
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              backgroundColor: overlayColor,
              opacity: overlayOpacity,
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Background image/color - child below overlay */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            backgroundColor: backgroundImage ? 'transparent' : (backgroundColor || '#0a0a0c'),
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
            backgroundSize: backgroundSize === 'repeat' ? 'auto' : (backgroundSize === 'cover' ? bgPos.size : (backgroundSize || 'cover')),
            backgroundPosition: backgroundSize === 'repeat' ? 'top left' : bgPos.position,
            backgroundRepeat: backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
            zIndex: 1,
          }}
        />
      </div>
      <div className="relative" style={{ zIndex: 2 }}>
        {/* Top Row - Value and Token */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex flex-col gap-0.5">
            <span className="typo-body font-bold text-white" style={textColor ? { color: textColor } : undefined}>
              {value}
            </span>
            <span className="typo-caption text-muted-foreground">
              {amount} {tokenSymbol}
            </span>
          </div>
          {showMinimize && (
            <button className="cursor-pointer hover:opacity-70 transition-opacity p-1">
              <Minus size={16} className="text-muted-foreground" strokeWidth={3} />
            </button>
          )}
        </div>

        {/* Middle Row - Position and Trades */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="typo-caption text-muted-foreground">Position</span>
            {/* Filter icon - three lines with middle line having arrow */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted-foreground">
              <rect x="2" y="3" width="10" height="1" rx="0.5" fill="currentColor"/>
              <rect x="2" y="6.5" width="6" height="1" rx="0.5" fill="currentColor"/>
              <polygon points="9,6 11,7 9,8" fill="currentColor"/>
              <rect x="2" y="10" width="10" height="1" rx="0.5" fill="currentColor"/>
            </svg>
          </div>
          <button
            className="typo-caption hover:opacity-80 transition-opacity font-medium text-green-500"
          >
            Trades
          </button>
        </div>

        {/* Profit Indicator Slider */}
        <div className="mb-3">
          <div className="relative w-full h-2 bg-border/50 rounded">
            {/* Left end - Red circle */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500"
            />

            {/* Right end - Green circle */}
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-green-500"
            />

            {/* Thumb in the middle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-muted-foreground"
              style={{
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        </div>

        {/* Profit/Loss Label and Profit indicator text */}
        <div className="flex justify-between items-center">
          <span className="typo-caption text-muted-foreground">Profit indicator</span>
          <span className="typo-caption text-muted-foreground">Profit/Loss</span>
        </div>
      </div>
    </div>
  );
}

