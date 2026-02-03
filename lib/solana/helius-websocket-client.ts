import { getSolanaNetwork } from './config';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Helius WebSocket Client for Enhanced WebSocket API
 * Supports account subscriptions and other real-time Solana data
 */

export type Commitment = 'finalized' | 'confirmed' | 'processed';
export type Encoding = 'base58' | 'base64' | 'base64+zstd' | 'jsonParsed';

interface AccountSubscribeParams {
  publicKey: string;
  encoding?: Encoding;
  commitment?: Commitment;
}

interface AccountNotification {
  jsonrpc: string;
  method: string;
  params: {
    subscription: number;
    result: {
      context: {
        slot: number;
      };
      value: {
        lamports: number;
        data: string | any;
        owner: string;
        executable: boolean;
        rentEpoch: number;
        space: number;
      };
    };
  };
}

interface SubscriptionResponse {
  jsonrpc: string;
  id: number;
  result: number; // subscription ID
}

type AccountUpdateCallback = (data: AccountNotification['params']['result']) => void;
type ErrorCallback = (error: Error) => void;
type CloseCallback = () => void;

export class HeliusWebSocketClient {
  private ws: WebSocket | null = null;
  private subscriptions: Map<number, AccountUpdateCallback> = new Map();
  private messageId: number = 1;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // Start with 1 second
  private shouldReconnect: boolean = true;

  private errorCallback: ErrorCallback | null = null;
  private closeCallback: CloseCallback | null = null;

  constructor(
    private apiKey: string,
    private network: 'mainnet' | 'devnet' = 'devnet'
  ) {}

  /**
   * Get the WebSocket URL from environment variable
   */
  private getWebSocketUrl(): string {
    const wsEndpoint = process.env.NEXT_PUBLIC_SOLANA_WS_ENDPOINT;

    if (!wsEndpoint) {
      throw new Error('NEXT_PUBLIC_SOLANA_WS_ENDPOINT is not configured');
    }

    return wsEndpoint;
  }

