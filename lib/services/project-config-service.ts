/**
 * Project Config Service
 *
 * Creates custom DBC configurations for project tokens with vesting schedules.
 * Each project token gets its own config with locked vesting parameters.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import BN from 'bn.js';
import {
  DynamicBondingCurveClient,
  CollectFeeMode,
  TokenType,
  ActivationType,
  MigrationOption,
  BaseFeeMode,
  MigrationFeeOption,
  TokenDecimal,
  buildCurve,
  buildCurveWithMarketCap,
  TokenUpdateAuthorityOption,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com';

// Platform fee claimer address
const PLATFORM_FEE_CLAIMER = process.env.PLATFORM_FEE_CLAIMER || process.env.PLATFORM_SIGNER_ADDRESS;

/**
 * Vesting configuration from the UI
 */
export interface VestingConfig {
  enabled: boolean;
  vestingPercentage: number; // % of total supply to vest (1-100)
  vestingDuration: number; // Duration value
  vestingDurationUnit: 'days' | 'weeks' | 'months';
  unlockSchedule: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
  cliffEnabled: boolean;
  cliffDuration: number;
  cliffDurationUnit: 'days' | 'weeks' | 'months';
  cliffPercentage: number; // % released at cliff (0-100)
}

/**
 * Parameters for creating a project config
 */
export interface CreateProjectConfigParams {
  payer: PublicKey;
  graduationThreshold: number; // SOL amount for graduation
  feeTierBps: number; // Fee in basis points (100 = 1%)
  vesting?: VestingConfig;
}

/**
 * Result of creating a project config
 */
export interface CreateProjectConfigResult {
  configKeypair: Keypair;
  transaction: Transaction;
}

/**
 * Parameters for creating config and pool together
 */
export interface CreateProjectConfigAndPoolParams {
  payer: PublicKey;
  poolCreator: PublicKey;
  mintKeypair: Keypair;
  name: string;
  symbol: string;
  uri: string;
  graduationThreshold: number;
  feeTierBps: number;
  vesting?: VestingConfig;
  initialBuy?: number; // Optional initial buy in SOL
  graceMode?: boolean; // Enable anti-sniper grace period (50% fee for 20s, decreasing)
}

/**
 * Result of creating config and pool
 */
export interface CreateProjectConfigAndPoolResult {
  configKeypair: Keypair;
  transactions: Transaction[]; // May include createConfigTx, createPoolTx, swapBuyTx
}

// Token supply constants
const TOTAL_TOKEN_SUPPLY = 1_000_000_000; // 1 billion tokens
const TOKEN_DECIMALS = 6;

// Migration settings (matches meme token configs)
const MIGRATION_QUOTE_THRESHOLD = 83;
const PERCENTAGE_SUPPLY_ON_MIGRATION = 20;

// Grace mode constants (matches meme token configs)
const GRACE_NUMBER_OF_PERIODS = 12;
const GRACE_TOTAL_DURATION = 20; // seconds
const GRACE_STARTING_FEE_BPS = 5000; // 50%

// Migration fee settings
const MIGRATION_FEE_PERCENTAGE = 5;
const CREATOR_MIGRATION_FEE_PERCENTAGE = 50;

/**
 * Calculate reduction factor for exponential fee decay (grace mode)
 * This determines how quickly the fee decreases from startingFeeBps to endingFeeBps
 */
function calculateReductionFactor(endingFeeBps: number, startingFeeBps: number, periods: number): number {
  const ratio = endingFeeBps / startingFeeBps;
  const factor = 10000 * (1 - Math.pow(ratio, 1 / periods));
  return Math.round(factor);
}

/**
 * Calculate trading fee configuration based on fee tier
 *
 * Fee structure (matches meme token configs):
 * - 0.25% displayed → 0.5% on-chain (50/50 split)
 * - 1% displayed → 2% on-chain (50/50 split)
 * - 2% displayed → 3% on-chain (66% creator, 34% platform)
 * - 3% displayed → 4% on-chain (75% creator, 25% platform)
 * - 4% displayed → 5% on-chain (80% creator, 20% platform)
 * - 5% displayed → 6% on-chain (83% creator, 17% platform)
 *
 * Locked LP split follows same ratio as trading fee split
 * Migration fee: 5% total, 50% to creator
 *
 * @returns actualFeeBps - The actual on-chain trading fee
 * @returns creatorTradingFeePercentage - What % of trading fees goes to creator (0-100)
 */
