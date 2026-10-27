import DOMPurify from 'dompurify';
import { darkenMailCss, darkenMailStyles } from './darkMode';

export interface SanitizeMailOptions {
  allowRemoteImages?: boolean;
  cidImages?: Record<string, string>;
  dark?: boolean;
}

// normalizeContentId strips angle brackets and percent encoding so that
// `cid:` URLs and MIME Content-ID headers compare reliably.
export function normalizeContentId(value: string): string {
  let id = value.trim();
  if (id.startsWith('<') && id.endsWith('>')) id = id.slice(1, -1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // Keep the raw value when it is not valid percent encoding.
  }
  return id.trim().toLowerCase();
}

export interface SanitizedMail {
  html: string;
  blockedRemoteImages: number;
}

const FORBID_TAGS = [
  'script',
  'style',
  'link',
  'meta',
  'base',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'video',
  'audio',
  'source',
  'track',
];

const FORBID_ATTR = [
  'srcset',
  'formaction',
  'ping',
  'xlink:href',
  'action',
  'method',
  'http-equiv',
];

function isTrackingPixel(element: Element): boolean {
  for (const name of ['width', 'height']) {
    const raw = element.getAttribute(name);
    if (raw === null) continue;
    const value = Number.parseInt(raw, 10);
    if (Number.isFinite(value) && value <= 2) return true;
  }
  const style = element.getAttribute('style') ?? '';
  const declarations = style.split(';');
  for (const declaration of declarations) {
    const [name, value] = declaration.split(':');
    if (!value) continue;
    if (!['width', 'height'].includes(name.trim().toLowerCase())) continue;
    const size = Number.parseInt(value, 10);
    if (Number.isFinite(size) && size <= 2) return true;
  }
  return false;
}

function isSmallImage(element: Element): boolean {
  let width: number | null = null;
  let height: number | null = null;
  for (const [name, target] of [
    ['width', 'width'],
    ['height', 'height'],
  ] as const) {
    const raw = element.getAttribute(name);
    if (raw !== null) {
      const value = Number.parseInt(raw, 10);
      if (Number.isFinite(value)) {
        if (target === 'width') width = value;
        else height = value;
      }
      continue;
    }
    const style = element.getAttribute('style') ?? '';
    for (const declaration of style.split(';')) {
      const [property, value] = declaration.split(':');
      if (!value || property.trim().toLowerCase() !== target) continue;
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        if (target === 'width') width = parsed;
        else height = parsed;
      }
    }
  }
  return width !== null && height !== null && width <= 24 && height <= 24;
}

function isImageDataUrl(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+[;,]/.test(value.trim().toLowerCase());
}

export function upgradeInsecureUrl(value: string, secure: boolean): string {
  if (!secure) return value;
  const trimmed = value.trimStart();
  if (!/^http:\/\//i.test(trimmed)) return value;
  const leading = value.slice(0, value.length - trimmed.length);
  return `${leading}https://${trimmed.slice(7)}`;
}

function isRemoteUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith('//')) return true;
  if (/^https?:/i.test(trimmed)) return true;
  return false;
}

/**
 * Sanitize message HTML for rendering inside a sandboxed iframe.
 * Remote images stay blocked unless explicitly allowed for the current sender,
 * and remote CSS background images are blocked unless explicitly allowed.
 */
function isBackgroundCssUrl(css: string, offset: number): boolean {
  const declarationStart = Math.max(css.lastIndexOf(';', offset - 1), css.lastIndexOf('{', offset - 1));
  const declaration = css.slice(declarationStart + 1, offset);
  const colon = declaration.indexOf(':');
  if (colon < 0) return false;
  const property = declaration.slice(0, colon).trim().toLowerCase();
  return property === 'background' || property === 'background-image';
}

// decodeCssEscapes resolves CSS escape sequences so obfuscated forms such as
// u\72l(...) or \2f\2fhost are matched by the same URL policy as plain text.
export function decodeCssEscapes(value: string): string {
  return value.replace(
    /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \n\r\t\f])?|([\s\S]))/g,
    (_match, hex: string | undefined, ch: string | undefined) => {
      if (hex) {
        const code = Number.parseInt(hex, 16);
        if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
          return '\uFFFD';
        }
        return String.fromCodePoint(code);
      }
      if (!ch) return '';
      return /[\n\r\f]/.test(ch) ? '' : ch;
    },
  );
}

// cssUrlTokens extracts url(...) values and quoted strings from an image
// function argument list.
function cssUrlTokens(args: string): string[] {
  const tokens: string[] = [];
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]*)\3/gi;
  for (const match of args.matchAll(pattern)) {
    tokens.push((match[2] ?? match[4] ?? '').trim());
  }
  return tokens;
}

