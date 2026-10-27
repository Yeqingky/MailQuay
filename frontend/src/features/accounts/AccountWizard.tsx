import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronLeft, Loader2, Radar, ShieldCheck } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import {
  createAccount,
  discoverAccount,
  oauthStartUrl,
  type Account,
  type AccountInput,
  type DiscoveryResult,
} from '@/features/accounts/api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADDRESS_PATTERN = /^(?:\[[0-9a-fA-F:]+\]|[^\s:]+):\d{1,5}$/;

type WizardStep = 'account' | 'servers' | 'auth' | 'sync';

const STEPS: WizardStep[] = ['account', 'servers', 'auth', 'sync'];

interface WizardState {
  email: string;
  password: string;
  name: string;
  provider: string;
  authType: NonNullable<AccountInput['authType']>;
  oauthProvider: NonNullable<AccountInput['oauthProvider']>;
  receiveProtocol: NonNullable<AccountInput['receiveProtocol']>;
  imapAddr: string;
  imapSecurity: NonNullable<AccountInput['imapSecurity']>;
  pop3Addr: string;
  pop3Security: NonNullable<AccountInput['pop3Security']>;
  smtpAddr: string;
  smtpSecurity: NonNullable<AccountInput['smtpSecurity']>;
  receiveUsername: string;
  receivePassword: string;
  smtpUsername: string;
  smtpPassword: string;
  initialSyncRange: NonNullable<AccountInput['initialSyncRange']>;
}

function initialState(
  defaultSyncRange: AccountInput['initialSyncRange'] | undefined,
  defaultDownloadScope: AccountInput['downloadScope'] | undefined,
): { form: WizardState; downloadScope: NonNullable<AccountInput['downloadScope']> } {
  return {
    form: {
      email: '',
      password: '',
      name: '',
      provider: '',
      authType: 'password',
      oauthProvider: 'google',
      receiveProtocol: 'imap',
      imapAddr: '',
      imapSecurity: 'implicit_tls',
      pop3Addr: '',
      pop3Security: 'implicit_tls',
      smtpAddr: '',
      smtpSecurity: 'implicit_tls',
      receiveUsername: '',
      receivePassword: '',
      smtpUsername: '',
      smtpPassword: '',
      initialSyncRange: defaultSyncRange ?? 'all',
    },
    downloadScope: defaultDownloadScope ?? 'full_no_attachments',
  };
}

