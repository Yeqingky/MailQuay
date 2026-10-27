import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { fetchSettings, settingsKeys } from '@/features/settings/api';
import { initials } from '@/lib/format';
import { avatarUrl } from '@/lib/mail/avatar';
import { cn } from '@/lib/utils';

export function SenderAvatar({
  email,
  name,
  fallback,
  className,
}: {
  email?: string | null;
  name?: string | null;
  fallback?: string | null;
  className?: string;
}) {
  const settingsQuery = useQuery({
    queryKey: settingsKeys.detail,
    queryFn: fetchSettings,
    staleTime: 60_000,
  });
  const settings = settingsQuery.data;
  const networkAvatars = settings?.networkAvatars === true;
  const gravatar = networkAvatars && settings?.gravatarAvatars === true;
  const bimi = networkAvatars && settings?.bimiAvatars === true;
  const favicon = networkAvatars && settings?.googleFaviconAvatars === true;
  const src = email ? avatarUrl(email, { gravatar, bimi, favicon }) : null;

  return (
    <Avatar className={cn('border', className)}>
      {src ? (
        <AvatarImage
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          crossOrigin="use-credentials"
        />
      ) : null}
      <AvatarFallback>{initials(name || email || fallback || '?')}</AvatarFallback>
    </Avatar>
  );
}
