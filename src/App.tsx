import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller } from './ui/controller';
import { Waveforms, captureTrace, type FrozenTrace, type ScaleSet } from './ui/Waveforms';
import { Loops, breathLoops, type FrozenLoop } from './ui/Loops';
import { Numeric, GasTiles } from './ui/Numeric';
import { Controls } from './ui/Controls';
import { ManeuversPanel } from './ui/panels/Maneuvers';
import { PatientPanel } from './ui/panels/Patient';
import { AsyncPanel } from './ui/panels/Async';
import { CasesPanel } from './ui/panels/Cases';
import { TheoryPanel } from './ui/panels/Theory';
import { ConfigPanel } from './ui/panels/Config';
import { ReportView } from './ui/panels/Report';
import { DEFAULT_SETTINGS, PHENOTYPES } from './engine/presets';
import type { PatientParams, VentSettings } from './engine/types';
import type { ClinicalCase } from './cases/types';
import { buildCase } from './cases/load';
import { buildReport, snapshot, type Report, type Snapshot } from './cases/evaluate';
import { interpret } from './education/interpret';
import { canInstall, onInstallChange, promptInstall } from './pwa';

type Tab = 'casos' | 'asincronias' | 'maniobras' | 'paciente' | 'teoria' | 'config';
const TABS: [Tab, string][] = [
  ['casos', 'Casos'],
  ['asincronias', 'Asincronías'],
  ['maniobras', 'Maniobras'],
  ['paciente', 'Paciente'],
  ['teoria', 'Modos y modelo'],
  ['config', 'Guardar / comparar'],
];

const INIT_PATIENT = PHENOTYPES.ardsModerate;
const INIT_SETTINGS: VentSettings = { ...DEFAULT_SETTINGS, vt: 420, rr: 20, peep: 10, fio2: 0.5, peakFlow: 55, pause: 0.3 };

