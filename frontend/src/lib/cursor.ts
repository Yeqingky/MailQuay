export interface CompositeCursorState {
  cursors: Record<string, string | undefined>;
  exhausted: string[];
}

interface CursorEnvelope {
  v: 1;
  state: unknown;
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Encode opaque client-side pagination state. The API cursor itself remains opaque;
 * this wrapper only composes per-mailbox cursors for cross-account views.
 */
export function encodeCursor(state: unknown): string {
  const envelope: CursorEnvelope = { v: 1, state };
  return toBase64Url(JSON.stringify(envelope));
}

export function decodeCursor<T>(
  cursor: string | undefined,
  isValid: (value: unknown) => value is T,
): T | null {
  if (!cursor) return null;
  const raw = fromBase64Url(cursor);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('v' in parsed) ||
      parsed.v !== 1 ||
      !('state' in parsed)
    ) {
      return null;
    }
    return isValid(parsed.state) ? parsed.state : null;
  } catch {
    return null;
  }
}

function isRecordOfOptionalStrings(value: unknown): value is Record<string, string | undefined> {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value).every((entry) => entry === undefined || typeof entry === 'string');
}

export function isCompositeCursorState(value: unknown): value is CompositeCursorState {
  if (typeof value !== 'object' || value === null) return false;
  if (!('cursors' in value) || !isRecordOfOptionalStrings(value.cursors)) return false;
  if (!('exhausted' in value) || !Array.isArray(value.exhausted)) return false;
  return value.exhausted.every((entry) => typeof entry === 'string');
}
