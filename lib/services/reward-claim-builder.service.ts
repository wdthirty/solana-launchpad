// Reward Claim Builder Service
// Builds claim transactions on client side using wallet connection
// Used after prepare-claim API returns transaction data

import {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import { BN } from 'bn.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, getTokenProgram } from '@meteora-ag/cp-amm-sdk';

export interface ClaimTransactionData {
  tokenAddress: string;
  poolAddress: string;
  creatorWallet: string;
  dammV2PoolAddress?: string;
  availableRewards: {
    dbc: boolean;
    migration: boolean;
    damm: boolean;
  };
  amounts: {
    dbcSol: number;
    migrationSol: number;
    dammSol: number;
    totalSol: number;
  };
  poolData: {
    baseMint: string;
    config: string;
    isMigrated: boolean;
    migrationFeeWithdrawStatus: boolean;
  };
  dammPoolState?: any;
  userPositions?: any[];
}

export class RewardClaimBuilder {
  private dbcClient: DynamicBondingCurveClient;
  private dammClient: CpAmm;

  constructor(private connection: Connection) {
    this.dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');
    this.dammClient = new CpAmm(connection);
  }

  /**
   * Build all claim transactions from prepared data
   * Returns array of VersionedTransactions ready to sign
   */
  async buildClaimTransactions(
    data: ClaimTransactionData,
    userPublicKey: PublicKey
  ): Promise<VersionedTransaction[]> {
    const poolId = new PublicKey(data.poolAddress);
    const creatorPubkey = new PublicKey(data.creatorWallet);
    const receiverAddress = userPublicKey; // User wallet receives the SOL

    // Fetch blockhash once for all transactions (faster than fetching per tx)
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');

    // Build all transaction instructions in parallel
    const txPromises: Promise<{ type: string; tx: any } | null>[] = [];

    // 1. DBC Trading Fees (tradingFee / 2)
    if (data.availableRewards.dbc) {
      txPromises.push(
        this.dbcClient.creator
          .claimCreatorTradingFee2({
            creator: creatorPubkey,
            payer: receiverAddress,
            receiver: receiverAddress,
            pool: poolId,
            maxBaseAmount: new BN(1_000_000_000_000_000),
            maxQuoteAmount: new BN(1_000_000_000_000_000),
          })
          .then((tx) => ({ type: 'DBC', tx }))
          .catch((error) => {
            console.error('[ClaimBuilder] Failed to build DBC fees transaction:', error);
            return null;
          })
      );
    }

    // 2. Migration Fee (2 SOL fixed)
    if (data.availableRewards.migration) {
      txPromises.push(
        this.dbcClient.creator
          .creatorWithdrawMigrationFee({
            virtualPool: poolId,
            sender: creatorPubkey,
          })
          .then((tx) => ({ type: 'Migration', tx }))
          .catch((error) => {
            console.error('[ClaimBuilder] Failed to build migration fee transaction:', error);
            return null;
          })
      );
    }

    // 3. DAMM v2 Pool Fees (tradingFee - partnerFee, perpetual)
    if (
      data.availableRewards.damm &&
      data.dammV2PoolAddress &&
      data.dammPoolState &&
      data.userPositions &&
      data.userPositions.length > 0
    ) {
      const dammV2PoolAddress = new PublicKey(data.dammV2PoolAddress);
      const firstPosition = data.userPositions[0];

      // Convert string addresses to PublicKey objects (API returns strings)
      const tokenAMint = new PublicKey(data.dammPoolState.tokenAMint);
      const tokenBMint = new PublicKey(data.dammPoolState.tokenBMint);
      const tokenAVault = new PublicKey(data.dammPoolState.tokenAVault);
      const tokenBVault = new PublicKey(data.dammPoolState.tokenBVault);
      const position = new PublicKey(firstPosition.position);
      const positionNftAccount = new PublicKey(firstPosition.positionNftAccount);

      txPromises.push(
        this.dammClient
          .claimPositionFee2({
            owner: creatorPubkey,
            receiver: receiverAddress,
            pool: dammV2PoolAddress,
            position,
            positionNftAccount,
            tokenAVault,
            tokenBVault,
            tokenAMint,
            tokenBMint,
            tokenAProgram: getTokenProgram(data.dammPoolState.tokenAFlag),
            tokenBProgram: getTokenProgram(data.dammPoolState.tokenBFlag),
            feePayer: receiverAddress,
          })
          .then((tx) => ({ type: 'DAMM', tx }))
          .catch((error) => {
            console.error('[ClaimBuilder] Failed to build DAMM v2 fees transaction:', error);
            return null;
          })
      );
    }

    // Wait for all transaction builds in parallel
    const txResults = await Promise.all(txPromises);
    const validResults = txResults.filter((r): r is { type: string; tx: any } => r !== null);

    if (validResults.length === 0) {
      throw new Error('No claimable transactions could be built');
    }

    // Convert all to versioned transactions (reusing same blockhash)
    const transactions: VersionedTransaction[] = [];
    for (const result of validResults) {
      const versionedTx = await this.buildVersionedTransaction(result.tx, userPublicKey, blockhash);
      transactions.push(versionedTx);
    }

    return transactions;
  }

  /**
   * Convert transaction to VersionedTransaction (Phantom wallet compatible)
   */
  private async buildVersionedTransaction(
    transaction: any,
    userPublicKey: PublicKey,
    blockhash?: string
  ): Promise<VersionedTransaction> {
    // Use provided blockhash or fetch one (confirmed is faster than finalized)
    const recentBlockhash = blockhash || (await this.connection.getLatestBlockhash('confirmed')).blockhash;

    // Build message
    const msg = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash,
      instructions: transaction.instructions,
    }).compileToV0Message();

    return new VersionedTransaction(msg);
  }

  /**
   * Sign and send all claim transactions
   * Returns array of transaction signatures
   */
  async executeClaimTransactions(
    data: ClaimTransactionData,
    userPublicKey: PublicKey,
    signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>
  ): Promise<string[]> {
    const signatures: string[] = [];

    try {
      // Build all transactions
      const transactions = await this.buildClaimTransactions(data, userPublicKey);

      // Sign and send each transaction
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];

        // Sign with wallet
        const signedTx = await signTransaction(tx);

        // Send transaction
        const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        // Wait for confirmation
        await this.connection.confirmTransaction(signature, 'confirmed');

        signatures.push(signature);
      }

      return signatures;
    } catch (error: any) {
      throw new Error(`Failed to execute claims: ${error.message}`);
    }
  }
}
