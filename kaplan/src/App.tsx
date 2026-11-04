import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dismissAlarm, markFired, rescheduleAlarm, snoozeAlarm } from './actions';
import { AlarmInstance, dueAlarms } from './alarms';
import { diffDays, fmtLong, ISODate, toISO } from './dates';
import { beep, notifPermission, requestNotif, showNotif, unlockAudio } from './notify';
import { computePlan, weekSummary } from './plan';
import { useAppState } from './store';
import { Icon, Sheet } from './ui';
import DayView from './views/DayView';
import MonthView from './views/MonthView';
import ReviewView from './views/ReviewView';
import SettingsView from './views/SettingsView';
import WeekView from './views/WeekView';

type Tab = 'day' | 'week' | 'month' | 'review' | 'settings';

const nowParts = () => {
  const n = new Date();
  return { today: toISO(n), min: n.getHours() * 60 + n.getMinutes() };
};

export default function App() {
  const { state: s, update, replace, saveError } = useAppState();
  const [tick, setTick] = useState(nowParts);
  const today = tick.today;
  const [tab, setTab] = useState<Tab>('day');
  const [date, setDate] = useState<ISODate>(() => (nowParts().today < s.settings.startDate ? s.settings.startDate : nowParts().today));
  const [section, setSection] = useState<string | undefined>();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [ringing, setRinging] = useState<AlarmInstance[]>([]);
  const [perm, setPerm] = useState(notifPermission());
  const toastTimer = useRef<number>();

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const plan = useMemo(() => computePlan(s, today), [s, today]);

  // reloj interno: revisa alarmas cada 15 s y al volver a la app
  useEffect(() => {
    const on = () => setTick(nowParts());
    const id = window.setInterval(on, 15000);
    document.addEventListener('visibilitychange', on);
    window.addEventListener('focus', on);
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', on);
      window.removeEventListener('focus', on);
    };
  }, []);

  useEffect(() => {
    const due = dueAlarms(s, today, tick.min);
    if (!due.length) return;
    const behind = weekSummary(s, plan, today).behind;
    const ring: AlarmInstance[] = [];
    update((st) => due.reduce((acc, a) => markFired(a.id)(acc), st));
    for (const a of due) {
      if (a.kind === 'weekly' && !behind) continue;
      const w = weekSummary(s, plan, today);
      const body = a.kind === 'weekly' ? `Llevas ${w.done} preguntas nuevas esta semana; lo planeado hasta ayer era ${w.expectedSoFar}.` : a.body;
      const inst = { ...a, title: a.kind === 'weekly' ? 'Vas por debajo de la meta semanal' : a.title, body };
      ring.push(inst);
      showNotif(inst.title, inst.body, inst.id);
    }
    if (ring.length) {
      if (s.alarms.sound) beep();
      setRinging((r) => [...r.filter((x) => !ring.some((y) => y.id === x.id)), ...ring]);
    }
  }, [tick, s, today, plan, update]);

  const openDay = (d: ISODate) => {
    setDate(d);
    setTab('day');
    window.scrollTo(0, 0);
  };
  const go = (t: Tab) => {
    setTab(t);
    setSection(undefined);
    if (t === 'day') setDate(today < s.settings.startDate ? s.settings.startDate : today);
    window.scrollTo(0, 0);
  };
  const daysToExam = diffDays(today, s.settings.examDate);
  const current = ringing[0];

  return (
    <div className="app">
      <div className="topbar">
        <h1>Plan Kaplan</h1>
        <div className="count">
          <b className="num">{daysToExam >= 0 ? daysToExam : 0}</b>
          días al examen
        </div>
        <div className="count">
          <b className="num">{plan.totalNew.toLocaleString('es-CO')}</b>
          de {s.settings.totalQuestions.toLocaleString('es-CO')}
        </div>
      </div>
      <main>
        {saveError && <div className="banner bad">No se pudo guardar en este dispositivo (almacenamiento lleno o bloqueado). Exporta una copia en Ajustes.</div>}
        {tab === 'day' && perm === 'default' && (
          <div className="banner info">
            🔔 <span className="grow">Permite notificaciones para recibir las alarmas mientras la app está abierta.</span>
            <button className="btn sm primary" onClick={async () => setPerm(await requestNotif())}>Permitir</button>
          </div>
        )}
        {tab === 'day' && (
          <DayView s={s} update={update} plan={plan} date={date} setDate={setDate} nowMin={tick.min} toast={toast} goSettings={() => { setSection('alarms'); setTab('settings'); }} />
        )}
        {tab === 'week' && <WeekView s={s} plan={plan} openDay={openDay} />}
        {tab === 'month' && <MonthView s={s} update={update} plan={plan} openDay={openDay} toast={toast} />}
        {tab === 'review' && <ReviewView s={s} update={update} today={today} />}
        {tab === 'settings' && <SettingsView s={s} update={update} replace={replace} plan={plan} toast={toast} section={section} />}
      </main>

      <nav className="tabs" aria-label="Secciones">
        <div>
          {(
            [
              ['day', 'Día', Icon.day],
              ['week', 'Semana', Icon.week],
              ['month', 'Mes', Icon.month],
              ['review', 'Repaso', Icon.review],
              ['settings', 'Ajustes', Icon.settings],
            ] as const
          ).map(([k, label, icon]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined}>
              {icon}
              {label}
            </button>
          ))}
        </div>
      </nav>

      {current && (
        <RingSheet
          a={current}
          nowMin={tick.min}
          onClose={() => setRinging((r) => r.slice(1))}
          onSnooze={(m) => { update(snoozeAlarm(current.id, m, tick.min)); toast(`Pospuesta ${m} min`); setRinging((r) => r.slice(1)); }}
          onDismiss={() => { update(dismissAlarm(current.id)); setRinging((r) => r.slice(1)); }}
          onReschedule={(t) => { update(rescheduleAlarm(current.id, t)); toast(`Reprogramada a las ${t}`); setRinging((r) => r.slice(1)); }}
          onOpenDay={() => { openDay(current.date); setRinging((r) => r.slice(1)); }}
        />
      )}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

function RingSheet({ a, nowMin, onClose, onSnooze, onDismiss, onReschedule, onOpenDay }: {
  a: AlarmInstance; nowMin: number; onClose: () => void; onSnooze: (m: number) => void; onDismiss: () => void; onReschedule: (t: string) => void; onOpenDay: () => void;
}) {
  const [t, setT] = useState(() => {
    const m = Math.min(nowMin + 30, 1439);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  });
  return (
    <Sheet title={`⏰ ${a.time} · ${a.title}`} onClose={onClose} className="ringing">
      <p style={{ margin: 0 }}>{a.body}</p>
      <p className="tiny muted" style={{ margin: 0 }}>{fmtLong(a.date)}</p>
      <div className="grid3">
        <button className="btn" onClick={() => onSnooze(5)}>+5 min</button>
        <button className="btn" onClick={() => onSnooze(10)}>+10 min</button>
        <button className="btn" onClick={() => onSnooze(15)}>+15 min</button>
      </div>
      <div className="row">
        <input type="time" value={t} onChange={(e) => setT(e.target.value)} />
        <button className="btn" onClick={() => onReschedule(t)}>Reprogramar</button>
      </div>
      <div className="grid2">
        <button className="btn danger" onClick={onDismiss}>Descartar</button>
        <button className="btn primary" onClick={a.kind === 'endOfDay' || a.kind === 'weekly' ? onOpenDay : onClose}>
          {a.kind === 'endOfDay' || a.kind === 'weekly' ? 'Ir al día' : 'Entendido'}
        </button>
      </div>
    </Sheet>
  );
}
