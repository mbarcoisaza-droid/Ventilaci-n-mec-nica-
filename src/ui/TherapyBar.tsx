import { useEffect, useState } from 'react';
import { Simulator } from '../engine/simulator';
import type { ModeId, VentSettings } from '../engine/types';
import { MODES, MODE_BY_ID } from '../education/modes';

/**
 * Barra de terapia con el paradigma «seleccionar → girar → confirmar» de los ventiladores
 * de UCI: el valor nuevo queda pendiente (resaltado) hasta que se confirma.
 */

interface KnobDef {
  key: keyof VentSettings;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  scale?: number; // valor mostrado = valor interno × scale
  digits?: number;
}

const K: Record<string, KnobDef> = {
  vt: { key: 'vt', label: 'VT', unit: 'mL', min: 100, max: 1200, step: 10 },
  rr: { key: 'rr', label: 'FR', unit: '/min', min: 4, max: 50, step: 1 },
  peep: { key: 'peep', label: 'PEEP', unit: 'cmH₂O', min: 0, max: 30, step: 1 },
  fio2: { key: 'fio2', label: 'FiO₂', unit: '%', min: 21, max: 100, step: 1, scale: 100 },
  peakFlow: { key: 'peakFlow', label: 'Flujo', unit: 'L/min', min: 10, max: 150, step: 1 },
  pause: { key: 'pause', label: 'Pausa', unit: 's', min: 0, max: 2, step: 0.05, digits: 2 },
  ti: { key: 'ti', label: 'Ti', unit: 's', min: 0.3, max: 3, step: 0.05, digits: 2 },
  pinsp: { key: 'pinsp', label: 'Pinsp', unit: 'cmH₂O', min: 0, max: 50, step: 1 },
  ps: { key: 'ps', label: 'ΔPsop', unit: 'cmH₂O', min: 0, max: 40, step: 1 },
  riseTime: { key: 'riseTime', label: 'Rampa', unit: 's', min: 0, max: 0.6, step: 0.025, digits: 3 },
  ets: { key: 'ets', label: 'Ciclado', unit: '% pico', min: 5, max: 80, step: 1 },
  pHigh: { key: 'pHigh', label: 'P alta', unit: 'cmH₂O', min: 5, max: 45, step: 1 },
  pLow: { key: 'pLow', label: 'P baja', unit: 'cmH₂O', min: 0, max: 25, step: 1 },
  tHigh: { key: 'tHigh', label: 'T alto', unit: 's', min: 0.5, max: 10, step: 0.1, digits: 1 },
  tLow: { key: 'tLow', label: 'T bajo', unit: 's', min: 0.2, max: 3, step: 0.05, digits: 2 },
  flowTrigger: { key: 'flowTrigger', label: 'Disparo', unit: 'L/min', min: 0.5, max: 10, step: 0.5, digits: 1 },
  pressureTrigger: { key: 'pressureTrigger', label: 'Disparo', unit: 'cmH₂O', min: 0.5, max: 10, step: 0.5, digits: 1 },
};

const ALARMS: { key: keyof VentSettings['alarms']; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'pawMax', label: 'Pmáx (límite)', unit: 'cmH₂O', min: 15, max: 80, step: 1 },
  { key: 'vteMin', label: 'VTe mín', unit: 'mL', min: 0, max: 800, step: 10 },
  { key: 'vteMax', label: 'VTe máx', unit: 'mL', min: 200, max: 2000, step: 10 },
  { key: 'mvMin', label: 'VM mín', unit: 'L/min', min: 0, max: 15, step: 0.5 },
  { key: 'mvMax', label: 'VM máx', unit: 'L/min', min: 5, max: 40, step: 0.5 },
  { key: 'rrMax', label: 'FR máx', unit: '/min', min: 10, max: 70, step: 1 },
  { key: 'apneaTime', label: 'Apnea', unit: 's', min: 5, max: 60, step: 1 },
];

const show = (d: KnobDef, v: number) => {
  const x = v * (d.scale ?? 1);
  return d.digits ? x.toFixed(d.digits) : String(Math.round(x));
};

interface Props {
  s: VentSettings;
  pbw: number;
  onChange: (s: VentSettings) => void;
  adaptiveP: number;
  onHold: (k: 'inspHold' | 'expHold') => void;
  holdBusy: boolean;
}

