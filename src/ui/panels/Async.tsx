import { useState } from 'react';
import type { PatientParams, VentSettings } from '../../engine/types';
import type { Simulator } from '../../engine/simulator';
import { ASYNCHRONIES, ASYNC_EVENT_LABEL, RESOLVE_STEPS, applySteps, buildPreset, type Asynchrony } from '../../education/asynchronies';
import { REF } from '../../cases/cases';

interface Props {
  sim: Simulator;
  settings: VentSettings;
  patient: PatientParams;
  level: 1 | 2 | 3;
  apply: (p: PatientParams, s: VentSettings, warm?: number) => void;
  events: Record<string, number>;
  /** asincronía en estudio (para el % del panel de valores) */
  onFocus: (id: string | null) => void;
}

/** Estado del laboratorio: asincronía activa, pasos aplicados y % de asincronía medido antes de cada paso. */
interface Lab {
  id: string;
  applied: number;
  history: { label: string; pct: number | null }[];
}

const MIN_CYCLES = 2;

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

/** Otras asincronías mayores presentes en la ventana (p. ej. las inducidas por una corrección). */
function OtherAsync({ sim, focus }: { sim: Simulator; focus: string }) {
  const from = sim.t - Math.min(30, Math.max(0, sim.t - sim.lastChange));
  const MAJOR = ['double', 'reverse', 'autotrigger', 'prematureCycle', 'delayedCycle', 'flowStarvation', 'flowAsync'];
  // el primer ciclo de un doble disparo cicla antes de terminar el esfuerzo: forma parte del mismo fenómeno
  const fam = ['double', 'stacking', 'flowStarvation'].includes(focus) ? ['double', 'stacking', 'prematureCycle', focus] : [focus];
  const n: Record<string, number> = {};
  for (const e of sim.asyncEvents) if (e.t > from && MAJOR.includes(e.type) && !fam.includes(e.type)) n[e.type] = (n[e.type] ?? 0) + 1;
  const list = Object.entries(n).filter(([, c]) => c >= 2);
  if (!list.length) return null;
  return (
    <div className="note warn small">
      También aparece: {list.map(([k, c]) => `${ASYNC_EVENT_LABEL[k]} ×${c}`).join(' · ')}. Una corrección puede generar otra asincronía: obsérvela en las curvas.
    </div>
  );
}

