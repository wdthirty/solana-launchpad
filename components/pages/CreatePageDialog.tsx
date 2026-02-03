'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Plus, Users, Zap, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CreatePageDialogProps {
  trigger?: React.ReactNode;
  onPageCreated?: () => void;
}

export function CreatePageDialog({ trigger, onPageCreated }: CreatePageDialogProps) {
  const router = useRouter();
  const { connected } = useWallet();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    if (!connected) {
      setError('Please connect your wallet');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      // Get session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please log in to create a page');
        return;
      }

      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: '', // Empty description
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create page');
      }

      const newPage = await response.json();

      // Reset form
      setTitle('');
      setOpen(false);
      
      // Call callback to refresh pages list if provided
      if (onPageCreated) {
        onPageCreated();
      }
      
      toast.success('Page created successfully!', {
        description: 'Redirecting to your page...',
      });

      // Navigate to the new page
      setTimeout(() => {
        router.push(`/page-creator/${newPage.slug}`);
      }, 1000);
    } catch (err: any) {
      console.error('Error creating page:', err);
      setError(err.message || 'Failed to create page. Please try again.');
      toast.error('Failed to create page', {
        description: err.message || 'Please try again.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button>Create Page</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Page
          </DialogTitle>
          <DialogDescription>
            Start a new discussion topic for the community. Fill in the details for your new page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreatePage} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Page Title</Label>
            <Input
              id="title"
              type="text"
              placeholder="Enter a descriptive title for your page..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isCreating}
              className="w-full"
              required
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              {error}
            </div>
          )}

          <Separator />

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg border bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Community Discussion</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your page will become a hub for community discussion where users can comment, reply, and engage.
                </p>
              </div>

              <div className="p-4 rounded-lg border bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Instant Engagement</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  Once created, users can immediately start commenting, voting, and awarding points.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-muted-foreground">
                {!connected && (
                  <span className="text-destructive">Please connect your wallet to create a page</span>
                )}
                {connected && (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Wallet connected
                  </span>
                )}
              </div>
              
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                
                <Button 
                  type="submit" 
                  disabled={isCreating || !connected || !title.trim()}
                  className="flex items-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Page
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

