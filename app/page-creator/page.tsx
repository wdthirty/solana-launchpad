'use client';

import { useState, useEffect, Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, FileText, Calendar } from 'lucide-react';
import { CreatePageDialog } from '@/components/pages/CreatePageDialog';
import { useWalletUser } from '@/hooks/use-wallet-user';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/format/date';
import { Pagination } from '@/components/tokens/Pagination';
import Link from 'next/link';
import type { PageWithAuthor } from '@/lib/types';

const ITEMS_PER_PAGE = 24; // 6 rows * 4 columns (same as communities)

// Skeleton component for page list - matches Card structure in paginatedPages.map
function PagesListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="border-border/50 animate-pulse shadow-none h-full">
          <div className="p-4">
            {/* Title - font-medium text-sm */}
            <div className="h-4 w-28 bg-muted rounded mb-1" />
            {/* Description - text-xs line-clamp-2 mb-3 */}
            <div className="h-3 w-full bg-muted rounded mb-1" />
            <div className="h-3 w-3/4 bg-muted rounded mb-3" />
            {/* Date with calendar icon - text-xs */}
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-muted rounded" />
              <div className="h-3 w-16 bg-muted rounded" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function PageCreatorPageContent() {
  const { isAuthenticated } = useWalletUser();
  const [pages, setPages] = useState<PageWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination calculations
  const totalPages = Math.ceil(pages.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedPages = pages.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Fetch user's pages
  useEffect(() => {
    const fetchPages = async () => {
      if (!isAuthenticated) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setIsLoading(false);
          return;
        }

        const response = await fetch('/api/pages/my', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPages(data);
        } else {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to load pages');
        }
      } catch (err: any) {
        console.error('Error fetching pages:', err);
        setError('Failed to load pages');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handlePageCreated = () => {
    // Refresh pages list after creating a new page
    const fetchPages = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch('/api/pages/my', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPages(data);
        }
      } catch (err) {
        console.error('Error refreshing pages:', err);
      }
    };

    fetchPages();
  };

  return (
    <div className="min-h-screen">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold mb-1">Page Creator</h1>
              <p className="text-muted-foreground text-sm">
                Create a custom token page for your future launches
              </p>
            </div>
            <CreatePageDialog
              trigger={
                <Button                 className="px-3 bg-primary hover:bg-primary/80 text-primary-foreground"
>
                  <Plus className="w-4 h-4" />
                  Create Page
                </Button>
              }
              onPageCreated={handlePageCreated}
            />
          </div>

          {isLoading && <PagesListSkeleton />}

          {error && (
            <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {!isLoading && !error && pages.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                {isAuthenticated
                  ? 'No pages yet. Create your first page!'
                  : 'Connect your wallet to create pages'}
              </p>
            </div>
          )}

          {!isLoading && !error && pages.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {paginatedPages.map((page) => (
                  <Link key={page.id} href={`/page-creator/${page.slug}`}>
                    <Card className="border-border/50 hover:border-primary transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer shadow-none h-full">
                      <div className="p-4">
                        <h3 className="font-medium text-sm truncate mb-1">
                          {page.title}
                        </h3>
                        {page.description && (
                          <p className="text-muted-foreground text-xs line-clamp-2 mb-3">
                            {page.description}
                          </p>
                        )}
                        <div className="flex items-center gap-1 text-muted-foreground text-xs">
                          <Calendar className="w-3 h-3" />
                          <span>{formatRelativeTime(page.created_at)}</span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>

              {pages.length > ITEMS_PER_PAGE && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Full page skeleton for Suspense fallback - matches PageCreatorPageContent structure
function PageCreatorSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {/* Header with title and button */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="h-8 w-36 bg-muted rounded animate-pulse mb-1" />
              <div className="h-4 w-64 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          </div>
          {/* Pages grid */}
          <PagesListSkeleton />
        </div>
      </div>
    </div>
  );
}

export default function PageCreatorPage() {
  return (
    <Suspense fallback={<PageCreatorSkeleton />}>
      <PageCreatorPageContent />
    </Suspense>
  );
}