function sanitizeMailCss(
  css: string,
  dark: boolean,
  allowRemoteImages: boolean,
  securePage: boolean,
): { css: string; blockedRemoteImages: number } {
  let out = decodeCssEscapes(css).replace(/[<>]/g, '').replace(/@import[^;]*;/gi, '');
  let blockedRemoteImages = 0;
  out = out.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, _quote, value: string, offset: number, source: string) => {
      const url = value.trim();
      if (isImageDataUrl(url)) return match;
      if (!isRemoteUrl(url) || !isBackgroundCssUrl(source, offset)) return 'none';
      if (!allowRemoteImages) {
        blockedRemoteImages += 1;
        return 'none';
      }
      const target = upgradeInsecureUrl(url, securePage)
        .trim()
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\n\r\f]/g, ' ');
      return `url("${target}")`;
    },
  );
  // image() and image-set() can name URLs without url(), so they get the same
  // allow/block policy instead of slipping past the url() scan.
  out = out.replace(
    /(?:-webkit-)?(?:image|image-set)\s*\(([^)]*)\)/gi,
    (match, args: string, offset: number, source: string) => {
      const tokens = cssUrlTokens(args);
      if (tokens.length === 0) return match;
      const remote = tokens.filter((token) => isRemoteUrl(token));
      const blockedLocally = tokens.some(
        (token) => !isRemoteUrl(token) && !isImageDataUrl(token),
      );
      if (blockedLocally) return 'none';
      if (remote.length === 0) return match;
      if (!isBackgroundCssUrl(source, offset)) return 'none';
      if (!allowRemoteImages) {
        blockedRemoteImages += remote.length;
        return 'none';
      }
      let rewritten = args;
      for (const token of remote) {
        const target = upgradeInsecureUrl(token, securePage);
        rewritten = rewritten.split(token).join(target);
      }
      const head = match.slice(0, match.indexOf('('));
      return `${head}(${rewritten})`;
    },
  );
  out = out
    .split(';')
    .filter((declaration) => !/expression\(|javascript:|vbscript:|behavior:|-moz-binding/i.test(declaration))
    .join(';');
  return {
    css: dark ? darkenMailCss(out) : out,
    blockedRemoteImages,
  };
}

export function sanitizeMailHtml(
  input: string,
  options: SanitizeMailOptions = {},
): SanitizedMail {
  if (!input) return { html: '', blockedRemoteImages: 0 };
  const securePage =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  const styles: string[] = [];
  let blockedRemoteImages = 0;
  const withoutStyles = input.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_match, css: string) => {
    const sanitized = sanitizeMailCss(css, options.dark === true, options.allowRemoteImages === true, securePage);
    blockedRemoteImages += sanitized.blockedRemoteImages;
    if (sanitized.css.trim() !== '') styles.push(sanitized.css);
    return '';
  });
  const clean = DOMPurify.sanitize(withoutStyles, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR,
    ADD_ATTR: ['target', 'rel', 'background'],
    ALLOW_DATA_ATTR: true,
    KEEP_CONTENT: true,
  });

  const template = document.createElement('template');
  template.innerHTML = (styles.length > 0 ? `<style>${styles.join('\n')}</style>` : '') + clean;
  if (options.dark) darkenMailStyles(template.content);

  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    const style = element.getAttribute('style');
    if (style) {
      const sanitized = sanitizeMailCss(style, options.dark === true, options.allowRemoteImages === true, securePage);
      blockedRemoteImages += sanitized.blockedRemoteImages;
      if (sanitized.css.trim() !== '') element.setAttribute('style', sanitized.css);
      else element.removeAttribute('style');
    }
    const linkTarget = element.getAttribute('href');
    const backgroundSource = element.getAttribute('background');
    if (backgroundSource !== null) {
      const secureBackground = upgradeInsecureUrl(backgroundSource.trim(), securePage);
      if (isRemoteUrl(secureBackground)) {
        if (options.allowRemoteImages) {
          element.setAttribute('background', secureBackground);
        } else {
          element.removeAttribute('background');
          blockedRemoteImages += 1;
        }
      } else {
        element.removeAttribute('background');
      }
    }
    if (element.tagName === 'A' && linkTarget) {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
      if (/^(javascript|data|vbscript):/i.test(linkTarget.trim())) {
        element.removeAttribute('href');
      }
    }
    if (element.tagName === 'IMG') {
      const sourceAttribute = element.getAttribute('src');
      const lazySourceAttribute = element.getAttribute('data-src');
      const source = sourceAttribute?.trim()
        ? sourceAttribute
        : lazySourceAttribute?.trim()
          ? lazySourceAttribute
          : '';
      const secureSource = upgradeInsecureUrl(source, securePage);
      if (isRemoteUrl(secureSource)) {
        if (options.allowRemoteImages) {
          element.setAttribute('src', secureSource);
          element.removeAttribute('data-src');
          element.removeAttribute('data-blocked-src');
        } else if (isTrackingPixel(element)) {
          element.remove();
        } else {
          blockedRemoteImages += 1;
          if (isSmallImage(element)) {
            element.remove();
          } else {
            element.removeAttribute('src');
            element.removeAttribute('data-src');
            element.setAttribute('data-blocked-src', secureSource);
            element.setAttribute('alt', element.getAttribute('alt') || '');
          }
        }
      } else if (/^cid:/i.test(source)) {
        const resolved = options.cidImages?.[normalizeContentId(source.slice(4))];
        if (resolved) {
          element.setAttribute('src', resolved);
          element.removeAttribute('data-src');
          element.removeAttribute('data-blocked-src');
        } else {
          element.remove();
        }
      } else if (isImageDataUrl(source)) {
        element.setAttribute('src', source);
        element.removeAttribute('data-src');
        element.removeAttribute('data-blocked-src');
      } else {
        element.removeAttribute('src');
        element.removeAttribute('data-src');
        element.removeAttribute('data-blocked-src');
      }
    }
  }

  return { html: template.innerHTML, blockedRemoteImages };
}

