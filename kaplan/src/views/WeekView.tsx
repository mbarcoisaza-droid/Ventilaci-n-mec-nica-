import { useState } from 'react';
import { addDays, DOW_LONG, fmtShort, ISODate, parseISO, weekdayMon, weekStart } from '../dates';
import { AppState, TYPE_LABEL } from '../model';
import { dayType, getLog, goalMet, inNewPhase, inPlan, Plan, weekSummary } from '../plan';
import { Bar, StatusChip } from '../ui';

export default function WeekView({ s, plan, openDay }: { s: AppState; plan: Plan; openDay: (d: ISODate) => void }) {
  const [anchor, setAnchor] = useState<ISODate>(weekStart(plan.today));
  const w = weekSummary(s, plan, anchor);
  const isCurrent = anchor === weekStart(plan.today);
  const ref = w.weeklyRef;
  return (
    <>
      <div className="daynav">
        <button className="btn iconbtn" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Semana anterior">‹</button>
        <div className="title" style={{ textTransform: 'none' }}>
          {fmtShort(w.start)} – {fmtShort(w.end)}
          {isCurrent && <div className="tiny muted" style={{ fontWeight: 500 }}>Semana actual</div>}
        </div>
        <button className="btn iconbtn" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Semana siguiente">›</button>
      </div>
      {!isCurrent && <button className="btn sm" style={{ alignSelf: 'center' }} onClick={() => setAnchor(weekStart(plan.today))}>Ir a esta semana</button>}

      <div className="card">
        <h2>Resumen semanal</h2>
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <div className="num" style={{ fontSize: 24, fontWeight: 800 }}>
            {w.done} <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>/ {ref} de referencia</span>
          </div>
          <div className="small muted num">plan: {w.planTarget}</div>
        </div>
        <Bar value={w.done} max={Math.max(ref, w.planTarget, 1)} marker={ref} tone={w.done >= ref && ref > 0 ? 'ok' : w.behind ? 'warn' : undefined} />
        <p className="tiny muted" style={{ margin: '6px 0 10px' }}>
          Referencia: {s.settings.weeklyTarget} preguntas nuevas/semana{w.phaseDays < 7 && w.phaseDays > 0 ? `, prorrateada a ${w.phaseDays} días del plan` : ''}. La marca es la referencia; «plan» es la suma de metas diarias.
        </p>
        <div className="stats">
          <div className="stat"><b style={{ color: 'var(--ok)' }}>{w.goalsMet}</b><span>metas diarias cumplidas</span></div>
          <div className="stat"><b>{w.pending}</b><span>días pendientes de cerrar</span></div>
          <div className="stat"><b>{w.done}</b><span>preguntas nuevas</span></div>
          <div className="stat"><b>{w.review}</b><span>preguntas de repaso</span></div>
          <div className="stat"><b>{w.exercise}/7</b><span>días con ejercicio</span></div>
          <div className="stat"><b>{w.sleep}/7</b><span>días con meta de sueño</span></div>
        </div>
        <div className="row wrap small" style={{ marginTop: 10 }}>
          <span className="chip status-completed">{w.completed} completados</span>
          <span className="chip status-incomplete">{w.incomplete} incompletos</span>
          <span className="chip status-rescheduled">{w.rescheduled} reprogramados</span>
        </div>
        {isCurrent && w.behind && (
          <div className="banner warn" style={{ marginTop: 10 }}>
            📉 <span>Por debajo de lo previsto: llevas <b>{w.done}</b>; lo planeado hasta ayer era <b>{w.expectedSoFar}</b> y el ritmo de {s.settings.weeklyTarget}/semana daría <b>{w.refSoFar}</b>.</span>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Días</h2>
        {w.days.map((d) => {
          const t = dayType(s, d);
          const l = getLog(s, d);
          const met = goalMet(s, plan, d);
          const tg = plan.target(d);
          return (
            <div key={d} className={`wday t-${t} ${d === plan.today ? 'today' : ''}`} onClick={() => openDay(d)} role="button" tabIndex={0}>
              <span className="stripe" />
              <div className="grow">
                <div className="row" style={{ gap: 6 }}>
                  <b style={{ textTransform: 'capitalize' }}>{DOW_LONG[weekdayMon(d)]} {parseISO(d).getDate()}</b>
                  {inPlan(s, d) && <span className="tiny" style={{ color: 'var(--tc)', fontWeight: 700 }}>{TYPE_LABEL[t]}</span>}
                </div>
                <div className="small muted num">
                  {inNewPhase(s, d) ? <>Nuevas {l.newDone ?? '—'} / {tg}{met && ' ✅'}</> : inPlan(s, d) ? 'Sin preguntas nuevas' : 'Fuera del plan'}
                  {l.reviewDone > 0 && ` · repaso ${l.reviewDone}`}
                </div>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                {inPlan(s, d) && <StatusChip status={l.status} />}
                <div className="icons" aria-label="checklist">
                  <span className={l.explanations ? '' : 'off'} title="Explicaciones">📖</span>
                  <span className={l.loggedErrors ? '' : 'off'} title="Errores registrados">📝</span>
                  <span className={l.exercise ? '' : 'off'} title="Ejercicio">🏋️</span>
                  <span className={l.sleep ? '' : 'off'} title="Sueño">🌙</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
