// Export token types
export * from './token';

// Core database types
export interface User {
  id: string;
  username: string;
  avatar: string;
  points: number;
  wallet_address?: string;
  verified?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  title: string;
  description: string;
  author_id: string;
  slug: string;
  discussion_count: number; // Calculated dynamically by API, not stored in DB
  last_activity: string;
  created_at: string;
  updated_at: string;
}

export interface Discussion {
  id: string;
  content: string;
  author_id: string;
  page_id: string;
  parent_id?: string;
  upvotes: number;
  downvotes: number;
  points_earned: number;
  is_deleted: boolean;
  awards: UserAward[];
  created_at: string;
  updated_at: string;
}

export interface UserVote {
  id: string;
  user_id: string;
  comment_id: string;
  vote_type: 'up' | 'down';
  created_at: string;
}

export interface Comment {
  id: string;
  content: string;
  author_id: string;
  page_id: string;
  parent_id?: string | null;
  upvotes: number;
  downvotes: number;
  points_earned: number;
  is_deleted: boolean;
  awards: UserAward[];
  created_at: string;
  updated_at: string;
}

export interface CommentWithAuthor extends Comment {
  author: Pick<User, 'id' | 'username' | 'avatar' | 'points' | 'wallet_address' | 'verified'>;
  replies?: CommentWithAuthor[];
  userVote?: 'up' | 'down' | null;
}

export interface UserAward {
  id: string;
  awardType: string;
  giverId: string;
  giverName: string;
  receiverId: string;
  receiverName: string;
  discussionId: string;
  timestamp: string;
  pointsCost: number;
}

// Extended types with populated relationships
export interface PageWithAuthor extends Page {
  author: Pick<User, 'id' | 'username' | 'avatar' | 'points' | 'verified'>;
}

export interface DiscussionWithAuthor extends Discussion {
  author: Pick<User, 'id' | 'username' | 'avatar' | 'points' | 'verified'>;
  replies?: DiscussionWithAuthor[];
  userVote?: 'up' | 'down' | null;
}

// Frontend-specific types
export interface WalletUser {
  id: string | null;
  username: string;
  avatar: string;
  points: number;
  walletAddress: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
}

export interface DiscussionFormData {
  content: string;
  pageId: string;
  authorId: string;
  parentId?: string;
}

export interface VoteData {
  userId: string;
  voteType: 'up' | 'down';
}

export interface AwardData {
  discussionId: string;
  awardType: string;
  giverId: string;
  pointsCost: number;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  status: number;
  message: string;
  details?: string;
  stack?: string;
}

// Component prop types
export interface DiscussionItemProps {
  discussion: DiscussionWithAuthor;
  depth: number;
  isConnected: boolean;
  walletUser: WalletUser;
  onVote: (discussionId: string, voteType: 'up' | 'down', isReply?: boolean, parentId?: string) => void;
  onReply: (parentId: string, content: string) => void;
  onGiveAward: (discussionId: string, isReply?: boolean, replyId?: string) => void;
  onDelete: (discussionId: string) => void;
  maxDepth?: number;
}

export interface AwardSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onGiveAward: (awardType: string) => void;
  userPoints: number;
  discussionId: string;
  discussionAuthor: string;
}

// Navigation and UI types
export interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType;
  isActive?: boolean;
  requiresAuth?: boolean;
  items?: NavSubItem[];
}

export interface NavSubItem {
  title: string;
  url: string;
}

export interface ProjectItem {
  name: string;
  url: string;
  icon: React.ComponentType;
}

// Configuration types
export interface AppConfig {
  base: {
    name: string;
    logo: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  };
  user: {
    name: string;
    email: string;
    avatar: string;
  };
  navMain: NavItem[];
  projects: ProjectItem[];
}

// Award system types
export interface Award {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  description: string;
  color: string;
}

// Authentication types
export interface AuthState {
  user: User | null;
  session: any | null;
  loading: boolean;
  connectionState: 'checking-session' | 'session-valid' | 'wallet-connecting' | 'wallet-connected' | 'needs-auth' | 'authenticated';
}

// Hook return types
export interface UseWalletUserReturn {
  user: WalletUser;
  isConnected: boolean;
  isConnecting: boolean;
  isLoadingPoints: boolean;
  walletAddress: string | null;
  isAuthenticated: boolean;
}

export interface UseUserProfileReturn {
  profile: User | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  clearProfile: () => void;
}

// Form types
export interface CreatePageFormData {
  title: string;
  description: string;
}

export interface CreateDiscussionFormData {
  content: string;
}

// Error types
export interface AppError {
  message: string;
  code?: string;
  details?: any;
}

// Loading states
export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
