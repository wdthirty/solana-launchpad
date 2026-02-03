import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Launch Token',
  description: 'Launch your token on the curated Solana launchpad. Create meme tokens with built-in liquidity and start trading in minutes.',
  openGraph: {
    title: 'Launch Token',
    description: 'Launch your token on the curated Solana launchpad. Create meme tokens with built-in liquidity and start trading in minutes.',
    url: 'https://launchpad.fun/create',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Launch Token',
    description: 'Launch your token on the curated Solana launchpad. Create meme tokens with built-in liquidity and start trading in minutes.',
  },
  alternates: {
    canonical: 'https://launchpad.fun/create',
  },
};

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
