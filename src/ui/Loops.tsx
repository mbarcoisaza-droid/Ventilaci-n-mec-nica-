import { useEffect, useRef } from 'react';
import type { Controller } from './controller';
import { autoRange, niceStep, palette, useCanvas } from './canvas';

export interface LoopData {
  paw: number[];
  vol: number[];
  flow: number[];
  ptp: number[];
}

export interface FrozenLoop {
  label: string;
  data: LoopData;
}

/** Segmentos por ciclo (desde marcadores de inicio inspiratorio). El último es el ciclo en curso. */
export function breathLoops(ctl: Controller, n: number): LoopData[] {
  const s = ctl.sim;
  const starts = s.markers.filter((m) => m.type === 'inspStart').map((m) => m.t);
  const sel = starts.slice(-(n + 1));
  if (!sel.length) return [];
  const idx = s.window(Math.min(110, s.t - sel[0] + 0.05));
  const out: LoopData[] = [];
  for (let k = 0; k < sel.length; k++) {
    const a = sel[k];
    const b = k + 1 < sel.length ? sel[k + 1] : Infinity;
    const d: LoopData = { paw: [], vol: [], flow: [], ptp: [] };
    for (const i of idx) {
      const t = s.bt[i];
      if (t >= a && t < b) {
        d.paw.push(s.bpaw[i]);
        d.vol.push(s.bvol[i]);
        d.flow.push(s.bflow[i]);
        d.ptp.push(s.bptp[i]);
      }
    }
    if (d.paw.length > 3) out.push(d);
  }
  return out;
}

interface Props {
  ctl: Controller;
  history: number;
  showModel: boolean;
  frozen: FrozenLoop | null;
}

export function Loops({ ctl, history, showModel, frozen }: Props) {
  const pv = useCanvas();
  const fv = useCanvas();
  const props = useRef({ history, showModel, frozen });
  props.current = { history, showModel, frozen };

  useEffect(() => {
    const draw = () => {
      const { history, showModel, frozen } = props.current;
      const P = palette();
      const loops = breathLoops(ctl, history);
      const all = frozen ? [...loops, frozen.data] : loops;
      const range = (f: (d: LoopData) => number[], zero = true) => {
        let mn = Infinity;
        let mx = -Infinity;
        for (const d of all)
          for (const v of f(d)) {
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
        if (!isFinite(mn)) return autoRange(0, 10, zero);
        if (mn < 0 && mn > -0.05 * mx) mn = 0;
        return autoRange(mn, mx, zero);
      };
      const panel = (
        c: ReturnType<typeof useCanvas>,
        xs: (d: LoopData) => number[],
        ys: (d: LoopData) => number[],
        xr: [number, number],
        yr: [number, number],
        xl: string,
        yl: string,
        color: string,
        extra?: (d: LoopData) => number[],
      ) => {
        const g = c.get();
        if (!g) return;
        const { ctx, w, h } = g;
        ctx.clearRect(0, 0, w, h);
        const L = 44;
        const R = 10;
        const T = 22;
        const B = 22;
        const pw = w - L - R;
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
          ctx.fillText(String(Math.round(v)), L - 4, Y(v));
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const sx = niceStep(xr[1] - xr[0]);
        for (let v = Math.ceil(xr[0] / sx) * sx; v <= xr[1] + 1e-9; v += sx) {
          ctx.beginPath();
          ctx.moveTo(X(v), T);
          ctx.lineTo(X(v), T + ph);
          ctx.stroke();
          ctx.fillText(String(Math.round(v)), X(v), T + ph + 4);
        }
        ctx.strokeStyle = P.line;
        ctx.strokeRect(L, T, pw, ph);
        if (yr[0] < 0 && yr[1] > 0) {
          ctx.strokeStyle = P.muted;
          ctx.beginPath();
          ctx.moveTo(L, Y(0));
          ctx.lineTo(L + pw, Y(0));
          ctx.stroke();
        }
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.font = '600 12px "Barlow Semi Condensed", sans-serif';
        ctx.fillText(`${yl} / ${xl}`, L + 4, 4);
        ctx.save();
        ctx.beginPath();
        ctx.rect(L, T, pw, ph);
        ctx.clip();
        const line = (d: LoopData, col: string, alpha: number, width: number, dash: number[] = [], xf = xs) => {
          const xa = xf(d);
          const ya = ys(d);
          ctx.strokeStyle = col;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = width;
          ctx.setLineDash(dash);
          ctx.beginPath();
          xa.forEach((x, k) => (k ? ctx.lineTo(X(x), Y(ya[k])) : ctx.moveTo(X(x), Y(ya[k]))));
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        };
        if (frozen) line(frozen.data, P.ref, 1, 1.5, [4, 3]);
        loops.forEach((d, k) => {
          const last = k === loops.length - 1;
          const prev = k === loops.length - 2;
          line(d, color, last ? 1 : prev ? 0.55 : 0.22, last ? 2.2 : 1.4);
          if (extra && (last || prev)) line(d, P.ptp, last ? 0.9 : 0.4, 1.6, [5, 3], extra);
        });
        ctx.restore();
      };
      const vr = range((d) => d.vol);
      const pr = showModel ? range((d) => [...d.paw, ...d.ptp]) : range((d) => d.paw);
      const fr = range((d) => d.flow);
      const fm = Math.max(Math.abs(fr[0]), Math.abs(fr[1]));
      panel(pv, (d) => d.paw, (d) => d.vol, pr, vr, 'Paw (cmH₂O)', 'Volumen (mL)', P.paw, showModel ? (d) => d.ptp : undefined);
      panel(fv, (d) => d.vol, (d) => d.flow, vr, [-fm, fm], 'Volumen (mL)', 'Flujo (L/min)', P.flow);
    };
    return ctl.subscribe(draw);
  }, [ctl, pv, fv]);

  return (
    <div className="loops">
      <div>
        <canvas ref={pv.ref} aria-label="Bucle presión-volumen" />
      </div>
      <div>
        <canvas ref={fv.ref} aria-label="Bucle flujo-volumen" />
      </div>
    </div>
  );
}
