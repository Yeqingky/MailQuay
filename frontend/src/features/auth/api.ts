import { api, clearCsrfToken, storeCsrfToken, unwrap, type Schemas } from '@/lib/api/client';

export type AuthStatus = Schemas['AuthStatus'];
export type User = Schemas['User'];

export const authKeys = {
  me: ['auth', 'me'] as const,
};

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const status = unwrap(await api.GET('/auth/me'));
  if (status.csrfToken) storeCsrfToken(status.csrfToken);
  return status;
}

export async function loginRequest(body: Schemas['LoginRequest']): Promise<Schemas['AuthResponse']> {
  const result = unwrap(await api.POST('/auth/login', { body }));
  storeCsrfToken(result.csrfToken);
  return result;
}

export async function logoutRequest(): Promise<void> {
  const result = await api.POST('/auth/logout');
  clearCsrfToken();
  if (result.response.ok) return;
  unwrap(result);
}

export async function setupOwner(body: Schemas['SetupRequest']): Promise<Schemas['AuthResponse']> {
  const result = unwrap(await api.POST('/auth/setup', { body }));
  storeCsrfToken(result.csrfToken);
  return result;
}

export async function updateProfile(body: Schemas['UpdateProfileRequest']): Promise<User> {
  return unwrap(await api.PATCH('/auth/me', { body }));
}

export async function changePassword(body: Schemas['ChangePasswordRequest']): Promise<void> {
  const result = await api.POST('/auth/password', { body });
  if (result.response.ok) return;
  unwrap(result);
}
