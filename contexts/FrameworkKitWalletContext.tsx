'use client';

/**
 * FrameworkKitWalletContext
 *
 * Wallet orchestration using Solana Foundation's framework-kit (@solana/client).
 * This replaces both @solana/wallet-adapter-react and our custom WalletStandardContext.
 *
 * Framework-kit provides:
 * - Direct Wallet Standard integration
 * - Auto-discovery of all Wallet Standard compatible wallets
 * - Built-in persistence and auto-reconnect
 * - signMessage for authentication
 *
 * NOTE: For transaction signing, we use the wallet's native window provider
 * because framework-kit uses @solana/kit transaction types which are incompatible
 * with @solana/web3.js VersionedTransaction.
 *
 * @see https://github.com/solana-foundation/framework-kit
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
import {
  autoDiscover,
  type WalletConnector,
  type WalletSession,
} from '@solana/client';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

// Window wallet provider interface for transaction signing
interface WindowWalletProvider {
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions?<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
}

// Declare window wallet providers
declare global {
  interface Window {
    phantom?: { solana?: WindowWalletProvider };
    solflare?: WindowWalletProvider;
    backpack?: WindowWalletProvider;
    glow?: { solana?: WindowWalletProvider };
    coin98?: { sol?: WindowWalletProvider };
    exodus?: { solana?: WindowWalletProvider };
    trustwallet?: { solana?: WindowWalletProvider };
    okxwallet?: { solana?: WindowWalletProvider };
    coinbaseWalletExtension?: { solana?: WindowWalletProvider };
    braveSolana?: WindowWalletProvider;
    jupiter?: WindowWalletProvider;
  }
}

/**
 * Get the wallet's window provider for transaction signing.
 * Framework-kit's signTransaction uses @solana/kit types which are incompatible
 * with @solana/web3.js VersionedTransaction, so we use window providers directly.
 */
function getWindowWalletProvider(walletName: string | null): WindowWalletProvider | undefined {
  if (!walletName || typeof window === 'undefined') return undefined;

  const name = walletName.toLowerCase();

  if (name.includes('phantom')) return window.phantom?.solana;
  if (name.includes('solflare')) return window.solflare;
  if (name.includes('backpack')) return window.backpack;
  if (name.includes('glow')) return window.glow?.solana;
  if (name.includes('coin98')) return window.coin98?.sol;
  if (name.includes('exodus')) return window.exodus?.solana;
  if (name.includes('trust')) return window.trustwallet?.solana;
  if (name.includes('okx')) return window.okxwallet?.solana;
  if (name.includes('coinbase')) return window.coinbaseWalletExtension?.solana;
  if (name.includes('brave')) return window.braveSolana;
  if (name.includes('jupiter')) return window.jupiter;

  return undefined;
}

// Types for wallet info displayed in UI
export interface WalletInfo {
  name: string;
  icon: string;
  ready: boolean;
}

export interface ConnectedWalletInfo {
  name: string;
  icon: string;
  publicKey: PublicKey;
}

// Context type - provides everything needed for wallet operations
interface FrameworkKitWalletContextType {
  // Available wallets for selection
  wallets: WalletInfo[];

  // Connection state
  wallet: ConnectedWalletInfo | null;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  autoConnecting: boolean;

  // Actions
  connect: (walletName: string) => Promise<void>;
  disconnect: () => Promise<void>;

  // Signing capabilities
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  signTransaction: (<T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>) | null;
}

const FrameworkKitWalletContext = createContext<FrameworkKitWalletContextType | undefined>(undefined);

interface FrameworkKitWalletProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
}

// Storage key for last connected wallet
const LAST_WALLET_KEY = 'framework-kit:last-wallet';

