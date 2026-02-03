'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { TopNavBar } from './TopNavBar';
import { MobileBottomNav } from './MobileBottomNav';
import { Footer } from './Footer';
import { FloatingWalletButton } from './FloatingWalletButton';

// Routes that should render without nav/footer (full-screen pages)
const FULL_SCREEN_ROUTES: string[] = [];

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isFullScreen = FULL_SCREEN_ROUTES.some(route => pathname?.startsWith(route));

  if (isFullScreen) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <TopNavBar />
      <FloatingWalletButton />
      <main className="pt-20 flex-1">
        {children}
      </main>
      <MobileBottomNav />
      <Footer />
    </div>
  );
}