  /**
   * Connect to Helius WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = this.getWebSocketUrl();

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.startPing();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error: Event) => {
          console.error('❌ Helius WebSocket error:', {
            type: error.type,
            target: error.target,
            readyState: this.ws?.readyState,
            url: url.replace(/api-key=[^&]+/, 'api-key=***')
          });

          const errorMessage = `WebSocket connection failed (network: ${this.network}, readyState: ${this.ws?.readyState})`;

          if (this.errorCallback) {
            this.errorCallback(new Error(errorMessage));
          }
          reject(new Error(errorMessage));
        };

        this.ws.onclose = () => {
          this.stopPing();

          if (this.closeCallback) {
            this.closeCallback();
          }

          // Attempt reconnection if enabled and haven't exceeded max attempts
          if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;

            setTimeout(() => {
              this.connect().catch(console.error);
            }, this.reconnectDelay);

            // Exponential backoff
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle subscription confirmation
      if (message.result && typeof message.result === 'number') {
        return;
      }

      // Handle account notifications
      if (message.method === 'accountNotification') {
        const notification = message as AccountNotification;
        const subscriptionId = notification.params.subscription;
        const callback = this.subscriptions.get(subscriptionId);

        if (callback) {
          callback(notification.params.result);
        }
      }

      // Handle errors
      if (message.error) {
        console.error('❌ WebSocket error:', message.error);
        console.error('❌ Full error message:', JSON.stringify(message, null, 2));
        if (this.errorCallback) {
          this.errorCallback(new Error(message.error.message || 'Unknown error'));
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse WebSocket message:', error);
      console.error('❌ Raw message data:', data);
    }
  }

  /**
   * Start periodic ping to keep connection alive
   * Uses getVersion as a lightweight ping method
   */
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Send a getVersion request as ping (standard Solana RPC method)
        this.send({
          jsonrpc: '2.0',
          id: this.messageId++,
          method: 'getVersion',
        });
      }
    }, 50000); // Ping every 50 seconds (under the 10 minute timeout)
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Send a message through WebSocket
   */
  private send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const messageStr = JSON.stringify(message);
      this.ws.send(messageStr);
    } else {
      console.error('❌ WebSocket is not open. Current state:', this.ws?.readyState);
    }
  }

  /**
   * Subscribe to account updates
   * @param params - Account subscription parameters
   * @param callback - Callback for account updates
   * @returns Promise with subscription ID
   */
  async subscribeToAccount(
    params: AccountSubscribeParams,
    callback: AccountUpdateCallback
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'));
        return;
      }

      const id = this.messageId++;
      const { publicKey, encoding = 'jsonParsed', commitment = 'confirmed' } = params;

      const request = {
        jsonrpc: '2.0',
        id,
        method: 'accountSubscribe',
        params: [
          publicKey,
          {
            encoding,
            commitment,
          },
        ],
      };

      let resolved = false;

      // Timeout if no response - clear on success
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Restore original message handler before rejecting
          if (this.ws) {
            this.ws.onmessage = originalOnMessage;
          }
          reject(new Error('Subscription timeout'));
        }
      }, 5000);

      // Set up one-time listener for subscription response
      const originalOnMessage = this.ws.onmessage;
      this.ws.onmessage = (event) => {
        try {
          const response: SubscriptionResponse = JSON.parse(event.data);

          if (response.id === id && response.result !== undefined) {
            const subscriptionId = response.result;
            this.subscriptions.set(subscriptionId, callback);

            // Clear timeout and resolve
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              resolve(subscriptionId);
            }
          }
        } catch (error) {
          console.error('Error parsing subscription response:', error);
        }

        // Restore original message handler
        if (this.ws) {
          this.ws.onmessage = originalOnMessage;
        }

        // Still handle the message with the original handler
        if (originalOnMessage && this.ws) {
          originalOnMessage.call(this.ws, event);
        }
      };

      this.send(request);
    });
  }

  /**
   * Unsubscribe from account updates
   * @param subscriptionId - The subscription ID to unsubscribe
   */
  unsubscribeFromAccount(subscriptionId: number): void {
    const request = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'accountUnsubscribe',
      params: [subscriptionId],
    };

    this.send(request);
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Subscribe to SOL balance updates for a wallet
   * Uses jsonParsed encoding for better readability
   * @param publicKey - Wallet public key
   * @param callback - Callback with SOL balance
   * @returns Promise with subscription ID
   */
  async subscribeToBalance(
    publicKey: string,
    callback: (balance: number) => void
  ): Promise<number> {
    return this.subscribeToAccount(
      {
        publicKey,
        encoding: 'jsonParsed',
        commitment: 'confirmed',
      },
      (data) => {
        const balanceInSol = data.value.lamports / LAMPORTS_PER_SOL;
        callback(balanceInSol);
      }
    );
  }

  /**
   * Set error callback
   */
  onError(callback: ErrorCallback): void {
    this.errorCallback = callback;
  }

  /**
   * Set close callback
   */
  onClose(callback: CloseCallback): void {
    this.closeCallback = callback;
  }

  /**
   * Disconnect and cleanup
   * Ensures all WebSocket activities are stopped (pings, reconnects, subscriptions)
   */
  disconnect(): void {
    // Stop reconnection attempts
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;

    // Stop ping interval
    this.stopPing();

    // Close WebSocket connection
    if (this.ws) {
      // Remove event listeners to prevent any callbacks after disconnect
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;

      // Close the connection
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }

      this.ws = null;
    }

    // Clear all subscriptions
    this.subscriptions.clear();

    // Clear callbacks
    this.errorCallback = null;
    this.closeCallback = null;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Create a Helius WebSocket client using environment configuration
 */
export function createHeliusWebSocketClient(): HeliusWebSocketClient {
  const rpcEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT;

  if (!rpcEndpoint) {
    throw new Error('NEXT_PUBLIC_SOLANA_RPC_ENDPOINT is not configured');
  }

  // Extract API key from RPC endpoint
  const apiKeyMatch = rpcEndpoint.match(/api-key=([^&]+)/);
  if (!apiKeyMatch) {
    throw new Error('API key not found in NEXT_PUBLIC_SOLANA_RPC_ENDPOINT');
  }

  const apiKey = apiKeyMatch[1];
  const network = getSolanaNetwork() === 'devnet' ? 'devnet' : 'mainnet';

  return new HeliusWebSocketClient(apiKey, network);
}
