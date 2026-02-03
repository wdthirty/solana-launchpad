/**
 * Swap Client
 *
 * Client for executing token swaps using Jupiter Ultra API with
 * traditional RPC transaction submission.
 *
 * Flow:
 * 1. Get quote from Jupiter Ultra API (includes transaction)
 * 2. Build and optimize transaction (compute units, priority fees)
 * 3. User signs transaction via wallet
 * 4. Send via standard RPC connection
 * 5. Confirm and return result
 */

import {
  Connection,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  SwapQuote,
  SwapTransaction,
  SwapAnalytics,
  SwapFees,
  SwapResult,
  SOL_MINT,
  DEFAULT_SWAP_CONFIG,
} from './types';
import { getConnection } from '@/lib/solana/config';

export class SwapClient {
  private connection: Connection;
  private quoteCache: Map<string, { quote: SwapQuote; timestamp: number }> = new Map();
  public analytics: SwapAnalytics = {
    swapAttemptCount: 0,
    swapSuccessCount: 0,
    swapFailureCount: 0,
    averageSwapTime: 0,
  };
  private readonly CACHE_DURATION = DEFAULT_SWAP_CONFIG.quoteCacheDuration;

  constructor(_rpcUrl?: string) {
    // Use singleton connection for efficiency
    this.connection = getConnection();
  }

