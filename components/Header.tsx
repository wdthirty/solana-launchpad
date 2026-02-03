'use client';

import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import Link from 'next/link';
import { Button } from './ui/button';
import { CreatePoolButton } from './CreatePoolButton';
import { useMemo } from 'react';
import { shortenAddress } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { User, Gift } from 'lucide-react';

export const Header = () => {
  const { disconnect, publicKey } = useWallet();
  const address = useMemo(() => publicKey?.toBase58(), [publicKey]);

  const handleConnectWallet = () => {
    // Wallet connection is handled by WalletButton component
  };

  return (
    <header className="w-full px-4 py-3 flex items-center justify-between">
      {/* Logo Section */}
      <Link href="/" className="flex items-center">
        <span className="whitespace-nowrap text-lg md:text-2xl font-bold">Fun Launch</span>
      </Link>

      {/* Navigation and Actions */}
      <div className="flex items-center gap-4">
        <Link href="/token" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">
          $TOKEN
        </Link>
        <CreatePoolButton />
        {address ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>{shortenAddress(address)}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/rewards" className="flex items-center gap-2 cursor-pointer">
                  <Gift className="h-4 w-4" />
                  <span>Rewards</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => disconnect()}
                className="cursor-pointer text-red-600 focus:text-red-600"
              >
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            onClick={() => {
              handleConnectWallet();
            }}
          >
            <span className="hidden md:block">Connect Wallet</span>
            <span className="block md:hidden">Connect</span>
          </Button>
        )}
      </div>
    </header>
  );
};

export default Header;
