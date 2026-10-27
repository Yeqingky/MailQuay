import type { components } from './schema';

export type ApiErrorBody = components['schemas']['ErrorResponse'];
export type ApiErrorDetail = ApiErrorBody['error'];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = detail.code;
    this.details = detail.details;
    this.requestId = detail.requestId;
  }
}

export function unknownApiError(status: number): ApiError {
  return new ApiError(status, {
    code: 'unexpected_response',
    message: 'The server returned an unexpected response.',
  });
}

export function normalizeErrorBody(input: unknown, status: number): ApiError {
  if (typeof input === 'object' && input !== null && 'error' in input) {
    const error = input.error;
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
      const { code, message } = error;
      if (typeof code === 'string' && typeof message === 'string') {
        return new ApiError(status, {
          code,
          message,
          details: 'details' in error && typeof error.details === 'object' && error.details !== null
            ? (error.details as Record<string, unknown>)
            : undefined,
          requestId:
            'requestId' in error && typeof error.requestId === 'string' ? error.requestId : undefined,
        });
      }
    }
  }
  return unknownApiError(status);
}

export function toApiError(error: unknown, status = 0): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) {
    return new ApiError(status, { code: 'network_error', message: error.message });
  }
  return unknownApiError(status);
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
