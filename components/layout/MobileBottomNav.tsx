'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, HelpCircle, User } from 'lucide-react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { useWalletUser } from '@/hooks/use-wallet-user';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ConnectWalletModal } from '@/components/auth/ConnectWalletModal';

export function MobileBottomNav() {
  const pathname = usePathname();
  const { publicKey, connected } = useWallet();
  const { isAuthenticated, signIn } = useAuth();
  const { profile } = useUserProfile();
  const { user: walletUser } = useWalletUser();

  // Custom connect wallet modal state
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  const navItems = [
    {
      title: 'Home',
      href: '/',
      icon: Home,
      isActive: pathname === '/' || pathname === '/tokens',
    },
    {
      title: 'How it works',
      href: '/how-it-works',
      icon: HelpCircle,
      isActive: pathname.startsWith('/how-it-works'),
    },
    {
      title: 'Profile',
      href: publicKey ? `/profile/${profile?.username || publicKey.toString()}` : '#',
      icon: User,
      isActive: pathname?.startsWith('/profile/'),
      requiresAuth: true,
      isAccount: true,
    },
  ];

  const handleNavClick = (item: typeof navItems[0], e: React.MouseEvent) => {
    if (item.requiresAuth && !isAuthenticated) {
      e.preventDefault();
      // If wallet is already connected, trigger sign-in directly
      if (connected) {
        signIn().catch((error) => {
          console.error('[MobileBottomNav] Sign in failed:', error);
        });
      } else {
        // Open our custom wallet modal (handles connect + sign-in)
        setConnectModalOpen(true);
      }
    }
  };

  return (
    <>
      <ConnectWalletModal
        open={connectModalOpen}
        onOpenChange={setConnectModalOpen}
      />
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-[env(safe-area-inset-bottom)] bg-[#0a0a0a] border-t border-border/30">
        <div className="flex items-center justify-around h-14 px-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.isActive;

          // Account item with user avatar
          if (item.isAccount && isAuthenticated && walletUser?.avatar) {
            return (
              <Link
                key={item.title}
                href={item.href}
                onClick={(e) => handleNavClick(item, e)}
                className={`flex flex-col items-center gap-1 py-2 px-3 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Avatar className="w-5 h-5">
                  <AvatarImage
                    src={walletUser.avatar}
                    alt={walletUser.username || 'Profile'}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-[8px]">
                    {walletUser.username?.slice(0, 2).toUpperCase() || 'ME'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[10px] font-medium">{item.title}</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.title}
              href={item.href}
              onClick={(e) => handleNavClick(item, e)}
              className={`flex flex-col items-center gap-1 py-2 px-3 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.title}</span>
            </Link>
          );
        })}
        </div>
      </nav>
    </>
  );
}
