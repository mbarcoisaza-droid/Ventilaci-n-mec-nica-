import { useEffect, useState } from 'react';
import type { PatientParams, VentSettings } from '../../engine/types';

interface Saved {
  name: string;
  settings: VentSettings;
  patient: PatientParams;
  savedAt: string;
}

const KEY = 'vmsim-configs-v1';
function load(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Saved[];
  } catch {
    return [];
  }
}
function store(list: Saved[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* almacenamiento no disponible */
  }
}

interface Props {
  settings: VentSettings;
  patient: PatientParams;
  apply: (p: PatientParams, s: VentSettings) => void;
  csv: () => string;
}

export function ConfigPanel({ settings, patient, apply, csv }: Props) {
  const [list, setList] = useState<Saved[]>([]);
  const [name, setName] = useState('');
  const [slots, setSlots] = useState<{ A: Saved | null; B: Saved | null }>({ A: null, B: null });
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => setList(load()), []);

  const snap = (n: string): Saved => ({ name: n, settings: { ...settings, alarms: { ...settings.alarms } }, patient: { ...patient, effort: { ...patient.effort } }, savedAt: new Date().toLocaleString() });
  const copy = (t: string, ok: string) =>
    navigator.clipboard?.writeText(t).then(
      () => setMsg(ok),
      () => setMsg('El portapapeles no está disponible: seleccione el texto y cópielo.'),
    ) ?? setMsg('El portapapeles no está disponible: seleccione el texto y cópielo.');

  return (
    <>
      <div className="sec">
        <h3>Comparar dos configuraciones</h3>
        <p className="small muted">Guarde la configuración actual en A o B y alterne entre ellas sobre el mismo paciente. Use «Congelar curvas» para superponer la referencia.</p>
        {(['A', 'B'] as const).map((k) => (
          <div className="row" key={k}>
            <b>{k}</b>
            <button onClick={() => setSlots({ ...slots, [k]: snap(k) })}>Guardar actual en {k}</button>
            <button disabled={!slots[k]} onClick={() => slots[k] && apply(patient, slots[k]!.settings)}>Aplicar {k}</button>
            <span className="small muted num">{slots[k] ? `${slots[k]!.settings.mode} · Vt ${slots[k]!.settings.vt} · FR ${slots[k]!.settings.rr} · PEEP ${slots[k]!.settings.peep}` : 'vacío'}</span>
          </div>
        ))}
      </div>
      <div className="sec">
        <h3>Configuraciones guardadas</h3>
        <div className="row">
          <input aria-label="Nombre de la configuración" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <button
            onClick={() => {
              const l = [snap(name.trim() || `Configuración ${list.length + 1}`), ...list].slice(0, 30);
              setList(l);
              store(l);
              setName('');
              setMsg('Configuración guardada en este navegador.');
            }}
          >
            Guardar
          </button>
        </div>
        <div className="list">
          {list.map((x, i) => (
            <div className="item" key={x.savedAt + i}>
              <span className="ttl">{x.name}</span>
              <span className="small muted">{x.patient.label} · {x.settings.mode} · {x.savedAt}</span>
              <div className="row">
                <button onClick={() => apply(x.patient, x.settings)}>Cargar</button>
                <button onClick={() => setText(JSON.stringify(x, null, 2))}>Ver JSON</button>
                <button onClick={() => { const l = list.filter((_, j) => j !== i); setList(l); store(l); }}>Eliminar</button>
              </div>
            </div>
          ))}
          {!list.length && <p className="small muted">Aún no hay configuraciones guardadas en este navegador.</p>}
        </div>
      </div>
      <div className="sec">
        <h3>Exportar e importar</h3>
        <div className="row">
          <button onClick={() => setText(JSON.stringify(snap('exportada'), null, 2))}>Configuración actual a JSON</button>
          <button onClick={() => setText(csv())}>Curvas (30 s) a CSV</button>
        </div>
        <textarea aria-label="Texto para exportar o importar" value={text} onChange={(e) => setText(e.target.value)} placeholder="Pegue aquí un JSON de configuración para importarlo" style={{ minHeight: 140, fontFamily: 'var(--f-num)', fontSize: 12 }} />
        <div className="row">
          <button disabled={!text} onClick={() => copy(text, 'Copiado al portapapeles.')}>Copiar</button>
          <button
            disabled={!text}
            onClick={() => {
              try {
                const o = JSON.parse(text) as Saved;
                if (!o.settings || !o.patient) throw new Error('faltan «settings» o «patient»');
                apply({ ...patient, ...o.patient, effort: { ...patient.effort, ...o.patient.effort } }, { ...settings, ...o.settings, alarms: { ...settings.alarms, ...o.settings.alarms } });
                setMsg('Configuración importada.');
              } catch (e) {
                setMsg(`No se pudo importar: ${(e as Error).message}.`);
              }
            }}
          >
            Importar JSON
          </button>
        </div>
        {msg && <p className="small">{msg}</p>}
      </div>
    </>
  );
}
