'use client';

import { useParams } from 'next/navigation';

// Import shared component
import { TokenPageContent } from '@/components/Token/TokenPageContent';

// Import providers
import { DataStreamProvider } from '@/contexts/DataStreamProvider';
import { TokenChartProvider } from '@/contexts/TokenChartProvider';

export default function TokenPage() {
  const params = useParams();
  const address = params.address as string;

  return (
    <DataStreamProvider>
      <TokenChartProvider>
        <TokenPageContent address={address} />
      </TokenChartProvider>
    </DataStreamProvider>
  );
}
