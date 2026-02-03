import { useTokenInfo, useTokenAddress } from '@/hooks/queries';
import { formatReadablePercentChange } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

type BondingCurveProps = {
  className?: string;
};

// Hook to fetch migration status from our Supabase API
// This is the source of truth for is_migrated (Jupiter doesn't have this field)
function useMigrationStatus() {
  const tokenAddress = useTokenAddress();

  return useQuery({
    queryKey: ['token-migration-status', tokenAddress],
    queryFn: async () => {
      const response = await fetch(`/api/tokens/${tokenAddress}`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        is_migrated: data.is_migrated ?? false,
        bonding_curve_progress: data.bonding_curve_progress,
      };
    },
    enabled: !!tokenAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes - migration status rarely changes
    refetchOnWindowFocus: false,
  });
}

export const BondingCurve: React.FC<BondingCurveProps> = ({ className }) => {
  // Prefer bonding_curve_progress (from Ably updates) over bondingCurve (from Jupiter API)
  const { data: bondingCurveProgress } = useTokenInfo((data) => (data as any)?.bonding_curve_progress);
  const { data: bondingCurveApi } = useTokenInfo((data) => data?.bondingCurve);
  const { data: isMigratedFromJupiter } = useTokenInfo((data) => (data as any)?.is_migrated);
  const { data: graduatedPool } = useTokenInfo((data) => data?.baseAsset?.graduatedPool);

  // Also fetch from our Supabase API as the source of truth for migration status
  const { data: migrationStatus } = useMigrationStatus();

  const bondingCurve = bondingCurveProgress ?? migrationStatus?.bonding_curve_progress ?? bondingCurveApi;
  // Token is graduated if it's migrated (from Supabase or Jupiter/Ably) OR has a graduated pool
  const isGraduated = migrationStatus?.is_migrated || isMigratedFromJupiter || !!graduatedPool;

  if (bondingCurve === undefined && !isGraduated) {
    return null;
  }

  // Show full gold bar when graduated, otherwise show progress
  const displayProgress = isGraduated ? 100 : Math.min(100, bondingCurve ?? 0);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {isGraduated && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-amber-400 font-medium">Graduated</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        Bonding Curve:
        {!isGraduated && bondingCurve !== undefined && (
          <span>{formatReadablePercentChange(bondingCurve / 100, { hideSign: 'positive' })}</span>
        )}
        {isGraduated && <span className="text-amber-400">100%</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-850">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${displayProgress}%`,
            backgroundColor: isGraduated ? '#FFD700' : undefined
          }}
          {...(!isGraduated && { className: 'bg-primary' })}
        />
      </div>
    </div>
  );
};

export const MobileBondingCurve: React.FC<BondingCurveProps> = ({ className }) => {
  // Prefer bonding_curve_progress (from Ably updates) over bondingCurve (from Jupiter API)
  const { data: bondingCurveProgress } = useTokenInfo((data) => (data as any)?.bonding_curve_progress);
  const { data: bondingCurveApi } = useTokenInfo((data) => data?.bondingCurve);
  const { data: isMigratedFromJupiter } = useTokenInfo((data) => (data as any)?.is_migrated);
  const { data: graduatedPool } = useTokenInfo((data) => data?.baseAsset?.graduatedPool);

  // Also fetch from our Supabase API as the source of truth for migration status
  const { data: migrationStatus } = useMigrationStatus();

  const bondingCurve = bondingCurveProgress ?? migrationStatus?.bonding_curve_progress ?? bondingCurveApi;
  // Token is graduated if it's migrated (from Supabase or Jupiter/Ably) OR has a graduated pool
  const isGraduated = migrationStatus?.is_migrated || isMigratedFromJupiter || !!graduatedPool;

  if (bondingCurve === undefined && !isGraduated) {
    return null;
  }

  // Show full gold bar when graduated, otherwise show progress
  const displayProgress = isGraduated ? 100 : Math.min(100, bondingCurve ?? 0);

  return (
    <div className={cn('flex flex-col gap-1 pt-2', className)}>
      {isGraduated && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-amber-400 font-medium">Graduated</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        Bonding Curve:
        {!isGraduated && bondingCurve !== undefined && (
          <span>{formatReadablePercentChange(bondingCurve / 100, { hideSign: 'positive' })}</span>
        )}
        {isGraduated && <span className="text-amber-400">100%</span>}
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-850">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${displayProgress}%`,
            backgroundColor: isGraduated ? '#FFD700' : undefined
          }}
          {...(!isGraduated && { className: 'bg-primary' })}
        />
      </div>
    </div>
  );
};
