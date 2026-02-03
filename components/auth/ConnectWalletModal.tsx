/**
 * ConnectWalletModal
 *
 * A robust modal for handling wallet connection and authentication.
 * NOW USING: Framework-kit (@solana/client) for wallet orchestration
 *
 * Flow:
 * 1. If wallet not connected: Show wallet selection
 * 2. If wallet connected but not authenticated: Show sign-in confirmation
 * 3. After sign-in: Close modal
 *
 * TO REVERT: See git history - old version used @solana/wallet-adapter-react
 */

'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFrameworkKitWallet } from '@/contexts/FrameworkKitWalletContext';
import { PublicKey } from '@solana/web3.js';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Wallet, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

// ============================================================
// OLD IMPORTS (commented out for revert reference)
// ============================================================
// import { useWallet } from '@solana/wallet-adapter-react';
// import { useWalletStandard } from '@/contexts/WalletStandardContext';

/**
 * Get wallet icon from window.solana.wallet_standard if available.
 * Wallet Standard wallets register themselves with icons.
 */
function getWalletIconFromStandard(walletName: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    // Try the Wallet Standard API
    const standardWallets = (window as any).navigator?.wallets?.getWallets?.() || [];
    const wallet = standardWallets.find((w: any) =>
      w.name?.toLowerCase() === walletName.toLowerCase()
    );

    if (wallet?.icon) {
      return wallet.icon;
    }

    // Also try checking the window.wallets object (alternative location)
    const windowWallets = (window as any).wallets;
    if (windowWallets) {
      const walletKey = Object.keys(windowWallets).find(key =>
        key.toLowerCase().includes(walletName.toLowerCase())
      );
      if (walletKey && windowWallets[walletKey]?.icon) {
        return windowWallets[walletKey].icon;
      }
    }
  } catch {
    // Silently fail - icon lookup is not critical
  }

  return null;
}

/**
 * Get wallet icon - prioritizes the actual icon from the wallet adapter.
 * Falls back to Wallet Standard API if framework-kit doesn't provide one.
 */
function getWalletIcon(providedIcon?: string, walletName?: string): string {
  // If provided icon is a data URL (base64), use it directly
  if (providedIcon?.startsWith('data:')) {
    return providedIcon;
  }

  // If provided icon is an HTTPS URL, use it
  if (providedIcon?.startsWith('https://') || providedIcon?.startsWith('http://')) {
    return providedIcon;
  }

  // Try to get from Wallet Standard API
  if (walletName) {
    const standardIcon = getWalletIconFromStandard(walletName);
    if (standardIcon) {
      return standardIcon;
    }
  }

  // Return provided icon if we have one, otherwise empty
  return providedIcon || '';
}

/**
 * Detect if we're in Phantom's MOBILE in-app browser.
 */
function isPhantomMobileInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent || '';

  // Check if "Phantom" is in the user agent (Phantom mobile browser adds this)
  const phantomInUA = /Phantom/i.test(userAgent);
  if (phantomInUA) return true;

  // Check if we're on mobile AND Phantom is available
  const isMobile = /iPhone|iPod|iPad|Android|Mobile/i.test(userAgent);
  const hasPhantom = !!(window as { phantom?: { solana?: { isPhantom?: boolean } } }).phantom?.solana?.isPhantom;

  return isMobile && hasPhantom;
}


/**
 * Generate deep link to open current page in Phantom's in-app browser
 */
function getPhantomDeepLink(): string {
  if (typeof window === 'undefined') return '';
  const url = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  return `https://phantom.app/ul/browse/${url}?ref=${ref}`;
}

/**
 * Generate deep link to open current page in Solflare's in-app browser
 */
function getSolflareDeepLink(): string {
  if (typeof window === 'undefined') return '';
  const url = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  return `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`;
}

/**
 * Check if we should show mobile deep link buttons.
 * This is true when on mobile Safari/Chrome (not in a wallet's in-app browser)
 */
