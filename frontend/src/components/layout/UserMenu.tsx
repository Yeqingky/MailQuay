import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LogOut, Settings, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { logoutRequest } from '@/features/auth/api';
import { useAuthStatus } from '@/hooks/useAuth';
import { initials } from '@/lib/format';

export function UserMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const { data } = useAuthStatus();
  const user = data?.user;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      queryClient.removeQueries();
      navigate('/login', { replace: true });
    },
  });

  const openCard = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };

  const closeCardSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  if (!user) {
    return (
      <Button variant="ghost" size="icon" aria-label={t('auth.noAccount')} disabled>
        <UserRound className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  const display = user.displayName || user.username;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('topbar.openUserMenu')}
          onClick={(event) => {
            event.preventDefault();
            openCard();
          }}
          onPointerEnter={openCard}
          onPointerLeave={closeCardSoon}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar className="size-8 border">
            <AvatarFallback>{initials(display)}</AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="user-menu-enter w-56 p-2.5"
        onPointerEnter={openCard}
        onPointerLeave={closeCardSoon}
      >
        <div className="flex items-center gap-2.5 px-1 py-0.5">
          <Avatar className="size-9 border">
            <AvatarFallback>{initials(display)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{display}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.username}</p>
          </div>
        </div>
        <p className="sr-only">{t('topbar.currentUser')}</p>
        <Separator className="my-2" />
        <div className="space-y-0.5">
          <Button
            variant="ghost"
            className="h-7 w-full justify-start gap-1.5 px-2 text-[13px]"
            size="sm"
            asChild
          >
            <Link to="/settings/account">
              <UserRound aria-hidden="true" />
              {t('topbar.profile')}
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="h-7 w-full justify-start gap-1.5 px-2 text-[13px]"
            size="sm"
            asChild
          >
            <Link to="/settings">
              <Settings aria-hidden="true" />
              {t('topbar.settings')}
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="h-7 w-full justify-start gap-1.5 px-2 text-[13px] text-destructive hover:text-destructive"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut aria-hidden="true" />
            {t('topbar.signOut')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
