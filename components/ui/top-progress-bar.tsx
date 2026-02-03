'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface TopProgressBarProps {
  isLoading: boolean;
  onComplete?: () => void;
}

// Minimum time the progress bar should be visible (ms)
const MIN_DISPLAY_TIME = 400;

/**
 * TopProgressBar - A YouTube/GitHub-style progress bar that appears at the top of the screen.
 *
 * Animation behavior:
 * - Starts fast (0-30% in ~200ms)
 * - Slows down (30-70% in ~1.5s)
 * - Crawls slowly (70-90% asymptotically)
 * - When loading completes, quickly animates to 100% and fades out
 * - Ensures minimum visibility time so users can see the bar
 */
export function TopProgressBar({ isLoading, onComplete }: TopProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const loadingStartTimeRef = useRef<number>(0);
  const isCompletingRef = useRef(false);

  // Easing function for smooth deceleration
  const easeOutExpo = (t: number): number => {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  };

  // Complete the loading animation
  const completeLoading = useCallback(() => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Quickly complete to 100%
    setProgress(100);

    // Fade out after reaching 100%
    const fadeTimeout = setTimeout(() => {
      setOpacity(0);
    }, 200);

    // Hide completely and reset
    const hideTimeout = setTimeout(() => {
      setVisible(false);
      setProgress(0);
      setOpacity(1);
      isCompletingRef.current = false;
      onComplete?.();
    }, 500);

    return () => {
      clearTimeout(fadeTimeout);
      clearTimeout(hideTimeout);
    };
  }, [onComplete]);

  // Animate progress with smart timing
  const animate = useCallback(() => {
    const elapsed = performance.now() - startTimeRef.current;

    // Phase 1: Fast start (0-30% in 200ms)
    if (elapsed < 200) {
      const t = elapsed / 200;
      setProgress(easeOutExpo(t) * 30);
    }
    // Phase 2: Medium speed (30-70% over 1.5s)
    else if (elapsed < 1700) {
      const t = (elapsed - 200) / 1500;
      setProgress(30 + easeOutExpo(t) * 40);
    }
    // Phase 3: Slow crawl (70-90% asymptotically)
    else {
      const t = (elapsed - 1700) / 8000; // 8 seconds to reach ~90%
      const crawl = Math.min(t, 1);
      setProgress(70 + easeOutExpo(crawl) * 20);
    }

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  // Handle loading state changes
  useEffect(() => {
    // Started loading
    if (isLoading && !visible && !isCompletingRef.current) {
      setVisible(true);
      setOpacity(1);
      setProgress(0);
      startTimeRef.current = performance.now();
      loadingStartTimeRef.current = performance.now();
      animationRef.current = requestAnimationFrame(animate);
    }
    // Finished loading
    else if (!isLoading && visible && !isCompletingRef.current) {
      // Calculate how long we've been showing the bar
      const elapsedTime = performance.now() - loadingStartTimeRef.current;
      const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

      // Wait for minimum display time before completing
      if (remainingTime > 0) {
        const timeout = setTimeout(() => {
          completeLoading();
        }, remainingTime);
        return () => clearTimeout(timeout);
      } else {
        completeLoading();
      }
    }

    return () => {
      if (animationRef.current && !isLoading) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isLoading, visible, animate, completeLoading]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none"
      style={{
        opacity,
        transition: 'opacity 200ms ease-out'
      }}
    >
      {/* Progress bar */}
      <div
        className="h-full bg-primary"
        style={{
          width: `${progress}%`,
          transition: progress === 100 ? 'width 200ms ease-out' : 'none',
          boxShadow: '0 0 10px rgba(0, 235, 47, 0.7), 0 0 5px rgba(0, 235, 47, 0.5)'
        }}
      />
    </div>
  );
}
