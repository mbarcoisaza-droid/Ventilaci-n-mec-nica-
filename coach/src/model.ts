/** Modelo de datos de Mi Coach. Todo se guarda en el dispositivo (localStorage). */
import { addDays, todayISO, weekStart } from './dates';
import { LibEntry, libByKey } from './library';

export type BlockKind = 'calentamiento' | 'fuerza' | 'circuito' | 'cardio' | 'enfriamiento' | 'otro';
export const BLOCK_LABEL: Record<BlockKind, string> = {
  calentamiento: 'Calentamiento',
  fuerza: 'Fuerza',
  circuito: 'Circuito',
  cardio: 'Cardio',
  enfriamiento: 'Enfriamiento',
  otro: 'Otro',
};
export const BLOCK_ICON: Record<BlockKind, string> = {
  calentamiento: '🔥',
  fuerza: '🏋️',
  circuito: '🔁',
  cardio: '❤️',
  enfriamiento: '🧘',
  otro: '•',
};

export interface Param {
  id: string;
  label: string;
  value: string;
  unit: string;
  /** Opciones de unidad configurables (p. ej. km/h o mph). */
  unitOptions?: string[];
  /** Dato pendiente de definir o confirmar. */
  pending: boolean;
  note?: string;
}

export interface Variant {
  name: string;
  note?: string;
}

export interface Exercise {
  id: string;
  name: string;
  libKey?: string;
  mode: 'tiempo' | 'reps';
  seconds: number | null;
  reps: number | null;
  /** Descanso tras este ejercicio (sustituye al del bloque); null = el del bloque. */
  restAfter: number | null;
  params: Param[];
  summary: string;
  steps: string[];
  keyPoints: string[];
  errors: string[];
  videoUrl: string;
  pose: string;
  easier?: Variant;
  harder?: Variant;
  lowImpact?: Variant;
  coachNotes: string;
  /** Motivo por el que necesita confirmación; null si está confirmado. */
  review: string | null;
}

export interface Block {
  id: string;
  kind: BlockKind;
  title: string;
  rounds: number;
  restBetweenExercises: number;
  restBetweenRounds: number;
  notes: string;
  exercises: Exercise[];
}

export interface CoachComment {
  id: string;
  date: string;
  text: string;
}

export interface Routine {
  id: string;
  name: string;
  place: string;
  description: string;
  blocks: Block[];
  comments: CoachComment[];
  useLowImpact: boolean;
  createdAt: string;
  updatedAt: string;
  sample?: boolean;
}

export type SessionStatus = 'pendiente' | 'en_curso' | 'completada' | 'omitida';
export const STATUS_LABEL: Record<SessionStatus, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  completada: 'Completada',
  omitida: 'Omitida',
};

export interface Session {
  id: string;
  routineId: string;
  date: string;
  time: string;
  status: SessionStatus;
  /** Fechas anteriores si se reprogramó (se conserva el historial). */
  rescheduledFrom: string[];
  historyId?: string;
  /** Creada al iniciar un entrenamiento no programado. */
  adhoc?: boolean;
}

export interface Discomfort {
  where: string;
  intensity: number;
  note: string;
}

export interface ExerciseLog {
  name: string;
  block: string;
  round: number;
  status: 'hecho' | 'saltado';
  seconds: number;
}

export interface HistoryEntry {
  id: string;
  sessionId: string | null;
  routineId: string;
  routineName: string;
  date: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  plannedSec: number;
  outcome: 'completada' | 'detenida';
  exercises: ExerciseLog[];
  feeling: number | null;
  effort: number | null;
  notes: string;
  discomfort: Discomfort | null;
  lowImpact: boolean;
}

export type Level = '' | 'principiante' | 'intermedio' | 'avanzado';
export interface Profile {
  name: string;
  level: Level;
  equipment: string[];
  goal: string;
  restrictions: string;
}
export const EQUIPMENT = ['Ninguno (peso corporal)', 'Colchoneta', 'Mancuernas', 'Bandas elásticas', 'Caminadora', 'Bicicleta estática', 'Banco o caja', 'Gimnasio completo'];

export interface Reminders {
  /** Días de la semana (0 = domingo) en que se entrena. */
  days: number[];
  time: string;
  trainEnabled: boolean;
  logEnabled: boolean;
  logTime: string;
  /** Rutina asignada al plan semanal. */
  routineId: string;
  /** Programar automáticamente las sesiones del plan semanal. */
  autoSchedule: boolean;
  /** Fechas ya generadas por el plan (para no recrear sesiones eliminadas). */
  generated: string[];
  /** Avisos ya emitidos: clave tipo:fecha. */
  fired: string[];
}

