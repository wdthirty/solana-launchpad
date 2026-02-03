'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { X, Coins, Copy, Check, BadgeCheck, Bell, LogOut, ChevronsUpDown } from 'lucide-react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { ConnectWalletModal } from '@/components/auth/ConnectWalletModal';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import { APP_CONFIG } from '@/lib/config/app-config';
import { useWalletUser } from '@/hooks/use-wallet-user';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { useAppReady } from '@/hooks/use-app-ready';
import { formatNumber, formatAddress as formatWalletAddress } from '@/lib/format';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { publicKey, disconnect } = useWallet();
  const { user: walletUser, isLoadingPoints } = useWalletUser();
  const { isAuthenticated, signOut } = useAuth();
  const { profile, balanceLoading } = useUserProfile();
  const { isReady } = useAppReady();
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Get SOL balance from profile
  const solBalance = profile?.solBalance;
  const isLoadingSolBalance = balanceLoading;

  // Get navigation items from config
  const navItems = APP_CONFIG.navMain;

  // Ensure we only render on client side to prevent hydration errors
  useEffect(() => {
    setMounted(true);
  }, []);

  // Copy wallet address
  const copyAddress = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await signOut();
      if (disconnect) {
        await disconnect();
      }
      onClose(); // Close the mobile nav after logout
    } catch (error) {
      alert('Failed to log out. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 left-0 bottom-0 w-64 bg-[#0b0f13] border-r border-[#21262d] z-50 lg:hidden">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#21262d]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[#fe9226] to-[#ff6b35] rounded-lg flex items-center justify-center font-bold text-white">
                EM
              </div>
              <span className="text-lg font-bold text-white">launchpad.fun</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#161b22] rounded-md transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto py-4">
            <div className="space-y-1 px-3">
              {navItems.map((item) => {
                // Handle Portfolio link dynamically
                let href = item.url;
                if (item.title === 'Portfolio' && publicKey) {
                  href = `/profile/${profile?.username || publicKey.toString()}`;
                }

                const isActive = pathname === href || (item.title === 'Portfolio' && pathname.startsWith('/profile/'));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.url}
                    href={href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[#161b22] text-white'
                        : 'text-gray-400 hover:text-white hover:bg-[#161b22]/50'
                    }`}
                  >
                    {Icon && <Icon className="w-5 h-5" />}
                    {item.title}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Footer Actions - User Profile / Wallet Connect */}
          <div className="p-4 border-t border-[#21262d]">
            {!mounted || !isReady ? (
              // Loading state
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="h-10 w-10 rounded-lg bg-[#161b22] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[#161b22] rounded animate-pulse w-24" />
                  <div className="h-3 bg-[#161b22] rounded animate-pulse w-16" />
                </div>
              </div>
            ) : isAuthenticated ? (
              // Authenticated: Show user dropdown
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#161b22] hover:bg-[#21262d] rounded-md transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe9226] cursor-pointer">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={walletUser.avatar || "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"}
                        alt={walletUser.username}
                        className="object-cover"
                      />
                      <AvatarFallback>
                        {walletUser.username?.slice(0, 2).toUpperCase() || 'AN'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate text-sm">
                        {walletUser.username}
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-0.5">
                        <span className="flex items-center gap-1">
                          <Coins className="h-3 w-3 text-yellow-500" />
                          <span className="text-gray-400">
                            {isLoadingPoints ? 'Loading...' : formatNumber(walletUser.points || 0, 0)}
                          </span>
                        </span>
                        <span className="text-gray-600">•</span>
                        <span className="flex items-center gap-1 font-mono">
                          <Image src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora" alt="SOL" width={12} height={12} className="h-3 w-3 flex-shrink-0" />
                          <span className="text-gray-400">
                            {isLoadingSolBalance ? '---' : formatNumber(solBalance || 0, 4)}
                          </span>
                        </span>
                      </div>
                    </div>
                    <ChevronsUpDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[280px] bg-[#161b22] border-[#21262d]"
                  side="top"
                  align="start"
                  sideOffset={8}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-3 px-3 py-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage
                          src={walletUser.avatar || "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"}
                          alt={walletUser.username}
                          className="object-cover"
                        />
                        <AvatarFallback>
                          {walletUser.username?.slice(0, 2).toUpperCase() || 'AN'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white truncate">
                          {walletUser.username}
                        </div>
                        {publicKey && (
                          <button
                            onClick={copyAddress}
                            className="text-xs font-mono text-gray-400 hover:text-white transition-colors flex items-center gap-1 mt-1 cursor-pointer"
                          >
                            {formatWalletAddress(publicKey.toString())}
                            {copied ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className="flex items-center gap-1">
                            <Coins className="h-3 w-3 text-yellow-500" />
                            <span className="text-gray-400">
                              {isLoadingPoints ? 'Loading...' : formatNumber(walletUser.points || 0, 0)}
                            </span>
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <Image src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora" alt="SOL" width={12} height={12} className="h-3 w-3 flex-shrink-0" />
                            <span className="text-gray-400">
                              {isLoadingSolBalance ? '---' : formatNumber(solBalance || 0, 4)} SOL
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#21262d]" />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => {
                        if (publicKey) {
                          router.push(`/profile/${profile?.username || publicKey.toString()}`);
                          onClose();
                        }
                      }}
                      className="cursor-pointer focus:bg-[#21262d] text-gray-300"
                    >
                      <BadgeCheck className="mr-2 h-4 w-4" />
                      <span>Account</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer focus:bg-[#21262d] text-gray-300">
                      <Bell className="mr-2 h-4 w-4" />
                      <span>Notifications</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="bg-[#21262d]" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer focus:bg-[#21262d] text-red-400 focus:text-red-400"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // Not authenticated: Show wallet connect button
              <ConnectWalletModal />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
