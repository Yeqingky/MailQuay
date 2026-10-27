import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Loader2,
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CredentialField } from '@/components/ui/credential-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { toast } from '@/components/ui/toast';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import {
  accountKeys,
  deleteAccount,
  fetchAccounts,
  oauthStartUrl,
  reconcileAccount,
  requestAccountSync,
  testAccount,
  updateAccount,
  type Account,
  type AccountInput,
} from '@/features/accounts/api';
import { AccountWizardDialog } from '@/features/accounts/AccountWizard';
import {
  fetchMailboxTree,
  findAccountEntry,
  mailboxKeys,
  type Mailbox,
} from '@/features/mailboxes/api';
import { EmclientImportDialog } from '@/features/accounts/EmclientImportDialog';
import { fetchSettings, settingsKeys } from '@/features/settings/api';
import { formatDate } from '@/lib/format';
import { InlineWarning } from '@/components/layout/InsecureTransportBanner';

const ADDRESS_PATTERN = /^(?:\[[0-9a-fA-F:]+\]|[^\s:]+):\d{1,5}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SPECIAL_FOLDER_FIELDS = [
  { role: 'sent', labelKey: 'account.specialFolderRoles.sent' },
  { role: 'drafts', labelKey: 'account.specialFolderRoles.drafts' },
  { role: 'trash', labelKey: 'account.specialFolderRoles.trash' },
  { role: 'junk', labelKey: 'account.specialFolderRoles.junk' },
  { role: 'archive', labelKey: 'account.specialFolderRoles.archive' },
] as const;

type SpecialFolderRole = (typeof SPECIAL_FOLDER_FIELDS)[number]['role'];

type AccountTab = 'basic' | 'credentials' | 'servers' | 'sync' | 'folders';

const ACCOUNT_TABS: ReadonlyArray<{ value: AccountTab; labelKey: string }> = [
  { value: 'basic', labelKey: 'account.tabs.basic' },
  { value: 'credentials', labelKey: 'account.tabs.credentials' },
  { value: 'servers', labelKey: 'account.tabs.servers' },
  { value: 'sync', labelKey: 'account.tabs.sync' },
  { value: 'folders', labelKey: 'account.tabs.folders' },
];

interface AccountFormState {
  name: string;
  email: string;
  defaultSendName: string;
  defaultReplyTo: string;
  username: string;
  authType: AccountInput['authType'];
  password: string;
  oauthProvider: NonNullable<AccountInput['oauthProvider']>;
  receiveProtocol: AccountInput['receiveProtocol'];
  imapAddr: string;
  imapSecurity: NonNullable<AccountInput['imapSecurity']>;
  pop3Addr: string;
  pop3Security: NonNullable<AccountInput['pop3Security']>;
  smtpAddr: string;
  smtpSecurity: NonNullable<AccountInput['smtpSecurity']>;
  smtpUsername: string;
  smtpPassword: string;
  smtpHeloHostname: string;
  syncEnabled: boolean;
  initialSyncRange: NonNullable<AccountInput['initialSyncRange']>;
  downloadScope: NonNullable<AccountInput['downloadScope']>;
  sentCopyMode: NonNullable<AccountInput['sentCopyMode']>;
  pop3LeaveOnServer: boolean;
  pop3DeleteOnServer: boolean;
  autoDetectSpecialFolders: boolean;
  specialFolders: Record<SpecialFolderRole, string>;
}

