import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller } from './ui/controller';
import { Waveforms, captureTrace, type FrozenTrace, type ScaleSet } from './ui/Waveforms';
import { Loops, breathLoops, type FrozenLoop } from './ui/Loops';
import { Values } from './ui/Numeric';
import { TherapyBar } from './ui/TherapyBar';
import { MODE_BY_ID } from './education/modes';
import { ManeuversPanel } from './ui/panels/Maneuvers';
import { PatientPanel } from './ui/panels/Patient';
import { AsyncPanel } from './ui/panels/Async';
import { CasesPanel } from './ui/panels/Cases';
import { TheoryPanel } from './ui/panels/Theory';
import { ConfigPanel } from './ui/panels/Config';
import { ReportView } from './ui/panels/Report';
import { RealPatientPanel } from './ui/panels/RealPatient';
import type { CalibrationResult } from './engine/calibrate';
import { DEFAULT_SETTINGS, PHENOTYPES } from './engine/presets';
import type { PatientParams, VentSettings } from './engine/types';
import type { ClinicalCase } from './cases/types';
import { buildCase } from './cases/load';
import { buildReport, snapshot, type Report, type Snapshot } from './cases/evaluate';
import { interpret } from './education/interpret';
import { canInstall, onInstallChange, promptInstall } from './pwa';

