'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { useSwapClient } from '@/hooks/useSwapClient';
import { SOL_MINT, DEFAULT_SWAP_CONFIG } from '@/lib/swap/types';
import { getConnection } from '@/lib/solana/config';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { useAuth } from '@/contexts/AuthContext';
import { ConnectWalletModal } from '@/components/auth/ConnectWalletModal';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

interface MobileTradingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenSymbol?: string;
  tokenDecimals?: number;
  tokenIcon?: string;
  // Callback when a swap is successful with token amount bought
  onSwapSuccess?: (tokenAmount: number, isBuy: boolean) => void;
}

// Helper function to format numbers
function formatNumber(value: number, decimals: number = 6): string {
  if (value === 0) return '0';
  const formatter = new Intl.NumberFormat(undefined, {
    minimumSignificantDigits: Math.min(decimals, 3),
    maximumSignificantDigits: decimals,
  });
  return formatter.format(value);
}

export function MobileTradingDrawer({
  open,
  onOpenChange,
  tokenSymbol,
  tokenDecimals = 6,
  tokenIcon,
  onSwapSuccess,
}: MobileTradingDrawerProps) {
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('0.00');
  const [quote, setQuote] = useState<{ outAmount: string; priceImpact: number } | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [isTrading, setIsTrading] = useState(false);

  const params = useParams();
  const { publicKey, connected } = useWallet();
  const { isAuthenticated } = useAuth();
  const { executeSwap, getQuote } = useSwapClient();
  const { profile } = useUserProfile();

  // Custom connect wallet modal state (handles both connection and sign-in)
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  // SOL balance from useUserProfile (real-time via balance-aggregator)
  const solBalance = profile?.solBalance ?? 0;

  // Get token address from URL params
  const tokenAddress = params.address as string;

  // Fetch token balance (SOL balance comes from useUserProfile)
  const fetchTokenBalance = useCallback(async () => {
    if (!publicKey || !connected || !tokenAddress) return;

    try {
      const connection = getConnection();
      const { PublicKey } = await import('@solana/web3.js');
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: new PublicKey(tokenAddress),
      });

      if (tokenAccounts.value.length > 0) {
        const accountInfo = tokenAccounts.value[0].account.data.parsed.info;
        const uiAmount = accountInfo.tokenAmount.uiAmount;
        setTokenBalance(uiAmount || 0);
      } else {
        setTokenBalance(0);
      }
    } catch (error) {
      console.warn('Error fetching token balance:', error);
      setTokenBalance(0);
    }
  }, [publicKey, connected, tokenAddress]);

  // Fetch token balance when drawer opens
  useEffect(() => {
    if (open && connected && publicKey) {
      fetchTokenBalance();
    }
  }, [open, connected, publicKey, fetchTokenBalance]);

  // Debounced quote fetching
  useEffect(() => {
    const uiAmount = parseFloat(amount);
    if (!publicKey || isNaN(uiAmount) || uiAmount <= 0) {
      setQuote(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoadingQuote(true);
      try {
        // Convert UI amount to smallest units
        const jupiterAmount =
          activeTab === 'sell'
            ? Math.round(uiAmount * 10 ** tokenDecimals)
            : Math.round(uiAmount * 10 ** 9);

        // Determine input/output mints based on mode
        const inputMint = activeTab === 'buy' ? SOL_MINT : tokenAddress;
        const outputMint = activeTab === 'buy' ? tokenAddress : SOL_MINT;

        const quoteData = await getQuote(inputMint, outputMint, jupiterAmount.toString(), 50);

        if (!quoteData.error) {
          setQuote({
            outAmount: quoteData.outAmount,
            priceImpact: quoteData.priceImpactPct,
          });
        } else {
          setQuote(null);
        }
      } catch (error) {
        console.error('Error fetching quote:', error);
        setQuote(null);
      } finally {
        setIsLoadingQuote(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [amount, activeTab, publicKey, tokenAddress, tokenDecimals, getQuote]);

  const handleQuickAmount = (value: string) => {
    if (value === 'Reset') {
      setAmount('0.00');
    } else if (value === '100%') {
      const maxAmount = activeTab === 'buy' ? solBalance : tokenBalance;
      setAmount(maxAmount.toFixed(9));
    } else if (value === '25%' || value === '50%' || value === '75%') {
      const balance = activeTab === 'buy' ? solBalance : tokenBalance;
      const percentage = parseFloat(value) / 100;
      setAmount((balance * percentage).toFixed(9));
    } else {
      // For buy mode: fixed SOL amounts
      setAmount(value);
    }
  };

  const handleSubmit = async () => {
    if (!connected || !publicKey || !tokenAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    const uiAmount = parseFloat(amount);
    if (isNaN(uiAmount) || uiAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    // Check balances
    const balance = activeTab === 'buy' ? solBalance : tokenBalance;
    if (uiAmount > balance) {
      toast.error(`Insufficient balance (${balance.toFixed(6)} ${activeTab === 'buy' ? 'SOL' : tokenSymbol})`);
      return;
    }

    // Check SOL balance for fees
    if (activeTab === 'buy') {
      const requiredSol = uiAmount + 0.005;
      if (solBalance < requiredSol) {
        toast.error(`Insufficient SOL. Need ${requiredSol.toFixed(4)} SOL`);
        return;
      }
    } else {
      if (solBalance < 0.005) {
        toast.error('Insufficient SOL for fees');
        return;
      }
    }

    setIsTrading(true);

    try {
      // Convert UI amount to smallest units
      const jupiterAmount =
        activeTab === 'sell'
          ? Math.round(uiAmount * 10 ** tokenDecimals)
          : Math.round(uiAmount * 10 ** 9);

      toast('Swapping...');

      // Determine input/output mints
      const inputMint = activeTab === 'buy' ? SOL_MINT : tokenAddress;
      const outputMint = activeTab === 'buy' ? tokenAddress : SOL_MINT;

      // Execute swap
      const result = await executeSwap(
        inputMint,
        outputMint,
        jupiterAmount.toString(),
        50,
        {
          priorityMicroLamports: DEFAULT_SWAP_CONFIG.priorityMicroLamports,
          computeUnits: DEFAULT_SWAP_CONFIG.computeUnits,
        },
        tokenSymbol
      );

      if (result.success) {
        const action = activeTab === 'buy' ? 'Bought' : 'Sold';
        const tokenAmount = parseFloat(result.tokenAmount || '0') / Math.pow(10, tokenDecimals);
        const formattedAmount = formatNumber(tokenAmount);

        toast.success(`${action} ${formattedAmount} ${result.tokenSymbol || tokenSymbol}`);

        // Notify parent of successful swap with token amount
        onSwapSuccess?.(tokenAmount, activeTab === 'buy');

        // Reset amount
        setAmount('0.00');

        // Close drawer after successful trade
        onOpenChange(false);

        // Refresh token balance after a delay
        setTimeout(() => {
          fetchTokenBalance();
        }, 3000);

        // Handle confirmation in background
        if (result.confirmationPromise) {
          result.confirmationPromise.then((confirmed) => {
            if (!confirmed) {
              toast.error('Swap failed, try again');
            } else {
              setTimeout(() => {
                fetchTokenBalance();
              }, 2000);
            }
          });
        }
      } else {
        toast.error('Swap failed');
      }
    } catch (err) {
      console.error('Trade error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage === 'INSUFFICIENT_RENT_EXEMPTION') {
        toast.error('Insufficient balance for token account creation');
      } else {
        toast.error('Transaction failed');
      }
    } finally {
      setIsTrading(false);
    }
  };

  // Calculate quote display
  const getQuoteDisplay = () => {
    if (!quote) return null;

    const outAmount = parseFloat(quote.outAmount);
    const decimals = activeTab === 'buy' ? tokenDecimals : 9;
    const uiOutAmount = outAmount / Math.pow(10, decimals);

    return {
      amount: formatNumber(uiOutAmount, 6),
      symbol: activeTab === 'buy' ? tokenSymbol : 'SOL',
      priceImpact: quote.priceImpact,
    };
  };

  const quoteDisplay = getQuoteDisplay();
  const displayedBalance = activeTab === 'buy' ? solBalance : tokenBalance;
  const displayedSymbol = activeTab === 'buy' ? 'SOL' : tokenSymbol;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="bg-[#111114] border-border/50 max-h-[60dvh]" hideOverlay>
        <DrawerTitle className="sr-only">Trade {tokenSymbol}</DrawerTitle>
        <div className="px-4 pb-6 pt-4">
          {/* Buy/Sell Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setActiveTab('buy');
                setAmount('0.00');
              }}
              className={`flex-1 py-3 text-sm font-medium transition-all rounded-lg cursor-pointer ${
                activeTab === 'buy'
                  ? 'bg-green-500 text-black'
                  : 'bg-background/80 text-muted-foreground hover:text-white'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => {
                setActiveTab('sell');
                setAmount('0.00');
              }}
              className={`flex-1 py-3 text-sm font-medium transition-all rounded-lg cursor-pointer ${
                activeTab === 'sell'
                  ? 'bg-red-500 text-black'
                  : 'bg-background/80 text-muted-foreground hover:text-white'
              }`}
            >
              Sell
            </button>
          </div>

          {/* Balance Display */}
          {connected && (
            <div className="flex justify-between items-center text-xs mb-3">
              <span className="text-muted-foreground">
                Balance: <span className="text-white font-medium">{displayedBalance.toFixed(6)} {displayedSymbol}</span>
              </span>
              <button
                onClick={fetchTokenBalance}
                className="text-muted-foreground hover:text-white transition-colors cursor-pointer"
                title="Refresh balance"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Amount Input */}
          <div className="rounded-lg overflow-hidden bg-background/80 border border-border/50 mb-3">
            <div className="flex items-center justify-between px-4 py-4">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  // Replace comma with period for locales that use comma as decimal separator
                  const v = e.target.value.replace(',', '.');
                  if (v === '' || /^\d*\.?\d*$/.test(v)) {
                    setAmount(v);
                  }
                }}
                onFocus={() => amount === '0.00' && setAmount('')}
                placeholder="0.00"
                className="flex-1 bg-transparent outline-none text-xl font-medium text-white placeholder:text-muted-foreground"
              />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {activeTab === 'buy' ? 'SOL' : tokenSymbol}
                </span>
                {activeTab === 'buy' ? (
                  <img
                    src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"
                    alt="Solana"
                    className="w-6 h-6 rounded-full shrink-0 object-cover"
                  />
                ) : (
                  tokenIcon ? (
                    <img
                      src={tokenIcon}
                      alt={tokenSymbol}
                      className="w-6 h-6 rounded-full shrink-0 object-cover"
                      onError={(e) => {
                        e.currentTarget.src = 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora';
                      }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted shrink-0" />
                  )
                )}
              </div>
            </div>
          </div>

          {/* Quote Display */}
          {parseFloat(amount) > 0 && connected && (
            <div className="rounded-lg px-4 py-3 text-xs bg-background/50 border border-border/50 mb-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">You'll get:</span>
                <span className="font-medium text-white">
                  {isLoadingQuote ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Loading...
                    </span>
                  ) : quoteDisplay ? (
                    `${quoteDisplay.amount} ${quoteDisplay.symbol}`
                  ) : (
                    '--'
                  )}
                </span>
              </div>
              {quoteDisplay && (
                <div className="flex justify-between items-center mt-2">
                  <span className="text-muted-foreground">Price Impact:</span>
                  <span className={`font-medium ${activeTab === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                    {activeTab === 'buy' ? '+' : '-'}
                    {Math.abs(quoteDisplay.priceImpact).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Quick Amount Buttons */}
          <div className="flex gap-1.5 mb-4">
            {activeTab === 'buy' ? (
              // Buy mode: Fixed SOL amounts
              ['Reset', '0.1', '0.5', '1', '100%'].map((label) => (
                <button
                  key={label}
                  onClick={() => handleQuickAmount(label)}
                  className="flex-1 px-1.5 py-2 rounded-md text-xs text-center text-muted-foreground hover:text-white hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  {label === '100%' ? 'Max' : label === 'Reset' ? label : `${label} SOL`}
                </button>
              ))
            ) : (
              // Sell mode: Percentage amounts
              ['Reset', '25%', '50%', '75%', '100%'].map((label) => (
                <button
                  key={label}
                  onClick={() => handleQuickAmount(label)}
                  className="flex-1 px-1.5 py-2 rounded-md text-xs text-center text-muted-foreground hover:text-white hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  {label}
                </button>
              ))
            )}
          </div>

          {/* Action Button */}
          <button
            onClick={() => {
              // Not connected OR not authenticated: open modal
              // The modal will handle showing the right view
              if (!connected || !isAuthenticated) {
                setConnectModalOpen(true);
                return;
              }
              // Fully authenticated: execute trade
              handleSubmit();
            }}
            disabled={isTrading}
            className={`w-full py-4 rounded-lg text-sm font-medium text-black transition-all disabled:opacity-50 hover:opacity-90 cursor-pointer ${
              !connected || !isAuthenticated
                ? 'bg-green-500 hover:bg-green-600'
                : activeTab === 'buy'
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {!connected
              ? 'Connect Wallet to Trade'
              : !isAuthenticated
              ? 'Sign In to Trade'
              : isTrading
              ? 'Processing...'
              : activeTab === 'buy'
              ? 'Buy'
              : 'Sell'}
          </button>
        </div>

        {/* Connect Wallet Modal - handles both connection and sign-in */}
        <ConnectWalletModal
          open={connectModalOpen}
          onOpenChange={setConnectModalOpen}
        />
      </DrawerContent>
    </Drawer>
  );
}
