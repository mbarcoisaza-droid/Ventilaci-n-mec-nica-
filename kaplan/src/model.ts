/** Modelo de datos, valores iniciales y migraciones. Todo editable por el usuario. */
import { ISODate, rangeDates } from './dates';

export type DayType = 'shift12' | 'shift6' | 'weekend' | 'free' | 'unset' | 'review' | 'exam';

export const DAY_TYPES: DayType[] = ['shift12', 'shift6', 'weekend', 'free', 'unset', 'review', 'exam'];

export const TYPE_LABEL: Record<DayType, string> = {
  shift12: 'Turno 12 h',
  shift6: 'Turno 6 h',
  weekend: 'Fin de semana',
  free: 'Día libre',
  unset: 'Sin definir',
  review: 'Repaso final',
  exam: 'Examen',
};

export const TYPE_SHORT: Record<DayType, string> = {
  shift12: '12h', shift6: '6h', weekend: 'FDS', free: 'Libre', unset: '—', review: 'Rep', exam: 'EXAMEN',
};

export type BlockKind = 'kaplan' | 'work' | 'gym' | 'other';

export interface Block {
  id: string;
  kind: BlockKind;
  label: string;
  start: string; // HH:MM
  end: string;
  /** meta de preguntas del bloque (solo Kaplan, orientativa) */
  questions?: string;
  /** bloque dentro de un descanso del turno: no cuenta como superposición con el trabajo */
  duringShift?: boolean;
}

export interface Routine {
  blocks: Block[];
}

export interface DayPlan {
  type?: DayType; // si falta: 'unset' (o review/exam según fechas)
  quotaOverride?: number | null;
  blocksOverride?: Block[] | null;
  note?: string;
}

export type DayStatus = 'pending' | 'completed' | 'incomplete' | 'rescheduled';

export interface DayLog {
  newDone: number | null; // preguntas NUEVAS realizadas (cuentan para las 3.000)
  reviewDone: number; // preguntas de repaso (no suman al total)
  explanations: boolean;
  loggedErrors: boolean;
  exercise: boolean;
  sleep: boolean;
  status: DayStatus;
  /** meta del día congelada al cerrarlo */
  frozenTarget?: number;
  closedAt?: string;
}

export interface Move {
  id: string;
  from: ISODate;
  to: ISODate;
  qty: number;
  reason: string;
}

export interface ReviewItem {
  id: string;
  date: ISODate;
  topic: string;
  kind: 'incorrect' | 'doubt';
  ref: string; // nº o identificador de la pregunta
  note: string;
  resolved: boolean;
}

export interface Milestone {
  id: string;
  date: ISODate;
  label: string;
  /** preguntas nuevas acumuladas esperadas a esa fecha (opcional) */
  cumulative?: number | null;
}

export interface AlarmConfig {
  kaplan: { enabled: boolean; lead: number };
  gym: { enabled: boolean; lead: number };
  sleepPrep: { enabled: boolean; lead: number }; // minutos antes de acostarse
  endOfDay: { enabled: boolean; time: string };
  weekly: { enabled: boolean; time: string };
  milestone: { enabled: boolean; daysBefore: number; time: string };
  sound: boolean;
}

export interface AlarmState {
  dismissed?: boolean;
  firedAt?: string;
  snoozeUntil?: string; // HH:MM del mismo día
  rescheduled?: string; // HH:MM
}

export interface Settings {
  startDate: ISODate;
  newDeadline: ISODate;
  reviewStart: ISODate;
  reviewEnd: ISODate;
  examDate: ISODate;
  totalQuestions: number;
  weeklyTarget: number;
  quotas: Record<'shift12' | 'shift6' | 'weekend' | 'free', number>;
  /** cuota de días sin definir: null = automática para llegar a la meta */
  unsetQuota: number | null;
  sleep: { bed: string; wake: string; minHours: number; maxHours: number };
  commuteWork: number;
  commuteGym: number;
  gymMinutes: number;
}

export interface AppState {
  version: 1;
  settings: Settings;
  routines: Record<DayType, Routine>;
  days: Record<ISODate, DayPlan>;
  logs: Record<ISODate, DayLog>;
  moves: Move[];
  review: ReviewItem[];
  milestones: Milestone[];
  alarms: AlarmConfig;
  alarmState: Record<string, AlarmState>;
  updatedAt: string;
}

let seq = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const b = (kind: BlockKind, label: string, start: string, end: string, questions?: string): Block => ({
  id: uid('b'), kind, label, start, end, ...(questions ? { questions } : {}),
});

export function defaultRoutines(): Record<DayType, Routine> {
  return {
    free: {
      blocks: [
        b('kaplan', 'Kaplan · bloque 1', '09:00', '11:00', '20–25'),
        b('kaplan', 'Kaplan · bloque 2', '14:30', '16:30', '20–25'),
        b('gym', 'Gimnasio (incluye traslados)', '17:00', '18:20'),
      ],
    },
    shift6: {
      blocks: [
        b('work', 'Turno 6 h (regreso ≈ 13:10)', '07:00', '13:00'),
        b('kaplan', 'Kaplan', '14:30', '16:30', '25'),
        b('gym', 'Gimnasio (incluye traslados)', '17:00', '18:20'),
      ],
    },
    weekend: {
      blocks: [
        b('work', 'Turno fin de semana', '07:00', '13:00'),
        b('kaplan', 'Kaplan', '14:30', '16:30', '25'),
        b('gym', 'Gimnasio (incluye traslados)', '17:00', '18:20'),
      ],
    },
    shift12: {
      blocks: [
        b('kaplan', 'Kaplan madrugada', '05:40', '06:25', '10'),
        b('work', 'Turno 12 h', '07:00', '19:00'),
        b('gym', 'Gimnasio (incluye traslados)', '19:20', '20:40'),
      ],
    },
    unset: {
      blocks: [
        b('kaplan', 'Kaplan · bloque 1', '09:00', '11:00'),
        b('kaplan', 'Kaplan · bloque 2', '14:30', '16:30'),
        b('gym', 'Gimnasio (incluye traslados)', '17:00', '18:20'),
      ],
    },
    review: {
      blocks: [
        b('kaplan', 'Repaso: incorrectas y dudosas', '09:00', '11:00'),
        b('kaplan', 'Repaso: temas débiles', '14:30', '16:30'),
        b('gym', 'Gimnasio (incluye traslados)', '17:00', '18:20'),
      ],
    },
    exam: { blocks: [b('other', 'Examen de residencia', '07:00', '13:00')] },
  };
}

