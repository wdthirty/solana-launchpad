/**
 * DBC Configuration Management
 *
 * Manages Meteora DBC config addresses for different fee tiers and grace modes.
 * Each fee tier (0.25% - 5%) has two configs:
 * - Grace mode disabled: Normal fee structure
 * - Grace mode enabled: 50% fee for 20s, exponentially decreasing to target fee
 *
 * Total: 12 configs (6 fee tiers × 2 grace modes)
 */

import { PublicKey } from '@solana/web3.js';

export interface DBCConfigInfo {
  feeTier: number; // Fee in basis points (25, 100, 200, 300, 400, 500)
  feePercent: number; // Fee as percentage (0.25, 1, 2, 3, 4, 5)
  graceMode: boolean; // Whether grace period is enabled
  configAddress: string; // DBC config public key
}

/**
 * Fee tier enumeration
 */
export enum FeeTier {
  FEE_025 = 25, // 0.25%
  FEE_1 = 100, // 1%
  FEE_2 = 200, // 2%
  FEE_3 = 300, // 3%
  FEE_4 = 400, // 4%
  FEE_5 = 500, // 5%
}

/**
 * All available fee tiers
 */
export const FEE_TIERS = [
  FeeTier.FEE_025,
  FeeTier.FEE_1,
  FeeTier.FEE_2,
  FeeTier.FEE_3,
  FeeTier.FEE_4,
  FeeTier.FEE_5,
] as const;

/**
 * Convert fee tier to percentage
 */
export function feeTierToPercent(feeTier: FeeTier): number {
  return feeTier / 100;
}

/**
 * Convert percentage to fee tier
 */
export function percentToFeeTier(percent: number): FeeTier {
  const bp = Math.round(percent * 100);
  const tier = FEE_TIERS.find((t) => t === bp);
  if (!tier) {
    throw new Error(`Invalid fee percent: ${percent}%`);
  }
  return tier;
}

/**
 * Get DBC config address from environment variables
 */
function getConfigFromEnv(feeTier: FeeTier, graceMode: boolean): string {
  const feePercent = feeTierToPercent(feeTier);
  const graceSuffix = graceMode ? '_GRACE' : '';
  const envKey = `DBC_CONFIG_${feePercent.toString().replace('.', '_')}${graceSuffix}`;

  const config = process.env[envKey];

  if (!config) {
    console.warn(
      `⚠️  Missing DBC config: ${envKey}. Using placeholder. Please add to .env`
    );
    return 'PLACEHOLDER_CONFIG_ADDRESS';
  }

  return config;
}

/**
 * Load all DBC configs from environment
 */
export function loadDBCConfigs(): DBCConfigInfo[] {
  const configs: DBCConfigInfo[] = [];

  for (const feeTier of FEE_TIERS) {
    // Grace mode disabled
    configs.push({
      feeTier,
      feePercent: feeTierToPercent(feeTier),
      graceMode: false,
      configAddress: getConfigFromEnv(feeTier, false),
    });

    // Grace mode enabled
    configs.push({
      feeTier,
      feePercent: feeTierToPercent(feeTier),
      graceMode: true,
      configAddress: getConfigFromEnv(feeTier, true),
    });
  }

  return configs;
}

/**
 * Get specific DBC config
 */
export function getDBCConfig(feeTier: FeeTier, graceMode: boolean): DBCConfigInfo {
  const configs = loadDBCConfigs();
  const config = configs.find(
    (c) => c.feeTier === feeTier && c.graceMode === graceMode
  );

  if (!config) {
    throw new Error(`DBC config not found: ${feeTier}bp, grace=${graceMode}`);
  }

  return config;
}

/**
 * Get DBC config as PublicKey (validates address)
 * Falls back to DBC_DEFAULT_CONFIG if config is a placeholder
 */
export function getDBCConfigPubkey(feeTier: FeeTier, graceMode: boolean): PublicKey {
  const config = getDBCConfig(feeTier, graceMode);

  if (config.configAddress === 'PLACEHOLDER_CONFIG_ADDRESS') {
    // Fall back to default config if placeholder
    const defaultConfig = process.env.DBC_DEFAULT_CONFIG;
    if (!defaultConfig) {
      throw new Error(
        `Config for ${config.feePercent}% (grace=${graceMode}) is not configured.\n` +
        `Please add the config address to .env or set DBC_DEFAULT_CONFIG as fallback.`
      );
    }

    console.warn(
      `⚠️  Using DBC_DEFAULT_CONFIG as fallback for ${config.feePercent}% (grace=${graceMode})`
    );

    try {
      return new PublicKey(defaultConfig);
    } catch (error) {
      throw new Error(`Invalid DBC_DEFAULT_CONFIG: ${defaultConfig}`);
    }
  }

  try {
    return new PublicKey(config.configAddress);
  } catch (error) {
    throw new Error(
      `Invalid DBC config address for ${config.feePercent}% (grace=${graceMode}): ${config.configAddress}`
    );
  }
}

/**
 * Format fee tier for display
 */
export function formatFeeTier(feeTier: FeeTier): string {
  const percent = feeTierToPercent(feeTier);
  return `${percent}%`;
}

/**
 * Default configuration (if not specified by user)
 */
export const DEFAULT_FEE_TIER = FeeTier.FEE_1; // 1%
export const DEFAULT_GRACE_MODE = false;
