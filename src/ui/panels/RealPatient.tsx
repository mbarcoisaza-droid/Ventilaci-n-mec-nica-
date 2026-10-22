import { useEffect, useState } from 'react';
import type { ModeId, VentSettings } from '../../engine/types';
import { DEFAULT_SETTINGS, PHENOTYPE_LIST } from '../../engine/presets';
import { MODES, MODE_BY_ID } from '../../education/modes';
import { calibrate, type AsyncSeverity, type CalibrationResult, type RealPatientInput } from '../../engine/calibrate';
import { ASYNCHRONIES } from '../../education/asynchronies';
import { predictedBodyWeight } from '../../engine/mechanics';

type Form = Record<string, string>;

const DRAFT_KEY = 'vmsim-real-patient-v1';

const SETTING_FIELDS: Record<string, { label: string; unit: string; step: number }> = {
  vt: { label: 'Vt programado', unit: 'mL', step: 10 },
  rr: { label: 'FR programada', unit: '/min', step: 1 },
  peep: { label: 'PEEP', unit: 'cmH₂O', step: 1 },
  fio2: { label: 'FiO₂', unit: '%', step: 1 },
  peakFlow: { label: 'Flujo pico', unit: 'L/min', step: 1 },
  pause: { label: 'Pausa insp.', unit: 's', step: 0.05 },
  ti: { label: 'Ti', unit: 's', step: 0.05 },
  pinsp: { label: 'P control (sobre PEEP)', unit: 'cmH₂O', step: 1 },
  ps: { label: 'P soporte (sobre PEEP)', unit: 'cmH₂O', step: 1 },
  riseTime: { label: 'Rampa', unit: 's', step: 0.025 },
  ets: { label: 'Ciclado', unit: '% pico', step: 1 },
  pHigh: { label: 'P alta', unit: 'cmH₂O', step: 1 },
  pLow: { label: 'P baja', unit: 'cmH₂O', step: 1 },
  tHigh: { label: 'T alto', unit: 's', step: 0.1 },
  tLow: { label: 'T bajo', unit: 's', step: 0.05 },
};

const EMPTY: Form = {
  sex: 'M', age: '', heightCm: '', weightKg: '', phenotype: 'ardsModerate', tempC: '',
  mode: 'VCV', vt: '', rr: '', peep: '', fio2: '', peakFlow: '', flowPattern: 'square', pause: '', ti: '', pinsp: '', ps: '', riseTime: '', ets: '',
  pHigh: '', pLow: '', tHigh: '', tLow: '', triggerType: 'flow', trig: '',
  ppeak: '', pplat: '', peepTotal: '', vte: '', rrTotal: '', rInsp: '', p01: '', pocc: '', pesEI: '', pesEE: '',
  map: '', hr: '', hb: '', icp: '',
  ph: '', paco2: '', pao2: '', hco3: '',
  asyncType: 'none', asyncSeverity: 'frecuente',
};

/** Ejemplo ficticio (no corresponde a ningún paciente real) */
const EXAMPLE: Form = {
  ...EMPTY,
  sex: 'M', age: '58', heightCm: '172', weightKg: '85', phenotype: 'ardsModerate', tempC: '38.2',
  mode: 'VCV', vt: '410', rr: '24', peep: '12', fio2: '60', peakFlow: '60', flowPattern: 'square', pause: '0.3', triggerType: 'flow', trig: '2',
  ppeak: '34', pplat: '27', peepTotal: '13', vte: '405', rrTotal: '24',
  map: '72', hr: '105', hb: '10.5',
  ph: '7.29', paco2: '52', pao2: '78', hco3: '24.5',
};

const num = (v: string | undefined) => {
  if (v === undefined || v.trim() === '') return undefined;
  const x = parseFloat(v.replace(',', '.'));
  return Number.isFinite(x) ? x : undefined;
};

