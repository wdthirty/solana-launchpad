'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface CurrentTokenContextType {
  tokenSymbol: string | null;
  setTokenSymbol: (symbol: string | null) => void;
}

const CurrentTokenContext = createContext<CurrentTokenContextType | undefined>(undefined);

export function CurrentTokenProvider({ children }: { children: ReactNode }) {
  const [tokenSymbol, setTokenSymbolState] = useState<string | null>(null);

  const setTokenSymbol = useCallback((symbol: string | null) => {
    setTokenSymbolState(symbol);
  }, []);

  return (
    <CurrentTokenContext.Provider value={{ tokenSymbol, setTokenSymbol }}>
      {children}
    </CurrentTokenContext.Provider>
  );
}

export function useCurrentToken() {
  const context = useContext(CurrentTokenContext);
  if (context === undefined) {
    throw new Error('useCurrentToken must be used within a CurrentTokenProvider');
  }
  return context;
}
