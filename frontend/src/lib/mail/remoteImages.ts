const STORAGE_KEY = 'mailquay:remote-image-senders';

function readAllowed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function senderKey(email: string | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isSenderImagesAllowed(email: string | undefined): boolean {
  const key = senderKey(email);
  if (!key) return false;
  return readAllowed().includes(key);
}

export function allowSenderImages(email: string | undefined): void {
  const key = senderKey(email);
  if (!key || typeof window === 'undefined') return;
  const allowed = readAllowed();
  if (!allowed.includes(key)) {
    allowed.push(key);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allowed));
  }
}
