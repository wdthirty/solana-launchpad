'use client';

import React, { useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings } from 'lucide-react';
import { parseBackgroundPosition } from '@/lib/utils';

interface VideoPanelProps {
  videoUrl?: string;
  title?: string;
  description?: string;
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  videoSize?: 'full' | 'square';
}

export function VideoPanel({
  videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  title = 'Sample Video',
  description = 'This is a sample video description',
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  overlayColor,
  overlayOpacity,
  videoSize = 'full'
}: VideoPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoRef.current) {
      const time = parseFloat(e.target.value);
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoRef.current) {
      const newVolume = parseFloat(e.target.value);
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="rounded-lg overflow-hidden relative"
      style={{ 
        color: textColor,
        minHeight: '400px'
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
            backgroundColor: backgroundImage ? 'transparent' : (backgroundColor || '#24262B'),
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
            backgroundSize: backgroundSize === 'repeat' ? 'auto' : (backgroundSize === 'cover' ? bgPos.size : (backgroundSize || 'cover')),
            backgroundPosition: backgroundSize === 'repeat' ? 'top left' : bgPos.position,
            backgroundRepeat: backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
            zIndex: 1,
          }}
        />
      </div>
      <div className="relative" style={{ zIndex: 2 }}>
      {/* Video Header */}
      <div className="p-4 border-b" style={{ borderColor: '#1A1B1F' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-lg" style={{ color: textColor || '#ffffff' }}>
            {title}
          </h3>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded hover:bg-gray-700 transition-colors cursor-pointer">
              <Settings size={16} style={{ color: '#8b949e' }} />
            </button>
            <button className="p-2 rounded hover:bg-gray-700 transition-colors cursor-pointer">
              <Maximize size={16} style={{ color: '#8b949e' }} />
            </button>
          </div>
        </div>
        <p className="text-sm" style={{ color: textColor ? `${textColor}CC` : '#8b949e' }}>
          {description}
        </p>
      </div>

      {/* Video Container */}
      <div className={`relative bg-black ${videoSize === 'square' ? 'flex justify-center' : ''}`}>
        <video
          ref={videoRef}
          className={`${videoSize === 'square' ? 'w-80 h-80 object-cover rounded-lg' : 'w-full h-64 object-cover'}`}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          poster="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjI0MCIgdmlld0JveD0iMCAwIDQwMCAyNDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMjQwIiBmaWxsPSIjMUExQjFGIi8+CjxwYXRoIGQ9Ik0xODAgMTIwTDIyMCAxNDBMMTgwIDE2MFYxMjBaIiBmaWxsPSIjMzRDNzU5Ii8+Cjwvc3ZnPgo="
        >
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        {/* Play/Pause Overlay */}
        <div className={`absolute ${videoSize === 'square' ? 'inset-0' : 'inset-0'} flex items-center justify-center bg-black bg-opacity-30`}>
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-white bg-opacity-90 flex items-center justify-center hover:bg-opacity-100 transition-all cursor-pointer"
          >
            {isPlaying ? (
              <Pause size={24} style={{ color: '#000' }} />
            ) : (
              <Play size={24} style={{ color: '#000' }} className="ml-1" />
            )}
          </button>
        </div>

        {/* Video Controls */}
        <div className={`absolute bottom-0 ${videoSize === 'square' ? 'left-0 right-0' : 'left-0 right-0'} bg-gradient-to-t from-black to-transparent p-4`}>
          {/* Progress Bar */}
          <div className="mb-3">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #34C759 0%, #34C759 ${(currentTime / duration) * 100}%, #4A4A4A ${(currentTime / duration) * 100}%, #4A4A4A 100%)`
              }}
            />
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="p-2 rounded hover:bg-gray-700 transition-colors cursor-pointer"
              >
                {isPlaying ? (
                  <Pause size={20} style={{ color: '#ffffff' }} />
                ) : (
                  <Play size={20} style={{ color: '#ffffff' }} />
                )}
              </button>

              <button
                onClick={toggleMute}
                className="p-2 rounded hover:bg-gray-700 transition-colors cursor-pointer"
              >
                {isMuted ? (
                  <VolumeX size={20} style={{ color: '#ffffff' }} />
                ) : (
                  <Volume2 size={20} style={{ color: '#ffffff' }} />
                )}
              </button>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs text-white">{Math.round(volume * 100)}%</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-white">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Video Info */}
      <div className="p-4">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span style={{ color: '#8b949e' }}>Views:</span>
            <span style={{ color: textColor || '#ffffff' }}>1.2K</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: '#8b949e' }}>Likes:</span>
            <span style={{ color: textColor || '#ffffff' }}>89</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: '#8b949e' }}>Duration:</span>
            <span style={{ color: textColor || '#ffffff' }}>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