export function TherapyBar({ s, pbw, onChange, adaptiveP, onHold, holdBusy }: Props) {
  const info = MODE_BY_ID[s.mode];
  const [sel, setSel] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [panel, setPanel] = useState<'none' | 'modes' | 'alarms' | 'trigger'>('none');
  const has = (k: string) => info.controls.includes(k);

  const trigKey = s.triggerType === 'pressure' ? 'pressureTrigger' : 'flowTrigger';
  const keys = ['vt', 'pinsp', 'ps', 'pHigh', 'pLow', 'tHigh', 'tLow', 'rr', 'ti', 'peakFlow', 'pause', 'peep', 'fio2', 'riseTime', 'ets'].filter((k) => has(k));
  if (has('trigger') && s.triggerType !== 'off') keys.push(trigKey);

  const d = sel ? K[sel] : null;
  const current = d ? (s[d.key] as number) : 0;
  const value = pending ?? current;

  const clamp = (dd: KnobDef, v: number) => {
    const sc = dd.scale ?? 1;
    const shown = Math.min(dd.max, Math.max(dd.min, v * sc));
    return (Math.round(shown / dd.step) * dd.step) / sc;
  };
  const nudge = (dir: number, big = false) => {
    if (!d) return;
    const sc = d.scale ?? 1;
    setPending(clamp(d, value + (dir * d.step * (big ? 5 : 1)) / sc));
  };
  const confirm = () => {
    if (d && pending !== null) onChange({ ...s, [d.key]: pending });
    setSel(null);
    setPending(null);
  };
  const cancel = () => {
    setSel(null);
    setPending(null);
  };
  const choose = (k: string) => {
    if (sel === k) return cancel();
    setPanel('none');
    setSel(k);
    setPending(null);
  };

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter') confirm();
      else if (e.key === 'Escape') cancel();
      else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        nudge(1, e.shiftKey);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        nudge(-1, e.shiftKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // valores derivados con el valor pendiente aplicado
  const preview: VentSettings = d && pending !== null ? { ...s, [d.key]: pending } : s;
  const ttot = 60 / Math.max(1, preview.rr);
  const ti = Simulator.inspTime(preview);
  const aprv = preview.mode === 'APRV' || preview.mode === 'BILEVEL';
  const te = aprv ? preview.tLow : ttot - ti;
  const warnings: string[] = [];
  if (Number.isFinite(ti) && !aprv) {
    if (te < 0.25) warnings.push(`Te ${te.toFixed(2)} s insuficiente: la FR real será menor que la programada.`);
    else if (ti > te) warnings.push('Relación I:E invertida.');
  }
  if (aprv && preview.pLow >= preview.pHigh) warnings.push('P baja ≥ P alta.');
  if ((preview.mode === 'PCV' || preview.mode === 'SIMV_PC') && preview.pinsp + preview.peep > preview.alarms.pawMax) warnings.push('Pinsp + PEEP supera el límite de presión.');
  if (has('vt') && preview.vt / pbw > 8) warnings.push(`VT ${(preview.vt / pbw).toFixed(1)} mL/kg PBW: por encima del rango protector.`);

  const hint = (k: string, v: number) => {
    if (k === 'vt') return `${(v / pbw).toFixed(1)} mL/kg`;
    if (k === 'pinsp' && s.mode === 'PRVC') return `actual ${adaptiveP.toFixed(0)}`;
    if (k === 'ps' && s.mode === 'VS') return `actual ${adaptiveP.toFixed(0)}`;
    return '';
  };

  return (
    <div className="therapy">
      {(d || panel !== 'none' || warnings.length > 0) && (
        <div className={'therapy-pop' + (!d && panel === 'none' ? ' only-warn' : '')} role={d ? 'dialog' : undefined} aria-label={d ? 'Ajuste de parámetro' : undefined}>
          {d && (
            <div className="knobpanel">
              <div className="kp-head">
                <span className="kp-label">{d.label}</span>
                <span className="kp-unit">{d.unit}</span>
              </div>
              <div className="kp-row">
                <button className="kp-step" aria-label="Disminuir" onClick={() => nudge(-1)} onDoubleClick={() => nudge(-1, true)}>−</button>
                <div className={'kp-value num' + (pending !== null && pending !== current ? ' pending' : '')} onWheel={(e) => nudge(e.deltaY < 0 ? 1 : -1, e.shiftKey)}>
                  {show(d, value)}
                </div>
                <button className="kp-step" aria-label="Aumentar" onClick={() => nudge(1)} onDoubleClick={() => nudge(1, true)}>+</button>
              </div>
              <input
                type="range"
                aria-label={`${d.label} (${d.unit})`}
                min={d.min}
                max={d.max}
                step={d.step}
                value={value * (d.scale ?? 1)}
                onChange={(e) => setPending(clamp(d, parseFloat(e.target.value) / (d.scale ?? 1)))}
              />
              <div className="kp-info small">
                <span>actual {show(d, current)}</span>
                {hint(sel!, value) && <span>{hint(sel!, value)}</span>}
                {Number.isFinite(ti) && <span>Ti {ti.toFixed(2)} s</span>}
                {Number.isFinite(ti) && te > 0 && <span>I:E 1:{(te / ti).toFixed(1)}</span>}
              </div>
              <div className="kp-actions">
                <button onClick={cancel}>Cancelar</button>
                <button className="confirm" onClick={confirm} disabled={pending === null || pending === current}>Confirmar</button>
              </div>
              <div className="small muted">Rueda del ratón o flechas para girar · Intro confirma · Esc cancela</div>
            </div>
          )}
          {!d && panel === 'modes' && (
            <div className="modegrid">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  className={'modekey' + (s.mode === m.id ? ' active' : '')}
                  onClick={() => {
                    onChange({ ...s, mode: m.id as ModeId });
                    setPanel('none');
                  }}
                >
                  <b>{m.short}</b>
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          )}
          {!d && panel === 'trigger' && (
            <div className="optpanel">
              <span className="kp-label">Disparo</span>
              <div className="seg">
                {(['flow', 'pressure', ...(s.mode === 'VCV' || s.mode === 'PCV' || s.mode === 'PRVC' ? ['off'] : [])] as VentSettings['triggerType'][]).map((t) => (
                  <button key={t} className={s.triggerType === t ? 'active' : ''} onClick={() => onChange({ ...s, triggerType: t })}>
                    {t === 'flow' ? 'Flujo' : t === 'pressure' ? 'Presión' : 'Off (CMV)'}
                  </button>
                ))}
              </div>
              {has('flowPattern') && (
                <>
                  <span className="kp-label">Patrón de flujo</span>
                  <div className="seg">
                    <button className={s.flowPattern === 'square' ? 'active' : ''} onClick={() => onChange({ ...s, flowPattern: 'square' })}>Constante</button>
                    <button className={s.flowPattern === 'decel' ? 'active' : ''} onClick={() => onChange({ ...s, flowPattern: 'decel' })}>Desacelerado</button>
                  </div>
                </>
              )}
              <label className="small row">
                <input type="checkbox" checked={s.leakComp} onChange={(e) => onChange({ ...s, leakComp: e.target.checked })} /> Compensación de fugas
              </label>
            </div>
          )}
          {!d && panel === 'alarms' && (
            <div className="alarmgrid">
              {ALARMS.map((a) => (
                <label key={a.key} className="alarmset">
                  <span className="kp-label">{a.label}</span>
                  <span className="row">
                    <input
                      type="number"
                      className="num"
                      min={a.min}
                      max={a.max}
                      step={a.step}
                      value={s.alarms[a.key]}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) onChange({ ...s, alarms: { ...s.alarms, [a.key]: Math.min(a.max, Math.max(a.min, v)) } });
                      }}
                    />
                    <span className="small muted">{a.unit}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {warnings.map((w) => (
            <div className="warnmsg" key={w}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div className="therapy-row">
        <button className={'modebtn' + (panel === 'modes' ? ' open' : '')} onClick={() => { cancel(); setPanel(panel === 'modes' ? 'none' : 'modes'); }} title={info.name}>
          <span className="mb-top">Modo</span>
          <span className="mb-val">{info.short}</span>
        </button>
        <div className="keys">
          {keys.map((k) => {
            const dd = K[k];
            const v = sel === k && pending !== null ? pending : (s[dd.key] as number);
            const adaptive = (k === 'pinsp' && s.mode === 'PRVC') || (k === 'ps' && s.mode === 'VS');
            return (
              <button
                key={k}
                className={'tkey' + (sel === k ? ' active' : '') + (sel === k && pending !== null && pending !== s[dd.key] ? ' pending' : '')}
                onClick={() => choose(k)}
                onWheel={(e) => {
                  if (sel !== k) return;
                  nudge(e.deltaY < 0 ? 1 : -1, e.shiftKey);
                }}
              >
                <span className="tk-label">{adaptive ? (k === 'pinsp' ? 'Pinsp máx' : 'PS máx') : k === 'vt' && (s.mode === 'PRVC' || s.mode === 'VS') ? 'VT obj.' : dd.label}</span>
                <span className="tk-val num">{show(dd, v)}</span>
                <span className="tk-unit">{dd.unit}</span>
              </button>
            );
          })}
          {(s.mode === 'PRVC' || s.mode === 'VS') && (
            <div className="tkey readonly" title="Presión calculada por el ventilador para alcanzar el VT objetivo">
              <span className="tk-label">{s.mode === 'PRVC' ? 'Pinsp auto' : 'PS auto'}</span>
              <span className="tk-val num">{adaptiveP.toFixed(0)}</span>
              <span className="tk-unit">cmH₂O</span>
            </div>
          )}
        </div>
        <div className="sidekeys">
          {(has('trigger') || has('flowPattern')) && (
            <button className={'skey' + (panel === 'trigger' ? ' open' : '')} onClick={() => { cancel(); setPanel(panel === 'trigger' ? 'none' : 'trigger'); }}>
              Opciones
            </button>
          )}
          <button className={'skey' + (panel === 'alarms' ? ' open' : '')} onClick={() => { cancel(); setPanel(panel === 'alarms' ? 'none' : 'alarms'); }}>
            Alarmas
          </button>
          <button className="skey hold" disabled={holdBusy} onClick={() => onHold('inspHold')} title="Pausa inspiratoria en el siguiente ciclo">
            Pausa insp.
          </button>
          <button className="skey hold" disabled={holdBusy} onClick={() => onHold('expHold')} title="Pausa espiratoria al final de la espiración">
            Pausa esp.
          </button>
        </div>
      </div>
    </div>
  );
}
