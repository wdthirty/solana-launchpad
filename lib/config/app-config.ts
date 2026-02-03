import {
  AudioWaveform,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  ChevronRight,
  ChevronsUpDown,
  Command,
  Compass,
  CreditCard,
  Folder,
  Forward,
  GalleryVerticalEnd,

  LogOut,
  MoreHorizontal,
  Plus,
  Settings2,
  Sparkles,
  SquareTerminal,
  Trash2,
  Wallet,
} from 'lucide-react';

import type { AppConfig } from '@/lib/types';

export const APP_CONFIG: AppConfig = {
  base: {
    name: 'Launchpad',
    logo: GalleryVerticalEnd,
  },
  user: {
    name: 'Skyleen',
    email: 'skyleen@example.com',
    avatar: 'https://pbs.twimg.com/profile_images/1909615404789506048/MTqvRsjo_400x400.jpg',
  },
  navMain: [
    {
      title: 'Tokens',
      url: '/',
      icon: Compass,
      isActive: false,
    },
    {
      title: 'How It Works',
      url: '/how-it-works',
      icon: BookOpen,
      isActive: false,
    },
    {
      title: 'Portfolio',
      url: '/profile', // Will be dynamically set to user's profile
      icon: Wallet,
      isActive: false,
      requiresAuth: true, // Flag to indicate this needs authentication
    },
  ],
  projects: [],
};

// Default avatar URL for new users and fallbacks
export const DEFAULT_AVATAR_URL = 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora';

// Native token address - has special access rules (public communities, no posting)
export const NATIVE_TOKEN_ADDRESS = 'YOUR_NATIVE_TOKEN_ADDRESS';

// Default user settings
export const DEFAULT_USER_SETTINGS = {
  avatar: DEFAULT_AVATAR_URL,
  startingPoints: 1500,
  usernamePrefix: '',
};

// API configuration
export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : '/api',
  timeout: 10000,
  retryAttempts: 3,
};

// Cache configuration
export const CACHE_CONFIG = {
  sessionCacheDuration: 30 * 1000, // 30 seconds
  profileCacheDuration: 5 * 60 * 1000, // 5 minutes
  apiCacheDuration: 60 * 1000, // 1 minute
};

// UI configuration
export const UI_CONFIG = {
  maxCommentDepth: 10,
  maxCommentLength: 2000,
  maxPageTitleLength: 200,
  maxPageDescriptionLength: 1000,
  defaultPageSize: 20,
  maxPageSize: 100,
};

// Point system configuration
export const POINTS_CONFIG = {
  comment: 5,
  reply: 3,
  vote: 1,
  pageCreation: 10,
  awardCosts: {
    bronze: 25,
    silver: 50,
    gold: 100,
    fire: 75,
    diamond: 200,
    heart: 30,
    star: 40,
    rocket: 60,
  },
};

// Wallet configuration
export const WALLET_CONFIG = {
  network: 'devnet', // 'devnet', 'testnet', or 'mainnet-beta'
  autoConnect: true,
  supportedWallets: ['phantom', 'solflare'],
};

// Error messages
export const ERROR_MESSAGES = {
  auth: {
    notAuthenticated: 'You must be authenticated to perform this action',
    walletNotConnected: 'Please connect your wallet to continue',
    sessionExpired: 'Your session has expired. Please reconnect your wallet',
  },
  api: {
    networkError: 'Network error. Please check your connection',
    serverError: 'Server error. Please try again later',
    validationError: 'Invalid data provided',
    notFound: 'Resource not found',
  },
  comments: {
    contentRequired: 'Comment content is required',
    contentTooLong: `Comment must be less than ${UI_CONFIG.maxCommentLength} characters`,
    pageNotFound: 'Page not found',
    parentNotFound: 'Parent comment not found',
  },
  pages: {
    titleRequired: 'Page title is required',
    titleTooLong: `Title must be less than ${UI_CONFIG.maxPageTitleLength} characters`,
    descriptionRequired: 'Page description is required',
    descriptionTooLong: `Description must be less than ${UI_CONFIG.maxPageDescriptionLength} characters`,
  },
  awards: {
    insufficientPoints: 'You do not have enough points for this award',
    awardNotFound: 'Award type not found',
    cannotAwardSelf: 'You cannot award your own comment',
  },
};

// Success messages
export const SUCCESS_MESSAGES = {
  comment: {
    created: 'Comment posted successfully',
    updated: 'Comment updated successfully',
    deleted: 'Comment deleted successfully',
  },
  page: {
    created: 'Page created successfully',
    updated: 'Page updated successfully',
    deleted: 'Page deleted successfully',
  },
  vote: {
    recorded: 'Vote recorded successfully',
  },
  award: {
    given: 'Award given successfully',
  },
  auth: {
    connected: 'Wallet connected successfully',
    disconnected: 'Wallet disconnected successfully',
  },
};
