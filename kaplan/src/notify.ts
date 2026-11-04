/** Notificaciones del sistema y sonido de alarma (solo mientras la app está abierta). */

export const notifSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notifPermission = (): NotificationPermission | 'unsupported' => (notifSupported() ? Notification.permission : 'unsupported');

export async function requestNotif(): Promise<NotificationPermission | 'unsupported'> {
  if (!notifSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showNotif(title: string, body: string, tag: string) {
  if (notifPermission() !== 'granted') return false;
  const opts: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png', vibrate: [300, 150, 300], renotify: true, requireInteraction: true,
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.showNotification(title, opts);
      return true;
    }
  } catch {
    /* se intenta el constructor */
  }
  try {
    new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}

let ctx: AudioContext | null = null;
export function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + i * 0.35);
      o.stop(t0 + i * 0.35 + 0.3);
    }
  } catch {
    /* sin audio */
  }
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* sin vibración */
  }
}

/** Desbloquea el audio tras un gesto del usuario (requisito de los navegadores móviles). */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* nada */
  }
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