function shouldShowMobileDeepLinks(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent || '';

  // Must be on mobile
  const isMobile = /iPhone|iPod|iPad|Android|Mobile/i.test(userAgent);
  if (!isMobile) return false;

  // Check if already in a wallet's in-app browser
  // Wallet in-app browsers inject their provider or have specific UA strings
  const phantomInUA = /Phantom/i.test(userAgent);
  const solflareInUA = /Solflare/i.test(userAgent);
  const backpackInUA = /Backpack/i.test(userAgent);
  const jupiterInUA = /Jupiter/i.test(userAgent);

  if (phantomInUA || solflareInUA || backpackInUA || jupiterInUA) return false;

  // Check for injected providers (indicates in-app browser)
  const win = window as {
    phantom?: { solana?: { isPhantom?: boolean } };
    solflare?: { isSolflare?: boolean };
    backpack?: object;
    jupiter?: object;
    solana?: object;
  };

  const hasPhantom = !!win.phantom?.solana?.isPhantom;
  const hasSolflare = !!win.solflare?.isSolflare;
  const hasBackpack = !!win.backpack;
  const hasJupiter = !!win.jupiter;

  // If any wallet is available, we're likely in an in-app browser
  if (hasPhantom || hasSolflare || hasBackpack || hasJupiter) return false;

  // On mobile with no wallet detected - show deep links
  return true;
}

/**
 * Check if Phantom provider is available and has a publicKey
 */
function getPhantomProvider(): { publicKey: PublicKey; isConnected: boolean } | null {
  if (typeof window === 'undefined') return null;

  const phantom = (window as { phantom?: { solana?: {
    isPhantom?: boolean;
    isConnected?: boolean;
    publicKey?: { toBase58(): string };
    connect?: () => Promise<{ publicKey: { toBase58(): string } }>;
  } } }).phantom?.solana;

  if (!phantom?.isPhantom) {
    return null;
  }

  if (phantom.publicKey) {
    try {
      const pubkey = new PublicKey(phantom.publicKey.toBase58());
      return { publicKey: pubkey, isConnected: true };
    } catch {
      return null;
    }
  }

  return null;
}

interface ConnectWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalView =
  | 'wallet_select'
  | 'connecting'
  | 'sign_in'
  | 'signing'
  | 'error';

