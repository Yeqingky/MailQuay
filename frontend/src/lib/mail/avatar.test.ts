import { describe, expect, it } from 'vitest';
import { avatarUrl } from './avatar';

describe('avatar URL', () => {
  it('builds a backend avatar URL with all sources', () => {
    expect(
      avatarUrl(' notifications@github.com ', { gravatar: true, bimi: true, favicon: true }),
    ).toBe(
      '/api/v1/avatars?email=notifications%40github.com&gravatar=true&bimi=true&favicon=true&size=80',
    );
  });

  it('marks disabled sources for the backend', () => {
    expect(
      avatarUrl('user@example.com', { gravatar: false, bimi: true, favicon: true }),
    ).toContain('gravatar=false&bimi=true&favicon=true');
  });

  it('does not request an avatar when all sources are disabled', () => {
    expect(
      avatarUrl('user@example.com', { gravatar: false, bimi: false, favicon: false }),
    ).toBeNull();
    expect(avatarUrl('', { gravatar: true, bimi: true, favicon: true })).toBeNull();
  });
});
