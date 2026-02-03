'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { parseBackgroundPosition } from '@/lib/utils';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';

interface Holder {
  name: string;
  percentage: number;
  isLiquidity?: boolean;
  address?: string;
  isCreator?: boolean;
}

interface TopHoldersPanelProps {
  holders?: Holder[];
  onGenerateBubbleMap?: () => void;
  tokenAddress?: string;
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
  token?: {
    name?: string;
    symbol?: string;
    metadata?: {
      twitter?: string;
      website?: string;
      telegram?: string;
      description?: string;
      tagline?: string;
    };
  };
  baseAsset?: {
    twitter?: string;
    website?: string;
    telegram?: string;
    symbol?: string;
    name?: string;
  };
}

export function TopHoldersPanel({
  holders = [],
  onGenerateBubbleMap,
  tokenAddress,
  isUnavailable = false,
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  backgroundBlurhash,
  overlayColor,
  overlayOpacity,
  textBackgroundColor,
  token,
  baseAsset
}: TopHoldersPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  // Helper for text background style - apply when any custom background exists (image or color)
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground ? {
    backgroundColor: `${textBackgroundColor || '#0c0c0e'}cc`,
  } : undefined;
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleGenerateBubbleMap = () => {
    if (onGenerateBubbleMap) {
      onGenerateBubbleMap();
    }
    setIsDialogOpen(true);
  };

  const bubbleMapUrl = tokenAddress
    ? `https://app.insightx.network/bubblemaps/solana/${tokenAddress}?embed_id=ws6GaSg6N1a3cX`
    : '';

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
        {/* Header with Title and Button */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <span
            className={`text-sm sm:text-base font-bold text-white ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-0.5 rounded' : ''}`}
            style={{ ...textBgStyle, ...(textColor ? { color: textColor } : {}) }}
          >
            Top holders
          </span>
          <button
            onClick={handleGenerateBubbleMap}
            className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:typo-caption hover:opacity-80 transition-opacity border border-border/50 text-muted-foreground cursor-pointer ${hasCustomBackground ? 'backdrop-blur-sm' : 'bg-transparent'}`}
            style={textBgStyle}
          >
            Generate bubble map
          </button>
        </div>

        {/* Holders List */}
        <div
          className={`space-y-1.5 sm:space-y-2 ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-2 rounded' : ''}`}
          style={textBgStyle}
        >
          {isUnavailable ? (
            <div className="text-xs sm:typo-caption text-muted-foreground">
              -
            </div>
          ) : holders.length === 0 ? (
            <div className="text-xs sm:typo-caption text-muted-foreground">
              No holder data available
            </div>
          ) : (
            holders.map((holder, index) => {
              const holderContent = (
                <div className="flex items-center gap-1">
                  {holder.isLiquidity && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span style={{ color: '#007AFF', cursor: 'help' }}>💧</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>LP</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {holder.isCreator && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span style={{ cursor: 'help' }}>💡</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Dev</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <span className="text-white" style={textColor ? { color: textColor } : undefined}>{holder.name}</span>
                </div>
              );

              return (
                <div
                  key={index}
                  className="flex items-center justify-between text-xs sm:text-sm"
                >
                  {holder.address ? (
                    <a
                      href={`https://solscan.io/account/${holder.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:opacity-80 transition-opacity text-white"
                      style={textColor ? { color: textColor } : undefined}
                    >
                      {holderContent}
                    </a>
                  ) : (
                    holderContent
                  )}
                  <span className="text-white" style={textColor ? { color: textColor } : undefined}>{holder.percentage.toFixed(2)}%</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bubble Map Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-6xl w-full h-[85vh] sm:h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-2 sm:px-3 pt-2 sm:pt-3 pb-1 sm:pb-2 flex-shrink-0">
            <DialogTitle>Token Bubble Map</DialogTitle>
          </DialogHeader>
          <div className="flex-1 px-2 sm:px-3 pb-2 sm:pb-3 min-h-0 overflow-hidden">
            {tokenAddress ? (
              <div
                className="w-full h-full rounded-lg overflow-hidden"
                style={{
                  touchAction: 'pan-x pan-y pinch-zoom',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                <iframe
                  src={bubbleMapUrl}
                  allow="clipboard-write"
                  width="100%"
                  height="100%"
                  className="border-0 w-full h-full"
                  style={{
                    minHeight: '400px',
                    touchAction: 'auto'
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Token address not available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

