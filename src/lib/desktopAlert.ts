export type NotifyPermission = NotificationPermission | 'unsupported';
export type AlertResult = 'shown' | 'not_enabled' | 'blocked' | 'framed' | 'unsupported' | 'failed';

const ALERT_HASH = '#/health';

export function notifyPermission(): NotifyPermission {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export function inFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!('Notification' in window)) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') void workerRegistration();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function watchNotifyPermission(onChange: (p: NotifyPermission) => void): () => void {
  let status: PermissionStatus | null = null;
  const update = () => onChange(notifyPermission());
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((s) => {
      status = s;
      s.addEventListener('change', update);
    })
    .catch(() => {});
  window.addEventListener('focus', update);
  return () => {
    status?.removeEventListener('change', update);
    window.removeEventListener('focus', update);
  };
}

export function listenForAlertClicks(): () => void {
  if (!('serviceWorker' in navigator)) return () => {};
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === 'open-hash' && typeof e.data.hash === 'string') window.location.hash = e.data.hash;
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}

async function workerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing?.active) return existing;
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export function pageInBackground(): boolean {
  return document.hidden || !document.hasFocus();
}

export async function showDesktopAlert(title: string, body: string): Promise<AlertResult> {
  const permission = notifyPermission();
  if (permission === 'unsupported') return 'unsupported';
  if (permission !== 'granted') return inFrame() ? 'framed' : permission === 'denied' ? 'blocked' : 'not_enabled';

  // A unique tag makes every alert pop up again instead of silently replacing the previous one.
  const options: NotificationOptions = { body, tag: `missed-copy-${Date.now()}`, requireInteraction: true, data: { hash: ALERT_HASH } };

  const registration = await workerRegistration();
  if (registration) {
    try {
      await registration.showNotification(title, options);
      return 'shown';
    } catch {
      // Fall through to the page-level notification below.
    }
  }

  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      window.location.hash = ALERT_HASH;
      n.close();
    };
    return 'shown';
  } catch {
    return 'failed';
  }
}

export function flashTitle(alertText: string): () => void {
  const original = document.title;
  let on = false;
  const id = setInterval(() => {
    on = !on;
    document.title = on ? alertText : original;
  }, 1000);
  return () => {
    clearInterval(id);
    document.title = original;
  };
}
