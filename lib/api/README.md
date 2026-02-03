# API Client Quick Reference

## Import

```tsx
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import type { User } from '@/lib/api/types';
```

## Auth Hook

```tsx
const {
  user,              // User | null
  isAuthenticated,   // boolean
  isLoading,         // boolean
  signIn,            // () => Promise<void>
  signOut,           // () => Promise<void>
  refreshUser,       // () => Promise<void>
} = useAuth();
```

## API Methods

```tsx
// Auth
apiClient.getNonce(walletAddress, 'solana')
apiClient.verifySignature({ walletAddress, chainType, message, signature })
apiClient.refreshToken()
apiClient.logout()
apiClient.logoutAll()

// User
apiClient.getCurrentUser()
apiClient.updateProfile({ username, metadata })

// Health
apiClient.healthCheck()
```

## Environment

Add to `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

