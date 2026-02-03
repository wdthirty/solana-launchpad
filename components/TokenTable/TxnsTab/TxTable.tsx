'use client';

import {
  ColumnDef,
  ColumnFiltersState,
  RowData,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { notUndefined, useVirtualizer } from '@tanstack/react-virtual';
import { useAtom } from 'jotai';
import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DateMode, dateModeAtom } from './datemode';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../Table';
import { isHoverableDevice } from '@/lib/device';
import { SkeletonTableRows } from './columns';
import { Tx } from '../../Explore/types';
import { useTraderProfiles, TraderProfile } from '@/hooks/use-trader-profiles';

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    dateMode: DateMode;
    setDateMode: (mode: DateMode) => void;
    walletAddress: string | undefined;
    symbol: string | undefined;
    traderProfiles: Record<string, TraderProfile | null>;
  }
}

const ROW_HEIGHT = 56;

type TxTableProps<TData, TValue> = {
  symbol?: string | undefined;
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  hasNextPage: boolean | undefined;
  isFetching: boolean;
  fetchNextPage: () => void;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  textBackgroundColor?: string;
  className?: string;
};

export function TxTable<TData, TValue>({
  symbol,
  columns,
  data,
  hasNextPage,
  isFetching,
  fetchNextPage,
  paused,
  setPaused,
  textBackgroundColor,
  className,
}: TxTableProps<TData, TValue>) {
  // Helper for text background style (when custom backgrounds are used)
  const textBgStyle = textBackgroundColor ? {
    backgroundColor: `${textBackgroundColor}cc`,
  } : undefined;
  // const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [dateMode, setDateMode] = useAtom(dateModeAtom);
  const { publicKey } = useWallet();
  const walletAddress = useMemo(() => publicKey?.toBase58(), [publicKey]);

  // Extract unique trader addresses from data for profile lookup
  const traderAddresses = useMemo(() => {
    const txData = data as unknown as Tx[];
    return txData.map(tx => tx.traderAddress);
  }, [data]);

  // Fetch trader profiles for registered users
  const { data: traderProfiles = {} } = useTraderProfiles(traderAddresses);

  // Please refer to https://tanstack.com/table/latest/docs/faq#how-do-i-stop-infinite-rendering-loops
  // for rendering optimisations
  const table = useReactTable({
    // Data
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // // Sorting
    // onSortingChange: setSorting,
    // getSortedRowModel: getSortedRowModel(),
    // Filtering
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      // sorting,
      columnFilters,
    },
    meta: {
      dateMode,
      setDateMode,
      walletAddress,
      symbol,
      traderProfiles,
    },
  });

  const { rows } = table.getRowModel();
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    // Memoisation is REQUIRED to optimise rendering
    // @see https://tanstack.com/virtual/v3/docs/api/virtualizer#getitemkey
    getItemKey: useCallback((index: number) => rows[index]?.id ?? index, [rows]),
  });
  const items = virtualizer.getVirtualItems();
  const [before, after] =
    items.length > 0
      ? [
          notUndefined(items[0]).start - virtualizer.options.scrollMargin,
          virtualizer.getTotalSize() - notUndefined(items[items.length - 1]).end,
        ]
      : [0, 0];

  const tableRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  
  // Update ref when isFetching changes
  useEffect(() => {
    isFetchingRef.current = isFetching;
  }, [isFetching]);

  const onScroll = useCallback(() => {
    const tableEl = tableRef.current;
    if (!tableEl?.parentElement) {
      return;
    }
    
    // Throttle scroll events to prevent excessive calls
    const now = Date.now();
    if (now - lastScrollTimeRef.current < 100) {
      return;
    }
    lastScrollTimeRef.current = now;
    
    // Prevent multiple simultaneous fetches
    if (isFetchingRef.current) {
      return;
    }
    
    const { scrollHeight, scrollTop, clientHeight } = tableEl.parentElement;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    // Only fetch when within 5 row heights of bottom
    if (distanceFromBottom > 5 * ROW_HEIGHT) {
      return;
    }
    
    // Don't fetch if no more pages
    if (!hasNextPage) {
      return;
    }
    
    // Set flag and fetch
    isFetchingRef.current = true;
    fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  useEffect(() => {
    const tableEl = tableRef.current;
    tableEl?.parentElement?.addEventListener('scroll', onScroll, {
      passive: true,
    });
    return () => {
      tableEl?.parentElement?.removeEventListener('scroll', onScroll);
    };
  }, [onScroll]);

  return (
    <div ref={parentRef} className={`flex-1 overflow-y-auto ${className || ''}`}>
      <div
        ref={tableRef}
        className="relative -mt-px w-full"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        <Table className="text-xs">
          <TableHeader
            className={`sticky -top-px z-10 border-b border-border/50 sm:rounded-t-lg overflow-hidden ${textBgStyle ? 'backdrop-blur-sm' : 'bg-muted'}`}
            style={textBgStyle}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} isSticky>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{ width: header.getSize() }}
                    >
                      {!header.isPlaceholder ? (
                        flexRender(header.column.columnDef.header, header.getContext())
                      ) : null}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            className="w-full"
            onMouseEnter={() => {
              // Disable when first fetching
              if (data.length === 0 && isFetching) {
                return;
              }
              // iOS triggers, but we don't want to show the hover
              if (!isHoverableDevice()) {
                return;
              }
              setPaused(true);
            }}
            onMouseLeave={() => setPaused(false)}
          >
            {before > 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ height: before }} />
              </tr>
            ) : null}

            {items.length > 0 ? (
              <>
                {items.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) {
                    return null;
                  }
                  const tx = row.original as Tx;
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className={`border-b border-border/50 ${textBgStyle ? 'backdrop-blur-sm' : ''}`}
                      style={{
                        height: `${virtualRow.size}px`,
                        ...textBgStyle,
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}

                {/* Next page loading indicator - only show if there are items and we're fetching */}
                {isFetching && items.length > 0 && hasNextPage ? (
                  <MessageRow colSpan={columns.length}>
                    <div className="flex items-center justify-center py-2">
                      <div className="text-muted-foreground typo-caption">Loading txs...</div>
                    </div>
                  </MessageRow>
                ) : null}
              </>
            ) : isFetching ? (
              <>
                {/* First page loading indicator */}
                <SkeletonTableRows />
              </>
            ) : hasNextPage === false ? (
              <>
                {/* No more txs  */}
                <MessageRow colSpan={columns.length}>No more txs</MessageRow>
              </>
            ) : null}

            {after > 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ height: after }} />
              </tr>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type MessageRowProps = {
  colSpan: number;
};
const MessageRow: React.FC<PropsWithChildren<MessageRowProps>> = ({ colSpan, children }) => {
  return (
    <tr>
      <td className="table-cell text-muted-foreground typo-caption" colSpan={colSpan} style={{ height: ROW_HEIGHT }}>
        {children}
      </td>
    </tr>
  );
};

