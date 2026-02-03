'use client';

import React from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Hash } from 'lucide-react';
import type { PageWithAuthor } from '@/lib/types';
import { formatDate, formatNumber } from '@/lib/format';

interface PageInfoProps {
  page: PageWithAuthor;
  commentCount: number;
}

export const PageInfo: React.FC<PageInfoProps> = ({ page, commentCount }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Hash className="h-5 w-5 text-muted-foreground" />
          <CardTitle>{page.title}</CardTitle>
        </div>
        <p className="text-muted-foreground">{page.description}</p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Created by {page.author?.username || 'Unknown'}</span>
          
          <span>{formatDate(page.created_at)}</span>
          
          <span>{formatNumber(commentCount, 0)} replies</span>
        </div>
      </CardHeader>
    </Card>
  );
};
