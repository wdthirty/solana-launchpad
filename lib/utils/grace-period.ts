/**
 * Grace Period Fee Calculator
 *
 * Calculates real-time fees during the 20-second grace period using
 * Meteora's exponential fee scheduler.
 *
 * Formula: Fee = Cliff Fee × (1 - Reduction Factor/10000)^Period
 *
 * Parameters:
 * - Cliff Fee: 5000 bp (50%) - starting fee
 * - Periods: 12
 * - Duration: 20 seconds (~1.67s per period)
 *
 * IMPORTANT: Fee Structure (Creator Fee + Platform Fee = Total On-Chain Fee)
 * - 0.25% option: 0.25% creator + 0.25% platform = 0.5% total
 * - 1% option: 1% creator + 1% platform = 2% total
 * - 2% option: 2% creator + 1% platform = 3% total
 * - 3% option: 3% creator + 1% platform = 4% total
 * - 4% option: 4% creator + 1% platform = 5% total
 * - 5% option: 5% creator + 1% platform = 6% total
 *
 * The grace period fee curve uses the ACTUAL on-chain values.
 */

import { FeeTier, feeTierToPercent } from '@/lib/config/dbc-configs';

export const GRACE_PERIOD_DURATION = 20; // seconds
export const GRACE_PERIOD_PERIODS = 12;
export const GRACE_PERIOD_CLIFF_FEE = 5000; // 50% in basis points (starting fee)
export const PERIOD_DURATION = GRACE_PERIOD_DURATION / GRACE_PERIOD_PERIODS; // ~1.67s

/**
 * Platform fee in basis points (1% = 100 bp)
 * Platform takes 1% on all tiers except 0.25% (where it takes 0.25%)
 */
export const PLATFORM_FEE_BP = 100; // 1%
export const PLATFORM_FEE_025_BP = 25; // 0.25% for the 0.25% tier

/**
 * Calculate the actual on-chain fee for a given creator fee tier
 * On-chain fee = creator fee + platform fee
 */
export function getActualOnChainFeeBp(feeTier: FeeTier): number {
  if (feeTier === FeeTier.FEE_025) {
    return feeTier + PLATFORM_FEE_025_BP; // 25 + 25 = 50 bp (0.5%)
  }
  return feeTier + PLATFORM_FEE_BP; // creator fee + 1%
}

/**
 * Reduction factors for each fee tier (pre-calculated)
 * Calculated using: RF = 10000 × (1 - (Target/Cliff)^(1/Periods))
 *
 * Target fees are the ACTUAL on-chain fees (creator + platform):
 * - FEE_025: 0.25% + 0.25% = 0.5% (50 bp) on-chain
 * - FEE_1: 1% + 1% = 2% (200 bp) on-chain
 * - FEE_2: 2% + 1% = 3% (300 bp) on-chain
 * - FEE_3: 3% + 1% = 4% (400 bp) on-chain
 * - FEE_4: 4% + 1% = 5% (500 bp) on-chain
 * - FEE_5: 5% + 1% = 6% (600 bp) on-chain
 */
export const REDUCTION_FACTORS: Record<FeeTier, number> = {
  // RF = 10000 × (1 - (50/5000)^(1/12)) = 3187 → 0.5% target
  [FeeTier.FEE_025]: 3187,
  // RF = 10000 × (1 - (200/5000)^(1/12)) = 2353 → 2% target
  [FeeTier.FEE_1]: 2353,
  // RF = 10000 × (1 - (300/5000)^(1/12)) = 2090 → 3% target
  [FeeTier.FEE_2]: 2090,
  // RF = 10000 × (1 - (400/5000)^(1/12)) = 1898 → 4% target
  [FeeTier.FEE_3]: 1898,
  // RF = 10000 × (1 - (500/5000)^(1/12)) = 1746 → 5% target
  [FeeTier.FEE_4]: 1746,
  // RF = 10000 × (1 - (600/5000)^(1/12)) = 1620 → 6% target
  [FeeTier.FEE_5]: 1620,
};

