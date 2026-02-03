import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SupabaseWalletContextProvider } from '@/components/SupabaseWalletProvider';
import { QueryProvider } from '@/components/QueryProvider';
import { CurrentDateTicker } from '@/components/CurrentDateTicker';
import { SolPriceProvider } from '@/contexts/SolPriceContext';
import { BrowserExtensionCleanup } from '@/components/BrowserExtensionCleanup';
import { LayoutWrapper } from '@/components/layout/LayoutWrapper';
import { Toaster } from '@/components/ui/sonner';
import { NavigationProgressProvider } from '@/contexts/NavigationProgressContext';
import { NavigationProgress } from '@/components/NavigationProgress';
import { CurrentTokenProvider } from '@/contexts/CurrentTokenContext';
import { Analytics } from '@vercel/analytics/react';
import { MobileDebugConsole } from '@/components/MobileDebugConsole';
import { IntercomProvider } from '@/components/IntercomProvider';

const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  variable: "--font-poppins",
  subsets: ["latin"],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL("https://launchpad.fun"),
  title: {
    default: "Launchpad | Curated Launchpad on Solana",
    template: "%s | Launchpad",
  },
  description: "The curated launchpad on Solana. Launch vetted meme tokens and discover trending projects. Quality over quantity.",
  keywords: [
    "solana launchpad",
    "curated launchpad",
    "meme tokens",
    "crypto launchpad",
    "memecoin",
    "token launch",
    "solana tokens",
    "fair launch",
    "launchpad",
    "launchpad.fun",
  ],
  authors: [{ name: "Your Company Name" }],
  creator: "Your Company Name",
  publisher: "Your Company Name",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "any" },
      { url: "/icon.png?v=2", type: "image/png" },
    ],
    apple: "/apple-icon.png?v=2",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Launchpad | Curated Launchpad on Solana",
    description: "The curated launchpad on Solana. Launch vetted meme tokens and discover trending projects.",
    url: "https://launchpad.fun",
    images: [
      {
        url: "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora",
        width: 1200,
        height: 630,
        alt: "Launchpad - Curated Launchpad on Solana",
      },
    ],
    siteName: "Launchpad",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Launchpad | Curated Launchpad on Solana",
    description: "The curated launchpad on Solana. Launch vetted meme tokens and discover trending projects.",
    images: ["https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"],
    creator: "@launchpadfun",
    site: "@launchpadfun",
  },
  alternates: {
    canonical: "https://launchpad.fun",
  },
  category: "cryptocurrency",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Preconnect to CDN domains for faster image loading */}
        <link rel="preconnect" href="https://cdn.launchpad.fun" />
        <link rel="dns-prefetch" href="https://cdn.launchpad.fun" />
        <link rel="preconnect" href="https://wsrv.nl" />
        <link rel="dns-prefetch" href="https://wsrv.nl" />
        <link
          rel="preconnect"
          href="https://static.jup.ag"
          crossOrigin="anonymous"
        />
        {/* JSON-LD Structured Data for rich search results */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": "https://launchpad.fun/#website",
                  "url": "https://launchpad.fun",
                  "name": "Launchpad",
                  "description": "The curated launchpad on Solana. Launch vetted meme tokens and discover trending projects.",
                  "publisher": {
                    "@id": "https://launchpad.fun/#organization"
                  },
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                      "@type": "EntryPoint",
                      "urlTemplate": "https://launchpad.fun/?q={search_term_string}"
                    },
                    "query-input": "required name=search_term_string"
                  }
                },
                {
                  "@type": "Organization",
                  "@id": "https://launchpad.fun/#organization",
                  "name": "Your Company Name",
                  "url": "https://launchpad.fun",
                  "logo": {
                    "@type": "ImageObject",
                    "url": "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora",
                    "width": 1200,
                    "height": 630
                  },
                  "sameAs": [
                    "https://twitter.com/launchpadfun"
                  ]
                },
                {
                  "@type": "WebApplication",
                  "@id": "https://launchpad.fun/#webapp",
                  "name": "Solana Launchpad",
                  "url": "https://launchpad.fun",
                  "applicationCategory": "FinanceApplication",
                  "operatingSystem": "Web",
                  "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD"
                  },
                  "featureList": [
                    "Curated token launches on Solana",
                    "Whitelist-only access for quality projects",
                    "Discover trending meme tokens",
                    "Fair token launches",
                    "Low transaction fees"
                  ]
                },
                {
                  "@type": "SiteNavigationElement",
                  "name": "Trade Tokens",
                  "description": "Trade meme tokens on Solana",
                  "url": "https://launchpad.fun"
                },
                {
                  "@type": "SiteNavigationElement",
                  "name": "Launch Token",
                  "description": "Launch your token on the curated launchpad",
                  "url": "https://launchpad.fun/create"
                },
                {
                  "@type": "SiteNavigationElement",
                  "name": "Get Whitelisted",
                  "description": "Apply for whitelist access to launch tokens",
                  "url": "https://launchpad.fun/apply"
                },
                {
                  "@type": "SiteNavigationElement",
                  "name": "How It Works",
                  "description": "Learn how to launch tokens on the platform",
                  "url": "https://launchpad.fun/how-it-works"
                },
              ]
            })
          }}
        />
      </head>
      <body
        className={`${poppins.variable} antialiased`}
        suppressHydrationWarning
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Remove browser extension attributes before React hydrates
                const extensionAttributes = [
                  'bis_skin_checked',
                  'bis_size',
                  'bis_id',
                  'data-new-gr-c-s-check-loaded',
                  'data-gr-ext-installed',
                ];
                
                function removeAttributes() {
                  extensionAttributes.forEach(function(attr) {
                    var elements = document.querySelectorAll('[' + attr + ']');
                    for (var i = 0; i < elements.length; i++) {
                      elements[i].removeAttribute(attr);
                    }
                  });
                }
                
                // Run immediately
                removeAttributes();
                
                // Also run after short delays to catch late additions
                setTimeout(removeAttributes, 0);
                setTimeout(removeAttributes, 10);
                setTimeout(removeAttributes, 50);
                
                // Watch for new attributes being added
                if (document.body) {
                  var observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                      if (mutation.type === 'attributes') {
                        var target = mutation.target;
                        extensionAttributes.forEach(function(attr) {
                          if (target.hasAttribute && target.hasAttribute(attr)) {
                            target.removeAttribute(attr);
                          }
                        });
                      }
                    });
                  });
                  
                  observer.observe(document.body, {
                    attributes: true,
                    attributeFilter: extensionAttributes,
                    childList: true,
                    subtree: true
                  });
                }
              })();
            `,
          }}
        />
        <QueryProvider>
          <SupabaseWalletContextProvider>
            <SolPriceProvider>
            <NavigationProgressProvider>
            <CurrentTokenProvider>
              <NavigationProgress />
              <BrowserExtensionCleanup />
              <CurrentDateTicker />
              <MobileDebugConsole />
              <LayoutWrapper>
                {children}
              </LayoutWrapper>
            </CurrentTokenProvider>
            </NavigationProgressProvider>
            </SolPriceProvider>
          </SupabaseWalletContextProvider>
        </QueryProvider>
        <Toaster position="top-center" />
        <IntercomProvider />
        <Analytics />
      </body>
    </html>
  );
}
