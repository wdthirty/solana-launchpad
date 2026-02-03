import type {
  NonceResponse,
  VerifyResponse,
  RefreshResponse,
  User,
  VerifyRequest,
  UpdateProfileRequest,
  HealthResponse,
  ApiError,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {};

    // Only set Content-Type if there's a body
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.accessToken && !endpoint.includes('/auth/nonce')) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    // Merge with any additional headers from options
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include', // Important for httpOnly cookies
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.message || 'API request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Health Check
  async healthCheck(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  // Auth Endpoints
  async getNonce(
    walletAddress: string,
    chainType: 'solana' | 'evm'
  ): Promise<NonceResponse> {
    return this.request<NonceResponse>(
      `/auth/nonce?walletAddress=${encodeURIComponent(walletAddress)}&chainType=${chainType}`
    );
  }

  async verifySignature(data: VerifyRequest): Promise<VerifyResponse> {
    const response = await this.request<VerifyResponse>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    // Store access token
    this.setAccessToken(response.accessToken);
    
    return response;
  }

  async refreshToken(): Promise<RefreshResponse> {
    const response = await this.request<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Update access token
    this.setAccessToken(response.accessToken);
    
    return response;
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', {
      method: 'POST',
    });
    
    // Clear access token
    this.setAccessToken(null);
  }

  async logoutAll(): Promise<void> {
    await this.request('/auth/logout-all', {
      method: 'POST',
    });
    
    // Clear access token
    this.setAccessToken(null);
  }

  // User Endpoints
  async getCurrentUser(): Promise<User> {
    return this.request<User>('/user/me');
  }

  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    return this.request<User>('/user/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing or multiple instances
export default ApiClient;

