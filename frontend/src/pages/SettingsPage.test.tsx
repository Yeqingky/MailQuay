import i18n from '@/lib/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAuthStatus, type AuthStatus } from '@/features/auth/api';
import { SettingsPage } from './SettingsPage';

vi.mock('@/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/api')>();
  return {
    ...actual,
    changePassword: vi.fn(),
    fetchAuthStatus: vi.fn(),
    updateProfile: vi.fn(),
  };
});

function Location() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderSettings(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/:group" element={<SettingsPage />} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  const status: AuthStatus = {
    needsSetup: false,
    user: {
      id: 'user-1',
      username: 'owner',
      displayName: 'Owner',
      locale: 'en',
      theme: 'system',
    },
    security: { insecureTransport: false, scheme: 'https', host: 'localhost' },
  };
  vi.mocked(fetchAuthStatus).mockReset().mockResolvedValue(status);
});

describe('SettingsPage', () => {
  it('opens the profile group by default and focuses the search box', async () => {
    renderSettings('/settings');

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/settings/account');
    });
    expect(screen.getByRole('heading', { name: i18n.t('settings.account.title') })).toBeInTheDocument();
    expect(screen.getByLabelText(i18n.t('settings.search'))).toHaveFocus();
  });

  it('focuses the search box on deep links', async () => {
    renderSettings('/settings/mail');

    const search = screen.getByLabelText(i18n.t('settings.search'));
    await waitFor(() => {
      expect(search).toHaveFocus();
    });
  });
});
