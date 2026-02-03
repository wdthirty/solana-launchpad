'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface NavigationProgressContextType {
  isLoading: boolean;
  startLoading: () => void;
  stopLoading: () => void;
}

const NavigationProgressContext = createContext<NavigationProgressContextType>({
  isLoading: false,
  startLoading: () => {},
  stopLoading: () => {},
});

export function useNavigationProgress() {
  return useContext(NavigationProgressContext);
}

interface NavigationProgressProviderProps {
  children: React.ReactNode;
}

export function NavigationProgressProvider({ children }: NavigationProgressProviderProps) {
  const [isLoading, setIsLoading] = useState(false);

  const startLoading = useCallback(() => {
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Note: We don't auto-stop on route changes here.
  // The NavigationProgress component handles detecting when navigation completes
  // and calls stopLoading() at the appropriate time.

  return (
    <NavigationProgressContext.Provider value={{ isLoading, startLoading, stopLoading }}>
      {children}
    </NavigationProgressContext.Provider>
  );
}