function toInput(f: Form): { inp: RealPatientInput | null; errors: string[] } {
  const errors: string[] = [];
  const height = num(f.heightCm);
  const weight = num(f.weightKg);
  if (!height || height < 120 || height > 220) errors.push('Talla entre 120 y 220 cm.');
  if (!weight || weight < 30 || weight > 300) errors.push('Peso real entre 30 y 300 kg.');
  const mode = f.mode as ModeId;
  const controls = MODE_BY_ID[mode].controls;
  const s: VentSettings = { ...DEFAULT_SETTINGS, mode, alarms: { ...DEFAULT_SETTINGS.alarms } };
  for (const k of Object.keys(SETTING_FIELDS)) {
    if (!controls.includes(k)) continue;
    const v = num(f[k]);
    if (v === undefined) {
      if (['vt', 'rr', 'peep', 'fio2', 'pinsp', 'ps', 'ti', 'peakFlow', 'pHigh', 'pLow', 'tHigh', 'tLow'].includes(k)) errors.push(`Falta «${SETTING_FIELDS[k].label}».`);
      continue;
    }
    (s as unknown as Record<string, number>)[k] = k === 'fio2' ? v / 100 : v;
  }
  if (controls.includes('fio2') && (s.fio2 < 0.21 || s.fio2 > 1)) errors.push('FiO₂ entre 21 y 100 %.');
  if (controls.includes('flowPattern')) s.flowPattern = f.flowPattern === 'decel' ? 'decel' : 'square';
  if (controls.includes('trigger')) {
    s.triggerType = f.triggerType as VentSettings['triggerType'];
    const t = num(f.trig);
    if (t !== undefined) {
      if (s.triggerType === 'flow') s.flowTrigger = t;
      else if (s.triggerType === 'pressure') s.pressureTrigger = Math.abs(t);
    }
  }
  const ph = num(f.ph);
  if (ph !== undefined && (ph < 6.7 || ph > 7.8)) errors.push('pH entre 6.7 y 7.8.');
  if (errors.length) return { inp: null, errors };
  return {
    errors,
    inp: {
      sex: f.sex === 'F' ? 'F' : 'M',
      age: num(f.age) ?? 50,
      heightCm: height!,
      weightKg: weight!,
      phenotype: f.phenotype,
      tempC: num(f.tempC),
      settings: s,
      measured: { ppeak: num(f.ppeak), pplat: num(f.pplat), peepTotal: num(f.peepTotal), vte: num(f.vte), rrTotal: num(f.rrTotal), rInsp: num(f.rInsp), p01: num(f.p01), pocc: num(f.pocc), pesEI: num(f.pesEI), pesEE: num(f.pesEE) },
      clinical: { map: num(f.map), hr: num(f.hr), hb: num(f.hb), icp: num(f.icp) },
      abg: { ph, paco2: num(f.paco2), pao2: num(f.pao2), hco3: num(f.hco3) },
      asynchrony: f.asyncType && f.asyncType !== 'none' ? { type: f.asyncType, severity: (f.asyncSeverity || 'frecuente') as AsyncSeverity } : undefined,
    },
  };
}

function Field({ id, label, unit, value, onChange, step = 1, hint }: { id: string; label: string; unit?: string; value: string; onChange: (v: string) => void; step?: number; hint?: string }) {
  return (
    <label className="rp-field" htmlFor={`rp-${id}`}>
      <span className="rp-lab">{label}{unit ? <span className="muted"> {unit}</span> : null}</span>
      <input id={`rp-${id}`} type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="rp-hint">{hint}</span>}
    </label>
  );
}

interface Props {
  onApply: (r: CalibrationResult) => void;
}

