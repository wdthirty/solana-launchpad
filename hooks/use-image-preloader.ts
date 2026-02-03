'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface PreloadState {
  isLoading: boolean;
  loadedCount: number;
  totalCount: number;
  progress: number;
  isComplete: boolean;
}

/**
 * Hook to preload multiple images in parallel
 * Returns loading state that becomes false when all images are loaded (or failed)
 * Images that fail to load are silently ignored to prevent blocking
 */
export function useImagePreloader(imageUrls: (string | undefined | null)[]): PreloadState {
  const [state, setState] = useState<PreloadState>({
    isLoading: true,
    loadedCount: 0,
    totalCount: 0,
    progress: 0,
    isComplete: false,
  });

  // Track if component is mounted to avoid state updates after unmount
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Filter out undefined/null/empty URLs
    const validUrls = imageUrls.filter((url): url is string =>
      typeof url === 'string' && url.length > 0
    );

    // If no images to load, mark as complete immediately
    if (validUrls.length === 0) {
      setState({
        isLoading: false,
        loadedCount: 0,
        totalCount: 0,
        progress: 100,
        isComplete: true,
      });
      return;
    }

    setState({
      isLoading: true,
      loadedCount: 0,
      totalCount: validUrls.length,
      progress: 0,
      isComplete: false,
    });

    let loadedCount = 0;

    const preloadImage = (url: string): Promise<void> => {
      return new Promise((resolve) => {
        const img = new Image();

        const handleLoad = () => {
          loadedCount++;
          if (isMounted.current) {
            setState(prev => ({
              ...prev,
              loadedCount,
              progress: Math.round((loadedCount / validUrls.length) * 100),
            }));
          }
          resolve();
        };

        const handleError = () => {
          // Still count as "loaded" to not block on failed images
          loadedCount++;
          if (isMounted.current) {
            setState(prev => ({
              ...prev,
              loadedCount,
              progress: Math.round((loadedCount / validUrls.length) * 100),
            }));
          }
          resolve();
        };

        img.onload = handleLoad;
        img.onerror = handleError;
        img.src = url;

        // If image is already cached, onload fires synchronously in some browsers
        if (img.complete) {
          handleLoad();
        }
      });
    };

    // Preload all images in parallel
    Promise.all(validUrls.map(preloadImage)).then(() => {
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isComplete: true,
        }));
      }
    });

    // Cleanup: nothing to clean up since Image objects will be GC'd
  }, [JSON.stringify(imageUrls)]); // Serialize to detect actual URL changes

  return state;
}

/**
 * Extracts all background image URLs from a token page layout
 */
export function extractLayoutImageUrls(layout: {
  panels?: Array<{
    customization?: {
      backgroundImage?: string;
    };
  }>;
  style?: {
    backgroundImage?: string;
  };
} | null | undefined): string[] {
  if (!layout) return [];

  const urls: string[] = [];

  // Canvas/page background
  if (layout.style?.backgroundImage) {
    urls.push(layout.style.backgroundImage);
  }

  // Panel backgrounds
  if (layout.panels) {
    for (const panel of layout.panels) {
      if (panel.customization?.backgroundImage) {
        urls.push(panel.customization.backgroundImage);
      }
    }
  }

  return urls;
}