export function ConnectWalletModal({ open, onOpenChange }: ConnectWalletModalProps) {
  // Framework-kit wallet context
  const {
    wallets,
    wallet,
    publicKey,
    connected,
    connecting,
    connect,
    disconnect,
  } = useFrameworkKitWallet();

  const { signIn, isAuthenticated, loading: authLoading, resetAuthState } = useAuth();

  const [view, setView] = useState<ModalView>('wallet_select');
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [selectedWalletName, setSelectedWalletName] = useState<string | null>(null);

  const connectionInitiatedRef = useRef(false);
  const wasOpenRef = useRef(false);
  const phantomAutoConnectAttemptedRef = useRef(false);
  // Use ref for wallets to avoid re-triggering effect on wallet list changes
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;

  // Memoize wallet icons to prevent recalculation on every render
  const walletIcons = useMemo(() => {
    // Only compute when modal is open
    if (!open) return new Map<string, string>();

    const icons = new Map<string, string>();
    for (const w of wallets) {
      icons.set(w.name, getWalletIcon(w.icon, w.name));
    }
    return icons;
  }, [open, wallets]);

  // Determine initial view when modal opens
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const isPhantomMobile = isPhantomMobileInAppBrowser();
      const phantomProvider = getPhantomProvider();
      const currentWallets = walletsRef.current;

      setError(null);
      setSelectedWalletName(null);
      connectionInitiatedRef.current = false;

      if (isAuthenticated) {
        onOpenChange(false);
        return;
      }

      // On Phantom mobile, try to connect via framework-kit
      if (isPhantomMobile) {
        // If framework-kit is already connected with Phantom, go to sign-in
        if (connected && publicKey && wallet?.name?.toLowerCase().includes('phantom')) {
          setView('sign_in');
          phantomAutoConnectAttemptedRef.current = true;
          return;
        }

        // If we already attempted auto-connect and failed, show wallet select
        if (phantomAutoConnectAttemptedRef.current) {
          setView('wallet_select');
          return;
        }

        // If Phantom provider is available but framework-kit not connected,
        // trigger ONE attempt to connect
        if (phantomProvider || currentWallets.some(w => w.name.toLowerCase().includes('phantom'))) {
          setView('connecting');
          setSelectedWalletName('Phantom');
          connectionInitiatedRef.current = true;
          phantomAutoConnectAttemptedRef.current = true;

          // Find and connect to Phantom via framework-kit
          const phantomWallet = currentWallets.find(w => w.name.toLowerCase().includes('phantom'));
          if (phantomWallet) {
            // Add a timeout to catch stuck connections
            const connectionTimeout = setTimeout(() => {
              console.warn('[ConnectWalletModal] Phantom connection timeout - Phantom in-app browser may be in a bad state');
              setError('Connection timed out. Please try refreshing the page or selecting your wallet manually.');
              setView('wallet_select');
            }, 10000); // 10 second timeout

            connect(phantomWallet.name)
              .then(() => {
                clearTimeout(connectionTimeout);
              })
              .catch((err) => {
                clearTimeout(connectionTimeout);
                console.error('[ConnectWalletModal] Phantom mobile connect error:', err);

                // Check if it's a user rejection vs stuck provider
                const isUserRejection = err?.message?.toLowerCase().includes('reject') ||
                                       err?.message?.toLowerCase().includes('cancel') ||
                                       err?.message?.toLowerCase().includes('user');

                if (isUserRejection) {
                  setError('Connection cancelled. Please try again.');
                } else {
                  setError('Could not connect to Phantom. Try refreshing the page or closing and reopening this tab in Phantom.');
                }
                setView('wallet_select');
              });
          } else {
            // Wallets not discovered yet, just show wallet select
            setView('wallet_select');
          }
          return;
        }

        setView('wallet_select');
        return;
      }

      if (connecting) {
        setView('connecting');
        return;
      }

      if (connected && publicKey && connectionInitiatedRef.current) {
        setView('sign_in');
        return;
      }

      setView('wallet_select');
    }
    wasOpenRef.current = open;
    // Note: wallets removed from deps - accessed via walletsRef to prevent re-render loops
  }, [open, connected, publicKey, isAuthenticated, authLoading, connecting, wallet, connect, onOpenChange]);

  // Handle wallet connection state changes
  useEffect(() => {
    if (!open) return;

    const phantomProvider = getPhantomProvider();
    const shouldCheckPhantomProvider = !selectedWalletName || selectedWalletName === 'Phantom';
    const isWalletReady = (connected && publicKey) || (shouldCheckPhantomProvider && phantomProvider);

    if (view === 'connecting' && isWalletReady && !isAuthenticated && !authLoading) {
      setView('sign_in');
    }
  }, [open, view, connected, publicKey, isAuthenticated, authLoading, selectedWalletName]);

  // Handle connection rejection
  useEffect(() => {
    if (!open || view !== 'connecting') return;

    if (!connecting && !connected && connectionInitiatedRef.current) {
      const timeout = setTimeout(() => {
        if (!connected) {
          setError(`Connection to ${selectedWalletName || 'wallet'} was cancelled`);
          setView('wallet_select');
          connectionInitiatedRef.current = false;
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [open, view, connecting, connected, selectedWalletName]);

  // Timeout fallback
  useEffect(() => {
    if (!open || view !== 'connecting') return;

    const timeout = setTimeout(() => {
      if (connected && publicKey) {
        setView('sign_in');
      } else if (!connecting) {
        setView('wallet_select');
      } else {
        setError('Wallet connection is taking too long. Please try again.');
        setView('error');
      }
    }, 30000);

    return () => clearTimeout(timeout);
  }, [open, view, connected, publicKey, connecting]);

  // Auto-close when authenticated
  useEffect(() => {
    if (isAuthenticated && open && !isSigningIn) {
      onOpenChange(false);
    }
  }, [isAuthenticated, open, isSigningIn, onOpenChange]);

  // Handle wallet selection - NOW USING FRAMEWORK-KIT
  const handleSelectWallet = useCallback(async (walletName: string) => {
    setError(null);
    setSelectedWalletName(walletName);

    // If already connected with this wallet, go to sign-in
    if (connected && wallet?.name === walletName && publicKey) {
      setView('sign_in');
      return;
    }

    // If connected with a different wallet, disconnect first
    if (connected && wallet?.name !== walletName) {
      try {
        await disconnect();
      } catch (err) {
        console.error('[ConnectWalletModal] Error disconnecting:', err);
      }
    }

    // Start connection using framework-kit
    setView('connecting');
    connectionInitiatedRef.current = true;

    try {
      await connect(walletName);
      // Connection successful - effect will handle transitioning to sign_in
    } catch (err) {
      console.error('[ConnectWalletModal] Connection error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
      setView('error');
      connectionInitiatedRef.current = false;
    }
  }, [connected, wallet, publicKey, disconnect, connect]);

  // Handle sign-in
  const handleSignIn = useCallback(async () => {
    const phantomProvider = getPhantomProvider();
    const isWalletReady = (connected && publicKey) || phantomProvider;

    if (!isWalletReady) {
      setError('Wallet not connected');
      setView('wallet_select');
      return;
    }

    setError(null);
    setIsSigningIn(true);
    setView('signing');

    try {
      await signIn();
      toast.success('Signed in successfully');
    } catch (err) {
      console.error('[ConnectWalletModal] Sign-in error:', err);
      const message = err instanceof Error ? err.message : 'Sign-in failed';

      if (message.includes('rejected') || message.includes('User rejected')) {
        setError('Signature rejected. Please try again.');
        setView('sign_in');
      } else if (message.includes('URI which is not allowed') || message.includes('signed for another app')) {
        setError('Session expired. Please try again.');
        setView('sign_in');
      } else {
        setError(message);
        setView('error');
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [connected, publicKey, signIn]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setError(null);
    const phantomProvider = getPhantomProvider();
    const isWalletReady = (connected && publicKey) || phantomProvider;

    if (isWalletReady) {
      setView('sign_in');
    } else {
      setView('wallet_select');
    }
  }, [connected, publicKey]);

  // Handle switching wallets
  const handleSwitchWallet = useCallback(async () => {
    setError(null);
    setSelectedWalletName(null);
    connectionInitiatedRef.current = false;
    phantomAutoConnectAttemptedRef.current = false; // Allow retry
    if (connected) {
      try {
        await disconnect();
      } catch (err) {
        console.error('[ConnectWalletModal] Error disconnecting:', err);
      }
    }
    setView('wallet_select');
  }, [connected, disconnect]);

  // Handle full reset
  const handleFullReset = useCallback(async () => {
    setIsResetting(true);
    setError(null);
    phantomAutoConnectAttemptedRef.current = false; // Allow retry
    try {
      await resetAuthState();
      onOpenChange(false);
    } catch (err) {
      console.error('[ConnectWalletModal] Error resetting:', err);
      setError('Failed to reset. Please try refreshing the page.');
    } finally {
      setIsResetting(false);
    }
  }, [resetAuthState, onOpenChange]);

  const getTitle = () => {
    switch (view) {
      case 'wallet_select': return 'Connect Wallet';
      case 'connecting': return 'Connecting...';
      case 'sign_in': return 'Sign In';
      case 'signing': return 'Signing...';
      case 'error': return 'Connection Error';
    }
  };

  const getDescription = () => {
    switch (view) {
      case 'wallet_select': return 'Select a wallet to connect and sign in.';
      case 'connecting': return 'Please approve the connection in your wallet.';
      case 'sign_in': return 'Sign in with your wallet to continue.';
      case 'signing': return 'Please sign the message in your wallet.';
      case 'error': return 'Something went wrong. Please try again.';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border/50 select-none">
        <DialogHeader>
          <DialogTitle className="select-none">{getTitle()}</DialogTitle>
          <DialogDescription className="select-none">{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4 select-none">
          {/* Error display */}
          {error && (
            <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg select-none">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive select-none">{error}</p>
            </div>
          )}

          {/* Wallet Selection View */}
          {view === 'wallet_select' && (
            <>
              {/* On mobile external browser, always show deep link options */}
              {shouldShowMobileDeepLinks() ? (
                <div className="space-y-2 select-none">
                  <p className="text-xs text-muted-foreground mb-2">
                    Open in your wallet app:
                  </p>
                  <a
                    href={getPhantomDeepLink()}
                    className="w-full flex items-center justify-center p-4 bg-muted hover:bg-muted/80 rounded-lg border border-border/50 transition-colors cursor-pointer select-none"
                  >
                    <span className="font-medium">Phantom</span>
                    <span className="ml-2 text-xs text-muted-foreground">→</span>
                  </a>
                  <a
                    href={getSolflareDeepLink()}
                    className="w-full flex items-center justify-center p-4 bg-muted hover:bg-muted/80 rounded-lg border border-border/50 transition-colors cursor-pointer select-none"
                  >
                    <span className="font-medium">Solflare</span>
                    <span className="ml-2 text-xs text-muted-foreground">→</span>
                  </a>
                  <p className="text-xs text-muted-foreground text-center mt-4">
                    Don&apos;t have a wallet?{' '}
                    <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Get Phantom
                    </a>
                  </p>
                </div>
              ) : wallets.length === 0 ? (
                <div className="text-center py-8 select-none">
                  <Wallet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-2 select-none">No wallets detected</p>
                  <p className="text-sm text-muted-foreground select-none">
                    Please install{' '}
                    <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Phantom
                    </a>{' '}
                    or{' '}
                    <a href="https://solflare.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Solflare
                    </a>{' '}
                    to continue.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 select-none">

                  {/* Show detected wallets (desktop or in-app browser) */}
                  {wallets.map((w) => {
                    const iconUrl = walletIcons.get(w.name) || '';
                    return (
                      <button
                        key={w.name}
                        onClick={() => handleSelectWallet(w.name)}
                        disabled={connecting}
                        className="w-full flex items-center gap-3 p-4 bg-muted hover:bg-muted/80 rounded-lg border border-border/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
                      >
                        {iconUrl && (
                          <img src={iconUrl} alt={w.name} className="w-8 h-8 rounded-lg select-none pointer-events-none" />
                        )}
                        <span className="font-medium">{w.name}</span>
                        {w.ready && (
                          <span className="ml-auto text-xs text-muted-foreground">Detected</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Connecting View */}
          {view === 'connecting' && (() => {
            const iconUrl = selectedWalletName ? (walletIcons.get(selectedWalletName) || '') : '';
            return (
            <div className="flex flex-col items-center py-8 gap-4 select-none">
              {iconUrl && (
                <img
                  src={iconUrl}
                  alt={selectedWalletName || 'Wallet'}
                  className="w-12 h-12 rounded-lg select-none pointer-events-none"
                />
              )}
              <p className="text-muted-foreground select-none">
                {selectedWalletName
                  ? `Connecting to ${selectedWalletName}...`
                  : 'Waiting for wallet connection...'}
              </p>
              <p className="text-xs text-muted-foreground text-center select-none">
                Please approve the connection in your wallet
              </p>
              <Button variant="ghost" size="sm" onClick={handleSwitchWallet} className="select-none">
                Cancel
              </Button>
            </div>
            );
          })()}

          {/* Sign In View */}
          {view === 'sign_in' && (() => {
            const phantomProvider = getPhantomProvider();
            const displayPublicKey = publicKey || phantomProvider?.publicKey;
            const displayWalletName = wallet?.name || (phantomProvider ? 'Phantom' : 'Wallet');
            const displayIcon = walletIcons.get(displayWalletName) || '';

            return (
              <div className="space-y-4 select-none">
                <div className="flex items-center gap-3 p-4 bg-muted rounded-lg border border-border/50 select-none">
                  {displayIcon && (
                    <img src={displayIcon} alt={displayWalletName} className="w-10 h-10 rounded-lg select-none pointer-events-none" />
                  )}
                  <div className="flex-1 min-w-0 select-none">
                    <p className="font-medium select-none">{displayWalletName}</p>
                    <p className="text-sm text-muted-foreground truncate select-none">
                      {displayPublicKey?.toBase58().slice(0, 6)}...{displayPublicKey?.toBase58().slice(-4)}
                    </p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
                </div>

                <Button
                  onClick={handleSignIn}
                  className={`w-full bg-primary hover:bg-primary/80 select-none ${!isSigningIn ? 'animate-glow-pulse' : ''}`}
                  style={!isSigningIn ? { animation: 'glow-pulse 1.5s ease-in-out infinite' } : undefined}
                  size="lg"
                  disabled={isSigningIn}
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>

                <button
                  onClick={handleSwitchWallet}
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
                >
                  Use a different wallet
                </button>
              </div>
            );
          })()}

          {/* Signing View */}
          {view === 'signing' && (
            <div className="flex flex-col items-center py-8 gap-4 select-none">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-muted-foreground select-none">Waiting for signature...</p>
              <p className="text-xs text-muted-foreground text-center select-none">
                Please approve the sign-in request in your wallet
              </p>
            </div>
          )}

          {/* Error View */}
          {view === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4 select-none">
              <Button onClick={handleRetry} variant="outline" className="gap-2 select-none">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <button
                onClick={handleSwitchWallet}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors select-none"
              >
                Use a different wallet
              </button>

              <div className="w-full pt-4 mt-2 border-t border-border/50 select-none">
                <p className="text-xs text-muted-foreground text-center mb-3 select-none">
                  Still having issues? Try resetting your connection.
                </p>
                <Button
                  onClick={handleFullReset}
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-destructive gap-2 select-none"
                  disabled={isResetting}
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      Reset Connection
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Terms */}
          {(view === 'wallet_select' || view === 'sign_in') && wallets.length > 0 && (
            <p className="text-xs text-muted-foreground text-center pt-2 select-none">
              By connecting, you agree to our{' '}
              <a href="/terms" className="underline hover:text-foreground">Terms of Service</a>{' '}
              and{' '}
              <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
            </p>
          )}

          {/* Reset link */}
          {(view === 'wallet_select' || view === 'sign_in') && (
            <div className="pt-2 border-t border-border/30 mt-2 select-none">
              <button
                onClick={handleFullReset}
                disabled={isResetting}
                className="w-full text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors py-2 cursor-pointer select-none"
              >
                {isResetting ? 'Resetting...' : <>Having trouble? <span className="underline">Reset connection</span></>}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
