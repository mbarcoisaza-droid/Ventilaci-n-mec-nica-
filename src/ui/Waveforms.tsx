import { useEffect, useRef, useState } from 'react';
import type { Controller } from './controller';
import { autoRange, niceStep, palette, useCanvas } from './canvas';

export interface FrozenTrace {
  label: string;
  t: number[]; // relativo al inicio de la ventana
  paw: number[];
  flow: number[];
  vol: number[];
}

export interface ScaleSet {
  paw: number; // 0 = auto
  flow: number;
  vol: number;
}

interface Props {
  ctl: Controller;
  win: number;
  scales: ScaleSet;
  showModel: boolean; // Pmus/Ppl del modelo
  showEfforts: boolean;
  frozen: FrozenTrace | null;
}

export function captureTrace(ctl: Controller, win: number, label: string): FrozenTrace {
  const s = ctl.sim;
  const idx = s.window(win);
  const t0 = s.t - win;
  return {
    label,
    t: idx.map((i) => s.bt[i] - t0),
    paw: idx.map((i) => s.bpaw[i]),
    flow: idx.map((i) => s.bflow[i]),
    vol: idx.map((i) => s.bvol[i]),
  };
}

export function Waveforms({ ctl, win, scales, showModel, showEfforts, frozen }: Props) {
  const { ref, get } = useCanvas();
  const info = useRef<HTMLDivElement>(null);
  const [cursors, setCursors] = useState<number[]>([]);
  const cur = useRef<number[]>([]);
  cur.current = cursors;
  const props = useRef({ win, scales, showModel, showEfforts, frozen });
  props.current = { win, scales, showModel, showEfforts, frozen };

  useEffect(() => {
    const draw = () => {
      const g = get();
      if (!g) return;
      const { ctx, w, h } = g;
      const { win, scales, showModel, showEfforts, frozen } = props.current;
      const P = palette();
      const s = ctl.sim;
      ctx.clearRect(0, 0, w, h);
      const L = 46;
      const R = 10;
      const B = 20;
      const T = 4;
      const rowH = (h - B - T) / 3;
      const pw = w - L - R;
      const tEnd = s.t;
      const t0 = tEnd - win;
      const idx = s.window(win);
      const X = (t: number) => L + ((t - t0) / win) * pw;

      // fases inspiratorias sombreadas
      ctx.fillStyle = P.insp;
      let runStart: number | null = null;
      for (let k = 0; k < idx.length; k++) {
        const ph = s.bphase[idx[k]];
        const insp = ph === 1 || ph === 2 || ph === 3;
        if (insp && runStart === null) runStart = s.bt[idx[k]];
        if ((!insp || k === idx.length - 1) && runStart !== null) {
          const x0 = X(runStart);
          const x1 = X(s.bt[idx[k]]);
          ctx.fillRect(x0, T, x1 - x0, rowH * 3);
          runStart = null;
        }
      }

      // ciclos disparados por el paciente: el tramo de disparo se colorea DENTRO de la curva
      // (flujo en los modos por presión, presión en los modos por volumen)
      const starts = s.markers.filter((m) => m.type === 'inspStart');
      const trigSegs = starts
        .filter((m) => m.trigger === 'patient' && m.t > t0 - 0.5)
        .map((m) => ({ a: m.tTrig ?? m.t - 0.04, b: m.t + 0.15, chan: m.kind === 'VC' ? 'paw' : 'flow' }));

      const chans: { key: 'paw' | 'flow' | 'vol'; buf: Float32Array; color: string; unit: string; label: string; zero: boolean }[] = [
        { key: 'paw', buf: s.bpaw, color: P.paw, unit: 'cmH₂O', label: 'Paw', zero: true },
        { key: 'flow', buf: s.bflow, color: P.flow, unit: 'L/min', label: 'Flujo', zero: true },
        { key: 'vol', buf: s.bvol, color: P.vol, unit: 'mL', label: 'Vol', zero: true },
      ];
      const ranges: [number, number][] = [];
      chans.forEach((c, r) => {
        const y0 = T + r * rowH;
        let lo: number;
        let hi: number;
        const man = scales[c.key];
        if (man > 0) {
          if (c.key === 'flow') [lo, hi] = [-man, man];
          else if (c.key === 'paw') [lo, hi] = [Math.min(-5, -man * 0.15), man];
          else [lo, hi] = [-man * 0.1, man];
        } else {
          let mn = Infinity;
          let mx = -Infinity;
          for (const i of idx) {
            const v = c.buf[i];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          if (showModel && c.key === 'paw')
            for (const i of idx) {
              mn = Math.min(mn, s.bppl[i]);
              mx = Math.max(mx, s.bpmus[i]);
            }
          if (frozen) {
            const arr = frozen[c.key];
            for (const v of arr) {
              if (v < mn) mn = v;
              if (v > mx) mx = v;
            }
          }
          if (!isFinite(mn)) [mn, mx] = [0, 10];
          if (c.key === 'vol' && mn > -0.05 * mx) mn = 0;
          if (c.key === 'flow') {
            const m = Math.max(Math.abs(mn), Math.abs(mx), 20);
            [lo, hi] = autoRange(-m, m);
          } else [lo, hi] = autoRange(mn, mx);
        }
        ranges.push([lo, hi]);
        const Y = (v: number) => y0 + rowH - ((v - lo) / (hi - lo)) * rowH;
        // rejilla
        ctx.strokeStyle = P.grid;
        ctx.lineWidth = 1;
        ctx.fillStyle = P.muted;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const st = niceStep(hi - lo, 4);
        for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) {
          const y = Y(v);
          ctx.beginPath();
          ctx.moveTo(L, y);
          ctx.lineTo(L + pw, y);
          ctx.stroke();
          // evitar que el rótulo extremo se superponga con el del panel vecino
          if (y > y0 + 7 && y < y0 + rowH - 4) ctx.fillText(String(Math.round(v * 10) / 10), L - 4, y);
        }
        ctx.strokeStyle = P.line;
        ctx.strokeRect(L, y0, pw, rowH);
        // cero
        if (lo < 0 && hi > 0) {
          ctx.strokeStyle = P.muted;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(L, Y(0));
          ctx.lineTo(L + pw, Y(0));
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(L, y0, pw, rowH);
        ctx.clip();
        // referencia congelada
        if (frozen) {
          const arr = frozen[c.key];
          ctx.strokeStyle = P.ref;
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          frozen.t.forEach((tt, k) => {
            const x = L + (tt / win) * pw;
            const y = Y(arr[k]);
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // modelo: Pmus y Ppl en el panel de presión
        if (showModel && c.key === 'paw') {
          const extra: [Float32Array, string][] = [
            [s.bpmus, P.pmus],
            [s.bppl, P.ptp],
          ];
          for (const [buf, col] of extra) {
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.3;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            idx.forEach((i, k) => {
              const x = X(s.bt[i]);
              const y = Y(buf[i]);
              if (k === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        // curva
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        idx.forEach((i, k) => {
          const x = X(s.bt[i]);
          const y = Y(c.buf[i]);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // tramo de disparo del paciente en morado
        const segs = trigSegs.filter((g) => g.chan === c.key);
        if (segs.length) {
          ctx.strokeStyle = P.assist;
          ctx.lineWidth = 3.2;
          for (const g of segs) {
            ctx.beginPath();
            let started = false;
            for (const i of idx) {
              const tt = s.bt[i];
              if (tt < g.a || tt > g.b) continue;
              const x = X(tt);
              const y = Y(c.buf[i]);
              if (!started) {
                ctx.moveTo(x, y);
                started = true;
              } else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          ctx.lineWidth = 2;
        }
        if (c.key === 'flow' || c.key === 'vol') {
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = c.color;
          ctx.beginPath();
          idx.forEach((i, k) => (k ? ctx.lineTo(X(s.bt[i]), Y(c.buf[i])) : ctx.moveTo(X(s.bt[i]), Y(c.buf[i]))));
          ctx.lineTo(X(s.bt[idx[idx.length - 1]] ?? tEnd), Y(0));
          ctx.lineTo(X(s.bt[idx[0]] ?? t0), Y(0));
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        // rótulo
        ctx.fillStyle = c.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = '600 12px "Barlow Semi Condensed", sans-serif';
        ctx.fillText(`${c.label} (${c.unit})`, L + 6, y0 + 4);
      });

      // marcadores de inicio de ciclo: morado relleno = disparo del paciente; gris hueco = por tiempo
      for (const m of starts) {
        if (m.t < t0) continue;
        const x = X(m.t);
        const pat = m.trigger === 'patient';
        ctx.beginPath();
        ctx.moveTo(x - (pat ? 6 : 5), T + rowH * 3 + 1);
        ctx.lineTo(x + (pat ? 6 : 5), T + rowH * 3 + 1);
        ctx.lineTo(x, T + rowH * 3 + (pat ? 11 : 9));
        ctx.closePath();
        if (pat) {
          ctx.fillStyle = P.assist;
          ctx.fill();
        } else {
          ctx.strokeStyle = P.muted;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      if (showEfforts) {
        ctx.fillStyle = P.pmus;
        for (const e of s.drive.efforts) {
          if (e.onset < t0) continue;
          const x = X(e.onset);
          ctx.fillRect(x - 1, T + 2, 2, 10);
          if (!e.triggered && !e.reverse && e.onset < tEnd - e.ti - 0.3 && s.modeAllowsTrigger) {
            ctx.font = '600 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('✕', x, T + 20);
          }
        }
      }

      // eje temporal
      ctx.fillStyle = P.muted;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const stt = win <= 10 ? 1 : win <= 20 ? 2 : 5;
      for (let tt = Math.ceil(t0 / stt) * stt; tt <= tEnd; tt += stt) {
        const x = X(tt);
        ctx.strokeStyle = P.grid;
        ctx.beginPath();
        ctx.moveTo(x, T);
        ctx.lineTo(x, T + rowH * 3);
        ctx.stroke();
        ctx.fillText(`${(tt - tEnd).toFixed(0)} s`, x, T + rowH * 3 + 10);
      }

      // cursores
      const cs = cur.current.filter((c) => c >= t0 && c <= tEnd);
      const readout: string[] = [];
      const valAt = (tc: number) => {
        let best = idx[0];
        let bd = Infinity;
        for (const i of idx) {
          const d = Math.abs(s.bt[i] - tc);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        return { paw: s.bpaw[best], flow: s.bflow[best], vol: s.bvol[best] };
      };
      cs.forEach((tc, k) => {
        const x = X(tc);
        ctx.strokeStyle = P.fg;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x, T);
        ctx.lineTo(x, T + rowH * 3);
        ctx.stroke();
        ctx.setLineDash([]);
        const v = valAt(tc);
        readout.push(`${k ? 'B' : 'A'} ${(tc - tEnd).toFixed(2)} s  P ${v.paw.toFixed(1)}  V̇ ${v.flow.toFixed(0)}  V ${v.vol.toFixed(0)}`);
      });
      if (cs.length === 2) {
        const a = valAt(cs[0]);
        const b = valAt(cs[1]);
        readout.push(`Δ  ${(cs[1] - cs[0]).toFixed(2)} s  ΔP ${(b.paw - a.paw).toFixed(1)}  ΔV̇ ${(b.flow - a.flow).toFixed(0)}  ΔV ${(b.vol - a.vol).toFixed(0)}`);
      }
      if (info.current) {
        info.current.textContent = readout.join('\n');
        info.current.hidden = readout.length === 0;
      }
    };
    return ctl.subscribe(draw);
  }, [ctl, get]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const L = 46;
    const pw = r.width - L - 10;
    if (x < L) return;
    const t = ctl.sim.t - win + ((x - L) / pw) * win;
    setCursors((c) => (c.length >= 2 ? [] : [...c, t].sort((a, b) => a - b)));
  };

  return (
    <div className="waves">
      <canvas ref={ref} onClick={onClick} aria-label="Curvas de presión, flujo y volumen frente al tiempo" />
      <div ref={info} className="cursorinfo" hidden />
    </div>
  );
}