function StepResolver({ sim, a, lab, onStep, onAll }: { sim: Simulator; a: Asynchrony; lab: Lab; onStep: () => void; onAll: () => void }) {
  const steps = RESOLVE_STEPS[a.id] ?? [];
  const st = sim.asyncStats(30, 0, a.id);
  const measuring = st.cycles < MIN_CYCLES;
  const done = lab.applied >= steps.length;
  return (
    <div className="sec">
      <p className="small">
        <b>Asincronía</b> (% de ciclos con {a.name.toLowerCase()}): se muestra en el panel de valores, bajo «Disparo paciente».
      </p>
      <div className="sync-history small">
        {lab.history.map((h, i) => (
          <span key={i} className="sh-chip">
            {h.label}: <b>{h.pct === null ? '—' : `${h.pct} %`}</b>
          </span>
        ))}
        <span className="sh-chip now">
          {lab.applied === 0 ? 'Activada' : `Paso ${lab.applied}`}: <b>{measuring ? '…' : `${st.pct} %`}</b>
        </span>
      </div>
      <OtherAsync sim={sim} focus={a.id} />
      <h4>Resolver paso a paso <span className="muted small">(Varón-Vega et al., 2024)</span></h4>
      <ol className="steps-res">
        {steps.map((s, i) => {
          const state = i < lab.applied ? 'done' : i === lab.applied ? 'next' : 'todo';
          return (
            <li key={s.label} className={'sr-' + state}>
              <span className="sr-mark" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
              <span className="sr-body">
                <b>{s.label}</b>
                <span className="muted small"> — {s.why}</span>
              </span>
              {state === 'next' && (
                <button className="primary" onClick={onStep}>
                  Aplicar
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className="row">
        {!done && <button onClick={onAll}>Resolver todo de una vez</button>}
        {done && !measuring && st.pct <= 10 && <span className="note small">Asincronía resuelta. Compare las curvas con las del inicio.</span>}
        {done && !measuring && st.pct > 10 && <span className="note warn small">Aún hay ciclos asincrónicos: espere unos ciclos o revise la causa.</span>}
      </div>
      <p className="small muted">
        Aplique un paso, observe varios ciclos y vea cómo baja el % de asincronía. Cada paso sigue el manejo propuesto en la revisión de referencia; el último deja al paciente sincrónico.
      </p>
    </div>
  );
}

export function AsyncPanel({ sim, settings, patient, level, apply, events, onFocus }: Props) {
  const [lab, setLab] = useState<Lab | null>(null);
  const [saved, setSaved] = useState<{ p: PatientParams; s: VentSettings } | null>(null);
  const [challenge, setChallenge] = useState<{ id: string; guess: string | null } | null>(null);

  const activate = (a: Asynchrony) => {
    if (!saved) setSaved({ p: patient, s: settings });
    const { patient: p, settings: s } = buildPreset(a.activate, settings);
    apply(p, s, 8);
    setLab({ id: a.id, applied: 0, history: [] });
    onFocus(a.id);
  };
  const measured = (id: string) => {
    const st = sim.asyncStats(30, 0, id);
    return st.cycles < MIN_CYCLES ? null : st.pct;
  };
  const nextStep = (a: Asynchrony) => {
    if (!lab) return;
    const steps = RESOLVE_STEPS[a.id] ?? [];
    if (lab.applied >= steps.length) return;
    const pct = measured(a.id); // antes de aplicar: el cambio reinicia la ventana de medida
    const r = applySteps([steps[lab.applied]], 0, settings, patient);
    apply(r.patient, r.settings);
    setLab({ ...lab, applied: lab.applied + 1, history: [...lab.history, { label: lab.applied === 0 ? 'Activada' : `Paso ${lab.applied}`, pct }] });
  };
  const resolveAll = (a: Asynchrony) => {
    if (!lab) return;
    const steps = RESOLVE_STEPS[a.id] ?? [];
    const pct = measured(a.id);
    const r = applySteps(steps.slice(lab.applied), steps.length, settings, patient);
    apply(r.patient, r.settings);
    setLab({ ...lab, applied: steps.length, history: [...lab.history, { label: lab.applied === 0 ? 'Activada' : `Paso ${lab.applied}`, pct }] });
  };
  const restore = () => {
    if (saved) apply(saved.p, saved.s);
    setSaved(null);
    setLab(null);
    onFocus(null);
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
        <p className="small muted">
          Al activarla, la asincronía aparece en todos los ciclos (asincronía ≈ 100 %). Resuélvala paso a paso y observe cómo baja el porcentaje en el panel de valores. Identifíquela con Paw, flujo y volumen; la Pmus del modelo puede mostrarse en niveles 1–2 para confirmar el mecanismo.
        </p>
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
          {challenge.guess && lab && (() => {
            const ok = challenge.guess === challenge.id || (['double', 'stacking'].includes(challenge.guess) && ['double', 'stacking'].includes(challenge.id));
            const a = ASYNCHRONIES.find((x) => x.id === challenge.id)!;
            return (
              <>
                <div className={'note ' + (ok ? '' : 'warn')}>{ok ? 'Correcto' : 'No es correcto'}: era <b>{a.name}</b>.</div>
                <StepResolver sim={sim} a={a} lab={lab} onStep={() => nextStep(a)} onAll={() => resolveAll(a)} />
                <Detail a={a} revealName={false} />
                <div className="row">
                  <button onClick={startChallenge}>Otro desafío</button>
                </div>
              </>
            );
          })()}
        </div>
      )}
      {!challenge && (
        <div className="list">
          {ASYNCHRONIES.map((a) => {
            const active = lab?.id === a.id;
            return (
              <div key={a.id} className={'item' + (active ? ' sel' : '')}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="ttl">{hideNames ? `Patrón ${ASYNCHRONIES.indexOf(a) + 1}` : a.name}</span>
                  <span className="row">
                    <button onClick={() => activate(a)}>{active ? 'Reiniciar' : 'Activar asincronía'}</button>
                  </span>
                </div>
                {active && lab && level === 3 && (
                  <>
                    <button onClick={() => nextStep(a)} disabled={lab.applied >= (RESOLVE_STEPS[a.id]?.length ?? 0)}>
                      Aplicar siguiente corrección
                    </button>
                  </>
                )}
                {active && lab && level < 3 && (
                  <>
                    <StepResolver sim={sim} a={a} lab={lab} onStep={() => nextStep(a)} onAll={() => resolveAll(a)} />
                    <Detail a={a} revealName={false} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="small muted">Referencia: {REF.varon}</p>
    </>
  );
}
