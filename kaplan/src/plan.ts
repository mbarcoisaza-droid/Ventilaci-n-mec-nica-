/** Cálculos del plan: tipo de día, meta diaria, progreso, semanas, horarios y superposiciones. */
import { addDays, diffDays, fromMin, ISODate, rangeDates, toMin, weekStart } from './dates';
import { AppState, Block, DayLog, DayType, emptyLog } from './model';

export function dayType(s: AppState, d: ISODate): DayType {
  const t = s.days[d]?.type;
  if (t) return t;
  if (d === s.settings.examDate) return 'exam';
  if (d >= s.settings.reviewStart && d <= s.settings.reviewEnd) return 'review';
  return 'unset';
}

export const inPlan = (s: AppState, d: ISODate) => d >= s.settings.startDate && d <= s.settings.examDate;
/** Días en los que se asignan preguntas nuevas */
export const inNewPhase = (s: AppState, d: ISODate) => d >= s.settings.startDate && d <= s.settings.newDeadline;

export const getLog = (s: AppState, d: ISODate): DayLog => s.logs[d] ?? emptyLog();

export function movesIn(s: AppState, d: ISODate) {
  return s.moves.filter((m) => m.to === d).reduce((a, m) => a + m.qty, 0);
}
export function movesOut(s: AppState, d: ISODate) {
  return s.moves.filter((m) => m.from === d).reduce((a, m) => a + m.qty, 0);
}

function isAutoDay(s: AppState, d: ISODate) {
  const p = s.days[d];
  return inNewPhase(s, d) && dayType(s, d) === 'unset' && (p?.quotaOverride == null) && s.settings.unsetQuota == null;
}

/** Cuota base del día (sin traslados). auto = cuota automática de días sin definir. */
export function baseQuota(s: AppState, d: ISODate, auto: number): number {
  const p = s.days[d];
  if (p?.quotaOverride != null) return p.quotaOverride;
  if (!inNewPhase(s, d)) return 0;
  const t = dayType(s, d);
  if (t === 'shift12' || t === 'shift6' || t === 'weekend' || t === 'free') return s.settings.quotas[t];
  if (t === 'unset') return s.settings.unsetQuota ?? auto;
  return 0;
}

export interface Plan {
  today: ISODate;
  auto: number;
  autoDays: number;
  target: (d: ISODate) => number;
  totalNew: number;
  totalReview: number;
  remaining: number;
  pct: number;
  projection: number;
  plannedTotal: number;
  expectedByToday: number;
  daysLeftNew: number;
}

function rawTarget(s: AppState, d: ISODate, auto: number) {
  const log = s.logs[d];
  if (log && log.status !== 'pending' && log.frozenTarget != null) return log.frozenTarget;
  return Math.max(0, baseQuota(s, d, auto) + movesIn(s, d) - movesOut(s, d));
}

export function computePlan(s: AppState, today: ISODate): Plan {
  const st = s.settings;
  const phase = rangeDates(st.startDate, st.newDeadline);
  const newDoneOf = (d: ISODate) => s.logs[d]?.newDone ?? 0;

  // 1) cuota automática para días «sin definir» desde hoy hasta la fecha límite
  const autoDays = phase.filter((d) => d >= today && isAutoDay(s, d) && getLog(s, d).status === 'pending');
  let covered = 0;
  for (const d of phase) {
    if (d < today) covered += newDoneOf(d);
    else if (!autoDays.includes(d)) covered += Math.max(newDoneOf(d), rawTarget(s, d, 0));
    else covered += movesIn(s, d) - movesOut(s, d);
  }
  // preguntas nuevas registradas fuera de la fase (p. ej. durante el repaso) también cuentan
  const outside = Object.entries(s.logs).filter(([d]) => !inNewPhase(s, d)).reduce((a, [, l]) => a + (l.newDone ?? 0), 0);
  covered += outside;
  const remainingToPlan = Math.max(0, st.totalQuestions - covered);
  const auto = autoDays.length ? Math.ceil(remainingToPlan / autoDays.length) : 0;

  const cache = new Map<ISODate, number>();
  const target = (d: ISODate) => {
    let v = cache.get(d);
    if (v === undefined) {
      v = rawTarget(s, d, auto);
      cache.set(d, v);
    }
    return v;
  };

  const totalNew = Object.values(s.logs).reduce((a, l) => a + (l.newDone ?? 0), 0);
  const totalReview = Object.values(s.logs).reduce((a, l) => a + (l.reviewDone ?? 0), 0);
  let projection = outside;
  let plannedTotal = 0;
  let expectedByToday = 0;
  for (const d of phase) {
    plannedTotal += target(d);
    if (d < today) {
      projection += newDoneOf(d);
      expectedByToday += target(d);
    } else projection += Math.max(newDoneOf(d), target(d));
  }
  return {
    today,
    auto,
    autoDays: autoDays.length,
    target,
    totalNew,
    totalReview,
    remaining: Math.max(0, st.totalQuestions - totalNew),
    pct: Math.min(100, (totalNew / st.totalQuestions) * 100),
    projection,
    plannedTotal,
    expectedByToday,
    daysLeftNew: Math.max(0, diffDays(today, st.newDeadline) + 1),
  };
}

