// Jupiter DatAPI Client
// Full-featured client for Jupiter's data API

const BASE_URL = 'https://datapi.jup.ag';

interface PoolResponse {
  pools: Array<{
    id: string;
    baseAsset: {
      id: string;
      usdPrice: number;
    };
  }>;
}

export class ApeClient {
  /**
   * Get SOL price in USD
   * Uses Jupiter DatAPI pools endpoint
   */
  static async getSolPrice(): Promise<number> {
    try {
      // Jupiter DatAPI pools endpoint (without array brackets)
      const response = await fetch(
        `${BASE_URL}/v1/pools?assetIds=So11111111111111111111111111111111111111112`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Jupiter DatAPI returned ${response.status}`);
      }

      const data = await response.json() as PoolResponse;

      // Look for SOL price - it could be in baseAsset or quoteAsset
      let solPrice: number | null = null;

      for (const pool of data.pools || []) {
        if (pool.baseAsset?.id === 'So11111111111111111111111111111111111111112' && pool.baseAsset?.usdPrice) {
          solPrice = pool.baseAsset.usdPrice;
          break;
        }
        // SOL might be the quote asset in some pools
        if ((pool as any).quoteAsset?.id === 'So11111111111111111111111111111111111111112' && (pool as any).quoteAsset?.usdPrice) {
          solPrice = (pool as any).quoteAsset.usdPrice;
          break;
        }
      }

      if (!solPrice || solPrice <= 0) {
        console.error('❌ Invalid SOL price received:', {
          solPrice,
          response: JSON.stringify(data, null, 2),
        });
        throw new Error(`Invalid SOL price received: ${solPrice}`);
      }

      return solPrice;
    } catch (error) {
      console.error('❌ Failed to fetch SOL price:', error);
      throw error;
    }
  }

  // Add other methods from your full ApeClient here as needed
  // getToken, getTokens, getChart, etc.
}
