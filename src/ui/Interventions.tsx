import type { PatientParams } from '../engine/types';
import { FLUID_LABEL, SEDATION_LABEL, type FluidBalance, type Interventions, type Sedation } from '../education/interventions';

interface Props {
  iv: Interventions;
  onChange: (iv: Interventions) => void;
  /** paciente sin intervenciones y paciente actual (para resumir el efecto) */
  base: PatientParams | null;
  current: PatientParams;
  warnings: string[];
}

const f = (v: number, d = 0) => v.toFixed(d);

/** Barra de intervenciones clínicas sobre el paciente (sobre los bucles). */
export function InterventionsBar({ iv, onChange, base, current, warnings }: Props) {
  const effects: string[] = [];
  if (base) {
    const b = base.effort;
    const c = current.effort;
    if (Math.abs(b.pmusMax - c.pmusMax) > 0.05) effects.push(`Pmus ${f(b.pmusMax, 1)}→${f(c.pmusMax, 1)} cmH₂O`);
    if (Math.abs(b.rr - c.rr) > 0.5 && c.pmusMax > 0.3) effects.push(`FR neural ${f(b.rr)}→${f(c.rr)}`);
    if (!b.reverseTrigger && c.reverseTrigger) effects.push('arrastre (disparo reverso)');
    if (b.reverseTrigger && !c.reverseTrigger) effects.push('sin disparo reverso');
    if (Math.abs(base.mapBase - current.mapBase) > 0.5) effects.push(`PAM basal ${f(current.mapBase - base.mapBase)} mmHg`);
    if (Math.abs(base.eL - current.eL) > 0.2) effects.push(`E pulmonar ${f(base.eL, 1)}→${f(current.eL, 1)}`);
    if (Math.abs(base.shuntMax - current.shuntMax) > 0.005) effects.push(`shunt máx ${f(base.shuntMax * 100)}→${f(current.shuntMax * 100)} %`);
  }
  const active = iv.sedation > 0 || iv.nmb || iv.fluid > 0;
  return (
    <div className={'ivbar' + (active ? ' on' : '')} role="group" aria-label="Intervenciones clínicas">
      <span className="iv-tag">Intervenciones</span>
      <label className="iv-ctl">
        <span>Sedación</span>
        <select value={iv.nmb ? 3 : iv.sedation} disabled={iv.nmb} onChange={(e) => onChange({ ...iv, sedation: +e.target.value as Sedation })}>
          {([0, 1, 2, 3] as Sedation[]).map((k) => <option key={k} value={k}>{SEDATION_LABEL[k]}</option>)}
        </select>
      </label>
      <label className="iv-ctl chk">
        <input type="checkbox" checked={iv.nmb} onChange={(e) => onChange({ ...iv, nmb: e.target.checked, sedation: e.target.checked ? 3 : iv.sedation })} />
        <span>Relajación neuromuscular</span>
      </label>
      <label className="iv-ctl">
        <span>Balance negativo</span>
        <select value={iv.fluid} onChange={(e) => onChange({ ...iv, fluid: +e.target.value as FluidBalance })}>
          {([0, 1, 2] as FluidBalance[]).map((k) => <option key={k} value={k}>{FLUID_LABEL[k]}</option>)}
        </select>
      </label>
      {active && (
        <button className="iv-reset" onClick={() => onChange({ sedation: 0, nmb: false, fluid: 0 })} title="Retirar todas las intervenciones">
          Retirar
        </button>
      )}
      {active && effects.length > 0 && <span className="iv-eff">{effects.join(' · ')}</span>}
      {warnings.map((w) => (
        <span key={w} className="iv-warn">⚠ {w}</span>
      ))}
    </div>
  );
}
