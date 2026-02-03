'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Intercom from '@intercom/messenger-js-sdk';

export function IntercomProvider() {
  const pathname = usePathname();

  useEffect(() => {
    // Only show Intercom on the main token feed page
    const isMainPage = pathname === '/';

    if (isMainPage) {
      // Check if mobile (matches md:hidden breakpoint)
      const isMobile = window.matchMedia('(max-width: 767px)').matches;
      const mobileVerticalPadding = 80;

      Intercom({
        app_id: 'krr0ik3r',
        // Add vertical padding on mobile to avoid covering bottom nav (h-16 = 64px + safe area)
        vertical_padding: isMobile ? mobileVerticalPadding : 20,
      });

      // On mobile, inject CSS to force Intercom launcher position
      // This overrides Intercom's inline styles that reset after closing the messenger
      // Target the wrapper div and iframe inside #intercom-container
      if (isMobile) {
        const styleId = 'intercom-mobile-position-fix';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            #intercom-container .intercom-app > div:last-child,
            #intercom-container [class*="intercom-with-namespace"]:has(.intercom-launcher-frame),
            .intercom-launcher-frame {
              bottom: ${mobileVerticalPadding}px !important;
            }
          `;
          document.head.appendChild(style);
        }
      }
    } else {
      // Hide Intercom on other pages
      if (window.Intercom) {
        window.Intercom('shutdown');
      }
    }

    // Cleanup
    return () => {
      const style = document.getElementById('intercom-mobile-position-fix');
      if (style && pathname !== '/') {
        style.remove();
      }
    };
  }, [pathname]);

  return null;
}
