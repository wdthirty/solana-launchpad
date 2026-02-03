import { ColumnDef } from '@tanstack/react-table';
import { Tx } from '../../Explore/types';
import { formatAge } from '@/lib/format/date';
import { TableCell } from '../../Table';
import { TableRow } from '../../Table';
import Image from 'next/image';
import { Clock } from 'lucide-react';
import Link from 'next/link';
import { ExternalLink } from '../../ui/ExternalLink';

/**
 * Generate a deterministic color from a wallet address.
 * Uses a simple hash to create a consistent HSL color for each unique address.
 */
function getAddressColor(address: string): string {
  // Simple hash function for the address
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    const char = address.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Generate HSL color with good saturation and lightness for visibility
  const hue = Math.abs(hash) % 360;
  const saturation = 65 + (Math.abs(hash >> 8) % 20); // 65-85%
  const lightness = 55 + (Math.abs(hash >> 16) % 15); // 55-70%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export const columns: ColumnDef<Tx>[] = [
  {
    accessorKey: 'traderAddress',
    header: () => <div className="text-left typo-caption text-muted-foreground pl-1">Account</div>,
    cell: ({ row, table }) => {
      const tx = row.original;
      const traderProfiles = table.options.meta?.traderProfiles || {};
      const profile = traderProfiles[tx.traderAddress];

      // Use username if available, otherwise show shortened address
      const displayName = profile?.username || tx.traderAddress.slice(0, 5);
      const avatarUrl = profile?.avatar || 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora';
      const addressColor = getAddressColor(tx.traderAddress);

      return (
        <Link
          href={`/profile/${tx.traderAddress}`}
          className="flex items-center gap-1.5 py-2 pl-1 hover:opacity-80 transition-opacity"
        >
          <Image
            src={avatarUrl}
            alt="Avatar"
            width={20}
            height={20}
            className="rounded-full max-sm:w-4 max-sm:h-4 object-cover"
            unoptimized
          />
          <div className="typo-caption hover:underline" style={{ color: addressColor }}>
            {displayName}
          </div>
        </Link>
      );
    },
  },
  {
    accessorKey: 'type',
    header: () => <div className="text-left typo-caption text-muted-foreground">Type</div>,
    cell: ({ row }) => {
      const tx = row.original;
      const isBuy = tx.type === 'buy';
      return (
        <div
          className="typo-caption capitalize py-2"
          style={{
            color: isBuy ? '#34C759' : '#FF6B6B', // Green for buy, red for sell
          }}
        >
          {tx.type}
        </div>
      );
    },
  },
  {
    accessorKey: 'nativeVolume',
    header: () => <div className="text-left typo-caption text-muted-foreground"><span className="max-sm:hidden">Amount (</span>SOL<span className="max-sm:hidden">)</span></div>,
    cell: ({ row }) => {
      const tx = row.original;
      // Show <0.01 for very small amounts
      const solAmount = tx.nativeVolume < 0.01
        ? '<0.01'
        : new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(tx.nativeVolume);

      return (
        <div className="text-foreground typo-caption py-2">
          {solAmount}
        </div>
      );
    },
  },
  {
    accessorKey: 'amount',
    header: ({ table }) => {
      const symbol = table.options.meta?.symbol || 'TOKEN';
      return <div className="text-left typo-caption text-muted-foreground max-sm:hidden">Amount ({symbol})</div>;
    },
    cell: ({ row }) => {
      const tx = row.original;
      const isBuy = tx.type === 'buy';
      // Format token amount in compact notation (e.g., 2.45m)
      const tokenAmount = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(tx.amount);

      return (
        <div
          className="typo-caption py-2 max-sm:hidden"
          style={{
            color: isBuy ? '#34C759' : '#FF6B6B', // Green for buy, red for sell
          }}
        >
          {tokenAmount}
        </div>
      );
    },
  },
  {
    accessorKey: 'timestamp',
    header: () => (
      <div className="flex items-center gap-1 text-left typo-caption text-muted-foreground">
        <Clock size={12} />
      </div>
    ),
    cell: ({ row }) => {
      const tx = row.original;
      const timeAgo = formatAge(new Date(tx.timestamp), new Date());
      const timeAgoText = timeAgo ? `${timeAgo}` : '';

      return (
        <div className="text-muted-foreground typo-caption py-2">
          {timeAgoText}
        </div>
      );
    },
  },
  {
    accessorKey: 'txHash',
    header: () => <div className="text-right typo-caption text-muted-foreground pr-1">Txn</div>,
    cell: ({ row }) => {
      const tx = row.original;
      const txHashShort = tx.txHash.slice(0, 5);

      return (
        <ExternalLink
          href={`https://solscan.io/tx/${tx.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-right text-muted-foreground typo-caption py-2 pr-1 hover:underline transition-opacity block"
        >
          {txHashShort}
        </ExternalLink>
      );
    },
  },
];

const SKELETON_COUNT = 5;

export const SkeletonTableRows: React.FC = () => {
  return (
    <>
      {new Array(SKELETON_COUNT).fill(0).map((_, i) => (
        <SkeletonTableRow key={i} index={i} />
      ))}
    </>
  );
};

const SkeletonTableRow: React.FC<{ index: number }> = ({ index }) => {
  const opacity = Math.max(0, 1 - index / SKELETON_COUNT);
  return (
    <TableRow
      style={{
        opacity,
      }}
    >
      <TableCell>
        <div className="flex items-center gap-1.5 pl-1">
          <div className="h-5 w-5 max-sm:h-4 max-sm:w-4 rounded-full bg-muted animate-pulse" />
          <div className="h-4 w-8 rounded bg-muted animate-pulse" />
        </div>
      </TableCell>
      <TableCell>
        <div className="h-4 w-8 rounded bg-muted animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-10 rounded bg-muted animate-pulse" />
      </TableCell>
      <TableCell className="max-sm:hidden">
        <div className="h-4 w-10 rounded bg-muted animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-8 rounded bg-muted animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-8 rounded bg-muted animate-pulse ml-auto mr-1" />
      </TableCell>
    </TableRow>
  );
};
