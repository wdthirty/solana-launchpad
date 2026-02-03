import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl, Connection, Commitment } from '@solana/web3.js';

// Singleton connection cache
let connectionInstance: Connection | null = null;
let connectionEndpoint: string | null = null;

/**
 * Get the current Solana network from environment variables
 * Defaults to devnet for safety
 */
export function getSolanaNetwork(): WalletAdapterNetwork {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK as WalletAdapterNetwork;

  // Always default to devnet if not explicitly set
  if (!network || !Object.values(WalletAdapterNetwork).includes(network)) {
    console.warn('⚠️ NEXT_PUBLIC_SOLANA_NETWORK not set or invalid, defaulting to devnet');
    return WalletAdapterNetwork.Devnet;
  }

  return network;
}

/**
 * Get the Solana RPC endpoint
 * Uses custom endpoint if provided, otherwise defaults to Solana's public RPC
 */
export function getSolanaEndpoint(): string {
  const customEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT;

  if (customEndpoint) {
    return customEndpoint;
  }

  const network = getSolanaNetwork();
  const endpoint = clusterApiUrl(network);

  return endpoint;
}

/**
 * Create a new Solana connection with the configured endpoint
 * @param commitment - The commitment level for the connection (default: 'confirmed')
 * @deprecated Use getConnection() instead for singleton pattern
 */
export function createSolanaConnection(commitment: Commitment = 'confirmed'): Connection {
  const endpoint = getSolanaEndpoint();
  return new Connection(endpoint, commitment);
}

/**
 * Get a singleton Solana connection instance
 * Reuses the same connection to avoid creating multiple instances
 * @param commitment - The commitment level for the connection (default: 'confirmed')
 */
export function getConnection(commitment: Commitment = 'confirmed'): Connection {
  const endpoint = getSolanaEndpoint();

  // Return existing connection if endpoint matches
  if (connectionInstance && connectionEndpoint === endpoint) {
    return connectionInstance;
  }

  // Create new connection and cache it
  connectionInstance = new Connection(endpoint, commitment);
  connectionEndpoint = endpoint;

  return connectionInstance;
}

/**
 * Check if the current network is devnet
 */
export function isDevnet(): boolean {
  return getSolanaNetwork() === WalletAdapterNetwork.Devnet;
}

/**
 * Check if the current network is mainnet
 * IMPORTANT: This should be false during development!
 */
export function isMainnet(): boolean {
  return getSolanaNetwork() === WalletAdapterNetwork.Mainnet;
}

/**
 * Assert that we're on devnet (useful for development-only features)
 * Throws an error if not on devnet
 */
export function assertDevnet(): void {
  if (!isDevnet()) {
    throw new Error(
      `❌ This operation is only allowed on devnet. Current network: ${getSolanaNetwork()}`
    );
  }
}

/**
 * Get a Solana explorer URL for a transaction or address
 * @param signature - Transaction signature or address
 * @param type - Type of entity ('tx' for transaction, 'account' for address)
 */
export function getExplorerUrl(signature: string, type: 'tx' | 'address' = 'tx'): string {
  const network = getSolanaNetwork();
  const cluster = network === WalletAdapterNetwork.Mainnet ? '' : `?cluster=${network}`;

  return `https://solscan.io/${type}/${signature}${cluster}`;
}

// Export constants
export const SOLANA_CONFIG = {
  network: getSolanaNetwork(),
  endpoint: getSolanaEndpoint(),
  isDevnet: isDevnet(),
  isMainnet: isMainnet(),
} as const;
