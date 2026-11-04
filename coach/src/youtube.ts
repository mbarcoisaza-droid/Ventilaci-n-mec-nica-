/** Utilidades de YouTube: solo se extrae el identificador para el reproductor incrustado. No se descarga nada. */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Devuelve el ID de 11 caracteres a partir de una URL o un ID; null si no es válido. */
export function parseYouTubeId(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

/** Segundo inicial indicado en la URL (t=90, t=1m30s, start=90). */
export function parseYouTubeStart(input: string): number {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    const t = url.searchParams.get('t') ?? url.searchParams.get('start');
    if (!t) return 0;
    if (/^\d+$/.test(t)) return Number(t);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m) return 0;
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  } catch {
    return 0;
  }
}

export function embedUrl(id: string, opts: { captions: boolean; start?: number; origin?: string }) {
  const p = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    autoplay: '0',
    hl: 'es',
    cc_lang_pref: 'es',
    fs: '1',
  });
  if (opts.captions) p.set('cc_load_policy', '1');
  if (opts.start) p.set('start', String(opts.start));
  if (opts.origin && /^https?:/.test(opts.origin)) p.set('origin', opts.origin);
  return `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`;
}
