import { supabase } from './supabase';
import type {
  User,
  Page,
  Comment,
  UserVote,
  UserAward,
  PageWithAuthor,
  CommentWithAuthor,
  Token,
  TokenWithCreator,
  CreateTokenInput,
  UpdateTokenMarketDataInput,
  GetTokensParams
} from './types';
import { getTopFeaturedTokens, getFeaturedTokenCount } from './algorithms/simple-featured-score';
import { DEFAULT_AVATAR_URL } from './config/app-config';

// Database utility functions
export class SupabaseDB {
  // User operations
  static async createUser(userData: {
    id: string;
    username: string;
    avatar?: string;
    wallet_address?: string;
  }, client = supabase): Promise<User> {
    const { data, error } = await client
      .from('users')
      .insert({
        id: userData.id,
        username: userData.username,
        avatar: userData.avatar || DEFAULT_AVATAR_URL,
        wallet_address: userData.wallet_address,
        points: 1500, // Starting points
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getUserById(id: string, client = supabase): Promise<User | null> {
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    return data;
  }

  static async getUserByWalletAddress(walletAddress: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async getUserByUsername(username: string): Promise<User | null> {
    // Use exact match first (most common case)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    // If not found with exact match, try case-insensitive
    if (error && error.code === 'PGRST116') {
      // Escape underscores and percent signs for ilike pattern matching
      const escapedUsername = username.replace(/[_%]/g, '\\$&');
      const { data: ilikeData, error: ilikeError } = await supabase
        .from('users')
        .select('*')
        .ilike('username', escapedUsername)
        .single();

      if (ilikeError && ilikeError.code !== 'PGRST116') throw ilikeError;
      return ilikeData;
    }

    if (error) throw error;
    return data;
  }

  static async updateUserPoints(id: string, pointsChange: number, client = supabase): Promise<User> {
    // First get the current user to get their current points
    const { data: currentUser, error: fetchError } = await client
      .from('users')
      .select('points')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Update with the new points
    const newPoints = (currentUser.points || 0) + pointsChange;
    const { data, error } = await client
      .from('users')
      .update({ points: newPoints })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Page operations
  static async createPage(pageData: {
    title: string;
    description: string;
    author_id: string;
  }, client = supabase): Promise<PageWithAuthor> {
    // Generate unique slug
    const baseSlug = pageData.title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    const uniqueSlug = `${baseSlug}-${Date.now()}`;

    const { data, error } = await client
      .from('pages')
      .insert({
        title: pageData.title,
        description: pageData.description,
        author_id: pageData.author_id,
        slug: uniqueSlug,
      })
      .select(`
        *,
        author:users!pages_author_id_fkey(id, username, avatar, points)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async getPages(): Promise<PageWithAuthor[]> {
    const { data, error } = await supabase
      .from('pages')
      .select(`
        *,
        author:users!pages_author_id_fkey(id, username, avatar, points)
      `)
      .order('last_activity', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getCommentCountByPageId(pageId: string): Promise<number> {
    const { count, error } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('page_id', pageId)
      .eq('is_deleted', false);

    if (error) throw error;
    return count || 0;
  }

  static async getPageBySlug(slug: string): Promise<PageWithAuthor | null> {
    const { data, error } = await supabase
      .from('pages')
      .select(`
        *,
        author:users!pages_author_id_fkey(id, username, avatar, points)
      `)
      .eq('slug', slug)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async getPageById(id: string): Promise<PageWithAuthor | null> {
    const { data, error } = await supabase
      .from('pages')
      .select(`
        *,
        author:users!pages_author_id_fkey(id, username, avatar, points)
      `)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // Comment operations
  static async createComment(commentData: {
    content: string;
    author_id: string;
    page_id: string;
    parent_id?: string;
  }, client = supabase): Promise<CommentWithAuthor> {
    const { data, error } = await client
      .from('comments')
      .insert({
        content: commentData.content,
        author_id: commentData.author_id,
        page_id: commentData.page_id,
        parent_id: commentData.parent_id || null,
      })
      .select(`
        *,
        author:users!comments_author_id_fkey(id, username, avatar, points)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async getCommentsByPageId(pageId: string): Promise<CommentWithAuthor[]> {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        author:users!comments_author_id_fkey(id, username, avatar, points)
      `)
      .eq('page_id', pageId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async getCommentById(id: string, client = supabase): Promise<CommentWithAuthor | null> {
    const { data, error } = await client
      .from('comments')
      .select(`
        *,
        author:users!comments_author_id_fkey(id, username, avatar, points)
      `)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // Voting operations
  static async voteOnComment(
    userId: string,
    commentId: string,
    voteType: 'up' | 'down',
    client = supabase
  ): Promise<UserVote> {
    // Use upsert to handle vote changes (up -> down, down -> up)
    // Specify onConflict to use the unique constraint on (user_id, comment_id)
    const { data, error } = await client
      .from('user_votes')
      .upsert(
        {
          user_id: userId,
          comment_id: commentId,
          vote_type: voteType,
        },
        {
          onConflict: 'user_id,comment_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async removeVote(userId: string, commentId: string, client = supabase): Promise<void> {
    const { error } = await client
      .from('user_votes')
      .delete()
      .eq('user_id', userId)
      .eq('comment_id', commentId);

    if (error) throw error;
  }

  static async getUserVote(userId: string, commentId: string, client = supabase): Promise<UserVote | null> {
    const { data, error } = await client
      .from('user_votes')
      .select('*')
      .eq('user_id', userId)
      .eq('comment_id', commentId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async getUserVotesForComments(
    userId: string,
    commentIds: string[]
  ): Promise<UserVote[]> {
    const { data, error } = await supabase
      .from('user_votes')
      .select('*')
      .eq('user_id', userId)
      .in('comment_id', commentIds);

    if (error) {
      throw error;
    }

    return data || [];
  }

  // Thread like operations
  static async likeThread(
    userId: string,
    threadId: string,
    client = supabase
  ): Promise<void> {
    const { error } = await client
      .from('thread_likes')
      .insert({
        user_id: userId,
        thread_id: threadId,
      });

    if (error) throw error;
  }

  static async unlikeThread(userId: string, threadId: string, client = supabase): Promise<void> {
    const { error } = await client
      .from('thread_likes')
      .delete()
      .eq('user_id', userId)
      .eq('thread_id', threadId);

    if (error) throw error;
  }

  static async getUserThreadLike(userId: string, threadId: string, client = supabase): Promise<{ id: string } | null> {
    const { data, error } = await client
      .from('thread_likes')
      .select('id')
      .eq('user_id', userId)
      .eq('thread_id', threadId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // Thread vote operations (upvote/downvote)
  static async voteOnThread(
    userId: string,
    threadId: string,
    voteType: 'up' | 'down',
    client = supabase
  ): Promise<{ id: string; user_id: string; thread_id: string; vote_type: 'up' | 'down' }> {
    // Use upsert to handle vote changes (up -> down, down -> up)
    const { data, error } = await client
      .from('thread_votes')
      .upsert(
        {
          user_id: userId,
          thread_id: threadId,
          vote_type: voteType,
        },
        {
          onConflict: 'user_id,thread_id',
        }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async removeThreadVote(userId: string, threadId: string, client = supabase): Promise<void> {
    const { error } = await client
      .from('thread_votes')
      .delete()
      .eq('user_id', userId)
      .eq('thread_id', threadId);

    if (error) throw error;
  }

  static async getUserThreadVote(userId: string, threadId: string, client = supabase): Promise<{ id: string; vote_type: 'up' | 'down' } | null> {
    const { data, error } = await client
      .from('thread_votes')
      .select('id, vote_type')
      .eq('user_id', userId)
      .eq('thread_id', threadId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async getUserThreadVotes(
    userId: string,
    threadIds: string[],
    client = supabase
  ): Promise<Array<{ thread_id: string; vote_type: 'up' | 'down' }>> {
    if (threadIds.length === 0) return [];

    const { data, error } = await client
      .from('thread_votes')
      .select('thread_id, vote_type')
      .eq('user_id', userId)
      .in('thread_id', threadIds);

    if (error) throw error;
    return data || [];
  }

  static async getUserThreadLikes(
    userId: string,
    threadIds: string[],
    client = supabase
  ): Promise<Array<{ thread_id: string }>> {
    if (threadIds.length === 0) return [];

    const { data, error } = await client
      .from('thread_likes')
      .select('thread_id')
      .eq('user_id', userId)
      .in('thread_id', threadIds);

    if (error) throw error;
    return data || [];
  }

  // Award operations
  static async addAwardToComment(
    commentId: string,
    award: UserAward
  ): Promise<Comment> {
    // First get the current comment to append the award
    const { data: currentComment, error: fetchError } = await supabase
      .from('comments')
      .select('awards')
      .eq('id', commentId)
      .single();

    if (fetchError) throw fetchError;

    const currentAwards = currentComment.awards || [];
    const updatedAwards = [...currentAwards, award];

    const { data, error } = await supabase
      .from('comments')
      .update({ awards: updatedAwards })
      .eq('id', commentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Utility functions
  static async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return this.getUserById(user.id);
  }

  static generateSlug(title: string): string {
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${baseSlug}-${Date.now()}`;
  }

  // ===========================
  // TOKEN OPERATIONS
  // ===========================

  /**
   * Create a new token in the database
   * NOTE: This should typically only be called by the token ingestion service
   */
  static async createToken(
    tokenData: CreateTokenInput,
    client = supabase
  ): Promise<Token> {
    const { data, error } = await client
      .from('tokens')
      .insert({
        address: tokenData.address,
        creator_wallet: tokenData.creator_wallet,
        creator_user_id: tokenData.creator_user_id || null,
        name: tokenData.name || null,
        symbol: tokenData.symbol || null,
        decimals: tokenData.decimals,
        supply: tokenData.supply.toString(), // Convert bigint to string for JSON
        metadata: tokenData.metadata || {},
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get tokens with pagination and sorting
   */
  static async getTokens(
    params: GetTokensParams = {}
  ): Promise<{ tokens: TokenWithCreator[]; total: number }> {
    const {
      sort = 'newest',
      page = 1,
      limit = 20,
      creator,
      search,
    } = params;

    // Build base query
    let query = supabase
      .from('tokens')
      .select(
        `
        *,
        creator:users!tokens_creator_user_id_fkey(id, username, avatar, points, verified)
      `,
        { count: 'exact' }
      )
      .eq('is_active', true);

    // Apply filters
    if (creator) {
      query = query.eq('creator_wallet', creator);
    }

    if (search) {
      // Match only if the search term appears at the start of the field (first word)
      // This ensures "likes" matches "li" but "dislike" doesn't
      // For multi-word fields, only the first word is checked
      const searchPattern = `${search}%`;
      query = query.or(
        `name.ilike.${searchPattern},symbol.ilike.${searchPattern},address.ilike.${searchPattern}`
      );
    }

    // Apply sorting
    switch (sort) {
      case 'featured': {
        // OPTIMIZED: Use real-time sorted set from swap processing
        // This is updated on every swap - no cron/cache warming needed!
        // Single ZRANGE operation = <50ms response time

        const offset = (page - 1) * limit;

        // Over-fetch from Redis to compensate for inactive tokens that get filtered out
        const overFetchMultiplier = 2;
        const overFetchLimit = limit * overFetchMultiplier;

        // Get token addresses from sorted set (already ranked by score)
        const [featuredAddresses, totalCount] = await Promise.all([
          getTopFeaturedTokens(offset, overFetchLimit),
          getFeaturedTokenCount(),
        ]);

        if (featuredAddresses.length === 0) {
          return { tokens: [], total: 0 };
        }

        // Fetch full token data for these addresses
        const { data: tokens, error: fetchError } = await supabase
          .from('tokens')
          .select(`
            *,
            creator:users!tokens_creator_user_id_fkey(id, username, avatar, points, verified)
          `)
          .in('address', featuredAddresses)
          .eq('is_active', true);

        if (fetchError) throw fetchError;
        if (!tokens || tokens.length === 0) {
          return { tokens: [], total: 0 };
        }

        // Preserve the sorted order from Redis and limit to requested amount
        const addressToToken = new Map(tokens.map(t => [t.address, t]));
        const sortedTokens = featuredAddresses
          .map(addr => addressToToken.get(addr))
          .filter((t): t is TokenWithCreator => t !== undefined)
          .slice(0, limit);

        return {
          tokens: sortedTokens,
          total: totalCount,
        };
      }
      case 'last_traded':
        query = query.order('last_trade_time', { ascending: false, nullsFirst: false });
        break;
      case 'default':
      case 'market_cap':
        query = query.order('market_cap', { ascending: false, nullsFirst: false });
        break;
      case 'top_gainers':
      case 'price_change_24h': // Deprecated, kept for backwards compatibility
        query = query.order('price_change_24h', { ascending: false, nullsFirst: false });
        break;
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      default:
        query = query.order('market_cap', { ascending: false, nullsFirst: false });
        break;
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      tokens: data || [],
      total: count || 0,
    };
  }

  /**
   * Get a single token by address
   */
  static async getTokenByAddress(
    address: string,
    client = supabase
  ): Promise<TokenWithCreator | null> {
    const { data, error } = await client
      .from('tokens')
      .select(
        `
        *,
        creator:users!tokens_creator_user_id_fkey(id, username, avatar, points, verified)
      `
      )
      .eq('address', address)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Get tokens by creator wallet address
   */
  static async getTokensByCreator(
    creatorWallet: string,
    limit = 20
  ): Promise<TokenWithCreator[]> {
    const { data, error } = await supabase
      .from('tokens')
      .select(
        `
        *,
        creator:users!tokens_creator_user_id_fkey(id, username, avatar, points, verified)
      `
      )
      .eq('creator_wallet', creatorWallet)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Get tokens by a list of addresses (for watchlist)
   */
  static async getTokensByAddresses(
    addresses: string[]
  ): Promise<TokenWithCreator[]> {
    if (addresses.length === 0) return [];

    const { data, error } = await supabase
      .from('tokens')
      .select(
        `
        *,
        creator:users!tokens_creator_user_id_fkey(id, username, avatar, points, verified)
      `
      )
      .in('address', addresses)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  }

  /**
   * Update token market data
   * NOTE: This should typically only be called by the price tracker service
   */
  static async updateTokenMarketData(
    updateData: UpdateTokenMarketDataInput,
    client = supabase
  ): Promise<Token> {
    const updatePayload: any = {
      last_price_update: updateData.last_price_update || new Date(),
    };

    if (updateData.current_price !== undefined) {
      updatePayload.current_price = updateData.current_price;
    }
    if (updateData.market_cap !== undefined) {
      updatePayload.market_cap = updateData.market_cap;
    }
    if (updateData.volume_24h !== undefined) {
      updatePayload.volume_24h = updateData.volume_24h;
    }
    if (updateData.price_change_24h !== undefined) {
      updatePayload.price_change_24h = updateData.price_change_24h;
    }
    if (updateData.price_change_1h !== undefined) {
      updatePayload.price_change_1h = updateData.price_change_1h;
    }

    const { data, error } = await client
      .from('tokens')
      .update(updatePayload)
      .eq('address', updateData.address)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Batch update token market data for multiple tokens
   * More efficient than updating one by one
   */
  static async batchUpdateTokenMarketData(
    updates: UpdateTokenMarketDataInput[],
    client = supabase
  ): Promise<void> {
    // Supabase doesn't support batch updates natively,
    // so we'll use a transaction-like approach with Promise.all
    const updatePromises = updates.map((update) =>
      this.updateTokenMarketData(update, client)
    );

    await Promise.all(updatePromises);
  }

  /**
   * Get trending tokens (top price gainers in last 24h)
   */
  static async getTrendingTokens(
    limit = 20,
    timeframe: '1h' | '24h' = '24h'
  ): Promise<TokenWithCreator[]> {
    const orderColumn = timeframe === '1h' ? 'price_change_1h' : 'price_change_24h';

    const { data, error } = await supabase
      .from('tokens')
      .select(
        `
        *,
        creator:users!tokens_creator_user_id_fkey(id, username, avatar, points, verified)
      `
      )
      .eq('is_active', true)
      .not(orderColumn, 'is', null)
      .order(orderColumn, { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Get all active tokens (for price tracker service)
   * Returns only addresses to minimize data transfer
   */
  static async getActiveTokenAddresses(): Promise<string[]> {
    const { data, error } = await supabase
      .from('tokens')
      .select('address')
      .eq('is_active', true);

    if (error) throw error;
    return (data || []).map((t) => t.address);
  }

  /**
   * Mark a token as inactive (soft delete)
   * Useful for hiding scam/rug pull tokens
   */
  static async deactivateToken(
    address: string,
    client = supabase
  ): Promise<Token> {
    const { data, error } = await client
      .from('tokens')
      .update({ is_active: false })
      .eq('address', address)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Verify a token (admin operation)
   */
  static async verifyToken(
    address: string,
    client = supabase
  ): Promise<Token> {
    const { data, error } = await client
      .from('tokens')
      .update({ is_verified: true })
      .eq('address', address)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update token metadata
   */
  static async updateTokenMetadata(
    address: string,
    metadata: Record<string, any>,
    client = supabase
  ): Promise<Token> {
    const { data, error } = await client
      .from('tokens')
      .update({ metadata })
      .eq('address', address)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get token statistics
   */
  static async getTokenStats(): Promise<{
    totalTokens: number;
    totalMarketCap: number;
    tokens24h: number;
  }> {
    // Get total tokens
    const { count: totalTokens } = await supabase
      .from('tokens')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    // Get total market cap
    const { data: marketCapData } = await supabase
      .from('tokens')
      .select('market_cap')
      .eq('is_active', true)
      .not('market_cap', 'is', null);

    const totalMarketCap = (marketCapData || []).reduce(
      (sum, token) => sum + (token.market_cap || 0),
      0
    );

    // Get tokens created in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: tokens24h } = await supabase
      .from('tokens')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('created_at', yesterday);

    return {
      totalTokens: totalTokens || 0,
      totalMarketCap,
      tokens24h: tokens24h || 0,
    };
  }
}