function formFromAccount(account: Account): AccountFormState {
  return {
    name: account.name,
    email: account.email,
    defaultSendName: account.defaultSendName ?? '',
    defaultReplyTo: account.defaultReplyTo ?? '',
    username: account.username,
    authType: account.authType,
    password: '',
    oauthProvider: account.oauthProvider === 'microsoft' ? 'microsoft' : 'google',
    receiveProtocol: account.receiveProtocol,
    imapAddr: account.imapAddr ?? '',
    imapSecurity: account.imapSecurity ?? 'implicit_tls',
    pop3Addr: account.pop3Addr ?? '',
    pop3Security: account.pop3Security ?? 'implicit_tls',
    smtpAddr: account.smtpAddr ?? '',
    smtpSecurity: account.smtpSecurity ?? 'implicit_tls',
    smtpUsername: account.smtpUsername ?? '',
    smtpPassword: '',
    smtpHeloHostname: account.smtpHeloHostname ?? '',
    syncEnabled: account.syncEnabled,
    initialSyncRange: account.initialSyncRange,
    downloadScope: account.downloadScope,
    sentCopyMode: account.sentCopyMode,
    pop3LeaveOnServer: account.pop3LeaveOnServer ?? true,
    pop3DeleteOnServer: account.pop3DeleteOnServer ?? false,
    autoDetectSpecialFolders: account.autoDetectSpecialFolders ?? true,
    specialFolders: {
      sent: account.specialFolders?.sent ?? '',
      drafts: account.specialFolders?.drafts ?? '',
      trash: account.specialFolders?.trash ?? '',
      junk: account.specialFolders?.junk ?? '',
      archive: account.specialFolders?.archive ?? '',
    },
  };
}

