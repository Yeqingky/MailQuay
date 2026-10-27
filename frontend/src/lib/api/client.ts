import createClient, { type Middleware } from 'openapi-fetch';
import type { paths, components } from './schema';
import { normalizeErrorBody, type ApiErrorDetail } from './errors';

export const CSRF_COOKIE = 'mailquay_csrf';

function readRuntimeConfig(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.__MAILQUAY_CONFIG__?.apiBaseUrl;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed.replace(/\/+$/, '');
}

export function resolveApiBaseUrl(): string {
  const runtime = normalizeBaseUrl(readRuntimeConfig());
  if (runtime) return runtime;
  const buildTime = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (buildTime) return buildTime;
  return '/api/v1';
}

export const API_BASE_URL = resolveApiBaseUrl();

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

const CSRF_STORAGE_KEY = 'mailquay_csrf';

export function storeCsrfToken(token: string | undefined): void {
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(CSRF_STORAGE_KEY, token);
}

export function clearCsrfToken(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

export function readCsrfToken(): string | undefined {
  if (typeof window !== 'undefined') {
    const stored = window.sessionStorage.getItem(CSRF_STORAGE_KEY);
    if (stored) return stored;
  }
  if (typeof document === 'undefined') return undefined;
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  if (!entry) return undefined;
  return decodeURIComponent(entry.slice(CSRF_COOKIE.length + 1));
}

function redirectTo(target: string): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === target) return;
  window.location.assign(target);
}

const csrfMiddleware: Middleware = {
  async onRequest({ request }) {
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
      const token = readCsrfToken();
      if (token) request.headers.set('X-CSRF-Token', token);
    }
    if (
      request.headers.get('content-type') === null &&
      request.body !== null &&
      !(request.body instanceof FormData)
    ) {
      request.headers.set('Content-Type', 'application/json');
    }
    return request;
  },
  async onResponse({ request, response }) {
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const url = new URL(request.url, origin);
    const authEntry =
      url.pathname.endsWith('/auth/login') || url.pathname.endsWith('/auth/setup');
    if (response.status === 401 && !authEntry) {
      clearCsrfToken();
      redirectTo('/login');
    }
    if (response.status === 409) {
      const body = await response.clone().json().catch(() => undefined);
      const detail = normalizeErrorBody(body, response.status);
      if (detail.code === 'setup_required' || url.pathname.endsWith('/auth/me')) {
        redirectTo('/setup');
      }
    }
    if (!response.ok) {
      const body = await response.json().catch(() => undefined);
      const detail = normalizeErrorBody(body, response.status);
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json');
      return new Response(
        JSON.stringify({
          error: {
            code: detail.code,
            message: detail.message,
            details: detail.details,
            requestId: detail.requestId,
          },
        }),
        { status: response.status, headers },
      );
    }
    return response;
  },
};

export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  headers: {
    Accept: 'application/json',
  },
});

api.use(csrfMiddleware);

export type Schemas = components['schemas'];
export type ApiResult<T> =
  | { data: T; error?: undefined; response: Response }
  | { data?: undefined; error: { error: ApiErrorDetail }; response: Response };

/**
 * Convert an openapi-fetch result into either data or a thrown ApiError.
 * Feature api modules use this so components never inspect transport details.
 */
export function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (result.error !== undefined) {
    throw normalizeErrorBody(result.error, result.response.status);
  }
  if (result.data === undefined) {
    if (result.response.status === 204) return undefined as T;
    throw normalizeErrorBody(undefined, result.response.status);
  }
  return result.data;
}