export function RealPatientPanel({ onApply }: Props) {
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [json, setJson] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) setF({ ...EMPTY, ...(JSON.parse(d) as Form) });
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  const set = (k: string) => (v: string) => {
    setF((prev) => {
      const next = { ...prev, [k]: v };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento */
      }
      return next;
    });
  };

  const controls = MODE_BY_ID[f.mode as ModeId].controls;
  const h = num(f.heightCm);
  const pbw = h ? predictedBodyWeight(f.sex === 'F' ? 'F' : 'M', h) : null;

  const submit = () => {
    const { inp, errors: e } = toInput(f);
    setErrors(e);
    if (!inp) return;
    setBusy(true);
    setResult(null);
    window.setTimeout(() => {
      try {
        const r = calibrate(inp);
        setResult(r);
        onApply(r);
      } catch (err) {
        setErrors([`No se pudo calibrar: ${(err as Error).message}`]);
      }
      setBusy(false);
    }, 30);
  };

  return (
    <>
      <div className="sec">
        <h3>Paciente real</h3>
        <p className="small">
          Introduzca la configuración actual del ventilador, la mecánica medida y los gases arteriales. El simulador ajusta su modelo para reproducir esos datos, grafica las curvas y le permite probar cambios sobre ese paciente virtual.
        </p>
        <div className="note warn small">
          No escriba nombre, documento ni otros identificadores. Los datos se quedan en este navegador. El resultado es un ejercicio educativo, no una recomendación para el paciente real.
        </div>
        <div className="row">
          <button onClick={() => { setF(EXAMPLE); setResult(null); setErrors([]); }}>Cargar ejemplo ficticio</button>
          <button onClick={() => { setF(EMPTY); setResult(null); setErrors([]); try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ } }}>Vaciar</button>
        </div>
      </div>

      <fieldset className="rp-sec">
        <legend>1 · Paciente</legend>
        <div className="rp-grid">
          <label className="rp-field" htmlFor="rp-sex">
            <span className="rp-lab">Sexo</span>
            <select id="rp-sex" value={f.sex} onChange={(e) => set('sex')(e.target.value)}>
              <option value="M">Varón</option>
              <option value="F">Mujer</option>
            </select>
          </label>
          <Field id="age" label="Edad" unit="años" value={f.age} onChange={set('age')} />
          <Field id="heightCm" label="Talla" unit="cm" value={f.heightCm} onChange={set('heightCm')} hint={pbw ? `PBW ${pbw.toFixed(1)} kg` : undefined} />
          <Field id="weightKg" label="Peso real" unit="kg" value={f.weightKg} onChange={set('weightKg')} />
          <Field id="tempC" label="Temperatura" unit="°C" value={f.tempC} onChange={set('tempC')} step={0.1} />
          <label className="rp-field rp-wide" htmlFor="rp-pheno">
            <span className="rp-lab">Diagnóstico / fenotipo base</span>
            <select id="rp-pheno" value={f.phenotype} onChange={(e) => set('phenotype')(e.target.value)}>
              {PHENOTYPE_LIST.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <span className="rp-hint">Aporta la forma no lineal (reclutabilidad, limitación espiratoria); los valores se calibran con sus datos.</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="rp-sec">
        <legend>2 · Ventilador (programación actual)</legend>
        <div className="rp-grid">
          <label className="rp-field rp-wide" htmlFor="rp-mode">
            <span className="rp-lab">Modo</span>
            <select id="rp-mode" value={f.mode} onChange={(e) => set('mode')(e.target.value)}>
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.short} · {m.name}</option>)}
            </select>
          </label>
          {Object.entries(SETTING_FIELDS)
            .filter(([k]) => controls.includes(k))
            .map(([k, d]) => <Field key={k} id={k} label={d.label} unit={d.unit} step={d.step} value={f[k]} onChange={set(k)} />)}
          {controls.includes('flowPattern') && (
            <label className="rp-field" htmlFor="rp-pattern">
              <span className="rp-lab">Patrón de flujo</span>
              <select id="rp-pattern" value={f.flowPattern} onChange={(e) => set('flowPattern')(e.target.value)}>
                <option value="square">Constante</option>
                <option value="decel">Desacelerado</option>
              </select>
            </label>
          )}
          {controls.includes('trigger') && (
            <>
              <label className="rp-field" htmlFor="rp-trigtype">
                <span className="rp-lab">Disparo</span>
                <select id="rp-trigtype" value={f.triggerType} onChange={(e) => set('triggerType')(e.target.value)}>
                  <option value="flow">Flujo</option>
                  <option value="pressure">Presión</option>
                  <option value="off">Desactivado</option>
                </select>
              </label>
              {f.triggerType !== 'off' && <Field id="trig" label="Sensibilidad" unit={f.triggerType === 'flow' ? 'L/min' : 'cmH₂O'} step={0.5} value={f.trig} onChange={set('trig')} />}
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="rp-sec">
        <legend>3 · Mecánica medida en el ventilador</legend>
        <div className="rp-grid">
          <Field id="ppeak" label="Ppico" unit="cmH₂O" step={0.5} value={f.ppeak} onChange={set('ppeak')} />
          <Field id="pplat" label="Pplat" unit="cmH₂O" step={0.5} value={f.pplat} onChange={set('pplat')} hint="pausa insp., paciente pasivo" />
          <Field id="peepTotal" label="PEEP total" unit="cmH₂O" step={0.5} value={f.peepTotal} onChange={set('peepTotal')} hint="pausa espiratoria" />
          <Field id="vte" label="Vte medido" unit="mL" step={10} value={f.vte} onChange={set('vte')} />
          <Field id="rrTotal" label="FR total" unit="/min" value={f.rrTotal} onChange={set('rrTotal')} hint="si dispara el paciente" />
          <Field id="rInsp" label="R insp (si la da el equipo)" unit="cmH₂O/L/s" step={0.5} value={f.rInsp} onChange={set('rInsp')} />
          <Field id="p01" label="P0.1" unit="cmH₂O" step={0.1} value={f.p01} onChange={set('p01')} />
          <Field id="pocc" label="ΔPocc" unit="cmH₂O" step={0.5} value={f.pocc} onChange={set('pocc')} />
          <Field id="pesEI" label="Pes tele-insp." unit="cmH₂O" step={0.5} value={f.pesEI} onChange={set('pesEI')} hint="opcional" />
          <Field id="pesEE" label="Pes tele-esp." unit="cmH₂O" step={0.5} value={f.pesEE} onChange={set('pesEE')} hint="opcional" />
        </div>
      </fieldset>

      <fieldset className="rp-sec">
        <legend>4 · Clínica y gases arteriales</legend>
        <div className="rp-grid">
          <Field id="ph" label="pH" step={0.01} value={f.ph} onChange={set('ph')} />
          <Field id="paco2" label="PaCO₂" unit="mmHg" value={f.paco2} onChange={set('paco2')} />
          <Field id="pao2" label="PaO₂" unit="mmHg" value={f.pao2} onChange={set('pao2')} />
          <Field id="hco3" label="HCO₃⁻" unit="mEq/L" step={0.1} value={f.hco3} onChange={set('hco3')} />
          <Field id="map" label="PAM" unit="mmHg" value={f.map} onChange={set('map')} />
          <Field id="hr" label="FC" unit="lpm" value={f.hr} onChange={set('hr')} />
          <Field id="hb" label="Hemoglobina" unit="g/dL" step={0.1} value={f.hb} onChange={set('hb')} />
          <Field id="icp" label="PIC (si hay)" unit="mmHg" value={f.icp} onChange={set('icp')} />
        </div>
        {num(f.pao2) && num(f.fio2) ? <p className="small muted">PaO₂/FiO₂ = {(num(f.pao2)! / (num(f.fio2)! / 100)).toFixed(0)}</p> : null}
      </fieldset>

      <fieldset className="rp-sec">
        <legend>5 · Asincronía observada (opcional)</legend>
        <div className="rp-grid">
          <label className="rp-field rp-wide" htmlFor="rp-async">
            <span className="rp-lab">Tipo</span>
            <select id="rp-async" value={f.asyncType || 'none'} onChange={(e) => set('asyncType')(e.target.value)}>
              <option value="none">Ninguna</option>
              {ASYNCHRONIES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          {f.asyncType && f.asyncType !== 'none' && (
            <label className="rp-field rp-wide" htmlFor="rp-async-sev">
              <span className="rp-lab">Frecuencia observada</span>
              <select id="rp-async-sev" value={f.asyncSeverity || 'frecuente'} onChange={(e) => set('asyncSeverity')(e.target.value)}>
                <option value="ocasional">Ocasional (≈ 10–20 % de los ciclos)</option>
                <option value="frecuente">Frecuente (≈ 30–50 %)</option>
                <option value="constante">Casi todos los ciclos (≥ 70 %)</option>
              </select>
            </label>
          )}
        </div>
        {(() => {
          const a = ASYNCHRONIES.find((x) => x.id === f.asyncType);
          if (!a) return <p className="rp-hint">Si en el paciente real observa una asincronía, elíjala: el programa la reproduce modificando sólo el comportamiento del paciente (esfuerzo, fuga o mecánica), porque la programación del ventilador es la real.</p>;
          return (
            <div className="small" style={{ marginTop: 6 }}>
              <div className="muted">Signos para confirmarla en las curvas:</div>
              <ul className="tight">{a.signs.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          );
        })()}
      </fieldset>

      {errors.length > 0 && <div className="note warn small">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      <button className="primary" onClick={submit} disabled={busy}>{busy ? 'Calibrando el modelo…' : 'Calcular y graficar'}</button>

      {result && (
        <div className="sec">
          <h3>Resultado de la calibración</h3>
          <div className="tablewrap">
            <table className="t">
              <thead>
                <tr><th>Variable</th><th>Medido</th><th>Modelo</th></tr>
              </thead>
              <tbody>
                {result.rows.map((r) => {
                  const off = r.measured !== null && Math.abs(r.model - r.measured) > Math.max(r.digits === 2 ? 0.03 : 2, Math.abs(r.measured) * 0.12);
                  return (
                    <tr key={r.label}>
                      <td>{r.label} <span className="muted small">{r.unit}</span></td>
                      <td className="num">{r.measured === null ? '—' : r.measured.toFixed(r.digits)}</td>
                      <td className={'num' + (off ? ' st-fuera' : r.measured !== null ? ' st-óptimo' : '')}>{r.model.toFixed(r.digits)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h4>Parámetros derivados</h4>
          <dl className="kv small num">
            {result.derived.map((d) => (
              <span key={d.label} style={{ display: 'contents' }}>
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </span>
            ))}
          </dl>
          <h4>Supuestos y advertencias</h4>
          <ul className="tight small">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <div className="note small">
            El paciente calibrado ya está cargado: ajuste el ventilador en la barra inferior y observe la respuesta. Use «Guardar» para conservar la configuración.
            {f.asyncType && f.asyncType !== 'none' ? ' Active «Esfuerzos» y «Pmus/Pes» en la barra de curvas para ver el origen de la asincronía; el módulo Asincronías muestra el detector y las correcciones posibles.' : ''}
          </div>
        </div>
      )}

      <div className="sec">
        <h4>Guardar o compartir los datos introducidos</h4>
        <div className="row">
          <button onClick={() => setJson(JSON.stringify(f, null, 2))}>Ver JSON</button>
          <button
            disabled={!json}
            onClick={() => {
              try {
                setF({ ...EMPTY, ...(JSON.parse(json) as Form) });
                setMsg('Datos cargados desde el JSON.');
              } catch {
                setMsg('El texto no es un JSON válido.');
              }
            }}
          >
            Cargar JSON
          </button>
          <button disabled={!json} onClick={() => navigator.clipboard?.writeText(json).then(() => setMsg('Copiado.'), () => setMsg('Seleccione el texto y cópielo.'))}>Copiar</button>
        </div>
        <textarea aria-label="JSON de los datos del paciente" value={json} onChange={(e) => setJson(e.target.value)} placeholder="Pegue aquí un JSON guardado para cargarlo" style={{ minHeight: 90, fontFamily: 'var(--f-num)', fontSize: 12 }} />
        {msg && <p className="small">{msg}</p>}
      </div>
    </>
  );
}
