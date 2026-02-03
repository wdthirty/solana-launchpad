/**
 * OCN (On-Chain Name) Special Token Rewards Configuration
 *
 * This token has a custom rewards split where the platform holds the LP token
 * and splits rewards 2/3 to creator, 1/3 to platform.
 */

// The specific token with custom reward handling
export const OCN_TOKEN_ADDRESS = 'YOUR_SPECIAL_TOKEN_ADDRESS';

// Platform wallet that holds the Meteora DAMM v2 LP token for this coin
export const OCN_LP_HOLDER_WALLET = 'YOUR_LP_HOLDER_WALLET';

// Reward split ratios
export const OCN_CREATOR_SHARE = 2 / 3; // 66.66% to creator
export const OCN_PLATFORM_SHARE = 1 / 3; // 33.33% to platform

// USDC mint address (rewards are in USDC for this token)
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC - public constant

/**
 * Check if a token address is the OCN special token
 */
export function isOcnToken(tokenAddress: string): boolean {
  return tokenAddress === OCN_TOKEN_ADDRESS;
}

/**
 * Calculate creator's share of rewards (2/3)
 */
export function calculateCreatorShare(totalAmount: number): number {
  return totalAmount * OCN_CREATOR_SHARE;
}

/**
 * Calculate platform's share of rewards (1/3)
 */
export function calculatePlatformShare(totalAmount: number): number {
  return totalAmount * OCN_PLATFORM_SHARE;
}
