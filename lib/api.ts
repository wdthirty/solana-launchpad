import { supabase } from './supabase';
import { AppErrorHandler } from './utils/error-handler';

// Define types inline since types file doesn't exist yet
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PageWithAuthor {
  _id: string;
  title: string;
  description: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscussionWithAuthor {
  _id: string;
  pageId: string;
  content: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  upvotes: number;
  downvotes: number;
}

export interface DiscussionFormData {
  pageId: string;
  content: string;
}

export interface VoteData {
  type: 'upvote' | 'downvote';
}

export interface User {
  id: string;
  username: string;
  avatar: string;
  points: number;
  wallet_address: string;
  created_at: string;
  updated_at: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : '/api';

// In-memory session cache to avoid unnecessary calls
interface SessionCache {
  session: any;
  timestamp: number;
  userId?: string;
}

let sessionCache: SessionCache | null = null;
const SESSION_CACHE_DURATION = 30 * 1000; // 30 seconds

// Clear session cache when it becomes invalid
const clearSessionCache = () => {
  sessionCache = null;
};

// Check if session cache is valid
const isSessionCacheValid = (): boolean => {
  if (!sessionCache) return false;
  const now = Date.now();
  return (now - sessionCache.timestamp) < SESSION_CACHE_DURATION;
};

// Export function to clear cache (useful for logout)
export const clearApiCache = () => {
  clearSessionCache();
};

// Helper function to get auth headers
// accessToken param allows passing token directly from context (avoids getSession race conditions)
const getAuthHeaders = async (walletAddress?: string, accessToken?: string) => {
  // If access token is provided directly, use it (most reliable after fresh sign-in)
  if (accessToken) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };
    if (walletAddress) {
      headers['x-wallet-address'] = walletAddress;
    }
    return headers;
  }

  // Use cached session if it's valid
  if (isSessionCacheValid() && sessionCache) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (sessionCache.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionCache.session.access_token}`;
    }

    // Add wallet address header if provided
    if (walletAddress) {
      headers['x-wallet-address'] = walletAddress;
    }

    return headers;
  }

  // Fetch fresh session
  let session: any = null;
  try {
    const { data: { session: freshSession }, error } = await supabase.auth.getSession();

    if (error) {
      clearSessionCache();
      return {
        'Content-Type': 'application/json',
      };
    }

    session = freshSession;

    // Cache the session
    sessionCache = {
      session,
      timestamp: Date.now(),
      userId: session?.user?.id,
    };
  } catch (error) {
    clearSessionCache();
    return {
      'Content-Type': 'application/json',
    };
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  // Add wallet address header if provided
  if (walletAddress) {
    headers['x-wallet-address'] = walletAddress;
  }

  return headers;
};

// Use centralized types from lib/types

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    const apiError = AppErrorHandler.createApiError(
      response.status, 
      errorData.error || 'Request failed',
      errorData.details
    );
    throw apiError;
  }
  
  return response.json();
}

// Pages API
export const pagesApi = {
  async getAll(): Promise<PageWithAuthor[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/pages`, {
      headers,
    });
    return handleResponse(response);
  },

  async getById(pageId: string): Promise<PageWithAuthor> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/pages/${pageId}`, {
      headers,
    });
    return handleResponse(response);
  },

  async create(data: { title: string; description: string; authorId: string }): Promise<PageWithAuthor> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async update(pageId: string, data: { title?: string; description?: string; userId: string }): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/pages/${pageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async delete(pageId: string, userId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/pages/${pageId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return handleResponse(response);
  },
};

// Discussions API
export const discussionsApi = {
  async create(data: DiscussionFormData): Promise<DiscussionWithAuthor> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async getByPageId(pageId: string): Promise<DiscussionWithAuthor[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/comments?pageId=${pageId}`, {
      headers,
    });
    return handleResponse(response);
  },

  async vote(discussionId: string, data: VoteData): Promise<DiscussionWithAuthor> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/comments/${discussionId}/vote`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async delete(discussionId: string): Promise<void> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/comments/${discussionId}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse(response);
  },
};

// Users API
export const usersApi = {
  async getCurrentUser(walletAddress?: string, accessToken?: string): Promise<User> {
    // Debug: trace the call
    console.log('[usersApi.getCurrentUser] Called with accessToken:', accessToken ? 'present' : 'missing');
    const headers = await getAuthHeaders(walletAddress, accessToken);
    console.log('[usersApi.getCurrentUser] Headers:', Object.keys(headers));
    const response = await fetch(`${API_BASE_URL}/users/current`, {
      headers,
    });
    return handleResponse(response);
  },
};

// Export ApiError class for error handling
export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

// Alias commentsApi to discussionsApi for backward compatibility
export const commentsApi = discussionsApi;
