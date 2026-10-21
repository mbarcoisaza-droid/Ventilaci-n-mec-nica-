import { Simulator } from '../engine/simulator';
import type { ModeId, VentSettings } from '../engine/types';
import { MODES, MODE_BY_ID } from '../education/modes';

interface KnobDef {
  key: keyof VentSettings;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  scale?: number; // valor mostrado = valor × scale
  id?: string;
}

const K: Record<string, KnobDef> = {
  vt: { key: 'vt', label: 'Vt', unit: 'mL', min: 100, max: 1200, step: 10 },
  rr: { key: 'rr', label: 'FR', unit: 'rpm', min: 4, max: 50, step: 1 },
  peep: { key: 'peep', label: 'PEEP', unit: 'cmH₂O', min: 0, max: 30, step: 1 },
  fio2: { key: 'fio2', label: 'FiO₂', unit: '%', min: 21, max: 100, step: 1, scale: 100 },
  peakFlow: { key: 'peakFlow', label: 'Flujo pico', unit: 'L/min', min: 10, max: 150, step: 1 },
  pause: { key: 'pause', label: 'Pausa insp.', unit: 's', min: 0, max: 2, step: 0.05 },
  ti: { key: 'ti', label: 'Ti', unit: 's', min: 0.3, max: 3, step: 0.05 },
  pinsp: { key: 'pinsp', label: 'P control', unit: 'cmH₂O', min: 0, max: 50, step: 1 },
  ps: { key: 'ps', label: 'P soporte', unit: 'cmH₂O', min: 0, max: 40, step: 1 },
  riseTime: { key: 'riseTime', label: 'Rise time', unit: 's', min: 0, max: 0.6, step: 0.025 },
  ets: { key: 'ets', label: 'Ciclado (ETS)', unit: '% pico', min: 5, max: 80, step: 1 },
  pHigh: { key: 'pHigh', label: 'P alta', unit: 'cmH₂O', min: 5, max: 45, step: 1 },
  pLow: { key: 'pLow', label: 'P baja', unit: 'cmH₂O', min: 0, max: 25, step: 1 },
  tHigh: { key: 'tHigh', label: 'T alto', unit: 's', min: 0.5, max: 10, step: 0.1 },
  tLow: { key: 'tLow', label: 'T bajo', unit: 's', min: 0.2, max: 3, step: 0.05 },
};

const ALARMS: { key: keyof VentSettings['alarms']; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'pawMax', label: 'P máx (límite)', unit: 'cmH₂O', min: 15, max: 80, step: 1 },
  { key: 'vteMin', label: 'Vte mín', unit: 'mL', min: 0, max: 800, step: 10 },
  { key: 'vteMax', label: 'Vte máx', unit: 'mL', min: 200, max: 2000, step: 10 },
  { key: 'mvMin', label: 'VM mín', unit: 'L/min', min: 0, max: 15, step: 0.5 },
  { key: 'mvMax', label: 'VM máx', unit: 'L/min', min: 5, max: 40, step: 0.5 },
  { key: 'rrMax', label: 'FR máx', unit: 'rpm', min: 10, max: 70, step: 1 },
  { key: 'apneaTime', label: 'Apnea', unit: 's', min: 5, max: 60, step: 1 },
];

function Knob({ d, value, onChange, hint }: { d: KnobDef; value: number; onChange: (v: number) => void; hint?: string }) {
  const sc = d.scale ?? 1;
  const shown = Math.round(value * sc * 1000) / 1000;
  const set = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    const v = Math.min(d.max, Math.max(d.min, raw));
    onChange(Math.round((v / d.step)) * d.step / sc);
  };
  const id = `knob-${d.id ?? d.key}`;
  return (
    <div className="knob">
      <label className="lab" htmlFor={id}>
        <span>{d.label}</span>
        <span>{d.unit}</span>
      </label>
      <div className="row">
        <input id={id} type="number" value={shown} min={d.min} max={d.max} step={d.step} onChange={(e) => set(parseFloat(e.target.value))} />
        {hint && <span className="hint">{hint}</span>}
      </div>
      <input type="range" aria-label={d.label} min={d.min} max={d.max} step={d.step} value={shown} onChange={(e) => set(parseFloat(e.target.value))} />
    </div>
  );
}

interface Props {
  s: VentSettings;
  pbw: number;
  onChange: (s: VentSettings) => void;
  adaptiveP: number;
}

