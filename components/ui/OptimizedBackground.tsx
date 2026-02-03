'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { decode } from 'blurhash';

interface OptimizedBackgroundProps {
  /** The background image URL */
  src?: string;
  /** Blurhash string for blur placeholder */
  blurhash?: string;
  /** Background color fallback */
  backgroundColor?: string;
  /** Background size mode */
  backgroundSize?: 'cover' | 'contain' | 'repeat' | string;
  /** Background position */
  backgroundPosition?: string;
  /** Overlay color */
  overlayColor?: string;
  /** Overlay opacity (0-1) */
  overlayOpacity?: number;
  /** Additional class names */
  className?: string;
  /** Whether to lazy load (default: true) */
  lazy?: boolean;
  /** Whether this is a priority image that should preload */
  priority?: boolean;
  /** Children to render above the background */
  children?: React.ReactNode;
  /** Blur amount in pixels (for pixelated canvas images) */
  blur?: number;
}

/**
 * Decode blurhash to a data URL for use as placeholder
 */
function decodeBlurhashToDataURL(blurhash: string, width = 32, height = 32): string {
  try {
    const pixels = decode(blurhash, width, height);

    // Create canvas and draw pixels
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL();
  } catch {
    return '';
  }
}

/**
 * OptimizedBackground - A performant background image component
 *
 * Features:
 * - Lazy loading with Intersection Observer
 * - Blurhash placeholder for instant visual feedback
 * - Smooth fade-in transition when image loads
 * - Priority loading option for above-the-fold content
 */
export function OptimizedBackground({
  src,
  blurhash,
  backgroundColor,
  backgroundSize = 'cover',
  backgroundPosition = 'center',
  overlayColor,
  overlayOpacity,
  className = '',
  lazy = true,
  priority = false,
  children,
  blur,
}: OptimizedBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(!lazy || priority);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Decode blurhash to data URL (memoized)
  const placeholderUrl = useMemo(() => {
    if (!blurhash || typeof window === 'undefined') return '';
    return decodeBlurhashToDataURL(blurhash);
  }, [blurhash]);

  // Set up Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazy || priority || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '200px', // Start loading 200px before visible
        threshold: 0,
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [lazy, priority]);

  // Preload image when visible
  useEffect(() => {
    if (!isVisible || !src || isLoaded) return;

    const img = new Image();
    img.onload = () => setIsLoaded(true);
    img.onerror = () => setHasError(true);
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [isVisible, src, isLoaded]);

  // Calculate background styles
  const bgSizeStyle = useMemo(() => {
    if (backgroundSize === 'repeat') {
      return {
        backgroundSize: 'auto',
        backgroundRepeat: 'repeat',
      };
    }
    return {
      backgroundSize: backgroundSize,
      backgroundRepeat: 'no-repeat',
    };
  }, [backgroundSize]);

  const showPlaceholder = !isLoaded && placeholderUrl && !hasError;
  const showImage = isVisible && src && !hasError;

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 rounded-2xl pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
    >
      {/* Base background color */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          backgroundColor: backgroundColor || 'transparent',
          zIndex: 0,
        }}
      />

      {/* Blurhash placeholder - shows immediately */}
      {showPlaceholder && (
        <div
          className="absolute inset-0 rounded-2xl transition-opacity duration-300"
          style={{
            backgroundImage: `url(${placeholderUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: isLoaded ? 0 : 1,
            zIndex: 1,
          }}
        />
      )}

      {/* Actual background image - fades in when loaded */}
      {showImage && (
        <div
          className="absolute inset-0 rounded-2xl transition-opacity duration-500 overflow-hidden"
          style={{
            opacity: isLoaded ? 1 : 0,
            zIndex: 2,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${src})`,
              ...bgSizeStyle,
              backgroundPosition: backgroundPosition,
              filter: blur ? `blur(${blur}px)` : undefined,
              // Scale up slightly when blurred to prevent edge artifacts
              transform: blur ? 'scale(1.1)' : undefined,
            }}
          />
        </div>
      )}

      {/* Overlay */}
      {overlayColor && overlayOpacity !== undefined && overlayOpacity > 0 && (
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            backgroundColor: overlayColor,
            opacity: overlayOpacity,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Children content */}
      {children && (
        <div className="relative" style={{ zIndex: 4 }}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Hook to preload an image in the document head
 * Use for critical above-the-fold background images
 */
export function usePreloadImage(src: string | undefined) {
  useEffect(() => {
    if (!src || typeof window === 'undefined') return;

    // Check if already preloaded
    const existing = document.querySelector(`link[href="${src}"]`);
    if (existing) return;

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    document.head.appendChild(link);

    return () => {
      // Don't remove - keep preloaded for potential reuse
    };
  }, [src]);
}
