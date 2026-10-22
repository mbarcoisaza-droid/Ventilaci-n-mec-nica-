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
 * Interpolación cúbica monótona (Fritsch–Carlson): la curva pasa exactamente por cada muestra,
 * es continua en pendiente y no crea sobreimpulsos ni oscilaciones que no estén en los datos.
 * Así se suaviza el trazo sin «inventar» fisiología: un escalón real sigue siendo un escalón.
 */
export function monotonePath(ctx: CanvasRenderingContext2D | Path2D, xs: number[], ys: number[]) {
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
  const d: number[] = new Array(n - 1);
  const h: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    d[i] = h[i] > 1e-6 ? (ys[i + 1] - ys[i]) / h[i] : 0;
  }
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      // media armónica ponderada (Fritsch–Butland): garantiza monotonía por tramos
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    if (h[i] <= 1e-6) {
      ctx.lineTo(xs[i + 1], ys[i + 1]);
      continue;
    }
    const k = h[i] / 3;
    ctx.bezierCurveTo(xs[i] + k, ys[i] + m[i] * k, xs[i + 1] - k, ys[i + 1] - m[i + 1] * k, xs[i + 1], ys[i + 1]);
  }
}

/**
 * Cuando hay más de ~1.5 muestras por píxel (ventanas largas) se reduce a mínimo y máximo por
 * columna de píxeles, en orden temporal: conserva picos y valles y evita el temblor (aliasing)
 * que produce el barrido al desplazar el muestreo respecto a la rejilla de píxeles.
 */
export function decimate(xs: number[], ys: number[]): { xs: number[]; ys: number[]; dense: boolean } {
  const n = xs.length;
  if (n < 3) return { xs, ys, dense: false };
  const span = Math.abs(xs[n - 1] - xs[0]);
  if (n / Math.max(span, 1) < 1.5) return { xs, ys, dense: false };
  const ox: number[] = [];
  const oy: number[] = [];
  let col = Math.floor(xs[0]);
  let minY = ys[0];
  let maxY = ys[0];
  let minFirst = true;
  let firstX = xs[0];
  const flush = () => {
    if (minFirst) {
      ox.push(firstX, firstX + 0.5);
      oy.push(minY, maxY);
    } else {
      ox.push(firstX, firstX + 0.5);
      oy.push(maxY, minY);
    }
  };
  for (let i = 1; i < n; i++) {
    const c = Math.floor(xs[i]);
    if (c !== col) {
      flush();
      col = c;
      minY = maxY = ys[i];
      minFirst = true;
      firstX = xs[i];
      continue;
    }
    if (ys[i] < minY) {
      minY = ys[i];
      minFirst = false;
    }
    if (ys[i] > maxY) {
      maxY = ys[i];
      minFirst = true;
    }
  }
  flush();
  return { xs: ox, ys: oy, dense: true };
}

/** Calidad adaptativa: el halo se desactiva si la animación no alcanza ~45 fps (ver Controller). */
let glowEnabled = true;
export function setGlowEnabled(v: boolean) {
  glowEnabled = v;
}

/** Trazo de monitor: halo de fósforo aditivo y núcleo de grosor uniforme, con uniones redondeadas.
 *  El trazado se construye una sola vez (Path2D) y se reutiliza para el halo y el núcleo. */
export function glowStroke(ctx: CanvasRenderingContext2D, pieces: { xs: number[]; ys: number[] }[], color: string, width: number, dash: number[] = [], glow = true) {
  const path = new Path2D();
  for (const piece of pieces) {
    const p = decimate(piece.xs, piece.ys);
    if (!p.xs.length) continue;
    if (p.dense) {
      path.moveTo(p.xs[0], p.ys[0]);
      for (let i = 1; i < p.xs.length; i++) path.lineTo(p.xs[i], p.ys[i]);
    } else monotonePath(path, p.xs, p.ys);
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.setLineDash(dash);
  if (glow && glowEnabled && !dash.length) {
    // halo tenue (composición normal: mucho más barata que la aditiva y casi idéntica sobre negro)
    ctx.globalAlpha = 0.24;
    ctx.lineWidth = width * 2.2;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.restore();
}

/**
 * Escala automática estable: se amplía de inmediato cuando la señal la excede y sólo se reduce
 * cuando la señal ocupa < 45 % del rango durante más de 4 s. Evita que las curvas «salten»
 * en cada fotograma, como hacen los ventiladores reales.
 */
export class ScaleKeeper {
  private st = new Map<string, { lo: number; hi: number; smallSince: number | null }>();
  get(key: string, lo: number, hi: number, now: number): [number, number] {
    const c = this.st.get(key);
    if (!c || lo < c.lo - 1e-9 || hi > c.hi + 1e-9) {
      const lo2 = c ? Math.min(lo, c.lo) : lo;
      const hi2 = c ? Math.max(hi, c.hi) : hi;
      this.st.set(key, { lo: lo2, hi: hi2, smallSince: null });
      return [lo2, hi2];
    }
    const used = (hi - lo) / (c.hi - c.lo);
    if (used < 0.45) {
      if (c.smallSince === null) c.smallSince = now;
      else if (now - c.smallSince > 4) {
        this.st.set(key, { lo, hi, smallSince: null });
        return [lo, hi];
      }
    } else c.smallSince = null;
    return [c.lo, c.hi];
  }
  reset() {
    this.st.clear();
  }
}
