'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ApplyPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    walletAddress: '',
    projectName: '',
    projectDescription: '',
    twitterHandle: '',
    telegramHandle: '',
    websiteUrl: '',
    // Project socials (for existing communities)
    projectTwitter: '',
    projectTelegram: '',
    projectDiscord: '',
    previousWork: '',
    communitySize: '',
    willingToKyc: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/whitelist/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit application');
      }

      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-4">Application Submitted</h1>
          <p className="text-muted-foreground mb-8">
            Thanks for applying! We'll review your application and get back to you within 48 hours. Keep an eye on your DMs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-full text-sm font-semibold transition-all cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              How It Works
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm font-semibold transition-all cursor-pointer whitespace-nowrap"
            >
              Explore Tokens
              <ArrowRight className="w-4 h-4 flex-shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to How It Works
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Apply for Whitelist</h1>
          <p className="text-lg text-muted-foreground">
            Tell us about yourself and your project. We review every application to maintain our quality standards.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Required Section */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-foreground">Required Information</h2>

            <div>
              <label htmlFor="walletAddress" className="block text-sm font-medium text-foreground mb-2">
                Wallet Address <span className="text-red-500">*</span>
              </label>
              <Input
                id="walletAddress"
                name="walletAddress"
                type="text"
                placeholder="Your Solana wallet address"
                value={formData.walletAddress}
                onChange={handleChange}
                required
                className="w-full"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                This wallet will be whitelisted if approved
              </p>
            </div>

            <div>
              <label htmlFor="projectName" className="block text-sm font-medium text-foreground mb-2">
                Project Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="projectName"
                name="projectName"
                type="text"
                placeholder="What's your project called?"
                value={formData.projectName}
                onChange={handleChange}
                required
                maxLength={100}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="projectDescription" className="block text-sm font-medium text-foreground mb-2">
                Project Description <span className="text-red-500">*</span>
              </label>
              <Textarea
                id="projectDescription"
                name="projectDescription"
                placeholder="Tell us about your project. What are you building? Why should people care? What's your vision?"
                value={formData.projectDescription}
                onChange={handleChange}
                required
                minLength={50}
                maxLength={2000}
                rows={5}
                className="w-full"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {formData.projectDescription.length}/2000 characters (minimum 50)
              </p>
            </div>
          </div>

          {/* Creator Social Links */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-foreground">Creator Social Links</h2>
            <p className="text-sm text-muted-foreground -mt-4">Your personal accounts to verify your identity</p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="twitterHandle" className="block text-sm font-medium text-foreground mb-2">
                  X (Twitter) <span className="text-red-500">*</span>
                </label>
                <Input
                  id="twitterHandle"
                  name="twitterHandle"
                  type="text"
                  placeholder="@username"
                  value={formData.twitterHandle}
                  onChange={handleChange}
                  required
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="telegramHandle" className="block text-sm font-medium text-foreground mb-2">
                  Telegram <span className="text-red-500">*</span>
                </label>
                <Input
                  id="telegramHandle"
                  name="telegramHandle"
                  type="text"
                  placeholder="@username or t.me/group"
                  value={formData.telegramHandle}
                  onChange={handleChange}
                  required
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label htmlFor="websiteUrl" className="block text-sm font-medium text-foreground mb-2">
                Website
              </label>
              <Input
                id="websiteUrl"
                name="websiteUrl"
                type="url"
                placeholder="https://yourproject.com"
                value={formData.websiteUrl}
                onChange={handleChange}
                className="w-full"
              />
            </div>
          </div>

          {/* Project Socials */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-foreground">Project Socials</h2>
            <p className="text-sm text-muted-foreground -mt-4">If you have an existing community, share the project's social accounts</p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="projectTwitter" className="block text-sm font-medium text-foreground mb-2">
                  Project X (Twitter)
                </label>
                <Input
                  id="projectTwitter"
                  name="projectTwitter"
                  type="text"
                  placeholder="@projecthandle"
                  value={formData.projectTwitter}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="projectTelegram" className="block text-sm font-medium text-foreground mb-2">
                  Project Telegram
                </label>
                <Input
                  id="projectTelegram"
                  name="projectTelegram"
                  type="text"
                  placeholder="t.me/yourproject or @groupname"
                  value={formData.projectTelegram}
                  onChange={handleChange}
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label htmlFor="projectDiscord" className="block text-sm font-medium text-foreground mb-2">
                Project Discord
              </label>
              <Input
                id="projectDiscord"
                name="projectDiscord"
                type="text"
                placeholder="discord.gg/invite or server name"
                value={formData.projectDiscord}
                onChange={handleChange}
                className="w-full"
              />
            </div>
          </div>

          {/* Identity Verification */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-foreground">Identity Verification</h2>
            <p className="text-sm text-muted-foreground -mt-4">KYC verification through AssureDefi</p>

            <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
              <p className="text-sm text-muted-foreground mb-3">
                We partner with <a href="https://www.assuredefi.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">AssureDefi</a> for identity verification. KYC'd creators get a verified badge on their tokens.
              </p>
              <div>
                <label htmlFor="willingToKyc" className="block text-sm font-medium text-foreground mb-2">
                  Are you willing to complete KYC verification?
                </label>
                <select
                  id="willingToKyc"
                  name="willingToKyc"
                  value={formData.willingToKyc}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary cursor-pointer"
                >
                  <option value="">Select an option</option>
                  <option value="yes">Yes, I'm willing to complete KYC</option>
                  <option value="no">No, not at this time</option>
                  <option value="already">I'm already KYC'd with AssureDefi</option>
                </select>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-foreground">Additional Information</h2>
            <p className="text-sm text-muted-foreground -mt-4">Optional but helps us understand your background</p>

            <div>
              <label htmlFor="previousWork" className="block text-sm font-medium text-foreground mb-2">
                Previous Work / Track Record
              </label>
              <Textarea
                id="previousWork"
                name="previousWork"
                placeholder="Have you launched tokens before? Built communities? Share any relevant experience..."
                value={formData.previousWork}
                onChange={handleChange}
                rows={3}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="communitySize" className="block text-sm font-medium text-foreground mb-2">
                Existing Community Size
              </label>
              <select
                id="communitySize"
                name="communitySize"
                value={formData.communitySize}
                onChange={handleChange}
                className="flex h-10 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary cursor-pointer"
              >
                <option value="">Select an option</option>
                <option value="none">No existing community</option>
                <option value="small">Small (under 1,000)</option>
                <option value="medium">Medium (1,000 - 10,000)</option>
                <option value="large">Large (10,000 - 100,000)</option>
                <option value="massive">Massive (100,000+)</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                'Submitting...'
              ) : (
                <>
                  Submit Application
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            <p className="mt-4 text-sm text-muted-foreground">
              By submitting, you agree to our review process. We typically respond within 48 hours.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
