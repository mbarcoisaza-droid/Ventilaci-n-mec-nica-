/** Pantalla principal: calendario semanal, rutina del día, cumplimiento y reprogramación. */
import { useState } from 'react';
import { patchSession, reschedule, scheduleSession } from '../actions';
import { Bar, Empty, Field, Sheet, StatusChip } from '../components/ui';
import { DOW_SHORT, WEEK_ORDER, addDays, fmtDur, fmtLong, fmtShort, parseISO, todayISO, weekStart } from '../dates';
import { AppState, BLOCK_ICON, Session } from '../model';
import { compliance, overdue } from '../progress';
import { estimateSeconds } from '../sequence';

type Upd = (fn: (s: AppState) => AppState) => void;

export function Home({
  state,
  update,
  onOpenRoutine,
  onStart,
  onResume,
  banner,
  onDismissBanner,
  onGoRoutines,
}: {
  state: AppState;
  update: Upd;
  onOpenRoutine: (routineId: string, sessionId: string | null) => void;
  onStart: (routineId: string, sessionId: string | null) => void;
  onResume: () => void;
  banner: string | null;
  onDismissBanner: () => void;
  onGoRoutines: () => void;
}) {
  const today = todayISO();
  const [selected, setSelected] = useState(today);
  const [week, setWeek] = useState(weekStart(today));
  const [resched, setResched] = useState<Session | null>(null);
  const [schedule, setSchedule] = useState<string | null>(null);
  const c = compliance(state, today);
  const late = overdue(state, today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const daySessions = state.sessions.filter((x) => x.date === selected).sort((a, b) => (a.time < b.time ? -1 : 1));
  const routineOf = (id: string) => state.routines.find((r) => r.id === id);
  const name = state.profile.name.trim();
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="page">
      <header className="home-head">
        <div>
          <p className="muted">{fmtLong(today).replace(/^\w/, (x) => x.toUpperCase())}</p>
          <h1 className="page-title">
            {hello}
            {name ? `, ${name}` : ''}
          </h1>
        </div>
      </header>

      {banner && (
        <div className="notice reminder" role="status">
          🔔 {banner}
          <button className="iconbtn" onClick={onDismissBanner} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {state.active && (
        <button className="notice ok as-btn" onClick={onResume}>
          ▶ Tienes un entrenamiento en curso: <b>{state.active.snapshot.name}</b>. Toca para continuar.
        </button>
      )}

      <section className="card week" aria-label="Calendario semanal">
        <div className="week-nav">
          <button className="iconbtn" onClick={() => setWeek(addDays(week, -7))} aria-label="Semana anterior">
            ‹
          </button>
          <b>
            {fmtShort(days[0])} – {fmtShort(days[6])}
          </b>
          <button className="iconbtn" onClick={() => setWeek(addDays(week, 7))} aria-label="Semana siguiente">
            ›
          </button>
        </div>
        <div className="week-days">
          {days.map((d, i) => {
            const ss = state.sessions.filter((x) => x.date === d);
            const done = ss.some((x) => x.status === 'completada');
            const pend = ss.some((x) => x.status === 'pendiente' || x.status === 'en_curso');
            return (
              <button
                key={d}
                className={`day ${d === selected ? 'sel' : ''} ${d === today ? 'today' : ''}`}
                onClick={() => setSelected(d)}
                aria-pressed={d === selected}
                aria-label={`${fmtLong(d)}${ss.length ? `, ${ss.length} entrenamiento(s)` : ''}`}
              >
                <small>{DOW_SHORT[WEEK_ORDER[i]]}</small>
                <b>{parseISO(d).getDate()}</b>
                <span className="dots">
                  {done && <i className="dot done" />}
                  {pend && <i className={`dot ${d < today ? 'late' : 'pend'}`} />}
                </span>
              </button>
            );
          })}
        </div>
        {week !== weekStart(today) && (
          <button
            className="linkbtn"
            onClick={() => {
              setWeek(weekStart(today));
              setSelected(today);
            }}
          >
            Volver a hoy
          </button>
        )}
      </section>

      <section aria-label="Entrenamiento del día">
        <h2 className="section-title">{selected === today ? 'Rutina de hoy' : fmtLong(selected).replace(/^\w/, (x) => x.toUpperCase())}</h2>
        {!daySessions.length && (
          <div className="card">
            <Empty icon="🗓️" title={selected === today ? 'Hoy no hay entrenamiento programado' : 'Sin entrenamientos este día'}>
              {state.routines.length ? (
                <button className="btn" onClick={() => setSchedule(selected)}>
                  + Programar una rutina
                </button>
              ) : (
                <button className="btn" onClick={onGoRoutines}>
                  Crear una rutina
                </button>
              )}
            </Empty>
          </div>
        )}
        {daySessions.map((ses) => {
          const r = routineOf(ses.routineId);
          if (!r) return null;
          const hist = ses.historyId ? state.history.find((h) => h.id === ses.historyId) : null;
          const isLate = ses.status === 'pendiente' && ses.date < today;
          return (
            <article key={ses.id} className="card today-card">
              <div className="row between">
                <StatusChip status={ses.status} partial={hist?.outcome === 'detenida'} />
                <span className="muted">{ses.time && `🕒 ${ses.time}`}</span>
              </div>
              <h3>{r.name}</h3>
              <p className="muted">
                {fmtLong(ses.date)} · {fmtDur(estimateSeconds(r))} estimados
              </p>
              <div className="chips">
                {r.blocks.map((b) => (
                  <span key={b.id} className={`chip blk-${b.kind}`}>
                    {BLOCK_ICON[b.kind]} {b.title}
                  </span>
                ))}
              </div>
              {ses.rescheduledFrom.length > 0 && <p className="tiny muted">Reprogramada desde {ses.rescheduledFrom.map(fmtShort).join(', ')}.</p>}
              {isLate && <p className="notice">Esta sesión quedó pendiente. Puedes hacerla ahora o moverla a otro día cuando te venga bien.</p>}
              {hist && (
                <p className="tiny muted">
                  Hecha en {fmtDur(hist.durationSec)} · {hist.exercises.filter((e) => e.status === 'hecho').length} ejercicios
                </p>
              )}
              <div className="today-actions">
                {ses.status === 'en_curso' && state.active?.sessionId === ses.id ? (
                  <button className="btn big primary" onClick={onResume}>
                    ▶ Continuar entrenamiento
                  </button>
                ) : ses.status !== 'completada' ? (
                  <button className="btn big primary" onClick={() => onStart(r.id, ses.id)} disabled={!!state.active}>
                    ▶ Iniciar entrenamiento
                  </button>
                ) : null}
                <div className="row2">
                  <button className="btn" onClick={() => onOpenRoutine(r.id, ses.id)}>
                    Ver rutina
                  </button>
                  {ses.status !== 'completada' && ses.status !== 'en_curso' && (
                    <button className="btn" onClick={() => setResched(ses)}>
                      Reprogramar
                    </button>
                  )}
                </div>
                {ses.status === 'omitida' && (
                  <button className="linkbtn" onClick={() => update((s) => patchSession(s, ses.id, { status: 'pendiente' }))}>
                    Volver a marcar como pendiente
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {daySessions.length > 0 && (
          <button className="linkbtn" onClick={() => setSchedule(selected)}>
            + Añadir otra rutina este día
          </button>
        )}
      </section>

      <section className="card">
        <h2>Esta semana</h2>
        <div className="stats">
          <div className="stat">
            <b>{c.daysDone}</b>
            <span>días completados</span>
          </div>
          <div className="stat">
            <b>{c.pending}</b>
            <span>pendientes</span>
          </div>
          <div className="stat">
            <b>{c.streak}</b>
            <span>racha de sesiones</span>
          </div>
        </div>
        <div className="goal">
          <span>
            Meta semanal: {c.done} de {c.goal}
          </span>
          <Bar value={c.done} max={c.goal} />
        </div>
      </section>

      {late.filter((x) => x.date !== selected).length > 0 && (
        <section className="card">
          <h2>Sesiones por reprogramar</h2>
          <p className="muted tiny">Quedan guardadas sin contar como incumplidas. Muévelas a otro día o márcalas como omitidas si así lo decides.</p>
          <ul className="late-list">
            {late.map((ses) => (
              <li key={ses.id}>
                <span>
                  <b>{routineOf(ses.routineId)?.name ?? 'Rutina eliminada'}</b>
                  <small className="muted">{fmtLong(ses.date)}</small>
                </span>
                <button className="btn sm" onClick={() => setResched(ses)}>
                  Reprogramar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {resched && <RescheduleSheet session={resched} state={state} update={update} onClose={() => setResched(null)} onStart={onStart} />}
      {schedule && <ScheduleSheet date={schedule} state={state} update={update} onClose={() => setSchedule(null)} />}
    </div>
  );
}

function RescheduleSheet({ session, state, update, onClose, onStart }: { session: Session; state: AppState; update: Upd; onClose: () => void; onStart: (r: string, s: string) => void }) {
  const today = todayISO();
  const [date, setDate] = useState(session.date < today ? today : addDays(session.date, 1));
  const [time, setTime] = useState(session.time || state.reminders.time);
  const busy = new Set(state.sessions.filter((x) => x.id !== session.id && x.status !== 'omitida').map((x) => x.date));
  const nextFree = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1)).find((d) => !busy.has(d));
  const quick = [
    { d: today, l: 'Hoy' },
    { d: addDays(today, 1), l: 'Mañana' },
    ...(nextFree && nextFree !== addDays(today, 1) ? [{ d: nextFree, l: `Próximo día libre (${fmtShort(nextFree)})` }] : []),
  ];
  return (
    <Sheet title="Reprogramar sesión" onClose={onClose}>
      <p className="muted">Fecha original: {fmtLong(session.date)}. El cambio queda registrado en el historial.</p>
      <div className="row wrap">
        {quick.map((q) => (
          <button key={q.d} className={`btn sm ${date === q.d ? 'on' : 'ghost'}`} onClick={() => setDate(q.d)}>
            {q.l}
          </button>
        ))}
      </div>
      <div className="grid2">
        <Field label="Nueva fecha">
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <button
        className="btn big primary"
        disabled={!date}
        onClick={() => {
          update((s) => reschedule(s, session.id, date, time));
          onClose();
        }}
      >
        Guardar nueva fecha
      </button>
      {session.date <= today && !state.active && (
        <button
          className="btn"
          onClick={() => {
            update((s) => reschedule(s, session.id, today, time));
            onClose();
            onStart(session.routineId, session.id);
          }}
        >
          Hacerla ahora
        </button>
      )}
      <button
        className="linkbtn"
        onClick={() => {
          update((s) => patchSession(s, session.id, { status: 'omitida' }));
          onClose();
        }}
      >
        Marcar como omitida (no reprogramar)
      </button>
      <button
        className="linkbtn danger"
        onClick={() => {
          update((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== session.id) }));
          onClose();
        }}
      >
        Quitar del calendario
      </button>
    </Sheet>
  );
}

function ScheduleSheet({ date: d0, state, update, onClose }: { date: string; state: AppState; update: Upd; onClose: () => void }) {
  const [routineId, setRoutineId] = useState(state.reminders.routineId || state.routines[0]?.id || '');
  const [date, setDate] = useState(d0);
  const [time, setTime] = useState(state.reminders.time);
  return (
    <Sheet title="Programar entrenamiento" onClose={onClose}>
      <Field label="Rutina">
        <select value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
          {state.routines.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid2">
        <Field label="Fecha">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <button
        className="btn big primary"
        disabled={!routineId || !date}
        onClick={() => {
          update((s) => scheduleSession(s, routineId, date, time));
          onClose();
        }}
      >
        Programar
      </button>
    </Sheet>
  );
}

export { ScheduleSheet };
