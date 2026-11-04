import { useRef, useState } from 'react';
import { buildICS } from '../alarms';
import { addDays, DOW_SHORT, fmtShort, ISODate, rangeDates, weekdayMon } from '../dates';
import { download, shareOrDownload, exportDaysCSV, exportJSON, exportReviewCSV, importCSV, importJSON } from '../io';
import { AppState, DAY_TYPES, DayType, defaultState, Settings, TYPE_LABEL, uid } from '../model';
import { isIOS, isStandalone, notifPermission, requestNotif, showNotif, beep } from '../notify';
import { conflicts, getLog, Plan, sleepHours } from '../plan';
import { BlockEditor, TypeChip } from '../ui';

type Update = (fn: (s: AppState) => AppState) => void;

interface Props {
  s: AppState;
  update: Update;
  replace: (s: AppState) => void;
  plan: Plan;
  toast: (m: string) => void;
  section?: string;
}

const intIn = (v: string, min = 0) => Math.max(min, parseInt(v, 10) || 0);

export default function SettingsView({ s, update, replace, plan, toast, section }: Props) {
  const st = s.settings;
  const setS = (p: Partial<Settings>) => update((x) => ({ ...x, settings: { ...x.settings, ...p } }));
  return (
    <>
      <PlanSection s={s} setS={setS} plan={plan} />
      <BulkSection s={s} update={update} toast={toast} />
      <details className="card">
        <summary>Cuotas por tipo de día</summary>
        <div className="grid2">
          {(['shift12', 'shift6', 'weekend', 'free'] as const).map((t) => (
            <label key={t} className="field">
              <span><TypeChip type={t} /></span>
              <input type="number" inputMode="numeric" min={0} value={st.quotas[t]} onChange={(e) => setS({ quotas: { ...st.quotas, [t]: intIn(e.target.value) } })} />
            </label>
          ))}
          <label className="field">
            <span><TypeChip type="unset" /></span>
            <select value={st.unsetQuota == null ? 'auto' : 'fixed'} onChange={(e) => setS({ unsetQuota: e.target.value === 'auto' ? null : plan.auto || 30 })}>
              <option value="auto">Automática ({plan.auto})</option>
              <option value="fixed">Fija</option>
            </select>
          </label>
          {st.unsetQuota != null && (
            <label className="field">
              <span>Cuota fija sin definir</span>
              <input type="number" inputMode="numeric" min={0} value={st.unsetQuota} onChange={(e) => setS({ unsetQuota: intIn(e.target.value) })} />
            </label>
          )}
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Los días ya cerrados conservan su meta. Cambiar cuotas no borra el progreso. La cuota automática reparte lo que falta para {st.totalQuestions.toLocaleString('es-CO')} entre los días «sin definir» pendientes.
        </p>
      </details>

      <SleepSection s={s} setS={setS} />
      <RoutineSection s={s} update={update} />
      <AlarmSection s={s} update={update} toast={toast} plan={plan} open={section === 'alarms'} />
      <MilestoneSection s={s} update={update} />
      <DataSection s={s} replace={replace} plan={plan} toast={toast} />
      <p className="tiny muted" style={{ textAlign: 'center' }}>Los datos se guardan solo en este dispositivo (almacenamiento local del navegador). Exporta una copia con regularidad.</p>
    </>
  );
}

function PlanSection({ s, setS, plan }: { s: AppState; setS: (p: Partial<Settings>) => void; plan: Plan }) {
  const st = s.settings;
  const date = (k: keyof Settings, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="date" value={st[k] as string} onChange={(e) => e.target.value && setS({ [k]: e.target.value } as Partial<Settings>)} />
    </label>
  );
  return (
    <details className="card">
      <summary>Plan y fechas</summary>
      <div className="grid2">
        {date('startDate', 'Inicio del plan')}
        {date('newDeadline', 'Límite preguntas nuevas')}
        {date('reviewStart', 'Inicio del repaso')}
        {date('reviewEnd', 'Fin del repaso')}
        {date('examDate', 'Examen')}
        <label className="field"><span>Total de preguntas</span><input type="number" inputMode="numeric" value={st.totalQuestions} onChange={(e) => setS({ totalQuestions: intIn(e.target.value, 1) })} /></label>
        <label className="field"><span>Meta semanal de referencia</span><input type="number" inputMode="numeric" value={st.weeklyTarget} onChange={(e) => setS({ weeklyTarget: intIn(e.target.value) })} /></label>
      </div>
      <p className="small" style={{ marginBottom: 0 }}>
        Plan actual: <b>{plan.plannedTotal.toLocaleString('es-CO')}</b> preguntas nuevas asignadas hasta el {fmtShort(st.newDeadline)}
        {plan.projection < st.totalQuestions ? <span style={{ color: 'var(--bad)' }}> · proyección {plan.projection.toLocaleString('es-CO')}: no alcanza</span> : ' ✓'}
      </p>
    </details>
  );
}

