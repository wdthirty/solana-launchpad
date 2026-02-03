'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check } from 'lucide-react';

const NATIVE_TOKEN_ADDRESS = 'YOUR_NATIVE_TOKEN_ADDRESS';
const JUPITER_SWAP_URL = `https://jup.ag/swap?sell=So11111111111111111111111111111111111111112&buy=${NATIVE_TOKEN_ADDRESS}`;

export default function NativeTokenPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(NATIVE_TOKEN_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-10">
        {/* Hero */}
        <div className="text-center space-y-6 py-8">
          <img
            src="https://wsrv.nl/?url=https%3A%2F%2Fipfs.io%2Fipfs%2Fbafkreibyu3lqzhqdaletzi2hyoakqyvy55r7b7vtm6mshd4gbrdy2iho7e&w=192&h=192&fit=cover&maxage=1h"
            alt="Platform Token"
            className="w-28 h-28 rounded-full mx-auto"
          />
          <h1 className="text-4xl md:text-5xl font-bold">$TOKEN</h1>
          <p className="text-xl text-muted-foreground max-w-lg mx-auto">
            The launchpad token that actually makes sense.
          </p>
        </div>

        {/* The Problem */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-center md:text-left">Why $TOKEN?</h2>
          <div className="rounded-2xl border border-border/50 p-6 bg-[#0c0c0e]">
          <p className="text-lg text-muted-foreground leading-relaxed">
            Most launchpad tokens give you nothing. You hold them, hope for the best, and watch the team dump on you.
          </p>
          <p className="text-lg text-foreground leading-relaxed mt-4">
            $TOKEN is different.
          </p>
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-center md:text-left">Here's how it works</h2>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border/50 p-5 bg-[#0c0c0e]">
              <div className="text-lg font-medium mb-2">Every trade buys $TOKEN</div>
              <p className="text-muted-foreground">
                When people trade tokens on Launchpad, a portion of the fees automatically buys $TOKEN from the open market. Not from a treasury. From the market—creating real buying pressure.
              </p>
            </div>

            <div className="rounded-2xl border border-border/50 p-5 bg-[#0c0c0e]">
              <div className="text-lg font-medium mb-2">Platform grows, demand grows</div>
              <p className="text-muted-foreground">
                More tokens launched. More trading volume. More fees. More $TOKEN bought. It's a flywheel that rewards holders as the platform succeeds.
              </p>
            </div>

            <div className="rounded-2xl border border-border/50 p-5 bg-[#0c0c0e]">
              <div className="text-lg font-medium mb-2">Curated quality, not a casino</div>
              <p className="text-muted-foreground">
                We don't let anyone launch anything. Every token is reviewed. This means real projects, real volume, and real value flowing back to $TOKEN.
              </p>
            </div>
          </div>
        </div>

        {/* Why it's different */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-center md:text-left">Why $TOKEN wins</h2>
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#0c0c0e] border border-border/50">
              <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
              <span className="text-muted-foreground">Automatic buybacks from real platform revenue</span>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#0c0c0e] border border-border/50">
              <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
              <span className="text-muted-foreground">No team dumps—aligned incentives</span>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#0c0c0e] border border-border/50">
              <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
              <span className="text-muted-foreground">Curated launches mean sustainable growth</span>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#0c0c0e] border border-border/50">
              <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
              <span className="text-muted-foreground">Your upside is tied to platform success</span>
            </div>
          </div>
        </div>

        {/* Contract Address */}
        <button
          onClick={handleCopy}
          className="w-full rounded-2xl p-5 bg-primary hover:bg-primary/90 transition-colors cursor-pointer text-left"
        >
          <p className="text-sm font-semibold text-primary-foreground mb-2">
            Contract Address
          </p>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-primary-foreground break-all">
              <span className="sm:hidden">{NATIVE_TOKEN_ADDRESS.slice(0, 16)}...{NATIVE_TOKEN_ADDRESS.slice(-4)}</span>
              <span className="hidden sm:inline">{NATIVE_TOKEN_ADDRESS}</span>
            </code>
            {copied ? <Check className="w-4 h-4 text-primary-foreground shrink-0" /> : <Copy className="w-4 h-4 text-primary-foreground/60 shrink-0" />}
          </div>
        </button>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={JUPITER_SWAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
          >
            Buy on Jupiter
          </a>
          <Link
            href={`/token/${NATIVE_TOKEN_ADDRESS}`}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-full border border-border hover:bg-muted/50 text-foreground font-medium transition-colors"
          >
            View Chart
          </Link>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground/60 text-center">
          Crypto is risky. Only invest what you can afford to lose. Always verify the contract address.
        </p>
      </div>
    </div>
  );
}