export default function App() {
  const ctlRef = useRef<Controller | null>(null);
  if (!ctlRef.current) {
    ctlRef.current = new Controller(INIT_SETTINGS, INIT_PATIENT);
    ctlRef.current.sim.advance(12);
  }
  const ctl = ctlRef.current;
  const [, setTick] = useState(0);
  const [settings, setSettingsState] = useState<VentSettings>(INIT_SETTINGS);
  const [patient, setPatientState] = useState<PatientParams>(INIT_PATIENT);
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [tab, setTab] = useState<Tab>('casos');
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [win, setWin] = useState(12);
  const [scales, setScales] = useState<ScaleSet>({ paw: 0, flow: 0, vol: 0 });
  const [modelView, setModelView] = useState(false);
  const [showEfforts, setShowEfforts] = useState(true);
  const [explain, setExplain] = useState(true);
  const [frozen, setFrozen] = useState<FrozenTrace | null>(null);
  const [frozenLoop, setFrozenLoop] = useState<FrozenLoop | null>(null);
  const [history, setHistory] = useState(3);
  const [activeCase, setActiveCase] = useState<ClinicalCase | null>(null);
  const [caseStart, setCaseStart] = useState(0);
  const [initialSnap, setInitialSnap] = useState<Snapshot | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [justification, setJustification] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [customCases, setCustomCases] = useState<ClinicalCase[]>([]);

  const [installable, setInstallable] = useState(canInstall());
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);

  const showModel = level < 3 && modelView;
  const showEff = level < 3 && showEfforts;

  useEffect(() => {
    ctl.start();
    const id = window.setInterval(() => setTick((t) => t + 1), 300);
    return () => {
      ctl.stop();
      window.clearInterval(id);
    };
  }, [ctl]);

  const setSettings = useCallback(
    (s: VentSettings) => {
      ctl.sim.setSettings(s);
      setSettingsState(s);
    },
    [ctl],
  );
  const setPatient = useCallback(
    (p: PatientParams) => {
      ctl.sim.setPatient(p);
      setPatientState(p);
    },
    [ctl],
  );

  const apply = useCallback(
    (p: PatientParams, s: VentSettings, warm?: number) => {
      if (warm) ctl.replace(s, p, {}, warm);
      else {
        ctl.sim.setPatient(p);
        ctl.sim.setSettings(s);
      }
      setPatientState(p);
      setSettingsState(s);
      setFrozen(null);
      setFrozenLoop(null);
    },
    [ctl],
  );

  const loadCase = (c: ClinicalCase) => {
    const b = buildCase(c);
    ctl.replace(b.settings, b.patient, { initPaco2: b.initPaco2 }, 20);
    setSettingsState(b.settings);
    setPatientState(b.patient);
    setActiveCase(c);
    setCaseStart(ctl.sim.t);
    setInitialSnap(snapshot(ctl.sim));
    setAnswers({});
    setJustification('');
    setFrozen(null);
    setFrozenLoop(null);
    ctl.running = true;
    setRunning(true);
  };

  const finishCase = () => {
    if (!activeCase || !initialSnap) return;
    const fin = snapshot(ctl.sim);
    setReport(buildReport(activeCase, initialSnap, fin, ctl.sim.flags, caseStart, answers, justification, ctl.sim.pbw));
  };

  const reset = () => {
    if (activeCase) loadCase(activeCase);
    else {
      ctl.replace(settings, patient, {}, 4);
    }
  };

  const freeze = () => {
    setFrozen(captureTrace(ctl, win, `t = ${ctl.sim.t.toFixed(0)} s`));
    const loops = breathLoops(ctl, 2);
    if (loops.length >= 2) setFrozenLoop({ label: 'ref', data: loops[loops.length - 2] });
  };

  const sim = ctl.sim;
  const m = sim.monitor();
  const g = sim.gasEx.gas;
  const snap = activeCase ? snapshot(sim) : null;
  const events: Record<string, number> = {};
  for (const e of sim.asyncEvents) if (e.t > sim.t - 60) events[e.type] = (events[e.type] ?? 0) + 1;
  const ineff = sim.drive.efforts.filter((e) => e.onset > sim.t - 60 && e.onset < sim.t - e.ti - 0.3 && !e.triggered && !e.reverse).length;
  if (sim.modeAllowsTrigger && ineff) events.ineffective = ineff;
  const notes = useMemo(() => (explain && level < 3 ? interpret(m, settings, g, sim.pbw) : []), [explain, level, m, settings, g, sim.pbw]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Ventilab</h1>
          <span className="tag">Simulador de ventilación mecánica invasiva</span>
        </div>
        {installable && (
          <button className="on" onClick={() => promptInstall()} title="Instalar Ventilab como aplicación en este equipo">
            ⤓ Instalar app
          </button>
        )}
        <div className="group" role="group" aria-label="Nivel">
          <label>Nivel</label>
          {([1, 2, 3] as const).map((l) => (
            <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)} title={l === 1 ? 'Aprendizaje guiado' : l === 2 ? 'Simulación clínica' : 'Desafío experto'}>
              {l === 1 ? '1 · Guiado' : l === 2 ? '2 · Clínico' : '3 · Experto'}
            </button>
          ))}
        </div>
        <div className="group" role="group" aria-label="Simulación">
          <button className="primary" onClick={() => { ctl.running = !running; setRunning(!running); }}>{running ? '❚❚ Pausar' : '▶ Iniciar'}</button>
          <button onClick={() => { ctl.running = false; setRunning(false); sim.advanceBreath(); ctl.redraw(); setTick((t) => t + 1); }}>Avanzar 1 ciclo</button>
          <button onClick={reset}>Reiniciar</button>
          <label htmlFor="speed">Vel.</label>
          <select id="speed" value={speed} onChange={(e) => { const v = parseFloat(e.target.value); ctl.speed = v; setSpeed(v); }}>
            {[0.25, 0.5, 1, 2, 4].map((v) => <option key={v} value={v}>{v}×</option>)}
          </select>
        </div>
      </header>

      <main className="left">
        <div className="alarmbar" aria-live="polite">
          {sim.alarms.length === 0 ? <span className="small muted">Sin alarmas</span> : sim.alarms.map((a) => <span key={a.id} className={'alarm ' + a.level}>{a.text}</span>)}
          {sim.alarms.length > 0 && <button onClick={() => sim.clearAlarms()}>Restablecer alarmas</button>}
          <span className="small muted" style={{ marginLeft: 'auto' }}>
            {activeCase ? activeCase.title : level === 3 ? 'Paciente sin identificar' : sim.patient.label} · {settings.mode} · t {sim.t.toFixed(0)} s
          </span>
        </div>
        <div className="screen">
          <div className="card" style={{ minWidth: 0 }}>
            <div className="wavebar">
              <label className="small muted" htmlFor="win">Ventana</label>
              <select id="win" value={win} onChange={(e) => setWin(parseFloat(e.target.value))}>
                {[6, 12, 20, 30, 60].map((v) => <option key={v} value={v}>{v} s</option>)}
              </select>
              <label className="small muted" htmlFor="sc-paw">Paw</label>
              <select id="sc-paw" value={scales.paw} onChange={(e) => setScales({ ...scales, paw: +e.target.value })}>
                {[0, 20, 30, 40, 60, 80].map((v) => <option key={v} value={v}>{v ? `${v}` : 'auto'}</option>)}
              </select>
              <label className="small muted" htmlFor="sc-flow">Flujo</label>
              <select id="sc-flow" value={scales.flow} onChange={(e) => setScales({ ...scales, flow: +e.target.value })}>
                {[0, 30, 60, 90, 120, 180].map((v) => <option key={v} value={v}>{v ? `±${v}` : 'auto'}</option>)}
              </select>
              <label className="small muted" htmlFor="sc-vol">Vol</label>
              <select id="sc-vol" value={scales.vol} onChange={(e) => setScales({ ...scales, vol: +e.target.value })}>
                {[0, 300, 600, 900, 1200, 2000].map((v) => <option key={v} value={v}>{v ? `${v}` : 'auto'}</option>)}
              </select>
              <button onClick={freeze}>Congelar curvas</button>
              {frozen && <button onClick={() => { setFrozen(null); setFrozenLoop(null); }}>Quitar referencia</button>}
              {level < 3 && (
                <>
                  <label className="small row"><input type="checkbox" checked={modelView} onChange={(e) => setModelView(e.target.checked)} /> Pmus / Ppl (modelo)</label>
                  <label className="small row"><input type="checkbox" checked={showEfforts} onChange={(e) => setShowEfforts(e.target.checked)} /> Esfuerzos</label>
                  <label className="small row"><input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} /> Explicaciones</label>
                </>
              )}
              <span className="small muted">Clic en las curvas: cursores A/B</span>
            </div>
            <Waveforms ctl={ctl} win={win} scales={scales} showModel={showModel} showEfforts={showEff} frozen={frozen} />
            {showModel && (
              <div className="legend" style={{ padding: '0 10px 6px' }}>
                <span style={{ ['--c' as string]: 'var(--paw)' }}>Paw</span>
                <span style={{ ['--c' as string]: 'var(--pmus)' }}>Pmus (modelo)</span>
                <span style={{ ['--c' as string]: 'var(--ptp)' }}>Presión pleural ≈ Pes (modelo)</span>
                <span style={{ ['--c' as string]: 'var(--ref)' }}>Referencia congelada</span>
              </div>
            )}
          </div>
          <Numeric m={m} showModel={level < 3} />
        </div>
        <div className="screen">
          <div className="card" style={{ minWidth: 0 }}>
            <div className="wavebar">
              <span className="small muted">Bucles: ciclo actual (intenso), previos (tenues){frozenLoop ? ', referencia (discontinua)' : ''}{showModel ? ', PL–V (modelo, naranja)' : ''}</span>
              <label className="small muted" htmlFor="hist">Previos</label>
              <select id="hist" value={history} onChange={(e) => setHistory(+e.target.value)}>
                {[0, 1, 3, 6].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <Loops ctl={ctl} history={history} showModel={showModel} frozen={frozenLoop} />
          </div>
          <GasTiles g={g} fio2={settings.fio2} showIcp={sim.patient.icpBase > 0} />
        </div>
        {notes.length > 0 && (
          <div className="card interp" aria-live="polite">
            <span className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lectura fisiológica</span>
            <ul className="tight">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )}
        <Controls s={settings} pbw={sim.pbw} onChange={setSettings} adaptiveP={sim.adaptiveP} />
        <p className="disclaimer">Herramienta educativa basada en un modelo matemático simplificado. No tiene validación clínica formal y no debe usarse para decidir el tratamiento de pacientes reales.</p>
      </main>

      <aside className="card side">
        <nav className="tabs" aria-label="Módulos">
          {TABS.map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="tabbody">
          {tab === 'casos' && (
            <CasesPanel
              active={activeCase}
              level={level}
              snap={snap}
              elapsed={sim.t - caseStart}
              answers={answers}
              setAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
              justification={justification}
              setJustification={setJustification}
              onLoad={loadCase}
              onFinish={finishCase}
              onExit={() => { setActiveCase(null); setReport(null); }}
              customCases={customCases}
              addCustom={(c) => setCustomCases((l) => [...l.filter((x) => x.id !== c.id), c])}
            />
          )}
          {tab === 'asincronias' && <AsyncPanel settings={settings} patient={patient} level={level} apply={apply} events={events} />}
          {tab === 'maniobras' && <ManeuversPanel ctl={ctl} m={m} showModel={level < 3} tick={sim.t} />}
          {tab === 'paciente' && (
            <PatientPanel
              p={patient}
              hidden={level === 3}
              onChange={setPatient}
              onPhenotype={(id) => {
                const ph = PHENOTYPES[id];
                setPatient({ ...ph, effort: { ...ph.effort } });
              }}
            />
          )}
          {tab === 'teoria' && <TheoryPanel mode={settings.mode} />}
          {tab === 'config' && <ConfigPanel settings={settings} patient={patient} apply={apply} csv={() => sim.toCSV(30)} />}
        </div>
      </aside>
      {report && activeCase && <ReportView r={report} c={activeCase} onClose={() => setReport(null)} />}
    </div>
  );
}
