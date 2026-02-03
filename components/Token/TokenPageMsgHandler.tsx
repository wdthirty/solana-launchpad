import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { ApeQueries, QueryData } from '@/components/Explore/queries';
import { useDataStreamListener } from '@/contexts/DataStreamProvider';
import { patchStreamPool } from '../Explore/pool-utils';

/**
 * TokenPageMsgHandler
 *
 * Handles Jupiter DataStream updates for the token page.
 * Note: Ably token updates are handled in TokenPageContent to avoid duplicate subscriptions.
 */
export const TokenPageMsgHandler: React.FC = () => {
  const queryClient = useQueryClient();

  // Handle Jupiter DataStream updates for pools (price, volume, etc. from Jupiter)
  useDataStreamListener(
    ['updates'],
    useCallback(
      (get, set, msg) => {
        for (const m of msg.data) {
          queryClient.setQueriesData(
            {
              type: 'active',
              queryKey: ApeQueries.tokenInfo({ id: m.pool.baseAsset.id }).queryKey,
              exact: true,
            },
            (prev?: QueryData<typeof ApeQueries.tokenInfo>) => {
              if (!prev) {
                return;
              }
              return patchStreamPool(m.pool, prev);
            }
          );
        }
      },
      [queryClient]
    )
  );

  return null;
};