/**
 * Calculate fee at a specific period
 * Formula: Fee = Cliff × (1 - RF/10000)^Period
 */
export function calculateFeeAtPeriod(
  feeTier: FeeTier,
  period: number
): number {
  const reductionFactor = REDUCTION_FACTORS[feeTier];
  const multiplier = Math.pow(1 - reductionFactor / 10000, period);
  return Math.round(GRACE_PERIOD_CLIFF_FEE * multiplier);
}

/**
 * Get current period based on time elapsed since launch
 */
export function getCurrentPeriod(launchTimestamp: number): number {
  const elapsed = (Date.now() - launchTimestamp) / 1000; // seconds
  const period = Math.floor(elapsed / PERIOD_DURATION);
  return Math.min(period, GRACE_PERIOD_PERIODS);
}

/**
 * Calculate current fee based on time elapsed since launch
 * Returns fee in basis points
 */
export function getCurrentGracePeriodFee(
  feeTier: FeeTier,
  launchTimestamp: number
): number {
  const period = getCurrentPeriod(launchTimestamp);
  return calculateFeeAtPeriod(feeTier, period);
}

/**
 * Check if grace period is still active
 */
export function isGracePeriodActive(launchTimestamp: number): boolean {
  const elapsed = (Date.now() - launchTimestamp) / 1000;
  return elapsed < GRACE_PERIOD_DURATION;
}

/**
 * Get time remaining in grace period (in seconds)
 */
export function getGracePeriodTimeRemaining(launchTimestamp: number): number {
  const elapsed = (Date.now() - launchTimestamp) / 1000;
  const remaining = GRACE_PERIOD_DURATION - elapsed;
  return Math.max(0, remaining);
}

/**
 * Get progress through grace period (0-1)
 */
export function getGracePeriodProgress(launchTimestamp: number): number {
  const elapsed = (Date.now() - launchTimestamp) / 1000;
  const progress = Math.min(elapsed / GRACE_PERIOD_DURATION, 1);
  return progress;
}

/**
 * Format fee in basis points as percentage
 */
export function formatFeeBasisPoints(feeBp: number): string {
  const percent = feeBp / 100;
  return `${percent.toFixed(2)}%`;
}

/**
 * Format time in seconds as MM:SS
 */
export function formatTimeRemaining(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Pre-calculated fee schedules for all tiers
 * Used for displaying the fee curve in the UI
 */
export interface FeeSchedulePeriod {
  period: number;
  fee: number; // basis points
  timeElapsed: number; // seconds
}

export function getFeeSchedule(feeTier: FeeTier): FeeSchedulePeriod[] {
  const schedule: FeeSchedulePeriod[] = [];

  for (let period = 0; period <= GRACE_PERIOD_PERIODS; period++) {
    schedule.push({
      period,
      fee: calculateFeeAtPeriod(feeTier, period),
      timeElapsed: period * PERIOD_DURATION,
    });
  }

  return schedule;
}

/**
 * Get summary of grace period settings
 * Note: Returns actual on-chain values (creator fee + platform fee)
 */
export function getGracePeriodSummary(feeTier: FeeTier) {
  const displayedFeePercent = feeTierToPercent(feeTier);
  const actualOnChainFeeBp = getActualOnChainFeeBp(feeTier);
  const actualOnChainFeePercent = actualOnChainFeeBp / 100;
  const schedule = getFeeSchedule(feeTier);

  return {
    duration: GRACE_PERIOD_DURATION,
    periods: GRACE_PERIOD_PERIODS,
    startFee: GRACE_PERIOD_CLIFF_FEE, // 5000 bp (50%)
    targetFee: actualOnChainFeeBp, // actual on-chain target fee in bp
    startFeePercent: GRACE_PERIOD_CLIFF_FEE / 100, // 50%
    targetFeePercent: actualOnChainFeePercent, // actual on-chain target fee as %
    displayedTargetFeePercent: displayedFeePercent, // what users see as "creator fee"
    reductionFactor: REDUCTION_FACTORS[feeTier],
    schedule,
  };
}
