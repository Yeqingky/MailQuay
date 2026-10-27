import { useMutation } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/toast';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import {
  applyEmclientImport,
  parseEmclientImport,
  type EmclientImportPreview,
} from '@/features/accounts/api';

const REASON_KEYS: Record<string, true> = {
  duplicate: true,
  oauth2: true,
  no_password: true,
  decrypt_failed: true,
  invalid: true,
};

export function EmclientImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [file, setFile] = useState<File | null>(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [preview, setPreview] = useState<EmclientImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) return;
    setFile(null);
    setMasterPassword('');
    setPreview(null);
    setSelected(new Set());
  }, [open]);

  const parse = useMutation({
    mutationFn: () => {
      if (!file) throw new Error(t('account.import.fileRequired'));
      return parseEmclientImport(file, masterPassword);
    },
    onSuccess: (result) => {
      setPreview(result);
      setSelected(new Set(result.accounts.filter((account) => account.importable && account.selected).map((account) => account.email)));
    },
    onError: (error) =>
      toast(t('account.import.parseFailed'), { description: message(error), variant: 'destructive' }),
  });

  const apply = useMutation({
    mutationFn: () => applyEmclientImport(preview!.importId, [...selected]),
    onSuccess: (result) => {
      onImported();
      onOpenChange(false);
      const failed = result.failed.length;
      const created = result.created.length;
      if (created > 0) {
        toast(t('account.import.imported', { count: created }), {
          description: failed > 0 ? t('account.import.partial', { failed }) : undefined,
          variant: failed > 0 ? 'destructive' : 'default',
        });
      } else {
        toast(t('account.import.nothingImported'), {
          description: failed > 0 ? t('account.import.partial', { failed }) : undefined,
          variant: 'destructive',
        });
      }
    },
    onError: (error) =>
      toast(t('account.import.importFailed'), { description: message(error), variant: 'destructive' }),
  });

  const toggle = (email: string, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(email);
      else next.delete(email);
      return next;
    });
  };

  const importableCount = preview
    ? preview.accounts.filter((account) => account.importable).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('account.import.title')}</DialogTitle>
          <DialogDescription>{t('account.import.description')}</DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="emclient-file">{t('account.import.file')}</Label>
              <Input
                id="emclient-file"
                type="file"
                accept=".dat,.db,.zip,application/octet-stream,application/zip"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  parse.reset();
                }}
              />
              <p className="text-xs text-muted-foreground">{t('account.import.fileHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emclient-master-password">{t('account.import.masterPassword')}</Label>
              <Input
                id="emclient-master-password"
                type="password"
                autoComplete="off"
                value={masterPassword}
                onChange={(event) => setMasterPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('account.import.masterPasswordHint')}</p>
            </div>
            {parse.isPending ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t('account.import.parsing')}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('account.import.found', { count: preview.accounts.length })}
              </span>
              <span className="text-muted-foreground">
                {t('account.import.selectedCount', { count: selected.size })}
              </span>
            </div>
            <ScrollArea as="ul" className="max-h-80 divide-y rounded-md border">
              {preview.accounts.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">{t('account.import.empty')}</li>
              ) : (
                preview.accounts.map((account) => {
                  const reason = account.reason && REASON_KEYS[account.reason] ? account.reason : 'invalid';
                  return (
                    <li
                      key={account.email}
                      className={`flex items-center gap-3 px-3 py-2 ${account.importable ? '' : 'text-muted-foreground'}`}
                    >
                      <Checkbox
                        id={`emclient-${account.email}`}
                        checked={account.importable && selected.has(account.email)}
                        disabled={!account.importable || apply.isPending}
                        onCheckedChange={(checked) => toggle(account.email, checked === true)}
                      />
                      <Label
                        htmlFor={`emclient-${account.email}`}
                        className="min-w-0 flex-1 truncate font-normal"
                        title={account.email}
                      >
                        {account.email}
                      </Label>
                      {!account.importable ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t(`account.import.reasons.${reason}`)}
                        </span>
                      ) : null}
                    </li>
                  );
                })
              )}
            </ScrollArea>
            <p className="text-xs text-muted-foreground">{t('account.import.oauthHint')}</p>
          </div>
        )}

        <DialogFooter>
          {!preview ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={parse.isPending}>
                {t('common.cancel')}
              </Button>
              <Button
                className="gap-2"
                onClick={() => parse.mutate()}
                disabled={!file || parse.isPending}
              >
                {parse.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
                {parse.isPending ? t('account.import.parsing') : t('account.import.parse')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setSelected(new Set());
                }}
                disabled={apply.isPending}
              >
                {t('account.import.back')}
              </Button>
              <Button
                className="gap-2"
                onClick={() => apply.mutate()}
                disabled={selected.size === 0 || apply.isPending || importableCount === 0}
              >
                {apply.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
                {apply.isPending
                  ? t('account.import.importing')
                  : t('account.import.apply', { count: selected.size })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
