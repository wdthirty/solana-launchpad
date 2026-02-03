'use client';

import Link, { LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, ReactNode, MouseEvent } from 'react';
import { useNavigationProgress } from '@/contexts/NavigationProgressContext';

interface ProgressLinkProps extends LinkProps {
  children: ReactNode;
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  [key: string]: any;
}

/**
 * ProgressLink - A drop-in replacement for Next.js Link that triggers the progress bar.
 * Use this instead of <Link> to get automatic progress bar integration.
 */
export const ProgressLink = forwardRef<HTMLAnchorElement, ProgressLinkProps>(
  ({ children, onClick, href, ...props }, ref) => {
    const { startLoading } = useNavigationProgress();

    const handleClick = useCallback(
      (e: MouseEvent<HTMLAnchorElement>) => {
        // Don't trigger for external links, new tabs, or modified clicks
        const isModifiedEvent = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
        const isNewTab = props.target === '_blank';
        const isExternal = typeof href === 'string' && (href.startsWith('http') || href.startsWith('//'));

        if (!isModifiedEvent && !isNewTab && !isExternal) {
          startLoading();
        }

        onClick?.(e);
      },
      [startLoading, onClick, href, props.target]
    );

    return (
      <Link ref={ref} href={href} onClick={handleClick} {...props}>
        {children}
      </Link>
    );
  }
);

ProgressLink.displayName = 'ProgressLink';

/**
 * useProgressRouter - A hook that wraps useRouter with progress bar integration.
 * Use router.push() from this hook to automatically trigger the progress bar.
 */
export function useProgressRouter() {
  const router = useRouter();
  const { startLoading } = useNavigationProgress();

  const push = useCallback(
    (href: string, options?: { scroll?: boolean }) => {
      startLoading();
      router.push(href, options);
    },
    [router, startLoading]
  );

  const replace = useCallback(
    (href: string, options?: { scroll?: boolean }) => {
      startLoading();
      router.replace(href, options);
    },
    [router, startLoading]
  );

  return {
    ...router,
    push,
    replace,
  };
}
