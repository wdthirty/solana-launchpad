import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Check if a string looks like a Solana wallet address
function isWalletAddress(str: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(str);
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    let username = slug;

    if (isWalletAddress(slug)) {
      // Slug is a wallet address - look up the user
      const { data: user } = await supabase
        .from('users')
        .select('username')
        .eq('wallet_address', slug)
        .single();

      if (user?.username) {
        username = user.username;
      }
    } else {
      // Slug is already a username
      username = slug;
    }

    return {
      title: `${username} | Launchpad`,
      openGraph: {
        title: `${username} | Launchpad`,
      },
      twitter: {
        title: `${username} | Launchpad`,
      },
    };
  } catch {
    return {
      title: `${slug} | Launchpad`,
    };
  }
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
