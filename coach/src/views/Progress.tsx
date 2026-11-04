/** Progreso: cumplimiento semanal e historial de entrenamientos. */
import { useState } from 'react';
import { Empty, Sheet } from '../components/ui';
import { fmtDur, fmtLong, fmtShort, todayISO } from '../dates';
import { AppState, HistoryEntry } from '../model';
import { compliance, weekly } from '../progress';

const FEEL = ['', '😣', '😕', '😐', '🙂', '😄'];

export function Progress({ state, update }: { state: AppState; update: (fn: (s: AppState) => AppState) => void }) {
  const weeks = weekly(state, 8);
  const c = compliance(state);
  const goal = state.settings.weeklyGoal;
  const max = Math.max(goal, ...weeks.map((w) => Math.max(w.done, w.scheduled)), 1);
  const [open, setOpen] = useState<HistoryEntry | null>(null);
  const [del, setDel] = useState(false);
  const total = state.history.length;
  const minutes = Math.round(state.history.reduce((a, h) => a + h.durationSec, 0) / 60);
  const feelings = state.history.filter((h) => h.feeling != null);
  const avgFeel = feelings.length ? feelings.reduce((a, h) => a + (h.feeling ?? 0), 0) / feelings.length : null;
  const reached = weeks.filter((w) => w.done >= goal).length;

  return (
    <div className="page">
      <h1 className="page-title">Progreso</h1>
      <section className="card">
        <h2>Cumplimiento semanal</h2>
        <p className="muted tiny">
          Meta: {goal} sesiones por semana. Alcanzada en {reached} de las últimas 8 semanas.
        </p>
        <div className="chart" role="img" aria-label={`Sesiones completadas por semana. Esta semana: ${c.done} de ${goal}.`}>
          <div className="goal-line" style={{ bottom: `calc(36px + (100% - 50px) * ${goal / max})` }}>
            <span>meta {goal}</span>
          </div>
          {weeks.map((w) => (
            <div key={w.from} className="col-bar" title={`${fmtShort(w.from)}: ${w.done} completadas de ${w.scheduled} programadas`}>
              <div className="bars">
                <i className="sched" style={{ height: `${(w.scheduled / max) * 100}%` }} />
                <i className={`done ${w.done >= goal ? 'met' : ''}`} style={{ height: `${(w.done / max) * 100}%` }} />
              </div>
              <small>{fmtShort(w.from)}</small>
              <b>{w.done}</b>
            </div>
          ))}
        </div>
        <div className="legend">
          <span>
            <i className="lg done" /> Completadas
          </span>
          <span>
            <i className="lg sched" /> Programadas
          </span>
        </div>
      </section>

      <section className="card">
        <div className="stats">
          <div className="stat">
            <b>{total}</b>
            <span>entrenamientos</span>
          </div>
          <div className="stat">
            <b>{fmtDur(minutes * 60)}</b>
            <span>tiempo total</span>
          </div>
          <div className="stat">
            <b>{c.streak}</b>
            <span>racha</span>
          </div>
        </div>
        {avgFeel != null && <p className="tiny muted center">Sensación media: {FEEL[Math.round(avgFeel)]} ({avgFeel.toFixed(1).replace('.', ',')} de 5)</p>}
      </section>

      <h2 className="section-title">Historial</h2>
      {!state.history.length && (
        <div className="card">
          <Empty icon="📈" title="Aún no hay entrenamientos registrados">
            <p className="muted">Al terminar una sesión se guardan la fecha, la duración y los ejercicios realizados.</p>
          </Empty>
        </div>
      )}
      <ul className="history">
        {state.history.map((h) => (
          <li key={h.id}>
            <button className="card hist-item" onClick={() => setOpen(h)}>
              <span className="hist-date">
                <b>{fmtShort(h.date)}</b>
                <small>{h.date === todayISO() ? 'hoy' : ''}</small>
              </span>
              <span className="hist-main">
                <b>{h.routineName}</b>
                <small className="muted">
                  {fmtDur(h.durationSec)} · {h.exercises.filter((e) => e.status === 'hecho').length} ejercicios
                  {h.outcome === 'detenida' ? ' · detenida' : ''}
                  {h.lowImpact ? ' · bajo impacto' : ''}
                </small>
                {h.discomfort && <small className="warn-txt">Malestar registrado</small>}
              </span>
              <span className="hist-feel" aria-label={h.feeling ? `Sensación ${h.feeling} de 5` : 'Sin valorar'}>
                {h.feeling ? FEEL[h.feeling] : '—'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <Sheet title={open.routineName} onClose={() => (setOpen(null), setDel(false))}>
          <p className="muted">
            {fmtLong(open.date)} · {new Date(open.startedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="stats">
            <div className="stat">
              <b>{fmtDur(open.durationSec)}</b>
              <span>duración real</span>
            </div>
            <div className="stat">
              <b>{fmtDur(open.plannedSec)}</b>
              <span>estimada</span>
            </div>
            <div className="stat">
              <b>{open.effort ?? '—'}</b>
              <span>esfuerzo (1–10)</span>
            </div>
          </div>
          {open.feeling && (
            <p>
              Sensación: {FEEL[open.feeling]} ({open.feeling}/5)
            </p>
          )}
          {open.notes && (
            <div className="coach-note">
              <b>Comentarios</b>
              <p>{open.notes}</p>
            </div>
          )}
          {open.discomfort && (
            <div className="notice warn">
              <b>Malestar registrado</b>
              <br />
              {open.discomfort.where || 'Sin ubicación'} · intensidad {open.discomfort.intensity}/10
              {open.discomfort.note && <p>{open.discomfort.note}</p>}
            </div>
          )}
          <h4>Ejercicios</h4>
          <ul className="log">
            {open.exercises.map((l, i) => (
              <li key={i} className={l.status}>
                <span>{l.status === 'hecho' ? '✓' : '↷'}</span>
                {l.name}
                <small>
                  {l.block} · R{l.round}
                  {l.seconds ? ` · ${fmtDur(l.seconds)}` : ''}
                </small>
              </li>
            ))}
          </ul>
          {!del ? (
            <button className="linkbtn danger" onClick={() => setDel(true)}>
              Eliminar este registro
            </button>
          ) : (
            <div className="row">
              <button
                className="btn sm danger"
                onClick={() => {
                  update((s) => ({
                    ...s,
                    history: s.history.filter((x) => x.id !== open.id),
                    sessions: s.sessions.map((x) => (x.historyId === open.id ? { ...x, status: 'pendiente', historyId: undefined } : x)),
                  }));
                  setOpen(null);
                  setDel(false);
                }}
              >
                Sí, eliminar
              </button>
              <button className="btn sm ghost" onClick={() => setDel(false)}>
                Cancelar
              </button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
