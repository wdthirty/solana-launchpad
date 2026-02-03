'use client';

import { useState, useRef, useEffect } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Upload, X, Bug, CheckCircle2, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FileAttachment {
  id: string;
  file: File;
  preview: string;
}

export default function BugBountyPage() {
  const { publicKey, connected } = useWallet();
  const [rewardsMax, setRewardsMax] = useState(25000);
  const [rewardsRemaining, setRewardsRemaining] = useState(25000);
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prefill wallet address when connected
  useEffect(() => {
    if (publicKey && !walletAddress) {
      setWalletAddress(publicKey.toBase58());
    }
  }, [publicKey, walletAddress]);

  // Fetch bug bounty config from API
  useEffect(() => {
    fetch('/api/bug-bounty/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.rewards_max) setRewardsMax(data.rewards_max);
        if (data.rewards_remaining) setRewardsRemaining(data.rewards_remaining);
      })
      .catch(console.error);
  }, []);

  const progress = ((rewardsMax - rewardsRemaining) / rewardsMax) * 100;

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    if (!connected) {
      toast.error('Please connect your wallet to upload files');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 3 * 1024 * 1024; // 3MB

    Array.from(files).forEach((file) => {
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid file type', {
          description: 'Please upload images only (JPEG, PNG, GIF, WebP).',
        });
        return;
      }

      if (file.size > maxSize) {
        toast.error('File too large', {
          description: 'Please upload images smaller than 3MB.',
        });
        return;
      }

      const attachment: FileAttachment = {
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      };

      setAttachments((prev) => [...prev, attachment]);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  useEffect(() => {
    return () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.preview));
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected || !publicKey) {
      toast.error('Please connect your wallet to submit a bug report');
      return;
    }

    if (!description.trim()) {
      toast.error('Please describe the bug');
      return;
    }

    if (!walletAddress.trim()) {
      toast.error('Please enter your Solana wallet address');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get auth session
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast.error('Please connect your wallet and sign in');
        setIsSubmitting(false);
        return;
      }

      // Build form data
      const formData = new FormData();
      formData.append('walletAddress', walletAddress);
      formData.append('description', description);
      if (contactInfo) formData.append('contactInfo', contactInfo);
      if (stepsToReproduce) formData.append('stepsToReproduce', stepsToReproduce);
      if (expectedBehavior) formData.append('expectedBehavior', expectedBehavior);
      if (actualBehavior) formData.append('actualBehavior', actualBehavior);

      // Add attachments
      attachments.forEach((att, index) => {
        formData.append(`attachment_${index}`, att.file);
      });

      // Submit to API
      const response = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit bug report');
      }

      setIsSubmitted(true);
      toast.success('Bug report submitted successfully!', {
        description: 'We will review your report and get back to you.',
      });

      // Clear form
      setDescription('');
      setStepsToReproduce('');
      setExpectedBehavior('');
      setActualBehavior('');
      setContactInfo('');
      attachments.forEach((a) => URL.revokeObjectURL(a.preview));
      setAttachments([]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit bug report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen">
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="typo-title">Thank You!</h1>
            <p className="typo-body text-muted-foreground">
              Your bug report has been submitted successfully. Our team will review it and
              reach out to you if your report qualifies for a bounty reward.
            </p>
            <Button onClick={() => setIsSubmitted(false)} variant="ghost">
              Submit Another Report
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Bug className="w-6 h-6 text-primary" />
              <h1 className="typo-title">Bug Bounty Program</h1>
            </div>
            <p className="typo-body text-muted-foreground">
              Help us improve launchpad.fun and earn rewards
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6 p-6 rounded-lg border border-border/50 bg-[#111114]">
            {/* Bounty Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="typo-body text-muted-foreground">Rewards Pool</span>
                <span className="typo-body font-semibold text-primary">
                  ${rewardsRemaining.toLocaleString()} / ${rewardsMax.toLocaleString()}
                </span>
              </div>
              <div className="w-full rounded-full overflow-hidden h-2.5 bg-border/50">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-primary"
                  style={{ width: `${100 - progress}%` }}
                />
              </div>
            </div>

            {/* Guidelines */}
            <div className="rounded-lg bg-muted/30 p-4 space-y-2">
              <p className="typo-body">
                <strong>Scope:</strong> Any bug — security issues, broken functionality, UI/UX problems, and performance issues.
              </p>
              <p className="typo-body">
                <strong>Rewards:</strong> First come, first served. Critical: up to $5,000 | High: up to $2,000 | Medium: up to $500 | Low: up to $100
              </p>
            </div>

            {/* Wallet Address */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="wallet" className="typo-body">Solana Wallet Address *</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>Your wallet address for receiving bounty rewards</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="wallet"
                placeholder="Your Solana wallet address"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* Contact Info */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="contact" className="typo-body">Telegram, Twitter, or Email</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>Optional contact info if we need to reach you</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="contact"
                placeholder="x.com/..., t.me/... or email"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* Bug Description */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="description" className="typo-body">Bug Description *</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>Describe the bug and its impact in detail</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Textarea
                id="description"
                placeholder="Describe the bug and its impact..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
                rows={4}
              />
            </div>

            {/* Steps to Reproduce */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="steps" className="typo-body">Steps to Reproduce</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>Step-by-step instructions to reproduce the bug</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Textarea
                id="steps"
                placeholder="1. Go to...&#10;2. Click on...&#10;3. Observe that..."
                value={stepsToReproduce}
                onChange={(e) => setStepsToReproduce(e.target.value)}
                disabled={isSubmitting}
                rows={4}
              />
            </div>

            {/* Expected vs Actual on same row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <Label htmlFor="expected" className="typo-body">Expected Behavior</Label>
                <Textarea
                  id="expected"
                  placeholder="What should happen..."
                  value={expectedBehavior}
                  onChange={(e) => setExpectedBehavior(e.target.value)}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="actual" className="typo-body">Actual Behavior</Label>
                <Textarea
                  id="actual"
                  placeholder="What actually happens..."
                  value={actualBehavior}
                  onChange={(e) => setActualBehavior(e.target.value)}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>

            {/* File Upload */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Label className="typo-body">Screenshots</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>Upload screenshots to help us understand the bug</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Attachment Previews */}
              {attachments.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="relative group rounded-lg overflow-hidden border border-border bg-[#111114] aspect-video"
                    >
                      <img
                        src={attachment.preview}
                        alt="Attachment preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                        disabled={isSubmitting}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Area */}
              <div
                className={`border border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                  id="fileUpload"
                  disabled={isSubmitting || !connected}
                />
                <label
                  htmlFor="fileUpload"
                  className={`flex flex-col items-center gap-2 ${connected ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                >
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="typo-body">
                      {!connected ? 'Connect wallet to upload' : isDragging ? 'Drop files here' : 'Drag & drop or click to upload'}
                    </p>
                    <p className="typo-caption text-muted-foreground mt-1">
                      PNG, JPG, GIF, or WebP (max 3MB)
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDescription('');
                  setStepsToReproduce('');
                  setExpectedBehavior('');
                  setActualBehavior('');
                  setContactInfo('');
                  setWalletAddress('');
                  attachments.forEach((a) => URL.revokeObjectURL(a.preview));
                  setAttachments([]);
                }}
                disabled={isSubmitting}
                className="flex-1 typo-button"
              >
                Clear
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !connected}
                className="flex-1 typo-button bg-primary hover:bg-primary/80 text-primary-foreground"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Bug Report'}
              </Button>
            </div>

            {!connected && (
              <p className="typo-caption text-muted-foreground text-center">
                Please connect your wallet to submit a bug report.
              </p>
            )}

            <p className="typo-caption text-muted-foreground text-center">
              By submitting, you agree to our responsible disclosure policy.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