export function AccountWizardDialog({
  open,
  onOpenChange,
  defaultSyncRange,
  defaultDownloadScope,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSyncRange: AccountInput['initialSyncRange'] | undefined;
  defaultDownloadScope: AccountInput['downloadScope'] | undefined;
  onSaved: (account: Account) => void;
}) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [step, setStep] = useState<WizardStep>('account');
  const [form, setForm] = useState<WizardState>(() => initialState(defaultSyncRange, defaultDownloadScope).form);
  const [downloadScope, setDownloadScope] = useState<NonNullable<AccountInput['downloadScope']>>(
    () => initialState(defaultSyncRange, defaultDownloadScope).downloadScope,
  );
  const [detected, setDetected] = useState<DiscoveryResult | null>(null);
  const [detectedEmail, setDetectedEmail] = useState('');

  useEffect(() => {
    if (!open) return;
    const reset = initialState(defaultSyncRange, defaultDownloadScope);
    setStep('account');
    setForm(reset.form);
    setDownloadScope(reset.downloadScope);
    setDetected(null);
    setDetectedEmail('');
  }, [defaultDownloadScope, defaultSyncRange, open]);

  const update = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const discovery = useMutation({ mutationFn: discoverAccount });

  const create = useMutation({
    mutationFn: (input: AccountInput) => createAccount(input),
    onSuccess: (saved) => {
      toast(t('account.created'));
      onSaved(saved);
      onOpenChange(false);
      if (form.authType === 'oauth2') {
        window.location.assign(oauthStartUrl(form.oauthProvider, saved.id));
      }
    },
    onError: (errorValue) =>
      toast(t('common.saveFailed'), { description: message(errorValue), variant: 'destructive' }),
  });

  const applyDetection = (result: DiscoveryResult, email: string) => {
    setDetected(result);
    setDetectedEmail(email.trim().toLowerCase());
    const oauth = result.oauthProvider;
    setForm((previous) => ({
      ...previous,
      provider: result.provider,
      authType: oauth ? 'oauth2' : 'password',
      oauthProvider: oauth ?? previous.oauthProvider,
      receiveProtocol: result.receiveProtocol,
      imapAddr: result.imap?.addr ?? '',
      imapSecurity: result.imap?.security ?? 'implicit_tls',
      pop3Addr: result.pop3?.addr ?? '',
      pop3Security: result.pop3?.security ?? 'implicit_tls',
      smtpAddr: result.smtp?.addr ?? '',
      smtpSecurity: result.smtp?.security ?? 'implicit_tls',
    }));
  };

  const fail = (description: string) =>
    toast(t('common.saveFailed'), { description, variant: 'destructive' });

  const goNext = async () => {
    if (step === 'account') {
      const email = form.email.trim();
      if (!EMAIL_PATTERN.test(email)) {
        fail(t('account.formErrors.email'));
        return;
      }
      if (!detected || detectedEmail !== email.toLowerCase()) {
        const previousEmail = detectedEmail;
        try {
          const result = await discovery.mutateAsync(email);
          applyDetection(result, email);
          if (!result.oauthProvider && form.password === '') {
            fail(t('account.formErrors.password'));
            return;
          }
          setForm((previous) => ({
            ...previous,
            email,
            receiveUsername:
              previous.receiveUsername === '' || previous.receiveUsername === previousEmail
                ? email
                : previous.receiveUsername,
            smtpUsername:
              previous.smtpUsername === '' || previous.smtpUsername === previousEmail
                ? email
                : previous.smtpUsername,
            receivePassword: previous.receivePassword || previous.password,
            smtpPassword: previous.smtpPassword || previous.password,
          }));
        } catch (errorValue) {
          fail(message(errorValue));
          return;
        }
        setStep('servers');
        return;
      }
      if (!detected.oauthProvider && form.password === '') {
        fail(t('account.formErrors.password'));
        return;
      }
      setStep('servers');
      return;
    }

    if (step === 'servers') {
      if (form.receiveProtocol === 'imap' && !ADDRESS_PATTERN.test(form.imapAddr.trim())) {
        fail(t('account.formErrors.imapAddr'));
        return;
      }
      if (form.receiveProtocol === 'pop3' && !ADDRESS_PATTERN.test(form.pop3Addr.trim())) {
        fail(t('account.formErrors.pop3Addr'));
        return;
      }
      if (!ADDRESS_PATTERN.test(form.smtpAddr.trim())) {
        fail(t('account.formErrors.smtpAddr'));
        return;
      }
      setStep('auth');
      return;
    }

    if (step === 'auth') {
      if (form.authType === 'password') {
        if (form.receiveUsername.trim() === '' || form.receivePassword === '') {
          fail(t('account.wizard.errors.receiveCredentials'));
          return;
        }
        if (form.smtpUsername.trim() === '' || form.smtpPassword === '') {
          fail(t('account.wizard.errors.smtpCredentials'));
          return;
        }
      }
      const currentEmail = form.email.trim();
      setForm((previous) => ({
        ...previous,
        name:
          previous.name.trim() === '' || previous.name === previous.email.trim()
            ? currentEmail
            : previous.name,
      }));
      setStep('sync');
    }
  };

  const submit = () => {
    const email = form.email.trim();
    const input: AccountInput = {
      name: form.name.trim() || email,
      email,
      provider: form.provider.trim() || undefined,
      username: form.authType === 'password' ? form.receiveUsername.trim() : email,
      authType: form.authType,
      receiveProtocol: form.receiveProtocol,
      imapAddr: form.receiveProtocol === 'imap' ? form.imapAddr.trim() : undefined,
      imapSecurity: form.receiveProtocol === 'imap' ? form.imapSecurity : undefined,
      pop3Addr: form.receiveProtocol === 'pop3' ? form.pop3Addr.trim() : undefined,
      pop3Security: form.receiveProtocol === 'pop3' ? form.pop3Security : undefined,
      smtpAddr: form.smtpAddr.trim(),
      smtpSecurity: form.smtpSecurity,
      syncEnabled: true,
      initialSyncRange: form.initialSyncRange,
      downloadScope,
      sentCopyMode: 'auto',
    };
    if (form.authType === 'password') {
      input.password = form.receivePassword;
      input.smtpUsername = form.smtpUsername.trim();
      input.smtpPassword = form.smtpPassword;
    } else {
      input.oauthProvider = form.oauthProvider;
    }
    create.mutate(input);
  };

  const stepIndex = STEPS.indexOf(step);
  const isOAuth = form.authType === 'oauth2';
  const sourceLabel = detected
    ? t(`account.wizard.sources.${detected.source}`)
    : t('account.wizard.sources.none');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('account.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('account.wizard.stepOf', {
              current: stepIndex + 1,
              total: STEPS.length,
              step: t(`account.wizard.steps.${step}`),
            })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea containerClassName="min-h-0 flex-1" className="pr-1">
          {step === 'account' ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="wizard-mailbox">{t('account.email')}</Label>
                <CredentialField
                  id="wizard-mailbox"
                  inputMode="email"
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard-secret">{t('account.password')}</Label>
                <CredentialField
                  id="wizard-secret"
                  value={form.password}
                  onChange={(event) => update('password', event.target.value)}
                  required={!detected?.oauthProvider}
                />
              </div>
              {detected ? (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Radar className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="text-muted-foreground">{sourceLabel}</span>
                    {detected.oauthProvider ? (
                      <Badge variant="outline">
                        <ShieldCheck className="size-3" aria-hidden="true" />
                        {t('account.auth.oauth2')}
                      </Badge>
                    ) : null}
                  </div>
                  {detected.oauthProvider ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t('account.wizard.oauthDetected', {
                        provider:
                          detected.oauthProvider === 'microsoft' ? 'Microsoft' : 'Google',
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'servers' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{sourceLabel}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={discovery.isPending}
                  onClick={async () => {
                    try {
                      const result = await discovery.mutateAsync(form.email.trim());
                      applyDetection(result, form.email);
                    } catch (errorValue) {
                      fail(message(errorValue));
                    }
                  }}
                >
                  {discovery.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Radar className="size-3.5" aria-hidden="true" />
                  )}
                  {t('account.wizard.redetect')}
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard-protocol">{t('account.protocol')}</Label>
                <Select
                  value={form.receiveProtocol}
                  onValueChange={(value) =>
                    update('receiveProtocol', value === 'pop3' ? 'pop3' : 'imap')
                  }
                >
                  <SelectTrigger id="wizard-protocol" className="w-52">
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
                    <Label htmlFor="wizard-imap-addr">{t('account.imapAddr')}</Label>
                    <Input
                      id="wizard-imap-addr"
                      value={form.imapAddr}
                      onChange={(event) => update('imapAddr', event.target.value)}
                      placeholder={t('account.addrExamples.imap')}
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wizard-imap-security">{t('account.imapSecurity')}</Label>
                    <Select
                      value={form.imapSecurity}
                      onValueChange={(value) =>
                        update(
                          'imapSecurity',
                          value === 'starttls' ? 'starttls' : value === 'none' ? 'none' : 'implicit_tls',
                        )
                      }
                    >
                      <SelectTrigger id="wizard-imap-security">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['implicit_tls', 'starttls', 'none'] as const).map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(`account.securityOptions.${value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wizard-pop3-addr">{t('account.pop3Addr')}</Label>
                    <Input
                      id="wizard-pop3-addr"
                      value={form.pop3Addr}
                      onChange={(event) => update('pop3Addr', event.target.value)}
                      placeholder={t('account.addrExamples.pop3')}
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wizard-pop3-security">{t('account.pop3Security')}</Label>
                    <Select
                      value={form.pop3Security}
                      onValueChange={(value) =>
                        update(
                          'pop3Security',
                          value === 'starttls' ? 'starttls' : value === 'none' ? 'none' : 'implicit_tls',
                        )
                      }
                    >
                      <SelectTrigger id="wizard-pop3-security">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['implicit_tls', 'starttls', 'none'] as const).map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(`account.securityOptions.${value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs">
                <span className="text-muted-foreground">{t('account.wizard.sendProtocol')}</span>
                <span className="font-medium">SMTP</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wizard-smtp-addr">{t('account.smtpAddr')}</Label>
                  <Input
                    id="wizard-smtp-addr"
                    value={form.smtpAddr}
                    onChange={(event) => update('smtpAddr', event.target.value)}
                    placeholder={t('account.addrExamples.smtp')}
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wizard-smtp-security">{t('account.smtpSecurity')}</Label>
                  <Select
                    value={form.smtpSecurity}
                    onValueChange={(value) =>
                      update(
                        'smtpSecurity',
                        value === 'starttls' ? 'starttls' : value === 'none' ? 'none' : 'implicit_tls',
                      )
                    }
                  >
                    <SelectTrigger id="wizard-smtp-security">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['implicit_tls', 'starttls', 'none'] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`account.securityOptions.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{t('account.addressHint')}</p>
              {[form.imapSecurity, form.pop3Security, form.smtpSecurity].some(
                (value) => value === 'none',
              ) ? (
                <p className="text-[11px] text-destructive">{t('account.insecureWarning')}</p>
              ) : null}
            </div>
          ) : null}

          {step === 'auth' ? (
            <div className="space-y-3">
              {isOAuth ? (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    <p className="text-sm font-medium">{t('account.auth.oauth2')}</p>
                    <Badge variant="outline">
                      {form.oauthProvider === 'microsoft' ? 'Microsoft' : 'Google'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t('account.wizard.oauthAfterCreate')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 rounded-lg border p-3">
                    <p className="text-xs font-medium">{t('account.wizard.receiveAuth')}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="wizard-receive-username">{t('account.username')}</Label>
                        <Input
                          id="wizard-receive-username"
                          value={form.receiveUsername}
                          onChange={(event) => update('receiveUsername', event.target.value)}
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
                        <Label htmlFor="wizard-receive-secret">{t('account.password')}</Label>
                        <CredentialField
                          id="wizard-receive-secret"
                          value={form.receivePassword}
                          onChange={(event) => update('receivePassword', event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border p-3">
                    <p className="text-xs font-medium">{t('account.wizard.smtpAuth')}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="wizard-smtp-username">{t('account.username')}</Label>
                        <Input
                          id="wizard-smtp-username"
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
                        <Label htmlFor="wizard-smtp-secret">{t('account.password')}</Label>
                        <CredentialField
                          id="wizard-smtp-secret"
                          value={form.smtpPassword}
                          onChange={(event) => update('smtpPassword', event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t('account.wizard.authHint')}</p>
                </>
              )}
            </div>
          ) : null}

          {step === 'sync' ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="wizard-name">{t('account.name')}</Label>
                <Input
                  id="wizard-name"
                  value={form.name || form.email}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder={form.email}
                />
                <p className="text-[11px] text-muted-foreground">{t('account.wizard.nameHint')}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard-sync-range">{t('account.syncRange')}</Label>
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
                  <SelectTrigger id="wizard-sync-range" className="w-52">
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
            </div>
          ) : null}
        </ScrollArea>

        <DialogFooter>
          {step === 'account' ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="gap-1.5"
              disabled={create.isPending}
              onClick={() => setStep(STEPS[stepIndex - 1])}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              {t('common.back')}
            </Button>
          )}
          {step === 'sync' ? (
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isOAuth ? t('account.wizard.createAndAuthorize') : t('common.create')}
              {isOAuth ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
            </Button>
          ) : (
            <Button
              className="gap-1.5"
              onClick={() => void goNext()}
              disabled={discovery.isPending}
            >
              {discovery.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {step === 'account' && !detected
                ? t('account.wizard.detect')
                : t('account.wizard.next')}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
