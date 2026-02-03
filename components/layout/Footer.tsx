'use client';

import Link from 'next/link';
import { Mail } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="w-full py-6 mt-auto pb-36 md:pb-6 bg-[#0a0a0a]">
      <div className="w-full max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 typo-caption font-normal text-muted-foreground">
          <span>© Launchpad {currentYear}</span>
          <a href="https://x.com/launchpadfun" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground/80 transition-colors">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <a href="mailto:support@launchpad.fun" className="hover:text-muted-foreground/80 transition-colors">
            <Mail className="w-3 h-3" />
          </a>
        </div>
                <nav className="flex items-center gap-3 typo-caption font-normal">
          <Link href="/privacy" className="text-muted-foreground hover:text-muted-foreground/80 transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="text-muted-foreground hover:text-muted-foreground/80 transition-colors">
            ToS
          </Link>
          <Link href="/fees" className="text-muted-foreground hover:text-muted-foreground/80 transition-colors">
            Fees
          </Link>
          <Link href="/how-it-works" className="text-muted-foreground hover:text-muted-foreground/80 transition-colors">
            How It Works
          </Link>
        </nav>
      </div>
    </footer>
  );
}
