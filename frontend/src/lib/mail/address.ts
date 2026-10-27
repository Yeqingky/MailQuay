export interface MailAddressLike {
  name?: string;
  email: string;
}

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:]+@[^\s@<>()[\]\\,;:]+\.[^\s@<>()[\]\\,;:]+$/;

export function formatAddress(address: MailAddressLike | undefined): string {
  if (!address) return '';
  const email = address.email?.trim() ?? '';
  const name = address.name?.trim() ?? '';
  if (!email) return name;
  return name ? `${name} <${email}>` : email;
}

export function formatAddressList(
  addresses: MailAddressLike[] | undefined,
  locale = 'en',
): string {
  if (!addresses || addresses.length === 0) return '';
  const names = addresses.map((address) => address.name?.trim() || address.email).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length <= 3) return names.join(', ');
  try {
    const list = new Intl.ListFormat(locale, { type: 'conjunction' });
    return `${list.format(names.slice(0, 2))} +${names.length - 2}`;
  } catch {
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }
}

export function parseRecipientInput(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of value.split(/[,;\n]/)) {
    let candidate = token.trim();
    if (candidate === '') continue;
    const bracket = /<([^>]+)>/.exec(candidate);
    if (bracket) candidate = bracket[1].trim();
    candidate = candidate.replace(/^mailto:/i, '');
    if (!EMAIL_PATTERN.test(candidate)) continue;
    const normalized = candidate.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(candidate);
  }
  return result;
}

export function joinRecipients(values: string[] | undefined): string {
  return values?.join(', ') ?? '';
}

export function splitRecipients(value: string): string[] {
  return parseRecipientInput(value);
}