/** ¿Se cumplió la meta de preguntas nuevas? Solo con el número real ingresado. */
export function goalMet(s: AppState, plan: Plan, d: ISODate): boolean {
  const l = s.logs[d];
  if (!l || l.newDone == null) return false;
  return l.newDone >= plan.target(d);
}

export interface WeekSummary {
  start: ISODate;
  end: ISODate;
  days: ISODate[];
  phaseDays: number;
  weeklyRef: number; // 205 prorrateado según días de la fase
  planTarget: number;
  done: number;
  review: number;
  goalsMet: number;
  completed: number;
  incomplete: number;
  rescheduled: number;
  pending: number;
  exercise: number;
  sleep: number;
  expectedSoFar: number; // suma de metas de días ya transcurridos
  refSoFar: number; // 205 prorrateado hasta ayer
  behind: boolean;
}

export function weekSummary(s: AppState, plan: Plan, anyDay: ISODate): WeekSummary {
  const start = weekStart(anyDay);
  const days = rangeDates(start, addDays(start, 6));
  const phaseDays = days.filter((d) => inNewPhase(s, d));
  const r: WeekSummary = {
    start, end: days[6], days, phaseDays: phaseDays.length,
    weeklyRef: Math.round((s.settings.weeklyTarget * phaseDays.length) / 7),
    planTarget: 0, done: 0, review: 0, goalsMet: 0, completed: 0, incomplete: 0, rescheduled: 0, pending: 0,
    exercise: 0, sleep: 0, expectedSoFar: 0, refSoFar: 0, behind: false,
  };
  for (const d of days) {
    const l = getLog(s, d);
    r.done += l.newDone ?? 0;
    r.review += l.reviewDone ?? 0;
    if (!inPlan(s, d)) continue;
    if (l.exercise) r.exercise++;
    if (l.sleep) r.sleep++;
    if (l.status === 'completed') r.completed++;
    else if (l.status === 'incomplete') r.incomplete++;
    else if (l.status === 'rescheduled') r.rescheduled++;
    else if (d <= plan.today) r.pending++;
    if (inNewPhase(s, d)) {
      const t = plan.target(d);
      r.planTarget += t;
      if (goalMet(s, plan, d) && t > 0) r.goalsMet++;
      if (d < plan.today) {
        r.expectedSoFar += t;
        r.refSoFar += s.settings.weeklyTarget / 7;
      }
    }
  }
  r.refSoFar = Math.round(r.refSoFar);
  r.behind = r.phaseDays > 0 && (r.done < r.expectedSoFar || r.done < r.refSoFar);
  return r;
}

// ---------- horario del día ----------

export interface TimelineItem {
  id: string;
  kind: Block['kind'] | 'commute' | 'sleep' | 'sleepPrep';
  label: string;
  start: number; // minutos desde 00:00
  end: number;
  questions?: string;
  derived?: boolean;
  duringShift?: boolean;
}

export function dayBlocks(s: AppState, d: ISODate): Block[] {
  return s.days[d]?.blocksOverride ?? s.routines[dayType(s, d)].blocks;
}

