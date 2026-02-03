'use client';

import React from 'react';
import XIcon from '@/icons/XIcon';
import { WebsiteIcon } from '@/icons/WebsiteIcon';
import TelegramIcon from '@/icons/TelegramIcon';
import { parseBackgroundPosition } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Display labels matching the creation page dropdowns
const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI',
  defi: 'DeFi',
  gaming: 'Gaming',
  infrastructure: 'Infrastructure',
  rwa: 'Real World Assets',
  social: 'Social',
  nft: 'NFT',
  dao: 'DAO',
  other: 'Other',
};

const INDUSTRY_LABELS: Record<string, string> = {
  technology: 'Technology',
  finance: 'Finance',
  entertainment: 'Entertainment',
  media: 'Media',
  ecommerce: 'E-Commerce',
  healthcare: 'Healthcare',
  energy: 'Energy',
  'real-estate': 'Real Estate',
  'supply-chain': 'Supply Chain',
  education: 'Education',
  other: 'Other',
};

const STAGE_LABELS: Record<string, string> = {
  ideation: 'Ideation',
  prototype: 'Prototype',
  mvp: 'MVP',
  beta: 'Beta',
  live: 'Live',
  scaling: 'Scaling',
};

// Category text colors - tech/innovation themed
const CATEGORY_TEXT_COLORS: Record<string, string> = {
  ai: '#c084fc', // Purple - AI/intelligence
  defi: '#4ade80', // Green - finance/money
  gaming: '#f472b6', // Pink - fun/entertainment
  infrastructure: '#9ca3af', // Gray - foundational
  rwa: '#facc15', // Yellow - real/tangible
  social: '#60a5fa', // Blue - social/community
  nft: '#fb923c', // Orange - creative/art
  dao: '#2dd4bf', // Teal - governance
  other: '#9ca3af', // Gray - default
};

// Industry text colors - sector-specific
const INDUSTRY_TEXT_COLORS: Record<string, string> = {
  technology: '#60a5fa', // Blue - tech
  finance: '#4ade80', // Green - money
  entertainment: '#f472b6', // Pink - fun
  media: '#c084fc', // Purple - content
  ecommerce: '#fb923c', // Orange - commerce
  healthcare: '#f87171', // Red - health
  energy: '#facc15', // Yellow - power
  'real-estate': '#d97706', // Amber - property
  'supply-chain': '#2dd4bf', // Teal - logistics
  education: '#818cf8', // Indigo - learning
  other: '#9ca3af', // Gray - default
};

// Stage text colors - progression from early to mature
const STAGE_TEXT_COLORS: Record<string, string> = {
  ideation: '#9ca3af', // Gray - conceptual
  prototype: '#facc15', // Yellow - building
  mvp: '#fb923c', // Orange - shipping
  beta: '#60a5fa', // Blue - testing
  live: '#4ade80', // Green - active
  scaling: '#c084fc', // Purple - growing
};

interface MetaPanelProps {
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  textBackgroundColor?: string;
  token?: {
    address?: string;
    name?: string;
    symbol?: string;
    token_type?: 'meme' | 'project';
    category?: string;
    industry?: string;
    stage?: string;
    damm_v2_pool_address?: string;
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
    description?: string;
  };
}

