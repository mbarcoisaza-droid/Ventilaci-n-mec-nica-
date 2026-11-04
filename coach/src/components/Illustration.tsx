/** Ilustración animada del movimiento con secuencia de cuadros y opción de ampliar. */
import { useEffect, useId, useState } from 'react';
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

function Scene({ anim, t, arrows, big }: { anim: Anim; t: number; arrows: boolean; big?: boolean }) {
  const mid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 120 90" className={`scene ${big ? 'big' : ''}`} role="img" aria-label={`Ilustración: ${anim.label}`}>
      <defs>
        <marker id={`a${mid}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="arrowhead" />
        </marker>
      </defs>
      {anim.prop === 'colchoneta' && <rect x="6" y="81" width="108" height="3" rx="1.5" className="mat" />}
      {anim.prop === 'caminadora' && (
        <g className="treadmill">
          <path d="M28 84 L96 78 L98 82 L30 88 Z" />
          <line x1="90" y1="79" x2="84" y2="40" />
          <line x1="80" y1="40" x2="90" y2="40" />
        </g>
      )}
      <line x1="2" y1={anim.prop === 'caminadora' ? 88 : 84} x2="118" y2={anim.prop === 'caminadora' ? 88 : 84} className="ground" />
      <g transform={anim.prop === 'caminadora' ? 'translate(0 -2) rotate(-5 60 81)' : undefined}>
        <Figure p={anim.at(t)} />
      </g>
      {arrows && anim.arrows.map((d, i) => <path key={i} d={d} className="arrow" markerEnd={`url(#a${mid})`} />)}
      {anim.generic && (
        <text x="92" y="30" className="qmark">
          ?
        </text>
      )}
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
        {anim.generic && <p className="scene-note">Ilustración genérica: el entrenador aún no ha definido este movimiento.</p>}
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
        <button type="button" className="btn ghost sm" onClick={() => setZoom(true)}>
          ⤢ Ampliar
        </button>
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
