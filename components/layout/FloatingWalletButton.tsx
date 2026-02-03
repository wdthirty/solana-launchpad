'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Wallet, LogOut, User, Copy, Check } from 'lucide-react';
import { useFrameworkKitWallet } from '@/contexts/FrameworkKitWalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { ConnectWalletModal } from '@/components/auth/ConnectWalletModal';
import { toast } from 'sonner';

// Pages where the floating wallet button should NOT appear
const EXCLUDED_ROUTES = ['/'];

export function FloatingWalletButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { publicKey, connected, wallet, disconnect } = useFrameworkKitWallet();
  const { signOut } = useAuth();
  const { profile } = useUserProfile();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Don't show on excluded routes
  const isExcluded = EXCLUDED_ROUTES.some(route =>
    route === '/' ? pathname === '/' : pathname?.startsWith(route)
  );

  if (!mounted || isExcluded) {
    return null;
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleButtonClick = () => {
    if (connected && publicKey) {
      setIsDropdownOpen(!isDropdownOpen);
    } else {
      setIsModalOpen(true);
    }
  };

  const handleCopyAddress = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey.toString());
      setCopied(true);
      toast.success('Address copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleViewProfile = () => {
    setIsDropdownOpen(false);
    const profileSlug = profile?.username || publicKey?.toString();
    if (profileSlug) {
      router.push(`/profile/${profileSlug}`);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await signOut();
      if (disconnect) {
        await disconnect();
      }
      setIsDropdownOpen(false);
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Failed to log out');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      {/* Desktop only floating button - bottom right, constrained to max-w-5xl container */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-5xl px-4 z-50 hidden md:block pointer-events-none">
        <div className="flex justify-end">
          <div ref={dropdownRef} className="relative pointer-events-auto">
            <button
              onClick={handleButtonClick}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1c] hover:bg-[#252528] border border-border/30 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
            >
              {connected && publicKey ? (
                <>
                  {wallet?.icon && (
                    <img
                      src={wallet.icon}
                      alt={wallet.name}
                      className="w-5 h-5 rounded-full"
                    />
                  )}
                  {!wallet?.icon && (
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                      <Wallet className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {formatAddress(publicKey.toString())}
                  </span>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Connect
                  </span>
                </>
              )}
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && connected && publicKey && (
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-[#1a1a1c] border border-border/30 rounded-xl shadow-xl overflow-hidden">
                <button
                  onClick={handleCopyAddress}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-[#252528] transition-colors cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span>Copy Address</span>
                </button>
                <button
                  onClick={handleViewProfile}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-[#252528] transition-colors cursor-pointer"
                >
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>View Profile</span>
                </button>
                <div className="h-px bg-border/30" />
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-[#252528] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{isLoggingOut ? 'Logging out...' : 'Log Out'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConnectWalletModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  );
}