export function MetaPanel({
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  overlayColor,
  overlayOpacity,
  textBackgroundColor,
  token,
  baseAsset
}: MetaPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  // Helper for text background style - apply when any custom background exists (image or color)
  // Check for truthy backgroundImage (not empty string)
  const hasCustomBackground = (backgroundImage && backgroundImage.trim().length > 0) || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground ? {
    backgroundColor: `${textBackgroundColor || '#0c0c0e'}cc`,
  } : undefined;
  // Extract social links with proper fallback
  const twitterUrl = baseAsset?.twitter || token?.metadata?.twitter;
  const websiteUrl = baseAsset?.website || token?.metadata?.website;
  const telegramUrl = baseAsset?.telegram || token?.metadata?.telegram;
  // Prioritize database description over Jupiter's description
  const description = token?.metadata?.description || token?.metadata?.tagline || baseAsset?.description;

  // Helper to format Twitter URLs for display
  const formatTwitter = (url: string) => {
    const cleaned = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    // Handle x.com/i/communities/... -> Community
    if (cleaned.includes('/i/communities/')) {
      return 'Community';
    }
    // Handle x.com/username or twitter.com/username -> @username
    const match = cleaned.match(/^(?:x\.com|twitter\.com)\/([^\/]+)/);
    if (match && match[1]) {
      const username = match[1];
      if (username.length > 15) {
        return '@' + username.slice(0, 12) + '...';
      }
      return '@' + username;
    }
    return 'X';
  };

  // Check if there are social links
  const hasSocialLinks = (twitterUrl && String(twitterUrl).trim().length > 0) ||
                         (websiteUrl && String(websiteUrl).trim().length > 0) ||
                         (telegramUrl && String(telegramUrl).trim().length > 0);

  // Check if this is a project token with project details
  const isProjectToken = token?.token_type === 'project';
  const hasProjectDetails = isProjectToken && (token?.category || token?.industry || token?.stage);

  // Trading links
  const tokenAddress = token?.address;
  const jupiterUrl = tokenAddress ? `https://jup.ag/swap?sell=So11111111111111111111111111111111111111112&buy=${tokenAddress}` : null;
  const meteoraUrl = token?.damm_v2_pool_address ? `https://www.meteora.ag/dammv2/${token.damm_v2_pool_address}` : null;

  // Check for truthy backgroundImage (not empty string)
  const hasBackgroundImage = backgroundImage && backgroundImage.trim().length > 0;

  return (
    <div className="overflow-hidden relative rounded-2xl p-3 sm:p-5">
      {/* Background container - same structure as ThreadsPanel */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ zIndex: 0 }}
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
            backgroundColor: hasBackgroundImage ? 'transparent' : (backgroundColor || '#0a0a0c'),
            backgroundImage: hasBackgroundImage ? `url(${backgroundImage})` : undefined,
            backgroundSize: backgroundSize === 'repeat' ? 'auto' : (backgroundSize === 'cover' ? bgPos.size : (backgroundSize || 'cover')),
            backgroundPosition: backgroundSize === 'repeat' ? 'top left' : bgPos.position,
            backgroundRepeat: backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
            zIndex: 1,
          }}
        />
      </div>

      <div style={{ position: 'relative', zIndex: 2 }}>
        <div className="flex flex-col gap-2 sm:gap-3">
          {/* Trading Action Buttons - Buy on Jupiter, Provide LP on Meteora */}
          {jupiterUrl && (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {/* Buy on Jupiter */}
              <a
                href={jupiterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm hover:opacity-80 transition-opacity border shrink-0 ${hasCustomBackground ? 'backdrop-blur-sm' : ''}`}
                style={{
                  ...textBgStyle,
                  borderColor: '#363A40',
                  color: textColor || '#ffffff',
                }}
              >
                <img
                  src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"
                  alt="Jupiter"
                  width={12}
                  height={12}
                  className="sm:w-[14px] sm:h-[14px] shrink-0"
                />
                <span>Buy on Jup.ag</span>
              </a>
              {/* Provide LP on Meteora - only show if DAMM v2 pool address exists */}
              {meteoraUrl && (
                <a
                  href={meteoraUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm hover:opacity-80 transition-opacity border shrink-0 ${hasCustomBackground ? 'backdrop-blur-sm' : ''}`}
                  style={{
                    ...textBgStyle,
                    borderColor: '#363A40',
                    color: textColor || '#ffffff',
                  }}
                >
                  <img
                    src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"
                    alt="Meteora"
                    width={12}
                    height={12}
                    className="sm:w-[14px] sm:h-[14px] shrink-0"
                  />
                  <span>Provide LP on Meteora</span>
                </a>
              )}
            </div>
          )}

          {/* Social Links */}
          {hasSocialLinks && (
            <TooltipProvider>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {/* X/Twitter button */}
                {twitterUrl && String(twitterUrl).trim().length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={String(twitterUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm hover:opacity-80 transition-opacity border shrink-0 ${hasCustomBackground ? 'backdrop-blur-sm' : ''}`}
                        style={{
                          ...textBgStyle,
                          borderColor: '#363A40',
                          color: textColor || '#ffffff',
                        }}
                      >
                        <XIcon width={12} height={12} className="sm:w-[14px] sm:h-[14px] shrink-0" />
                        <span className="truncate">{formatTwitter(String(twitterUrl))}</span>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{String(twitterUrl)}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {/* Website button */}
                {websiteUrl && String(websiteUrl).trim().length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={String(websiteUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm hover:opacity-80 transition-opacity border shrink-0 ${hasCustomBackground ? 'backdrop-blur-sm' : ''}`}
                        style={{
                          ...textBgStyle,
                          borderColor: '#363A40',
                          color: textColor || '#ffffff',
                        }}
                      >
                        <WebsiteIcon width={12} height={12} className="sm:w-[14px] sm:h-[14px] shrink-0" />
                        <span className="truncate">Website</span>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{String(websiteUrl)}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {/* Telegram button */}
                {telegramUrl && String(telegramUrl).trim().length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={String(telegramUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm hover:opacity-80 transition-opacity border shrink-0 ${hasCustomBackground ? 'backdrop-blur-sm' : ''}`}
                        style={{
                          ...textBgStyle,
                          borderColor: '#363A40',
                          color: textColor || '#ffffff',
                        }}
                      >
                        <TelegramIcon width={12} height={12} className="sm:w-[14px] sm:h-[14px] shrink-0" />
                        <span className="truncate">Telegram</span>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{String(telegramUrl)}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          )}

          {/* Project Details - category, industry, stage tags (same gap as socials) */}
          {hasProjectDetails && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {token?.category && (
                <span
                  className="text-xs sm:text-sm shrink-0 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md bg-black/40 border border-border/50"
                  style={{ color: CATEGORY_TEXT_COLORS[token.category] || CATEGORY_TEXT_COLORS.other }}
                >
                  {CATEGORY_LABELS[token.category] || token.category}
                </span>
              )}
              {token?.industry && (
                <span
                  className="text-xs sm:text-sm shrink-0 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md bg-black/40 border border-border/50"
                  style={{ color: INDUSTRY_TEXT_COLORS[token.industry] || INDUSTRY_TEXT_COLORS.other }}
                >
                  {INDUSTRY_LABELS[token.industry] || token.industry}
                </span>
              )}
              {token?.stage && (
                <span
                  className="text-xs sm:text-sm shrink-0 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md bg-black/40 border border-border/50"
                  style={{ color: STAGE_TEXT_COLORS[token.stage] || STAGE_TEXT_COLORS.ideation }}
                >
                  {STAGE_LABELS[token.stage] || token.stage}
                </span>
              )}
            </div>
          )}

          {/* Description - always shown */}
          <div
            className={`text-sm sm:typo-body leading-relaxed text-muted-foreground ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-1.5 sm:px-3 sm:py-2 rounded-md w-fit' : ''}`}
            style={{ ...textBgStyle, ...(textColor ? { color: textColor } : {}) }}
          >
            {description && String(description).trim().length > 0
              ? description
              : 'No description'}
          </div>
        </div>
      </div>
    </div>
  );
}

