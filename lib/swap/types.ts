/**
 * Jupiter Swap Types
 *
 * Type definitions for Jupiter Ultra API and swap functionality
 */

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    feeBps: number;
    feeAccounts: Record<string, string>;
  };
  priceImpactPct: number;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
  transaction?: string; // Ultra API includes the transaction
  requestId?: string; // Ultra API includes request ID
  error?: string; // Error message if quote failed
  isInsufficientBalance?: boolean; // Flag for insufficient balance errors
  originalError?: string; // Original error from API
}

export interface SwapTransaction {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

export interface SwapAnalytics {
  swapAttemptCount: number;
  swapSuccessCount: number;
  swapFailureCount: number;
  averageSwapTime: number;
}

export interface SwapFees {
  priorityMicroLamports: number;
  computeUnits: number;
}

export interface SwapResult {
  signature: string;
  success: boolean;
  tokenAmount?: string;
  tokenSymbol?: string;
  confirmationPromise?: Promise<boolean>;
}

/**
 * Custom error class for Ultra API errors
 */
export class UltraAPIError extends Error {
  constructor(
    message: string,
    public readonly originalError?: string,
    public readonly isInsufficientBalance?: boolean
  ) {
    super(message);
    this.name = 'UltraAPIError';
  }
}

/**
 * SOL mint address constant
 */
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Default swap configuration
 */
export const DEFAULT_SWAP_CONFIG = {
  slippageBps: 50, // 0.5%
  priorityMicroLamports: 100000, // 0.0001 SOL
  computeUnits: 200000,
  confirmationTimeout: 15000, // 15 seconds
  quoteCacheDuration: 30000, // 30 seconds
} as const;
