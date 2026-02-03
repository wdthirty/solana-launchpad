import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Helius RPC Client for HTTP API requests
 * Provides methods for querying Solana data via Helius RPC endpoints
 */

export type Commitment = 'processed' | 'confirmed' | 'finalized';

interface GetBalanceParams {
  publicKey: string;
  commitment?: Commitment;
  minContextSlot?: number;
}

interface BalanceResponse {
  jsonrpc: string;
  id: string;
  result: {
    context: {
      slot: number;
    };
    value: number; // lamports
  };
}

interface RpcError {
  code: number;
  message: string;
  data?: any;
}

interface ErrorResponse {
  jsonrpc: string;
  id: string;
  error: RpcError;
}

export class HeliusRpcClient {
  private rpcEndpoint: string;
  private requestId: number = 1;

  constructor(rpcEndpoint: string) {
    this.rpcEndpoint = rpcEndpoint;
  }

  /**
   * Make a JSON-RPC request to Helius
   */
  private async request<T>(method: string, params: any[]): Promise<T> {
    const requestBody = {
      jsonrpc: '2.0',
      id: String(this.requestId++),
      method,
      params,
    };

    try {
      const response = await fetch(this.rpcEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Check for JSON-RPC errors
      if ('error' in data) {
        const errorData = data as ErrorResponse;
        throw new Error(`RPC error (${errorData.error.code}): ${errorData.error.message}`);
      }

      return data as T;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the balance of an account in lamports
   * @param params - GetBalance parameters
   * @returns Balance in lamports
   */
  async getBalance(params: GetBalanceParams): Promise<number> {
    const { publicKey, commitment = 'confirmed', minContextSlot } = params;

    const rpcParams: any[] = [publicKey];

    // Add optional configuration object
    const config: any = { commitment };
    if (minContextSlot !== undefined) {
      config.minContextSlot = minContextSlot;
    }
    rpcParams.push(config);

    const response = await this.request<BalanceResponse>('getBalance', rpcParams);

    return response.result.value;
  }

  /**
   * Get the balance of an account in SOL
   * @param params - GetBalance parameters
   * @returns Balance in SOL
   */
  async getBalanceInSol(params: GetBalanceParams): Promise<number> {
    const lamports = await this.getBalance(params);
    return lamports / LAMPORTS_PER_SOL;
  }

  /**
   * Get token accounts for a wallet
   * @param params - GetTokenAccountsByOwner parameters
   * @returns Array of token accounts with balances
   */
  async getTokenAccountsByOwner(params: {
    publicKey: string;
    commitment?: Commitment;
  }): Promise<TokenAccount[]> {
    const { publicKey, commitment = 'confirmed' } = params;

    // Use getTokenAccountsByOwner RPC method
    const rpcParams: any[] = [
      publicKey,
      {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
      },
      {
        encoding: 'jsonParsed',
        commitment,
      },
    ];

    interface TokenAccountsResponse {
      jsonrpc: string;
      id: string;
      result: {
        context: {
          slot: number;
        };
        value: Array<{
          account: {
            data: {
              parsed: {
                info: {
                  mint: string;
                  tokenAmount: {
                    amount: string;
                    decimals: number;
                    uiAmount: number | null;
                    uiAmountString: string;
                  };
                };
              };
            };
            owner: string;
            lamports: number;
          };
          pubkey: string;
        }>;
      };
    }

    const response = await this.request<TokenAccountsResponse>(
      'getTokenAccountsByOwner',
      rpcParams
    );

    return response.result.value
      .map((item) => {
        const info = item.account.data.parsed.info;
        const tokenAmount = info.tokenAmount;

        // Only return tokens with non-zero balance
        if (tokenAmount.uiAmount === 0 || tokenAmount.uiAmount === null) {
          return null;
        }

        return {
          mint: info.mint,
          amount: tokenAmount.uiAmount || 0,
          amountString: tokenAmount.uiAmountString,
          decimals: tokenAmount.decimals,
        };
      })
      .filter((account): account is TokenAccount => account !== null);
  }
}

export interface TokenAccount {
  mint: string;
  amount: number;
  amountString: string;
  decimals: number;
}

/**
 * Create a Helius RPC client using environment configuration
 */
export function createHeliusRpcClient(): HeliusRpcClient {
  const rpcEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT;

  if (!rpcEndpoint) {
    throw new Error('NEXT_PUBLIC_SOLANA_RPC_ENDPOINT is not configured');
  }

  return new HeliusRpcClient(rpcEndpoint);
}
