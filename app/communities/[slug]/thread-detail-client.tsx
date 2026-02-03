'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, MessageSquare, ArrowLeft, MessageCircle, Upload, X, Link as LinkIcon, ChevronUp, ChevronDown, ExternalLink, Lock } from 'lucide-react';
import { useWalletUser } from '@/hooks/use-wallet-user';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/format/date';
import { supabase } from '@/lib/supabase';
import { CommunityTokenHeader } from '@/components/communities/CommunityTokenHeader';
import type { TokenWithCreator } from '@/lib/types';
import { useTokenHolding, MIN_TOKEN_HOLDING } from '@/hooks/use-token-holding';
import { NATIVE_TOKEN_ADDRESS } from '@/lib/config/app-config';

interface Announcement {
  id: string;
  title: string;
  description: string;
  author: {
    id: string;
    username: string;
    avatar: string;
    points: number;
    wallet_address?: string | null;
  };
  created_at: string;
  slug: string;
  pageId?: string | null;
  commentCount: number;
  upvotes?: number;
  downvotes?: number;
  userVote?: 'up' | 'down' | null;
  metadata?: {
    image?: string;
    websiteLink?: string;
  } | null;
}

interface ThreadDetailClientProps {
  tokenAddress: string;
  initialToken: TokenWithCreator | null;
  initialAnnouncements: Announcement[];
}

