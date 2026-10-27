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
import { authKeys, loginRequest } from '@/features/auth/api';
import { useAuthStatus } from '@/hooks/useAuth';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { applyLanguage } from '@/lib/i18n';
import { API_BASE_URL } from '@/lib/api/client';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuthStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const message = useErrorMessage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(t('auth.loginTitle'));

  const login = useMutation({
    mutationFn: loginRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
      navigate('/', { replace: true });
    },
    onError: (loginError) => setError(message(loginError)),
  });

  useEffect(() => {
    if (auth.data?.needsSetup) navigate('/setup', { replace: true });
    else if (auth.data?.user) navigate('/', { replace: true });
  }, [auth.data?.needsSetup, auth.data?.user, navigate]);

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <InsecureTransportBanner security={auth.data?.security} />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Mail className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">MailQuay</p>
              <p className="text-xs text-muted-foreground">{t('app.tagline')}</p>
            </div>
          </div>

          <h1 className="text-xl font-semibold tracking-tight">{t('auth.loginTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('auth.loginSubtitle')}</p>

          {auth.isPending ? (
            <LoadingState className="min-h-40" />
          ) : (
            <form
              className="mt-5 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                login.mutate({ username: username.trim(), password });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="login-username">{t('auth.username')}</Label>
                <Input
                  id="login-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">{t('auth.password')}</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {error ? (
                <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full gap-2" disabled={login.isPending}>
                {login.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="size-4" aria-hidden="true" />
                )}
                {login.isPending ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
            </form>
          )}

          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                applyLanguage(i18n.language === 'zh-CN' ? 'en' : 'zh-CN');
              }}
            >
              {t('common.languageSwitch')}
            </button>
            <span className="text-[10px] text-muted-foreground">{API_BASE_URL}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
