import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import {
  Menu,
  PenLine,
  RefreshCw,
  Search,
  X,
  MoreHorizontal,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useComposeLauncher } from '@/features/compose/useComposeLauncher';
import { requestAllSync, requestMailboxSync } from '@/features/mailboxes/api';
import { taskKeys } from '@/features/tasks/api';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { toast } from '@/components/ui/toast';
import { mailViewFromPathname } from '@/lib/routes';
import { useSearchStore } from '@/stores/search';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const view = mailViewFromPathname(pathname);
  const message = useErrorMessage();
  const queryClient = useQueryClient();
  const { launch } = useComposeLauncher();
  const setQuery = useSearchStore((state) => state.setQuery);
  const applySearch = useSearchStore((state) => state.apply);
  const currentQuery = useSearchStore((state) => state.filters.q);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQueryValue] = useState(currentQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setQuery(query.trim());
    applySearch();
    navigate('/search');
  };

  // Refresh asks the server for new mail instead of refetching cached client
  // state: global views sync every account, a folder syncs its account, and
  // the task center reloads the task list.
  const refresh = async () => {
    setRefreshing(true);
    try {
      if (view === 'tasks') {
        await queryClient.refetchQueries({ queryKey: taskKeys.list });
      } else {
        const mailboxId = pathname.match(/^\/accounts\/[^/]+\/mailboxes\/([^/]+)\/?$/)?.[1];
        if (view === 'folder' && mailboxId) {
          await requestMailboxSync(decodeURIComponent(mailboxId));
        } else {
          await requestAllSync();
        }
      }
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
    } catch (error) {
      toast(t('topbar.refreshFailed'), { description: message(error), variant: 'destructive' });
    } finally {
      window.setTimeout(() => setRefreshing(false), 400);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:h-16 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label={t('nav.openMenu')}
        onClick={onOpenNav}
      >
        <Menu className="size-4" aria-hidden="true" />
      </Button>

      {view !== 'tasks' ? (
        <Button onClick={() => void launch({ mode: 'new' })} size="sm" className="gap-2 md:h-9">
          <PenLine className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('topbar.compose')}</span>
          <span className="sr-only sm:hidden">{t('topbar.compose')}</span>
        </Button>
      ) : null}

      <div className="flex-1" />

      {view !== 'tasks' ? (
        <div className="relative flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('topbar.search')}
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen((open) => !open)}
              >
                <Search className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('topbar.search')}</TooltipContent>
          </Tooltip>
          {searchOpen ? (
            <form
              onSubmit={submitSearch}
              className="absolute right-0 top-[calc(100%+0.5rem)] z-40 flex w-[min(28rem,calc(100vw-2rem))] items-center gap-2 rounded-lg border bg-popover p-2 shadow-lg"
              role="search"
            >
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQueryValue(event.target.value)}
                placeholder={t('topbar.searchPlaceholder')}
                aria-label={t('topbar.search')}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSearchOpen(false);
                }}
              />
              <Button type="submit" size="sm">
                {t('topbar.submitSearch')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('topbar.closeSearch')}
                onClick={() => setSearchOpen(false)}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="hidden md:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={view === 'tasks' ? t('topbar.refresh') : t('topbar.fetchMail')}
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{view === 'tasks' ? t('topbar.refresh') : t('topbar.fetchMail')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="hidden md:flex">
        <ThemeToggle />
      </div>

      <UserMenu />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('common.more')}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void refresh()} disabled={refreshing}>
            <RefreshCw aria-hidden="true" />
            {view === 'tasks' ? t('topbar.refresh') : t('topbar.fetchMail')}
          </DropdownMenuItem>
          {view !== 'tasks' ? (
            <DropdownMenuItem onSelect={() => setSearchOpen(true)}>
              <Search aria-hidden="true" />
              {t('topbar.search')}
            </DropdownMenuItem>
          ) : null}
          <div className="border-t px-1 pt-1">
            <ThemeToggle />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
