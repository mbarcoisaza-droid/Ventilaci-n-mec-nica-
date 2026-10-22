import { useEffect, useRef, useState } from 'react';
import type { Controller } from './controller';
import { autoRange, cssVar, glowStroke, niceStep, palette, ScaleKeeper, useCanvas } from './canvas';
import type { FrozenTrace, ScaleSet } from './Waveforms';

/**
 * Curvas en estilo «monitor» de ventilador: barrido de izquierda a derecha sobre una escala de
 * tiempo fija (0 → ventana), con un hueco de borrado delante del trazo; fondo negro, ejes con
 * marcas (sin rejilla) y líneas finas sin relleno.
 */

interface Props {
  ctl: Controller;
  win: number;
  scales: ScaleSet;
  showModel: boolean;
  showEfforts: boolean;
  frozen: FrozenTrace | null;
}

const L = 58;
const R = 22;
const T = 6;
const B = 4;

export function SweepWaveforms({ ctl, win, scales, showModel, showEfforts, frozen }: Props) {
  const { ref, get } = useCanvas();
  const info = useRef<HTMLDivElement>(null);
  const [cursors, setCursors] = useState<number[]>([]);
  const cur = useRef<number[]>([]);
  cur.current = cursors;
  const keeper = useRef(new ScaleKeeper());
  const simRef = useRef(ctl.sim);
  const props = useRef({ win, scales, showModel, showEfforts, frozen });
  props.current = { win, scales, showModel, showEfforts, frozen };

  useEffect(() => {
    const draw = () => {
      const g = get();
      if (!g) return;
      const { ctx, w, h } = g;
      const { win, scales, showModel, showEfforts, frozen } = props.current;
      const P = palette();
      const M = {
        bg: cssVar('--mon-bg'),
        axis: cssVar('--mon-axis'),
        text: cssVar('--mon-text'),
        paw: cssVar('--mon-paw'),
        flow: cssVar('--mon-flow'),
        vol: cssVar('--mon-vol'),
      };
      const s = ctl.sim;
      if (simRef.current !== s) {
        // nueva simulación (caso, paciente real, reinicio): se recalculan las escalas
        simRef.current = s;
        keeper.current.reset();
      }
      const now = s.t;
      const gap = Math.max(0.25, win * 0.03);
      const pw = w - L - R;
      const rowH = (h - T - B) / 3;
      const pos = (t: number) => t - Math.floor(t / win) * win;
      const X = (t: number) => L + (pos(t) / win) * pw;
      const visible = (t: number) => t > now - win + gap && t <= now;
      const idx = s.window(win - gap);

      ctx.fillStyle = M.bg;
      ctx.fillRect(0, 0, w, h);

      const chans = [
        { key: 'paw' as const, buf: s.bpaw, color: M.paw, name: 'Paw', unit: 'cmH₂O' },
        { key: 'flow' as const, buf: s.bflow, color: M.flow, name: 'Flujo', unit: 'L/min' },
        { key: 'vol' as const, buf: s.bvol, color: M.vol, name: 'Volumen', unit: 'mL' },
      ];

      // tramos de disparo del paciente (en la curva que responde al paciente)
      const trigSegs = s.markers
        .filter((m) => m.type === 'inspStart' && m.trigger === 'patient' && m.t > now - win)
        .map((m) => ({ a: m.tTrig ?? m.t - 0.04, b: m.t + 0.15, chan: m.kind === 'VC' ? 'paw' : 'flow' }));

      const tickStep = win <= 12 ? 1 : win <= 30 ? 2 : 5;
      const labelStep = win <= 12 ? 2 : win <= 30 ? 5 : 10;

      chans.forEach((c, r) => {
        const y0 = T + r * rowH;
        const top = y0 + 8;
        const bot = y0 + rowH - 18; // deja sitio a los rótulos del eje del tiempo
        // escala
        let lo: number;
        let hi: number;
        const man = scales[c.key];
        if (man > 0) {
          if (c.key === 'flow') [lo, hi] = [-man, man];
          else if (c.key === 'paw') [lo, hi] = [-Math.max(5, man * 0.25), man];
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
          if (!isFinite(mn)) [mn, mx] = [0, 10];
          if (c.key === 'flow') {
            const m = Math.max(Math.abs(mn), Math.abs(mx), 25);
            [lo, hi] = autoRange(-m, m);
          } else {
            if (c.key === 'vol' && mn > -0.05 * mx) mn = 0;
            [lo, hi] = autoRange(mn, mx);
          }
          [lo, hi] = keeper.current.get(c.key, lo, hi, performance.now() / 1000);
        }
        const Y = (v: number) => bot - ((v - lo) / (hi - lo)) * (bot - top);
        const yZero = lo <= 0 && hi >= 0 ? Y(0) : bot;

        // eje Y con marcas
        ctx.strokeStyle = M.axis;
        ctx.fillStyle = M.text;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(L, top - 4);
        ctx.lineTo(L, bot + 2);
        ctx.stroke();
        ctx.font = '12px "Barlow Semi Condensed", "Arial Narrow", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const st = niceStep(hi - lo, 4);
        for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) {
          const y = Y(v);
          ctx.beginPath();
          ctx.moveTo(L - 5, y);
          ctx.lineTo(L, y);
          ctx.stroke();
          ctx.fillText(String(Math.round(v * 10) / 10), L - 8, y);
        }
        // eje del tiempo sobre el cero
        ctx.beginPath();
        ctx.moveTo(L, yZero);
        ctx.lineTo(L + pw, yZero);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '11px "Barlow Semi Condensed", "Arial Narrow", sans-serif';
        for (let tt = tickStep; tt < win + 1e-9; tt += tickStep) {
          const x = L + (tt / win) * pw;
          ctx.beginPath();
          ctx.moveTo(x, yZero - 3);
          ctx.lineTo(x, yZero + 3);
          ctx.stroke();
          if (Math.abs(tt / labelStep - Math.round(tt / labelStep)) < 1e-6 && tt < win - 1e-6) ctx.fillText(String(Math.round(tt)), x, yZero + 5);
        }
        ctx.textAlign = 'left';
        ctx.fillText('s', L + pw + 6, yZero - 14);
        // rótulo del canal
        ctx.textBaseline = 'top';
        ctx.font = '15px "Barlow Semi Condensed", "Arial Narrow", sans-serif';
        ctx.fillText(c.name, L + 6, y0 + 2);
        ctx.font = '12.5px "Barlow Semi Condensed", "Arial Narrow", sans-serif';
        ctx.fillText(c.unit, L + 6, y0 + 19);

        ctx.save();
        ctx.beginPath();
        ctx.rect(L + 1, y0, pw, rowH);
        ctx.clip();
        // referencia congelada
        if (frozen) {
          const arr = frozen[c.key];
          // misma posición de barrido que tenía al congelarse
          const pieces: { xs: number[]; ys: number[] }[] = [];
          let prev = -1;
          frozen.t.forEach((tt, k) => {
            const p = pos(frozen.t0 + tt);
            if (k === 0 || p < prev) pieces.push({ xs: [], ys: [] });
            pieces[pieces.length - 1].xs.push(L + (p / win) * pw);
            pieces[pieces.length - 1].ys.push(Y(arr[k]));
            prev = p;
          });
          glowStroke(ctx, pieces, P.ref, 1.3, [4, 3], false);
          ctx.setLineDash([]);
        }
        // tramos continuos del barrido (se cortan en el hueco de borrado y al volver al inicio)
        const trace = (buf: Float32Array, color: string, width: number, dash: number[] = [], range?: [number, number], glow = true) => {
          const pieces: { xs: number[]; ys: number[] }[] = [];
          let cur: { xs: number[]; ys: number[] } | null = null;
          let prevPos = -1;
          for (const i of idx) {
            const tt = s.bt[i];
            if (!visible(tt) || (range && (tt < range[0] || tt > range[1]))) {
              cur = null;
              continue;
            }
            const p = pos(tt);
            if (!cur || p < prevPos) {
              cur = { xs: [], ys: [] };
              pieces.push(cur);
            }
            cur.xs.push(L + (p / win) * pw);
            cur.ys.push(Y(buf[i]));
            prevPos = p;
          }
          glowStroke(ctx, pieces, color, width, dash, glow);
        };
        if (showModel && c.key === 'paw') {
          trace(s.bpmus, P.pmus, 1.3, [5, 3], undefined, false);
          trace(s.bppl, P.ptp, 1.3, [5, 3], undefined, false);
        }
        trace(c.buf, c.color, 2.2);
        for (const sg of trigSegs) if (sg.chan === c.key) trace(c.buf, P.assist, 3.4, [], [sg.a, sg.b]);
        ctx.restore();
      });

      // marcas de inicio de ciclo (bajo el panel de presión) y esfuerzos
      const yMark = T + rowH - 4;
      for (const m of s.markers) {
        if (m.type !== 'inspStart' || !visible(m.t)) continue;
        const x = X(m.t);
        const pat = m.trigger === 'patient';
        ctx.beginPath();
        ctx.moveTo(x - 5, yMark - 7);
        ctx.lineTo(x + 5, yMark - 7);
        ctx.lineTo(x, yMark + 1);
        ctx.closePath();
        if (pat) {
          ctx.fillStyle = P.assist;
          ctx.fill();
        } else {
          ctx.strokeStyle = M.axis;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      if (showEfforts) {
        ctx.fillStyle = P.pmus;
        for (const e of s.drive.efforts) {
          if (!visible(e.onset)) continue;
          const x = X(e.onset);
          ctx.fillRect(x - 1, T + 2, 2, 9);
          if (!e.triggered && !e.reverse && e.onset < now - e.ti - 0.3 && s.modeAllowsTrigger) {
            ctx.font = '600 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('✕', x, T + 12);
          }
        }
      }

      // cursores
      const cs = cur.current.filter((c) => visible(c));
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
        ctx.strokeStyle = M.text;
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, T);
        ctx.lineTo(x, h - B);
        ctx.stroke();
        ctx.setLineDash([]);
        const v = valAt(tc);
        readout.push(`${k ? 'B' : 'A'} ${pos(tc).toFixed(2)} s  P ${v.paw.toFixed(1)}  V̇ ${v.flow.toFixed(0)}  V ${v.vol.toFixed(0)}`);
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
    const pw = r.width - L - R;
    if (x < L || x > L + pw) return;
    const now = ctl.sim.t;
    const sweepStart = Math.floor(now / win) * win;
    const off = ((x - L) / pw) * win;
    // instante más reciente que se dibuja en esa posición del barrido
    const t = sweepStart + off <= now ? sweepStart + off : sweepStart - win + off;
    setCursors((c) => (c.length >= 2 ? [] : [...c, t].sort((a, b) => a - b)));
  };

  return (
    <div className="waves monitor">
      <canvas ref={ref} onClick={onClick} aria-label="Curvas de presión, flujo y volumen frente al tiempo (barrido)" />
      <div ref={info} className="cursorinfo" hidden />
    </div>
  );
}
