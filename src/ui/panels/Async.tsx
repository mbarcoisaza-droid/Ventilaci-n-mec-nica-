import { useState } from 'react';
import type { PatientParams, VentSettings } from '../../engine/types';
import type { Simulator } from '../../engine/simulator';
import { ASYNCHRONIES, ASYNC_EVENT_LABEL, RESOLVE_STEPS, applySteps, buildPreset, type Asynchrony } from '../../education/asynchronies';
import { REF } from '../../cases/cases';
import { genericRisks, settingsDiff, snapshot } from '../../cases/evaluate';

interface Props {
  sim: Simulator;
  settings: VentSettings;
  patient: PatientParams;
  level: 1 | 2 | 3;
  apply: (p: PatientParams, s: VentSettings, warm?: number) => void;
  events: Record<string, number>;
  /** asincronía en estudio (para el % del panel de valores) */
  onFocus: (id: string | null, hidden?: boolean) => void;
}

/** Estado del laboratorio: asincronía activa, pasos aplicados y % de asincronía medido antes de cada paso. */
interface Lab {
  id: string;
  /** programación y paciente al activar (para el modo experto) */
  base?: { s: VentSettings; p: PatientParams };
  /** identificador de cada activación (reinicia la evaluación experta) */
  run?: number;
  applied: number;
  history: { label: string; pct: number | null }[];
}

const MIN_CYCLES = 2;

const PHASE_LABEL: Record<Asynchrony['phase'], string> = { disparo: 'Disparo', ciclado: 'Ciclado', flujo: 'Flujo', espiración: 'Espiración' };

