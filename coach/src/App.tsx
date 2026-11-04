import { useCallback, useEffect, useState } from 'react';
import { startWorkout, upsertRoutine } from './actions';
import { Sheet } from './components/ui';
import { dow, nowHM, todayISO } from './dates';
import { AppState, Routine, blankRoutine, ensurePlanSessions } from './model';
import { beep, notifPermission, showNotif } from './notify';
import { findIssues } from './sequence';
import { useAppState } from './store';
import { RoutineEditor } from './views/Editor';
import { Home } from './views/Home';
import { ImportView } from './views/ImportView';
import { Progress } from './views/Progress';
import { PreStart, RoutineDetail, RoutineList } from './views/Routines';
import { Settings } from './views/Settings';
import { Workout } from './views/Workout';
import { ScheduleSheet } from './views/Home';

type Tab = 'inicio' | 'rutinas' | 'progreso' | 'ajustes';
type Overlay =
  | { kind: 'detalle'; routineId: string; sessionId: string | null }
  | { kind: 'editar'; routine: Routine; isNew: boolean; focus?: string }
  | { kind: 'importar' }
  | null;

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio', icon: '🏠' },
  { id: 'rutinas', label: 'Rutinas', icon: '📋' },
  { id: 'progreso', label: 'Progreso', icon: '📈' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️' },
];