function BulkSection({ s, update, toast }: { s: AppState; update: Update; toast: (m: string) => void }) {
  const [from, setFrom] = useState<ISODate>('2026-12-01');
  const [to, setTo] = useState<ISODate>('2026-12-31');
  const [type, setType] = useState<DayType>('free');
  const [dows, setDows] = useState<boolean[]>([true, true, true, true, true, true, true]);
  const apply = () => {
    if (!from || !to || from > to) return toast('Revisa el rango de fechas');
    const days = rangeDates(from, to).filter((d) => dows[weekdayMon(d)] && getLog(s, d).status === 'pending');
    update((x) => {
      const nd = { ...x.days };
      days.forEach((d) => (nd[d] = { ...nd[d], type }));
      return { ...x, days: nd };
    });
    toast(`${days.length} días marcados como «${TYPE_LABEL[type]}»`);
  };
  return (
    <details className="card">
      <summary>Asignar turnos por rango</summary>
      <p className="small muted" style={{ marginTop: 0 }}>Útil cuando recibas el cuadro de turnos de cada mes. También puedes «pintar» días en la vista Mes. Los días ya cerrados no se modifican.</p>
      <div className="grid2">
        <label className="field"><span>Desde</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>Hasta</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <label className="field" style={{ marginTop: 8 }}>
        <span>Tipo</span>
        <select value={type} onChange={(e) => setType(e.target.value as DayType)}>{DAY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
      </label>
      <div className="row wrap" style={{ marginTop: 8, gap: 4 }}>
        {DOW_SHORT.map((d, i) => (
          <button key={d} className={`btn sm ${dows[i] ? 'primary' : ''}`} style={{ width: 38 }} onClick={() => setDows(dows.map((v, j) => (j === i ? !v : v)))}>{d}</button>
        ))}
      </div>
      <button className="btn primary block" style={{ marginTop: 10 }} onClick={apply}>Aplicar</button>
    </details>
  );
}

function SleepSection({ s, setS }: { s: AppState; setS: (p: Partial<Settings>) => void }) {
  const st = s.settings;
  const h = sleepHours(s);
  return (
    <details className="card">
      <summary>Sueño, ejercicio y traslados</summary>
      <div className="grid2">
        <label className="field"><span>Acostarse</span><input type="time" value={st.sleep.bed} onChange={(e) => setS({ sleep: { ...st.sleep, bed: e.target.value } })} /></label>
        <label className="field"><span>Despertar</span><input type="time" value={st.sleep.wake} onChange={(e) => setS({ sleep: { ...st.sleep, wake: e.target.value } })} /></label>
        <label className="field"><span>Meta mínima (h)</span><input type="number" step="0.25" value={st.sleep.minHours} onChange={(e) => setS({ sleep: { ...st.sleep, minHours: parseFloat(e.target.value) || 0 } })} /></label>
        <label className="field"><span>Meta máxima (h)</span><input type="number" step="0.25" value={st.sleep.maxHours} onChange={(e) => setS({ sleep: { ...st.sleep, maxHours: parseFloat(e.target.value) || 0 } })} /></label>
        <label className="field"><span>Ejercicio (min)</span><input type="number" value={st.gymMinutes} onChange={(e) => setS({ gymMinutes: intIn(e.target.value) })} /></label>
        <label className="field"><span>Traslado gimnasio (min/sentido)</span><input type="number" value={st.commuteGym} onChange={(e) => setS({ commuteGym: intIn(e.target.value) })} /></label>
        <label className="field"><span>Traslado trabajo (min/sentido)</span><input type="number" value={st.commuteWork} onChange={(e) => setS({ commuteWork: intIn(e.target.value) })} /></label>
      </div>
      <div className={`banner ${h >= st.sleep.minHours ? 'ok' : 'bad'}`} style={{ marginTop: 10 }}>
        🌙 Ventana de sueño: {h.toFixed(2).replace('.', ',')} h {h >= st.sleep.minHours ? '— cumple la meta' : `— por debajo de ${st.sleep.minHours} h`}
      </div>
    </details>
  );
}

function RoutineSection({ s, update }: { s: AppState; update: Update }) {
  const [type, setType] = useState<DayType>('free');
  const probe = '1999-01-01';
  const virt: AppState = { ...s, days: { ...s.days, [probe]: { type } } };
  const confl = conflicts(virt, probe);
  return (
    <details className="card">
      <summary>Rutinas por tipo de día</summary>
      <select value={type} onChange={(e) => setType(e.target.value as DayType)}>{DAY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
      {confl.length > 0 && (
        <div className="banner bad" style={{ marginTop: 8 }}><ul style={{ margin: 0, paddingLeft: 18 }}>{confl.map((c, i) => <li key={i}>{c.message}</li>)}</ul></div>
      )}
      <div style={{ marginTop: 8 }}>
        <BlockEditor
          blocks={s.routines[type].blocks}
          conflictIds={new Set(confl.flatMap((c) => c.ids))}
          onChange={(blocks) => update((x) => ({ ...x, routines: { ...x.routines, [type]: { blocks } } }))}
        />
      </div>
      <p className="tiny muted" style={{ marginBottom: 0 }}>Se aplica a todos los días de este tipo que no tengan bloques personalizados. El progreso registrado no cambia.</p>
    </details>
  );
}

function AlarmSection({ s, update, toast, plan, open }: { s: AppState; update: Update; toast: (m: string) => void; plan: Plan; open: boolean }) {
  const a = s.alarms;
  const [perm, setPerm] = useState(notifPermission());
  const [range, setRange] = useState(14);
  const set = (p: Partial<typeof a>) => update((x) => ({ ...x, alarms: { ...x.alarms, ...p } }));
  const ios = isIOS();
  const exportIcs = async () => {
    const from = plan.today < s.settings.startDate ? s.settings.startDate : plan.today;
    const to = range === 0 ? s.settings.examDate : addDays(from, range - 1);
    const { ics, count } = buildICS(s, from, to > s.settings.examDate ? s.settings.examDate : to);
    const r = await shareOrDownload(`plan-kaplan-${from}.ics`, ics, 'text/calendar');
    if (r === 'cancelled') return;
    toast(r === 'shared' ? `${count} eventos listos: elige Calendario o «Guardar en Archivos».` : `${count} eventos descargados: abre el archivo para añadirlos al calendario.`);
  };
  const lead = (k: 'kaplan' | 'gym' | 'sleepPrep', label: string, help: string) => (
    <div className="row between" style={{ padding: '6px 0' }}>
      <label className="row grow"><input type="checkbox" checked={a[k].enabled} onChange={(e) => set({ [k]: { ...a[k], enabled: e.target.checked } })} /> {label}</label>
      <label className="row small muted" style={{ gap: 4 }}>
        <input type="number" style={{ width: 64 }} min={0} value={a[k].lead} onChange={(e) => set({ [k]: { ...a[k], lead: intIn(e.target.value) } })} /> {help}
      </label>
    </div>
  );
  return (
    <details className="card" open={open}>
      <summary>Alarmas y recordatorios</summary>
      <div className="banner info" style={{ marginBottom: 10 }}>
        <div className="small">
          <b>Limitación importante:</b> una app web solo puede hacer sonar alarmas y mostrar notificaciones <b>mientras está abierta</b> (en pantalla o en segundo plano reciente). Si cierras la app, el navegador la suspende y <b>la alarma no sonará</b>.
          {ios && ' En iPhone las notificaciones web solo funcionan con la app añadida a la pantalla de inicio (iOS 16.4+), y aun así no se pueden programar con la app cerrada.'}
          {' '}Para avisos fiables, <b>exporta los recordatorios al calendario del teléfono</b> (.ics, con aviso incluido) o crea alarmas en el reloj del teléfono.
        </div>
      </div>
      <div className="row between wrap">
        <span className="small">Notificaciones: <b>{perm === 'granted' ? 'permitidas' : perm === 'denied' ? 'bloqueadas (actívalas en los ajustes del navegador)' : perm === 'unsupported' ? 'no compatibles en este navegador' : 'sin permiso'}</b></span>
        {perm !== 'granted' && perm !== 'unsupported' && perm !== 'denied' && (
          <button className="btn sm primary" onClick={async () => setPerm(await requestNotif())}>Permitir notificaciones</button>
        )}
      </div>
      {ios && !isStandalone() && <p className="tiny muted">En iPhone: Compartir → «Añadir a pantalla de inicio» y abre la app desde ahí para poder pedir permiso.</p>}
      <button className="btn sm" style={{ marginTop: 8 }} onClick={async () => { beep(); const ok = await showNotif('Prueba de alarma', 'Así se verán los recordatorios del plan Kaplan.', 'test'); toast(ok ? 'Notificación enviada' : 'Sonó la alarma interna (sin notificación del sistema)'); }}>
        Probar alarma
      </button>

      <h3>Qué avisar</h3>
      {lead('kaplan', 'Inicio de cada bloque Kaplan', 'min antes')}
      {lead('gym', 'Inicio del ejercicio', 'min antes')}
      {lead('sleepPrep', 'Rutina para dormir', 'min antes de acostarse')}
      <div className="row between" style={{ padding: '6px 0' }}>
        <label className="row grow"><input type="checkbox" checked={a.endOfDay.enabled} onChange={(e) => set({ endOfDay: { ...a.endOfDay, enabled: e.target.checked } })} /> Revisión de pendientes</label>
        <input type="time" style={{ width: 132 }} value={a.endOfDay.time} onChange={(e) => set({ endOfDay: { ...a.endOfDay, time: e.target.value } })} />
      </div>
      <div className="row between" style={{ padding: '6px 0' }}>
        <label className="row grow"><input type="checkbox" checked={a.weekly.enabled} onChange={(e) => set({ weekly: { ...a.weekly, enabled: e.target.checked } })} /> Aviso si voy por debajo de la meta semanal</label>
        <input type="time" style={{ width: 132 }} value={a.weekly.time} onChange={(e) => set({ weekly: { ...a.weekly, time: e.target.value } })} />
      </div>
      <div className="row between wrap" style={{ padding: '6px 0' }}>
        <label className="row grow"><input type="checkbox" checked={a.milestone.enabled} onChange={(e) => set({ milestone: { ...a.milestone, enabled: e.target.checked } })} /> Hitos próximos</label>
        <label className="row small muted" style={{ gap: 4 }}>
          <input type="number" style={{ width: 56 }} min={0} value={a.milestone.daysBefore} onChange={(e) => set({ milestone: { ...a.milestone, daysBefore: intIn(e.target.value) } })} /> días antes,
          <input type="time" style={{ width: 132 }} value={a.milestone.time} onChange={(e) => set({ milestone: { ...a.milestone, time: e.target.value } })} />
        </label>
      </div>
      <label className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={a.sound} onChange={(e) => set({ sound: e.target.checked })} /> Sonido y vibración en la app</label>
      <p className="tiny muted">Cada alarma se puede posponer, descartar o reprogramar desde la vista del día o cuando suena.</p>

      <h3>Exportar al calendario del teléfono</h3>
      <div className="row">
        <select value={range} onChange={(e) => setRange(parseInt(e.target.value, 10))} style={{ flex: 1 }}>
          <option value={7}>Próximos 7 días</option>
          <option value={14}>Próximos 14 días</option>
          <option value={31}>Próximos 31 días</option>
          <option value={0}>Hasta el examen</option>
        </select>
        <button className="btn primary" onClick={exportIcs}>Exportar .ics</button>
      </div>
      <div className="banner info small" style={{ marginTop: 8 }}>
        <div>
          <b>Cómo añadirlos al calendario</b>
          <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {ios ? (
              <>
                <li>Toca «Exportar .ics». Se abre el menú Compartir.</li>
                <li>Elige <b>Calendario</b> si aparece; si no, <b>«Guardar en Archivos»</b>.</li>
                <li>En la app <b>Archivos</b>, toca el archivo → <b>«Añadir todo»</b> → elige el calendario → <b>OK</b>.</li>
              </>
            ) : (
              <>
                <li>Toca «Exportar .ics». Elige <b>Google Calendar</b> en el menú o abre el archivo descargado.</li>
                <li>Confirma <b>«Importar»</b> y elige el calendario.</li>
                <li>Si no se abre: en el computador ve a calendar.google.com → ⚙️ Configuración → <b>Importar y exportar</b> → sube el archivo.</li>
              </>
            )}
          </ol>
          <p style={{ margin: '6px 0 0' }}>Comprueba que el calendario tenga activadas sus notificaciones en los ajustes del teléfono.</p>
        </div>
      </div>
      <p className="tiny muted" style={{ marginBottom: 0 }}>
        Incluye bloques Kaplan y de ejercicio con aviso, rutina para dormir, revisión de pendientes e hitos. El aviso de meta semanal depende de tu progreso real y solo funciona dentro de la app. Si cambias turnos o rutinas, vuelve a exportar (los eventos conservan su identificador, así que muchos calendarios los actualizan en lugar de duplicarlos).
      </p>
    </details>
  );
}

function MilestoneSection({ s, update }: { s: AppState; update: Update }) {
  const setM = (id: string, p: Partial<AppState['milestones'][number]>) =>
    update((x) => ({ ...x, milestones: x.milestones.map((m) => (m.id === id ? { ...m, ...p } : m)) }));
  return (
    <details className="card">
      <summary>Hitos</summary>
      <div className="stack">
        {[...s.milestones].sort((a, b) => a.date.localeCompare(b.date)).map((m) => (
          <div key={m.id} className="blockedit">
            <label className="field"><span>Fecha</span><input type="date" value={m.date} onChange={(e) => setM(m.id, { date: e.target.value })} /></label>
            <label className="field"><span>Acumulado esperado</span><input type="number" value={m.cumulative ?? ''} onChange={(e) => setM(m.id, { cumulative: e.target.value === '' ? null : intIn(e.target.value) })} /></label>
            <label className="field full"><span>Nombre</span><input type="text" value={m.label} onChange={(e) => setM(m.id, { label: e.target.value })} /></label>
            <div className="full row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn sm danger" onClick={() => update((x) => ({ ...x, milestones: x.milestones.filter((y) => y.id !== m.id) }))}>Eliminar</button>
            </div>
          </div>
        ))}
        <button className="btn" onClick={() => update((x) => ({ ...x, milestones: [...x.milestones, { id: uid('m'), date: x.settings.newDeadline, label: 'Nuevo hito', cumulative: null }] }))}>+ Añadir hito</button>
      </div>
    </details>
  );
}

function DataSection({ s, replace, plan, toast }: { s: AppState; replace: (s: AppState) => void; plan: Plan; toast: (m: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const stamp = plan.today;
  const onFile = async (f: File) => {
    const text = await f.text();
    try {
      if (/\.json$/i.test(f.name) || text.trim().startsWith('{')) {
        const next = importJSON(text);
        if (!confirm('¿Reemplazar todos los datos actuales por los del archivo? Se recomienda exportar antes una copia.')) return;
        replace(next);
        toast('Progreso restaurado desde JSON');
      } else {
        const { state, summary } = importCSV(s, text);
        if (!confirm(`${summary} ¿Aplicar? (se combinará con los datos actuales)`)) return;
        replace(state);
        toast(summary);
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <details className="card">
      <summary>Copia de seguridad y datos</summary>
      <div className="stack">
        <button className="btn" onClick={() => download(`plan-kaplan-${stamp}.json`, exportJSON(s), 'application/json')}>⬇︎ Exportar todo (JSON)</button>
        <button className="btn" onClick={() => download(`plan-kaplan-diario-${stamp}.csv`, exportDaysCSV(s, plan.today), 'text/csv;charset=utf-8')}>⬇︎ Exportar diario (CSV)</button>
        <button className="btn" onClick={() => download(`plan-kaplan-repaso-${stamp}.csv`, exportReviewCSV(s), 'text/csv;charset=utf-8')}>⬇︎ Exportar lista de repaso (CSV)</button>
        <button className="btn primary" onClick={() => file.current?.click()}>⬆︎ Restaurar desde JSON o CSV</button>
        <input ref={file} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <p className="tiny muted" style={{ margin: 0 }}>JSON restaura todo (plan, rutinas, alarmas, progreso y repaso). CSV restaura el diario o la lista de repaso exportados por esta app.</p>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('¿Borrar todo y volver al plan inicial? Esta acción no se puede deshacer.') && confirm('Confirma de nuevo: se perderá el progreso registrado.')) {
              replace(defaultState());
              toast('Plan reiniciado');
            }
          }}
        >
          Reiniciar plan
        </button>
        <p className="tiny muted" style={{ margin: 0 }}>Última modificación: {new Date(s.updatedAt).toLocaleString('es-CO')}</p>
      </div>
    </details>
  );
}
