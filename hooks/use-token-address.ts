import { useParams } from 'next/navigation';

/**
 * Hook to get the current token address from the URL params
 * Used on token pages where the address is in the route: /token/[address]
 */
export function useTokenAddress(): string | undefined {
  const params = useParams();
  const address = params?.address;

  // Handle both string and string[] cases (Next.js can return either)
  if (typeof address === 'string') {
    return address;
  }

  if (Array.isArray(address) && address.length > 0) {
    return address[0];
  }

  return undefined;
}