export function timeline(s: AppState, d: ISODate): TimelineItem[] {
  const st = s.settings;
  const items: TimelineItem[] = [];
  const wake = toMin(st.sleep.wake);
  const bed = toMin(st.sleep.bed);
  items.push({ id: 'wake', kind: 'sleep', label: `Despertar (fin del sueño)`, start: wake, end: wake, derived: true });
  for (const blk of dayBlocks(s, d)) {
    const start = toMin(blk.start);
    const end = toMin(blk.end);
    if (blk.kind === 'work' && st.commuteWork > 0) {
      items.push({ id: blk.id + '_ci', kind: 'commute', label: 'Traslado al trabajo', start: start - st.commuteWork, end: start, derived: true });
      items.push({ id: blk.id + '_co', kind: 'commute', label: 'Regreso a casa', start: end, end: end + st.commuteWork, derived: true });
    }
    items.push({ id: blk.id, kind: blk.kind, label: blk.label, start, end, questions: blk.questions, duringShift: blk.duringShift });
  }
  if (s.alarms.sleepPrep.enabled) {
    items.push({ id: 'prep', kind: 'sleepPrep', label: 'Rutina para dormir', start: bed - s.alarms.sleepPrep.lead, end: bed, derived: true });
  }
  items.push({ id: 'bed', kind: 'sleep', label: 'Dormir', start: bed, end: bed, derived: true });
  return items.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function sleepHours(s: AppState) {
  const m = (toMin(s.settings.sleep.wake) - toMin(s.settings.sleep.bed) + 1440) % 1440;
  return m / 60;
}

export interface Conflict {
  ids: string[];
  message: string;
}

/** Detecta superposiciones entre bloques, traslados y la ventana de sueño. */
export function conflicts(s: AppState, d: ISODate): Conflict[] {
  const st = s.settings;
  const out: Conflict[] = [];
  const items = timeline(s, d).filter((i) => i.kind !== 'sleep' && i.kind !== 'sleepPrep');
  const fmt = (i: TimelineItem) => `«${i.label}» (${fromMin(i.start)}–${fromMin(i.end)})`;
  for (const i of items) {
    if (i.end <= i.start && !i.derived) out.push({ ids: [i.id], message: `${fmt(i)}: la hora de fin debe ser posterior al inicio.` });
  }
  for (let a = 0; a < items.length; a++) {
    for (let b2 = a + 1; b2 < items.length; b2++) {
      const x = items[a];
      const y = items[b2];
      const breakOk = (x.duringShift && y.kind === 'work') || (y.duringShift && x.kind === 'work');
      if (x.start < y.end && y.start < x.end && !breakOk) {
        out.push({ ids: [x.id, y.id], message: `${fmt(x)} se superpone con ${fmt(y)}.` });
      }
    }
  }
  const bed = toMin(st.sleep.bed);
  const wake = toMin(st.sleep.wake);
  for (const i of items) {
    const crossesNight = bed > wake;
    const hit = crossesNight ? i.start < wake || i.end > bed : i.start < wake && i.end > bed;
    if (hit) out.push({ ids: [i.id], message: `${fmt(i)} invade el horario de sueño (${st.sleep.bed}–${st.sleep.wake}).` });
  }
  const h = sleepHours(s);
  if (h < st.sleep.minHours) {
    out.push({ ids: [], message: `El horario de sueño da ${h.toFixed(1).replace('.', ',')} h; la meta es ${String(st.sleep.minHours).replace('.', ',')}–${String(st.sleep.maxHours).replace('.', ',')} h.` });
  }
  const need = st.gymMinutes + 2 * st.commuteGym;
  for (const blk of dayBlocks(s, d)) {
    if (blk.kind === 'gym' && toMin(blk.end) - toMin(blk.start) < need) {
      out.push({ ids: [blk.id], message: `«${blk.label}» dura menos de ${need} min (${st.gymMinutes} min de ejercicio + 2 × ${st.commuteGym} min de traslado).` });
    }
  }
  return out;
}

/** Próximo día pendiente (desde «desde» excluido) adecuado para recibir preguntas reprogramadas. */
export function suggestTargetDay(s: AppState, from: ISODate, today: ISODate): ISODate | null {
  let d = addDays(from < today ? today : from, from < today ? 0 : 1);
  if (d === from) d = addDays(d, 1);
  const pref: DayType[] = ['free', 'unset', 'weekend', 'shift6'];
  for (const want of pref) {
    for (let x = d; x <= s.settings.newDeadline; x = addDays(x, 1)) {
      if (dayType(s, x) === want && getLog(s, x).status === 'pending') return x;
    }
  }
  return null;
}