function AccountFormDialog({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account;
  onSaved: (account: Account) => void;
}) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [form, setForm] = useState<AccountFormState>(() => formFromAccount(account));
  const [tab, setTab] = useState<AccountTab>('basic');
  const tabId = useId();

  useEffect(() => {
    if (!open) return;
    setForm(formFromAccount(account));
    setTab('basic');
  }, [account, open]);

  useEffect(() => {
    if (form.receiveProtocol !== 'imap' && tab === 'folders') setTab('sync');
  }, [form.receiveProtocol, tab]);

  const tabs = ACCOUNT_TABS.filter(
    (item) => item.value !== 'folders' || form.receiveProtocol === 'imap',
  );

  const treeQuery = useQuery({
    queryKey: mailboxKeys.tree,
    queryFn: fetchMailboxTree,
    enabled: open,
  });
  const treeEntry = findAccountEntry(treeQuery.data, account.id);
  const accountFolders: Mailbox[] = treeEntry
    ? [...treeEntry.folders, ...treeEntry.other].filter((folder) => !folder.localOnly)
    : [];
  const detectedPath = (role: SpecialFolderRole) =>
    accountFolders.find((folder) => folder.role === role)?.path ?? '';
  const unresolved = SPECIAL_FOLDER_FIELDS.map((field) => field.role).filter(
    (role) => detectedPath(role) === '',
  );

  const mutation = useMutation({
    mutationFn: (input: AccountInput) => updateAccount(account.id, input),
    onSuccess: (saved) => {
      toast(t('account.updated'));
      onSaved(saved);
      onOpenChange(false);
    },
    onError: (errorValue) =>
      toast(t('common.saveFailed'), {
        description: message(errorValue),
        variant: 'destructive',
      }),
  });

  const update = <K extends keyof AccountFormState>(key: K, value: AccountFormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const updateSpecialFolder = (role: SpecialFolderRole, path: string) =>
    setForm((previous) => ({
      ...previous,
      specialFolders: { ...previous.specialFolders, [role]: path },
    }));

  const toggleAutoDetect = (value: boolean) =>
    setForm((previous) => {
      if (value) return { ...previous, autoDetectSpecialFolders: true };
      const specialFolders = { ...previous.specialFolders };
      for (const field of SPECIAL_FOLDER_FIELDS) {
        if (!specialFolders[field.role]) specialFolders[field.role] = detectedPath(field.role);
      }
      return { ...previous, autoDetectSpecialFolders: false, specialFolders };
    });

  const submit = () => {
    const errors: Array<{ tab: AccountTab; message: string }> = [];
    if (form.name.trim() === '') {
      errors.push({ tab: 'basic', message: t('account.formErrors.name') });
    }
    if (!EMAIL_PATTERN.test(form.email.trim())) {
      errors.push({ tab: 'basic', message: t('account.formErrors.email') });
    }
    if (form.defaultReplyTo.trim() !== '' && !EMAIL_PATTERN.test(form.defaultReplyTo.trim())) {
      errors.push({ tab: 'basic', message: t('account.formErrors.defaultReplyTo') });
    }
    if (form.username.trim() === '') {
      errors.push({ tab: 'credentials', message: t('account.formErrors.username') });
    }
    if (form.receiveProtocol === 'imap' && !ADDRESS_PATTERN.test(form.imapAddr.trim())) {
      errors.push({ tab: 'servers', message: t('account.formErrors.imapAddr') });
    }
    if (form.receiveProtocol === 'pop3' && !ADDRESS_PATTERN.test(form.pop3Addr.trim())) {
      errors.push({ tab: 'servers', message: t('account.formErrors.pop3Addr') });
    }
    if (form.smtpAddr.trim() !== '' && !ADDRESS_PATTERN.test(form.smtpAddr.trim())) {
      errors.push({ tab: 'servers', message: t('account.formErrors.smtpAddr') });
    }

    if (errors.length > 0) {
      setTab(errors[0].tab);
      toast(t('common.saveFailed'), {
        description: errors[0].message,
        variant: 'destructive',
      });
      return;
    }
    const input: AccountInput = {
      name: form.name.trim(),
      email: form.email.trim(),
      defaultSendName: form.defaultSendName.trim() || undefined,
      defaultReplyTo: form.defaultReplyTo.trim() || undefined,
      username: form.username.trim(),
      authType: form.authType,
      password: form.password || undefined,
      receiveProtocol: form.receiveProtocol,
      imapAddr: form.receiveProtocol === 'imap' ? form.imapAddr.trim() : undefined,
      imapSecurity: form.receiveProtocol === 'imap' ? form.imapSecurity : undefined,
      pop3Addr: form.receiveProtocol === 'pop3' ? form.pop3Addr.trim() : undefined,
      pop3Security: form.receiveProtocol === 'pop3' ? form.pop3Security : undefined,
      smtpAddr: form.smtpAddr.trim() || undefined,
      smtpSecurity: form.smtpSecurity,
      smtpUsername: form.smtpUsername.trim() || undefined,
      smtpPassword: form.smtpPassword || undefined,
      smtpHeloHostname: form.smtpHeloHostname.trim() || undefined,
      syncEnabled: form.syncEnabled,
      initialSyncRange: form.initialSyncRange,
      downloadScope: form.downloadScope,
      sentCopyMode: form.sentCopyMode,
      pop3LeaveOnServer: form.receiveProtocol === 'pop3' ? form.pop3LeaveOnServer : undefined,
      pop3DeleteOnServer: form.receiveProtocol === 'pop3' ? form.pop3DeleteOnServer : undefined,
      autoDetectSpecialFolders: form.autoDetectSpecialFolders,
      specialFolders: form.autoDetectSpecialFolders
        ? {}
        : {
            sent: form.specialFolders.sent || undefined,
            drafts: form.specialFolders.drafts || undefined,
            trash: form.specialFolders.trash || undefined,
            junk: form.specialFolders.junk || undefined,
            archive: form.specialFolders.archive || undefined,
          },
    };
    if (form.authType === 'oauth2') {
      input.oauthProvider = form.oauthProvider;
    }
    mutation.mutate(input);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('account.editTitle')}</DialogTitle>
          <DialogDescription>{t('account.description')}</DialogDescription>
        </DialogHeader>

        <Tabs
          items={tabs.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
          value={tab}
          onValueChange={setTab}
          label={t('account.tabs.label')}
          idPrefix={tabId}
        />

        <ScrollArea containerClassName="min-h-0 flex-1" className="pr-1">
          <div
            role="tabpanel"
            id={`${tabId}-panel-${tab}`}
            aria-labelledby={`${tabId}-tab-${tab}`}
            className="space-y-4"
          >
            {tab === 'basic' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="account-name">{t('account.name')}</Label>
                  <Input
                    id="account-name"
                    value={form.name}
                    onChange={(event) => update('name', event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-mailbox">{t('account.email')}</Label>
                  <CredentialField
                    id="account-mailbox"
                    inputMode="email"
                    value={form.email}
                    onChange={(event) => update('email', event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-default-send-name">{t('account.defaultSendName')}</Label>
                  <Input
                    id="account-default-send-name"
                    value={form.defaultSendName}
                    onChange={(event) => update('defaultSendName', event.target.value)}
                    placeholder={form.name}
                  />
                  <p className="text-[11px] text-muted-foreground">{t('account.defaultSendNameHint')}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-default-reply-to">{t('account.defaultReplyTo')}</Label>
                  <Input
                    id="account-default-reply-to"
                    type="email"
                    value={form.defaultReplyTo}
                    onChange={(event) => update('defaultReplyTo', event.target.value)}
                    placeholder={form.email}
                  />
                  <p className="text-[11px] text-muted-foreground">{t('account.defaultReplyToHint')}</p>
                </div>
              </div>
            ) : null}

            {tab === 'credentials' ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="account-username">{t('account.username')}</Label>
                    <Input
                      id="account-username"
                      value={form.username}
                      onChange={(event) => update('username', event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      data-form-type="other"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-bwignore="1"
                      data-protonpass-ignore="true"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="account-auth-type">{t('account.authType')}</Label>
                    <Select
                      value={form.authType}
                      onValueChange={(value) => update('authType', value === 'oauth2' ? 'oauth2' : 'password')}
                    >
                      <SelectTrigger id="account-auth-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="password">{t('account.auth.password')}</SelectItem>
                        <SelectItem value="oauth2">{t('account.auth.oauth2')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.authType === 'password' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="account-secret">{t('account.password')}</Label>
                    <CredentialField
                      id="account-secret"
                      value={form.password}
                      onChange={(event) => update('password', event.target.value)}
                      placeholder={account ? t('account.passwordHint') : undefined}
                    />
                    <p className="text-[11px] text-muted-foreground">{t('account.passwordHint')}</p>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="account-oauth-provider">{t('account.oauthProvider')}</Label>
                      <Select
                        value={form.oauthProvider}
                        onValueChange={(value) =>
                          update('oauthProvider', value === 'microsoft' ? 'microsoft' : 'google')
                        }
                      >
                        <SelectTrigger id="account-oauth-provider" className="w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="microsoft">Microsoft</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t('account.oauthHint')}</p>
                    {account ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.location.assign(oauthStartUrl(form.oauthProvider, account.id))
                        }
                      >
                        {t('account.oauthStart')}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Button>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">{t('account.oauthHint')}</p>
                    )}
                  </div>
                )}

                {form.authType === 'password' ? (
                  <div className="space-y-3 rounded-lg border p-3">
                    <p className="text-xs font-medium">{t('account.wizard.smtpAuth')}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="account-smtp-username">{t('account.smtpUsername')}</Label>
                        <Input
                          id="account-smtp-username"
                          value={form.smtpUsername}
                          onChange={(event) => update('smtpUsername', event.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                          data-form-type="other"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          data-bwignore="1"
                          data-protonpass-ignore="true"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="account-smtp-secret">{t('account.smtpPassword')}</Label>
                        <CredentialField
                          id="account-smtp-secret"
                          value={form.smtpPassword}
                          onChange={(event) => update('smtpPassword', event.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t('account.smtpPasswordHint')}</p>
                  </div>
                ) : null}
              </>
            ) : null}

            {tab === 'servers' ? (
              <>
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="account-protocol">{t('account.protocol')}</Label>
                    <Select
                      value={form.receiveProtocol}
                      onValueChange={(value) => update('receiveProtocol', value === 'pop3' ? 'pop3' : 'imap')}
                    >
                      <SelectTrigger id="account-protocol" className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="imap">{t('account.protocolOptions.imap')}</SelectItem>
                        <SelectItem value="pop3">{t('account.protocolOptions.pop3')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.receiveProtocol === 'imap' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="account-imap-addr">{t('account.imapAddr')}</Label>
                        <Input
                          id="account-imap-addr"
                          value={form.imapAddr}
                          onChange={(event) => update('imapAddr', event.target.value)}
                          placeholder={t('account.addrExamples.imap')}
                          spellCheck={false}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="account-imap-security">{t('account.imapSecurity')}</Label>
                        <Select
                          value={form.imapSecurity}
                          onValueChange={(value) =>
                            update(
                              'imapSecurity',
                              value === 'starttls' ? 'starttls' : value === 'none' ? 'none' : 'implicit_tls',
                            )
                          }
                        >
                          <SelectTrigger id="account-imap-security">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="implicit_tls">{t('account.securityOptions.implicit_tls')}</SelectItem>
                            <SelectItem value="starttls">{t('account.securityOptions.starttls')}</SelectItem>
                            <SelectItem value="none">{t('account.securityOptions.none')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="account-pop3-addr">{t('account.pop3Addr')}</Label>
                          <Input
                            id="account-pop3-addr"
                            value={form.pop3Addr}
                            onChange={(event) => update('pop3Addr', event.target.value)}
                            placeholder={t('account.addrExamples.pop3')}
                            spellCheck={false}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="account-pop3-security">{t('account.pop3Security')}</Label>
                          <Select
                            value={form.pop3Security}
                            onValueChange={(value) =>
                              update(
                                'pop3Security',
                                value === 'starttls' ? 'starttls' : value === 'none' ? 'none' : 'implicit_tls',
                              )
                            }
                          >
                            <SelectTrigger id="account-pop3-security">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="implicit_tls">{t('account.securityOptions.implicit_tls')}</SelectItem>
                              <SelectItem value="starttls">{t('account.securityOptions.starttls')}</SelectItem>
                              <SelectItem value="none">{t('account.securityOptions.none')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t('account.pop3Warning')}</p>
                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-xs">
                          <Switch
                            checked={form.pop3LeaveOnServer}
                            onCheckedChange={(value) => update('pop3LeaveOnServer', value)}
                          />
                          {t('account.pop3Leave')}
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <Switch
                            checked={form.pop3DeleteOnServer}
                            onCheckedChange={(value) => update('pop3DeleteOnServer', value)}
                          />
                          {t('account.pop3Delete')}
                        </label>
                      </div>
                    </>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="account-smtp-addr">{t('account.smtpAddr')}</Label>
                      <Input
                        id="account-smtp-addr"
                        value={form.smtpAddr}
                        onChange={(event) => update('smtpAddr', event.target.value)}
                        placeholder={t('account.addrExamples.smtp')}
                        spellCheck={false}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="account-smtp-security">{t('account.smtpSecurity')}</Label>
                      <Select
                        value={form.smtpSecurity}
                        onValueChange={(value) =>
                          update(
                            'smtpSecurity',
                            value === 'starttls' ? 'starttls' : value === 'none' ? 'none' : 'implicit_tls',
                          )
                        }
                      >
                        <SelectTrigger id="account-smtp-security">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="implicit_tls">{t('account.securityOptions.implicit_tls')}</SelectItem>
                          <SelectItem value="starttls">{t('account.securityOptions.starttls')}</SelectItem>
                          <SelectItem value="none">{t('account.securityOptions.none')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t('account.addressHint')}</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="account-helo">{t('account.helo')}</Label>
                    <Input
                      id="account-helo"
                      value={form.smtpHeloHostname}
                      onChange={(event) => update('smtpHeloHostname', event.target.value)}
                      spellCheck={false}
                    />
                  </div>
                  {[form.imapSecurity, form.pop3Security, form.smtpSecurity].some(
                    (value) => value === 'none',
                  ) ? (
                    <InlineWarning>{t('account.insecureWarning')}</InlineWarning>
                  ) : null}
                </div>
              </>
            ) : null}

            {tab === 'sync' ? (
              <>
                <div className="space-y-2 rounded-lg border p-3">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>{t('account.syncEnabled')}</span>
                    <Switch
                      checked={form.syncEnabled}
                      onCheckedChange={(value) => update('syncEnabled', value)}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="account-sync-range">{t('account.syncRange')}</Label>
                      <Select
                        value={form.initialSyncRange}
                        onValueChange={(value) =>
                          update(
                            'initialSyncRange',
                            value === '1d' ||
                              value === '3d' ||
                              value === '1w' ||
                              value === '1m' ||
                              value === '1y'
                              ? value
                              : 'all',
                          )
                        }
                      >
                        <SelectTrigger id="account-sync-range">
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
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="account-download-scope">{t('account.downloadScope')}</Label>
                      <Select
                        value={form.downloadScope}
                        onValueChange={(value) =>
                          update(
                            'downloadScope',
                            value === 'headers' || value === 'full_with_attachments'
                              ? value
                              : 'full_no_attachments',
                          )
                        }
                      >
                        <SelectTrigger id="account-download-scope">
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
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="account-sent-copy">{t('account.sentCopyMode')}</Label>
                      <Select
                        value={form.sentCopyMode}
                        onValueChange={(value) =>
                          update(
                            'sentCopyMode',
                            value === 'append' ? 'append' : value === 'none' ? 'none' : 'auto',
                          )
                        }
                      >
                        <SelectTrigger id="account-sent-copy">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['auto', 'append', 'none'] as const).map((value) => (
                            <SelectItem key={value} value={value}>
                              {t(`account.sentCopyModes.${value}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {tab === 'folders' && form.receiveProtocol === 'imap' ? (
              <>
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{t('account.specialFoldersTitle')}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('account.specialFoldersHint')}
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs">
                      {t('account.autoDetectSpecialFolders')}
                      <Switch
                        checked={form.autoDetectSpecialFolders}
                        onCheckedChange={toggleAutoDetect}
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {SPECIAL_FOLDER_FIELDS.map((field) => {
                      const value = form.autoDetectSpecialFolders
                        ? detectedPath(field.role)
                        : form.specialFolders[field.role];
                      const inputId = `account-special-${field.role}`;
                      return (
                        <div className="space-y-1.5" key={field.role}>
                          <Label htmlFor={inputId}>{t(field.labelKey)}</Label>
                          {form.autoDetectSpecialFolders ? (
                            <Input
                              id={inputId}
                              value={value || t('account.specialFolderUnresolved')}
                              disabled
                              readOnly
                            />
                          ) : (
                            <Select
                              value={value || 'none'}
                              onValueChange={(next) =>
                                updateSpecialFolder(field.role, next === 'none' ? '' : next)
                              }
                            >
                              <SelectTrigger id={inputId}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{t('account.specialFolderNone')}</SelectItem>
                                {accountFolders.map((folder) => (
                                  <SelectItem key={folder.id} value={folder.path}>
                                    {folder.path}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {form.autoDetectSpecialFolders &&
                  unresolved.some((role) => role === 'trash' || role === 'sent' || role === 'drafts') ? (
                    <p
                      className="text-[11px] text-amber-600 dark:text-amber-400"
                      role="status"
                    >
                      {t('account.specialFolderUnresolvedHint')}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MailAccountsSettingsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const message = useErrorMessage();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [testingIds, setTestingIds] = useState<ReadonlySet<string>>(() => new Set());

  const accountsQuery = useQuery({ queryKey: accountKeys.list, queryFn: fetchAccounts });
  const settingsQuery = useQuery({ queryKey: settingsKeys.detail, queryFn: fetchSettings });

  const test = useMutation({
    mutationFn: (account: Account) => testAccount(account.id),
    onMutate: (account) =>
      setTestingIds((previous) => new Set(previous).add(account.id)),
    onSettled: (_result, _error, account) =>
      setTestingIds((previous) => {
        const next = new Set(previous);
        next.delete(account.id);
        return next;
      }),
    onSuccess: (result) => {
      const summary = t('account.testSummary', {
        receive: result.receiveOk ? t('account.testOk') : t('account.testFailed'),
        smtp: result.smtpOk ? t('account.testOk') : t('account.testFailed'),
      });
      const ok = result.receiveOk && result.smtpOk;
      toast(ok ? t('account.testPassed') : t('account.testFailedTitle'), {
        description:
          result.errors.length > 0 ? `${summary} · ${result.errors.join('; ')}` : summary,
        variant: ok ? 'success' : 'destructive',
      });
    },
    onError: (error) =>
      toast(t('common.loadingFailed'), { description: message(error), variant: 'destructive' }),
  });

  const sync = useMutation({
    mutationFn: (account: Account) => requestAccountSync(account.id),
    onSuccess: () => {
      toast(t('account.syncing'));
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) =>
      toast(t('common.updateFailed'), { description: message(error), variant: 'destructive' }),
  });

  const reconcile = useMutation({
    mutationFn: (account: Account) => reconcileAccount(account.id),
    onSuccess: () => {
      toast(t('account.reconciled'));
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) =>
      toast(t('common.updateFailed'), { description: message(error), variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: (account: Account) => deleteAccount(account.id),
    onSuccess: () => {
      toast(t('account.deleted'));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
    },
    onError: (error) =>
      toast(t('common.deleteFailed'), { description: message(error), variant: 'destructive' }),
  });

  const accounts = accountsQuery.data ?? [];
  const invalidateAccounts = () => {
    void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
          <Upload className="size-4" aria-hidden="true" />
          {t('account.import.open')}
        </Button>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('account.add')}
        </Button>
      </div>

      {accountsQuery.isPending ? (
        <LoadingState />
      ) : accountsQuery.isError ? (
        <ErrorState error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<Server className="size-5" aria-hidden="true" />}
          title={t('account.emptyTitle')}
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {accounts.map((account) => (
            <li key={account.id} className="px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-medium">{account.name}</p>
                    <span className="text-[11px] text-muted-foreground">{account.email}</span>
                    <Badge
                      variant={
                        account.state === 'error'
                          ? 'destructive'
                          : account.state === 'connected'
                            ? 'secondary'
                            : 'muted'
                      }
                    >
                      {t(`account.state.${account.state}`)}
                    </Badge>
                    {account.hasOAuth ? (
                      <Badge variant="outline">
                        <ShieldCheck className="size-3" aria-hidden="true" />
                        OAuth
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t(`account.protocolOptions.${account.receiveProtocol}`)}
                    {account.imapAddr || account.pop3Addr
                      ? ` · ${account.imapAddr || account.pop3Addr}`
                      : ''}
                  </p>
                  {account.smtpAddr ? (
                    <p className="text-[11px] text-muted-foreground">SMTP · {account.smtpAddr}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t(`account.syncRanges.${account.initialSyncRange}`)} ·{' '}
                    {t(`account.downloadScopes.${account.downloadScope}`)}
                  </p>
                  {account.lastError ? (
                    <p className="mt-1 text-xs text-destructive">{account.lastError}</p>
                  ) : null}
                  {account.createdAt ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDate(account.createdAt, i18n.language, undefined, { dateStyle: 'medium' })}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => test.mutate(account)}
                    disabled={testingIds.has(account.id)}
                  >
                    <PlugZap className="size-3.5" aria-hidden="true" />
                    {t('account.testTitle')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => sync.mutate(account)}
                    disabled={sync.isPending}
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {t('account.syncNow')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => reconcile.mutate(account)}
                    disabled={reconcile.isPending}
                  >
                    {t('account.reconcile')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('account.edit')}
                    onClick={() => setEditing(account)}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('account.deleteTitle')}
                    onClick={() => setDeleting(account)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AccountWizardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultSyncRange={settingsQuery.data?.defaultInitialSyncRange}
        defaultDownloadScope={settingsQuery.data?.defaultDownloadScope}
        onSaved={(account) => {
          invalidateAccounts();
          if (account.authType !== 'oauth2') test.mutate(account);
        }}
      />

      <EmclientImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={invalidateAccounts}
      />

      {editing ? (
        <AccountFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          account={editing}
          onSaved={invalidateAccounts}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t('account.deleteTitle')}
        description={t('account.deleteDescription')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </div>
  );
}
