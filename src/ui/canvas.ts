import { useCallback, useEffect, useRef } from 'react';

// Los colores se leen de los tokens CSS y se guardan en caché: leer estilos en cada fotograma
// fuerza recálculos de estilo y produce tirones en la animación.
const varCache = new Map<string, { v: string; t: number }>();
export function cssVar(name: string): string {
  const now = performance.now();
  const c = varCache.get(name);
  if (c && now - c.t < 1000) return c.v;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  varCache.set(name, { v, t: now });
  return v;
}

let palCache: { p: ReturnType<typeof readPalette>; t: number } | null = null;
export function palette() {
  const now = performance.now();
  if (!palCache || now - palCache.t > 1000) palCache = { p: readPalette(), t: now };
  return palCache.p;
}

function readPalette() {
  return {
    fg: cssVar('--fg'),
    muted: cssVar('--muted'),
    grid: cssVar('--grid'),
    line: cssVar('--line'),
    accent: cssVar('--accent'),
    paw: cssVar('--paw'),
    flow: cssVar('--flow'),
    vol: cssVar('--vol'),
    pmus: cssVar('--pmus'),
    assist: cssVar('--assist'),
    assistFill: cssVar('--assist-fill'),
    ptp: cssVar('--ptp'),
    insp: cssVar('--insp'),
    ref: cssVar('--ref'),
    warn: cssVar('--warn'),
    crit: cssVar('--crit'),
    panel: cssVar('--panel'),
  };
}

/** Lienzo con ajuste a devicePixelRatio. Devuelve ref y una función que entrega ctx y tamaño CSS. */
export function useCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 300, h: 150 });
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: Math.max(50, r.width), h: Math.max(50, r.height) };
      c.width = Math.round(size.current.w * dpr);
      c.height = Math.round(size.current.h * dpr);
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  const get = useCallback(() => {
    const c = ref.current;
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    return { ctx, w: size.current.w, h: size.current.h };
  }, []);
  return { ref, get };
}

export function niceStep(range: number, target = 4): number {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

export function autoRange(min: number, max: number, includeZero = true): [number, number] {
  let lo = includeZero ? Math.min(0, min) : min;
  let hi = includeZero ? Math.max(0, max) : max;
  if (hi - lo < 1e-6) {
    hi += 1;
    lo -= 1;
  }
  const pad = (hi - lo) * 0.1;
  lo -= lo < 0 || !includeZero ? pad : 0;
  hi += pad;
  const st = niceStep(hi - lo);
  return [Math.floor(lo / st) * st, Math.ceil(hi / st) * st];
}

/**
 * Trazo suavizado: curvas cuadráticas con control en cada muestra y paso por los puntos medios.
 * Redondea las esquinas entre muestras (≤ 1 intervalo de registro, 10 ms) sin desplazar los datos,
 * de modo que los cambios bruscos reales (disparo, ciclado, apertura de válvula) se conservan.
 */
export function smoothPath(ctx: CanvasRenderingContext2D, xs: number[], ys: number[]) {
  const n = xs.length;
  if (n === 0) return;
  ctx.moveTo(xs[0], ys[0]);
  if (n === 1) {
    ctx.lineTo(xs[0] + 0.01, ys[0]);
    return;
  }
  if (n === 2) {
    ctx.lineTo(xs[1], ys[1]);
    return;
  }
  for (let i = 1; i < n - 1; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2;
    const my = (ys[i] + ys[i + 1]) / 2;
    ctx.quadraticCurveTo(xs[i], ys[i], mx, my);
  }
  ctx.lineTo(xs[n - 1], ys[n - 1]);
}

/** Trazo «luminoso» de monitor: halo tenue y núcleo de grosor uniforme, con uniones redondeadas. */
export function glowStroke(ctx: CanvasRenderingContext2D, pieces: { xs: number[]; ys: number[] }[], color: string, width: number, dash: number[] = [], glow = true) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.setLineDash(dash);
  const path = () => {
    ctx.beginPath();
    for (const p of pieces) smoothPath(ctx, p.xs, p.ys);
  };
  if (glow && !dash.length) {
    ctx.globalAlpha = 0.26;
    ctx.lineWidth = width * 2.3;
    path();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = width;
  path();
  ctx.stroke();
  ctx.restore();
}
