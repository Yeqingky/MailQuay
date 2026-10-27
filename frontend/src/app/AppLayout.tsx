import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { PaneResizeHandle } from '@/components/ui/pane-resize-handle';
import { InsecureTransportBanner } from '@/components/layout/InsecureTransportBanner';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { useAuthStatus } from '@/hooks/useAuth';
import { useEventStream } from '@/lib/events/useEventStream';
import {
  LIST_MIN_WIDTH,
  PANE_RESIZE_HANDLE_WIDTH,
  READER_MIN_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '@/lib/paneLayout';
import { isSettingsPath, mailViewFromPathname } from '@/lib/routes';
import { ComposeOverlay } from '@/features/compose/ComposeOverlay';
import { MailPage } from '@/pages/MailPage';
import { useComposeStore } from '@/stores/compose';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { pathname } = useLocation();
  const settingsOpen = isSettingsPath(pathname);
  const currentView = mailViewFromPathname(pathname);
  const auth = useAuthStatus();
  useEventStream(true);
  const composeOpen = useComposeStore((state) => state.isOpen);
  const seed = useComposeStore((state) => state.seed);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const sidebarStyle = { '--sidebar-width': `${sidebarWidth}px` } as CSSProperties;

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
      style={sidebarStyle}
    >
      <InsecureTransportBanner security={auth.data?.security} />
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'hidden h-full w-[var(--sidebar-width)] shrink-0 border-r md:block',
          )}
        >
          <Sidebar currentView={currentView} />
        </aside>

        <PaneResizeHandle
          width={sidebarWidth}
          min={SIDEBAR_MIN_WIDTH}
          reserve={LIST_MIN_WIDTH + READER_MIN_WIDTH + PANE_RESIZE_HANDLE_WIDTH * 2}
          label={t('nav.resizeSidebar')}
          onResize={setSidebarWidth}
        />
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="left"
            title={t('nav.navigation')}
            closeLabel={t('common.close')}
            className="w-[var(--sidebar-width)] p-0"
          >
            <Sidebar currentView={currentView} onNavigate={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenNav={() => setSheetOpen(true)} />
          <main id="main-content" className="flex min-h-0 flex-1 flex-col">
            {settingsOpen ? <MailPage /> : <Outlet />}
          </main>
        </div>
      </div>
      {settingsOpen ? <Outlet /> : null}
      {composeOpen ? <ComposeOverlay seed={seed} /> : null}
    </div>
  );
}
