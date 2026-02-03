'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

const sections = [
  { id: 'introduction', name: 'Introduction' },
  { id: 'apply', name: 'Get Whitelisted' },
  { id: 'community', name: 'Grow' },
  { id: 'earnings', name: 'Earn' },
];

export default function HowItWorksPage() {
  const [activeSection, setActiveSection] = useState('introduction');
  const [scrollProgress, setScrollProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Track active section and scroll progress
  useEffect(() => {
    const handleScroll = () => {
      // Update active section based on scroll position
      sections.forEach((section) => {
        const element = document.getElementById(section.id);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 200 && rect.bottom >= 200) {
            setActiveSection(section.id);
          }
        }
      });

      // Calculate scroll progress
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setScrollProgress(Math.min(100, Math.max(0, progress)));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: elementPosition - offset, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-muted z-50">
        <div
          className="h-full bg-primary transition-all duration-100 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        {/* Gradient orbs */}

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 tracking-tight">
            Quality Over
            <span className="block text-primary">Quantity</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            The only launchpad where every creator is vetted. No rugs. No spam. Just real projects backed by real communities.
          </p>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-8 max-w-lg mx-auto mb-12">
            <div>
              <div className="text-3xl md:text-4xl font-bold text-foreground">1-5%</div>
              <div className="text-sm text-muted-foreground">Creator Royalty</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-foreground">∞</div>
              <div className="text-sm text-muted-foreground">Earnings Duration</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/apply"
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-semibold text-lg transition-all shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 cursor-pointer"
            >
              Apply for Whitelist
              <ArrowRight className="w-5 h-5" />
            </Link>
            <button
              onClick={() => scrollToSection('introduction')}
              className="inline-flex items-center gap-2 px-8 py-4 bg-muted hover:bg-muted/80 text-foreground rounded-full font-semibold text-lg transition-all cursor-pointer"
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 pb-24">
        <div className="flex gap-12 lg:gap-16">
          {/* Sticky Navigation */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-28">
              <nav className="space-y-1">
                {sections.map((section, index) => {
                  const isActive = activeSection === section.id;
                  const isPast = sections.findIndex(s => s.id === activeSection) > index;

                  return (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className={cn(
                        'w-full px-4 py-3 rounded-lg transition-all duration-200 text-left font-medium cursor-pointer',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isPast
                            ? 'text-primary hover:bg-primary/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      {section.name}
                    </button>
                  );
                })}
              </nav>

              {/* CTA in sidebar */}
              <div className="mt-8 p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <p className="text-sm text-muted-foreground mb-3">Ready to launch?</p>
                <Link
                  href="/apply"
                  className="inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
                >
                  Apply Now <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </aside>

          {/* Content */}
          <div ref={contentRef} className="flex-1 max-w-3xl">
            {/* Introduction */}
            <section id="introduction" className="mb-24 scroll-mt-28">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">Introduction</h2>

              <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                This is the first curated token launchpad on Solana. We believe the best projects come from vetted creators with real track records — not anonymous accounts launching disposable tokens.
              </p>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0" />
                  <p className="text-muted-foreground"><span className="text-foreground font-medium">Whitelist-Only</span> — Every creator is reviewed and approved before launching</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0" />
                  <p className="text-muted-foreground"><span className="text-foreground font-medium">No Rugs</span> — Vetted creators mean trustworthy projects</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0" />
                  <p className="text-muted-foreground"><span className="text-foreground font-medium">1-5% Forever</span> — Earn royalties on every trade, forever</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0" />
                  <p className="text-muted-foreground"><span className="text-foreground font-medium">Dedicated Support</span> — Direct access to the team for launch support</p>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-l-4 border-primary">
                <p className="text-foreground">
                  <span className="text-primary font-bold">TL;DR:</span> We're building the most trusted launchpad in crypto. Quality creators, quality projects, quality returns.
                </p>
              </div>
            </section>

            {/* Apply for Whitelist */}
            <section id="apply" className="mb-24 scroll-mt-28">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">Get Whitelisted</h2>

              <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                We review every application to ensure our platform maintains the highest standards. Here's how to get started.
              </p>

              <div className="space-y-6 mb-8">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">1</div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Submit Your Application</h3>
                    <p className="text-muted-foreground">Fill out our whitelist application form with your wallet address, project concept, and any relevant links (social profiles, previous work, community).</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">2</div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Review Process</h3>
                    <p className="text-muted-foreground">Our team reviews your application within 48 hours. We evaluate your track record, project viability, and community potential.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">3</div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Get Approved</h3>
                    <p className="text-muted-foreground">Once approved, your wallet is whitelisted and you can launch tokens directly from the platform. Welcome to the club.</p>
                  </div>
                </div>
              </div>

              <Link
                href="/apply"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-semibold transition-all cursor-pointer"
              >
                Apply for Whitelist <ArrowRight className="w-4 h-4" />
              </Link>
            </section>

            {/* Community */}
            <section id="community" className="mb-24 scroll-mt-28">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">Grow Your Community</h2>

              <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                Your holders are your community. They're invested in your success — literally. Here's how to maximize that relationship.
              </p>

              <div className="p-6 rounded-2xl bg-muted/50 mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-4">The Flywheel Effect</h3>
                <p className="text-muted-foreground">
                  More content → More visibility → More volume → More earnings → Reinvest in more content
                </p>
              </div>

              <h3 className="text-lg font-semibold text-foreground mb-4">Growth Playbook</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  'Add token link to your social bios',
                  'Create a holder group chat',
                  'Post engaging project updates',
                  'Host AMAs and community calls',
                  'Run holder-exclusive events',
                  'Collaborate with other creators',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Earnings */}
            <section id="earnings" className="mb-24 scroll-mt-28">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">Claim Your Earnings</h2>

              <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                You earn 1-5% of all trading volume on your token. Forever. No cap, no expiration, no catch.
              </p>

              {/* Earnings highlight */}
              <div className="relative p-8 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 mb-8 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-2xl" />
                <div className="relative z-10">
                  <div className="text-6xl md:text-7xl font-bold text-primary mb-2">1-5%</div>
                  <div className="text-xl text-foreground font-medium mb-1">On Every Trade</div>
                  <div className="text-muted-foreground">From launch, through bonding curve, and beyond</div>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-foreground mb-4">How It Works</h3>
              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0" />
                  <p className="text-muted-foreground"><span className="text-foreground font-medium">Automatic Accrual</span> — Earnings accumulate in real-time as your token trades</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0" />
                  <p className="text-muted-foreground"><span className="text-foreground font-medium">Claim Anytime</span> — No lock-up period. Withdraw your SOL whenever you want</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0" />
                  <p className="text-muted-foreground"><span className="text-foreground font-medium">Transparent</span> — Track every trade and fee on-chain</p>
                </div>
              </div>

              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-full font-semibold transition-all"
              >
                Explore Live Tokens <ArrowRight className="w-4 h-4" />
              </Link>
            </section>

            {/* Final CTA */}
            <section className="relative p-8 md:p-12 rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground overflow-hidden">
              <div className="relative z-10 text-center">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Build Something Real?</h2>
                <p className="text-primary-foreground/80 text-lg mb-8 max-w-lg mx-auto">
                  Join the creators who chose quality over quantity. Apply for whitelist access today.
                </p>
                <Link
                  href="/apply"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-background hover:bg-background/90 text-foreground rounded-full font-semibold text-lg transition-all cursor-pointer"
                >
                  Apply for Whitelist <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
