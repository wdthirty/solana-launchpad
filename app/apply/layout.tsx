import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get Whitelisted',
  description: 'Apply for whitelist access to launch tokens on the platform. We review every application to maintain our curated launchpad quality.',
  openGraph: {
    title: 'Get Whitelisted',
    description: 'Apply for whitelist access to launch tokens on the platform. We review every application to maintain our curated launchpad quality.',
    url: 'https://launchpad.fun/apply',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Get Whitelisted',
    description: 'Apply for whitelist access to launch tokens on the platform. We review every application to maintain our curated launchpad quality.',
  },
  alternates: {
    canonical: 'https://launchpad.fun/apply',
  },
};

export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
