export function formatBytes(bytes: number, locale = 'en'): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes)} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
  return `${formatted} ${units[unit]}`;
}

export function formatDate(
  value: string | undefined,
  locale: string,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: timeZone || undefined }).format(
    date,
  );
}

export function formatListDate(
  value: string | undefined,
  locale: string,
  timeZone: string | undefined,
  now = new Date(),
): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay =
    new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone }).format(date) ===
    new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone }).format(now);
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(date);
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone,
  }).format(date);
}

export function formatRelative(
  value: string | undefined,
  locale: string,
  now = Date.now(),
): string {
  if (!value) return '';
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return '';
  const deltaSeconds = Math.round((target - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const thresholds: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.348],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
  ];
  let working = deltaSeconds;
  for (const [unit, limit] of thresholds) {
    if (Math.abs(working) < limit) {
      return formatter.format(Math.round(working), unit);
    }
    working /= limit;
  }
  return formatter.format(Math.round(working), 'year');
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function parseStoredJson<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private modes; UI state simply stays in memory.
  }
}

export function initials(value: string): string {
  const parts = value
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

const timeZoneOffsetCache = new Map<string, number>();

function timeZoneOffsetMilliseconds(utcDate: Date, timeZone: string): number {
  const cacheKey = `${timeZone}:${Math.floor(utcDate.getTime() / 900000)}`;
  const cached = timeZoneOffsetCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(utcDate);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  const offset = asUtc - utcDate.getTime();
  timeZoneOffsetCache.set(cacheKey, offset);
  return offset;
}

/**
 * Interpret a `YYYY-MM-DDTHH:mm` value in an IANA time zone and return the UTC instant.
 * Falls back to the browser time zone when the configured zone is invalid.
 */
export function zonedDateTimeToUtc(value: string, timeZone: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if ([year, month, day, hour, minute].some((part) => Number.isNaN(part))) return null;
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(naiveUtc)) return null;
  if (!timeZone) return new Date(naiveUtc);
  try {
    let candidate = naiveUtc;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const offset = timeZoneOffsetMilliseconds(new Date(candidate), timeZone);
      const next = naiveUtc - offset;
      if (next === candidate) break;
      candidate = next;
    }
    return new Date(candidate);
  } catch {
    return new Date(naiveUtc);
  }
}

export function utcToZonedInput(value: string | undefined, timeZone: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}
