'use client';

import { useState, memo, useMemo, useEffect, useRef } from 'react';
import { cn, getOptimizedImageUrl } from '@/lib/utils';

interface TokenImageProps {
  src: string | null | undefined;
  alt: string;
  fallbackText: string;
  size?: number;
  className?: string;
  /** Load immediately without lazy loading (for above-the-fold images) */
  priority?: boolean;
}

// Global cache to track which images have been loaded
// This prevents flashing when components remount with same src
const loadedImages = new Set<string>();

/**
 * Optimized token image component
 * - CDN optimization via wsrv.nl (resizing, WebP/AVIF, edge caching)
 * - Skeleton loading state for visual feedback
 * - Lazy loading by default (use priority=true for above-fold)
 * - Graceful fallback on error
 * - Memoized to prevent unnecessary re-renders
 * - Global cache prevents flashing on remount
 */
export const TokenImage = memo(function TokenImage({
  src,
  alt,
  fallbackText,
  size = 40,
  className,
  priority = false,
}: TokenImageProps) {
  // Get optimized CDN URL for the exact size needed
  const optimizedSrc = useMemo(
    () => getOptimizedImageUrl(src, size),
    [src, size]
  );

  // Check if this image was already loaded (prevents flash on remount)
  const imageUrl = optimizedSrc || src;
  const wasAlreadyLoaded = imageUrl ? loadedImages.has(imageUrl) : false;

  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(!wasAlreadyLoaded);
  const [cdnFailed, setCdnFailed] = useState(false);

  // Track the current src to detect changes
  const prevSrcRef = useRef(src);

  // Reset state only when src actually changes
  useEffect(() => {
    if (prevSrcRef.current !== src) {
      prevSrcRef.current = src;
      const newImageUrl = getOptimizedImageUrl(src, size) || src;
      const alreadyLoaded = newImageUrl ? loadedImages.has(newImageUrl) : false;
      setIsLoading(!alreadyLoaded);
      setHasError(false);
      setCdnFailed(false);
    }
  }, [src, size]);

  // Fallback to original if CDN fails
  const imageSrc = cdnFailed ? src : optimizedSrc;
  const showFallback = !src || hasError;

  return (
    <div
      className={cn(
        'rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 relative',
        className
      )}
      style={{ width: size, height: size }}
    >
      {!showFallback && imageSrc ? (
        <>
          {/* Skeleton loading state */}
          {isLoading && (
            <div className="absolute inset-0 bg-muted animate-pulse rounded-full" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={alt}
            width={size}
            height={size}
            className={cn(
              'w-full h-full object-cover transition-opacity duration-200',
              isLoading ? 'opacity-0' : 'opacity-100'
            )}
            onLoad={() => {
              // Add to global cache so remounts don't flash
              if (imageSrc) {
                loadedImages.add(imageSrc);
              }
              setIsLoading(false);
            }}
            onError={() => {
              // If CDN failed, try original URL
              if (!cdnFailed && optimizedSrc !== src) {
                setCdnFailed(true);
                setIsLoading(true);
              } else {
                setHasError(true);
                setIsLoading(false);
              }
            }}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
          />
        </>
      ) : (
        <span className="text-xs font-semibold">{fallbackText}</span>
      )}
    </div>
  );
});
