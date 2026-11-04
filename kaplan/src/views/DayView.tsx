import { useMemo, useState } from 'react';
import { addMove, closeDay, dismissAlarm, removeMove, reopenDay, rescheduleAlarm, resetAlarm, setDay, setLog, snoozeAlarm } from '../actions';
import { ALARM_LABEL, alarmsForDay } from '../alarms';
import { addDays, diffDays, fmtLong, fmtShort, fromMin, ISODate, rangeDates, toMin } from '../dates';
import { AppState, Block, DAY_TYPES, DayType, TYPE_LABEL } from '../model';
import { baseQuota, conflicts, dayBlocks, dayType, getLog, goalMet, inNewPhase, inPlan, Plan, suggestTargetDay, timeline, weekSummary } from '../plan';
import { BlockEditor, ProgressCard, Sheet, StatusChip, TypeChip } from '../ui';

type Update = (fn: (s: AppState) => AppState) => void;

interface Props {
  s: AppState;
  update: Update;
  plan: Plan;
  date: ISODate;
  setDate: (d: ISODate) => void;
  nowMin: number;
  toast: (m: string) => void;
  goSettings: () => void;
}

export default function DayView({ s, update, plan, date, setDate, nowMin, toast, goSettings }: Props) {
  const type = dayType(s, date);
  const log = getLog(s, date);
  const target = plan.target(date);
  const isToday = date === plan.today;
  const closed = log.status !== 'pending';
  const [sheet, setSheet] = useState<null | 'complete' | 'edit' | 'reduce' | 'break'>(null);
  const confl = useMemo(() => conflicts(s, date), [s, date]);
  const conflIds = new Set(confl.flatMap((c) => c.ids));
  const tl = timeline(s, date);
  const alarms = alarmsForDay(s, date);
  const week = weekSummary(s, plan, plan.today);
  const movesHere = s.moves.filter((m) => m.from === date || m.to === date);
  const nearMilestones = s.milestones.filter((m) => {
    const left = diffDays(plan.today, m.date);
    return left >= 0 && left <= s.alarms.milestone.daysBefore;
  });

  const numInput = (v: number | null, on: (n: number | null) => void, label: string) => (
    <div className="counter">
      <button className="btn" aria-label={`Restar ${label}`} onClick={() => on(Math.max(0, (v ?? 0) - 1))}>−</button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={label}
        value={v ?? ''}
        placeholder="—"
        onChange={(e) => on(e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
      />
      <button className="btn" aria-label={`Sumar ${label}`} onClick={() => on((v ?? 0) + 1)}>+</button>
    </div>
  );

  const kaplanEarly = type === 'shift12' && dayBlocks(s, date).find((b) => b.kind === 'kaplan' && toMin(b.start) < 7 * 60);

  return (
    <>
      <div className="daynav">
        <button className="btn iconbtn" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">‹</button>
        <div className="title" style={{ textTransform: 'none' }}>
          {fmtLong(date).replace(/^./, (c) => c.toUpperCase())}
          {isToday && <div className="tiny muted" style={{ fontWeight: 500 }}>Hoy</div>}
        </div>
        <button className="btn iconbtn" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente">›</button>
      </div>
      {!isToday && (
        <button className="btn sm" onClick={() => setDate(plan.today)} style={{ alignSelf: 'center' }}>Ir a hoy</button>
      )}

      {isToday && nearMilestones.map((m) => (
        <div key={m.id} className="banner info">🚩 <span><b>{m.label}</b> · {m.date === plan.today ? 'hoy' : `en ${diffDays(plan.today, m.date)} días`}{m.cumulative ? ` · meta acumulada ${m.cumulative} (llevas ${plan.totalNew})` : ''}</span></div>
      ))}
      {isToday && week.behind && (
        <div className="banner warn">
          📉 <span>Vas por debajo de la meta semanal: <b>{week.done}</b> nuevas esta semana; lo planeado hasta ayer era <b>{week.expectedSoFar}</b> (ritmo de {s.settings.weeklyTarget}/semana: {week.refSoFar}).</span>
        </div>
      )}

      {!inPlan(s, date) && <div className="banner info">Este día está fuera del plan ({fmtShort(s.settings.startDate)} – {fmtShort(s.settings.examDate)}).</div>}

      <div className="card">
        <div className="row between wrap" style={{ marginBottom: 10 }}>
          <div className="row wrap">
            <TypeChip type={type} />
            <StatusChip status={log.status} />
          </div>
          <button className="btn sm" onClick={() => setSheet('edit')}>Editar día</button>
        </div>
        {type === 'exam' ? (
          <p style={{ margin: 0 }}>🎯 Día del examen. Sin preguntas nuevas: descansa y confía en tu preparación.</p>
        ) : (
          <>
            <div className="row between">
              <div>
                <div className="small muted">Preguntas nuevas</div>
                <div className="num" style={{ fontSize: 13 }}>
                  meta del día: <b style={{ fontSize: 18 }}>{target}</b>
                  {plan.auto > 0 && type === 'unset' && s.days[date]?.quotaOverride == null && s.settings.unsetQuota == null && !closed && <span className="muted"> (automática)</span>}
                </div>
              </div>
              {numInput(log.newDone, (n) => update(setLog(date, { newDone: n })), 'preguntas nuevas')}
            </div>
            <div className="row between" style={{ marginTop: 10 }}>
              <div>
                <div className="small muted">Preguntas de repaso</div>
                <div className="tiny muted">No suman a las {s.settings.totalQuestions.toLocaleString('es-CO')}</div>
              </div>
              {numInput(log.reviewDone, (n) => update(setLog(date, { reviewDone: n ?? 0 })), 'preguntas de repaso')}
            </div>
            {log.newDone != null && (
              <div className={`banner ${goalMet(s, plan, date) ? 'ok' : 'warn'}`} style={{ marginTop: 10 }}>
                {goalMet(s, plan, date) ? `✅ Meta de preguntas cumplida: ${log.newDone} / ${target}` : `⏳ ${log.newDone} / ${target}: faltan ${target - log.newDone}`}
              </div>
            )}
            {log.newDone == null && <p className="tiny muted" style={{ margin: '8px 0 0' }}>La meta no se marca como cumplida hasta que ingreses el número real de preguntas nuevas.</p>}
          </>
        )}

        <h3>Checklist</h3>
        {(
          [
            ['explanations', 'Revisé las explicaciones de las preguntas'],
            ['loggedErrors', 'Registré incorrectas o acertadas con duda'],
            ['exercise', 'Cumplí el ejercicio del día'],
            ['sleep', `Cumplí la meta de sueño (${String(s.settings.sleep.minHours).replace('.', ',')}–${String(s.settings.sleep.maxHours).replace('.', ',')} h)`],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={log[k]} onChange={(e) => update(setLog(date, { [k]: e.target.checked }))} />
            <span>{label}</span>
          </label>
        ))}

        <div style={{ marginTop: 12 }}>
          {closed ? (
            <div className="stack">
              <button className={`big-complete ${log.status === 'completed' ? 'done' : ''}`} onClick={() => setSheet('complete')}>
                {log.status === 'completed' ? '✓ Día completado' : log.status === 'rescheduled' ? '↪ Día reprogramado' : '✗ Día incompleto'}
              </button>
              <button className="btn sm" onClick={() => { update(reopenDay(date)); toast('Día reabierto'); }}>Reabrir día</button>
            </div>
          ) : (
            <button className="big-complete" onClick={() => setSheet('complete')} disabled={!inPlan(s, date)}>Completar día</button>
          )}
        </div>
      </div>

      {movesHere.length > 0 && (
        <div className="card">
          <h2>Preguntas reprogramadas</h2>
          {movesHere.map((m) => (
            <div key={m.id} className="row between" style={{ padding: '6px 0' }}>
              <span className="small">
                {m.from === date ? `Salen ${m.qty} → ${fmtShort(m.to)}` : `Llegan ${m.qty} ← ${fmtShort(m.from)}`}
                <span className="muted"> · {m.reason === 'deficit' ? 'déficit' : m.reason}</span>
              </span>
              {m.reason !== 'deficit' && <button className="btn sm" onClick={() => update(removeMove(m.id))}>Deshacer</button>}
            </div>
          ))}
        </div>
      )}

      {kaplanEarly && !closed && (
        <div className="card">
          <h2>Turno de 12 h · bloque de madrugada</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Kaplan {kaplanEarly.start}–{kaplanEarly.end}. Si compromete tu sueño o no es viable hoy, muévelo a un descanso del turno o reduce la meta y reprograma el resto.
          </p>
          <div className="grid2">
            <button className="btn" onClick={() => setSheet('break')}>Mover a un descanso</button>
            <button className="btn" onClick={() => setSheet('reduce')}>Reducir y reprogramar</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Rutina del día</h2>
          <button className="btn sm" onClick={() => setSheet('edit')}>Reorganizar</button>
        </div>
        {confl.length > 0 && (
          <div className="banner bad" style={{ margin: '6px 0' }}>
            <div>
              <b>Superposiciones o conflictos:</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{confl.map((c, i) => <li key={i}>{c.message}</li>)}</ul>
            </div>
          </div>
        )}
        <div className={`timeline t-${type}`}>
          {tl.map((it) => (
            <div key={it.id} className={`tl k-${it.kind} ${it.derived ? 'derived' : ''} ${conflIds.has(it.id) ? 'conflict' : ''}`}>
              <div className="time">{it.start === it.end ? fromMin(it.start) : `${fromMin(it.start)}–${fromMin(it.end)}`}</div>
              <div className="what">
                <span className="bullet" />
                <span>
                  {it.kind === 'kaplan' ? '📚 ' : it.kind === 'gym' ? '🏋️ ' : it.kind === 'work' ? '🏥 ' : it.kind === 'sleep' ? '🌙 ' : it.kind === 'sleepPrep' ? '🛏️ ' : it.kind === 'commute' ? '🚗 ' : ''}
                  {it.label}
                  {it.questions && <span className="muted"> · {it.questions} preg.</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Alarmas y recordatorios</h2>
          <button className="btn sm" onClick={goSettings}>Configurar</button>
        </div>
        {alarms.length === 0 && <p className="small muted">Sin alarmas para este día.</p>}
        {alarms.map((a) => (
          <AlarmRow key={a.id} a={a} past={isToday ? toMin(a.time) < nowMin : date < plan.today} update={update} nowMin={nowMin} isToday={isToday} />
        ))}
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>
          Las alarmas suenan mientras la app está abierta. Para avisos con la app cerrada, exporta los recordatorios al calendario del teléfono (Ajustes → Alarmas).
        </p>
      </div>

      <div className="card">
        <h2>Nota del día</h2>
        <textarea value={s.days[date]?.note ?? ''} placeholder="Temas vistos, cómo te sentiste, ajustes…" onChange={(e) => update(setDay(date, { note: e.target.value }))} />
      </div>

      {isToday && <ProgressCard s={s} plan={plan} />}

      {sheet === 'complete' && <CompleteSheet s={s} update={update} plan={plan} date={date} onClose={() => setSheet(null)} toast={toast} />}
      {sheet === 'edit' && <EditDaySheet s={s} update={update} plan={plan} date={date} onClose={() => setSheet(null)} conflIds={conflIds} />}
      {sheet === 'reduce' && <ReduceSheet s={s} update={update} plan={plan} date={date} onClose={() => setSheet(null)} toast={toast} />}
      {sheet === 'break' && kaplanEarly && <BreakSheet s={s} update={update} date={date} blk={kaplanEarly} onClose={() => setSheet(null)} toast={toast} />}
    </>
  );
}

function AlarmRow({ a, past, update, nowMin, isToday }: { a: ReturnType<typeof alarmsForDay>[number]; past: boolean; update: Update; nowMin: number; isToday: boolean }) {
  const [edit, setEdit] = useState(false);
  const [time, setTime] = useState(a.time);
  return (
    <div className={`alarm ${a.dismissed ? 'off' : ''}`}>
      <span className="t">{a.time}</span>
      <div className="grow">
        <div className="small" style={{ fontWeight: 600 }}>{a.title}</div>
        <div className="tiny muted">
          {ALARM_LABEL[a.kind]}
          {a.snoozed && ' · pospuesta'}
          {a.rescheduled && ` · reprogramada (era ${a.baseTime})`}
          {a.fired && ' · sonó'}
          {past && !a.fired && !a.dismissed && ' · pasada'}
        </div>
        {edit && (
          <div className="row" style={{ marginTop: 6 }}>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <button className="btn sm primary" onClick={() => { update(rescheduleAlarm(a.id, time)); setEdit(false); }}>Guardar</button>
          </div>
        )}
      </div>
      {a.dismissed || a.snoozed || a.rescheduled ? (
        <button className="btn sm" onClick={() => update(resetAlarm(a.id))}>Restaurar</button>
      ) : (
        <div className="row">
          {isToday && <button className="btn sm" title="Posponer 10 min" onClick={() => update(snoozeAlarm(a.id, 10, Math.max(nowMin, toMin(a.time))))}>+10′</button>}
          <button className="btn sm" title="Reprogramar" onClick={() => setEdit((v) => !v)}>⏰</button>
          <button className="btn sm" title="Descartar" onClick={() => update(dismissAlarm(a.id))}>✕</button>
        </div>
      )}
    </div>
  );
}

function futurePending(s: AppState, plan: Plan, from: ISODate) {
  const start = from < plan.today ? plan.today : addDays(from, 1);
  return rangeDates(start, s.settings.newDeadline).filter((d) => d !== from && getLog(s, d).status === 'pending' && inNewPhase(s, d));
}

function DaySelect({ s, plan, value, onChange, options }: { s: AppState; plan: Plan; value: ISODate; onChange: (d: ISODate) => void; options: ISODate[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((d) => (
        <option key={d} value={d}>
          {fmtLong(d)} · {TYPE_LABEL[dayType(s, d)]} · meta {plan.target(d)}
        </option>
      ))}
    </select>
  );
}

function CompleteSheet({ s, update, plan, date, onClose, toast }: { s: AppState; update: Update; plan: Plan; date: ISODate; onClose: () => void; toast: (m: string) => void }) {
  const log = getLog(s, date);
  const target = plan.target(date);
  const done = log.newDone;
  const deficit = done == null ? 0 : Math.max(0, target - done);
  const options = futurePending(s, plan, date);
  const [to, setTo] = useState<ISODate>(suggestTargetDay(s, date, plan.today) ?? options[0] ?? '');
  const missing = [
    !log.explanations && 'revisar las explicaciones',
    !log.loggedErrors && 'registrar incorrectas/dudosas',
    !log.exercise && 'ejercicio',
    !log.sleep && 'meta de sueño',
  ].filter(Boolean) as string[];

  if (log.status !== 'pending') {
    return (
      <Sheet title="Resumen del día" onClose={onClose}>
        <StatusChip status={log.status} />
        <p>Preguntas nuevas: <b>{done ?? '—'}</b> / {target} · repaso: {log.reviewDone}</p>
        {missing.length > 0 && <p className="small muted">Checklist sin marcar: {missing.join(', ')}.</p>}
        <button className="btn" onClick={() => { update(reopenDay(date)); toast('Día reabierto'); onClose(); }}>Reabrir día para editar</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Completar día" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>{fmtLong(date)}</p>
      {done == null ? (
        <div className="banner warn">✍️ <span>Primero ingresa el <b>número real</b> de preguntas nuevas realizadas (puede ser 0). La app no marca metas por ti.</span></div>
      ) : (
        <>
          <div className="stats">
            <div className="stat"><b>{done}</b><span>nuevas</span></div>
            <div className="stat"><b>{target}</b><span>meta</span></div>
            <div className="stat"><b>{log.reviewDone}</b><span>repaso</span></div>
          </div>
          {missing.length > 0 && (
            <div className="banner warn">☑️ <span>Pendiente en el checklist: <b>{missing.join(', ')}</b>. Puedes marcarlo antes de cerrar.</span></div>
          )}
          {deficit === 0 ? (
            <button className="big-complete done" onClick={() => { update(closeDay(date, 'completed', target)); toast('¡Día completado!'); onClose(); }}>
              ✓ Marcar como completado
            </button>
          ) : (
            <>
              <div className="banner bad">Faltan <b>{deficit}</b> preguntas para la meta, así que el día no puede marcarse como completado.</div>
              <h3 style={{ margin: 0 }}>Reprogramar las {deficit} preguntas a:</h3>
              {options.length ? (
                <>
                  <DaySelect s={s} plan={plan} value={to} onChange={setTo} options={options} />
                  <button
                    className="btn primary"
                    disabled={!to}
                    onClick={() => {
                      update((st) => closeDay(date, 'rescheduled', done)(addMove(date, to, deficit, 'deficit')(st)));
                      toast(`${deficit} preguntas movidas al ${fmtShort(to)}`);
                      onClose();
                    }}
                  >
                    ↪ Reprogramar y cerrar el día
                  </button>
                </>
              ) : (
                <p className="small muted">No quedan días pendientes antes de la fecha límite.</p>
              )}
              <button className="btn danger" onClick={() => { update(closeDay(date, 'incomplete', target)); toast('Día marcado como incompleto'); onClose(); }}>
                Marcar como incompleto (sin reprogramar)
              </button>
              <p className="tiny muted" style={{ margin: 0 }}>Si no reprogramas, la diferencia se reparte automáticamente entre los días «sin definir» futuros.</p>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function EditDaySheet({ s, update, plan, date, onClose, conflIds }: { s: AppState; update: Update; plan: Plan; date: ISODate; onClose: () => void; conflIds: Set<string> }) {
  const p = s.days[date] ?? {};
  const type = dayType(s, date);
  const blocks = dayBlocks(s, date);
  const custom = !!p.blocksOverride;
  const live = conflicts(s, date);
  return (
    <Sheet title={`Editar ${fmtShort(date)}`} onClose={onClose}>
      <label className="field">
        <span>Tipo de día</span>
        <select value={type} onChange={(e) => update(setDay(date, { type: e.target.value as DayType }))}>
          {DAY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Cuota de preguntas nuevas (vacío = según el tipo: {baseQuota({ ...s, days: { ...s.days, [date]: { ...p, quotaOverride: null } } }, date, plan.auto)})</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={p.quotaOverride ?? ''}
          onChange={(e) => update(setDay(date, { quotaOverride: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) }))}
        />
      </label>
      <div className="row between">
        <h3 style={{ margin: 0 }}>Bloques del día {custom ? '(personalizados)' : '(rutina del tipo)'}</h3>
        {custom && <button className="btn sm" onClick={() => update(setDay(date, { blocksOverride: null }))}>Usar rutina</button>}
      </div>
      {live.length > 0 && <div className="banner bad"><ul style={{ margin: 0, paddingLeft: 18 }}>{live.map((c, i) => <li key={i}>{c.message}</li>)}</ul></div>}
      <BlockEditor blocks={blocks} conflictIds={conflIds} onChange={(b: Block[]) => update(setDay(date, { blocksOverride: b }))} />
      <p className="tiny muted" style={{ margin: 0 }}>Los cambios aquí solo afectan a este día. Para cambiar todos los días de un tipo, edita la rutina en Ajustes.</p>
      <button className="btn primary" onClick={onClose}>Listo</button>
    </Sheet>
  );
}

function ReduceSheet({ s, update, plan, date, onClose, toast }: { s: AppState; update: Update; plan: Plan; date: ISODate; onClose: () => void; toast: (m: string) => void }) {
  const target = plan.target(date);
  const [qty, setQty] = useState(Math.min(5, target));
  const options = futurePending(s, plan, date);
  const [to, setTo] = useState<ISODate>(suggestTargetDay(s, date, plan.today) ?? options[0] ?? '');
  return (
    <Sheet title="Reducir y reprogramar" onClose={onClose}>
      <p className="small" style={{ margin: 0 }}>Meta actual del día: <b>{target}</b>. ¿Cuántas preguntas quieres mover?</p>
      <input type="number" inputMode="numeric" min={1} max={target} value={qty} onChange={(e) => setQty(Math.max(0, Math.min(target, parseInt(e.target.value, 10) || 0)))} />
      <label className="field"><span>Mover a</span><DaySelect s={s} plan={plan} value={to} onChange={setTo} options={options} /></label>
      <button
        className="btn primary"
        disabled={!to || qty <= 0}
        onClick={() => {
          update(addMove(date, to, qty, 'reducción turno 12 h'));
          toast(`Meta reducida a ${target - qty}; ${qty} al ${fmtShort(to)}`);
          onClose();
        }}
      >
        Reducir a {target - qty} y mover {qty}
      </button>
    </Sheet>
  );
}

function BreakSheet({ s, update, date, blk, onClose, toast }: { s: AppState; update: Update; date: ISODate; blk: Block; onClose: () => void; toast: (m: string) => void }) {
  const [start, setStart] = useState('12:30');
  const [end, setEnd] = useState('13:15');
  const [all, setAll] = useState(false);
  const apply = () => {
    const moved = { ...blk, label: 'Kaplan en descanso del turno', start, end, duringShift: true };
    if (all) {
      update((st) => ({
        ...st,
        routines: { ...st.routines, shift12: { blocks: st.routines.shift12.blocks.map((b) => (b.id === blk.id ? moved : b)) } },
      }));
    } else {
      update(setDay(date, { blocksOverride: dayBlocks(s, date).map((b) => (b.id === blk.id ? moved : b)) }));
    }
    toast('Bloque Kaplan movido al descanso');
    onClose();
  };
  return (
    <Sheet title="Mover a un descanso del turno" onClose={onClose}>
      <div className="grid2">
        <label className="field"><span>Inicio</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="field"><span>Fin</span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Aplicar a todos los turnos de 12 h (cambia la rutina)</span></label>
      <p className="tiny muted" style={{ margin: 0 }}>El bloque queda marcado «durante el turno», así que no se avisa de superposición con el trabajo. Revisa que el descanso sea realista.</p>
      <button className="btn primary" onClick={apply}>Mover bloque</button>
    </Sheet>
  );
}
