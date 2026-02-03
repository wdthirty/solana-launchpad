// API Response Types
export interface User {
  id: number;
  walletAddress: string;
  chainType: 'solana' | 'evm';
  username: string;
  joinedAt: string;
  lastLogin: string;
  metadata?: Record<string, any>;
}

export interface NonceResponse {
  nonce: string;
  message: string;
  expiresIn: number;
}

export interface VerifyResponse {
  accessToken: string;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  services?: {
    database: string;
    redis: string;
  };
}

// Request Types
export interface VerifyRequest {
  walletAddress: string;
  chainType: 'solana' | 'evm';
  message: string;
  signature: string;
}

export interface UpdateProfileRequest {
  username?: string;
  metadata?: Record<string, any>;
}

// API Error Type
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

