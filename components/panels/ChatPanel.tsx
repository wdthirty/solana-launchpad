'use client';

import React from 'react';
import { MessageSquare } from 'lucide-react';

interface ChatPanelProps {
  title?: string;
  memberCount?: number;
  onJoin?: () => void;
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
}

export function ChatPanel({ 
  title = 'TOKEN chat',
  memberCount = 1,
  onJoin,
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize
}: ChatPanelProps) {
  return (
    <div className="overflow-hidden h-full w-full" style={{ 
      backgroundColor: backgroundImage ? 'transparent' : (backgroundColor || '#24262B'), 
      backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
      backgroundSize: backgroundSize === 'repeat' ? 'auto' : (backgroundSize || 'cover'),
      backgroundPosition: backgroundSize === 'repeat' ? 'top left' : 'center',
      backgroundRepeat: backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
      borderRadius: '8px', 
      padding: '12px 16px' 
    }}>
      <div className="flex items-center justify-between">
        {/* Left Side - Icon and Text */}
        <div className="flex items-center gap-3">
          {/* Token Logo Circle */}
          <div 
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ 
              width: '48px',
              height: '48px',
              backgroundColor: '#5AC8FA'
            }}
          >
            <span className="text-white font-bold text-base" style={{ letterSpacing: '0.5px' }}>
              OF
            </span>
          </div>
          
          {/* Text Content */}
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-base" style={{ color: textColor || '#ffffff' }}>
              {title}
            </span>
            <span className="text-sm" style={{ color: textColor ? `${textColor}AA` : '#8b949e' }}>
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        
        {/* Right Side - Join Button */}
        <button
          onClick={onJoin}
          className="flex items-center gap-2 px-4 py-2 rounded-md hover:opacity-80 transition-opacity cursor-pointer"
          style={{
            backgroundColor: '#363A40',
            color: textColor || '#ffffff'
          }}
        >
          <MessageSquare size={14} />
          <span className="text-sm font-medium">Join chat</span>
        </button>
      </div>
    </div>
  );
}

