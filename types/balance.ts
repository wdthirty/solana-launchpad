// Balance types for the balance-aggregator service integration

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  amount: number; // UI amount (already divided by decimals)
  decimals: number;
}

export interface BalanceUpdate {
  wallet: string;
  sol: number; // SOL balance (not lamports)
  tokens: TokenBalance[];
  timestamp: number;
}

export interface PresenceData {
  wallet: string;
  userId: string;
}

export interface TokenAcquiredEvent {
  userId: string;
  wallet: string;
  mint: string;
}

export interface BalanceState {
  sol: number | null;
  tokens: TokenBalance[];
  isLoading: boolean;
  isConnected: boolean;
  lastUpdated: number | null;
}
