// Pagination Component
// Shows current page indicator with prev/next navigation
// Created: 2025-10-18

'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  maxPageNumbers?: number;
}

/**
 * Pagination component showing current page with prev/next buttons
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-2 w-full">
      {/* First Page Button - only show when on page 3 or more */}
      {currentPage >= 3 && (
        <button
          onClick={() => onPageChange(1)}
          className="flex items-center gap-1 px-4 py-2 rounded-lg text-foreground cursor-pointer hover:bg-muted transition-colors"
          aria-label="First page"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
      )}

      {/* Previous Button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="flex items-center gap-1 px-4 py-2 rounded-lg text-foreground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-muted transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Current Page */}
      <span className="min-w-[40px] p-1 rounded-lg font-medium bg-primary text-primary-foreground shadow-lg text-center flex items-center justify-center">
        {currentPage}
      </span>

      {/* Next Button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="flex items-center gap-1 px-4 py-2 rounded-lg text-foreground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-muted transition-colors"
        aria-label="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
