import { useMemo } from 'react';
import { createMailFrameDocument, sanitizeMailHtml, textToHtml } from '@/lib/mail/sanitize';
import { useResolvedTheme } from '@/hooks/useResolvedTheme';

export interface MailFrameState {
  documentHtml: string;
  blockedRemoteImages: number;
}

// useMailFrame sanitizes the message body and builds the sandboxed frame
// document in one pass, so the reader can show its remote image controls from
// the same result that produced the body. Keeping both values together avoids
// state that can lag behind the rendered frame.
export function useMailFrame({
  html,
  text,
  allowRemoteImages = false,
  cidImages,
}: {
  html?: string;
  text?: string;
  allowRemoteImages?: boolean;
  cidImages?: Record<string, string>;
}): MailFrameState {
  const dark = useResolvedTheme() === 'dark';

  return useMemo(() => {
    const options = { allowRemoteImages, cidImages, dark };
    const source = html && html.trim() !== '' ? html : textToHtml(text ?? '');
    const sanitized = sanitizeMailHtml(source, options);
    if (!html?.trim() || sanitized.html.trim() !== '' || !text?.trim()) {
      return {
        documentHtml: createMailFrameDocument(sanitized.html, dark),
        blockedRemoteImages: sanitized.blockedRemoteImages,
      };
    }

    // Sanitization can remove an HTML-only executable body; retain its safe text alternative.
    const fallback = sanitizeMailHtml(textToHtml(text), options);
    return {
      documentHtml: createMailFrameDocument(fallback.html, dark),
      blockedRemoteImages: sanitized.blockedRemoteImages,
    };
  }, [allowRemoteImages, cidImages, dark, html, text]);
}

export function MailFrame({
  documentHtml,
  title,
  className,
}: {
  documentHtml: string;
  title: string;
  className?: string;
}) {
  return (
    <iframe
      key={documentHtml}
      title={title}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={documentHtml}
      className={className}
      style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
    />
  );
}
