import { ERROR_MESSAGES } from '@/lib/config/app-config';
import type { ApiError, AppError } from '@/lib/types';

export class AppErrorHandler {
  static createError(message: string, code?: string, details?: any): AppError {
    return {
      message,
      code,
      details,
    };
  }

  static createApiError(status: number, message: string, details?: string): ApiError {
    return {
      status,
      message,
      details,
    };
  }

  static handleApiError(error: any): AppError {
    if (error instanceof Error) {
      // Network or fetch errors
      if (error.message.includes('fetch')) {
        return this.createError(
          ERROR_MESSAGES.api.networkError,
          'NETWORK_ERROR',
          error.message
        );
      }

      // Generic errors
      return this.createError(
        error.message,
        'UNKNOWN_ERROR',
        error.stack
      );
    }

    // API response errors
    if (error.status && error.message) {
      return this.createError(
        error.message,
        `API_ERROR_${error.status}`,
        error.details
      );
    }

    // Fallback
    return this.createError(
      ERROR_MESSAGES.api.serverError,
      'UNKNOWN_ERROR',
      error
    );
  }

  static handleAuthError(error: any): AppError {
    if (error.message?.includes('session')) {
      return this.createError(
        ERROR_MESSAGES.auth.sessionExpired,
        'SESSION_EXPIRED',
        error
      );
    }

    if (error.message?.includes('wallet')) {
      return this.createError(
        ERROR_MESSAGES.auth.walletNotConnected,
        'WALLET_NOT_CONNECTED',
        error
      );
    }

    return this.createError(
      ERROR_MESSAGES.auth.notAuthenticated,
      'AUTH_ERROR',
      error
    );
  }

  static handleValidationError(field: string, value: any): AppError {
    const fieldErrors: Record<string, string> = {
      content: ERROR_MESSAGES.comments.contentRequired,
      title: ERROR_MESSAGES.pages.titleRequired,
      description: ERROR_MESSAGES.pages.descriptionRequired,
    };

    return this.createError(
      fieldErrors[field] || 'Invalid input provided',
      'VALIDATION_ERROR',
      { field, value }
    );
  }

  static handleCommentError(error: any): AppError {
    if (error.message?.includes('content')) {
      return this.createError(
        ERROR_MESSAGES.comments.contentRequired,
        'CONTENT_REQUIRED',
        error
      );
    }

    if (error.message?.includes('page')) {
      return this.createError(
        ERROR_MESSAGES.comments.pageNotFound,
        'PAGE_NOT_FOUND',
        error
      );
    }

    if (error.message?.includes('parent')) {
      return this.createError(
        ERROR_MESSAGES.comments.parentNotFound,
        'PARENT_NOT_FOUND',
        error
      );
    }

    return this.handleApiError(error);
  }

  static handlePageError(error: any): AppError {
    if (error.message?.includes('title')) {
      return this.createError(
        ERROR_MESSAGES.pages.titleRequired,
        'TITLE_REQUIRED',
        error
      );
    }

    if (error.message?.includes('description')) {
      return this.createError(
        ERROR_MESSAGES.pages.descriptionRequired,
        'DESCRIPTION_REQUIRED',
        error
      );
    }

    return this.handleApiError(error);
  }

  static handleAwardError(error: any): AppError {
    if (error.message?.includes('points')) {
      return this.createError(
        ERROR_MESSAGES.awards.insufficientPoints,
        'INSUFFICIENT_POINTS',
        error
      );
    }

    if (error.message?.includes('award')) {
      return this.createError(
        ERROR_MESSAGES.awards.awardNotFound,
        'AWARD_NOT_FOUND',
        error
      );
    }

    return this.handleApiError(error);
  }

  static logError(error: AppError, context?: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[${context || 'App'}] Error:`, {
        message: error.message,
        code: error.code,
        details: error.details,
      });
    }
  }

  static isRetryableError(error: AppError): boolean {
    const retryableCodes = [
      'NETWORK_ERROR',
      'API_ERROR_500',
      'API_ERROR_502',
      'API_ERROR_503',
      'API_ERROR_504',
    ];

    return retryableCodes.includes(error.code || '');
  }

  static getErrorMessage(error: AppError): string {
    return error.message || ERROR_MESSAGES.api.serverError;
  }

  static getErrorCode(error: AppError): string {
    return error.code || 'UNKNOWN_ERROR';
  }
}

// Utility function for handling async operations with error handling
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorHandler: (error: any) => AppError,
  context?: string
): Promise<{ data?: T; error?: AppError }> {
  try {
    const data = await operation();
    return { data };
  } catch (error) {
    const appError = errorHandler(error);
    AppErrorHandler.logError(appError, context);
    return { error: appError };
  }
}

// Utility function for handling API calls with retry logic
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }

      // Only retry on retryable errors
      const appError = AppErrorHandler.handleApiError(error);
      if (!AppErrorHandler.isRetryableError(appError)) {
        throw error;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
    }
  }

  throw lastError;
}
