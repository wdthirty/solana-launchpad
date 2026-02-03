// Jupiter Data API Client
// Fetches token prices in batches for market cap calculation
// Created: 2025-10-18

/**
 * Jupiter Data API client for fetching token prices
 * Docs: https://station.jup.ag/docs/apis/price-api-v2
 */

export interface JupiterPrice {
  id: string; // Token mint address
  mintSymbol?: string;
  vsToken: string; // Usually 'USDC' or 'SOL'
  vsTokenSymbol: string;
  price: number;
  extraInfo?: {
    lastSwappedPrice?: {
      lastJupiterSellAt?: number;
      lastJupiterSellPrice?: number;
      lastJupiterBuyAt?: number;
      lastJupiterBuyPrice?: number;
    };
    quotedPrice?: {
      buyPrice?: number;
      buyAt?: number;
      sellPrice?: number;
      sellAt?: number;
    };
    confidenceLevel?: 'high' | 'medium' | 'low';
    depth?: {
      buyPriceImpactRatio?: {
        depth: Record<string, number>;
        timestamp: number;
      };
      sellPriceImpactRatio?: {
        depth: Record<string, number>;
        timestamp: number;
      };
    };
  };
}

export interface JupiterPriceResponse {
  data: Record<string, JupiterPrice>;
  timeTaken: number;
}

export interface TokenPriceData {
  address: string;
  price: number;
  priceVsToken: string; // 'USDC' or 'SOL'
  lastUpdated: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
}

/**
 * Configuration for Jupiter Data API client
 */
export interface JupiterDataClientConfig {
  apiUrl?: string;
  vsToken?: 'USDC' | 'SOL'; // What to price tokens against
  batchSize?: number; // Max tokens per request (recommended: 50-100)
  timeout?: number; // Request timeout in ms
}

/**
 * Jupiter Data API Client
 * Fetches token prices in batches
 */
export class JupiterDataClient {
  private config: Required<JupiterDataClientConfig>;

  constructor(config: JupiterDataClientConfig = {}) {
    this.config = {
      apiUrl: config.apiUrl || 'https://datapi.jup.ag/v1/pools',
      vsToken: config.vsToken || 'USDC',
      batchSize: config.batchSize || 50,
      timeout: config.timeout || 10000,
    };
  }

  /**
   * Fetch prices for multiple tokens
   * @param tokenAddresses Array of token mint addresses
   * @returns Map of token address to price data
   */
  async fetchPrices(
    tokenAddresses: string[]
  ): Promise<Map<string, TokenPriceData>> {
    if (tokenAddresses.length === 0) {
      return new Map();
    }

    // Split into batches if needed
    const batches = this.createBatches(tokenAddresses, this.config.batchSize);
    const results = new Map<string, TokenPriceData>();

    // Process all batches in parallel
    await Promise.all(
      batches.map(async (batch) => {
        const batchResults = await this.fetchBatch(batch);
        batchResults.forEach((value, key) => results.set(key, value));
      })
    );

    return results;
  }

  /**
   * Fetch prices for a single batch of tokens
   */
  private async fetchBatch(
    tokenAddresses: string[]
  ): Promise<Map<string, TokenPriceData>> {
    const results = new Map<string, TokenPriceData>();

    try {
      // Build query string: assetIds=token1,token2,token3
      const assetIds = tokenAddresses.join(',');
      const url = `${this.config.apiUrl}?assetIds=${assetIds}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();

      // Parse response - Jupiter Data API returns {pools: [...], total: number}
      // Each pool has baseAsset with usdPrice
      if (data.pools && Array.isArray(data.pools)) {
        for (const pool of data.pools) {
          if (pool.baseAsset && pool.baseAsset.id && pool.baseAsset.usdPrice !== undefined) {
            const address = pool.baseAsset.id;
            results.set(address, {
              address,
              price: pool.baseAsset.usdPrice,
              priceVsToken: 'USD',
              lastUpdated: Date.now(),
              confidenceLevel: 'high', // Jupiter Data API is generally high quality
            });
          }
        }
      }
    } catch (error) {
      console.error('[JupiterClient] Error fetching batch:', error);
      // Return empty results for this batch, but don't throw
      // This prevents one failed batch from breaking the entire price update
    }

    return results;
  }

  /**
   * Fetch price for a single token
   * Convenience method for single token lookup
   */
  async fetchPrice(tokenAddress: string): Promise<TokenPriceData | null> {
    const results = await this.fetchPrices([tokenAddress]);
    return results.get(tokenAddress) || null;
  }

  /**
   * Split array into batches
   */
  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<Required<JupiterDataClientConfig>> {
    return this.config;
  }
}

/**
 * Create a Jupiter Data API client
 * Convenience function for simple use cases
 */
export function createJupiterClient(
  config?: JupiterDataClientConfig
): JupiterDataClient {
  return new JupiterDataClient(config);
}

/**
 * Calculate market cap from price and supply
 * @param price Token price in USD (or vsToken)
 * @param supply Circulating supply (as bigint or number)
 * @param decimals Token decimals (usually 9 for Solana tokens)
 * @returns Market cap in USD
 */
export function calculateMarketCap(
  price: number,
  supply: bigint | number,
  decimals: number
): number {
  const supplyNumber = typeof supply === 'bigint' ? Number(supply) : supply;
  const actualSupply = supplyNumber / Math.pow(10, decimals);
  return price * actualSupply;
}

/**
 * Format market cap for display
 * @param marketCap Market cap value
 * @returns Formatted string (e.g., "$1.2M", "$3.4B")
 */
export function formatMarketCap(marketCap: number): string {
  // Format with 2 decimal places for precision
  if (marketCap >= 1_000_000_000) {
    const value = marketCap / 1_000_000_000;
    return `$${value.toFixed(2)}B`;
  } else if (marketCap >= 1_000_000) {
    const value = marketCap / 1_000_000;
    return `$${value.toFixed(2)}M`;
  } else if (marketCap >= 1_000) {
    const value = marketCap / 1_000;
    return `$${value.toFixed(2)}K`;
  } else if (marketCap >= 1) {
    return `$${marketCap.toFixed(2)}`;
  } else {
    // For very small market caps, show more decimals
    return `$${marketCap.toFixed(4)}`;
  }
}
