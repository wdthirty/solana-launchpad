'use client';

import { useEffect, useRef, Suspense, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { TopProgressBar } from '@/components/ui/top-progress-bar';
import { useNavigationProgress } from '@/contexts/NavigationProgressContext';

/**
 * NavigationProgressInner - Handles route change detection
 *
 * This component intercepts navigation in multiple ways:
 * 1. Link clicks (anchor tags) - BEFORE Next.js handles them
 * 2. History API (pushState/replaceState) - catches router.push/replace
 * 3. Popstate events (browser back/forward)
 */
function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoading, startLoading, stopLoading } = useNavigationProgress();
  const isNavigatingRef = useRef(false);
  const currentUrlRef = useRef('');
  const hasInitializedRef = useRef(false);

  // Get current full URL for comparison
  const getCurrentUrl = useCallback(() => {
    return pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
  }, [pathname, searchParams]);

  // Initialize and update current URL ref
  useEffect(() => {
    const newUrl = getCurrentUrl();

    // On initial mount, just set the URL without triggering stop
    if (!hasInitializedRef.current) {
      currentUrlRef.current = newUrl;
      hasInitializedRef.current = true;
      return;
    }

    // URL has changed - stop loading
    if (newUrl !== currentUrlRef.current) {
      currentUrlRef.current = newUrl;

      // Stop loading after a small delay to ensure new page renders
      const timeout = setTimeout(() => {
        stopLoading();
        isNavigatingRef.current = false;
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [getCurrentUrl, stopLoading]);

  // Intercept all link clicks FIRST - this is the most reliable method
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');

      if (!anchor) return;

      // Skip if clicking on a button or element inside the link that should not trigger navigation
      // This handles cases like watchlist buttons inside token cards
      const clickedButton = target.closest('button');
      if (clickedButton && anchor.contains(clickedButton)) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Skip external links
      if (href.startsWith('http') || href.startsWith('//')) return;

      // Skip hash links (same page anchors)
      if (href.startsWith('#')) return;

      // Skip download links
      if (anchor.hasAttribute('download')) return;

      // Skip target="_blank"
      if (anchor.target === '_blank') return;

      // Skip if any modifier keys are pressed (opens in new tab)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Skip javascript: links
      if (href.startsWith('javascript:')) return;

      // Skip mailto: and tel: links
      if (href.startsWith('mailto:') || href.startsWith('tel:')) return;

      // Normalize the href for comparison
      const normalizedHref = href.startsWith('/') ? href : '/' + href;
      const currentPath = currentUrlRef.current || window.location.pathname + window.location.search;

      // Skip if navigating to exact same URL
      if (normalizedHref === currentPath) {
        return;
      }

      // Skip if navigating to home page
      if (normalizedHref === '/' || normalizedHref === '') {
        return;
      }

      // Skip if only query params changed on the same path (e.g., profile tab changes)
      const normalizedPathOnly = normalizedHref.split('?')[0];
      const currentPathOnly = currentPath.split('?')[0];
      if (normalizedPathOnly === currentPathOnly) {
        return;
      }

      // Start loading immediately
      isNavigatingRef.current = true;
      startLoading();
    };

    // Use capture phase to intercept BEFORE Next.js handles the click
    document.addEventListener('click', handleClick, { capture: true });

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [startLoading]);

  // Intercept History API as backup (catches router.push, router.replace)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Store original methods
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    // Helper to extract path from URL
    const getPathFromUrl = (url: string | URL | null | undefined): string | null => {
      if (!url) return null;
      try {
        const urlString = url.toString();
        if (urlString.startsWith('/')) {
          return urlString;
        }
        const parsed = new URL(urlString, window.location.origin);
        return parsed.pathname + parsed.search;
      } catch {
        return null;
      }
    };

    // Helper to check if path is home page
    const isHomePage = (path: string | null): boolean => {
      if (!path) return false;
      const pathOnly = path.split('?')[0];
      return pathOnly === '/' || pathOnly === '';
    };

    // Helper to check if this is just a query param change on the same path (e.g., profile tab changes)
    const isSamePathQueryChange = (newPath: string | null, currentPath: string): boolean => {
      if (!newPath) return false;
      const newPathOnly = newPath.split('?')[0];
      const currentPathOnly = currentPath.split('?')[0];
      return newPathOnly === currentPathOnly;
    };

    // Override pushState
    history.pushState = function(state, title, url) {
      const newPath = getPathFromUrl(url);
      const currentPath = currentUrlRef.current || window.location.pathname + window.location.search;

      // Skip home page navigation
      if (newPath && newPath !== currentPath && !isNavigatingRef.current && !isHomePage(newPath)) {
        isNavigatingRef.current = true;
        // Defer to avoid React state update during render
        setTimeout(() => startLoading(), 0);
      }
      return originalPushState(state, title, url);
    };

    // Override replaceState
    history.replaceState = function(state, title, url) {
      const newPath = getPathFromUrl(url);
      const currentPath = currentUrlRef.current || window.location.pathname + window.location.search;

      // Skip home page navigation and same-path query changes (e.g., profile tab changes)
      if (newPath && newPath !== currentPath && !isNavigatingRef.current && !isHomePage(newPath) && !isSamePathQueryChange(newPath, currentPath)) {
        isNavigatingRef.current = true;
        // Defer to avoid React state update during render
        setTimeout(() => startLoading(), 0);
      }
      return originalReplaceState(state, title, url);
    };

    // Handle browser back/forward buttons
    const handlePopState = () => {
      if (!isNavigatingRef.current) {
        isNavigatingRef.current = true;
        startLoading();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      // Restore original methods
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', handlePopState);
    };
  }, [startLoading]);

  // Safety timeout - if navigation takes too long, stop the loader
  useEffect(() => {
    if (!isLoading) return;

    const safetyTimeout = setTimeout(() => {
      stopLoading();
      isNavigatingRef.current = false;
    }, 8000); // 8 second max

    return () => clearTimeout(safetyTimeout);
  }, [isLoading, stopLoading]);

  return <TopProgressBar isLoading={isLoading} />;
}

/**
 * NavigationProgress - The main component to add to your layout.
 * Wraps in Suspense because useSearchParams needs it.
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
