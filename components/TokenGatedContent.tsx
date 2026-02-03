'use client';

import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface TokenGatedContentProps {
  tokenAddress: string;
  tokenSymbol?: string;
  isLoading?: boolean;
  children: React.ReactNode;
}

export function TokenGatedContent({
  tokenAddress,
  tokenSymbol,
  isLoading = false,
  children,
}: TokenGatedContentProps) {
  if (isLoading) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="blur-sm pointer-events-none select-none">{children}</div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-1">Holders Only</h3>
            <p className="text-sm text-muted-foreground max-w-[280px]">
              You need to hold {tokenSymbol || 'this token'} to access this community
            </p>
          </div>
          <Link href={`/token/${tokenAddress}`}>
            <Button className="bg-primary hover:bg-primary/80 text-primary-foreground">
              Buy {tokenSymbol || 'Token'}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

interface TokenGatedPageProps {
  tokenAddress: string;
  tokenSymbol?: string;
  tokenName?: string;
}

export function TokenGatedPage({
  tokenAddress,
  tokenSymbol,
  tokenName,
}: TokenGatedPageProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-10 h-10 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">Holders Only Community</h2>
          <p className="text-muted-foreground">
            You're not a holder of {tokenName || tokenSymbol || 'this token'}. Purchase tokens to
            join the community and participate in discussions.
          </p>
        </div>
        <Link href={`/token/${tokenAddress}`}>
          <Button size="lg" className="bg-primary hover:bg-primary/80 text-primary-foreground">
            Buy {tokenSymbol || 'Token'}
          </Button>
        </Link>
      </div>
    </div>
  );
}
