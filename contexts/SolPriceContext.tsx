'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';

interface SolPriceContextType {
  solPrice: number | null;
  isLoading: boolean;
  error: string | null;
  refreshSolPrice: () => Promise<void>;
}

const SolPriceContext = createContext<SolPriceContextType | null>(null);

// localStorage key for caching
const SOL_PRICE_CACHE_KEY = 'sol_price_cache';
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes max cache age

interface CachedPrice {
  price: number;
  timestamp: number;
}

function getCachedPrice(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(SOL_PRICE_CACHE_KEY);
    if (cached) {
      const data: CachedPrice = JSON.parse(cached);
      // Use cache if less than 5 minutes old
      if (Date.now() - data.timestamp < CACHE_MAX_AGE) {
        return data.price;
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return null;
}

function setCachedPrice(price: number): void {
  if (typeof window === 'undefined') return;
  try {
    const data: CachedPrice = { price, timestamp: Date.now() };
    localStorage.setItem(SOL_PRICE_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
}

export const useSolPrice = () => {
  const context = useContext(SolPriceContext);
  if (!context) {
    throw new Error('useSolPrice must be used within SolPriceProvider');
  }
  return context;
};

interface SolPriceProviderProps {
  children: React.ReactNode;
}

export const SolPriceProvider: React.FC<SolPriceProviderProps> = ({ children }) => {
  // Initialize with cached price for instant display
  const [solPrice, setSolPrice] = useState<number | null>(() => getCachedPrice());
  const [isLoading, setIsLoading] = useState(() => getCachedPrice() === null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSolPrice = useCallback(async (isInitial = false) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Only show loading state on initial load if no cached price
      if (isInitial && solPrice === null) {
        setIsLoading(true);
      }
      setError(null);

      // Use our cached API route instead of direct Jupiter call
      const response = await fetch('/api/sol-price', {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      if (data.price && data.price > 0) {
        setSolPrice(data.price);
        setCachedPrice(data.price);
      }
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch SOL price';
      setError(errorMessage);

      // If we have a cached price, don't show error to user
      if (solPrice === null) {
        console.error('Failed to fetch SOL price:', err);
      }
    } finally {
      if (isInitial) {
        setIsLoading(false);
      }
    }
  }, [solPrice]);

  const refreshSolPrice = useCallback(async () => {
    await fetchSolPrice();
  }, [fetchSolPrice]);

  // Fetch SOL price on mount
  useEffect(() => {
    fetchSolPrice(true);

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchSolPrice]);

  // Refresh SOL price every 60 seconds (increased from 30s to reduce re-renders)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSolPrice(false);
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [fetchSolPrice]);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<SolPriceContextType>(() => ({
    solPrice,
    isLoading,
    error,
    refreshSolPrice,
  }), [solPrice, isLoading, error, refreshSolPrice]);

  return (
    <SolPriceContext.Provider value={value}>
      {children}
    </SolPriceContext.Provider>
  );
};
