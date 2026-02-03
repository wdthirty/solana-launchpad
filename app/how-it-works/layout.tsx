import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'Learn how the curated Solana launchpad works. Apply for whitelist, get approved, and launch your meme token with built-in liquidity.',
  openGraph: {
    title: 'How It Works',
    description: 'Learn how the curated Solana launchpad works. Apply for whitelist, get approved, and launch your meme token with built-in liquidity.',
    url: 'https://launchpad.fun/how-it-works',
    images: [
      {
        url: 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora',
        width: 1200,
        height: 630,
        alt: 'Launchpad - How It Works',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How It Works',
    description: 'Learn how the curated Solana launchpad works. Apply for whitelist, get approved, and launch your meme token with built-in liquidity.',
    images: ['https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora'],
  },
  alternates: {
    canonical: 'https://launchpad.fun/how-it-works',
  },
};

export default function HowItWorksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
