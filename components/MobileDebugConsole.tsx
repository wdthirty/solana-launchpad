'use client';

import { useEffect } from 'react';

/**
 * Mobile Debug Console
 *
 * Adds eruda (mobile DevTools) to the page for debugging on mobile devices.
 * Only loads in development or when ?debug=true is in the URL.
 *
 * Usage: Add <MobileDebugConsole /> to your layout
 * Access: Tap the floating button in bottom-right corner
 */
export function MobileDebugConsole() {
  useEffect(() => {
    // Only load in development or when debug param is present
    const isDev = process.env.NODE_ENV === 'development';
    const hasDebugParam = typeof window !== 'undefined' && window.location.search.includes('debug=true');

    if (!isDev && !hasDebugParam) return;

    // Load eruda script
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/eruda';
    script.onload = () => {
      // @ts-ignore
      if (window.eruda) {
        // @ts-ignore
        window.eruda.init();
        console.log('[MobileDebugConsole] Eruda initialized - tap the icon in bottom-right to open console');
      }
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return null;
}