export function Controls({ s, pbw, onChange, adaptiveP }: Props) {
  const info = MODE_BY_ID[s.mode];
  const set = (k: keyof VentSettings, v: unknown) => onChange({ ...s, [k]: v });
  const has = (k: string) => info.controls.includes(k);
  const knob = (k: string, hint?: string) => (has(k) ? <Knob key={k} d={K[k]} value={s[K[k].key] as number} onChange={(v) => set(K[k].key, v)} hint={hint} /> : null);

  const ttot = 60 / Math.max(1, s.rr);
  const ti = Simulator.inspTime(s);
  const isVC = s.mode === 'VCV' || s.mode === 'SIMV_VC';
  const aprv = s.mode === 'APRV' || s.mode === 'BILEVEL';
  const te = aprv ? s.tLow : ttot - ti;
  const warnings: string[] = [];
  if (Number.isFinite(ti) && !aprv) {
    if (te < 0.25) warnings.push(`Tiempo espiratorio de ${te.toFixed(2)} s: insuficiente; el ventilador retrasará el siguiente ciclo (FR real < programada).`);
    else if (ti > te) warnings.push('Relación I:E invertida.');
  }
  if (aprv && s.pLow >= s.pHigh) warnings.push('P baja ≥ P alta.');
  if (s.mode === 'PCV' && s.pinsp + s.peep > s.alarms.pawMax) warnings.push('Pinsp + PEEP supera el límite de presión.');
  if (s.vt / pbw > 8 && (isVC || s.mode === 'PRVC' || s.mode === 'VS')) warnings.push(`Vt ${(s.vt / pbw).toFixed(1)} mL/kg PBW: por encima del rango protector.`);

  return (
    <div className="card controls">
      <div className="modes" role="group" aria-label="Modo ventilatorio">
        {MODES.map((m) => (
          <button key={m.id} className={s.mode === m.id ? 'primary' : ''} onClick={() => set('mode', m.id as ModeId)} title={m.name}>
            {m.short}
          </button>
        ))}
      </div>
      <div className="knobs">
        {knob('vt', `${(s.vt / pbw).toFixed(1)} mL/kg`)}
        {has('vt') && (
          <div className="knob">
            <label className="lab" htmlFor="knob-vtkg">
              <span>Vt por PBW</span>
              <span>mL/kg</span>
            </label>
            <div className="row">
              <input id="knob-vtkg" type="number" step={0.5} min={3} max={12} value={Math.round((s.vt / pbw) * 10) / 10} onChange={(e) => set('vt', Math.round((parseFloat(e.target.value) * pbw) / 10) * 10)} />
              <span className="hint">PBW {pbw.toFixed(1)} kg</span>
            </div>
          </div>
        )}
        {knob('rr')}
        {knob('peep')}
        {knob('fio2')}
        {knob('peakFlow')}
        {has('flowPattern') && (
          <div className="knob">
            <label className="lab" htmlFor="knob-pattern">
              <span>Patrón de flujo</span>
            </label>
            <select id="knob-pattern" value={s.flowPattern} onChange={(e) => set('flowPattern', e.target.value)}>
              <option value="square">Constante (cuadrado)</option>
              <option value="decel">Desacelerado (rampa 100→25 %)</option>
            </select>
          </div>
        )}
        {knob('pause')}
        {knob('ti')}
        {knob('pinsp', s.mode === 'PRVC' ? `actual ${adaptiveP.toFixed(0)}` : undefined)}
        {knob('ps', s.mode === 'VS' ? `actual ${adaptiveP.toFixed(0)}` : undefined)}
        {(s.mode === 'PRVC' || s.mode === 'VS') && (
          <div className="knob">
            <span className="lab">
              <span>{s.mode === 'PRVC' ? 'Pinsp adaptativa' : 'PS adaptativa'}</span>
              <span>cmH₂O</span>
            </span>
            <div className="row">
              <span className="num" style={{ fontSize: 17, fontWeight: 600 }}>{adaptiveP.toFixed(1)}</span>
              <span className="hint">±3/ciclo</span>
            </div>
          </div>
        )}
        {knob('riseTime')}
        {knob('ets')}
        {knob('pHigh')}
        {knob('pLow')}
        {knob('tHigh')}
        {knob('tLow')}
        {has('trigger') && (
          <div className="knob">
            <label className="lab" htmlFor="knob-trig">
              <span>Disparo</span>
              <span>{s.triggerType === 'flow' ? 'L/min' : s.triggerType === 'pressure' ? 'cmH₂O' : ''}</span>
            </label>
            <div className="row">
              <select id="knob-trig" value={s.triggerType} onChange={(e) => set('triggerType', e.target.value)}>
                <option value="flow">Flujo</option>
                <option value="pressure">Presión</option>
                {(s.mode === 'VCV' || s.mode === 'PCV' || s.mode === 'PRVC') && <option value="off">Desactivado (CMV)</option>}
              </select>
              {s.triggerType !== 'off' && (
                <input
                  aria-label="Sensibilidad de disparo"
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={10}
                  value={s.triggerType === 'flow' ? s.flowTrigger : s.pressureTrigger}
                  onChange={(e) => set(s.triggerType === 'flow' ? 'flowTrigger' : 'pressureTrigger', Math.max(0.5, Math.min(10, parseFloat(e.target.value) || 0.5)))}
                />
              )}
            </div>
            <label className="small row">
              <input type="checkbox" checked={s.leakComp} onChange={(e) => set('leakComp', e.target.checked)} /> Compensación de fugas
            </label>
          </div>
        )}
      </div>
      <div className="derived">
        <span>Modo: <b>{info.name}</b></span>
        {Number.isFinite(ti) && <span>Ti <b>{ti.toFixed(2)} s</b></span>}
        {Number.isFinite(ti) && !aprv && <span>Te <b>{Math.max(0, te).toFixed(2)} s</b></span>}
        {Number.isFinite(ti) && te > 0 && <span>I:E <b>1:{(te / ti).toFixed(1)}</b></span>}
        {isVC && <span>Ti de flujo <b>{Simulator.vcTi(s).toFixed(2)} s</b></span>}
        {aprv && <span>Liberaciones <b>{(60 / (s.tHigh + s.tLow)).toFixed(1)} /min</b></span>}
      </div>
      {warnings.map((w) => (
        <div className="warnmsg" key={w}>⚠ {w}</div>
      ))}
      <details style={{ marginTop: 8 }}>
        <summary className="small muted">Alarmas</summary>
        <div className="knobs" style={{ marginTop: 6 }}>
          {ALARMS.map((a) => (
            <Knob
              key={a.key}
              d={{ key: 'vt', id: `al-${a.key}`, label: a.label, unit: a.unit, min: a.min, max: a.max, step: a.step }}
              value={s.alarms[a.key]}
              onChange={(v) => onChange({ ...s, alarms: { ...s.alarms, [a.key]: v } })}
            />
          ))}
        </div>
      </details>
    </div>
  );
}