/** Turnos de noviembre de 2026 proporcionados por el usuario. */
export const NOVEMBER_2026: Record<'shift12' | 'shift6' | 'weekend' | 'free', number[]> = {
  shift12: [5, 6, 10, 19, 20, 23, 27],
  shift6: [9, 24, 25, 26],
  weekend: [7, 8, 14, 15, 21, 22],
  free: [3, 4, 11, 12, 13, 16, 17, 18, 28, 29, 30],
};

export function defaultSettings(): Settings {
  return {
    startDate: '2026-11-03',
    newDeadline: '2027-02-14',
    reviewStart: '2027-02-15',
    reviewEnd: '2027-02-20',
    examDate: '2027-02-21',
    totalQuestions: 3000,
    weeklyTarget: 205,
    quotas: { shift12: 10, shift6: 25, weekend: 25, free: 45 },
    unsetQuota: null,
    sleep: { bed: '22:00', wake: '05:30', minHours: 7.5, maxHours: 8 },
    commuteWork: 10,
    commuteGym: 10,
    gymMinutes: 60,
  };
}

export function defaultMilestones(): Milestone[] {
  return [
    { id: uid('m'), date: '2026-11-30', label: 'Fin de noviembre (meta ≈ 815)', cumulative: 815 },
    { id: uid('m'), date: '2026-12-31', label: 'Fin de diciembre', cumulative: null },
    { id: uid('m'), date: '2027-01-31', label: 'Fin de enero', cumulative: null },
    { id: uid('m'), date: '2027-02-14', label: 'Fecha límite: 3.000 preguntas nuevas', cumulative: 3000 },
    { id: uid('m'), date: '2027-02-15', label: 'Inicio del repaso final', cumulative: null },
    { id: uid('m'), date: '2027-02-21', label: 'Examen de residencia', cumulative: null },
  ];
}

export function defaultAlarms(): AlarmConfig {
  return {
    kaplan: { enabled: true, lead: 0 },
    gym: { enabled: true, lead: 0 },
    sleepPrep: { enabled: true, lead: 30 },
    endOfDay: { enabled: true, time: '21:15' },
    weekly: { enabled: true, time: '20:00' },
    milestone: { enabled: true, daysBefore: 3, time: '08:00' },
    sound: true,
  };
}

export function defaultState(): AppState {
  const days: Record<ISODate, DayPlan> = {};
  (Object.keys(NOVEMBER_2026) as (keyof typeof NOVEMBER_2026)[]).forEach((t) =>
    NOVEMBER_2026[t].forEach((d) => {
      days[`2026-11-${String(d).padStart(2, '0')}`] = { type: t };
    }),
  );
  const s = defaultSettings();
  rangeDates(s.reviewStart, s.reviewEnd).forEach((d) => (days[d] = { type: 'review' }));
  days[s.examDate] = { type: 'exam' };
  return {
    version: 1,
    settings: s,
    routines: defaultRoutines(),
    days,
    logs: {},
    moves: [],
    review: [],
    milestones: defaultMilestones(),
    alarms: defaultAlarms(),
    alarmState: {},
    updatedAt: new Date().toISOString(),
  };
}

export function emptyLog(): DayLog {
  return { newDone: null, reviewDone: 0, explanations: false, loggedErrors: false, exercise: false, sleep: false, status: 'pending' };
}

/** Completa un estado importado o antiguo con los valores por defecto que falten. */
export function migrate(raw: unknown): AppState {
  const def = defaultState();
  if (!raw || typeof raw !== 'object') throw new Error('Archivo no válido');
  const r = raw as Partial<AppState>;
  if (!r.settings || !r.days) throw new Error('El archivo no contiene un plan Kaplan');
  const routines = { ...def.routines, ...(r.routines || {}) };
  return {
    version: 1,
    settings: {
      ...def.settings,
      ...r.settings,
      quotas: { ...def.settings.quotas, ...(r.settings.quotas || {}) },
      sleep: { ...def.settings.sleep, ...(r.settings.sleep || {}) },
    },
    routines,
    days: r.days,
    logs: Object.fromEntries(Object.entries(r.logs || {}).map(([k, v]) => [k, { ...emptyLog(), ...v }])),
    moves: Array.isArray(r.moves) ? r.moves : [],
    review: Array.isArray(r.review) ? r.review : [],
    milestones: Array.isArray(r.milestones) ? r.milestones : def.milestones,
    alarms: { ...def.alarms, ...(r.alarms || {}) },
    alarmState: r.alarmState || {},
    updatedAt: r.updatedAt || new Date().toISOString(),
  };
}
