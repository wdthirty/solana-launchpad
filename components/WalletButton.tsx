'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { Button } from '@/components/ui/button';
import { Wallet, Copy, Check } from 'lucide-react';
import { ConnectWalletModal } from '@/components/auth/ConnectWalletModal';

export const WalletButton: React.FC = () => {
  const { publicKey, connected, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="bg-blue-500 hover:bg-blue-600 text-white border-blue-500 hover:border-blue-600 rounded-lg px-4 py-2 text-sm font-medium">
        Loading...
      </div>
    );
  }

  const copyAddress = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            Connected
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <Wallet className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
            {formatAddress(publicKey.toString())}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyAddress}
            className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3 text-gray-500" />
            )}
          </Button>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => disconnect()}
          className="px-3 py-2 text-sm font-medium"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return <ConnectWalletModal />;
};
