import { ApeClient } from '@/components/Explore/client';
import {
  GetGemsTokenListRequest,
  GetTxsResponse,
  ResolvedTokenListFilters,
  TokenListFilters,
  TokenListSortBy,
  TokenListSortDir,
  TokenListTimeframe,
  resolveTokenListFilters,
} from './types';
import { ExtractQueryData } from '@/types/fancytypes';

export type QueryData<T> = T extends (...args: infer OptionsArgs) => {
  queryFn: (...args: infer Args) => Promise<infer R>;
}
  ? R
  : never;

export type GemsTokenListQueryArgs = {
  [list in keyof GetGemsTokenListRequest]: {
    timeframe: TokenListTimeframe;
    filters?: TokenListFilters;
  };
};

export type TokenInfoQueryData = ExtractQueryData<typeof ApeQueries.tokenInfo>;

// TODO: upgrade to `queryOptions` helper in react query v5
// TODO: move this to a centralised file close to the `useQuery` hooks these are called in

// We include args in the query fn return so know args when mutating queries
export const ApeQueries = {
  gemsTokenList: (args: GemsTokenListQueryArgs) => {
    const req = {
      recent: args.recent
        ? {
            timeframe: args.recent.timeframe,
            ...resolveTokenListFilters(args.recent.filters),
          }
        : undefined,
      graduated: args.graduated
        ? {
            timeframe: args.graduated.timeframe,
            ...resolveTokenListFilters(args.graduated.filters),
          }
        : undefined,
      aboutToGraduate: args.aboutToGraduate
        ? {
            timeframe: args.aboutToGraduate.timeframe,
            ...resolveTokenListFilters(args.aboutToGraduate.filters),
          }
        : undefined,
    };

    return {
      queryKey: ['explore', 'gems', args],
      queryFn: async () => {
        const res = await ApeClient.getGemsTokenList(req);
        return Object.assign(res, { args });
      },
    };
  },
  tokenInfo: (args: { id: string }) => {
    return {
      queryKey: ['explore', 'token', args.id, 'info'],
      queryFn: async () => {
        // Fetch token info and description in parallel for faster loading
        const [info, descriptionData] = await Promise.all([
          ApeClient.getToken({ id: args.id }),
          ApeClient.getTokenDescription(args.id).catch(() => null), // Don't fail if description fails
        ]);

        // If Jupiter API returns empty pools, fetch fallback from our database
        if (!info?.pools[0]) {
          // Try to get cached data from our Supabase tokens table
          const fallbackResponse = await fetch(`/api/tokens/${args.id}`);
          if (fallbackResponse.ok) {
            const fallbackToken = await fallbackResponse.json();
            if (fallbackToken?.baseAsset) {
              // Mark as inactive so UI can show appropriate message
              return {
                id: args.id,
                baseAsset: {
                  ...fallbackToken.baseAsset,
                  description: descriptionData?.description || fallbackToken.baseAsset.description,
                },
                isInactive: true, // Flag to indicate Jupiter returned no pools
                bondingCurveId: null as any,
              };
            }
          }
          throw new Error('No token info found');
        }
        const pool = info.pools[0];

        // Merge description if available
        if (descriptionData?.description) {
          pool.baseAsset = {
            ...pool.baseAsset,
            description: descriptionData.description,
          };
        }

        return {
          ...pool,
          isInactive: false, // Active token with Jupiter data
          bondingCurveId: null as any,
        };
      },
    };
  },
  tokenHolders: (args: { id: string }) => {
    return {
      queryKey: ['explore', 'token', args.id, 'holders'],
      queryFn: async () => {
        const res = await ApeClient.getTokenHolders(args.id);
        return Object.assign(res, { args });
      },
    };
  },
  tokenDescription: (args: { id: string }) => {
    return {
      queryKey: ['explore', 'token', args.id, 'description'],
      queryFn: async () => {
        const res = await ApeClient.getTokenDescription(args.id);
        return res;
      },
    };
  },
  tokenTxs: (args: { id: string }) => {
    return {
      queryKey: ['explore', 'token', args.id, 'txs'],
      queryFn: async ({ signal, pageParam }: any) => {
        const res = await ApeClient.getTokenTxs(
          args.id,
          pageParam
            ? {
                ...pageParam,
              }
            : {},
          { signal }
        );
        return Object.assign(res, {
          args,
        });
      },
      // This gets passed as `pageParam`
      getNextPageParam: (lastPage: GetTxsResponse) => {
        // TODO: update to use BE api response when its returned
        if (lastPage?.txs.length === 0) {
          return;
        }
        const lastTs = lastPage?.txs[lastPage?.txs.length - 1]?.timestamp;
        return {
          offset: lastPage?.next,
          offsetTs: lastTs,
        };
      },
    };
  },
};
