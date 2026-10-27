import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { KeyRound, Loader2, Mail, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InsecureTransportBanner } from '@/components/layout/InsecureTransportBanner';
import { LoadingState } from '@/components/common/States';
import { authKeys, setupOwner } from '@/features/auth/api';
import { useAuthStatus } from '@/hooks/useAuth';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { isApiError } from '@/lib/api/errors';

export function SetupPage() {
  const { t } = useTranslation();
  const auth = useAuthStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const message = useErrorMessage();
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(t('auth.setupTitle'));

  const setup = useMutation({
    mutationFn: setupOwner,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
      navigate('/', { replace: true });
    },
    onError: (setupError) => setError(message(setupError)),
  });

  useEffect(() => {
    if (auth.data?.needsSetup === false) {
      navigate(auth.data.user ? '/' : '/login', { replace: true });
    }
  }, [auth.data?.needsSetup, auth.data?.user, navigate]);

  const setupRequired = auth.isError && isApiError(auth.error) && auth.error.status === 409;

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <InsecureTransportBanner security={auth.data?.security} />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Mail className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">MailQuay</p>
              <p className="text-xs text-muted-foreground">{t('app.tagline')}</p>
            </div>
          </div>

          <h1 className="text-xl font-semibold tracking-tight">{t('auth.setupTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('auth.setupSubtitle')}</p>

          {auth.isPending && !setupRequired ? (
            <LoadingState className="min-h-48" />
          ) : (
            <form
              className="mt-5 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                if (password !== confirm) {
                  setError(t('settings.account.passwordMismatch'));
                  return;
                }
                if (password.length < 8) {
                  setError(t('settings.account.passwordTooShort'));
                  return;
                }
                setup.mutate({ token: token.trim(), username: username.trim(), password });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="setup-token">{t('auth.setupToken')}</Label>
                <Input
                  id="setup-token"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  required
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-[11px] text-muted-foreground">{t('auth.setupTokenHint')}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-username">{t('auth.username')}</Label>
                <Input
                  id="setup-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-password">{t('auth.password')}</Label>
                <Input
                  id="setup-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-confirm">{t('settings.account.confirmPassword')}</Label>
                <Input
                  id="setup-confirm"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              {error ? (
                <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full gap-2" disabled={setup.isPending}>
                {setup.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="size-4" aria-hidden="true" />
                )}
                {setup.isPending ? t('auth.creatingOwner') : t('auth.createOwner')}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
