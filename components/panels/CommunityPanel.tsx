'use client';

import { Send, Globe } from 'lucide-react';
import { parseBackgroundPosition } from '@/lib/utils';

export interface CommunityPanelProps {
  backgroundColor?: string;
  textColor?: string;
  telegramLink?: string;
  twitterLink?: string;
  websiteLink?: string;
  viewOnAdvancedLink?: string;
  tradeOnMexcLink?: string;
  description?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  overlayColor?: string;
  overlayOpacity?: number;
}

export function CommunityPanel({
  backgroundColor = '#24262B',
  textColor = '#ffffff',
  telegramLink = 'example_telegram',
  twitterLink = 'example_token',
  websiteLink = 'example.com',
  viewOnAdvancedLink = '#',
  description = 'This is an example token description for preview purposes.',
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  overlayColor,
  overlayOpacity,
}: CommunityPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  return (
    <div 
      className="p-6 rounded-lg relative"
      style={{ 
        color: textColor,
        minHeight: '200px'
      }}
    >
      {/* Background container */}
      <div
        className="absolute inset-0 rounded-lg"
        style={{
          zIndex: 0,
        }}
      >
        {/* Overlay - child above background */}
        {overlayColor && overlayOpacity !== undefined && overlayOpacity > 0 && (
          <div
            className="absolute inset-0 rounded-lg"
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
          className="absolute inset-0 rounded-lg"
          style={{
            backgroundColor: backgroundImage ? 'transparent' : backgroundColor,
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
            backgroundSize: backgroundSize === 'repeat' ? 'auto' : (backgroundSize === 'cover' ? bgPos.size : (backgroundSize || 'cover')),
            backgroundPosition: backgroundSize === 'repeat' ? 'top left' : bgPos.position,
            backgroundRepeat: backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
            zIndex: 1,
          }}
        />
      </div>
      <div className="relative" style={{ zIndex: 2 }}>
      {/* Header with branded tags and external links */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        {/* Left: Branded Tags */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Telegram */}
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            <Send size={16} color={textColor} />
            <span style={{ color: textColor, fontSize: '14px' }}>{telegramLink}</span>
          </div>
          
          {/* Twitter */}
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill={textColor} />
            </svg>
            <span style={{ color: textColor, fontSize: '14px' }}>{twitterLink}</span>
          </div>
          
          {/* Website */}
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            <Globe size={16} color={textColor} />
            <span style={{ color: textColor, fontSize: '14px' }}>{websiteLink}</span>
          </div>
        </div>
        
        {/* Right: External Links */}
        <div className="flex items-center gap-4">
          <a 
            href={viewOnAdvancedLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2"
            style={{ color: textColor, fontSize: '14px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 2h18c.552 0 1 .448 1 1v18c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1zm2 2v2H4V4h1zm13 0v2h-1V4h1zm-3 2v2h-1V6h1zM6 6v2H5V6h1zm-3 3v2H2V9h1zm17 0v2h-1V9h1zm-2 3v2h-1v-2h1zM7 12v2H6v-2h1zm11 0v2h-1v-2h1zM5 15v2H4v-2h1zm11 0v2h-1v-2h1zm-5 0v2h-1v-2h1zM6 4h1v1H6V4zm13 0h1v1h-1V4zm-3 4h1v1h-1V8zM6 8h1v1H6V8zM2 9h1v1H2V9zm19 0h1v1h-1V9zm-3 5h1v1h-1v-1zM7 14h1v1H7v-1zm11 0h1v1h-1v-1zM8 16h1v1H8v-1zm9 0h1v1h-1v-1zm-6 0h1v1h-1v-1zM3 4h1v1H3V4zm0 16h18V6H3v14zM15 8h1v1h-1V8zM8 8h1v1H8V8zM2 11h1v1H2v-1zm19 0h1v1h-1v-1zm-4 5h1v1h-1v-1zM7 16h1v1H7v-1zm11 0h1v1h-1v-1zm-6 0h1v1h-1v-1zm-4-2h1v1h-1v-1zm9 0h1v1h-1v-1z" 
                  fill={textColor}
                />
            </svg>
            View on Advanced
          </a>
        </div>
      </div>
      
      {/* Description */}
      <div style={{ color: textColor, fontSize: '15px', lineHeight: '1.5' }}>
        {description}
        <span style={{ color: `${textColor}CC`, cursor: 'pointer' }}> more</span>
      </div>
      </div>
    </div>
  );
}
