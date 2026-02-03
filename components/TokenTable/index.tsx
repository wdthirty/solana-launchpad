import { useInfiniteQuery } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { memo } from 'react';

import { BottomPanelTab, bottomPanelTabAtom } from './config';
import { useTokenInfo } from '@/hooks/queries';
import { ReadableNumber } from '../ui/ReadableNumber';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import { cn } from '@/lib/utils';
import { TxnsTab } from './TxnsTab';
import { HoldersTab } from './HoldersTab';

type TokenBottomPanelProps = {
  className?: string;
  hideHolders?: boolean; // New prop to hide holders tab
  textBackgroundColor?: string; // Background color for text overlay on custom backgrounds
  tableClassName?: string; // Additional class for the table container
};

export const TokenBottomPanel: React.FC<TokenBottomPanelProps> = memo(({ className, hideHolders = false, textBackgroundColor, tableClassName }) => {
  const [tab, setTab] = useAtom(bottomPanelTabAtom);

  // If hideHolders is true, always show transactions tab
  const effectiveTab = hideHolders ? BottomPanelTab.TXNS : tab;

  return (
    <Tabs
      className={cn('overflow-hidden', className)}
      value={effectiveTab}
      onValueChange={(value) => !hideHolders && setTab(value as BottomPanelTab)}
    >
      {!hideHolders && (
        <div className="flex items-center justify-between border-b border-neutral-850 pr-2">
          <TabsList className="scrollbar-none flex h-10 w-full items-center text-sm">
            <TabsTrigger value={BottomPanelTab.TXNS}>
              <span className="sm:hidden">{`Txns`}</span>
              <span className="max-sm:hidden">{`Transactions`}</span>
            </TabsTrigger>

            <TabsTrigger value={BottomPanelTab.HOLDERS}>
              <span>{`Holders`}</span>
            </TabsTrigger>
          </TabsList>
        </div>
      )}

      <TabsContent className="contents" value={BottomPanelTab.TXNS}>
        <TxnsTab textBackgroundColor={textBackgroundColor} className={tableClassName} />
      </TabsContent>

      {!hideHolders && (
        <TabsContent className="contents" value={BottomPanelTab.HOLDERS}>
          <HoldersTab />
        </TabsContent>
      )}
    </Tabs>
  );
});

TokenBottomPanel.displayName = 'TokenBottomPanel';