function calculateFeeConfig(feeTierBps: number): {
  actualFeeBps: number;
  creatorTradingFeePercentage: number;
} {
  // Map displayed fee (bps) to on-chain fee and creator percentage
  // Matches the studio/dbc/create-config configuration
  switch (feeTierBps) {
    case 25: // 0.25% displayed → 0.5% on-chain
      return { actualFeeBps: 50, creatorTradingFeePercentage: 50 };
    case 100: // 1% displayed → 2% on-chain
      return { actualFeeBps: 200, creatorTradingFeePercentage: 50 };
    case 200: // 2% displayed → 3% on-chain
      return { actualFeeBps: 300, creatorTradingFeePercentage: 66 };
    case 300: // 3% displayed → 4% on-chain
      return { actualFeeBps: 400, creatorTradingFeePercentage: 75 };
    case 400: // 4% displayed → 5% on-chain
      return { actualFeeBps: 500, creatorTradingFeePercentage: 80 };
    case 500: // 5% displayed → 6% on-chain
      return { actualFeeBps: 600, creatorTradingFeePercentage: 83 };
    default:
      // Fallback: double the fee and split 50/50
      return { actualFeeBps: feeTierBps * 2, creatorTradingFeePercentage: 50 };
  }
}

/**
 * Convert duration to seconds
 */
function durationToSeconds(value: number, unit: 'days' | 'weeks' | 'months'): number {
  const secondsPerDay = 24 * 60 * 60;
  switch (unit) {
    case 'days':
      return value * secondsPerDay;
    case 'weeks':
      return value * 7 * secondsPerDay;
    case 'months':
      return value * 30 * secondsPerDay; // Approximate
  }
}

/**
 * Convert unlock schedule to frequency in seconds
 */
function unlockScheduleToFrequency(schedule: 'daily' | 'weekly' | 'bi-weekly' | 'monthly'): number {
  const secondsPerDay = 24 * 60 * 60;
  switch (schedule) {
    case 'daily':
      return secondsPerDay;
    case 'weekly':
      return 7 * secondsPerDay;
    case 'bi-weekly':
      return 14 * secondsPerDay;
    case 'monthly':
      return 30 * secondsPerDay;
  }
}

/**
 * Calculate locked vesting parameters from UI config
 *
 * Note: The SDK calculates frequency as: totalVestingDuration / numberOfVestingPeriod
 * The cliff is added separately, so totalVestingDuration should be the time AFTER cliff
 * for the periodic unlocks only (not including cliff time).
 *
 * Total on-chain vesting time = cliffDuration + totalVestingDuration
 */
function calculateLockedVestingParams(vesting: VestingConfig) {
  if (!vesting.enabled) {
    return {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    };
  }

  // Calculate total tokens to vest (in token units, not lamports - SDK handles conversion)
  const totalVestingTokens = Math.floor(TOTAL_TOKEN_SUPPLY * (vesting.vestingPercentage / 100));

  // Calculate cliff unlock amount
  const cliffUnlockTokens = vesting.cliffEnabled
    ? Math.floor(totalVestingTokens * (vesting.cliffPercentage / 100))
    : 0;

  // Calculate cliff duration in seconds
  const cliffDurationSeconds = vesting.cliffEnabled
    ? durationToSeconds(vesting.cliffDuration, vesting.cliffDurationUnit)
    : 0;

  // Calculate the total user-specified vesting duration
  const userVestingDurationSeconds = durationToSeconds(vesting.vestingDuration, vesting.vestingDurationUnit);

  // Calculate unlock frequency based on schedule
  const unlockFrequencySeconds = unlockScheduleToFrequency(vesting.unlockSchedule);

  // Calculate time remaining after cliff for periodic unlocks
  const postCliffDuration = userVestingDurationSeconds - cliffDurationSeconds;

  // Calculate number of vesting periods based on unlock schedule
  const numberOfPeriods = Math.max(1, Math.floor(postCliffDuration / unlockFrequencySeconds));

  // SDK calculates frequency = totalVestingDuration / numberOfPeriods
  // So totalVestingDuration should be numberOfPeriods * unlockFrequency (post-cliff duration only)
  // This ensures the frequency matches the user's unlock schedule
  const totalVestingDuration = numberOfPeriods * unlockFrequencySeconds;

  return {
    totalLockedVestingAmount: totalVestingTokens,
    numberOfVestingPeriod: numberOfPeriods,
    cliffUnlockAmount: cliffUnlockTokens,
    totalVestingDuration: totalVestingDuration,
    cliffDurationFromMigrationTime: cliffDurationSeconds,
  };
}

/**
 * Calculate migration market cap from graduation threshold
 *
 * The graduation threshold is the SOL amount in the pool when migration happens.
 * We need to convert this to a market cap value for the SDK.
 *
 * For a bonding curve: migrationMarketCap ≈ graduationThreshold * 2 (approximately)
 * This is because at migration, the pool has both token and SOL liquidity.
 */
function calculateMigrationMarketCap(graduationThresholdSol: number): number {
  // The migration market cap is roughly 2x the SOL threshold
  // This accounts for the token value in the pool at migration
  return graduationThresholdSol * 2;
}

