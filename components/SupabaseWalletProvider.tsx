'use client';

import React, { FC, useMemo } from 'react';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { FrameworkKitWalletProvider } from '@/contexts/FrameworkKitWalletContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { UserProfileProvider } from '@/contexts/UserProfileContext';
import { AblyProvider } from '@/contexts/AblyContext';
import { getSolanaEndpoint } from '@/lib/solana';

interface SupabaseWalletContextProviderProps {
  children: React.ReactNode;
}

/**
 * SupabaseWalletContextProvider
 *
 * Uses FrameworkKitWalletProvider for all wallet operations:
 * - Wallet discovery via autoDiscover() from @solana/client
 * - Wallet connection and session management
 * - signMessage for Supabase Web3 authentication
 *
 * ConnectionProvider is kept for RPC connection (used by transaction builders).
 * AblyProvider is included here so UserProfileProvider can access it for balance subscriptions.
 */
export const SupabaseWalletContextProvider: FC<SupabaseWalletContextProviderProps> = ({ children }) => {
  const endpoint = useMemo(() => getSolanaEndpoint(), []);

  return (
    <FrameworkKitWalletProvider autoConnect>
      <ConnectionProvider endpoint={endpoint}>
        <AblyProvider>
          <AuthProvider>
            <UserProfileProvider>
              {children}
            </UserProfileProvider>
          </AuthProvider>
        </AblyProvider>
      </ConnectionProvider>
    </FrameworkKitWalletProvider>
  );
};
