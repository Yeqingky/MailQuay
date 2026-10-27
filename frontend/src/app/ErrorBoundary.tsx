import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface BoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('MailQuay UI error', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function ErrorFallback() {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t('app.unexpectedError')}</h1>
        <p className="text-sm text-muted-foreground">{t('app.reload')}</p>
      </div>
      <Button onClick={() => window.location.reload()}>{t('app.reload')}</Button>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  return <Boundary fallback={<ErrorFallback />}>{children}</Boundary>;
}
