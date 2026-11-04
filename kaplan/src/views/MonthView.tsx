import { useState } from 'react';
import { setDay } from '../actions';
import { DOW_SHORT, fmtNum, ISODate, monthGrid, MONTHS, parseISO } from '../dates';
import { AppState, DAY_TYPES, DayType, TYPE_LABEL, TYPE_SHORT } from '../model';
import { dayType, getLog, goalMet, inNewPhase, inPlan, Plan } from '../plan';
import { TypeChip } from '../ui';

type Update = (fn: (s: AppState) => AppState) => void;

export default function MonthView({ s, update, plan, openDay, toast }: { s: AppState; update: Update; plan: Plan; openDay: (d: ISODate) => void; toast: (m: string) => void }) {
  const t0 = parseISO(plan.today < s.settings.startDate ? s.settings.startDate : plan.today);
  const [ym, setYm] = useState({ y: t0.getFullYear(), m: t0.getMonth() });
  const [paint, setPaint] = useState<DayType | null>(null);
  const grid = monthGrid(ym.y, ym.m);
  const inMonth = (d: ISODate) => parseISO(d).getMonth() === ym.m;
  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const monthDays = grid.filter(inMonth);
  const tgt = monthDays.reduce((a, d) => a + plan.target(d), 0);
  const done = monthDays.reduce((a, d) => a + (getLog(s, d).newDone ?? 0), 0);
  const counts = DAY_TYPES.map((t) => [t, monthDays.filter((d) => inPlan(s, d) && dayType(s, d) === t).length] as const).filter(([, n]) => n > 0);

  const tap = (d: ISODate) => {
    if (paint) {
      if (getLog(s, d).status !== 'pending') {
        toast('Ese día ya está cerrado: reábrelo para cambiar su tipo');
        return;
      }
      update(setDay(d, { type: paint }));
    } else openDay(d);
  };

  return (
    <>
      <div className="daynav">
        <button className="btn iconbtn" onClick={() => shift(-1)} aria-label="Mes anterior">‹</button>
        <div className="title">{MONTHS[ym.m]} {ym.y}</div>
        <button className="btn iconbtn" onClick={() => shift(1)} aria-label="Mes siguiente">›</button>
      </div>

      <div className="card" style={{ padding: 10 }}>
        <div className="month">
          {DOW_SHORT.map((d) => <div key={d} className="dow">{d}</div>)}
          {grid.map((d) => {
            const t = dayType(s, d);
            const l = getLog(s, d);
            const plain = !inPlan(s, d);
            const tg = plan.target(d);
            return (
              <button
                key={d}
                className={`mcell t-${t} ${inMonth(d) ? '' : 'out'} ${plain ? 'plain' : ''} ${d === plan.today ? 'today' : ''}`}
                onClick={() => tap(d)}
                aria-label={`${d} ${TYPE_LABEL[t]}`}
              >
                <span className="n">{parseISO(d).getDate()}</span>
                {!plain && <span className="ty">{TYPE_SHORT[t]}</span>}
                {!plain && inNewPhase(s, d) && (
                  <span className="q">{l.newDone != null ? `${l.newDone}/${tg}` : tg}{goalMet(s, plan, d) ? '✓' : ''}</span>
                )}
                {!plain && l.status !== 'pending' && <span className={`st st-${l.status}`} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Editar el calendario</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          {paint ? `Modo pintar: toca los días para asignarles «${TYPE_LABEL[paint]}».` : 'Elige un tipo y toca los días para asignarlo rápidamente. Sin tipo seleccionado, tocar un día abre su vista diaria.'}
        </p>
        <div className="legend">
          {DAY_TYPES.map((t) => (
            <button key={t} className="btn sm" style={paint === t ? { outline: '2px solid var(--text)' } : undefined} onClick={() => setPaint(paint === t ? null : t)}>
              <TypeChip type={t} />
            </button>
          ))}
        </div>
        {paint && <button className="btn block" style={{ marginTop: 8 }} onClick={() => setPaint(null)}>Terminar de pintar</button>}
      </div>

      <div className="card">
        <h2>Resumen del mes</h2>
        <div className="stats">
          <div className="stat"><b>{fmtNum(tgt)}</b><span>meta del mes</span></div>
          <div className="stat"><b>{fmtNum(done)}</b><span>realizadas</span></div>
          <div className="stat"><b>{fmtNum(Math.max(0, tgt - done))}</b><span>por hacer</span></div>
        </div>
        <div className="row wrap" style={{ marginTop: 10 }}>
          {counts.map(([t, n]) => <span key={t} className={`chip type t-${t}`}><span className="dot" />{TYPE_LABEL[t]}: {n}</span>)}
        </div>
        {plan.autoDays > 0 && (
          <p className="tiny muted" style={{ margin: '8px 0 0' }}>
            Días «sin definir»: cuota automática de <b>{plan.auto}</b> preguntas para llegar a {fmtNum(s.settings.totalQuestions)} el {s.settings.newDeadline.split('-').reverse().slice(0, 2).join('/')}. Se recalcula al definir turnos.
          </p>
        )}
      </div>
    </>
  );
}
