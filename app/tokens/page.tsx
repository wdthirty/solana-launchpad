'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TokenFeed } from '@/components/tokens/TokenFeed';
import { SearchResults } from '@/components/search/SearchResults';
import { WelcomeModal } from '@/components/tokens/WelcomeModal';

function LaunchpadContent() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q');

  return (
    <>
      <WelcomeModal />
      <div className="flex flex-1 flex-col gap-4 py-4 px-0 md:px-4">
        {searchQuery ? (
          <SearchResults query={searchQuery} />
        ) : (
          <TokenFeed enableRealtime={true} />
        )}
      </div>
    </>
  );
}

export default function LaunchpadPage() {
  return (
    <Suspense fallback={null}>
      <LaunchpadContent />
    </Suspense>
  );
}
