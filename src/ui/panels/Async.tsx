import { useMemo, useState } from 'react';
import type { PatientParams, VentSettings } from '../../engine/types';
import { Simulator } from '../../engine/simulator';
import { DEFAULT_SETTINGS } from '../../engine/presets';
import { ASYNCHRONIES, ASYNC_EVENT_LABEL, buildPreset, type Asynchrony } from '../../education/asynchronies';
import { StaticChart } from '../StaticChart';

interface Props {
  settings: VentSettings;
  patient: PatientParams;
  level: 1 | 2 | 3;
  apply: (p: PatientParams, s: VentSettings, warm?: number) => void;
  events: Record<string, number>;
}

function Detail({ a, revealName }: { a: Asynchrony; revealName: boolean }) {
  return (
    <div className="sec">
      {revealName && <h4>{a.name} · fase de {a.phase}</h4>}
      <dl className="kv small">
        <dt>Mecanismo</dt><dd>{a.mechanism}</dd>
        <dt>Cómo se genera aquí</dt><dd>{a.generation}</dd>
        <dt>Cambios en las curvas</dt><dd>{a.curves}</dd>
        <dt>Signos</dt><dd><ul className="tight">{a.signs.map((s) => <li key={s}>{s}</li>)}</ul></dd>
        <dt>Diferenciales</dt><dd><ul className="tight">{a.differentials.map((s) => <li key={s}>{s}</li>)}</ul></dd>
        <dt>Corrección</dt><dd><ul className="tight">{a.corrections.map((s) => <li key={s}>{s}</li>)}</ul></dd>
        <dt>Consecuencias</dt><dd>{a.consequences}</dd>
      </dl>
    </div>
  );
}

/** Simulación fuera de línea para la comparación doble disparo / disparo reverso */
function offline(id: string) {
  const a = ASYNCHRONIES.find((x) => x.id === id)!;
  const { patient, settings } = buildPreset(a.activate, { ...DEFAULT_SETTINGS, alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 60 } });
  const sim = new Simulator(settings, patient);
  sim.advance(24);
  const idx = sim.window(8);
  const t0 = sim.t - 8;
  return {
    t: idx.map((i) => sim.bt[i] - t0),
    paw: idx.map((i) => sim.bpaw[i]),
    flow: idx.map((i) => sim.bflow[i]),
    pmus: idx.map((i) => sim.bpmus[i]),
    starts: sim.markers.filter((m) => m.type === 'inspStart' && m.t > t0).map((m) => ({ x: m.t - t0, color: m.trigger === 'patient' ? 'accent' : 'muted' })),
  };
}

