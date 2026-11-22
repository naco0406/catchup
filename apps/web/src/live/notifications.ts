import { call } from './api';

export const canNotify = () => isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const bytes = (s: string) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));

/** 누른 순간에 불러야 허락 창이 떠요 */
export async function turnOnNotifications(): Promise<boolean> {
  if (!canNotify() || (await Notification.requestPermission()) !== 'granted') return false;
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    const reg = await navigator.serviceWorker.ready;
    const { public_key } = await call<{ public_key: string }>('GET', '/me/push');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(public_key) });
    await call('POST', '/me/push', { endpoint: sub.endpoint, p256dh: b64(sub.getKey('p256dh')!), auth: b64(sub.getKey('auth')!) });
    return true;
  } catch { return false; }
}
