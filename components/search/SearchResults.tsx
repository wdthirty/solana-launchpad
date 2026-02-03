'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TokenCard } from '@/components/tokens/TokenCard';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TokenWithCreator } from '@/lib/types';

interface SearchResult {
  tokens: TokenWithCreator[];
}

interface SearchResultsProps {
  query: string;
}

export function SearchResults({ query }: SearchResultsProps) {
  const router = useRouter();
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      if (!query || query.trim().length === 0) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (!response.ok) {
          throw new Error('Failed to fetch search results');
        }

        const data = await response.json();
        setResults(data);
      } catch (err) {
        console.error('Search error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load search results');
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [query]);

  const handleClearSearch = () => {
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-8">
        <div className="text-center py-16">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={handleClearSearch} variant="ghost">
            Clear Search
          </Button>
        </div>
      </div>
    );
  }

  const hasResults = results && results.tokens.length > 0;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      {/* Search Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            Search Results
            {query && (
              <span className="text-muted-foreground font-normal ml-2">
                for "{query}"
              </span>
            )}
          </h1>
          {results && (
            <p className="text-sm text-muted-foreground mt-1">
              Found {results.tokens.length} token{results.tokens.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleClearSearch} className="gap-2">
          <X className="w-4 h-4" />
          Clear Search
        </Button>
      </div>

      {!hasResults ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-foreground mb-2">
            No results found
          </h3>
          <p className="text-muted-foreground mb-4">
            Try searching for a token name, symbol, or contract address
          </p>
          <Button onClick={handleClearSearch} variant="ghost">
            View All Tokens
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {results?.tokens.map((token) => (
            <TokenCard
              key={token.address}
              token={token}
              showAnimation={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