function minutesBetween(a: string, b: string) {
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

export default function App() {
  const { state, update, replace, saveError } = useAppState();
  const [tab, setTab] = useState<Tab>('inicio');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [preStart, setPreStart] = useState<{ routineId: string; sessionId: string | null } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  // tema
  useEffect(() => {
    const t = state.settings.theme;
    const el = document.documentElement;
    if (t === 'sistema') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', t === 'oscuro' ? 'dark' : 'light');
    const dark = t === 'oscuro' || (t === 'sistema' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1412' : '#f3f6f4');
  }, [state.settings.theme]);

  // sesiones del plan semanal
  useEffect(() => {
    update((s) => {
      const n = ensurePlanSessions(s);
      return n === s ? s : n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recordatorios dentro de la app (solo con la app abierta)
  useEffect(() => {
    const check = () => {
      const s = state;
      const r = s.reminders;
      const today = todayISO();
      const now = nowHM();
      const todays = s.sessions.filter((x) => x.date === today && x.status !== 'omitida');
      const pending = todays.filter((x) => x.status === 'pendiente');
      const fire = (key: string, text: string, at: string) => {
        if (r.fired.includes(key)) return;
        update((st) => ({ ...st, reminders: { ...st.reminders, fired: [...st.reminders.fired.filter((f) => f.slice(-10) >= today), key] } }));
        setBanner(text);
        // sonido y notificación solo cerca de la hora configurada
        if (minutesBetween(at, now) <= 60) {
          if (s.settings.sound) beep();
          if (notifPermission() === 'granted') showNotif('Mi Coach', text, key);
        }
      };
      if (r.trainEnabled && r.days.includes(dow(today)) && now >= r.time && pending.length) {
        const name = s.routines.find((x) => x.id === pending[0].routineId)?.name ?? 'tu rutina';
        fire(`train:${today}`, `Hora de entrenar: ${name}.`, r.time);
      }
      if (r.logEnabled && now >= r.logTime && pending.length) {
        fire(`log:${today}`, '¿Entrenaste hoy? Registra tu sesión o reprográmala para otro día.', r.logTime);
      }
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [state, update]);

  const requestStart = useCallback(
    (routineId: string, sessionId: string | null) => {
      if (state.active) {
        setWorkoutOpen(true);
        return;
      }
      const r = state.routines.find((x) => x.id === routineId);
      if (!r) return;
      if (findIssues(r).length) setPreStart({ routineId, sessionId });
      else {
        update((s) => startWorkout(s, routineId, sessionId));
        setWorkoutOpen(true);
      }
    },
    [state.active, state.routines, update],
  );

  const doStart = (routineId: string, sessionId: string | null) => {
    update((s) => startWorkout(s, routineId, sessionId));
    setPreStart(null);
    setOverlay(null);
    setWorkoutOpen(true);
  };

  const saveRoutine = (r: Routine) => {
    update((s) => upsertRoutine(s, r));
    setOverlay({ kind: 'detalle', routineId: r.id, sessionId: null });
  };

  if (state.active && workoutOpen) {
    return <Workout state={state} update={update} onClose={() => setWorkoutOpen(false)} />;
  }

  let content;
  if (overlay?.kind === 'editar') {
    content = (
      <RoutineEditor
        key={overlay.routine.id}
        initial={overlay.routine}
        isNew={overlay.isNew}
        focusExercise={overlay.focus}
        onCancel={() => setOverlay(overlay.isNew ? null : { kind: 'detalle', routineId: overlay.routine.id, sessionId: null })}
        onSave={saveRoutine}
      />
    );
  } else if (overlay?.kind === 'importar') {
    content = (
      <ImportView
        onCancel={() => setOverlay(null)}
        onCreate={(r, edit) => {
          if (edit) setOverlay({ kind: 'editar', routine: r, isNew: true });
          else saveRoutine(r);
        }}
      />
    );
  } else if (overlay?.kind === 'detalle') {
    const r = state.routines.find((x) => x.id === overlay.routineId);
    content = r ? (
      <RoutineDetail
        state={state}
        update={update}
        routine={r}
        sessionId={overlay.sessionId}
        onBack={() => setOverlay(null)}
        onEdit={(rr, focus) => setOverlay({ kind: 'editar', routine: rr, isNew: false, focus })}
        onStart={doStart}
      />
    ) : null;
  } else if (tab === 'inicio') {
    content = (
      <Home
        state={state}
        update={update}
        banner={banner}
        onDismissBanner={() => setBanner(null)}
        onOpenRoutine={(routineId, sessionId) => setOverlay({ kind: 'detalle', routineId, sessionId })}
        onStart={requestStart}
        onResume={() => setWorkoutOpen(true)}
        onGoRoutines={() => setTab('rutinas')}
      />
    );
  } else if (tab === 'rutinas') {
    content = (
      <RoutineList
        state={state}
        update={update}
        onOpen={(id) => setOverlay({ kind: 'detalle', routineId: id, sessionId: null })}
        onEdit={(r) => setOverlay({ kind: 'editar', routine: r, isNew: false })}
        onNew={() => setOverlay({ kind: 'editar', routine: blankRoutine(), isNew: true })}
        onImport={() => setOverlay({ kind: 'importar' })}
        onSchedule={(id) => setScheduleFor(id)}
      />
    );
  } else if (tab === 'progreso') content = <Progress state={state} update={update} />;
  else content = <Settings state={state} update={update} replace={replace} />;

  const preRoutine = preStart && state.routines.find((x) => x.id === preStart.routineId);

  return (
    <div className="app">
      <div className="app-bar">
        <span className="brand">
          <span className="logo" aria-hidden>
            ◆
          </span>{' '}
          Mi Coach
        </span>
        <button
          className="iconbtn"
          aria-label="Cambiar entre modo claro y oscuro"
          onClick={() => {
            const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.hasAttribute('data-theme') && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
            update((s) => ({ ...s, settings: { ...s.settings, theme: dark ? 'claro' : 'oscuro' } }));
          }}
        >
          🌓
        </button>
      </div>
      {saveError && <p className="notice warn">No se pudo guardar en este dispositivo (almacenamiento lleno o bloqueado). Exporta una copia en Ajustes.</p>}
      <main className="content">{content}</main>
      <nav className="tabbar" aria-label="Secciones">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id && !overlay ? 'on' : ''}
            aria-current={tab === t.id && !overlay ? 'page' : undefined}
            onClick={() => {
              setTab(t.id);
              setOverlay(null);
              window.scrollTo(0, 0);
            }}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {preRoutine && (
        <PreStart
          routine={preRoutine}
          onSave={(r) => update((s) => upsertRoutine(s, r))}
          onClose={() => setPreStart(null)}
          onEdit={(exId) => {
            setPreStart(null);
            setOverlay({ kind: 'editar', routine: preRoutine, isNew: false, focus: exId });
          }}
          onStart={() => doStart(preStart!.routineId, preStart!.sessionId)}
        />
      )}
      {scheduleFor && <ScheduleWrapper state={state} update={update} routineId={scheduleFor} onClose={() => setScheduleFor(null)} />}
      {!state.onboarded && <Welcome onClose={() => update((s) => ({ ...s, onboarded: true }))} />}
    </div>
  );
}

function ScheduleWrapper({ state, update, routineId, onClose }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; routineId: string; onClose: () => void }) {
  // la hoja de programación usa la rutina elegida como predeterminada
  const st = { ...state, reminders: { ...state.reminders, routineId } };
  return <ScheduleSheet date={todayISO()} state={st} update={update} onClose={onClose} />;
}

function Welcome({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Bienvenido a Mi Coach" onClose={onClose}>
      <p>Tu guía para entrenar paso a paso:</p>
      <ul className="bullets ok">
        <li>Planea tus rutinas por bloques: calentamiento, circuito, cardio y enfriamiento.</li>
        <li>Durante la sesión verás un ejercicio a la vez, con video o ilustración, temporizador y descansos.</li>
        <li>Revisa tu semana, reprograma sesiones y sigue tu progreso.</li>
      </ul>
      <p className="muted tiny">
        Cargamos la rutina de ejemplo «Cardio y abdomen» y un plan de lunes, miércoles y viernes. Algunos datos aparecen como «por confirmar» a propósito: la app no inventa valores que tu
        entrenador no haya definido.
      </p>
      <button className="btn big primary" onClick={onClose}>
        Empezar
      </button>
    </Sheet>
  );
}
