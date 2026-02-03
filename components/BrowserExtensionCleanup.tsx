// BrowserExtensionCleanup Component
// Removes browser extension attributes that cause hydration mismatches
// Created: 2025-01-XX

'use client';

import { useEffect } from 'react';

/**
 * Component that removes browser extension attributes after hydration
 * This prevents hydration mismatches caused by extensions modifying the DOM
 */
export function BrowserExtensionCleanup() {
  useEffect(() => {
    // Common browser extension attributes that modify the DOM
    const extensionAttributes = [
      'bis_skin_checked',
      'bis_size',
      'bis_id',
      'data-new-gr-c-s-check-loaded',
      'data-gr-ext-installed',
    ];

    // Remove extension attributes from all elements
    const removeExtensionAttributes = () => {
      extensionAttributes.forEach((attr) => {
        const elements = document.querySelectorAll(`[${attr}]`);
        elements.forEach((el) => {
          el.removeAttribute(attr);
        });
      });
    };

    // Remove extension-injected scripts from head
    const removeExtensionScripts = () => {
      const scripts = document.head.querySelectorAll('script');
      scripts.forEach((script) => {
        // Check if script is from a browser extension (has chrome-extension:// or moz-extension:// in src)
        if (script.src && (script.src.includes('chrome-extension://') || script.src.includes('moz-extension://'))) {
          // Don't remove it, but we can suppress hydration warnings for it
          script.setAttribute('data-extension-script', 'true');
        }
        // Remove scripts with undefined id (often from extensions)
        if (script.id === 'undefined') {
          script.remove();
        }
      });
    };

    // Use MutationObserver to watch for attributes being added
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          const target = mutation.target as Element;
          extensionAttributes.forEach((attr) => {
            if (target.hasAttribute(attr)) {
              target.removeAttribute(attr);
            }
          });
        } else if (mutation.type === 'childList') {
          // Check newly added nodes
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              extensionAttributes.forEach((attr) => {
                if (element.hasAttribute(attr)) {
                  element.removeAttribute(attr);
                }
              });
              // Also check descendants
              extensionAttributes.forEach((attr) => {
                const descendants = element.querySelectorAll(`[${attr}]`);
                descendants.forEach((el) => {
                  el.removeAttribute(attr);
                });
              });
            }
          });
        }
      });
    });

    // Start observing the entire document
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: extensionAttributes,
      childList: true,
      subtree: true,
    });

    // Also observe head for extension scripts
    const headObserver = new MutationObserver(() => {
      removeExtensionScripts();
    });

    headObserver.observe(document.head, {
      childList: true,
      subtree: true,
    });

    // Initial cleanup
    removeExtensionAttributes();
    removeExtensionScripts();

    // Periodic cleanup as a fallback
    const interval = setInterval(() => {
      removeExtensionAttributes();
      removeExtensionScripts();
    }, 1000);

    return () => {
      observer.disconnect();
      headObserver.disconnect();
      clearInterval(interval);
    };
  }, []);

  return null;
}

