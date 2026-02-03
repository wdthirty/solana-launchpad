import { useState, useEffect } from 'react';

interface WhitelistStatus {
  isWhitelisted: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useWhitelist(walletAddress: string | null | undefined): WhitelistStatus {
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setIsWhitelisted(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    const checkWhitelist = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/whitelist/check?wallet=${walletAddress}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to check whitelist status');
        }

        setIsWhitelisted(data.isWhitelisted);
      } catch (err) {
        console.error('Whitelist check error:', err);
        setError(err instanceof Error ? err.message : 'Failed to check whitelist');
        setIsWhitelisted(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkWhitelist();
  }, [walletAddress]);

  return { isWhitelisted, isLoading, error };
}
