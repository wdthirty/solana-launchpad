import { useState, useCallback } from 'react';
import { discussionsApi } from '@/lib/api';
import { AppErrorHandler, withErrorHandling } from '@/lib/utils/error-handler';
import type { DiscussionWithAuthor, DiscussionFormData, VoteData } from '@/lib/types';

interface UseDiscussionsState {
  discussions: DiscussionWithAuthor[];
  loading: boolean;
  error: string | null;
  submitting: boolean;
}

interface UseDiscussionsReturn extends UseDiscussionsState {
  loadDiscussions: (pageId: string) => Promise<void>;
  createDiscussion: (data: DiscussionFormData) => Promise<DiscussionWithAuthor | null>;
  voteOnDiscussion: (discussionId: string, voteData: VoteData) => Promise<void>;
  updateDiscussionInState: (discussionId: string, updates: Partial<DiscussionWithAuthor>) => void;
  addDiscussionToState: (discussion: DiscussionWithAuthor, parentId?: string) => void;
  clearError: () => void;
}

export const useDiscussions = (): UseDiscussionsReturn => {
  const [state, setState] = useState<UseDiscussionsState>({
    discussions: [],
    loading: false,
    error: null,
    submitting: false,
  });

  const loadDiscussions = useCallback(async (pageId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const { data, error } = await withErrorHandling(
      () => discussionsApi.getByPageId(pageId),
      AppErrorHandler.handleApiError,
      'useDiscussions.loadDiscussions'
    );

    setState(prev => ({
      ...prev,
      loading: false,
      discussions: data || [],
      error: error ? AppErrorHandler.getErrorMessage(error) : null,
    }));
  }, []);

  const createDiscussion = useCallback(async (data: DiscussionFormData): Promise<DiscussionWithAuthor | null> => {
    setState(prev => ({ ...prev, submitting: true, error: null }));

    const { data: discussion, error } = await withErrorHandling(
      () => discussionsApi.create(data),
      AppErrorHandler.handleApiError,
      'useDiscussions.createDiscussion'
    );

    setState(prev => ({
      ...prev,
      submitting: false,
      error: error ? AppErrorHandler.getErrorMessage(error) : null,
    }));

    return discussion || null;
  }, []);

  const voteOnDiscussion = useCallback(async (discussionId: string, voteData: VoteData) => {
    const { error } = await withErrorHandling(
      () => discussionsApi.vote(discussionId, voteData),
      AppErrorHandler.handleApiError,
      'useDiscussions.voteOnDiscussion'
    );

    if (error) {
      setState(prev => ({
        ...prev,
        error: AppErrorHandler.getErrorMessage(error),
      }));
    }
  }, []);

  const updateDiscussionInState = useCallback((discussionId: string, updates: Partial<DiscussionWithAuthor>) => {
    const updateDiscussionRecursively = (discussion: DiscussionWithAuthor): DiscussionWithAuthor => {
      if (discussion.id === discussionId) {
        return { ...discussion, ...updates };
      }

      if (discussion.replies) {
        return {
          ...discussion,
          replies: discussion.replies.map(updateDiscussionRecursively),
        };
      }

      return discussion;
    };

    setState(prev => ({
      ...prev,
      discussions: prev.discussions.map(updateDiscussionRecursively),
    }));
  }, []);

  const addDiscussionToState = useCallback((discussion: DiscussionWithAuthor, parentId?: string) => {
    if (!parentId) {
      // Add as top-level discussion
      setState(prev => ({
        ...prev,
        discussions: [discussion, ...prev.discussions],
      }));
      return;
    }

    // Add as reply to existing discussion
    const addReplyRecursively = (d: DiscussionWithAuthor): DiscussionWithAuthor => {
      if (d.id === parentId) {
        return {
          ...d,
          replies: [...(d.replies || []), discussion],
        };
      }

      if (d.replies) {
        return {
          ...d,
          replies: d.replies.map(addReplyRecursively),
        };
      }

      return d;
    };

    setState(prev => ({
      ...prev,
      discussions: prev.discussions.map(addReplyRecursively),
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    loadDiscussions,
    createDiscussion,
    voteOnDiscussion,
    updateDiscussionInState,
    addDiscussionToState,
    clearError,
  };
};
