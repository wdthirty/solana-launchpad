/**
 * useSwapClient Hook
 *
 * React hook for using the SwapClient with wallet integration
 */

import { useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { SwapClient } from '@/lib/swap/SwapClient';
import { SwapFees } from '@/lib/swap/types';
import type { VersionedTransaction } from '@solana/web3.js';

// Global SwapClient instance
let swapClientInstance: SwapClient | null = null;

const getSwapClient = (): SwapClient => {
  if (!swapClientInstance) {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT ||
      process.env.NEXT_PUBLIC_RPC_URL ||
      'https://api.mainnet-beta.solana.com';

    swapClientInstance = new SwapClient(rpcUrl);
  }
  return swapClientInstance;
};

export const useSwapClient = () => {
  const { publicKey, signTransaction } = useWallet();

  // Clear swap client cache when user changes
  const swapClient = useMemo(() => {
    const client = getSwapClient();
    // Clear cache when user changes to ensure fresh state
    client.clearQuoteCache();
    return client;
  }, [publicKey?.toBase58()]);

  const signTransactionWithWallet = useCallback(
    async (transaction: VersionedTransaction): Promise<VersionedTransaction> => {
      if (!signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }

      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      try {
        // Use the wallet's signTransaction method directly
        const signedTransaction = await signTransaction(transaction);

        // Ensure we return a VersionedTransaction
        if ('version' in signedTransaction) {
          return signedTransaction as VersionedTransaction;
        } else {
          throw new Error('Expected VersionedTransaction but got legacy Transaction');
        }
      } catch (error) {
        console.error('Transaction signing failed:', error);
        throw new Error('Failed to sign transaction');
      }
    },
    [signTransaction, publicKey]
  );

  const executeSwap = useCallback(
    async (
      inputMint: string,
      outputMint: string,
      amount: string,
      slippage: number = 50,
      fees: SwapFees,
      tokenSymbol?: string
    ) => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      const result = await swapClient.executeSwap(
        inputMint,
        outputMint,
        amount,
        slippage,
        fees,
        publicKey.toBase58(),
        signTransactionWithWallet
      );

      // Update token symbol if provided
      if (tokenSymbol && result.tokenAmount) {
        result.tokenSymbol = tokenSymbol;
      }

      return result;
    },
    [swapClient, publicKey, signTransactionWithWallet]
  );

  const getQuote = useCallback(
    async (inputMint: string, outputMint: string, amount: string, slippage: number = 50) => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      return await swapClient.getQuote(inputMint, outputMint, amount, slippage, publicKey.toBase58());
    },
    [swapClient, publicKey]
  );

  return {
    swapClient,
    executeSwap,
    getQuote,
    clearQuoteCache: () => swapClient.clearQuoteCache(),
    isConnected: !!publicKey,
    userAddress: publicKey?.toBase58() || null,
  };
};
