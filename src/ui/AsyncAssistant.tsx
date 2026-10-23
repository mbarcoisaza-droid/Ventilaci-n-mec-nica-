import { useState } from 'react';
import type { Controller } from './controller';
import { dominantAsync, planFix, type FixPlan } from '../education/fixAsync';
import { ASYNCHRONIES } from '../education/asynchronies';

export interface AssistActions {
  applyVent: (p: FixPlan) => void;
  applyCause: (p: FixPlan) => void;
  undo: () => void;
  canUndo: boolean;
  lastApplied: { name: string; what: string; t: number } | null;
}

/** Aviso compacto en la pantalla central (nivel guiado). */
export function AsyncBanner({ ctl, actions, onOpen }: { ctl: Controller; actions: AssistActions; onOpen: () => void }) {
  const sim = ctl.sim;
  const dom = dominantAsync(sim, 20);
  const recentFix = actions.lastApplied && sim.t - actions.lastApplied.t < 40 ? actions.lastApplied : null;
  if (!dom && !recentFix) return null;
  if (!dom && recentFix)
    return (
      <div className="asyncbanner ok" role="status">
        <span className="ab-tag">Resuelta</span>
        <span className="ab-text">Sin asincronías en los últimos 20 s tras «{recentFix.what}» ({recentFix.name}).</span>
        {actions.canUndo && <button onClick={actions.undo}>Deshacer</button>}
      </div>
    );
  const plan = planFix(dom!.type, sim.settings, sim.patient, sim.monitor());
  return (
    <div className="asyncbanner" role="status">
      <span className="ab-tag">Asincronía</span>
      <span className="ab-text">
        <b>{plan.name}</b> · {dom!.count} en 20 s · asincronía <span className="ab-sync">{sim.asyncStats(30, 10).pct} %</span>
      </span>
      <button className="ab-main" onClick={() => actions.applyVent(plan)}>Resolver en el ventilador</button>
      {plan.patientSteps.length > 0 && <button onClick={() => actions.applyCause(plan)}>Tratar la causa</button>}
      <button onClick={onOpen}>Ver instrucciones</button>
      {actions.canUndo && <button onClick={actions.undo}>Deshacer</button>}
    </div>
  );
}

/** Panel completo con pasos, justificación y recomendaciones para la práctica. */
export function AsyncResolvePanel({ ctl, actions }: { ctl: Controller; actions: AssistActions }) {
  const sim = ctl.sim;
  const dom = dominantAsync(sim, 20);
  const [manual, setManual] = useState<string>('');
  const type = manual || dom?.type || '';
  const plan = type ? planFix(type, sim.settings, sim.patient, sim.monitor()) : null;

  return (
    <>
      <div className="sec">
        <h3>Resolver asincronías</h3>
        <p className="small">
          {dom ? (
            <>
              Detector del modelo: <b>{dom.label}</b> ({dom.count} en los últimos 20 s).
            </>
          ) : (
            'No se detectan asincronías en los últimos 20 s.'
          )}{' '}
          Puede elegir otra para ver cómo se corrige.
        </p>
        <select aria-label="Asincronía a resolver" value={manual} onChange={(e) => setManual(e.target.value)}>
          <option value="">{dom ? `La detectada (${dom.label})` : 'Elija una asincronía…'}</option>
          {ASYNCHRONIES.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {actions.lastApplied && (
          <div className="note small">
            Aplicado: «{actions.lastApplied.what}» para {actions.lastApplied.name}. Observe las curvas unos ciclos; el aviso desaparece cuando el detector deja de encontrarla.
          </div>
        )}
      </div>

      {plan && (
        <>
          <div className="sec">
            <h4>1 · Confírmela en las curvas</h4>
            <ul className="tight small">{plan.confirm.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div className="sec">
            <h4>2 · Ajustes del ventilador (con la programación actual)</h4>
            <ol className="tight small steps">
              {plan.steps.map((x) => (
                <li key={x.label}>
                  <b>{x.label}</b>
                  {x.why ? <span className="muted"> — {x.why}</span> : null}
                </li>
              ))}
            </ol>
            <div className="row">
              <button className="primary" onClick={() => actions.applyVent(plan)} disabled={plan.steps[0]?.label.startsWith('Sin cambio')}>
                Aplicar ajustes del ventilador
              </button>
              {actions.canUndo && <button onClick={actions.undo}>Deshacer</button>}
            </div>
          </div>
          {plan.patientSteps.length > 0 && (
            <div className="sec">
              <h4>3 · Tratar la causa en el paciente</h4>
              <ul className="tight small">
                {plan.patientSteps.map((x) => (
                  <li key={x.label}>
                    <b>{x.label}</b> <span className="muted">— {x.why}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => actions.applyCause(plan)}>Aplicar en el paciente simulado</button>
            </div>
          )}
          <div className="sec">
            <h4>En la vida real</h4>
            <ul className="tight small">{plan.realLife.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="disclaimer">Recomendaciones educativas basadas en el modelo y en la literatura; no sustituyen la valoración clínica del paciente real.</p>
          </div>
        </>
      )}
    </>
  );
}