  private getCacheKey(inputMint: string, outputMint: string, amount: string, slippage: number): string {
    return `${inputMint}-${outputMint}-${amount}-${slippage}`;
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  /**
   * Clear quote cache after a trade to ensure fresh quotes
   */
  public clearQuoteCache(): void {
    this.quoteCache.clear();
  }

  private logError(type: string, message: string): void {
    console.error(`SwapClient Error [${type}]:`, message);
  }

  private updateAnalytics(swapTime?: number, success?: boolean): void {
    this.analytics.swapAttemptCount++;

    if (swapTime !== undefined) {
      const totalSwapTime = this.analytics.averageSwapTime * (this.analytics.swapAttemptCount - 1) + swapTime;
      this.analytics.averageSwapTime = totalSwapTime / this.analytics.swapAttemptCount;
    }

    if (success !== undefined) {
      if (success) {
        this.analytics.swapSuccessCount++;
      } else {
        this.analytics.swapFailureCount++;
      }
    }
  }

  /**
   * Get swap quote from Jupiter Ultra API
   *
   * @param inputMint - Input token mint address
   * @param outputMint - Output token mint address
   * @param amount - Amount in smallest units (lamports for SOL, token decimals for tokens)
   * @param slippage - Slippage in basis points (50 = 0.5%)
   * @param taker - Wallet address (required for transaction field)
   * @returns Swap quote with transaction data
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippage: number = DEFAULT_SWAP_CONFIG.slippageBps,
    taker?: string
  ): Promise<SwapQuote> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey(inputMint, outputMint, amount, slippage);

    // Check cache first
    const cached = this.quoteCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.quote;
    }

    try {
      // Use Jupiter Ultra API for quotes
      let quoteUrl =
        `https://lite-api.jup.ag/ultra/v1/order?` +
        `inputMint=${inputMint}` +
        `&outputMint=${outputMint}` +
        `&amount=${amount}`;

      // Add taker parameter if provided (required for transaction field)
      if (taker) {
        quoteUrl += `&taker=${taker}`;
      }

      const response = await fetch(quoteUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Ultra API error: ${response.status}`);
      }

      const ultraQuote = await response.json();

      // Check for error messages in the response
      if (ultraQuote.errorMessage) {
        const isInsufficientBalance = ultraQuote.errorMessage.toLowerCase().includes('insufficient');
        const userFriendlyMessage = isInsufficientBalance
          ? 'Insufficient balance for this trade'
          : `Quote error: ${ultraQuote.errorMessage}`;

        // Return error response instead of throwing
        return {
          inputMint,
          outputMint,
          inAmount: amount,
          outAmount: '0',
          otherAmountThreshold: '0',
          swapMode: 'ExactIn',
          slippageBps: slippage,
          priceImpactPct: 0,
          routePlan: [],
          contextSlot: 0,
          timeTaken: Date.now() - startTime,
          error: userFriendlyMessage,
          isInsufficientBalance,
          originalError: ultraQuote.errorMessage,
        };
      }

      // Convert ultra API response to our SwapQuote format
      const quote: SwapQuote = {
        inputMint,
        outputMint,
        inAmount: ultraQuote.inAmount || amount,
        outAmount: ultraQuote.outAmount,
        otherAmountThreshold: ultraQuote.otherAmountThreshold || ultraQuote.outAmount,
        swapMode: ultraQuote.swapMode || 'ExactIn',
        slippageBps: ultraQuote.slippageBps || slippage,
        priceImpactPct: ultraQuote.priceImpact || 0,
        routePlan: ultraQuote.routePlan || [],
        contextSlot: ultraQuote.contextSlot || 0,
        timeTaken: Date.now() - startTime,
        transaction: ultraQuote.transaction,
        requestId: ultraQuote.requestId,
      };

      // Cache the quote
      this.quoteCache.set(cacheKey, { quote, timestamp: Date.now() });

      return quote;
    } catch (error) {
      this.logError('QUOTE_FETCH', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Build transaction from Jupiter Ultra API response
   *
   * Jupiter Ultra API already provides an optimized transaction with compute budget,
   * so we use it as-is without modification to avoid Phantom warnings.
   *
   * @param swapTransaction - Swap transaction from Jupiter
   * @param fees - Priority fees and compute units (unused - Jupiter handles this)
   * @param userPublicKey - User's wallet address (unused - already set in transaction)
   * @returns Transaction ready for signing
   */
  async buildAndOptimizeTransaction(
    swapTransaction: SwapTransaction,
    _fees: SwapFees,
    _userPublicKey: string
  ): Promise<VersionedTransaction> {
    try {
      // Jupiter Ultra API provides a fully optimized transaction
      // Use it directly without modification to maintain Phantom compatibility
      const transaction = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction.swapTransaction, 'base64')
      );

      return transaction;
    } catch (error) {
      this.logError('TRANSACTION_BUILD', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Simulate transaction before signing (Phantom guideline compliance)
   * Per https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings
   * simulate with sigVerify: false to identify potential failures before signing
   *
   * @param transaction - Unsigned transaction to simulate
   * @returns Simulation result
   */
  async simulateTransaction(transaction: VersionedTransaction): Promise<{ success: boolean; error?: string }> {
    try {
      const simulation = await this.connection.simulateTransaction(transaction, {
        sigVerify: false, // Per Phantom docs: simulate without signature verification
        commitment: 'confirmed',
      });

      if (simulation.value.err) {
        const errorMessage = JSON.stringify(simulation.value.err);
        console.error('Transaction simulation failed:', errorMessage);
        return { success: false, error: errorMessage };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown simulation error';
      console.error('Simulation error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send transaction via standard RPC
   *
   * @param transaction - Signed transaction
   * @returns Transaction signature
   */
  async sendTransaction(transaction: VersionedTransaction): Promise<string> {
    const startTime = Date.now();

    try {
      // Serialize the transaction
      const serializedTransaction = transaction.serialize();

      // Send via standard RPC connection with retry logic
      let signature: string | null = null;
      let lastError: Error | null = null;
      const maxRetries = 3;
      const retryDelay = 1000;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          signature = await this.connection.sendRawTransaction(serializedTransaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 0, // We handle retries ourselves
          });

          if (signature) {
            break; // Success, exit retry loop
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`Transaction send attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);

          if (attempt < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!signature) {
        throw lastError || new Error('Failed to send transaction after retries');
      }

      const swapTime = Date.now() - startTime;
      this.updateAnalytics(swapTime, true);

      return signature;
    } catch (error) {
      const swapTime = Date.now() - startTime;
      this.updateAnalytics(swapTime, false);
      this.logError('TRANSACTION_SEND', error instanceof Error ? error.message : 'Unknown error');

      // Check for rent exemption error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('insufficient funds for rent') ||
        (errorMessage.includes('Transaction results in an account') &&
          errorMessage.includes('with insufficient funds for rent'))
      ) {
        throw new Error('INSUFFICIENT_RENT_EXEMPTION');
      }

      throw error;
    }
  }

  /**
   * Confirm transaction
   *
   * @param signature - Transaction signature
   * @param maxRetries - Maximum retry attempts
   * @returns Whether transaction was confirmed
   */
  async confirmTransaction(signature: string, maxRetries: number = 5): Promise<boolean> {
    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const statuses = await this.connection.getSignatureStatuses([signature], {
            searchTransactionHistory: true,
          });

          const status = statuses.value[0];

          if (!status) {
            if (attempt < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
              continue;
            }
            return false;
          }

          if (status.err) {
            console.error('Transaction failed:', status.err);
            return false;
          }

          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            return true;
          }

          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
          }
        } catch (error) {
          console.warn(`Error checking transaction status (attempt ${attempt}):`, error);
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
          }
        }
      }

      return false;
    } catch (error) {
      console.error('Transaction confirmation error:', error);
      return false;
    }
  }

  /**
   * Execute complete swap flow
   *
   * @param inputMint - Input token mint
   * @param outputMint - Output token mint
   * @param amount - Amount in smallest units
   * @param slippage - Slippage in basis points
   * @param fees - Priority fees and compute units
   * @param userPublicKey - User's wallet address
   * @param signTransaction - Function to sign transaction
   * @returns Swap result with signature and confirmation promise
   */
  async executeSwap(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippage: number = DEFAULT_SWAP_CONFIG.slippageBps,
    fees: SwapFees,
    userPublicKey: string,
    signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>
  ): Promise<SwapResult> {
    try {
      // Get quote (includes transaction from ultra API)
      const quote = await this.getQuote(inputMint, outputMint, amount, slippage, userPublicKey);

      // Ultra API already provides the transaction
      if (!quote.transaction) {
        throw new Error('No transaction found in quote response');
      }

      // Determine trade type
      const isBuy = inputMint === SOL_MINT;

      // Build and optimize transaction
      const transaction = await this.buildAndOptimizeTransaction(
        { swapTransaction: quote.transaction, lastValidBlockHeight: 0 },
        fees,
        userPublicKey
      );

      // Simulate transaction before signing (Phantom guideline compliance)
      // Per https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings
      const simulation = await this.simulateTransaction(transaction);
      if (!simulation.success) {
        throw new Error(`Transaction simulation failed: ${simulation.error}`);
      }

      // Sign transaction (only after successful simulation)
      const signedTransaction = await signTransaction(transaction);

      // Send transaction via standard RPC
      const signature = await this.sendTransaction(signedTransaction);

      // Clear quote cache to ensure fresh quotes for next trade
      this.clearQuoteCache();

      // Handle confirmation in background (for UI feedback only)
      const confirmationPromise = this.confirmTransaction(signature, 5);

      // Return immediately with success and confirmation promise
      return {
        signature,
        success: true,
        tokenAmount: isBuy ? quote.outAmount : amount, // For sells, use the input amount (tokens being sold)
        tokenSymbol: isBuy ? 'tokens' : 'SOL', // This will be updated by the calling component
        confirmationPromise,
      };
    } catch (error) {
      this.logError('SWAP_EXECUTION', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    // No cleanup needed for standard RPC connection
  }
}
