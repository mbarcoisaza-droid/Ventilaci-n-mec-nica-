import { useEffect, useRef } from 'react';

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

export function palette() {
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
  const get = () => {
    const c = ref.current;
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: size.current.w, h: size.current.h };
  };
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
