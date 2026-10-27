import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { InsecureTransportBanner } from '@/components/layout/InsecureTransportBanner';
import {
  SettingsSidebar,
  type SettingsGroup,
} from '@/components/layout/SettingsSidebar';
import { useAuthStatus } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export function SettingsLayout({
  group,
  title,
  description,
  children,
}: {
  group: SettingsGroup;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuthStatus();
  const [sheetOpen, setSheetOpen] = useState(false);

  const close = () => navigate('/');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        closeLabel={t('settings.close')}
        className="settings-dialog-enter flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-xl bg-background p-0 text-foreground md:h-[91dvh] md:max-h-[1200px] md:w-[90vw] md:max-w-[1760px]"
      >
        <DialogTitle className="sr-only">{t('settings.title')}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <InsecureTransportBanner security={auth.data?.security} />
        <div className="flex min-h-0 flex-1">
          <aside className="hidden h-full w-[var(--settings-sidebar-width)] shrink-0 border-r md:block">
            <SettingsSidebar current={group} />
          </aside>

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent
              side="left"
              title={t('settings.title')}
              closeLabel={t('common.close')}
              className="w-[var(--settings-sidebar-width)] p-0"
            >
              <SettingsSidebar current={group} onNavigate={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3 md:hidden">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('nav.openMenu')}
                onClick={() => setSheetOpen(true)}
              >
                <Menu className="size-4" aria-hidden="true" />
              </Button>
              <p className="text-sm font-semibold">{t('settings.title')}</p>
              <div className="flex-1" />
            </div>

            <ScrollArea containerClassName="min-h-0 flex-1">
              <div className={cn('mx-auto w-full max-w-[800px] px-4 py-5 md:px-10 md:py-7')}>
                <header className="mb-5 pr-8">
                  <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                  <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
                </header>
                {children}
              </div>
            </ScrollArea>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
