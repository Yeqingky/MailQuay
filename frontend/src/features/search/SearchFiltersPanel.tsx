import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchMailboxTree } from '@/features/mailboxes/api';
import { useSearchStore, type AttachmentFilter, type SearchMode } from '@/stores/search';
import { cn } from '@/lib/utils';

const ALL = '__all__';
const ANY_ATTACHMENT = 'any';
const WITH_ATTACHMENT = 'with';
const WITHOUT_ATTACHMENT = 'without';

export function SearchFiltersPanel() {
  const { t } = useTranslation();
  const filters = useSearchStore((state) => state.filters);
  const setFilter = useSearchStore((state) => state.setFilter);
  const apply = useSearchStore((state) => state.apply);
  const reset = useSearchStore((state) => state.reset);
  const tree = useQuery({ queryKey: ['mailboxes', 'tree'], queryFn: fetchMailboxTree });

  const accountEntries = tree.data?.accounts ?? [];
  const folderOptions = accountEntries
    .filter((entry) => !filters.accountId || entry.account.id === filters.accountId)
    .flatMap((entry) =>
      [...entry.folders, ...entry.other].map((folder) => ({
        id: folder.id,
        label: `${entry.account.email} · ${folder.name}`,
      })),
    );

  const attachmentValue =
    filters.hasAttachment === 'with'
      ? WITH_ATTACHMENT
      : filters.hasAttachment === 'without'
        ? WITHOUT_ATTACHMENT
        : ANY_ATTACHMENT;

  return (
    <form
      className="shrink-0 border-b bg-background px-3 py-3 md:px-5"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      role="search"
      aria-label={t('search.title')}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor="search-query" className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('search.queryLabel')}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="search-query"
              value={filters.q}
              onChange={(event) => setFilter('q', event.target.value)}
              placeholder={t('search.queryPlaceholder')}
              className="pl-8"
            />
          </div>
        </div>
        <div role="group" aria-label={t('search.modeLabel')} className="flex items-center gap-1">
          {(['all', 'subject'] as SearchMode[]).map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={filters.mode === mode ? 'secondary' : 'ghost'}
              aria-pressed={filters.mode === mode}
              onClick={() => setFilter('mode', mode)}
            >
              {mode === 'all' ? t('search.modeAll') : t('search.modeSubject')}
            </Button>
          ))}
        </div>
        <Button type="submit" size="sm" className="gap-2">
          <Search className="size-4" aria-hidden="true" />
          {t('search.run')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-2"
          onClick={() => {
            reset();
          }}
        >
          <X className="size-4" aria-hidden="true" />
          {t('search.reset')}
        </Button>
      </div>

      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        {t('search.filtersTitle')}
      </div>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">{t('search.accountLabel')}</span>
          <Select
            value={filters.accountId || ALL}
            onValueChange={(value) => setFilter('accountId', value === ALL ? '' : value)}
          >
            <SelectTrigger aria-label={t('search.accountLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('common.allAccounts')}</SelectItem>
              {accountEntries.map((entry) => (
                <SelectItem key={entry.account.id} value={entry.account.id}>
                  {entry.account.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">{t('search.folderLabel')}</span>
          <Select
            value={filters.mailboxId || ALL}
            onValueChange={(value) => setFilter('mailboxId', value === ALL ? '' : value)}
          >
            <SelectTrigger aria-label={t('search.folderLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('common.all')}</SelectItem>
              {folderOptions.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="block text-xs">
          <label htmlFor="search-recipient" className="mb-1 block font-medium text-muted-foreground">
            {t('search.recipientLabel')}
          </label>
          <Input
            id="search-recipient"
            value={filters.recipient}
            onChange={(event) => setFilter('recipient', event.target.value)}
            placeholder={t('search.recipientPlaceholder')}
          />
        </div>
        <div className="block text-xs">
          <label htmlFor="search-sender" className="mb-1 block font-medium text-muted-foreground">
            {t('search.senderLabel')}
          </label>
          <Input
            id="search-sender"
            value={filters.sender}
            onChange={(event) => setFilter('sender', event.target.value)}
            placeholder={t('search.senderPlaceholder')}
          />
        </div>
        <div className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">{t('search.attachmentLabel')}</span>
          <Select
            value={attachmentValue}
            onValueChange={(value) => {
              const next: AttachmentFilter =
                value === WITH_ATTACHMENT ? 'with' : value === WITHOUT_ATTACHMENT ? 'without' : 'any';
              setFilter('hasAttachment', next);
            }}
          >
            <SelectTrigger aria-label={t('search.attachmentLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_ATTACHMENT}>{t('search.attachmentAny')}</SelectItem>
              <SelectItem value={WITH_ATTACHMENT}>{t('search.attachmentWith')}</SelectItem>
              <SelectItem value={WITHOUT_ATTACHMENT}>{t('search.attachmentWithout')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className={cn('mt-2 text-[11px] text-muted-foreground')}>{t('search.hint')}</p>
    </form>
  );
}
