import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { ErrorState, LoadingState } from '@/components/common/States';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import {
  fetchSettings,
  settingsKeys,
  updateSettings,
  type SettingsUpdate,
} from '@/features/settings/api';
import {
  fetchMailboxTree,
  mailboxKeys,
  updateMailboxSyncMode,
  type Mailbox,
} from '@/features/mailboxes/api';
import {
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '@/features/settings/SettingsSection';

interface MailFormState {
  autoSync: boolean;
  realTimeReceive: boolean;
  startupSync: boolean;
  syncIntervalSeconds: number;
  noIdleSyncIntervalSeconds: number;
  otherMailboxSyncIntervalSeconds: number;
  defaultInitialSyncRange: NonNullable<SettingsUpdate['defaultInitialSyncRange']>;
  defaultDownloadScope: NonNullable<SettingsUpdate['defaultDownloadScope']>;
  preserveMarkedOnAccountDelete: boolean;
  sentSyncMode: NonNullable<SettingsUpdate['sentSyncMode']>;
  draftSyncMode: NonNullable<SettingsUpdate['draftSyncMode']>;
  draftPullIntervalSeconds: number;
  draftPushDelaySeconds: number;
  composeWindowMode: NonNullable<SettingsUpdate['composeWindowMode']>;
  sendRetryLimit: number;
}

const EMPTY: MailFormState = {
  autoSync: true,
  realTimeReceive: true,
  startupSync: true,
  syncIntervalSeconds: 600,
  noIdleSyncIntervalSeconds: 180,
  otherMailboxSyncIntervalSeconds: 900,
  defaultInitialSyncRange: 'all',
  defaultDownloadScope: 'full_no_attachments',
  preserveMarkedOnAccountDelete: true,
  sentSyncMode: 'pull',
  draftSyncMode: 'pull',
  draftPullIntervalSeconds: 60,
  draftPushDelaySeconds: 30,
  composeWindowMode: 'in_app',
  sendRetryLimit: 3,
};

export function MailSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const message = useErrorMessage();
  const query = useQuery({ queryKey: settingsKeys.detail, queryFn: fetchSettings });
  const mailboxQuery = useQuery({ queryKey: mailboxKeys.tree, queryFn: fetchMailboxTree });
  const [form, setForm] = useState<MailFormState>(EMPTY);
  useEffect(() => {
    if (!query.data) return;
    const settings = query.data;
    setForm({
      autoSync: settings.autoSync,
      realTimeReceive: settings.realTimeReceive,
      startupSync: settings.startupSync,
      syncIntervalSeconds: settings.syncIntervalSeconds,
      noIdleSyncIntervalSeconds: settings.noIdleSyncIntervalSeconds,
      otherMailboxSyncIntervalSeconds: settings.otherMailboxSyncIntervalSeconds,
      defaultInitialSyncRange: settings.defaultInitialSyncRange,
      defaultDownloadScope: settings.defaultDownloadScope,
      preserveMarkedOnAccountDelete: settings.preserveMarkedOnAccountDelete,
      sentSyncMode: settings.sentSyncMode,
      draftSyncMode: settings.draftSyncMode,
      draftPullIntervalSeconds: settings.draftPullIntervalSeconds,
      draftPushDelaySeconds: settings.draftPushDelaySeconds,
      composeWindowMode: settings.composeWindowMode,
      sendRetryLimit: settings.sendRetryLimit,
    });
  }, [query.data]);

  const update = <K extends keyof MailFormState>(key: K, value: MailFormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const save = useMutation({
    mutationFn: (body: SettingsUpdate) => updateSettings(body),
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsKeys.detail, updated);
      toast(t('settings.mail.saved'));
    },
    onError: (saveError) =>
      toast(t('common.saveFailed'), {
        description: message(saveError),
        variant: 'destructive',
      }),
  });
  const updateMailboxMode = useMutation({
    mutationFn: ({
      mailboxId,
      syncMode,
    }: {
      mailboxId: string;
      syncMode: Mailbox['syncMode'];
    }) => updateMailboxSyncMode(mailboxId, syncMode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mailboxKeys.tree });
    },
    onError: (saveError) =>
      toast(t('common.saveFailed'), {
        description: message(saveError),
        variant: 'destructive',
      }),
  });

  const saveListBehavior = useMutation({
    mutationFn: (
      patch: Pick<SettingsUpdate, 'removeReadImmediately' | 'prependNewMessages'>,
    ) => updateSettings(patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsKeys.detail, updated);
    },
    onError: (saveError) =>
      toast(t('common.saveFailed'), {
        description: message(saveError),
        variant: 'destructive',
      }),
  });

  const submit = () => {
    if (form.syncIntervalSeconds < 30 || form.syncIntervalSeconds > 86400) {
      toast(t('common.saveFailed'), {
        description: `${t('settings.mail.newMailInterval')}: 30–86400`,
        variant: 'destructive',
      });
      return;
    }
    if (
      form.noIdleSyncIntervalSeconds < 30 ||
      form.noIdleSyncIntervalSeconds > 86400
    ) {
      toast(t('common.saveFailed'), {
        description: `${t('settings.mail.noIdleInterval')}: 30–86400`,
        variant: 'destructive',
      });
      return;
    }
    if (
      form.otherMailboxSyncIntervalSeconds < 30 ||
      form.otherMailboxSyncIntervalSeconds > 86400
    ) {
      toast(t('common.saveFailed'), {
        description: `${t('settings.mail.otherMailboxInterval')}: 30–86400`,
        variant: 'destructive',
      });
      return;
    }
    if (form.draftPullIntervalSeconds < 10 || form.draftPullIntervalSeconds > 3600) {
      toast(t('common.saveFailed'), {
        description: `${t('settings.mail.draftPullInterval')}: 10–3600`,
        variant: 'destructive',
      });
      return;
    }
    if (form.draftPushDelaySeconds < 10 || form.draftPushDelaySeconds > 600) {
      toast(t('common.saveFailed'), {
        description: `${t('settings.mail.draftPushDelay')}: 10–600`,
        variant: 'destructive',
      });
      return;
    }
    if (form.sendRetryLimit < 0 || form.sendRetryLimit > 10) {
      toast(t('common.saveFailed'), {
        description: `${t('settings.mail.sendRetryLimit')}: 0–10`,
        variant: 'destructive',
      });
      return;
    }
    save.mutate({
      autoSync: form.autoSync,
      realTimeReceive: form.realTimeReceive,
      startupSync: form.startupSync,
      syncIntervalSeconds: form.syncIntervalSeconds,
      noIdleSyncIntervalSeconds: form.noIdleSyncIntervalSeconds,
      otherMailboxSyncIntervalSeconds: form.otherMailboxSyncIntervalSeconds,
      defaultInitialSyncRange: form.defaultInitialSyncRange,
      defaultDownloadScope: form.defaultDownloadScope,
      preserveMarkedOnAccountDelete: form.preserveMarkedOnAccountDelete,
      sentSyncMode: form.sentSyncMode,
      draftSyncMode: form.draftSyncMode,
      draftPullIntervalSeconds: form.draftPullIntervalSeconds,
      draftPushDelaySeconds: form.draftPushDelaySeconds,
      composeWindowMode: form.composeWindowMode,
      sendRetryLimit: form.sendRetryLimit,
    });
  };

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const syncableAccounts =
    mailboxQuery.data?.accounts
      .map((entry) => ({
        account: entry.account,
        folders: [...entry.folders, ...entry.other].filter(
          (folder) =>
            !folder.localOnly && folder.role !== 'sent' && folder.role !== 'drafts',
        ),
      }))
      .filter((entry) => entry.folders.length > 0) ?? [];
  return (
    <div>
      <SettingsSection
        title={t('settings.mail.syncSchedule')}
        description={t('settings.mail.syncScheduleHint')}
      >
        <SettingsRow
          title={t('settings.mail.autoSync')}
          description={t('settings.mail.autoSyncHint')}
          control={
            <Switch
              checked={form.autoSync}
              onCheckedChange={(value) => update('autoSync', value)}
              aria-label={t('settings.mail.autoSync')}
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.realTimeReceive')}
          description={t('settings.mail.realTimeReceiveHint')}
          control={
            <Switch
              checked={form.realTimeReceive}
              onCheckedChange={(value) => update('realTimeReceive', value)}
              aria-label={t('settings.mail.realTimeReceive')}
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.startupSync')}
          description={t('settings.mail.startupSyncHint')}
          control={
            <Switch
              checked={form.startupSync}
              onCheckedChange={(value) => update('startupSync', value)}
              aria-label={t('settings.mail.startupSync')}
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.newMailInterval')}
          htmlFor="mail-new-mail-interval"
          control={
            <Input
              id="mail-new-mail-interval"
              type="number"
              min={30}
              max={86400}
              value={form.syncIntervalSeconds}
              onChange={(event) => update('syncIntervalSeconds', Number(event.target.value))}
              className="w-28"
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.noIdleInterval')}
          description={t('settings.mail.noIdleIntervalHint')}
          htmlFor="mail-no-idle-interval"
          control={
            <Input
              id="mail-no-idle-interval"
              type="number"
              min={30}
              max={86400}
              value={form.noIdleSyncIntervalSeconds}
              onChange={(event) =>
                update('noIdleSyncIntervalSeconds', Number(event.target.value))
              }
              className="w-28"
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.otherMailboxInterval')}
          htmlFor="mail-other-folder-interval"
          control={
            <Input
              id="mail-other-folder-interval"
              type="number"
              min={30}
              max={86400}
              value={form.otherMailboxSyncIntervalSeconds}
              onChange={(event) =>
                update('otherMailboxSyncIntervalSeconds', Number(event.target.value))
              }
              className="w-28"
            />
          }
        />
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title={t('settings.mail.syncFolders')}
        description={t('settings.mail.syncFoldersHint')}
      >
        {mailboxQuery.isPending ? (
          <p className="py-2 text-xs text-muted-foreground">{t('common.loading')}</p>
        ) : mailboxQuery.isError ? (
          <div className="flex items-center justify-between gap-3 py-2">
            <p className="text-xs text-destructive">{t('settings.mail.mailboxLoadFailed')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void mailboxQuery.refetch()}
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : syncableAccounts.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">{t('settings.mail.noSyncFolders')}</p>
        ) : (
          syncableAccounts.map(({ account, folders }) => (
            <div key={account.id} className="py-2">
              <h3 className="mb-1 text-xs font-semibold text-muted-foreground">
                {account.name || account.email}
              </h3>
              {folders.map((folder, index) => (
                <div key={folder.id}>
                  {index > 0 && <SettingsDivider />}
                  <SettingsRow
                    title={folder.name}
                    description={folder.path}
                    control={
                      <Switch
                        id={`mailbox-sync-${folder.id}`}
                        checked={folder.syncMode !== 'off'}
                        disabled={updateMailboxMode.isPending}
                        aria-label={t('settings.mail.mailboxSyncMode', {
                          name: folder.name,
                        })}
                        onCheckedChange={(enabled) =>
                          updateMailboxMode.mutate({
                            mailboxId: folder.id,
                            syncMode: enabled ? 'full' : 'off',
                          })
                        }
                      />
                    }
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </SettingsSection>

      <SettingsDivider />
      <SettingsSection
        title={t('settings.mail.syncDefaults')}
        description={t('settings.mail.defaultAccountHint')}
      >
        <SettingsRow
          title={t('settings.mail.syncRange')}
          htmlFor="mail-sync-range"
          control={
            <Select
              value={form.defaultInitialSyncRange}
              onValueChange={(value) =>
                update(
                  'defaultInitialSyncRange',
                  value === '1d' || value === '3d' || value === '1w' || value === '1m' || value === '1y'
                    ? value
                    : 'all',
                )
              }
            >
              <SelectTrigger id="mail-sync-range" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['all', '1d', '3d', '1w', '1m', '1y'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`account.syncRanges.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.downloadScope')}
          htmlFor="mail-download-scope"
          control={
            <Select
              value={form.defaultDownloadScope}
              onValueChange={(value) =>
                update(
                  'defaultDownloadScope',
                  value === 'headers' || value === 'full_with_attachments'
                    ? value
                    : 'full_no_attachments',
                )
              }
            >
              <SelectTrigger id="mail-download-scope" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['headers', 'full_no_attachments', 'full_with_attachments'] as const).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {t(`account.downloadScopes.${value}`)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection title={t('settings.mail.accountDeletion')}>
        <SettingsRow
          title={t('settings.mail.preserveMarked')}
          description={t('settings.mail.preserveMarkedHint')}
          control={
            <Switch
              checked={form.preserveMarkedOnAccountDelete}
              onCheckedChange={(value) => update('preserveMarkedOnAccountDelete', value)}
              aria-label={t('settings.mail.preserveMarked')}
            />
          }
        />
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection title={t('settings.mail.sentDrafts')}>
        <SettingsRow
          title={t('settings.mail.sentSyncMode')}
          htmlFor="mail-sent-sync"
          control={
            <Select
              value={form.sentSyncMode}
              onValueChange={(value) => update('sentSyncMode', value === 'off' ? 'off' : 'pull')}
            >
              <SelectTrigger id="mail-sent-sync" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pull">{t('settings.mail.sentSyncOptions.pull')}</SelectItem>
                <SelectItem value="off">{t('settings.mail.sentSyncOptions.off')}</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.draftSyncMode')}
          htmlFor="mail-draft-sync"
          control={
            <Select
              value={form.draftSyncMode}
              onValueChange={(value) =>
                update(
                  'draftSyncMode',
                  value === 'local' || value === 'mirror' ? value : 'pull',
                )
              }
            >
              <SelectTrigger id="mail-draft-sync" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">{t('settings.mail.draftSyncOptions.local')}</SelectItem>
                <SelectItem value="pull">{t('settings.mail.draftSyncOptions.pull')}</SelectItem>
                <SelectItem value="mirror">{t('settings.mail.draftSyncOptions.mirror')}</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.draftPullInterval')}
          htmlFor="mail-draft-pull"
          control={
            <Input
              id="mail-draft-pull"
              type="number"
              min={10}
              max={3600}
              value={form.draftPullIntervalSeconds}
              onChange={(event) =>
                update('draftPullIntervalSeconds', Number(event.target.value))
              }
              className="w-28"
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.draftPushDelay')}
          htmlFor="mail-draft-push"
          control={
            <Input
              id="mail-draft-push"
              type="number"
              min={10}
              max={600}
              value={form.draftPushDelaySeconds}
              onChange={(event) => update('draftPushDelaySeconds', Number(event.target.value))}
              className="w-28"
            />
          }
        />
        <p className="pt-2 text-[11px] text-muted-foreground">{t('settings.mail.localDraftHint')}</p>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection title={t('settings.mail.sentDrafts')}>
        <SettingsRow
          title={t('settings.mail.composeWindowMode')}
          htmlFor="mail-compose-window"
          control={
            <Select
              value={form.composeWindowMode}
              onValueChange={(value) =>
                update('composeWindowMode', value === 'new_window' ? 'new_window' : 'in_app')
              }
            >
              <SelectTrigger id="mail-compose-window" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_app">{t('settings.mail.composeOptions.in_app')}</SelectItem>
                <SelectItem value="new_window">
                  {t('settings.mail.composeOptions.new_window')}
                </SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.sendRetryLimit')}
          description={t('settings.mail.sendRetryHint')}
          htmlFor="mail-send-retry"
          control={
            <Input
              id="mail-send-retry"
              type="number"
              min={0}
              max={10}
              value={form.sendRetryLimit}
              onChange={(event) => update('sendRetryLimit', Number(event.target.value))}
              className="w-24"
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.mail.prependNewMessages')}
          description={t('settings.mail.prependNewMessagesHint')}
          control={
            <Switch
              checked={query.data.prependNewMessages}
              onCheckedChange={(value) => saveListBehavior.mutate({ prependNewMessages: value })}
              disabled={saveListBehavior.isPending}
              aria-label={t('settings.mail.prependNewMessages')}
            />
          }
        />
      </SettingsSection>

      <SettingsDivider />
      <div className="flex items-center gap-3 pt-4">
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? t('common.saving') : t('settings.mail.save')}
        </Button>
      </div>
    </div>
  );
}
