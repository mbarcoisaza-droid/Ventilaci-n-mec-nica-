/** Ilustración animada del movimiento con secuencia de cuadros y opción de ampliar. */
import { useEffect, useId, useState } from 'react';
import { PENDING_LABEL } from '../library';
import { Anim, Pose, animFor } from '../poses';
import { Sheet } from './ui';

function Figure({ p }: { p: Pose }) {
  const line = (a: [number, number], b: [number, number], cls: string) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={cls} />;
  const limb = (a: [number, number], b: [number, number], c: [number, number], cls: string) => (
    <polyline points={`${a[0]},${a[1]} ${b[0]},${b[1]} ${c[0]},${c[1]}`} className={cls} />
  );
  return (
    <g className="fig">
      {limb(p.neck, p.eR, p.hR, 'limb far')}
      {limb(p.hip, p.kR, p.fR, 'limb far')}
      {line(p.neck, p.hip, 'limb torso')}
      {limb(p.hip, p.kL, p.fL, 'limb')}
      {limb(p.neck, p.eL, p.hL, 'limb')}
      <circle cx={p.head[0]} cy={p.head[1]} r={6.5} className="head" />
    </g>
  );
}

type P2 = [number, number];
const mid2 = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function Dumbbell({ at, faded, vertical }: { at: P2; faded?: boolean; vertical?: boolean }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})${vertical ? ' rotate(90)' : ''}`} className={`equip dumbbell ${faded ? 'far' : ''}`}>
      <rect x={-4.5} y={-0.8} width={9} height={1.6} />
      <rect x={-6} y={-2.8} width={2.6} height={5.6} rx={0.6} />
      <rect x={3.4} y={-2.8} width={2.6} height={5.6} rx={0.6} />
    </g>
  );
}

/** Equipo que acompaña a la figura (se mueve con ella). */
function Equip({ tokens, p }: { tokens: string[]; p: Pose }) {
  return (
    <>
      {tokens.map((tok, i) => {
        const [kind, arg] = tok.split(':');
        switch (kind) {
          case 'mancuernas':
            return (
              <g key={i}>
                <Dumbbell at={p.hR} faded />
                <Dumbbell at={p.hL} />
              </g>
            );
          case 'mancuerna':
            return <Dumbbell key={i} at={p.hL} />;
          case 'mancuerna-2manos':
          case 'mancuerna-pecho':
            return <Dumbbell key={i} at={mid2(p.hL, p.hR)} vertical />;
          case 'barra-cadera':
            return (
              <g key={i} className="equip">
                <circle cx={p.hip[0]} cy={p.hip[1] - 6} r={6.5} className="plate" />
                <circle cx={p.hip[0]} cy={p.hip[1] - 6} r={1.4} />
              </g>
            );
          case 'pesa-rusa':
            return (
              <g key={i} className="equip" transform={`translate(${p.hip[0]} ${p.hip[1] - 7})`}>
                <circle r={4.5} />
                <path d="M-2.5 -3.5 Q0 -9 2.5 -3.5" className="handle" />
              </g>
            );
          case 'banda-manos':
            return <line key={i} x1={p.hL[0]} y1={p.hL[1]} x2={p.hR[0]} y2={p.hR[1]} className="band" />;
          case 'banda-pie-mano':
            return <line key={i} x1={p.fL[0]} y1={p.fL[1]} x2={p.hL[0]} y2={p.hL[1]} className="band" />;
          case 'banda-rodillas': {
            const c = mid2(p.kL, p.kR);
            const w = Math.max(5, Math.abs(p.kL[0] - p.kR[0]) / 2 + 3);
            return <ellipse key={i} cx={c[0]} cy={c[1]} rx={w} ry={3} className="band loop" />;
          }
          case 'cable': {
            const [ax, ay] = (arg ?? '60,0').split(',').map(Number);
            const h = mid2(p.hL, p.hR);
            return (
              <g key={i} className="equip">
                <line x1={ax} y1={ay} x2={h[0]} y2={h[1]} className="cable" />
                <circle cx={ax} cy={ay} r={2.4} />
              </g>
            );
          }
          case 'barra-jalon': {
            const h = mid2(p.hL, p.hR);
            return (
              <g key={i} className="equip">
                <line x1={h[0]} y1={0} x2={h[0]} y2={h[1]} className="cable" />
                <line x1={h[0] - 10} y1={h[1]} x2={h[0] + 10} y2={h[1]} className="bar" />
              </g>
            );
          }
          case 'rodillo':
            return <circle key={i} cx={p.fL[0] - 1} cy={p.fL[1] - 3} r={3} className="equip pad" />;
          case 'plataforma': {
            const f = p.fL;
            return <line key={i} x1={f[0] - 6} y1={f[1] - 9} x2={f[0] + 6} y2={f[1] + 9} className="bar" />;
          }
          default:
            return null;
        }
      })}
    </>
  );
}

export function Scene({ anim, t, arrows, big }: { anim: Anim; t: number; arrows: boolean; big?: boolean }) {
  const mid = useId().replace(/:/g, '');
  const pose = anim.at(t);
  return (
    <svg viewBox="0 0 120 90" className={`scene ${big ? 'big' : ''}`} role="img" aria-label={`Ilustración: ${anim.label}`}>
      <defs>
        <marker id={`a${mid}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="arrowhead" />
        </marker>
      </defs>
      {anim.shapes?.map((d, i) => <path key={i} d={d} className="prop" />)}
      {anim.prop === 'colchoneta' && <rect x="6" y="81" width="108" height="3" rx="1.5" className="mat" />}
      {anim.prop === 'banco' && <rect x="8" y="60" width="26" height="22" rx="2" className="prop" />}
      {anim.prop === 'caja' && <rect x="66" y="66" width="30" height="16" rx="2" className="prop" />}
      {anim.prop === 'pared' && <rect x="16" y="4" width="8" height="78" className="prop" />}
      {anim.prop === 'caminadora' && (
        <g className="treadmill">
          <path d="M28 84 L96 78 L98 82 L30 88 Z" />
          <line x1="90" y1="79" x2="84" y2="40" />
          <line x1="80" y1="40" x2="90" y2="40" />
        </g>
      )}
      <line x1="2" y1={anim.prop === 'caminadora' ? 88 : 84} x2="118" y2={anim.prop === 'caminadora' ? 88 : 84} className="ground" />
      <g transform={anim.prop === 'caminadora' ? 'translate(0 -2) rotate(-5 60 81)' : undefined}>
        <g className={anim.pending ? 'neutral' : undefined}>
          <Figure p={pose} />
        </g>
        {anim.equip && <Equip tokens={anim.equip} p={pose} />}
      </g>
      {arrows && anim.arrows.map((d, i) => <path key={i} d={d} className="arrow" markerEnd={`url(#a${mid})`} />)}

    </svg>
  );
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Illustration({ pose, compact, title }: { pose: string; compact?: boolean; title?: string }) {
  const anim = animFor(pose);
  const [playing, setPlaying] = useState(!reduceMotion() && !anim.generic);
  const [t, setT] = useState(anim.frames[anim.frames.length - 1]?.t ?? 0);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      setT(((now - t0) / 2600) % 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const body = (big: boolean) => (
    <>
      <div className="scene-wrap">
        <Scene anim={anim} t={t} arrows big={big} />
        {anim.pending && <span className="pending-badge">{PENDING_LABEL}</span>}
      </div>
      {!anim.generic && (
        <ol className="frames" aria-label="Secuencia del movimiento">
          {anim.frames.map((f, i) => (
            <li key={i}>
              <button type="button" onClick={() => (setPlaying(false), setT(f.t))} aria-label={`Ver cuadro: ${f.label}`}>
                <Scene anim={anim} t={f.t} arrows={false} />
                <span>
                  {i + 1}. {f.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );

  return (
    <div className={`illus ${compact ? 'compact' : ''}`}>
      {body(false)}
      <div className="media-ctrls">
        {!anim.generic && (
          <button type="button" className="btn ghost sm" onClick={() => setPlaying((p) => !p)}>
            {playing ? '⏸ Pausar animación' : '▶ Animar'}
          </button>
        )}
        {!anim.pending && (
          <button type="button" className="btn ghost sm" onClick={() => setZoom(true)}>
            ⤢ Ampliar
          </button>
        )}
      </div>
      {zoom && (
        <Sheet title={title ?? anim.label} onClose={() => setZoom(false)} wide>
          <div className="illus zoomed">{body(true)}</div>
          {!anim.generic && (
            <div className="media-ctrls">
              <button type="button" className="btn ghost sm" onClick={() => setPlaying((p) => !p)}>
                {playing ? '⏸ Pausar animación' : '▶ Animar'}
              </button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

/** Miniatura estática para listas. */
export function Thumb({ pose }: { pose: string }) {
  const anim = animFor(pose);
  return <Scene anim={anim} t={anim.frames[anim.frames.length - 1]?.t ?? 0} arrows={false} />;
}
