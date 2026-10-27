import i18n from '@/lib/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSettings, updateSettings, type Settings } from '@/features/settings/api';
import { OAuthSettingsPage } from './OAuthPage';

vi.mock('@/features/settings/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/settings/api')>();
  return { ...actual, fetchSettings: vi.fn(), updateSettings: vi.fn() };
});

function makeSettings(): Settings {
  return {
    googleClientId: 'google-id',
    microsoftClientId: 'microsoft-id',
    googleSecretSet: true,
    microsoftSecretSet: false,
  } as unknown as Settings;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OAuthSettingsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(fetchSettings).mockReset().mockResolvedValue(makeSettings());
  vi.mocked(updateSettings).mockReset().mockResolvedValue(makeSettings());
});

describe('OAuthSettingsPage', () => {
  it('saves the client ids and leaves untouched secrets out of the request', async () => {
    const user = userEvent.setup();
    renderPage();

    const googleId = await screen.findByLabelText(i18n.t('settings.oauth.googleClientId'));
    expect(googleId).toHaveValue('google-id');
    expect(screen.getByText(i18n.t('settings.oauth.secretSet'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('settings.oauth.secretNotSet'))).toBeInTheDocument();

    await user.clear(googleId);
    await user.type(googleId, ' google-id-2 ');
    await user.click(screen.getByRole('button', { name: i18n.t('settings.oauth.save') }));

    await waitFor(() => {
      expect(vi.mocked(updateSettings)).toHaveBeenCalledWith({
        googleClientId: 'google-id-2',
        microsoftClientId: 'microsoft-id',
      });
    });
  });

  it('sends a rotated secret and clears the field after saving', async () => {
    const user = userEvent.setup();
    renderPage();

    const secret = await screen.findByLabelText(i18n.t('settings.oauth.googleClientSecret'));
    await user.type(secret, 'new-google-secret');
    await user.click(screen.getByRole('button', { name: i18n.t('settings.oauth.save') }));

    await waitFor(() => {
      expect(vi.mocked(updateSettings)).toHaveBeenCalledWith({
        googleClientId: 'google-id',
        microsoftClientId: 'microsoft-id',
        googleClientSecret: 'new-google-secret',
      });
    });
    await waitFor(() => {
      expect(secret).toHaveValue('');
    });
  });
});