export function AsyncPanel({ settings, patient, level, apply, events }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ p: PatientParams; s: VentSettings } | null>(null);
  const [challenge, setChallenge] = useState<{ id: string; guess: string | null } | null>(null);
  const [showCmp, setShowCmp] = useState(false);
  const [reveal, setReveal] = useState(false);
  const cmp = useMemo(() => (showCmp ? { d: offline('stacking'), r: offline('reverse') } : null), [showCmp]);

  const activate = (a: Asynchrony) => {
    if (!saved) setSaved({ p: patient, s: settings });
    const { patient: p, settings: s } = buildPreset(a.activate, settings);
    apply(p, s, 8);
    setActive(a.id);
  };
  const resolve = (a: Asynchrony) => {
    const { patient: p, settings: s } = buildPreset(a.resolve, settings, patient);
    apply(p, s);
  };
  const restore = () => {
    if (saved) apply(saved.p, saved.s);
    setSaved(null);
    setActive(null);
    setChallenge(null);
  };
  const startChallenge = () => {
    const a = ASYNCHRONIES[Math.floor(Math.random() * ASYNCHRONIES.length)];
    activate(a);
    setChallenge({ id: a.id, guess: null });
  };
  const hideNames = level === 3 || (challenge && !challenge.guess);
  const evList = Object.entries(events).filter(([, n]) => n > 0);

  return (
    <>
      <div className="sec">
        <h3>Asincronías paciente-ventilador</h3>
        <p className="small muted">Identifíquelas con Paw, flujo y volumen. La presión esofágica/Pmus del modelo puede mostrarse en niveles 1–2 para confirmar el mecanismo.</p>
        <div className="row">
          <button className="primary" onClick={startChallenge}>Desafío: asincronía aleatoria</button>
          {saved && <button onClick={restore}>Restaurar configuración previa</button>}
        </div>
        {level < 3 && (
          <div className="small">
            Detector (verdad del modelo, 60 s): {evList.length ? evList.map(([k, n]) => `${ASYNC_EVENT_LABEL[k]} ×${n}`).join(' · ') : 'sin eventos'}
          </div>
        )}
      </div>
      {challenge && (
        <div className="item sel">
          <span className="ttl">¿Qué asincronía observa?</span>
          <select aria-label="Diagnóstico de la asincronía" value={challenge.guess ?? ''} onChange={(e) => setChallenge({ ...challenge, guess: e.target.value })}>
            <option value="" disabled>Elija un diagnóstico…</option>
            {ASYNCHRONIES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {challenge.guess && (() => {
            const ok = challenge.guess === challenge.id || (['double', 'stacking'].includes(challenge.guess) && ['double', 'stacking'].includes(challenge.id));
            const a = ASYNCHRONIES.find((x) => x.id === challenge.id)!;
            return (
              <>
                <div className={'note ' + (ok ? '' : 'warn')}>{ok ? 'Correcto' : 'No es correcto'}: era <b>{a.name}</b>.</div>
                <Detail a={a} revealName={false} />
                <div className="row">
                  <button onClick={() => resolve(a)}>Resolver asincronía</button>
                  <button onClick={startChallenge}>Otro desafío</button>
                </div>
              </>
            );
          })()}
        </div>
      )}
      {!challenge && (
        <div className="list">
          {ASYNCHRONIES.map((a) => (
            <div key={a.id} className={'item' + (active === a.id ? ' sel' : '')}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="ttl">{hideNames ? `Patrón ${ASYNCHRONIES.indexOf(a) + 1}` : a.name}</span>
                <span className="row">
                  <button onClick={() => activate(a)}>Activar asincronía</button>
                  <button onClick={() => resolve(a)} disabled={active !== a.id}>Resolver</button>
                </span>
              </div>
              {active === a.id && !hideNames && (
                <>
                  <div className={'note small' + (events[a.id] ? '' : ' warn')}>
                    {events[a.id]
                      ? `Detectada en el modelo: ${ASYNC_EVENT_LABEL[a.id]} ×${events[a.id]} en los últimos 60 s.`
                      : 'Aún no detectada: espere unos ciclos (el detector usa la verdad del modelo).'}
                  </div>
                  <div className="note small">Resolución propuesta: {a.resolve.text}</div>
                  <Detail a={a} revealName={false} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="sec">
        <h3>Doble disparo frente a disparo reverso</h3>
        <p className="small">
          Ambos producen dos ciclos seguidos con espiración mínima. La pista en las curvas convencionales es la <b>secuencia</b>: en el doble disparo el primer ciclo lo dispara el paciente (muesca de Paw, marcador relleno) y el esfuerzo continúa tras el ciclado; en el disparo reverso el primer ciclo es disparado por máquina (sin muesca, marcador hueco) y la deformación aparece después, con latencia constante. Sin presión esofágica o EAdi el origen puede sugerirse, pero no siempre confirmarse: un esfuerzo que comienza muy cerca del disparo por tiempo, o un retraso de disparo largo, hacen ambiguas las curvas.
        </p>
        <button onClick={() => setShowCmp((v) => !v)}>{showCmp ? 'Ocultar comparación' : 'Mostrar comparación lado a lado'}</button>
        {cmp && (
          <>
            {level < 3 && (
              <label className="small row">
                <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> Revelar Pmus (equivalente a presión esofágica/EAdi)
              </label>
            )}
            {(['d', 'r'] as const).map((k) => (
              <div key={k} className="sec">
                <h4>{k === 'd' ? 'A · Doble disparo (VCV, Ti neural largo)' : 'B · Disparo reverso (PCV, arrastre 1:1)'}</h4>
                <StaticChart className="minichart" xlabel="Tiempo (s)" ylabel="Paw" vlines={cmp[k].starts} series={[{ xs: cmp[k].t, ys: cmp[k].paw, color: 'paw' }, ...(reveal ? [{ xs: cmp[k].t, ys: cmp[k].pmus, color: 'pmus', dash: [5, 3] }] : [])]} />
                <StaticChart className="minichart" xlabel="Tiempo (s)" ylabel="Flujo (L/min)" vlines={cmp[k].starts} series={[{ xs: cmp[k].t, ys: cmp[k].flow, color: 'flow' }]} />
              </div>
            ))}
            <div className="legend small">
              <span style={{ ['--c' as string]: 'var(--accent)' }}>inicio de ciclo disparado por paciente</span>
              <span style={{ ['--c' as string]: 'var(--muted)' }}>inicio de ciclo por tiempo</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
