/**
 * Mint Keypair Service
 *
 * Manages the supply of pre-generated mint keypairs for token creation.
 * Keypairs are stored in database and cached in memory for fast retrieval.
 *
 * IMPORTANT: Before using a keypair, we validate on-chain that the account
 * doesn't already exist. This prevents using stale keypairs that may have
 * been used outside this system.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import bs58 from 'bs58';

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com';

// Max retries when fetching a fresh keypair (in case multiple are stale)
const MAX_FRESHNESS_RETRIES = 5;

// Create Supabase client with service role for backend operations
const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

interface MintKeypair {
  id: string;
  public_key: string;
  secret_key: string; // Stored as base58 encoded string in DB
  used: boolean;
  used_at?: string;
  used_by?: string;
  created_at: string;
  queue_position?: number;
  assigned_to?: string;
  assigned_at?: string;
  assignment_note?: string;
}

interface MintKeypairCacheEntry {
  keypair: Keypair;
  id: string;
  publicKey: string;
}

export class MintKeypairService {
  private static cache: Map<string, MintKeypairCacheEntry> = new Map();
  private static LOW_SUPPLY_THRESHOLD = 10000;
  private static REFILL_BATCH_SIZE = 50000;
  private static connection: Connection | null = null;

  /**
   * Get or create the Solana connection
   */
  private static getConnection(): Connection {
    if (!this.connection) {
      this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
    }
    return this.connection;
  }

  /**
   * Check if a keypair is fresh (account doesn't exist on-chain)
   * A fresh keypair has no account data, meaning it hasn't been used as a mint
   */
  private static async isKeypairFresh(publicKey: string): Promise<boolean> {
    try {
      const connection = this.getConnection();
      const pubkey = new PublicKey(publicKey);
      const accountInfo = await connection.getAccountInfo(pubkey);

      // Account should NOT exist for a fresh keypair
      return accountInfo === null;
    } catch (error) {
      console.error(`Error checking keypair freshness for ${publicKey}:`, error);
      // On error, assume not fresh to be safe
      return false;
    }
  }

  /**
   * Mark a keypair as stale in the database (used on-chain but not in our system)
   */
  private static async markAsStale(publicKey: string): Promise<void> {
    const supabase = getSupabaseClient();

    await supabase
      .from('mint_keypairs')
      .update({
        used: true,
        used_at: new Date().toISOString(),
        used_by: 'STALE_ON_CHAIN', // Special marker for keypairs found used on-chain
      })
      .eq('public_key', publicKey);

    console.warn(`⚠️ Marked keypair ${publicKey} as stale (already exists on-chain)`);
  }

  /**
   * Get the next available mint keypair atomically (race-condition safe)
   * Uses PostgreSQL row-level locking via RPC function to ensure no concurrent allocation
   *
   * IMPORTANT: Validates on-chain that the keypair is fresh before returning.
   * If a keypair is found to be stale (already used on-chain), it's marked as used
   * and we retry with the next available keypair.
   *
   * @param forWallet - Optional wallet address to check for assigned keypairs first
   */
  static async getNextKeypair(forWallet?: string): Promise<{ keypair: Keypair; id: string; publicKey: string }> {
    const supabase = getSupabaseClient();

    for (let attempt = 0; attempt < MAX_FRESHNESS_RETRIES; attempt++) {
      let data: any;
      let error: any;

      // If wallet provided, first try to get an assigned keypair for that wallet
      if (forWallet) {
        const assignedResult = await supabase.rpc('get_assigned_mint_keypair', {
          p_wallet: forWallet,
        });
        if (!assignedResult.error && assignedResult.data && (Array.isArray(assignedResult.data) ? assignedResult.data.length > 0 : assignedResult.data)) {
          data = assignedResult.data;
          error = assignedResult.error;
        }
      }

      // If no assigned keypair found (or no wallet provided), get next from queue
      if (!data || (Array.isArray(data) && data.length === 0)) {
        const queueResult = await supabase.rpc('get_next_mint_keypair');
        data = queueResult.data;
        error = queueResult.error;
      }

      if (error) {
        console.error('Error fetching mint keypair:', error);
        throw new Error('Failed to allocate mint keypair. Please try again.');
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('No available mint keypairs. Please import more.');
      }

      // RPC returns an array with one row, get the first element
      const keypairData = Array.isArray(data) ? data[0] : data;

      if (!keypairData) {
        throw new Error('No available mint keypairs. Please import more.');
      }

      // CRITICAL: Check on-chain if this keypair is actually fresh
      const isFresh = await this.isKeypairFresh(keypairData.public_key);

      if (!isFresh) {
        // Keypair exists on-chain - mark as stale and try next one
        console.warn(`⚠️ Keypair ${keypairData.public_key} is stale (attempt ${attempt + 1}/${MAX_FRESHNESS_RETRIES})`);
        await this.markAsStale(keypairData.public_key);
        continue; // Try next keypair
      }

      // Keypair is fresh - proceed
      const secretKeyBytes = bs58.decode(keypairData.secret_key);
      const keypair = Keypair.fromSecretKey(secretKeyBytes);
      const entry: MintKeypairCacheEntry = {
        keypair,
        id: keypairData.id,
        publicKey: keypairData.public_key,
      };

      // Cache it for later signing
      this.cache.set(keypairData.public_key, entry);

      // Check if we need to alert about low supply
      await this.checkSupply();

      return entry;
    }

    // Exhausted retries - all keypairs were stale
    throw new Error(
      `Failed to find a fresh mint keypair after ${MAX_FRESHNESS_RETRIES} attempts. ` +
      'The keypair pool may be corrupted. Please generate new keypairs.'
    );
  }

  /**
   * Get a cached keypair by public key (for signing after user returns signed tx)
   * First checks in-memory cache, then falls back to database lookup
   */
  static async getCachedKeypair(publicKey: string): Promise<MintKeypairCacheEntry | null> {
    // Check in-memory cache first (fast path)
    const cached = this.cache.get(publicKey);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from database (slower path, but works across requests)
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('mint_keypairs')
      .select('*')
      .eq('public_key', publicKey)
      .eq('used', false) // Only get unused keypairs
      .single();

    if (error || !data) {
      return null;
    }

    // Reconstruct keypair from database
    // secret_key is stored as base58 encoded string
    const secretKeyBytes = bs58.decode(data.secret_key);
    const keypair = Keypair.fromSecretKey(secretKeyBytes);
    const entry: MintKeypairCacheEntry = {
      keypair,
      id: data.id,
      publicKey: data.public_key,
    };

    // Cache it for potential future use
    this.cache.set(publicKey, entry);

    return entry;
  }

  /**
   * Mark a keypair as used after successful token creation
   */
  static async markAsUsed(publicKey: string, userWallet: string): Promise<void> {
    const supabase = getSupabaseClient();

    await supabase
      .from('mint_keypairs')
      .update({
        used: true,
        used_at: new Date().toISOString(),
        used_by: userWallet,
      })
      .eq('public_key', publicKey);

    // Remove from cache
    this.cache.delete(publicKey);
  }

  /**
   * Return a keypair to the pool if transaction failed or was rejected
   * This updates the database to clear the reservation, making the keypair available again
   */
  static async releaseKeypair(publicKey: string): Promise<void> {
    const supabase = getSupabaseClient();

    // Call the database function to release the reservation
    const { data, error } = await supabase.rpc('release_mint_keypair', {
      p_public_key: publicKey,
    });

    // Remove from in-memory cache
    this.cache.delete(publicKey);
  }

  /**
   * Cleanup expired reservations (older than 60 seconds)
   * Returns the number of reservations cleaned up
   */
  static async cleanupExpiredReservations(): Promise<number> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('cleanup_expired_mint_reservations');

    if (error) {
      return 0;
    }

    return data || 0;
  }

  /**
   * Check supply and log warning if low
   */
  private static async checkSupply(): Promise<void> {
    // Supply check is now silent - monitoring should be done externally
  }

  /**
   * Get current supply stats
   */
  static async getSupplyStats(): Promise<{
    total: number;
    available: number;
    used: number;
  }> {
    const supabase = getSupabaseClient();

    const { count: total } = await supabase
      .from('mint_keypairs')
      .select('*', { count: 'exact', head: true });

    const { count: used } = await supabase
      .from('mint_keypairs')
      .select('*', { count: 'exact', head: true })
      .eq('used', true);

    return {
      total: total || 0,
      available: (total || 0) - (used || 0),
      used: used || 0,
    };
  }

  /**
   * Generate bulk mint keypairs and insert into database
   * @param count Number of keypairs to generate
   * @returns Number of keypairs successfully inserted
   */
  static async generateBulkKeypairs(count: number): Promise<number> {
    const supabase = getSupabaseClient();
    const batchSize = 100; // Insert in batches of 100
    let totalInserted = 0;

    for (let i = 0; i < count; i += batchSize) {
      const currentBatchSize = Math.min(batchSize, count - i);
      const keypairs = [];

      // Generate keypairs
      for (let j = 0; j < currentBatchSize; j++) {
        const keypair = Keypair.generate();
        keypairs.push({
          public_key: keypair.publicKey.toBase58(),
          secret_key: bs58.encode(keypair.secretKey), // Encode as base58 string
          used: false,
        });
      }

      // Insert batch into database
      const { data, error } = await supabase
        .from('mint_keypairs')
        .insert(keypairs)
        .select();

      if (error) {
        throw error;
      }

      totalInserted += data?.length || 0;
    }

    return totalInserted;
  }

  /**
   * Get the upcoming mint addresses in queue order
   * @param limit Number of results to return
   * @param offset Pagination offset
   * @returns Array of upcoming mint public keys with queue positions
   */
  static async getQueue(limit: number = 20, offset: number = 0): Promise<{
    queuePosition: number;
    publicKey: string;
    assignedTo: string | null;
    assignmentNote: string | null;
  }[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('mint_keypairs')
      .select('queue_position, public_key, assigned_to, assignment_note')
      .eq('used', false)
      .order('queue_position', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error('Failed to fetch mint queue');
    }

    return (data || []).map(row => ({
      queuePosition: row.queue_position,
      publicKey: row.public_key,
      assignedTo: row.assigned_to,
      assignmentNote: row.assignment_note,
    }));
  }

  /**
   * Get keypairs assigned to a specific wallet
   * @param wallet Wallet address to check
   * @returns Array of assigned keypair public keys
   */
  static async getAssignedKeypairs(wallet: string): Promise<{
    queuePosition: number;
    publicKey: string;
    assignmentNote: string | null;
  }[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('mint_keypairs')
      .select('queue_position, public_key, assignment_note')
      .eq('used', false)
      .eq('assigned_to', wallet)
      .order('queue_position', { ascending: true });

    if (error) {
      throw new Error('Failed to fetch assigned keypairs');
    }

    return (data || []).map(row => ({
      queuePosition: row.queue_position,
      publicKey: row.public_key,
      assignmentNote: row.assignment_note,
    }));
  }

  /**
   * Assign a keypair to a specific wallet
   * @param publicKey The mint public key to assign
   * @param wallet The wallet address to assign it to
   * @param note Optional note about the assignment
   * @returns True if successful
   */
  static async assignKeypair(publicKey: string, wallet: string, note?: string): Promise<boolean> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('assign_mint_keypair', {
      p_public_key: publicKey,
      p_wallet: wallet,
      p_note: note || null,
    });

    if (error) {
      throw new Error('Failed to assign keypair');
    }

    return data === true;
  }

  /**
   * Remove assignment from a keypair
   * @param publicKey The mint public key to unassign
   * @returns True if successful
   */
  static async unassignKeypair(publicKey: string): Promise<boolean> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('unassign_mint_keypair', {
      p_public_key: publicKey,
    });

    if (error) {
      throw new Error('Failed to unassign keypair');
    }

    return data === true;
  }

}
