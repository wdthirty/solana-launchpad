import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trade Tokens',
  description: 'Trade meme tokens on Solana. Discover trending projects, track prices, and trade with low fees on the curated launchpad.',
  openGraph: {
    title: 'Trade Tokens',
    description: 'Trade meme tokens on Solana. Discover trending projects, track prices, and trade with low fees on the curated launchpad.',
    url: 'https://launchpad.fun/tokens',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trade Tokens',
    description: 'Trade meme tokens on Solana. Discover trending projects, track prices, and trade with low fees on the curated launchpad.',
  },
  alternates: {
    canonical: 'https://launchpad.fun/tokens',
  },
};

export default function TokensLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