type Tab = 'real' | 'casos' | 'asincronias' | 'maniobras' | 'paciente' | 'lectura' | 'teoria' | 'config';
// iconos de trazo simple (24×24)
const TABS: [Tab, string, string][] = [
  ['real', 'Paciente real', 'M9 3h6M12 3v5M7 8h10l-1 13H8zM10 13h4M12 11v4'],
  ['casos', 'Casos', 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4'],
  ['asincronias', 'Asincronías', 'M2 14h4l2-7 3 12 2-8 2 3h7'],
  ['maniobras', 'Maniobras', 'M3 17l5-9 3 6h4M19 6v12M15 6v12'],
  ['paciente', 'Paciente', 'M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 21c0-4 3-7 7-7s7 3 7 7'],
  ['lectura', 'Lectura', 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5'],
  ['teoria', 'Modos', 'M4 6h16M4 12h16M4 18h10'],
  ['config', 'Guardar', 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6'],
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
  const [tab, setTab] = useState<Tab | null>('casos');
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
  const [confirmReset, setConfirmReset] = useState(false);
  const [panelKey, setPanelKey] = useState(0); // reinicia el estado interno de los módulos

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

  const loadRealPatient = (r: CalibrationResult) => {
    ctl.replace(r.settings, r.patient, { initPaco2: r.initPaco2 }, 15);
    setSettingsState(r.settings);
    setPatientState(r.patient);
    setActiveCase(null);
    setReport(null);
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

  /** Vuelve a la configuración inicial de la aplicación para empezar otro caso. */
  const newSession = () => {
    ctl.replace(INIT_SETTINGS, INIT_PATIENT, {}, 12);
    setSettingsState(INIT_SETTINGS);
    setPatientState(INIT_PATIENT);
    setActiveCase(null);
    setReport(null);
    setInitialSnap(null);
    setAnswers({});
    setJustification('');
    setFrozen(null);
    setFrozenLoop(null);
    setModelView(false);
    setScales({ paw: 0, flow: 0, vol: 0 });
    setWin(12);
    ctl.speed = 1;
    setSpeed(1);
    ctl.running = true;
    setRunning(true);
    setPanelKey((k) => k + 1);
    setConfirmReset(false);
    setTab('casos');
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

  const holdBusy = sim.pendingManeuver !== null || sim.phase === 'holdI' || sim.phase === 'holdE' || sim.phase === 'occl';
  const topAlarm = [...sim.alarms].sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
  const modeShort = MODE_BY_ID[settings.mode].short;
  const toggleDrawer = (t: Tab) => setTab((cur) => (cur === t ? null : t));
  const tabTitle = TABS.find(([k]) => k === tab)?.[1] ?? '';

  return (
    <div className="device">
      <header className="statusbar">
        <div className="sb-left">
          <span className="sb-brand">Ventilab</span>
          <span className="sb-mode">{modeShort}</span>
          {(() => {
            const last = [...sim.markers].reverse().find((x) => x.type === 'inspStart');
            const recent = last && last.trigger === 'patient' && sim.t - last.t < 1;
            return (
              <span className={'sb-trig' + (recent ? '' : ' off')} title="Se ilumina cuando el paciente dispara el ciclo (ciclo asistido)">
                Disparo paciente
              </span>
            );
          })()}
          <span className="sb-pt">
            Adulto · PBW <b className="num">{sim.pbw.toFixed(0)}</b> kg · {activeCase ? activeCase.title : level === 3 ? 'paciente sin identificar' : sim.patient.label}
          </span>
        </div>
        <div className={'sb-alarm' + (topAlarm[0] ? ' ' + topAlarm[0].level : '')} aria-live="polite">
          {topAlarm.length === 0 ? (
            <span className="sb-ok">Sin alarmas activas</span>
          ) : (
            <>
              <span className="sb-alarm-text">{topAlarm[0].text}</span>
              {topAlarm.length > 1 && <span className="sb-alarm-more">+{topAlarm.length - 1}</span>}
              <button className="sb-reset" onClick={() => sim.clearAlarms()} title="Restablecer alarmas">Restablecer</button>
            </>
          )}
        </div>
        <div className="sb-right">
          <div className="seg" role="group" aria-label="Nivel docente">
            {([1, 2, 3] as const).map((l) => (
              <button key={l} className={level === l ? 'active' : ''} onClick={() => setLevel(l)} title={l === 1 ? 'Aprendizaje guiado' : l === 2 ? 'Simulación clínica' : 'Desafío experto'}>
                {l === 1 ? 'Guiado' : l === 2 ? 'Clínico' : 'Experto'}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Simulación">
            <button className="active" onClick={() => { ctl.running = !running; setRunning(!running); }} title={running ? 'Pausar' : 'Iniciar'} aria-label={running ? 'Pausar' : 'Iniciar'}>
              {running ? '❚❚' : '▶'}
            </button>
            <button onClick={() => { ctl.running = false; setRunning(false); sim.advanceBreath(); ctl.redraw(); setTick((t) => t + 1); }} title="Avanzar un ciclo">▶❘ 1 ciclo</button>
            <button onClick={reset} title={activeCase ? 'Reiniciar el caso actual' : 'Reiniciar la simulación con la configuración actual'} aria-label="Reiniciar">↺</button>
            <select aria-label="Velocidad" value={speed} onChange={(e) => { const v = parseFloat(e.target.value); ctl.speed = v; setSpeed(v); }}>
              {[0.25, 0.5, 1, 2, 4].map((v) => <option key={v} value={v}>{v}×</option>)}
            </select>
          </div>
          <div className="sb-newwrap">
            <button className="sb-new" onClick={() => setConfirmReset((v) => !v)} title="Restablecer la configuración inicial para empezar otro caso" aria-expanded={confirmReset}>
              ⟲ Nuevo caso
            </button>
            {confirmReset && (
              <div className="sb-confirm" role="dialog" aria-label="Confirmar nuevo caso">
                <p>¿Volver a la configuración inicial? Se cerrará {activeCase ? `«${activeCase.title}»` : 'la simulación actual'} y se perderán los ajustes, maniobras y respuestas no guardados.</p>
                <div className="row">
                  <button className="primary" onClick={newSession}>Restablecer</button>
                  <button onClick={() => setConfirmReset(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
          {installable && (
            <button className="sb-install" onClick={() => promptInstall()} title="Instalar Ventilab como aplicación en este equipo">⤓ Instalar</button>
          )}
          <span className="sb-clock num" title="Tiempo simulado">{Math.floor(sim.t / 60)}:{String(Math.floor(sim.t % 60)).padStart(2, '0')}</span>
        </div>
      </header>

      <nav className="toolbar" aria-label="Módulos">
        {TABS.map(([k, l, icon]) => (
          <button key={k} className={'tool' + (tab === k ? ' active' : '')} onClick={() => toggleDrawer(k)} aria-pressed={tab === k}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
            <span>{l}</span>
          </button>
        ))}
      </nav>

      <main className="center">
        <section className="pane wavepane">
          <div className="panebar">
            <select aria-label="Ventana de tiempo" value={win} onChange={(e) => setWin(parseFloat(e.target.value))}>
              {[6, 12, 20, 30, 60].map((v) => <option key={v} value={v}>{v} s</option>)}
            </select>
            <select aria-label="Escala de presión" value={scales.paw} onChange={(e) => setScales({ ...scales, paw: +e.target.value })}>
              {[0, 20, 30, 40, 60, 80].map((v) => <option key={v} value={v}>{v ? `Paw ${v}` : 'Paw auto'}</option>)}
            </select>
            <select aria-label="Escala de flujo" value={scales.flow} onChange={(e) => setScales({ ...scales, flow: +e.target.value })}>
              {[0, 30, 60, 90, 120, 180].map((v) => <option key={v} value={v}>{v ? `Flujo ±${v}` : 'Flujo auto'}</option>)}
            </select>
            <select aria-label="Escala de volumen" value={scales.vol} onChange={(e) => setScales({ ...scales, vol: +e.target.value })}>
              {[0, 300, 600, 900, 1200, 2000].map((v) => <option key={v} value={v}>{v ? `Vol ${v}` : 'Vol auto'}</option>)}
            </select>
            <button onClick={freeze}>Congelar</button>
            {frozen && <button onClick={() => { setFrozen(null); setFrozenLoop(null); }}>Quitar ref.</button>}
            {level < 3 && (
              <>
                <label className="chk"><input type="checkbox" checked={modelView} onChange={(e) => setModelView(e.target.checked)} /> Pmus/Pes</label>
                <label className="chk"><input type="checkbox" checked={showEfforts} onChange={(e) => setShowEfforts(e.target.checked)} /> Esfuerzos</label>
              </>
            )}
            <span className="assist-key">tramo morado en la curva: disparo del paciente ({settings.mode === 'VCV' || settings.mode === 'SIMV_VC' ? 'presión' : 'flujo'})</span>
            <span className="panehint">clic: cursores A/B</span>
          </div>
          <Waveforms ctl={ctl} win={win} scales={scales} showModel={showModel} showEfforts={showEff} frozen={frozen} />
        </section>
        {notes.length > 0 && (
          <button className="insight" onClick={() => setTab('lectura')} title="Ver toda la lectura fisiológica">
            <span className="insight-tag">Lectura</span>
            <span className="insight-text">{notes[0]}</span>
            {notes.length > 1 && <span className="insight-more">+{notes.length - 1}</span>}
          </button>
        )}
        <section className="pane looppane">
          <div className="panebar">
            <span className="panetitle">Bucles</span>
            <select aria-label="Bucles previos" value={history} onChange={(e) => setHistory(+e.target.value)}>
              {[0, 1, 3, 6].map((v) => <option key={v} value={v}>{v} previos</option>)}
            </select>
            <span className="panehint">{frozenLoop ? 'discontinua: referencia' : ''}{showModel ? ' · naranja: PL–V (modelo)' : ''}</span>
          </div>
          <Loops ctl={ctl} history={history} showModel={showModel} frozen={frozenLoop} />
        </section>
      </main>

      <aside className="valuespane">
        <Values m={m} g={g} fio2={settings.fio2} showModel={level < 3} showIcp={sim.patient.icpBase > 0} />
      </aside>

      <footer className="therapybar">
        <TherapyBar
          s={settings}
          pbw={sim.pbw}
          onChange={setSettings}
          adaptiveP={sim.adaptiveP}
          holdBusy={holdBusy}
          onHold={(k) => { sim.requestManeuver(k); ctl.running = true; setRunning(true); setTab('maniobras'); }}
        />
      </footer>

      {tab && (
        <div className="drawer" role="dialog" aria-label={tabTitle}>
          <div className="drawer-head">
            <h2>{tabTitle}</h2>
            <button onClick={() => setTab(null)} aria-label="Cerrar panel">✕</button>
          </div>
          <div className="drawer-body" key={panelKey}>
            {tab === 'real' && <RealPatientPanel onApply={loadRealPatient} />}
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
            {tab === 'lectura' && (
              <div className="sec">
                {level === 3 ? (
                  <p className="small">En el desafío experto la lectura fisiológica está desactivada.</p>
                ) : (
                  <>
                    <label className="chk"><input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} /> Mostrar explicaciones fisiológicas en pantalla</label>
                    <ul className="tight">{interpret(m, settings, g, sim.pbw).map((n) => <li key={n}>{n}</li>)}</ul>
                  </>
                )}
              </div>
            )}
            {tab === 'teoria' && <TheoryPanel mode={settings.mode} />}
            {tab === 'config' && <ConfigPanel settings={settings} patient={patient} apply={apply} csv={() => sim.toCSV(30)} />}
            <p className="disclaimer">Herramienta educativa basada en un modelo matemático simplificado, sin validación clínica formal. No usar para decidir el tratamiento de pacientes reales.</p>
          </div>
        </div>
      )}
      {report && activeCase && <ReportView r={report} c={activeCase} onClose={() => setReport(null)} />}
    </div>
  );
}
