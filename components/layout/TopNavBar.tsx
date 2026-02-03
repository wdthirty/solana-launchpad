'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Search, Coins, Wallet, X, ArrowLeft } from 'lucide-react';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { APP_CONFIG } from '@/lib/config/app-config';
import { formatMarketCap } from '@/lib/solana/jupiter-data-client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { useCurrentToken } from '@/contexts/CurrentTokenContext';

interface TopNavBarProps {
  // Kept for backwards compatibility but no longer used
  onMobileMenuToggle?: () => void;
}

interface SearchResult {
  tokens?: Array<{
    address: string;
    name: string | null;
    symbol: string | null;
    market_cap?: number | null;
    created_at?: string;
    metadata?: {
      logo?: string;
      [key: string]: any;
    };
  }>;
  users?: Array<{
    wallet_address: string;
    username: string;
    avatar: string;
    verified?: boolean;
  }>;
}

export function TopNavBar({}: TopNavBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const { publicKey } = useWallet();
  const { isAuthenticated } = useAuth();
  const { profile } = useUserProfile();
  const { tokenSymbol } = useCurrentToken();
  const isTokenPage = pathname?.startsWith('/token/') && pathname !== '/token';
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchContainerRef = useRef<HTMLDivElement>(null);

  // Get navigation items from config
  const navItems = APP_CONFIG.navMain;

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data);
          setShowDropdown(true);
        }
      } catch (error) {
        // Search error - silently fail
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideDesktop = searchContainerRef.current && !searchContainerRef.current.contains(target);
      const isOutsideMobile = mobileSearchContainerRef.current && !mobileSearchContainerRef.current.contains(target);

      if (isOutsideDesktop && isOutsideMobile) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus mobile search input when opened
  useEffect(() => {
    if (isMobileSearchOpen && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus();
    }
  }, [isMobileSearchOpen]);

  // Close mobile search handler
  const closeMobileSearch = () => {
    setIsMobileSearchOpen(false);
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleResultClick = (result: NonNullable<SearchResult['tokens']>[0] | NonNullable<SearchResult['users']>[0]) => {
    if ('wallet_address' in result) {
      router.push(`/profile/${result.username}`);
    } else if ('address' in result) {
      router.push(`/token/${result.address}`);
    }
    setShowDropdown(false);
    setSearchQuery('');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTimeAgo = (date: string | undefined) => {
    if (!date) return '';
    const now = new Date();
    const created = new Date(date);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]">
      {/* Mobile Search Overlay - YouTube style */}
      {isMobileSearchOpen && (
        <div className="absolute inset-x-0 top-0 h-full bg-[#0a0a0a] z-60 flex items-center px-4 gap-3 md:hidden">
          <button
            onClick={closeMobileSearch}
            className="p-2 hover:bg-muted rounded-full transition-colors cursor-pointer flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div ref={mobileSearchContainerRef} className="flex-1 relative">
            <Input
              ref={mobileSearchInputRef}
              type="text"
              placeholder="Search"
              value={searchQuery}
              maxLength={50}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim().length >= 2) {
                  setShowDropdown(true);
                }
              }}
              onFocus={() => {
                if (searchResults && searchQuery.trim().length >= 2) {
                  setShowDropdown(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowDropdown(false);
                  closeMobileSearch();
                }
              }}
              className="w-full h-10 bg-muted border-transparent rounded-full shadow-none text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:shadow-xs pl-4 pr-10"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShowDropdown(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {/* Mobile Search Dropdown */}
            {showDropdown && searchQuery.trim().length >= 2 && (
              <Card className="absolute top-full mt-2 left-0 right-0 z-50 max-h-[60vh] overflow-y-auto shadow-lg bg-[#121214] border-border/30 rounded-2xl">
                <div className="p-2">
                  {isSearching ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Searching...
                    </div>
                  ) : searchResults && ((searchResults.tokens?.length ?? 0) > 0 || (searchResults.users?.length ?? 0) > 0) ? (
                    <div className="space-y-1">
                      {(searchResults.tokens?.length ?? 0) > 0 && (
                        <>
                          <div className="px-3 text-xs font-semibold text-muted-foreground uppercase">
                            Tokens
                          </div>
                          {searchResults.tokens?.map((token) => {
                            const logo = token.metadata?.logo;
                            return (
                              <button
                                key={token.address}
                                onClick={() => {
                                  handleResultClick(token);
                                  closeMobileSearch();
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left cursor-pointer"
                              >
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                                  {logo ? (
                                    <>
                                      <img
                                        src={logo}
                                        alt={token.symbol || 'Token'}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          const fallback = e.currentTarget.nextElementSibling;
                                          if (fallback) {
                                            (fallback as HTMLElement).classList.remove('hidden');
                                          }
                                        }}
                                      />
                                      <Coins className="w-4 h-4 text-muted-foreground hidden" />
                                    </>
                                  ) : (
                                    <Coins className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate text-foreground">{token.name || token.symbol || 'Unnamed Token'}</div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="truncate">{token.symbol || token.address.slice(0, 8)}</span>
                                    {token.market_cap && (
                                      <span>{formatMarketCap(token.market_cap)}</span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      )}
                      {(searchResults.users?.length ?? 0) > 0 && (
                        <>
                          {(searchResults.tokens?.length ?? 0) > 0 && <div className="h-px bg-border my-1" />}
                          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                            Users
                          </div>
                          {searchResults.users?.map((user) => (
                            <button
                              key={user.wallet_address}
                              onClick={() => {
                                handleResultClick(user);
                                closeMobileSearch();
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left cursor-pointer"
                            >
                              <Avatar className="w-8 h-8">
                                <AvatarImage src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora" alt={user.username} className="object-contain" />
                                <AvatarFallback className="bg-muted text-muted-foreground">{getInitials(user.username)}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate text-foreground flex items-center gap-1">
                                  {user.username}
                                  {user.verified && <VerifiedBadge size="sm" />}
                                </div>
                                <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                  <Wallet className="w-3 h-3" />
                                  {user.wallet_address.slice(0, 8)}...{user.wallet_address.slice(-6)}
                                </div>
                              </div>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No results
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between py-6 w-full max-w-5xl mx-auto  px-4 lg:px-0">
        {/* Left Section: Logo */}
        <div className="flex items-center flex-shrink-0 gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative overflow-visible">
              <img
                src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"
                alt="Launchpad"
                width={110}
                height={94}
                className="h-10 w-auto"
              />
            </div>
          </Link>
          <Link href="/token" className="text-[15px] text-muted-foreground hover:text-primary transition-colors">
            [$TOKEN]
          </Link>
        </div>

        {/* Center Section: Pill Navigation with Animated Indicator */}
        <div className="hidden md:flex items-center justify-center absolute left-1/2 -translate-x-1/2">
          <nav className="flex items-center bg-[#1a1a1c] rounded-full p-1 relative">
            {navItems
              .filter((item) => !item.requiresAuth || isAuthenticated)
              .map((item) => {
                let href = item.url;
                if (item.title === 'Portfolio' && publicKey) {
                  href = `/profile/${profile?.username || publicKey.toString()}`;
                }

                const isActive = pathname === href ||
                  (item.title === 'Tokens' && pathname === '/') ||
                  (item.title === 'Tokens' && isTokenPage) ||
                  (item.title === 'Portfolio' && pathname.startsWith('/profile/'));

                // Show token symbol instead of "Tokens" when on a token page
                const isTokensItem = item.title === 'Tokens';
                const showingTokenSymbol = isTokensItem && isTokenPage && tokenSymbol;
                const displayTitle = showingTokenSymbol
                  ? tokenSymbol
                  : item.title;
                // Only marquee the Tokens item when showing a long token symbol (longer than "Tokens" = 6 chars)
                const needsMarquee = showingTokenSymbol && displayTitle.length > 6;

                return (
                  <Link
                    key={item.url}
                    href={href}
                    className="relative px-4 py-1.5 text-[15px] font-medium rounded-full transition-colors z-10"
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 bg-primary rounded-full"
                        transition={{
                          type: 'spring',
                          stiffness: 500,
                          damping: 35,
                        }}
                      />
                    )}
                    <span className={`relative z-10 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} ${isTokensItem ? 'flex w-[52px] overflow-hidden' : ''}`}>
                      {needsMarquee ? (
                        <span className="animate-nav-marquee inline-flex">
                          <span className="shrink-0 px-3">{displayTitle}</span>
                          <span className="shrink-0 px-3">{displayTitle}</span>
                        </span>
                      ) : (
                        <span className={isTokensItem ? 'w-full text-center' : ''}>
                          {displayTitle}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
          </nav>
        </div>

        {/* Right Section: Search Only */}
        <div className="flex items-center gap-2">
          {/* Mobile Search Icon Button */}
            <button
              onClick={() => setIsMobileSearchOpen(true)}
              className="md:hidden p-2 hover:bg-muted rounded-full transition-colors cursor-pointer"
            >
              <Search className="w-5 h-5 text-muted-foreground" />
            </button>

          {/* Desktop Search */}
            <div ref={searchContainerRef} className="relative hidden md:block">
              <div className="flex items-center w-52">
                <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
                <Input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  maxLength={50}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim().length >= 2) {
                      setShowDropdown(true);
                    }
                  }}
                  onFocus={() => {
                    if (searchResults && searchQuery.trim().length >= 2) {
                      setShowDropdown(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowDropdown(false);
                      setSearchQuery('');
                    }
                  }}
                  className="pl-9 pr-8 py-2 h-10 bg-[#1a1a1c] border-transparent rounded-full shadow-none text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-0"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setShowDropdown(false);
                    }}
                    className="absolute right-3 p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Search Dropdown */}
              {showDropdown && searchQuery.trim().length >= 2 && (
                <Card className="absolute top-full mt-2 right-0 w-80 z-50 max-h-96 overflow-y-auto shadow-lg bg-[#121214] border-border/30 rounded-2xl">
                  <div className="p-2">
                    {isSearching ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Searching...
                      </div>
                    ) : searchResults && ((searchResults.tokens?.length ?? 0) > 0 || (searchResults.users?.length ?? 0) > 0) ? (
                      <div className="space-y-1">
                        {(searchResults.tokens?.length ?? 0) > 0 && (
                          <>
                            <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
                              Tokens
                            </div>
                            {searchResults.tokens?.map((token) => {
                              const logo = token.metadata?.logo;
                              return (
                                <button
                                  key={token.address}
                                  onClick={() => handleResultClick(token)}
                                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left cursor-pointer"
                                >
                                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                                    {logo ? (
                                      <>
                                        <img
                                          src={logo}
                                          alt={token.symbol || 'Token'}
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            const fallback = e.currentTarget.nextElementSibling;
                                            if (fallback) {
                                              (fallback as HTMLElement).classList.remove('hidden');
                                            }
                                          }}
                                        />
                                        <Coins className="w-4 h-4 text-muted-foreground hidden" />
                                      </>
                                    ) : (
                                      <Coins className="w-4 h-4 text-muted-foreground" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate text-foreground">{token.name || token.symbol || 'Unnamed Token'}</div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span className="truncate">{token.symbol || token.address.slice(0, 8)}</span>
                                      {token.market_cap && (
                                        <span>{formatMarketCap(token.market_cap)}</span>
                                      )}
                                      {token.created_at && (
                                        <span>{formatTimeAgo(token.created_at)}</span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}
                        {(searchResults.users?.length ?? 0) > 0 && (
                          <>
                            {(searchResults.tokens?.length ?? 0) > 0 && <div className="h-px bg-border/30 my-1" />}
                            <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
                              Users
                            </div>
                            {searchResults.users?.map((user) => (
                              <button
                                key={user.wallet_address}
                                onClick={() => handleResultClick(user)}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left cursor-pointer"
                              >
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora" alt={user.username} className="object-contain" />
                                  <AvatarFallback className="bg-muted text-muted-foreground">{getInitials(user.username)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate text-foreground flex items-center gap-1">
                                    {user.username}
                                    {user.verified && <VerifiedBadge size="sm" />}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                    <Wallet className="w-3 h-3" />
                                    {user.wallet_address.slice(0, 8)}...{user.wallet_address.slice(-6)}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No results
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
        </div>
      </div>
      </nav>
    </>
  );
}
