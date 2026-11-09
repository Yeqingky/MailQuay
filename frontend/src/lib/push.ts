import { api, unwrap } from '@/lib/api/client';

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function sameApplicationServerKey(
  subscription: PushSubscription,
  key: Uint8Array<ArrayBuffer>,
): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  if (bytes.length !== key.length) return false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== key[index]) return false;
  }
  return true;
}

async function subscribe(sound: boolean): Promise<boolean> {
  if (
    !pushSupported() ||
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted'
  ) {
    return false;
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const vapid = unwrap(await api.GET('/push/vapid'));
  const applicationServerKey = urlBase64ToUint8Array(vapid.publicKey);

  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameApplicationServerKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) return false;

  const result = await api.POST('/push/subscriptions', {
    body: {
      endpoint: subscription.endpoint,
      keys: { p256dh, auth },
      sound,
    },
  });
  if (!result.response.ok) unwrap(result);
  return true;
}

export async function ensurePushSubscription(sound: boolean): Promise<boolean> {
  try {
    return await subscribe(sound);
  } catch {
    return false;
  }
}

export async function removePushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  let subscription: PushSubscription | null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    subscription = (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return;
  }
  if (!subscription) return;

  try {
    const result = await api.DELETE('/push/subscriptions', {
      params: { query: { endpoint: subscription.endpoint } },
    });
    if (!result.response.ok) unwrap(result);
  } catch {
    // Expired subscriptions are removed by the server on the next push.
  }
  await subscription.unsubscribe().catch(() => false);
}