export function FrameworkKitWalletProvider({
  children,
  autoConnect = true,
}: FrameworkKitWalletProviderProps) {
  const [connectors, setConnectors] = useState<WalletConnector[]>([]);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [connectedConnector, setConnectedConnector] = useState<WalletConnector | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);
  // Start with autoConnecting=true when autoConnect is enabled to prevent premature disconnect detection
  const [autoConnecting, setAutoConnecting] = useState(autoConnect);
  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState(false);

  // Initialize and discover wallets
  useEffect(() => {
    const discoverWallets = () => {
      try {
        // autoDiscover() returns all Wallet Standard compatible wallets
        const discoveredConnectors = autoDiscover();
                setConnectors([...discoveredConnectors]);
      } catch (error) {
        console.error('[FrameworkKit] Failed to discover wallets:', error);
      }
    };

    discoverWallets();

    // Re-discover when wallets register/unregister (on a delay for SSR)
    const timeout = setTimeout(discoverWallets, 500);
    return () => clearTimeout(timeout);
  }, []);

  // Auto-connect to last used wallet
  useEffect(() => {
    if (!autoConnect || hasAttemptedAutoConnect || connectors.length === 0) return;

    setHasAttemptedAutoConnect(true);

    const lastWalletId = localStorage.getItem(LAST_WALLET_KEY);
    if (!lastWalletId) {
      setAutoConnecting(false);
      return;
    }

    const connector = connectors.find(c => c.id === lastWalletId || c.name === lastWalletId);
    if (!connector) {
      setAutoConnecting(false);
      return;
    }

    // Attempt auto-connect
    const attemptAutoConnect = async () => {
      setAutoConnecting(true);
      try {
        
        // Use autoConnect option for silent connection
        const walletSession = await connector.connect({ autoConnect: true });

        if (walletSession && walletSession.account) {
          setSession(walletSession);
          setConnectedConnector(connector);
          setPublicKey(new PublicKey(walletSession.account.address));
                  }
      } catch (error) {
                localStorage.removeItem(LAST_WALLET_KEY);
      } finally {
        setAutoConnecting(false);
      }
    };

    attemptAutoConnect();
  }, [autoConnect, connectors, hasAttemptedAutoConnect]);

  // Transform connectors to wallet info for UI
  const wallets = useMemo<WalletInfo[]>(() => {
    return connectors
      .filter(c => {
        // Exclude Backpack - incompatible signMessage with Supabase
        if (c.name.toLowerCase().includes('backpack')) return false;
        return true;
      })
      .map(c => {
        // Try to get icon from the Wallet Standard API directly if framework-kit doesn't provide it
        let iconUrl = c.icon || '';
        if (!iconUrl && typeof window !== 'undefined') {
          try {
            const standardWallets = (window as any).navigator?.wallets?.getWallets?.() || [];
            const standardWallet = standardWallets.find((w: any) =>
              w.name?.toLowerCase() === c.name.toLowerCase()
            );

            if (standardWallet) {
              // Wallet Standard uses 'icon' (string) or 'icons' (array of strings)
              if (standardWallet.icon) {
                iconUrl = standardWallet.icon;
              } else if (standardWallet.icons && standardWallet.icons.length > 0) {
                iconUrl = standardWallet.icons[0];
              }
            } else {
              // Try direct window access for specific wallets
              const walletName = c.name.toLowerCase();
              if (walletName.includes('phantom') && (window as any).phantom?.solana?.icon) {
                iconUrl = (window as any).phantom.solana.icon;
              } else if (walletName.includes('solflare') && (window as any).solflare?.icon) {
                iconUrl = (window as any).solflare.icon;
              }

              // Last resort: use known CDN URLs for popular wallets
              if (!iconUrl) {
                if (walletName.includes('phantom')) {
                  iconUrl = 'https://avatars.githubusercontent.com/u/78782331?s=200&v=4';
                } else if (walletName.includes('solflare')) {
                  iconUrl = 'https://solflare.com/favicon-96x96.png';
                }
              }
            }
          } catch (e) {
            // Silently fail - icon is not critical
          }
        }

        return {
          name: c.name,
          icon: iconUrl,
          ready: c.ready ?? true,
        };
      });
  }, [connectors]);

  // Connected wallet info for UI
  const walletInfo = useMemo<ConnectedWalletInfo | null>(() => {
    if (!connectedConnector || !publicKey) return null;

    // Try to get icon from Wallet Standard if not provided by framework-kit
    let iconUrl = connectedConnector.icon || '';
    if (!iconUrl && typeof window !== 'undefined') {
      try {
        const standardWallets = (window as any).navigator?.wallets?.getWallets?.() || [];
        const standardWallet = standardWallets.find((w: any) =>
          w.name?.toLowerCase() === connectedConnector.name.toLowerCase()
        );

        if (standardWallet) {
          if (standardWallet.icon) {
            iconUrl = standardWallet.icon;
          } else if (standardWallet.icons && standardWallet.icons.length > 0) {
            iconUrl = standardWallet.icons[0];
          }
        }
      } catch (e) {
              }
    }

    return {
      name: connectedConnector.name,
      icon: iconUrl,
      publicKey,
    };
  }, [connectedConnector, publicKey]);

  // Connect to a specific wallet
  const connect = useCallback(
    async (walletName: string) => {
      const connector = connectors.find(c => c.name === walletName);
      if (!connector) {
        throw new Error(`Wallet "${walletName}" not found`);
      }

      setConnecting(true);

      try {
        
        // Connect with user interaction (not autoConnect)
        const walletSession = await connector.connect();

        if (!walletSession || !walletSession.account) {
          throw new Error('No account returned from wallet');
        }

        setSession(walletSession);
        setConnectedConnector(connector);
        setPublicKey(new PublicKey(walletSession.account.address));

        // Save for auto-reconnect
        localStorage.setItem(LAST_WALLET_KEY, connector.id);

              } catch (error) {
        console.error('[FrameworkKit] Connection failed:', error);
        setSession(null);
        setConnectedConnector(null);
        setPublicKey(null);
        throw error;
      } finally {
        setConnecting(false);
      }
    },
    [connectors]
  );

  // Disconnect from current wallet
  const disconnect = useCallback(async () => {
    if (!session) return;

    try {
            await session.disconnect();
    } catch (error) {
      console.error('[FrameworkKit] Disconnect error:', error);
    } finally {
      setSession(null);
      setConnectedConnector(null);
      setPublicKey(null);
      localStorage.removeItem(LAST_WALLET_KEY);
    }
  }, [session]);

  // Sign message function for authentication
  const signMessage = useMemo(() => {
    if (!session || !session.signMessage) return null;

    return async (message: Uint8Array): Promise<Uint8Array> => {
      if (!session.signMessage) {
        throw new Error('Wallet does not support message signing');
      }

      const signature = await session.signMessage(message);
      return signature;
    };
  }, [session]);

  // Sign transaction function for transactions (supports both Transaction and VersionedTransaction)
  // Uses window wallet provider because framework-kit's signTransaction uses @solana/kit types
  // which are incompatible with @solana/web3.js VersionedTransaction
  const signTransaction = useMemo(() => {
    if (!connectedConnector || !publicKey) return null;

    const walletName = connectedConnector.name;
    const windowProvider = getWindowWalletProvider(walletName);

    if (!windowProvider) {
            return null;
    }

    return async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
      const provider = getWindowWalletProvider(walletName);
      if (!provider) {
        throw new Error(`Wallet ${walletName} does not support transaction signing`);
      }

            const signedTx = await provider.signTransaction(transaction);
      return signedTx;
    };
  }, [connectedConnector, publicKey]);

  const value = useMemo<FrameworkKitWalletContextType>(
    () => ({
      wallets,
      wallet: walletInfo,
      publicKey,
      connected: !!publicKey && !!session,
      connecting,
      autoConnecting,
      connect,
      disconnect,
      signMessage,
      signTransaction,
    }),
    [wallets, walletInfo, publicKey, session, connecting, autoConnecting, connect, disconnect, signMessage, signTransaction]
  );

  return (
    <FrameworkKitWalletContext.Provider value={value}>
      {children}
    </FrameworkKitWalletContext.Provider>
  );
}

