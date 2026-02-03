/**
 * Token Creation Service
 *
 * Handles token creation using Meteora DBC SDK with reverse partial signing pattern:
 * 1. Backend builds transaction with fresh blockhash
 * 2. User signs in frontend
 * 3. Backend adds mint signature and submits
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { MintKeypairService } from './mint-keypair-service';
import { MetadataUploadService } from './metadata-upload-service';
import bs58 from 'bs58';
import BN from 'bn.js';

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com';
const PLATFORM_SIGNER_ADDRESS = process.env.PLATFORM_SIGNER_ADDRESS!;
const DBC_DEFAULT_CONFIG = process.env.DBC_DEFAULT_CONFIG; // Optional default config

// Load platform signer from environment (this should be your platform's authority keypair)
// For now, we'll use the PLATFORM_SIGNER_ADDRESS for tracking, but you'll need the actual keypair
// TODO: Add PLATFORM_SIGNER_SECRET_KEY to .env for signing transactions
const getPlatformSigner = (): Keypair => {
  const secretKey = process.env.PLATFORM_SIGNER_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PLATFORM_SIGNER_SECRET_KEY not configured');
  }
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(secretKey)));
};

import { VestingConfig as ProjectVestingConfig } from './project-config-service';
import { RoadmapMilestone, VestingConfig } from '../types/token';

export interface TokenCreationParams {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  creator: PublicKey; // User's wallet
  customSuffix?: string; // Optional suffix for token address (e.g., "launch")

  // Meteora DBC specific params
  config?: PublicKey; // DBC config to use (optional, uses default if not provided)
  initialBuy?: number; // Optional initial buy amount in SOL

  website?: string;
  twitter?: string;
  telegram?: string;
  createdOn?: string;

  // Project token params
  tokenType?: 'meme' | 'project';
  category?: string;
  industry?: string;
  stage?: string;
  roadmap?: RoadmapMilestone[];
  vesting?: VestingConfig;
  graduationThreshold?: number; // SOL amount for graduation
  feeTierBps?: number; // Fee in basis points
}

export interface PrepareTokenResult {
  serializedTx: string; // Base64 encoded transaction for user to sign
  mintPubkey: string; // Mint public key
  expiresAt: number; // Timestamp when blockhash expires
  configPubkey?: string; // Custom config public key (for project tokens)
}

export interface SubmitTokenResult {
  signature: string;
  mintAddress: string;
  poolAddress?: string;
}

export class TokenCreationService {
  private connection: Connection;
  private dbcClient: DynamicBondingCurveClient;

  constructor() {
    this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
    this.dbcClient = new DynamicBondingCurveClient(this.connection, 'confirmed');
  }

  /**
   * Step 1: Prepare unsigned transaction for user to sign
   * Returns serialized transaction that user will sign in frontend
   */
  async prepareTokenCreation(params: TokenCreationParams): Promise<PrepareTokenResult> {
    try {
      // Generate mint keypair using MintKeypairService for persistent storage
      // This survives Next.js hot reloads during development
      // Pass creator wallet to check for assigned keypairs first
      const mintEntry = await MintKeypairService.getNextKeypair(params.creator.toBase58());
      const mintKeypair = mintEntry.keypair;
      const mintPubkey = mintEntry.publicKey;

      // Get fresh blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');

      // Build token creation transaction using Meteora DBC SDK
      // Note: The exact API depends on the SDK version. Adjust as needed.
      const transaction = await this.buildTokenCreationTransaction({
        mintKeypair,
        creator: params.creator,
        name: params.name,
        symbol: params.symbol,
        description: params.description,
        imageUrl: params.imageUrl,
        config: params.config,
        initialBuy: params.initialBuy,
        website: params.website,
        twitter: params.twitter,
        telegram: params.telegram,
        createdOn: params.createdOn,
      });

      // Set recent blockhash
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = params.creator;

      // Add a memo instruction signed by platform signer for token detection
      // This ensures unified stream can identify this as a platform token
      const platformSigner = getPlatformSigner();
      const memoInstruction = new TransactionInstruction({
        keys: [{ pubkey: platformSigner.publicKey, isSigner: true, isWritable: false }],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), // Memo program
        data: Buffer.from(`Platform: ${PLATFORM_SIGNER_ADDRESS}`, 'utf-8'),
      });

      // Add memo as first instruction so platform signature is visible
      transaction.instructions.unshift(memoInstruction);

      // CRITICAL: DO NOT sign here! Phantom requires USER to sign FIRST.
      // If we sign before the user, Phantom shows domain warnings.
      // We'll add our signatures in the submit step AFTER user signs.

      // We need to set signature placeholders for all required signers
      // The transaction needs mint + platform as signers (for memo instruction)
      // But we won't actually sign yet - just set up the signature array

      // Set signers list so wallet knows who needs to sign
      // User (fee payer) will sign first, then backend adds mint + platform signatures
      transaction.setSigners(
        params.creator, // User signs first
        mintKeypair.publicKey, // Mint signs second (added by backend)
        platformSigner.publicKey // Platform signs third (added by backend)
      );

      // Serialize UNSIGNED transaction for frontend
      // The transaction has signature placeholders but no actual signatures yet
      const serializedTx = transaction.serialize({
        requireAllSignatures: false, // User + mint + platform haven't signed yet
        verifySignatures: false,
      }).toString('base64');

      // Calculate expiration (60 seconds from now, but use 30s for safety)
      const expiresAt = Date.now() + 30000;

      return {
        serializedTx,
        mintPubkey,
        expiresAt,
      };
    } catch (error) {
      console.error('❌ Error preparing token creation:', error);
      throw error;
    }
  }

  /**
   * Step 2: Submit user-signed transaction
   * Backend adds final signatures and submits to network
   */
  async submitTokenCreation(
    serializedSignedTx: string,
    mintPubkey: string,
    userWallet: string
  ): Promise<SubmitTokenResult> {
    try {
      // Deserialize user-signed transaction
      const transaction = Transaction.from(Buffer.from(serializedSignedTx, 'base64'));

      // CRITICAL: Now add our signatures AFTER user has signed
      // This signing order prevents Phantom domain warnings
      // User signature comes first, then backend signatures

      // Get keypair from MintKeypairService (persistent storage via database)
      const mintEntry = await MintKeypairService.getCachedKeypair(mintPubkey);

      if (!mintEntry) {
        // Check if transaction is already fully signed (wallet auto-submitted)
        const isFullySigned = transaction.signatures.every(sig => sig.signature !== null);
        if (!isFullySigned) {
          throw new Error(
            'Token creation failed: Signing window expired (30 seconds). ' +
            'Please try creating the token again and sign more quickly.'
          );
        }
      } else {
        const platformSigner = getPlatformSigner();

        // Add our signatures AFTER user's signature
        transaction.partialSign(mintEntry.keypair, platformSigner);
      }

      // Submit transaction
      let signature: string;
      try {
        signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          }
        );
      } catch (sendError: any) {
        // Check if transaction was already processed (might have succeeded earlier)
        if (sendError.message?.includes('already been processed')) {
          // Get the signature from the transaction (first signature is the fee payer/main signature)
          const txSignature = transaction.signatures[0]?.signature;
          if (txSignature) {
            signature = bs58.encode(txSignature);
          } else {
            throw new Error('Transaction already processed but signature not found');
          }
        } else {
          throw sendError;
        }
      }

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      // Mark keypair as used in MintKeypairService
      await MintKeypairService.markAsUsed(mintPubkey, userWallet);

      return {
        signature,
        mintAddress: mintPubkey,
      };
    } catch (error: any) {
      console.error('❌ Error submitting token creation:', error);

      // Check for blockhash expiration
      if (error.message?.includes('Blockhash not found') || error.message?.includes('block height exceeded')) {
        throw new Error('BLOCKHASH_EXPIRED');
      }

      // Release keypair back to pool on failure
      await MintKeypairService.releaseKeypair(mintPubkey);

      throw error;
    }
  }

  /**
   * Build token creation transaction using Meteora DBC SDK
   * Creates a DBC pool with optional initial buy
   */
  private async buildTokenCreationTransaction(params: {
    mintKeypair: Keypair;
    creator: PublicKey;
    name: string;
    symbol: string;
    description: string;
    imageUrl: string;
    config?: PublicKey;
    initialBuy?: number;
    website?: string;
    twitter?: string;
    telegram?: string;
    createdOn?: string;
  }): Promise<Transaction> {
    try {
      // Get DBC config address (use provided, environment default, or error)
      // For devnet testing, you'll need to create a config key or use an existing one
      // See: https://docs.meteora.ag/developer-guide/quick-launch/dbc-token-launch-pool
      let configAddress = params.config;

      if (!configAddress && DBC_DEFAULT_CONFIG) {
        configAddress = new PublicKey(DBC_DEFAULT_CONFIG);
      }

      if (!configAddress) {
        throw new Error(
          'DBC config address is required.\n' +
          'Options:\n' +
          '1. Create one using: pnpm studio dbc-create-pool\n' +
          '2. Set DBC_DEFAULT_CONFIG in .env\n' +
          '3. Pass config parameter when creating token'
        );
      }

      // Create and upload metadata JSON (includes description + image)
      const metadataUri = await MetadataUploadService.createAndUploadMetadata({
        name: params.name,
        symbol: params.symbol,
        description: params.description || '',
        imageUrl: params.imageUrl,
        creator: params.creator.toBase58(),
        website: params.website || `https://www.launchpad.fun/token/${params.mintKeypair.publicKey.toString()}/`,
        twitter: params.twitter || '',
        telegram: params.telegram || '',
        createdOn: 'https://www.launchpad.fun',
      });

      // Check if initial buy is specified
      if (params.initialBuy && params.initialBuy > 0) {

        // Convert SOL to lamports
        const buyAmountLamports = new BN(params.initialBuy * LAMPORTS_PER_SOL);

        // Use createPoolWithFirstBuy for initial purchase
        // @ts-ignore - SDK types may not be fully available yet
        const result = await this.dbcClient.pool.createPoolWithFirstBuy({
          createPoolParam: {
            baseMint: params.mintKeypair.publicKey,
            config: configAddress,
            name: params.name,
            symbol: params.symbol,
            uri: metadataUri,
            payer: params.creator,
            poolCreator: params.creator,
          },
          firstBuyParam: {
            buyer: params.creator,
            buyAmount: buyAmountLamports,
            minimumAmountOut: new BN(1), // Minimal slippage protection
            referralTokenAccount: null,
          },
        });

        // The SDK returns both createPoolTx and swapBuyTx
        // We need to combine them into a single transaction
        const combinedTransaction = new Transaction();

        // Add all instructions from createPoolTx
        combinedTransaction.add(...result.createPoolTx.instructions);

        // Add swap buy instructions if they exist
        if (result.swapBuyTx) {
          combinedTransaction.add(...result.swapBuyTx.instructions);
        }

        return combinedTransaction;
      } else {
        // No initial buy, just create the pool
        // @ts-ignore - SDK types may not be fully available yet
        const transaction = await this.dbcClient.pool.createPool({
          baseMint: params.mintKeypair.publicKey,
          config: configAddress,
          name: params.name,
          symbol: params.symbol,
          uri: metadataUri,
          payer: params.creator,
          poolCreator: params.creator,
        });

        return transaction;
      }
    } catch (error: any) {
      throw new Error(`Failed to build transaction: ${error.message}`);
    }
  }

  /**
   * Get current mint keypair supply statistics
   */
  async getSupplyStats() {
    return MintKeypairService.getSupplyStats();
  }
}
