import { useEffect, useRef } from 'react';
import { autoRange, niceStep, palette } from './canvas';

export interface Series {
  xs: number[];
  ys: number[];
  color: string; // nombre de token CSS sin «--», p. ej. 'paw'
  dash?: number[];
  width?: number;
}

interface Props {
  series: Series[];
  xlabel: string;
  ylabel: string;
  className?: string;
  xZero?: boolean;
  label?: string;
  vlines?: { x: number; color: string }[];
}

/** Gráfico de líneas estático (curva P-V, comparación de asincronías). */
export function StaticChart({ series, xlabel, ylabel, className = 'pvchart', xZero = true, label, vlines }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const data = useRef({ series, xlabel, ylabel, xZero, vlines });
  data.current = { series, xlabel, ylabel, xZero, vlines };

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const P = palette() as Record<string, string>;
      const { series, xlabel, ylabel, xZero, vlines } = data.current;
      const w = r.width;
      const h = r.height;
      ctx.clearRect(0, 0, w, h);
      const xsAll = series.flatMap((s) => s.xs);
      const ysAll = series.flatMap((s) => s.ys);
      if (!xsAll.length) return;
      const xr = autoRange(Math.min(...xsAll), Math.max(...xsAll), xZero);
      const yr = autoRange(Math.min(...ysAll), Math.max(...ysAll), true);
      const L = 46;
      const Rr = 10;
      const T = 10;
      const B = 34;
      const pw = w - L - Rr;
      const ph = h - T - B;
      const X = (v: number) => L + ((v - xr[0]) / (xr[1] - xr[0])) * pw;
      const Y = (v: number) => T + ph - ((v - yr[0]) / (yr[1] - yr[0])) * ph;
      ctx.strokeStyle = P.grid;
      ctx.fillStyle = P.muted;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const sy = niceStep(yr[1] - yr[0]);
      for (let v = Math.ceil(yr[0] / sy) * sy; v <= yr[1] + 1e-9; v += sy) {
        ctx.beginPath();
        ctx.moveTo(L, Y(v));
        ctx.lineTo(L + pw, Y(v));
        ctx.stroke();
        ctx.fillText(String(Math.round(v * 10) / 10), L - 4, Y(v));
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const sx = niceStep(xr[1] - xr[0], 6);
      for (let v = Math.ceil(xr[0] / sx) * sx; v <= xr[1] + 1e-9; v += sx) {
        ctx.beginPath();
        ctx.moveTo(X(v), T);
        ctx.lineTo(X(v), T + ph);
        ctx.stroke();
        ctx.fillText(String(Math.round(v * 10) / 10), X(v), T + ph + 3);
      }
      ctx.fillText(xlabel, L + pw / 2, T + ph + 18);
      ctx.save();
      ctx.translate(11, T + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(ylabel, 0, -6);
      ctx.restore();
      ctx.strokeStyle = P.line;
      ctx.strokeRect(L, T, pw, ph);
      for (const vl of vlines ?? []) {
        ctx.strokeStyle = P[vl.color] ?? vl.color;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(X(vl.x), T);
        ctx.lineTo(X(vl.x), T + ph);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const s of series) {
        ctx.strokeStyle = P[s.color] ?? s.color;
        ctx.lineWidth = s.width ?? 2;
        ctx.setLineDash(s.dash ?? []);
        ctx.beginPath();
        s.xs.forEach((x, k) => (k ? ctx.lineTo(X(x), Y(s.ys[k])) : ctx.moveTo(X(x), Y(s.ys[k]))));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [series, xlabel, ylabel, xZero, vlines]);

  return <canvas ref={ref} className={className} aria-label={label ?? `${ylabel} frente a ${xlabel}`} />;
}
