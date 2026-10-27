import { useEffect, useMemo, useState } from 'react';
import { normalizeContentId } from '@/lib/mail/sanitize';
import type { Schemas } from '@/lib/api/client';
import { messageAttachmentUrl } from './downloads';

type Attachment = Schemas['Attachment'];

function isInlineImage(attachment: Attachment): boolean {
  return Boolean(attachment.contentId) && attachment.contentType.startsWith('image/');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error('read blob failed'));
  reader.readAsDataURL(blob);
  return promise;
}

// useCidImages turns inline attachments referenced by `cid:` URLs into data
// URLs. The sandboxed mail frame has an opaque origin, so fetching attachment
// bytes here, in the authenticated app, keeps cookies and CSP simple.
export function useCidImages(
  messageId: string | undefined,
  attachments: Attachment[] | undefined,
): Record<string, string> {
  const inlineImages = useMemo(
    () => (attachments ?? []).filter(isInlineImage),
    [attachments],
  );
  const key = useMemo(
    () => inlineImages.map((attachment) => `${attachment.id}:${attachment.contentId}`).join('|'),
    [inlineImages],
  );
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    setImages({});
    if (!messageId || inlineImages.length === 0) return;

    let cancelled = false;
    const controller = new AbortController();
    void Promise.all(
      inlineImages.map(async (attachment) => {
        try {
          const response = await fetch(messageAttachmentUrl(messageId, attachment.id), {
            credentials: 'include',
            signal: controller.signal,
          });
          if (!response.ok) return null;
          const dataUrl = await blobToDataUrl(await response.blob());
          return [normalizeContentId(attachment.contentId ?? ''), dataUrl] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const resolved: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) resolved[entry[0]] = entry[1];
      }
      setImages(resolved);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // inlineImages is represented by the stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, key]);

  return images;
}
