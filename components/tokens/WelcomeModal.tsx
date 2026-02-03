'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const WELCOME_MODAL_KEY = 'welcome_shown';

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if user has seen the modal before
    const hasSeenWelcome = localStorage.getItem(WELCOME_MODAL_KEY);
    if (!hasSeenWelcome) {
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(WELCOME_MODAL_KEY, 'true');
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="text-center space-y-6 py-2">
          <DialogTitle className="text-2xl font-bold text-foreground">
            Welcome
          </DialogTitle>

          <p className="text-muted-foreground leading-relaxed">
            The <span className="text-primary font-medium">curated</span> launchpad where every creator is vetted. No rugs, no spam — just{' '}
            <span className="text-primary font-medium">quality projects</span> from trusted builders.
          </p>

          <p className="text-sm text-muted-foreground">
            By continuing, you agree to our{' '}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and confirm you are 18+
          </p>

          <div className="space-y-3">
            <Link
              href="/how-it-works"
              onClick={handleAccept}
              className="flex items-center justify-center w-full py-4 text-lg font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-colors cursor-pointer"
            >
              How It Works
            </Link>
            <Button
              onClick={handleAccept}
              className="w-full py-4 text-lg font-semibold rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 cursor-pointer"
            >
              I&apos;m Ready
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