export function ThreadDetailClient({
  tokenAddress,
  initialToken,
  initialAnnouncements,
}: ThreadDetailClientProps) {
  const router = useRouter();
  const { user: walletUser, isAuthenticated } = useWalletUser();
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [token] = useState<TokenWithCreator | null>(initialToken);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    description: '',
    image: '',
    websiteLink: ''
  });
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [filter, setFilter] = useState<'featured' | 'new' | 'madeByDev'>('featured');
  const [votingThreads, setVotingThreads] = useState<Set<string>>(new Set());
  const [isLoadingVotes, setIsLoadingVotes] = useState(false);

  // Native token has public community access - no holder check required
  const isNativeToken = tokenAddress === NATIVE_TOKEN_ADDRESS;

  // Check if user has access (holder or developer)
  // Use isInitializing to prevent flicker - it stays true until the first check completes
  const { hasAccess: holderHasAccess, isInitializing: isCheckingAccess } = useTokenHolding(
    tokenAddress,
    initialToken?.creator_wallet
  );

  // Native token is public, others require holder access
  const hasAccess = isNativeToken || holderHasAccess;

  // Refetch announcements on mount to get user's votes (server component doesn't have user context)
  useEffect(() => {
    if (isAuthenticated) {
      setIsLoadingVotes(true);
      fetchAnnouncements().finally(() => setIsLoadingVotes(false));
    }
  }, [isAuthenticated, tokenAddress]);

  // Filter announcements based on selected filter
  const filteredAnnouncements = useMemo(() => {
    if (announcements.length === 0) return [];

    let filtered = [...announcements];

    if (filter === 'featured') {
      // Calculate featured score: 60% upvotes, 40% comments
      // Normalize scores relative to max values in the list
      const maxVotes = Math.max(...filtered.map(a => (a.upvotes || 0) - (a.downvotes || 0)), 1);
      const maxComments = Math.max(...filtered.map(a => a.commentCount || 0), 1);

      filtered.sort((a, b) => {
        const aVoteScore = ((a.upvotes || 0) - (a.downvotes || 0)) / maxVotes;
        const aCommentScore = (a.commentCount || 0) / maxComments;
        const aFeaturedScore = (aVoteScore * 0.6) + (aCommentScore * 0.4);

        const bVoteScore = ((b.upvotes || 0) - (b.downvotes || 0)) / maxVotes;
        const bCommentScore = (b.commentCount || 0) / maxComments;
        const bFeaturedScore = (bVoteScore * 0.6) + (bCommentScore * 0.4);

        return bFeaturedScore - aFeaturedScore;
      });
    } else if (filter === 'new') {
      filtered.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (filter === 'madeByDev') {
      filtered = filtered.filter(announcement => {
        if (token?.creator?.id && announcement.author.id === token.creator.id) {
          return true;
        }
        if (token?.creator_wallet && announcement.author.wallet_address) {
          return token.creator_wallet.toLowerCase() === announcement.author.wallet_address.toLowerCase();
        }
        return false;
      });
    }

    return filtered;
  }, [announcements, filter, token]);

  // Fetch announcements (for refreshing after vote errors)
  const fetchAnnouncements = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/tokens/${tokenAddress}/announcements`, {
        headers,
      });
      if (response.ok) {
        const data = await response.json();
        setAnnouncements(data);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  // Handle voting on a thread
  const handleVote = async (threadId: string, voteType: 'up' | 'down') => {
    if (!isAuthenticated) {
      toast.error('Please log in to vote');
      return;
    }

    // Prevent multiple simultaneous votes
    if (votingThreads.has(threadId)) {
      return;
    }

    setVotingThreads(prev => new Set(prev).add(threadId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to vote');
        setVotingThreads(prev => {
          const next = new Set(prev);
          next.delete(threadId);
          return next;
        });
        return;
      }

      // Optimistically update the UI
      setAnnouncements(prev => prev.map(announcement => {
        if (announcement.id !== threadId) return announcement;

        const currentVote = announcement.userVote;
        let newUpvotes = announcement.upvotes || 0;
        let newDownvotes = announcement.downvotes || 0;
        let newUserVote: 'up' | 'down' | null = null;

        if (currentVote === voteType) {
          // User is clicking the same vote - REMOVE it (toggle off)
          newUserVote = null;
          if (voteType === 'up') {
            newUpvotes = Math.max(0, newUpvotes - 1);
          } else {
            newDownvotes = Math.max(0, newDownvotes - 1);
          }
        } else if (currentVote && currentVote !== voteType) {
          // User is switching their vote (upvote -> downvote or vice versa)
          newUserVote = voteType;
          if (voteType === 'up') {
            newUpvotes += 1;
            newDownvotes = Math.max(0, newDownvotes - 1);
          } else {
            newDownvotes += 1;
            newUpvotes = Math.max(0, newUpvotes - 1);
          }
        } else {
          // No existing vote - add new vote
          newUserVote = voteType;
          if (voteType === 'up') {
            newUpvotes += 1;
          } else {
            newDownvotes += 1;
          }
        }

        return {
          ...announcement,
          upvotes: newUpvotes,
          downvotes: newDownvotes,
          userVote: newUserVote,
        };
      }));

      const response = await fetch(`/api/threads/${threadId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          voteType: voteType,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Update with server response
        setAnnouncements(prev => prev.map(announcement => {
          if (announcement.id !== threadId) return announcement;
          return {
            ...announcement,
            upvotes: data.upvotes ?? announcement.upvotes ?? 0,
            downvotes: data.downvotes ?? announcement.downvotes ?? 0,
            userVote: data.userVote ?? null,
          };
        }));
      } else {
        // Revert optimistic update on error
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        toast.error(error.error || 'Failed to vote');
        fetchAnnouncements();
      }
    } catch (error: any) {
      console.error('Error voting on thread:', error);
      toast.error('Failed to vote');
      fetchAnnouncements();
    } finally {
      setVotingThreads(prev => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
    }
  };

  // Handle image selection (no upload yet)
  const handleImageSelect = (file: File) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type', {
        description: 'Please upload a JPEG, PNG, GIF, or WebP image.',
      });
      return;
    }

    const maxSize = 3 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File too large', {
        description: 'Please upload an image smaller than 3MB.',
      });
      return;
    }

    // Clean up previous preview
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    // Store file and create preview
    setSelectedImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
  };

  // Remove selected image
  const handleRemoveImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setSelectedImageFile(null);
    setImagePreview('');
  };

  // Create new announcement
  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.title || !newAnnouncement.description) {
      toast.error('Title and description are required');
      return;
    }

    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to create a post');
        return;
      }

      let imageUrl = newAnnouncement.image || null;

      // Upload image if one is selected
      if (selectedImageFile) {
        const formData = new FormData();
        formData.append('file', selectedImageFile);

        const uploadResponse = await fetch('/api/upload/image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        });

        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok) {
          throw new Error(uploadData.error || 'Failed to upload image');
        }

        imageUrl = uploadData.url;
      }

      const response = await fetch(`/api/tokens/${tokenAddress}/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: newAnnouncement.title,
          description: newAnnouncement.description,
          image: imageUrl,
          websiteLink: newAnnouncement.websiteLink || null,
        }),
      });

      if (response.ok) {
        const created = await response.json();
        setAnnouncements(prev => [{ ...created, commentCount: 0, upvotes: 0, downvotes: 0, userVote: null }, ...prev]);
        setNewAnnouncement({ title: '', description: '', image: '', websiteLink: '' });
        handleRemoveImage();
        setShowCreateForm(false);
        toast.success('Post created');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create post');
      }
    } catch (error: any) {
      console.error('Error creating announcement:', error);
      toast.error('Failed to create post');
    } finally {
      setIsCreating(false);
    }
  };

  // Show skeleton while checking access (not needed for Native token which is public)
  // This prevents the "Holders Only" message from flickering on page refresh
  if (!isNativeToken && isCheckingAccess) {
    return (
      <div className="min-h-screen">
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <div className="max-w-5xl mx-auto">
            {/* Token card skeleton */}
            <div className="mb-6 animate-pulse">
              <div className="relative flex gap-3 items-start min-w-0 overflow-hidden">
                <div className="w-24 h-24 sm:w-32 sm:h-32 bg-muted rounded-lg flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-5 w-40 bg-muted rounded mb-1" />
                  <div className="h-3 w-16 bg-muted rounded mb-2" />
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-4 h-4 bg-muted rounded-full" />
                    <div className="h-3 w-20 bg-muted rounded" />
                    <div className="h-3 w-14 bg-muted rounded" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-4 w-16 bg-muted rounded" />
                    <div className="flex-1 min-w-[60px] max-w-[100px] h-2.5 bg-muted rounded-md" />
                    <div className="h-5 w-16 bg-muted rounded" />
                  </div>
                  <div className="h-3 w-full bg-muted rounded mb-1" />
                  <div className="h-3 w-3/4 bg-muted rounded" />
                </div>
              </div>
            </div>

            {/* Filter buttons skeleton */}
            <div className="flex items-center gap-1.5 mb-6 flex-wrap">
              <div className="h-8 w-20 bg-muted rounded animate-pulse" />
              <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              <div className="h-8 w-12 bg-muted rounded animate-pulse" />
            </div>

            {/* Post cards skeleton */}
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border-border/50 animate-pulse overflow-hidden">
                  <div className="flex">
                    <div className="flex flex-col items-center gap-1 px-4 py-4 flex-shrink-0">
                      <div className="h-8 w-8 bg-muted rounded" />
                      <div className="h-5 w-8 bg-muted rounded" />
                      <div className="h-8 w-8 bg-muted rounded" />
                    </div>
                    <div className="flex-1 min-w-0 py-4 pr-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-6 w-48 bg-muted rounded" />
                      </div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-4 w-16 bg-muted rounded" />
                        <div className="flex items-center gap-1">
                          <div className="h-4 w-4 bg-muted rounded" />
                          <div className="h-4 w-20 bg-muted rounded" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 w-full bg-muted rounded" />
                        <div className="h-4 w-full bg-muted rounded" />
                        <div className="h-4 w-2/3 bg-muted rounded" />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show gated page if user doesn't have access
  if (!hasAccess) {
    return (
      <div className="min-h-screen">
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <div className="max-w-5xl mx-auto">
            {/* Token Info Card */}
            {token && (
              <div className="mb-6">
                <CommunityTokenHeader token={token} />
              </div>
            )}

            {/* Gated Content Message */}
            <div className="flex flex-col items-center justify-center py-16 px-8">
              <div className="flex flex-col items-center gap-6 text-center max-w-md">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="w-10 h-10 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">Holders Only Community</h2>
                  <p className="text-muted-foreground">
                    You need to hold at least {MIN_TOKEN_HOLDING.toLocaleString()} {token?.symbol || 'tokens'} to access this community and participate in discussions.
                  </p>
                </div>
                <Link href={`/token/${tokenAddress}`}>
                  <Button size="lg" className="bg-primary hover:bg-primary/80 text-primary-foreground gap-2">
                    Buy
                    {token?.metadata?.logo && (
                      <img src={token.metadata.logo} alt="" className="w-5 h-5 rounded-full object-cover" />
                    )}
                    {token?.symbol || 'Token'}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
          {/* Token Info Card */}
          {token ? (
            <div className="mb-6">
              <CommunityTokenHeader token={token} />
            </div>
          ) : (
            <div className="mb-6">
              <h1 className="text-3xl font-bold mb-2">Token Threads</h1>
              <p className="text-muted-foreground">
                Posts and discussions for {tokenAddress}
              </p>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex gap-6 mb-6">
            <button
              onClick={() => setFilter('featured')}
              className={`pb-1 typo-body transition-colors cursor-pointer ${
                filter === 'featured'
                  ? 'text-white border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Featured
            </button>
            <button
              onClick={() => setFilter('new')}
              className={`pb-1 typo-body transition-colors cursor-pointer ${
                filter === 'new'
                  ? 'text-white border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              New
            </button>
            <button
              onClick={() => setFilter('madeByDev')}
              className={`pb-1 typo-body transition-colors cursor-pointer ${
                filter === 'madeByDev'
                  ? 'text-white border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Dev
            </button>
          </div>

          {/* Create Post Button - disabled for Native token */}
          {isAuthenticated && !showCreateForm && !isNativeToken && (
            <Button
              onClick={() => setShowCreateForm(true)}
                className="px-3 bg-primary hover:bg-primary/80 text-primary-foreground mb-6"            >
              <Plus className="w-4 h-4 mr-2" />
              New Post
            </Button>
          )}

          {/* Create Post Form - disabled for Native token */}
          {showCreateForm && isAuthenticated && !isNativeToken && (
            <Card className="bg-background mb-6 border-border/50">
              <CardHeader>
                <CardTitle>Create New Post</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      placeholder="Post title..."
                      value={newAnnouncement.title}
                      onChange={(e) =>
                        setNewAnnouncement(prev => ({ ...prev, title: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="description">Description *</Label>
                    <Textarea
                      id="description"
                      placeholder="Post description..."
                      value={newAnnouncement.description}
                      onChange={(e) =>
                        setNewAnnouncement(prev => ({ ...prev, description: e.target.value }))
                      }
                      rows={8}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="websiteLink">Website Link</Label>
                    <div className="flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-muted-foreground" />
                      <Input
                        id="websiteLink"
                        type="url"
                        placeholder="https://example.com"
                        value={newAnnouncement.websiteLink}
                        onChange={(e) =>
                          setNewAnnouncement(prev => ({ ...prev, websiteLink: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="imageUpload">Image</Label>
                    {imagePreview ? (
                      <div className="mt-2 relative flex justify-center">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="h-48 w-auto max-w-full flex-shrink-0 object-cover rounded-lg"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={handleRemoveImage}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="mt-2"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <label
                          htmlFor="imageUpload"
                          className={`flex flex-col items-center justify-center w-full h-32 border border-dashed rounded-lg cursor-pointer transition-colors ${
                            isDraggingImage ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary'
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              {isDraggingImage ? (
                                <span className="font-semibold">Drop image here</span>
                              ) : (
                                <><span className="font-semibold">Drag & drop</span> or click to select</>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              PNG, JPG, GIF, WEBP (MAX. 3MB)
                            </p>
                          </div>
                          <input
                            id="imageUpload"
                            type="file"
                            className="hidden"
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleImageSelect(file);
                              }
                              // Reset input so the same file can be selected again
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                className="px-3 bg-primary hover:bg-primary/80 text-primary-foreground"                      onClick={handleCreateAnnouncement}
                      disabled={isCreating}
                    >
                      {isCreating ? 'Creating...' : 'Create Post'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewAnnouncement({ title: '', description: '', image: '', websiteLink: '' });
                        handleRemoveImage();
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Posts List */}
          {filteredAnnouncements.length > 0 && (
            <div className="space-y-4">
              {filteredAnnouncements.map((announcement) => {
                const announcementId = announcement.slug.split('-announcement-')[1] || announcement.slug;
                const commentCount = announcement.commentCount || 0;

                return (
                  <Link key={announcement.id} href={`/communities/${tokenAddress}/${announcementId}`} className="block">
                    <Card className="bg-background border-border/50 hover:border-primary transition-colors cursor-pointer">
                      <div className="flex">
                        {/* Voting Section - Left Side */}
                        <div className="flex flex-col items-center gap-1 px-4 py-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleVote(announcement.id, 'up');
                          }}
                          disabled={!isAuthenticated || votingThreads.has(announcement.id) || isLoadingVotes}
                          className={`h-8 w-8 p-0 transition-all duration-200 bg-transparent hover:bg-transparent ${
                            isLoadingVotes ? 'opacity-50' : ''
                          } ${
                            announcement.userVote === 'up'
                              ? 'text-primary hover:text-primary/80'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          title={announcement.userVote === 'up' ? 'Remove upvote' : 'Upvote'}
                        >
                          <ChevronUp className="h-5 w-5" />
                        </Button>
                        <span className={`text-sm font-semibold min-w-[2rem] text-center transition-all duration-200 ${
                          isLoadingVotes ? 'opacity-50' : ''
                        } ${
                          announcement.userVote ? 'text-primary' : 'text-foreground'
                        }`}>
                          {((announcement.upvotes || 0) - (announcement.downvotes || 0))}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleVote(announcement.id, 'down');
                          }}
                          disabled={!isAuthenticated || votingThreads.has(announcement.id) || isLoadingVotes}
                          className={`h-8 w-8 p-0 transition-all duration-200 bg-transparent hover:bg-transparent ${
                            isLoadingVotes ? 'opacity-50' : ''
                          } ${
                            announcement.userVote === 'down'
                              ? 'text-primary hover:text-primary/80'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          title={announcement.userVote === 'down' ? 'Remove downvote' : 'Downvote'}
                        >
                          <ChevronDown className="h-5 w-5" />
                        </Button>
                      </div>

                      {/* Content Section - Right Side */}
                      <div className="flex-1">
                        <CardHeader className="pl-0">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xl">{announcement.title}</CardTitle>
                            {((token?.creator?.id && announcement.author.id === token.creator.id) ||
                              (token?.creator_wallet && announcement.author.wallet_address &&
                               token.creator_wallet.toLowerCase() === announcement.author.wallet_address.toLowerCase())) && (
                              <Badge
                                className="bg-primary text-body text-black"
                              >
                                Dev
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 typo-caption text-muted-foreground mb-4">
                            <span>{formatRelativeTime(announcement.created_at)}</span>
                            
                            <div className="flex items-center gap-1">
                              <MessageCircle className="w-4 h-4" />
                              <span>{commentCount} {commentCount === 1 ? 'comment' : 'comments'}</span>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pl-0">
                          {announcement.metadata?.image && (
                            <div className="mb-4 flex justify-start">
                              <img
                                src={announcement.metadata.image}
                                alt={announcement.title}
                                className="h-48 w-auto max-w-full flex-shrink-0 object-cover rounded-lg"
                              />
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                            {announcement.description}
                          </p>
                          {announcement.metadata?.websiteLink && (
                            <span
                              role="link"
                              tabIndex={0}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.open(announcement.metadata?.websiteLink, '_blank', 'noopener,noreferrer');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.open(announcement.metadata?.websiteLink, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer max-w-full mt-3"
                            >
                              <span className="truncate">
                                {(() => {
                                  const link = announcement.metadata?.websiteLink;
                                  if (!link) return '';
                                  try {
                                    const url = new URL(link);
                                    const pathname = url.pathname.endsWith('/') && url.pathname !== '/'
                                      ? url.pathname.slice(0, -1)
                                      : url.pathname;
                                    const display = url.hostname + (pathname === '/' ? '' : pathname);
                                    return display.length > 50 ? display.slice(0, 50) + '...' : display;
                                  } catch {
                                    return link.length > 50 ? link.slice(0, 50) + '...' : link;
                                  }
                                })()}
                              </span>
                              <ExternalLink className="w-4 h-4 flex-shrink-0" />
                            </span>
                          )}
                        </CardContent>
                      </div>
                    </div>
                  </Card>
                  </Link>
                );
              })}
            </div>
          )}

          {/* No Posts */}
          {filteredAnnouncements.length === 0 && announcements.length === 0 && (
            <Card className="bg-background border-border/50">
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-2">No posts yet</p>
                {!isNativeToken && (
                  isAuthenticated ? (
                    <p className="text-sm text-muted-foreground">
                      Be the first to create one!
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Log in to create the first post
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          )}

          {/* No Results for Filter */}
          {filteredAnnouncements.length === 0 && announcements.length > 0 && (
            <Card className="bg-background border-border/50">
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-2">
                  No posts match this filter
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilter('featured')}
                  className="mt-4"
                >
                  Show Featured Posts
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