// Hook to use framework-kit wallet context
export function useFrameworkKitWallet() {
  const context = useContext(FrameworkKitWalletContext);
  if (!context) {
    throw new Error('useFrameworkKitWallet must be used within a FrameworkKitWalletProvider');
  }
  return context;
}

/**
 * Compatibility hook - provides same interface as useWallet from @solana/wallet-adapter-react
 * This allows gradual migration without changing all components at once
 */
export function useWallet() {
  const {
    wallets,
    wallet,
    publicKey,
    connected,
    connecting,
    autoConnecting,
    connect,
    disconnect,
    signMessage,
    signTransaction,
  } = useFrameworkKitWallet();

  // Transform to wallet adapter format for backward compatibility
  const walletsCompat = useMemo(() => {
    return wallets.map(w => ({
      adapter: {
        name: w.name,
        icon: w.icon,
        url: '',
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

  // Select and connect in one step
  const select = useCallback(
    (walletName: string) => {
      connect(walletName).catch(err => {
              });
    },
    [connect]
  );

  return {
    wallets: walletsCompat,
    wallet: walletCompat,
    publicKey,
    connected,
    connecting,
    autoConnecting,
    disconnecting: false,
    autoConnect: true,
    connect: async () => {
      if (wallets.length > 0) {
        await connect(wallets[0].name);
      }
    },
    disconnect,
    select,
    signMessage,
    signTransaction,
    signAllTransactions: null,
    sendTransaction: null,
  };
}

// Re-export for easy import
export { useFrameworkKitWallet as useWalletStandard };
