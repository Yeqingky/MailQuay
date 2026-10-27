import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { ErrorState, LoadingState } from '@/components/common/States';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatBytes } from '@/lib/format';
import {
  detectConcurrency,
  fetchSettings,
  settingsKeys,
  updateSettings,
  type SettingsUpdate,
} from '@/features/settings/api';
import {
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '@/features/settings/SettingsSection';

interface ConcurrencyForm {
  syncConcurrency: number;
  fetchConcurrency: number;
  envelopeBatchSize: number;
  maxImapConnectionsPerAccount: number;
  imapWorkIdleTimeoutSeconds: number;
  maxImapConnectionsPerServer: number;
  maxConcurrentSyncsPerServer: number;
  autoReconnect: boolean;
  searchConcurrency: number;
  indexBatchSize: number;
  autoLocalConcurrency: boolean;
}
export function PerformanceSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const message = useErrorMessage();
  const query = useQuery({ queryKey: settingsKeys.detail, queryFn: fetchSettings });
  const [form, setForm] = useState<ConcurrencyForm>({
    syncConcurrency: 2,
    fetchConcurrency: 2,
    envelopeBatchSize: 50,
    maxImapConnectionsPerAccount: 2,
    imapWorkIdleTimeoutSeconds: 600,
    maxImapConnectionsPerServer: 8,
    maxConcurrentSyncsPerServer: 2,
    autoReconnect: true,
    searchConcurrency: 1,
    indexBatchSize: 50,
    autoLocalConcurrency: true,
  });

  useEffect(() => {
    if (!query.data) return;
    setForm({
      syncConcurrency: query.data.concurrency.syncConcurrency,
      fetchConcurrency: query.data.concurrency.fetchConcurrency,
      envelopeBatchSize: query.data.envelopeBatchSize,
      maxImapConnectionsPerAccount: query.data.maxImapConnectionsPerAccount,
      imapWorkIdleTimeoutSeconds: query.data.imapWorkIdleTimeoutSeconds,
      maxImapConnectionsPerServer: query.data.maxImapConnectionsPerServer,
      maxConcurrentSyncsPerServer: query.data.maxConcurrentSyncsPerServer,
      autoReconnect: query.data.autoReconnect,
      searchConcurrency: query.data.searchConcurrency,
      indexBatchSize: query.data.indexBatchSize,
      autoLocalConcurrency: query.data.autoLocalConcurrency,
    });
  }, [query.data]);

  const detect = useMutation({
    mutationFn: detectConcurrency,
    onSuccess: () => {
      toast(t('settings.performance.redetected'));
      void queryClient.invalidateQueries({ queryKey: settingsKeys.detail });
    },
    onError: (detectError) =>
      toast(t('common.updateFailed'), {
        description: message(detectError),
        variant: 'destructive',
      }),
  });

  const save = useMutation({
    mutationFn: (body: SettingsUpdate) => updateSettings(body),
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsKeys.detail, updated);
      toast(t('settings.performance.saved'));
    },
    onError: (saveError) =>
      toast(t('common.saveFailed'), {
        description: message(saveError),
        variant: 'destructive',
      }),
  });

  const update = <K extends keyof ConcurrencyForm>(key: K, value: ConcurrencyForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const settings = query.data;
  const resources = settings.resources;

  const fail = (description: string) =>
    toast(t('common.saveFailed'), { description, variant: 'destructive' });

  const submit = () => {
    if (form.syncConcurrency < 1 || form.syncConcurrency > 32) {
      fail(`${t('settings.performance.syncConcurrency')}: 1–32`);
      return;
    }
    if (form.fetchConcurrency < 1 || form.fetchConcurrency > 32) {
      fail(`${t('settings.performance.fetchConcurrency')}: 1–32`);
      return;
    }
    if (form.envelopeBatchSize < 1 || form.envelopeBatchSize > 200) {
      fail(`${t('settings.performance.envelopeBatchSize')}: 1–200`);
      return;
    }
    if (form.searchConcurrency < 1 || form.searchConcurrency > 8) {
      fail(`${t('settings.performance.searchConcurrency')}: 1–8`);
      return;
    }
    if (form.indexBatchSize < 10 || form.indexBatchSize > 500) {
      fail(`${t('settings.performance.indexBatchSize')}: 10–500`);
      return;
    }
    if (form.maxImapConnectionsPerAccount < 1 || form.maxImapConnectionsPerAccount > 3) {
      fail(`${t('settings.performance.maxImapConnectionsPerAccount')}: 1–3`);
      return;
    }
    if (form.imapWorkIdleTimeoutSeconds < 60 || form.imapWorkIdleTimeoutSeconds > 3600) {
      fail(`${t('settings.performance.workConnectionIdleTimeout')}: 60–3600`);
      return;
    }
    if (form.maxImapConnectionsPerServer < 1 || form.maxImapConnectionsPerServer > 64) {
      fail(`${t('settings.performance.maxImapConnectionsPerServer')}: 1–64`);
      return;
    }
    if (form.maxConcurrentSyncsPerServer < 1 || form.maxConcurrentSyncsPerServer > 32) {
      fail(`${t('settings.performance.maxConcurrentSyncsPerServer')}: 1–32`);
      return;
    }
    save.mutate({
      syncConcurrency: form.syncConcurrency,
      fetchConcurrency: form.fetchConcurrency,
      envelopeBatchSize: form.envelopeBatchSize,
      searchConcurrency: form.searchConcurrency,
      indexBatchSize: form.indexBatchSize,
      autoLocalConcurrency: form.autoLocalConcurrency,
      maxImapConnectionsPerAccount: form.maxImapConnectionsPerAccount,
      imapWorkIdleTimeoutSeconds: form.imapWorkIdleTimeoutSeconds,
      maxImapConnectionsPerServer: form.maxImapConnectionsPerServer,
      maxConcurrentSyncsPerServer: form.maxConcurrentSyncsPerServer,
      autoReconnect: form.autoReconnect,
    });
  };

  return (
    <div>
      <SettingsSection
        title={t('settings.performance.detected')}
        description={`${resources.cpuSource} · ${resources.memorySource}`}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <MetricCard label={t('settings.performance.cpus')} value={String(resources.cpus)} />
          <MetricCard
            label={t('settings.performance.memory')}
            value={formatBytes(resources.memoryBytes)}
          />
          <MetricCard
            label={t('settings.performance.cgroup')}
            value={t('settings.performance.cgroupValue', { version: resources.cgroupVersion })}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => detect.mutate()}
            disabled={detect.isPending}
          >
            {detect.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            {t('settings.performance.redetect')}
          </Button>
        </div>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title={t('settings.performance.network')}
        description={t('settings.performance.networkHint')}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            id="performance-sync"
            label={t('settings.performance.syncConcurrency')}
            value={form.syncConcurrency}
            min={1}
            max={32}
            onChange={(value) => update('syncConcurrency', value)}
          />
          <NumberField
            id="performance-fetch"
            label={t('settings.performance.fetchConcurrency')}
            value={form.fetchConcurrency}
            min={1}
            max={32}
            onChange={(value) => update('fetchConcurrency', value)}
          />
          <NumberField
            id="performance-envelope-batch"
            label={t('settings.performance.envelopeBatchSize')}
            value={form.envelopeBatchSize}
            min={1}
            max={200}
            onChange={(value) => update('envelopeBatchSize', value)}
          />
          <NumberField
            id="performance-imap-account-connections"
            label={t('settings.performance.maxImapConnectionsPerAccount')}
            value={form.maxImapConnectionsPerAccount}
            min={1}
            max={3}
            onChange={(value) => update('maxImapConnectionsPerAccount', value)}
          />
          <NumberField
            id="performance-imap-work-idle"
            label={t('settings.performance.workConnectionIdleTimeout')}
            value={form.imapWorkIdleTimeoutSeconds}
            min={60}
            max={3600}
            onChange={(value) => update('imapWorkIdleTimeoutSeconds', value)}
          />
          <NumberField
            id="performance-imap-server-connections"
            label={t('settings.performance.maxImapConnectionsPerServer')}
            value={form.maxImapConnectionsPerServer}
            min={1}
            max={64}
            onChange={(value) => update('maxImapConnectionsPerServer', value)}
          />
          <NumberField
            id="performance-sync-server-concurrency"
            label={t('settings.performance.maxConcurrentSyncsPerServer')}
            value={form.maxConcurrentSyncsPerServer}
            min={1}
            max={32}
            onChange={(value) => update('maxConcurrentSyncsPerServer', value)}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('settings.performance.envelopeBatchHint')}
        </p>
        <SettingsDivider />
        <SettingsRow
          htmlFor="performance-auto-reconnect"
          title={t('settings.performance.autoReconnect')}
          description={t('settings.performance.autoReconnectHint')}
          control={
            <Switch
              id="performance-auto-reconnect"
              checked={form.autoReconnect}
              onCheckedChange={(enabled) => update('autoReconnect', enabled)}
            />
          }
        />
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title={t('settings.performance.local')}
        description={t('settings.performance.localHint')}
      >
        <SettingsRow
          htmlFor="performance-auto-local"
          title={t('settings.performance.autoLocal')}
          description={t('settings.performance.autoLocalHint')}
          control={
            <Switch
              id="performance-auto-local"
              checked={form.autoLocalConcurrency}
              onCheckedChange={(enabled) => update('autoLocalConcurrency', enabled)}
            />
          }
        />
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <NumberField
            id="performance-search"
            label={t('settings.performance.searchConcurrency')}
            value={
              form.autoLocalConcurrency
                ? settings.concurrency.searchConcurrency
                : form.searchConcurrency
            }
            min={1}
            max={8}
            disabled={form.autoLocalConcurrency}
            onChange={(value) => update('searchConcurrency', value)}
          />
          <NumberField
            id="performance-index-batch"
            label={t('settings.performance.indexBatchSize')}
            value={
              form.autoLocalConcurrency
                ? settings.concurrency.indexBatchSize
                : form.indexBatchSize
            }
            min={10}
            max={500}
            disabled={form.autoLocalConcurrency}
            onChange={(value) => update('indexBatchSize', value)}
          />
        </div>
      </SettingsSection>

      <SettingsDivider />
      <div className="flex items-center gap-3 pt-4">
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? t('common.saving') : t('settings.performance.save')}
        </Button>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
