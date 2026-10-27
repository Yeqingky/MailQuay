import { apiUrl } from '@/lib/api/client';

export interface AvatarSources {
  gravatar: boolean;
  bimi: boolean;
  favicon: boolean;
}

export function avatarUrl(email: string, sources: AvatarSources, size = 80): string | null {
  const value = email.trim();
  if (!value || (!sources.gravatar && !sources.bimi && !sources.favicon)) return null;

  const params = new URLSearchParams({
    email: value,
    gravatar: sources.gravatar ? 'true' : 'false',
    bimi: sources.bimi ? 'true' : 'false',
    favicon: sources.favicon ? 'true' : 'false',
    size: String(size),
  });
  return apiUrl(`/avatars?${params.toString()}`);
}