export class ProjectConfigService {
  private connection: Connection;
  private dbcClient: DynamicBondingCurveClient;

  constructor() {
    this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
    this.dbcClient = new DynamicBondingCurveClient(this.connection, 'confirmed');
  }

  /**
   * Create a custom DBC config for a project token
   */
  async createProjectConfig(params: CreateProjectConfigParams): Promise<CreateProjectConfigResult> {
    const configKeypair = Keypair.generate();

    if (!PLATFORM_FEE_CLAIMER) {
      throw new Error('PLATFORM_FEE_CLAIMER or PLATFORM_SIGNER_ADDRESS must be configured');
    }

    const feeClaimer = new PublicKey(PLATFORM_FEE_CLAIMER);

    // Calculate locked vesting params
    const lockedVestingParam = params.vesting
      ? calculateLockedVestingParams(params.vesting)
      : {
          totalLockedVestingAmount: 0,
          numberOfVestingPeriod: 0,
          cliffUnlockAmount: 0,
          totalVestingDuration: 0,
          cliffDurationFromMigrationTime: 0,
        };

    // Calculate migration market cap from graduation threshold
    const migrationMarketCap = calculateMigrationMarketCap(params.graduationThreshold);

    // Build curve configuration
    const configKeyParams = buildCurveWithMarketCap({
      totalTokenSupply: TOTAL_TOKEN_SUPPLY,
      initialMarketCap: 20, // Starting market cap in SOL (standard)
      migrationMarketCap,
      migrationOption: MigrationOption.MET_DAMM_V2,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.NINE, // SOL has 9 decimals
      lockedVestingParam,
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: params.feeTierBps,
          endingFeeBps: params.feeTierBps,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: true,
      activationType: ActivationType.Slot,
      collectFeeMode: CollectFeeMode.QuoteToken,
      migrationFeeOption: MigrationFeeOption.FixedBps100, // 1% migration fee
      tokenType: TokenType.SPL,
      partnerLpPercentage: 0,
      creatorLpPercentage: 0,
      partnerLockedLpPercentage: 100,
      creatorLockedLpPercentage: 0,
      creatorTradingFeePercentage: 0,
      leftover: 10000, // 1% leftover for rounding
      tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
      migrationFee: {
        feePercentage: 0,
        creatorFeePercentage: 0,
      },
    });

    console.log('Creating project config with params:', {
      configAddress: configKeypair.publicKey.toString(),
      graduationThreshold: params.graduationThreshold,
      migrationMarketCap,
      feeTierBps: params.feeTierBps,
      lockedVestingParam,
    });

    // Create config transaction
    // @ts-ignore - SDK types may vary
    const transaction = await this.dbcClient.partner.createConfig({
      config: configKeypair.publicKey,
      feeClaimer,
      leftoverReceiver: feeClaimer,
      quoteMint: NATIVE_MINT,
      payer: params.payer,
      ...configKeyParams,
    });

    return {
      configKeypair,
      transaction,
    };
  }