export interface Settings {
  theme: 'sistema' | 'claro' | 'oscuro';
  sound: boolean;
  vibrate: boolean;
  autoAdvance: boolean;
  weeklyGoal: number;
}

export interface ActiveWorkout {
  routineId: string;
  sessionId: string | null;
  snapshot: Routine;
  lowImpact: boolean;
  index: number;
  results: Record<number, 'hecho' | 'saltado'>;
  spent: Record<number, number>;
  startedAt: string;
}

export interface AppState {
  version: 1;
  routines: Routine[];
  sessions: Session[];
  history: HistoryEntry[];
  profile: Profile;
  reminders: Reminders;
  settings: Settings;
  active: ActiveWorkout | null;
  onboarded: boolean;
  updatedAt: string;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function newParam(p: Partial<Param> & { label: string }): Param {
  return { id: uid(), value: '', unit: '', pending: false, ...p };
}

export function newExercise(p: Partial<Exercise> = {}): Exercise {
  return {
    id: uid(),
    name: 'Nuevo ejercicio',
    mode: 'tiempo',
    seconds: 30,
    reps: null,
    restAfter: null,
    params: [],
    summary: '',
    steps: [],
    keyPoints: [],
    errors: [],
    videoUrl: '',
    pose: 'generico',
    coachNotes: '',
    review: null,
    ...p,
  };
}

/** Crea un ejercicio con la información de la biblioteca. */
export function fromLib(lib: LibEntry, p: Partial<Exercise> = {}): Exercise {
  return newExercise({
    name: lib.name,
    libKey: lib.key,
    summary: lib.summary,
    steps: [...lib.steps],
    keyPoints: [...lib.keyPoints],
    errors: [...lib.errors],
    pose: lib.pose,
    easier: lib.easier && { ...lib.easier },
    harder: lib.harder && { ...lib.harder },
    lowImpact: lib.lowImpact && { ...lib.lowImpact },
    ...p,
  });
}

export function newBlock(kind: BlockKind, p: Partial<Block> = {}): Block {
  return { id: uid(), kind, title: BLOCK_LABEL[kind], rounds: 1, restBetweenExercises: 0, restBetweenRounds: 0, notes: '', exercises: [], ...p };
}

export function newRoutine(p: Partial<Routine> = {}): Routine {
  const now = new Date().toISOString();
  return { id: uid(), name: 'Nueva rutina', place: '', description: '', blocks: [], comments: [], useLowImpact: false, createdAt: now, updatedAt: now, ...p };
}

export function blankRoutine(): Routine {
  return newRoutine({
    blocks: [newBlock('calentamiento'), newBlock('circuito', { rounds: 3, restBetweenExercises: 10, restBetweenRounds: 60 }), newBlock('cardio'), newBlock('enfriamiento')],
  });
}

const L = (key: string) => libByKey(key)!;

export const SAMPLE_TEXT = `Cardio y abdomen — casa o gimnasio

1. Calentamiento
- 3 rondas.
- Círculos de cadera de pie: 30 segundos.
- Círculos de brazos: 30 segundos.
- Saltos suaves: 1 minuto.

2. Abdomen — circuito
- 3 rondas.
- 30 segundos por ejercicio.
- 10 segundos de descanso entre ejercicios.
- 1 minuto de descanso entre rondas.
- Ejercicios:
  a. Tocarse los dedos del pie en decúbito supino.
  b. Crujido de rana.
  c. Escalador de montaña.
  d. Palanca de pierna.
  e. V-ups.
  f. Plancha de antebrazos.

3. Cardio — caminadora
- 20 minutos.
- Velocidad objetivo: 3,5
- Inclinación: máxima

4. Enfriamiento
- Estiramiento de la vía anterior: 1 minuto.
- Estiramiento de hombros en caja: 1 minuto.
- Estiramiento de cobra: 20 segundos.`;

export const AMBIGUOUS = 'Nombre poco claro: confirma con el entrenador qué estiramiento es y cómo se hace.';

/** Rutina de ejemplo editable. */
export function sampleRoutine(): Routine {
  const t30 = { seconds: 30 };
  return newRoutine({
    name: 'Cardio y abdomen',
    place: 'Casa o gimnasio',
    description: 'Rutina de ejemplo. Edítala o sustitúyela por la de tu entrenador.',
    sample: true,
    blocks: [
      newBlock('calentamiento', {
        rounds: 3,
        exercises: [fromLib(L('circulos-cadera'), t30), fromLib(L('circulos-brazos'), t30), fromLib(L('saltos-suaves'), { seconds: 60 })],
      }),
      newBlock('circuito', {
        title: 'Abdomen — circuito',
        rounds: 3,
        restBetweenExercises: 10,
        restBetweenRounds: 60,
        exercises: [
          fromLib(L('toe-touch-supino'), t30),
          fromLib(L('crujido-rana'), t30),
          fromLib(L('escalador'), t30),
          fromLib(L('palanca-pierna'), t30),
          fromLib(L('v-ups'), t30),
          fromLib(L('plancha-antebrazos'), t30),
        ],
      }),
      newBlock('cardio', {
        title: 'Cardio — caminadora',
        exercises: [
          fromLib(L('caminadora'), {
            seconds: 20 * 60,
            params: [
              newParam({ label: 'Velocidad objetivo', value: '3,5', unit: '', unitOptions: ['km/h', 'mph'], pending: true, note: 'Elige la unidad (km/h o mph).' }),
              newParam({ label: 'Inclinación', value: 'máxima', unit: '', pending: true, note: 'Dato pendiente de definir por el entrenador.' }),
            ],
          }),
        ],
      }),
      newBlock('enfriamiento', {
        exercises: [
          newExercise({ name: 'Estiramiento de la vía anterior', seconds: 60, pose: 'estiramiento', review: AMBIGUOUS }),
          newExercise({ name: 'Estiramiento de hombros en caja', seconds: 60, pose: 'estiramiento', review: AMBIGUOUS }),
          fromLib(L('cobra'), { seconds: 20 }),
        ],
      }),
    ],
  });
}

export function defaultState(): AppState {
  const routine = sampleRoutine();
  return {
    version: 1,
    routines: [routine],
    sessions: [],
    history: [],
    profile: { name: '', level: '', equipment: [], goal: '', restrictions: '' },
    reminders: {
      days: [1, 3, 5],
      time: '18:00',
      trainEnabled: false,
      logEnabled: false,
      logTime: '21:00',
      routineId: routine.id,
      autoSchedule: true,
      generated: [],
      fired: [],
    },
    settings: { theme: 'sistema', sound: true, vibrate: true, autoAdvance: true, weeklyGoal: 3 },
    active: null,
    onboarded: false,
    updatedAt: new Date().toISOString(),
  };
}

/** Completa campos ausentes de versiones anteriores o de copias importadas. */
export function migrate(raw: unknown): AppState {
  const d = defaultState();
  const s = (raw ?? {}) as Partial<AppState>;
  if (!Array.isArray(s.routines)) return d;
  return {
    ...d,
    ...s,
    version: 1,
    sessions: Array.isArray(s.sessions) ? s.sessions : [],
    history: Array.isArray(s.history) ? s.history : [],
    profile: { ...d.profile, ...(s.profile ?? {}) },
    reminders: { ...d.reminders, ...(s.reminders ?? {}) },
    settings: { ...d.settings, ...(s.settings ?? {}) },
    active: s.active ?? null,
  };
}

/** Crea las sesiones del plan semanal desde el lunes actual hasta dos semanas adelante. */
export function ensurePlanSessions(s: AppState, today = todayISO()): AppState {
  const r = s.reminders;
  if (!r.autoSchedule || !r.days.length || !s.routines.some((x) => x.id === r.routineId)) return s;
  const from = weekStart(today);
  const generated = new Set(r.generated);
  const add: Session[] = [];
  for (let i = 0; i < 21; i++) {
    const date = addDays(from, i);
    const key = `${date}`;
    if (generated.has(key)) continue;
    const dw = new Date(date + 'T12:00').getDay();
    if (!r.days.includes(dw)) continue;
    generated.add(key);
    if (s.sessions.some((x) => x.date === date && x.routineId === r.routineId)) continue;
    add.push({ id: uid(), routineId: r.routineId, date, time: r.time, status: 'pendiente', rescheduledFrom: [] });
  }
  if (!add.length && generated.size === r.generated.length) return s;
  // se conservan solo las marcas recientes
  const keep = [...generated].filter((g) => g >= addDays(today, -60));
  return { ...s, sessions: [...s.sessions, ...add], reminders: { ...r, generated: keep } };
}
