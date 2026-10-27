import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('app.notFoundTitle'));

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-semibold tracking-tight text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold tracking-tight">{t('app.notFoundTitle')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('app.notFoundBody')}</p>
      <Button asChild variant="outline" size="sm">
        <Link to="/">{t('common.back')}</Link>
      </Button>
    </main>
  );
}
