'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ConnectWalletModal } from '@/components/auth/ConnectWalletModal';
import { Loader2 } from 'lucide-react';

export function AuthButton() {
  const { publicKey } = useWallet();
  const { user, isAuthenticated, loading, signIn, signOut } = useAuth();
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  // Not connected to wallet
  if (!publicKey) {
    return (
      <>
        <Button onClick={() => setConnectModalOpen(true)} variant="default">
          Connect Wallet
        </Button>
        <ConnectWalletModal
          open={connectModalOpen}
          onOpenChange={setConnectModalOpen}
        />
      </>
    );
  }

  // Wallet connected but not authenticated
  if (!isAuthenticated) {
    return (
      <Button onClick={() => signIn()} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign In'
        )}
      </Button>
    );
  }

  // Authenticated
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">
        {user?.user_metadata?.username}
      </span>
      <Button onClick={() => signOut()} variant="ghost" size="sm">
        Sign Out
      </Button>
    </div>
  );
}
