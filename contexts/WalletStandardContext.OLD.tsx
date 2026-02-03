'use client';

/**
 * WalletStandardContext
 *
 * A modern wallet orchestration using Wallet Standard directly instead of
 * the wallet adapter layer. This provides:
 * - Direct Wallet Standard integration
 * - Better wallet discovery
 * - Auto-reconnect persistence
 * - Simpler state management with Zustand
 *
 * @see https://github.com/wallet-standard/wallet-standard
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  getWallets,
  type Wallet,
  type WalletAccount,
} from '@wallet-standard/core';
import {
  StandardConnect,
  StandardDisconnect,
} from '@wallet-standard/features';
import { PublicKey } from '@solana/web3.js';

// Feature identifiers for Solana wallets
const SOLANA_CHAIN_MAINNET = 'solana:mainnet';
const SOLANA_CHAIN_DEVNET = 'solana:devnet';
const SOLANA_SIGN_MESSAGE = 'solana:signMessage';
const SOLANA_SIGN_TRANSACTION = 'solana:signTransaction';

// Types
export interface WalletInfo {
  name: string;
  icon: string;
  url?: string;
  rdns?: string;
  ready: boolean;
}

export interface ConnectedWallet {
  name: string;
  icon: string;
  publicKey: PublicKey;
  account: WalletAccount;
}

interface WalletState {
  // Persisted state
  lastWalletName: string | null;
  autoConnect: boolean;
  // Actions
  setLastWalletName: (name: string | null) => void;
  setAutoConnect: (autoConnect: boolean) => void;
}

// Zustand store for wallet persistence
const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      lastWalletName: null,
      autoConnect: true,
      setLastWalletName: (name) => set({ lastWalletName: name }),
      setAutoConnect: (autoConnect) => set({ autoConnect }),
    }),
    {
      name: 'wallet-standard-storage',
      storage: createJSONStorage(() => {
        // Only use localStorage in browser
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
    }
  )
);

// Check if a wallet supports Solana
function isSolanaWallet(wallet: Wallet): boolean {
  return (
    wallet.chains.some(
      (chain) =>
        chain.startsWith('solana:') ||
        chain === SOLANA_CHAIN_MAINNET ||
        chain === SOLANA_CHAIN_DEVNET
    ) &&
    StandardConnect in wallet.features
  );
}

// Check if wallet supports disconnect
function supportsDisconnect(wallet: Wallet): boolean {
  return StandardDisconnect in wallet.features;
}

// Check if wallet supports sign message
function supportsSignMessage(wallet: Wallet): boolean {
  return SOLANA_SIGN_MESSAGE in wallet.features;
}

// Get wallet icon as data URL or URL
function getWalletIcon(wallet: Wallet): string {
  if (typeof wallet.icon === 'string') {
    return wallet.icon;
  }
  // Some wallets return a data URL object
  return wallet.icon || '';
}

// Context type
interface WalletStandardContextType {
  // Available wallets
  wallets: WalletInfo[];
  // Connection state
  wallet: ConnectedWallet | null;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  // Actions
  connect: (walletName: string) => Promise<void>;
  disconnect: () => Promise<void>;
  select: (walletName: string) => void;
  // Sign message (for auth)
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  // Raw wallet for advanced usage
  rawWallet: Wallet | null;
}

const WalletStandardContext = createContext<WalletStandardContextType | undefined>(undefined);

interface WalletStandardProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
}

export function WalletStandardProvider({
  children,
  autoConnect: autoConnectProp = true,
}: WalletStandardProviderProps) {
  // Zustand store
  const { lastWalletName, setLastWalletName, autoConnect: storedAutoConnect, setAutoConnect } = useWalletStore();

  // State
  const [availableWallets, setAvailableWallets] = useState<Wallet[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<Wallet | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [selectedWalletName, setSelectedWalletName] = useState<string | null>(null);
  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState(false);

  // Derived state
  const publicKey = useMemo(() => {
    if (!connectedAccount) return null;
    try {
      return new PublicKey(connectedAccount.address);
    } catch {
      return null;
    }
  }, [connectedAccount]);

  const connected = !!connectedAccount && !!publicKey;

  // Transform available wallets to WalletInfo[]
  const walletInfos = useMemo<WalletInfo[]>(() => {
    return availableWallets.map((wallet) => ({
      name: wallet.name,
      icon: getWalletIcon(wallet),
      url: (wallet as { url?: string }).url,
      rdns: (wallet as { rdns?: string }).rdns,
      ready: true,
    }));
  }, [availableWallets]);

  // Connected wallet info
  const walletInfo = useMemo<ConnectedWallet | null>(() => {
    if (!connectedWallet || !connectedAccount || !publicKey) return null;
    return {
      name: connectedWallet.name,
      icon: getWalletIcon(connectedWallet),
      publicKey,
      account: connectedAccount,
    };
  }, [connectedWallet, connectedAccount, publicKey]);

  // Sign message function
  const signMessage = useMemo(() => {
    if (!connectedWallet || !connectedAccount || !supportsSignMessage(connectedWallet)) {
      return null;
    }

    return async (message: Uint8Array): Promise<Uint8Array> => {
      const feature = connectedWallet.features[SOLANA_SIGN_MESSAGE] as {
        signMessage: (params: { account: WalletAccount; message: Uint8Array }) => Promise<{ signature: Uint8Array }[]>;
      };

      const [result] = await feature.signMessage({
        account: connectedAccount,
        message,
      });

      return result.signature;
    };
  }, [connectedWallet, connectedAccount]);

  // Discover wallets on mount
  useEffect(() => {
    const walletsApi = getWallets();

    const updateWallets = () => {
      const solanaWallets = walletsApi.get().filter(isSolanaWallet);
      setAvailableWallets(solanaWallets);
    };

    // Initial fetch
    updateWallets();

    // Subscribe to wallet registration/unregistration
    const unsubscribe = walletsApi.on('register', updateWallets);
    const unsubscribe2 = walletsApi.on('unregister', updateWallets);

    return () => {
      unsubscribe();
      unsubscribe2();
    };
  }, []);

  // Handle account changes on connected wallet
  useEffect(() => {
    if (!connectedWallet) return;

    const handleChange = () => {
      // Check if wallet still has accounts
      const accounts = connectedWallet.accounts;
      if (accounts.length === 0) {
        // Wallet disconnected externally
        setConnectedWallet(null);
        setConnectedAccount(null);
      } else {
        // Update to first account (in case of account switch)
        setConnectedAccount(accounts[0]);
      }
    };

    // Subscribe to wallet changes
    const unsubscribe = connectedWallet.features['standard:events']
      ? (connectedWallet.features['standard:events'] as {
          on: (event: string, handler: () => void) => () => void;
        }).on('change', handleChange)
      : undefined;

    return () => {
      unsubscribe?.();
    };
  }, [connectedWallet]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (hasAttemptedAutoConnect) return;
    if (!autoConnectProp || !storedAutoConnect) return;
    if (!lastWalletName) return;
    if (availableWallets.length === 0) return;

    const targetWallet = availableWallets.find((w) => w.name === lastWalletName);
    if (!targetWallet) return;

    setHasAttemptedAutoConnect(true);

    // Attempt silent connect
    const attemptAutoConnect = async () => {
      try {
        const connectFeature = targetWallet.features[StandardConnect] as {
          connect: (options?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>;
        };

        // Try silent connect first
        const result = await connectFeature.connect({ silent: true });

        if (result.accounts.length > 0) {
          setConnectedWallet(targetWallet);
          setConnectedAccount(result.accounts[0]);
        }
      } catch {
        // Silent connect failed, don't show error
        // User will need to manually connect
      }
    };

    attemptAutoConnect();
  }, [availableWallets, lastWalletName, autoConnectProp, storedAutoConnect, hasAttemptedAutoConnect]);

  // Connect to a specific wallet
  const connect = useCallback(
    async (walletName: string) => {
      const targetWallet = availableWallets.find((w) => w.name === walletName);
      if (!targetWallet) {
        throw new Error(`Wallet "${walletName}" not found`);
      }

      setConnecting(true);
      setSelectedWalletName(walletName);

      try {
        const connectFeature = targetWallet.features[StandardConnect] as {
          connect: (options?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>;
        };

        // Connect with user interaction
        const result = await connectFeature.connect();

        if (result.accounts.length === 0) {
          throw new Error('No accounts returned from wallet');
        }

        setConnectedWallet(targetWallet);
        setConnectedAccount(result.accounts[0]);
        setLastWalletName(walletName);
        setAutoConnect(true);
      } catch (error) {
        // Reset state on error
        setConnectedWallet(null);
        setConnectedAccount(null);
        throw error;
      } finally {
        setConnecting(false);
      }
    },
    [availableWallets, setLastWalletName, setAutoConnect]
  );

  // Disconnect from current wallet
  const disconnect = useCallback(async () => {
    if (!connectedWallet) return;

    try {
      if (supportsDisconnect(connectedWallet)) {
        const disconnectFeature = connectedWallet.features[StandardDisconnect] as {
          disconnect: () => Promise<void>;
        };
        await disconnectFeature.disconnect();
      }
    } catch {
      // Ignore disconnect errors
    } finally {
      setConnectedWallet(null);
      setConnectedAccount(null);
      setLastWalletName(null);
    }
  }, [connectedWallet, setLastWalletName]);

  // Select a wallet (for compatibility with wallet adapter API)
  const select = useCallback((walletName: string) => {
    setSelectedWalletName(walletName);
  }, []);

  const value = useMemo<WalletStandardContextType>(
    () => ({
      wallets: walletInfos,
      wallet: walletInfo,
      publicKey,
      connected,
      connecting,
      connect,
      disconnect,
      select,
      signMessage,
      rawWallet: connectedWallet,
    }),
    [walletInfos, walletInfo, publicKey, connected, connecting, connect, disconnect, select, signMessage, connectedWallet]
  );

  return (
    <WalletStandardContext.Provider value={value}>
      {children}
    </WalletStandardContext.Provider>
  );
}

// Hook to use wallet standard context
export function useWalletStandard() {
  const context = useContext(WalletStandardContext);
  if (!context) {
    throw new Error('useWalletStandard must be used within a WalletStandardProvider');
  }
  return context;
}

// Compatibility hook - provides same interface as useWallet from @solana/wallet-adapter-react
export function useWallet() {
  const {
    wallets,
    wallet,
    publicKey,
    connected,
    connecting,
    connect,
    disconnect,
    select,
    signMessage,
    rawWallet,
  } = useWalletStandard();

  // Transform to wallet adapter format
  const walletsCompat = useMemo(() => {
    return wallets.map((w) => ({
      adapter: {
        name: w.name,
        icon: w.icon,
        url: w.url || '',
        publicKey: null as PublicKey | null,
        connecting: false,
        connected: false,
        readyState: 'Installed' as const,
      },
      readyState: 'Installed' as const,
    }));
  }, [wallets]);

  const walletCompat = useMemo(() => {
    if (!wallet) return null;
    return {
      adapter: {
        name: wallet.name,
        icon: wallet.icon,
        url: '',
        publicKey: wallet.publicKey,
        connecting,
        connected,
        readyState: 'Installed' as const,
      },
      readyState: 'Installed' as const,
    };
  }, [wallet, connecting, connected]);

  // Connect wrapper that uses the selected wallet or provided name
  const connectWrapper = useCallback(async () => {
    // Find the wallet to connect
    if (wallets.length === 0) {
      throw new Error('No wallets available');
    }

    // Use the first available wallet if none selected
    const targetWallet = wallets[0];
    await connect(targetWallet.name);
  }, [wallets, connect]);

  return {
    wallets: walletsCompat,
    wallet: walletCompat,
    publicKey,
    connected,
    connecting,
    disconnecting: false,
    autoConnect: true,
    connect: connectWrapper,
    disconnect,
    select: (walletName: string) => {
      select(walletName);
      // Auto-connect when selecting
      connect(walletName).catch(() => {});
    },
    signMessage,
    signTransaction: null,
    signAllTransactions: null,
    sendTransaction: null,
  };
}