/** Bolsa aleatoria del desafío: no repite una asincronía hasta haber mostrado todas (persiste entre aperturas del panel). */
let challengeBag: string[] = [];
let lastChallenge: string | null = null;
function drawChallenge(): Asynchrony {
  if (!challengeBag.length) {
    challengeBag = ASYNCHRONIES.map((a) => a.id);
    for (let i = challengeBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [challengeBag[i], challengeBag[j]] = [challengeBag[j], challengeBag[i]];
    }
    // evita repetir la última al empezar una ronda nueva
    if (challengeBag[challengeBag.length - 1] === lastChallenge) challengeBag.unshift(challengeBag.pop()!);
  }
  const id = challengeBag.pop()!;
  lastChallenge = id;
  return ASYNCHRONIES.find((a) => a.id === id)!;
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

const EXPERT_MIN_CYCLES = 4;

interface ExpertResult {
  verdict: 'correcto' | 'parcial' | 'incorrecto';
  focusPct: number;
  allPct: number;
  changes: { label: string; from: string; to: string }[];
  patientChanges: string[];
  risks: string[];
  others: string[];
}

/** Modo experto: sin guía. El usuario ajusta lo que considere pertinente y, al finalizar, se evalúa el resultado. */
function ExpertResolver({ sim, a, lab, settings, patient, onRetry }: { sim: Simulator; a: Asynchrony; lab: Lab; settings: VentSettings; patient: PatientParams; onRetry: () => void }) {
  const [result, setResult] = useState<ExpertResult | null>(null);
  const st = sim.asyncStats(30, 0, a.id);
  const ready = st.cycles >= EXPERT_MIN_CYCLES;
  const finish = () => {
    const base = lab.base!;
    const changes = settingsDiff(base.s, settings);
    const patientChanges: string[] = [];
    if (base.p.effort.pmusMax !== patient.effort.pmusMax) patientChanges.push(`Esfuerzo (Pmus) ${base.p.effort.pmusMax} → ${patient.effort.pmusMax} cmH₂O`);
    if (base.p.effort.reverseTrigger !== patient.effort.reverseTrigger) patientChanges.push('Arrastre (disparo reverso) eliminado');
    if (base.p.leak !== patient.leak) patientChanges.push(`Fuga ${base.p.leak} → ${patient.leak} L/min`);
    const all = sim.asyncStats(30, 0);
    const snap = snapshot(sim);
    const risks = genericRisks(snap.metrics, settings, sim.pbw).filter((r) => !r.startsWith('Índice de asincronía'));
    const from = sim.t - st.window;
    const n: Record<string, number> = {};
    for (const e of sim.asyncEvents) if (e.t > from && e.type !== a.id && e.type !== 'stacking' && e.type !== 'airTrapping') n[e.type] = (n[e.type] ?? 0) + 1;
    const others = Object.entries(n).filter(([, c]) => c >= 2).map(([k, c]) => `${ASYNC_EVENT_LABEL[k]} ×${c}`);
    const changed = changes.length + patientChanges.length > 0;
    const verdict: ExpertResult['verdict'] =
      changed && st.pct <= 10 ? 'correcto' : changed && st.pct <= 50 ? 'parcial' : 'incorrecto';
    setResult({ verdict, focusPct: st.pct, allPct: all.pct, changes, patientChanges, risks, others });
  };
  if (result) {
    const steps = RESOLVE_STEPS[a.id] ?? [];
    const cls = result.verdict === 'correcto' ? 'note' : 'note warn';
    return (
      <div className="sec">
        <div className={cls}>
          <b>
            {result.verdict === 'correcto'
              ? result.risks.length + result.others.length > 0
                ? '✔ Cambios correctos (con observaciones)'
                : '✔ Cambios correctos'
              : result.verdict === 'parcial'
                ? '◐ Cambios parcialmente correctos: la asincronía persiste en parte'
                : '✘ Cambios incorrectos: la asincronía persiste'}
          </b>
          {' — '}asincronía ({a.name.toLowerCase()}): <b>{result.focusPct} %</b> de los ciclos (objetivo ≤ 10 %); todas las asincronías mayores: {result.allPct} %.
        </div>
        <h4>Sus cambios</h4>
        {result.changes.length + result.patientChanges.length === 0 ? (
          <p className="small">No modificó ningún parámetro.</p>
        ) : (
          <ul className="tight small">
            {result.changes.map((c) => <li key={c.label}>{c.label}: {c.from} → {c.to}</li>)}
            {result.patientChanges.map((c) => <li key={c}>{c}</li>)}
          </ul>
        )}
        {result.others.length > 0 && <p className="small">Observación: otras asincronías presentes tras sus cambios: {result.others.join(' · ')}.</p>}
        {result.risks.length > 0 && (
          <>
            <h4>Observaciones: riesgos con la programación final</h4>
            <ul className="tight small">{result.risks.map((r) => <li key={r}>{r}</li>)}</ul>
          </>
        )}
        <h4>Manejo recomendado <span className="muted small">(Varón-Vega et al., 2024)</span></h4>
        <ol className="tight small">{steps.map((s) => <li key={s.label}><b>{s.label}</b> <span className="muted">— {s.why}</span></li>)}</ol>
        <div className="row">
          <button onClick={() => setResult(null)}>Seguir ajustando</button>
          <button onClick={onRetry}>Reintentar desde el inicio</button>
        </div>
      </div>
    );
  }
  return (
    <div className="sec">
      <p className="small">
        Modo experto: ajuste en el ventilador los parámetros que considere pertinentes y, cuando la programación sea la definitiva, acepte para evaluarla.
      </p>
      <div className="row">
        <button className="primary" onClick={finish} disabled={!ready}>
          Aceptar cambios y finalizar
        </button>
        {!ready && <span className="small muted">Esperando ciclos con la programación actual ({st.cycles}/{EXPERT_MIN_CYCLES})…</span>}
      </div>
    </div>
  );
}

export function AsyncPanel({ sim, settings, patient, level, apply, events, onFocus }: Props) {
  const [lab, setLab] = useState<Lab | null>(null);
  const [saved, setSaved] = useState<{ p: PatientParams; s: VentSettings } | null>(null);
  const [challenge, setChallenge] = useState<{ id: string; guess: string | null } | null>(null);

  const activate = (a: Asynchrony, hidden = false) => {
    if (!saved) setSaved({ p: patient, s: settings });
    const { patient: p, settings: s } = buildPreset(a.activate, settings);
    apply(p, s, 8);
    setLab({ id: a.id, applied: 0, history: [], base: { s, p }, run: Date.now() });
    onFocus(a.id, hidden);
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
    const a = drawChallenge();
    activate(a, true); // el tipo se revela al responder
    setChallenge({ id: a.id, guess: null });
  };
  const evList = Object.entries(events).filter(([, n]) => n > 0);
  const guessing = !!challenge && !challenge.guess;
  const seen = ASYNCHRONIES.length - challengeBag.length;

  return (
    <>
      <div className="sec">
        <h3>Asincronías paciente-ventilador</h3>
        <p className="small muted">
          {level === 3
            ? 'Al activarla, la asincronía aparece en todos los ciclos. Corríjala con los parámetros que considere pertinentes y acepte para evaluar el resultado.'
            : 'Al activarla, la asincronía aparece en todos los ciclos (asincronía ≈ 100 %). Resuélvala paso a paso y observe cómo baja el porcentaje en el panel de valores. Identifíquela con Paw, flujo y volumen; la Pmus del modelo puede mostrarse en niveles 1–2 para confirmar el mecanismo.'}
        </p>
        <div className="row">
          <button className="primary" onClick={startChallenge}>Desafío: asincronía aleatoria</button>
          {challenge && <span className="small muted">Ronda: {seen} de {ASYNCHRONIES.length} (sin repetir)</span>}
          {saved && <button onClick={restore}>Restaurar configuración previa</button>}
        </div>
        {level < 3 && !guessing && (
          <div className="small">
            Detector (verdad del modelo, 60 s): {evList.length ? evList.map(([k, n]) => `${ASYNC_EVENT_LABEL[k]} ×${n}`).join(' · ') : 'sin eventos'}
          </div>
        )}
      </div>
      {challenge && (
        <div className="item sel">
          <span className="ttl">¿Qué asincronía observa?</span>
          <select aria-label="Diagnóstico de la asincronía" value={challenge.guess ?? ''} onChange={(e) => {
              setChallenge({ ...challenge, guess: e.target.value });
              onFocus(challenge.id, false);
            }}>
            <option value="" disabled>Elija un diagnóstico…</option>
            {ASYNCHRONIES.map((a) => <option key={a.id} value={a.id}>{a.name} ({PHASE_LABEL[a.phase].toLowerCase()})</option>)}
          </select>
          {!challenge.guess && <p className="small muted">Observe Paw, flujo y volumen (y la Pmus en niveles 1–2). El nombre se revela al responder.</p>}
          {challenge.guess && lab && (() => {
            const ok = challenge.guess === challenge.id || (['double', 'stacking'].includes(challenge.guess) && ['double', 'stacking'].includes(challenge.id));
            const a = ASYNCHRONIES.find((x) => x.id === challenge.id)!;
            return (
              <>
                <div className={'note ' + (ok ? '' : 'warn')}>
                  {ok ? 'Correcto' : 'No es correcto'}: es <b>{a.name}</b> · tipo: {PHASE_LABEL[a.phase].toLowerCase()}.
                </div>
                {level === 3 ? (
                  <ExpertResolver key={lab.run} sim={sim} a={a} lab={lab} settings={settings} patient={patient} onRetry={() => activate(a)} />
                ) : (
                  <>
                    <StepResolver sim={sim} a={a} lab={lab} onStep={() => nextStep(a)} onAll={() => resolveAll(a)} />
                    <Detail a={a} revealName={false} />
                  </>
                )}
                <div className="row">
                  <button className="primary" onClick={startChallenge}>Otro desafío</button>
                  <button onClick={() => setChallenge(null)}>Volver a la lista</button>
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
                  <span className="ttl">
                    {a.name} <span className="phase-tag">{PHASE_LABEL[a.phase]}</span>
                  </span>
                  <span className="row">
                    <button onClick={() => activate(a)}>{active ? 'Reiniciar' : 'Activar asincronía'}</button>
                  </span>
                </div>
                {active && lab && level === 3 && <ExpertResolver key={lab.run} sim={sim} a={a} lab={lab} settings={settings} patient={patient} onRetry={() => activate(a)} />}
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
