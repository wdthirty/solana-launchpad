'use client';

import React, { useMemo, useState, useRef, useId } from 'react';
import { parseBackgroundPosition } from '@/lib/utils';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Lock, Clock } from 'lucide-react';
import { formatReadableNumber } from '@/lib/format/number';

interface HoverState {
  x: number;
  y: number;
  snappedX: number;
  snappedY: number;
  time: string;
  percent: number;
  tokens: number;
}

interface VestingConfig {
  enabled: boolean;
  vestingPercentage: number;
  vestingDuration: number;
  vestingDurationUnit: 'days' | 'weeks' | 'months';
  unlockSchedule: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
  cliffEnabled: boolean;
  cliffDuration: number;
  cliffDurationUnit: 'days' | 'weeks' | 'months';
  cliffPercentage: number;
}

interface VestingInfoPanelProps {
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundBlurhash?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  token?: {
    vesting_config?: VestingConfig;
    supply?: bigint | string | number | null;
    decimals?: number;
    symbol?: string;
    launch_timestamp?: string | null;
    created_at?: string;
  };
}

export function VestingInfoPanel({
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  backgroundBlurhash,
  overlayColor,
  overlayOpacity,
  token,
}: VestingInfoPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground
    ? {
        backgroundColor: `${backgroundColor || '#0c0c0e'}cc`,
      }
    : undefined;

  const vesting = token?.vesting_config;
  const [vestingHover, setVestingHover] = useState<HoverState | null>(null);
  const vestingChartRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();

  // Don't render if no vesting config or vesting is disabled
  if (!vesting || !vesting.enabled) {
    return null;
  }

  const formatDuration = (value: number, unit: string) => {
    const label = value === 1 ? unit.slice(0, -1) : unit;
    return `${value} ${label}`;
  };

  const formatSchedule = (schedule: string) => {
    switch (schedule) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'bi-weekly':
        return 'Bi-weekly';
      case 'monthly':
        return 'Monthly';
      default:
        return schedule;
    }
  };

  // Calculate vesting breakdown and token amounts per period
  const vestingBreakdown = useMemo(() => {
    const totalPercentage = vesting.vestingPercentage;
    const cliffUnlock = vesting.cliffEnabled ? vesting.cliffPercentage : 0;
    const remainingVesting = totalPercentage - (cliffUnlock * totalPercentage / 100);

    // Fixed 1B supply for all tokens
    const totalSupply = 1_000_000_000;

    // Calculate total locked tokens
    const totalLockedTokens = totalSupply * (totalPercentage / 100);

    // Calculate cliff unlock tokens
    const cliffUnlockTokens = vesting.cliffEnabled
      ? totalLockedTokens * (cliffUnlock / 100)
      : 0;

    // Calculate linear vesting tokens
    const linearVestingTokens = totalLockedTokens - cliffUnlockTokens;

    // Calculate number of vesting periods and tokens per period
    const vestingDurationDays = convertToDays(vesting.vestingDuration, vesting.vestingDurationUnit);
    const periodDays = getSchedulePeriodDays(vesting.unlockSchedule);
    const numberOfPeriods = Math.ceil(vestingDurationDays / periodDays);
    const tokensPerPeriod = numberOfPeriods > 0 ? linearVestingTokens / numberOfPeriods : 0;

    return {
      totalLocked: totalPercentage,
      cliffUnlock: vesting.cliffEnabled ? cliffUnlock : 0,
      linearVesting: remainingVesting,
      totalLockedTokens,
      cliffUnlockTokens,
      linearVestingTokens,
      numberOfPeriods,
      tokensPerPeriod,
    };
  }, [vesting]);

  // Helper to convert duration to days
  function convertToDays(value: number, unit: 'days' | 'weeks' | 'months'): number {
    switch (unit) {
      case 'days': return value;
      case 'weeks': return value * 7;
      case 'months': return value * 30;
      default: return value;
    }
  }

  // Helper to get period days from schedule
  function getSchedulePeriodDays(schedule: 'daily' | 'weekly' | 'bi-weekly' | 'monthly'): number {
    switch (schedule) {
      case 'daily': return 1;
      case 'weekly': return 7;
      case 'bi-weekly': return 14;
      case 'monthly': return 30;
      default: return 1;
    }
  }

  // Helper to format vesting dates based on launch date
  function formatVestingDate(launchDateStr: string | null | undefined, daysOffset: number): string {
    const launchDate = launchDateStr ? new Date(launchDateStr) : new Date();
    const targetDate = new Date(launchDate);
    targetDate.setDate(targetDate.getDate() + daysOffset);
    return targetDate.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <div className="overflow-hidden relative rounded-2xl p-3 sm:p-5">
      <OptimizedBackground
        src={backgroundImage}
        blurhash={backgroundBlurhash}
        backgroundColor={backgroundImage ? 'transparent' : (backgroundColor || '#0a0a0c')}
        backgroundSize={backgroundSize || 'cover'}
        backgroundPosition={backgroundSize === 'repeat' ? 'top left' : bgPos.position}
        overlayColor={overlayColor}
        overlayOpacity={overlayOpacity}
        lazy={true}
      />

      <div style={{ position: 'relative', zIndex: 2 }}>
        <h3
          className={`text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2 ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-1 rounded w-fit' : ''}`}
          style={{ ...textBgStyle, color: textColor || '#ffffff' }}
        >
          <Lock className="w-4 h-4" />
          Token Vesting
        </h3>

        <div
          className={`space-y-3 ${hasCustomBackground ? 'backdrop-blur-sm p-2 sm:p-3 rounded-lg' : ''}`}
          style={textBgStyle}
        >
          {/* Vesting Summary */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1">
              <p
                className="text-xs text-muted-foreground"
                style={{ color: textColor ? `${textColor}99` : undefined }}
              >
                Total Locked
              </p>
              <p
                className="text-lg sm:text-xl font-semibold"
                style={{ color: textColor || '#ffffff' }}
              >
                {vesting.vestingPercentage}%
              </p>
            </div>

            <div className="space-y-1">
              <p
                className="text-xs text-muted-foreground"
                style={{ color: textColor ? `${textColor}99` : undefined }}
              >
                Vesting Duration
              </p>
              <p
                className="text-lg sm:text-xl font-semibold"
                style={{ color: textColor || '#ffffff' }}
              >
                {formatDuration(vesting.vestingDuration, vesting.vestingDurationUnit)}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="pt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span
                className="text-muted-foreground flex items-center gap-1.5"
                style={{ color: textColor ? `${textColor}99` : undefined }}
              >
                <Clock className="w-3.5 h-3.5" />
                Unlock Schedule
              </span>
              <span style={{ color: textColor || '#ffffff' }}>
                {formatSchedule(vesting.unlockSchedule)}
              </span>
            </div>

            {vesting.cliffEnabled && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span
                    className="text-muted-foreground"
                    style={{ color: textColor ? `${textColor}99` : undefined }}
                  >
                    Cliff Period
                  </span>
                  <span style={{ color: textColor || '#ffffff' }}>
                    {formatDuration(vesting.cliffDuration, vesting.cliffDurationUnit)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span
                    className="text-muted-foreground"
                    style={{ color: textColor ? `${textColor}99` : undefined }}
                  >
                    Cliff Unlock
                  </span>
                  <span style={{ color: textColor || '#ffffff' }}>
                    {vesting.cliffPercentage}%
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Vesting Schedule Chart */}
          <div className="pt-3">
            <div className="relative h-32 sm:h-40 bg-zinc-900/50 rounded-lg p-3">
              {/* Y-axis labels */}
              <div className="absolute left-2 top-3 bottom-8 flex flex-col justify-between text-xs text-muted-foreground">
                <span style={{ color: textColor ? `${textColor}99` : undefined }}>100%</span>
                <span style={{ color: textColor ? `${textColor}99` : undefined }}>50%</span>
                <span style={{ color: textColor ? `${textColor}99` : undefined }}>0%</span>
              </div>
              {/* Graph area */}
              <div
                ref={vestingChartRef}
                className="ml-10 h-full pb-6 relative cursor-crosshair"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const chartHeight = rect.height - 24; // subtract pb-6
                  const xRatio = Math.max(0, Math.min(1, x / rect.width));

                  // Calculate vesting parameters
                  const durationInDays = convertToDays(vesting.vestingDuration, vesting.vestingDurationUnit);
                  const periodInDays = getSchedulePeriodDays(vesting.unlockSchedule);
                  const totalPeriods = Math.max(1, Math.ceil(durationInDays / periodInDays));

                  const cliffDurationInDays = vesting.cliffEnabled
                    ? convertToDays(vesting.cliffDuration, vesting.cliffDurationUnit)
                    : 0;
                  const cliffRatio = cliffDurationInDays / durationInDays;
                  const cliffUnlock = vesting.cliffEnabled ? vesting.cliffPercentage : 0;
                  const currentDayInVesting = xRatio * durationInDays;

                  // Calculate which step we're on and snap to it
                  let unlockedPercent = 0;
                  let snappedXRatio = 0;

                  if (currentDayInVesting < cliffDurationInDays) {
                    // Before cliff - snap to start
                    unlockedPercent = 0;
                    snappedXRatio = 0;
                  } else if (vesting.cliffEnabled && currentDayInVesting < cliffDurationInDays + 0.01 * durationInDays) {
                    // At cliff
                    unlockedPercent = cliffUnlock;
                    snappedXRatio = cliffRatio;
                  } else {
                    // After cliff - calculate step
                    const remainingUnlock = 100 - cliffUnlock;
                    const remainingDays = durationInDays - cliffDurationInDays;
                    const stepsAfterCliff = Math.max(1, Math.ceil(totalPeriods * (1 - cliffRatio)));
                    const effectiveDay = currentDayInVesting - cliffDurationInDays;
                    const stepDuration = remainingDays / stepsAfterCliff;
                    const currentStep = Math.min(stepsAfterCliff, Math.floor(effectiveDay / stepDuration) + 1);

                    unlockedPercent = cliffUnlock + (currentStep / stepsAfterCliff) * remainingUnlock;
                    snappedXRatio = cliffRatio + (currentStep / stepsAfterCliff) * (1 - cliffRatio);
                  }

                  // Calculate snapped positions in pixels
                  const snappedX = snappedXRatio * rect.width;
                  const snappedY = (1 - unlockedPercent / 100) * chartHeight;

                  // Calculate time string for the snapped position
                  const snappedDays = snappedXRatio * durationInDays;
                  const timeStr = snappedDays === 0
                    ? 'Launch'
                    : formatVestingDate(token?.launch_timestamp || token?.created_at, snappedDays);

                  // Calculate tokens unlocked at this point
                  const totalLockedTokens = 1_000_000_000 * (vesting.vestingPercentage / 100);
                  const tokensUnlocked = totalLockedTokens * (unlockedPercent / 100);

                  setVestingHover({ x, y, snappedX, snappedY, time: timeStr, percent: Math.round(unlockedPercent), tokens: tokensUnlocked });
                }}
                onMouseLeave={() => setVestingHover(null)}
              >
                <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="25" x2="300" y2="25" stroke="#52525b" strokeOpacity="0.3" />
                  <line x1="0" y1="50" x2="300" y2="50" stroke="#52525b" strokeOpacity="0.3" />
                  <line x1="0" y1="75" x2="300" y2="75" stroke="#52525b" strokeOpacity="0.3" />

                  {/* Stepped vesting curve */}
                  {(() => {
                    const graphWidth = 300;
                    const vestingDurationDays = convertToDays(vesting.vestingDuration, vesting.vestingDurationUnit);
                    const periodDays = getSchedulePeriodDays(vesting.unlockSchedule);
                    const periods = Math.max(1, Math.ceil(vestingDurationDays / periodDays));

                    // Calculate cliff position
                    const cliffDurationDays = vesting.cliffEnabled
                      ? convertToDays(vesting.cliffDuration, vesting.cliffDurationUnit)
                      : 0;
                    const cliffRatio = cliffDurationDays / vestingDurationDays;
                    const cliffX = cliffRatio * graphWidth;
                    const cliffUnlock = vesting.cliffEnabled ? vesting.cliffPercentage : 0;

                    // Build stepped path
                    let path = 'M 0 100'; // Start at bottom left (0% unlocked)

                    if (vesting.cliffEnabled && cliffX > 0) {
                      // Flat line until cliff
                      path += ` L ${cliffX} 100`;
                      // Jump up at cliff
                      if (cliffUnlock > 0) {
                        path += ` L ${cliffX} ${100 - cliffUnlock}`;
                      }
                    }

                    // Calculate remaining unlock after cliff
                    const remainingUnlock = 100 - cliffUnlock;
                    const startX = vesting.cliffEnabled ? cliffX : 0;
                    const startY = 100 - cliffUnlock;
                    const remainingWidth = graphWidth - startX;

                    // Create steps for remaining vesting
                    const stepsAfterCliff = Math.max(1, Math.ceil(periods * (1 - cliffRatio)));
                    const stepWidth = remainingWidth / stepsAfterCliff;
                    const stepHeight = remainingUnlock / stepsAfterCliff;

                    for (let i = 0; i < stepsAfterCliff; i++) {
                      const x2 = startX + ((i + 1) * stepWidth);
                      const y = startY - ((i + 1) * stepHeight);
                      // Horizontal line to next step
                      path += ` L ${x2} ${startY - (i * stepHeight)}`;
                      // Vertical jump up
                      path += ` L ${x2} ${y}`;
                    }

                    return (
                      <>
                        {/* Filled area under curve */}
                        <path
                          d={`${path} L ${graphWidth} 100 Z`}
                          fill={`url(#${gradientId})`}
                        />
                        {/* Line */}
                        <path
                          d={path}
                          fill="none"
                          stroke="#f97316"
                          strokeWidth="3"
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    );
                  })()}

                  {/* Gradient definition */}
                  <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#f97316" stopOpacity="0.7" />
                      <stop offset="100%" stopColor="#f97316" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Cliff marker with lock icon and tooltip */}
                {vesting.cliffEnabled && (() => {
                  const durationInDays = convertToDays(vesting.vestingDuration, vesting.vestingDurationUnit);
                  const cliffDurationInDays = convertToDays(vesting.cliffDuration, vesting.cliffDurationUnit);
                  const cliffRatio = cliffDurationInDays / durationInDays;
                  const cliffUnlock = vesting.cliffPercentage;
                  const chartHeight = vestingChartRef.current ? vestingChartRef.current.offsetHeight - 24 : 100;

                  if (cliffRatio <= 0 || cliffRatio > 1) return null;

                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute bg-orange-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-help"
                            style={{
                              left: `calc(${cliffRatio * 100}% - 8px)`,
                              top: (1 - cliffUnlock / 100) * chartHeight - 8,
                              width: 16,
                              height: 16
                            }}
                          >
                            <Lock className="w-2.5 h-2.5 text-white" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>Cliff: {vesting.cliffPercentage}% unlocks after {vesting.cliffDuration} {vesting.cliffDurationUnit}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}

                {/* Hover tooltip */}
                {vestingHover && (
                  <>
                    {/* Vertical line at snapped position */}
                    <div
                      className="absolute top-0 w-px bg-orange-500/50 pointer-events-none"
                      style={{ left: vestingHover.snappedX, height: 'calc(100% - 24px)' }}
                    />
                    {/* Horizontal line at snapped position */}
                    <div
                      className="absolute left-0 h-px bg-orange-500/50 pointer-events-none"
                      style={{ top: vestingHover.snappedY, width: vestingHover.snappedX }}
                    />
                    {/* Dot marker at snapped position */}
                    <div
                      className="absolute bg-orange-500 rounded-full border-2 border-white pointer-events-none shadow-lg"
                      style={{
                        left: vestingHover.snappedX - 6,
                        top: vestingHover.snappedY - 6,
                        width: 12,
                        height: 12
                      }}
                    />
                    {/* Tooltip - matching shadcn/ui TooltipContent style */}
                    <div
                      className="absolute z-50 overflow-hidden rounded-md border border-border/50 bg-[#111114] px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 pointer-events-none"
                      style={{
                        left: vestingHover.snappedX > 100 ? vestingHover.snappedX - 130 : vestingHover.snappedX + 15,
                        top: Math.max(0, vestingHover.snappedY - 30)
                      }}
                    >
                      <p>{vestingHover.time} · {vestingHover.percent}% · {formatReadableNumber(vestingHover.tokens, { compact: true })}</p>
                    </div>
                  </>
                )}

                {/* X-axis labels with dates */}
                <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-muted-foreground">
                  <span style={{ color: textColor ? `${textColor}99` : undefined }}>
                    {formatVestingDate(token?.launch_timestamp || token?.created_at, 0)}
                  </span>
                  {vesting.cliffEnabled && (
                    <span className="text-orange-500 font-medium flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      {formatVestingDate(
                        token?.launch_timestamp || token?.created_at,
                        convertToDays(vesting.cliffDuration, vesting.cliffDurationUnit)
                      )}
                    </span>
                  )}
                  <span style={{ color: textColor ? `${textColor}99` : undefined }}>
                    {formatVestingDate(
                      token?.launch_timestamp || token?.created_at,
                      convertToDays(vesting.vestingDuration, vesting.vestingDurationUnit)
                    )}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center" style={{ color: textColor ? `${textColor}99` : undefined }}>
              {vesting.vestingPercentage}% of tokens vesting {vesting.unlockSchedule.replace('-', ' ')} over {vesting.vestingDuration} {vesting.vestingDurationUnit}
              {vesting.cliffEnabled && ` with ${vesting.cliffDuration} ${vesting.cliffDurationUnit} cliff`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
