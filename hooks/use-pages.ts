import { useState, useCallback } from 'react';
import { pagesApi } from '@/lib/api';
import { AppErrorHandler, withErrorHandling } from '@/lib/utils/error-handler';
import type { PageWithAuthor, CreatePageFormData } from '@/lib/types';

interface UsePagesState {
  pages: PageWithAuthor[];
  currentPage: PageWithAuthor | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;
}

interface UsePagesReturn extends UsePagesState {
  loadPages: () => Promise<void>;
  loadPage: (pageId: string) => Promise<void>;
  createPage: (data: CreatePageFormData, authorId: string) => Promise<PageWithAuthor | null>;
  updatePage: (pageId: string, data: Partial<CreatePageFormData>) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  addPageToState: (page: PageWithAuthor) => void;
  clearError: () => void;
}

export const usePages = (): UsePagesReturn => {
  const [state, setState] = useState<UsePagesState>({
    pages: [],
    currentPage: null,
    loading: false,
    error: null,
    submitting: false,
  });

  const loadPages = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const { data, error } = await withErrorHandling(
      () => pagesApi.getAll(),
      AppErrorHandler.handleApiError,
      'usePages.loadPages'
    );

    setState(prev => ({
      ...prev,
      loading: false,
      pages: data || [],
      error: error ? AppErrorHandler.getErrorMessage(error) : null,
    }));
  }, []);

  const loadPage = useCallback(async (pageId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const { data, error } = await withErrorHandling(
      () => pagesApi.getById(pageId),
      AppErrorHandler.handlePageError,
      'usePages.loadPage'
    );

    setState(prev => ({
      ...prev,
      loading: false,
      currentPage: data || null,
      error: error ? AppErrorHandler.getErrorMessage(error) : null,
    }));
  }, []);

  const createPage = useCallback(async (
    data: CreatePageFormData, 
    authorId: string
  ): Promise<PageWithAuthor | null> => {
    setState(prev => ({ ...prev, submitting: true, error: null }));

    const { data: page, error } = await withErrorHandling(
      () => pagesApi.create({
        ...data,
        authorId,
      }),
      AppErrorHandler.handlePageError,
      'usePages.createPage'
    );

    setState(prev => ({
      ...prev,
      submitting: false,
      error: error ? AppErrorHandler.getErrorMessage(error) : null,
    }));

    return page || null;
  }, []);

  const updatePage = useCallback(async (pageId: string, data: Partial<CreatePageFormData>) => {
    setState(prev => ({ ...prev, submitting: true, error: null }));

    const { error } = await withErrorHandling(
      () => pagesApi.update(pageId, { ...data, userId: 'current-user-id' }), // TODO: Get actual user ID
      AppErrorHandler.handlePageError,
      'usePages.updatePage'
    );

    setState(prev => ({
      ...prev,
      submitting: false,
      error: error ? AppErrorHandler.getErrorMessage(error) : null,
    }));

    // Reload the current page if it's the one being updated
    if (state.currentPage?.id === pageId) {
      await loadPage(pageId);
    }
  }, [state.currentPage?.id, loadPage]);

  const deletePage = useCallback(async (pageId: string) => {
    setState(prev => ({ ...prev, submitting: true, error: null }));

    const { error } = await withErrorHandling(
      () => pagesApi.delete(pageId, 'current-user-id'), // TODO: Get actual user ID
      AppErrorHandler.handleApiError,
      'usePages.deletePage'
    );

    setState(prev => ({
      ...prev,
      submitting: false,
      error: error ? AppErrorHandler.getErrorMessage(error) : null,
    }));

    // Remove from pages list
    if (!error) {
      setState(prev => ({
        ...prev,
        pages: prev.pages.filter(page => page.id !== pageId),
        currentPage: prev.currentPage?.id === pageId ? null : prev.currentPage,
      }));
    }
  }, []);

  const addPageToState = useCallback((page: PageWithAuthor) => {
    setState(prev => ({
      ...prev,
      pages: [page, ...prev.pages],
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    loadPages,
    loadPage,
    createPage,
    updatePage,
    deletePage,
    addPageToState,
    clearError,
  };
};