const DRAFT_FORBID_ATTR = [...FORBID_ATTR, 'class', 'id', 'background'];

// A draft is rendered in the application document, so positioning longhands are
// dropped: they could lift the content out of the editor and cover the UI.
const BLOCKED_STYLE_PROPERTIES = new Set([
  'position',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
]);

function sanitizeDraftStyle(style: string, securePage: boolean): string {
  const declarations = decodeCssEscapes(style)
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const colon = declaration.indexOf(':');
      if (colon < 0) return false;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      return !BLOCKED_STYLE_PROPERTIES.has(property);
    });
  return sanitizeMailCss(declarations.join('; '), false, false, securePage).css;
}

/**
 * Prepare existing draft markup for the compose editor. Unlike quoted mail it
 * keeps inline formatting and data: images, but removes style blocks,
 * class/id/background attributes and positioning, so only the unsafe parts of
 * the markup are dropped instead of rewriting the draft.
 */
export function sanitizeDraftHtml(input: string): string {
  if (!input) return '';
  const securePage =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  const template = document.createElement('template');
  template.innerHTML = DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR: DRAFT_FORBID_ATTR,
    KEEP_CONTENT: true,
  });
  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    const style = element.getAttribute('style');
    if (style !== null) {
      const cleaned = sanitizeDraftStyle(style, securePage).trim();
      if (cleaned !== '') element.setAttribute('style', cleaned);
      else element.removeAttribute('style');
    }
    if (element.tagName === 'IMG') {
      const source = element.getAttribute('src') ?? '';
      if (!isImageDataUrl(source)) element.remove();
    }
  }
  return template.innerHTML;
}

/**
 * Prepare quoted mail markup for the compose editor, which renders inside the
 * application document. Style blocks, style/class/id/background attributes and
 * images are removed because mail CSS could otherwise cover or restyle the
 * application UI, and image sources could trigger requests from the app origin.
 */
export function sanitizeQuotedHtml(input: string): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [...FORBID_TAGS, 'img', 'picture', 'svg', 'math'],
    FORBID_ATTR: [...FORBID_ATTR, 'style', 'class', 'id', 'background'],
    ALLOW_DATA_ATTR: true,
    KEEP_CONTENT: true,
  });
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0">${escaped}</pre>`;
}

export function createMailFrameDocument(bodyHtml: string, dark = false): string {
  const scheme = dark ? 'dark' : 'light';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="${scheme}"><base target="_blank"><style>
    :root { color-scheme: ${scheme}; }
    html, body { margin: 0; padding: 0; background: transparent; }
    body { padding: 20px; font: 14px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans SC", sans-serif; color: CanvasText; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    img[data-blocked-src] { display: inline-block; min-width: 16px; min-height: 16px; border: 1px dashed GrayText; border-radius: 6px; background: transparent; }
    a { color: LinkText; }
    table { max-width: 100%; border-collapse: collapse; }
    td, th { padding: 2px; }
    blockquote { margin: 0 0 0 0.75rem; padding-left: 0.75rem; border-left: 3px solid GrayText; color: GrayText; }
    pre { white-space: pre-wrap; word-break: break-word; }
    :focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
  </style></head><body>${bodyHtml}</body></html>`;
}
