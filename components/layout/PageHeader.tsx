import * as React from 'react';
import { Separator } from '@/components/ui/separator';

interface PageHeaderProps {
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

export function PageHeader({ leftContent, rightContent }: PageHeaderProps) {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <div className="flex items-center gap-2 flex-1">
          {leftContent}
        </div>
        <div className="flex items-center gap-2">
          {rightContent}
        </div>
      </header>
    </>
  );
}