  /**
   * Create config transaction using partner.createConfig
   */
  async createConfigTransaction(params: CreateProjectConfigAndPoolParams): Promise<{
    configKeypair: Keypair;
    configTx: Transaction;
    configParams: ReturnType<typeof buildCurve>;
  }> {
    const configKeypair = Keypair.generate();

    if (!PLATFORM_FEE_CLAIMER) {
      throw new Error('PLATFORM_FEE_CLAIMER or PLATFORM_SIGNER_ADDRESS must be configured');
    }

    const feeClaimer = new PublicKey(PLATFORM_FEE_CLAIMER);

    // Calculate locked vesting params
    const lockedVestingParam = params.vesting
      ? calculateLockedVestingParams(params.vesting)
      : {
          totalLockedVestingAmount: 0,
          numberOfVestingPeriod: 0,
          cliffUnlockAmount: 0,
          totalVestingDuration: 0,
          cliffDurationFromMigrationTime: 0,
        };

    // Calculate fee configuration (matches meme token configs)
    const feeConfig = calculateFeeConfig(params.feeTierBps);
    const { actualFeeBps, creatorTradingFeePercentage } = feeConfig;

    // Determine base fee mode and parameters based on grace mode
    const baseFeeMode = params.graceMode
      ? BaseFeeMode.FeeSchedulerExponential
      : BaseFeeMode.FeeSchedulerLinear;

    const activationType = params.graceMode
      ? ActivationType.Timestamp
      : ActivationType.Slot;

    const feeSchedulerParam = params.graceMode
      ? {
          startingFeeBps: GRACE_STARTING_FEE_BPS,
          endingFeeBps: actualFeeBps,
          numberOfPeriod: GRACE_NUMBER_OF_PERIODS,
          totalDuration: GRACE_TOTAL_DURATION,
        }
      : {
          startingFeeBps: actualFeeBps,
          endingFeeBps: actualFeeBps,
          numberOfPeriod: 0,
          totalDuration: 0,
        };

    // Build curve configuration (matches meme token configs)
    const configParams = buildCurve({
      totalTokenSupply: TOTAL_TOKEN_SUPPLY,
      migrationQuoteThreshold: params.graduationThreshold || MIGRATION_QUOTE_THRESHOLD,
      percentageSupplyOnMigration: PERCENTAGE_SUPPLY_ON_MIGRATION,
      migrationOption: MigrationOption.MET_DAMM_V2,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.NINE,
      lockedVestingParam,
      baseFeeParams: {
        baseFeeMode,
        feeSchedulerParam,
      },
      dynamicFeeEnabled: true,
      activationType,
      collectFeeMode: CollectFeeMode.QuoteToken,
      migrationFeeOption: 6 as MigrationFeeOption, // Customizable migration fee
      tokenType: TokenType.SPL,
      partnerLpPercentage: 0,
      creatorLpPercentage: 0,
      // Locked LP split follows same ratio as trading fee split
      partnerLockedLpPercentage: 100 - creatorTradingFeePercentage,
      creatorLockedLpPercentage: creatorTradingFeePercentage,
      creatorTradingFeePercentage,
      leftover: 0,
      tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
      migrationFee: {
        feePercentage: MIGRATION_FEE_PERCENTAGE,
        creatorFeePercentage: CREATOR_MIGRATION_FEE_PERCENTAGE,
      },
      migratedPoolFee: {
        collectFeeMode: CollectFeeMode.QuoteToken,
        dynamicFee: 1,
        poolFeeBps: actualFeeBps,
      },
    });

    console.log('Creating project config with params:', {
      configAddress: configKeypair.publicKey.toString(),
      graduationThreshold: params.graduationThreshold,
      feeTierBps: params.feeTierBps,
      actualFeeBps,
      creatorTradingFeePercentage,
      graceMode: params.graceMode,
      baseFeeMode: params.graceMode ? 'Exponential' : 'Linear',
      feeSchedulerParam,
      lockedVestingParam,
    });

    // Create config transaction using partner.createConfig
    // @ts-ignore - SDK types may vary
    const configTx = await this.dbcClient.partner.createConfig({
      config: configKeypair.publicKey,
      feeClaimer,
      leftoverReceiver: feeClaimer,
      quoteMint: NATIVE_MINT,
      payer: params.payer,
      ...configParams,
    });

    return {
      configKeypair,
      configTx,
      configParams,
    };
  }

  /**
   * Create pool transaction using pool.createPool or pool.createPoolWithFirstBuy
   * This should be called AFTER the config transaction is confirmed on-chain
   */
  async createPoolTransaction(params: {
    configPubkey: PublicKey;
    payer: PublicKey;
    poolCreator: PublicKey;
    mintKeypair: Keypair;
    name: string;
    symbol: string;
    uri: string;
    initialBuy?: number;
  }): Promise<{ poolTx: Transaction }> {
    console.log('Creating pool with params:', {
      configAddress: params.configPubkey.toString(),
      mintAddress: params.mintKeypair.publicKey.toString(),
      initialBuy: params.initialBuy,
    });

    if (params.initialBuy && params.initialBuy > 0) {
      // Use createPoolWithFirstBuy for initial buy
      // @ts-ignore - SDK types may vary
      const result = await this.dbcClient.pool.createPoolWithFirstBuy({
        createPoolParam: {
          config: params.configPubkey,
          baseMint: params.mintKeypair.publicKey,
          name: params.name,
          symbol: params.symbol,
          uri: params.uri,
          payer: params.payer,
          poolCreator: params.poolCreator,
        },
        firstBuyParam: {
          buyer: params.poolCreator,
          buyAmount: new BN(params.initialBuy * LAMPORTS_PER_SOL),
          minimumAmountOut: new BN(0),
          referralTokenAccount: null,
        },
      });

      // Combine both transactions into a single transaction (like meme token flow)
      // This ensures the swap can simulate properly and shows total cost to user
      const combinedTransaction = new Transaction();
      combinedTransaction.add(...result.createPoolTx.instructions);
      if (result.swapBuyTx) {
        combinedTransaction.add(...result.swapBuyTx.instructions);
      }

      return { poolTx: combinedTransaction };
    } else {
      // Use createPool without initial buy
      // @ts-ignore - SDK types may vary
      const poolTx = await this.dbcClient.pool.createPool({
        config: params.configPubkey,
        baseMint: params.mintKeypair.publicKey,
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        payer: params.payer,
        poolCreator: params.poolCreator,
      });

      return { poolTx };
    }
  }

  /**
   * Get the connection for external use
   */
  getConnection(): Connection {
    return this.connection;
  }
}

// Export singleton instance
export const projectConfigService = new ProjectConfigService();
