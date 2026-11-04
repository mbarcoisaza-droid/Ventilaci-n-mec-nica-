/** Modelo de datos de Mi Coach. Todo se guarda en el dispositivo (localStorage). */
import { addDays, todayISO, weekStart } from './dates';
import { LIBRARY, LIB_VERSION, LibContent, LibEntry, PENDING_LABEL, PENDING_POSE, findLib, libByKey, nameKey } from './library';

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
  /** Máximo del rango de repeticiones (12–15); null si es un número fijo. */
  repsMax: number | null;
  /** Unidad de las repeticiones si no son «repeticiones» (p. ej. «pasos»). */
  repUnit: string;
  /** «por pierna», «a cada lado»… */
  perSide: string;
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
  /** Posición inicial. */
  start: string;
  /** Respiración sugerida. */
  breathing: string;
  /** Equipo necesario. */
  equipment: string[];
  /** Descripción o gráfico editados a mano: la biblioteca no los sobrescribe. */
  custom?: boolean;
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
  /** Paquetes de rutinas ya cargados (para no duplicarlos). */
  seeds: string[];
  /** Versión de la biblioteca aplicada a los ejercicios guardados. */
  libVersion?: number;
  /** Fichas completadas o editadas por el entrenador (por clave de ejercicio): comunes a todas las rutinas. */
  exerciseLib?: Record<string, LibContent>;
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
    repsMax: null,
    repUnit: '',
    perSide: '',
    restAfter: null,
    params: [],
    summary: '',
    steps: [],
    keyPoints: [],
    errors: [],
    videoUrl: '',
    pose: 'generico',
    coachNotes: '',
    start: '',
    breathing: '',
    equipment: [],
    review: null,
    ...p,
  };
}

/** Crea un ejercicio con la información de la biblioteca. */
/** Campos de contenido (gráfico y descripción) que comparte un ejercicio con su ficha. */
export function contentFields(c: Partial<LibContent>) {
  return {
    summary: c.summary ?? '',
    start: c.start ?? '',
    steps: [...(c.steps ?? [])],
    breathing: c.breathing ?? '',
    keyPoints: [...(c.keyPoints ?? [])],
    errors: [...(c.errors ?? [])],
    equipment: [...(c.equipment ?? [])],
    pose: c.pose ?? PENDING_POSE,
    easier: c.easier && { ...c.easier },
    harder: c.harder && { ...c.harder },
    lowImpact: c.lowImpact && { ...c.lowImpact },
  };
}

export const pendingReview = (lib: LibEntry) => `${PENDING_LABEL}: ${lib.pending}`;
export const NO_LIB_REVIEW = `${PENDING_LABEL}: ejercicio sin ficha. El entrenador debe agregar la descripción.`;
/** Avisos generados automáticamente sobre el movimiento (se recalculan al sincronizar). */
const autoReviews = () => [
  ...LIBRARY.filter((l) => l.pending).map(pendingReview),
  NO_LIB_REVIEW,
  'Ejercicio no reconocido: confirma el movimiento y añade las instrucciones.',
  'Nombre poco claro: confirma con el entrenador qué estiramiento es y cómo se hace.',
];
export const stripAutoReview = (r: string | null) => {
  if (!r) return null;
  let out = r;
  for (const a of autoReviews()) out = out.split(a).join(' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out || null;
};

export function fromLib(lib: LibEntry, p: Partial<Exercise> = {}): Exercise {
  return newExercise({
    name: lib.name,
    libKey: lib.key,
    ...contentFields(lib),
    review: lib.pending ? pendingReview(lib) : null,
    ...p,
  });
}

/** Clave que agrupa un ejercicio con sus nombres equivalentes (español/inglés). */
export const groupKeyOf = (ex: { libKey?: string; name: string }) => ex.libKey ?? `n:${nameKey(ex.name)}`;

/**
 * Actualiza el gráfico y la descripción de un ejercicio a partir de su ficha (o de la edición del entrenador).
 * Nunca cambia nombre, series, repeticiones, pesos, descansos, tiempos, video ni notas.
 */
export function syncExercise(ex: Exercise, overrides: Record<string, LibContent> = {}): Exercise {
  const lib = findLib(ex.name) ?? libByKey(ex.libKey);
  const ownContent = ex.custom || (!ex.libKey && ex.steps.length > 0);
  if (!lib) {
    if (ownContent) return ex;
    const ov = overrides[groupKeyOf(ex)];
    if (ov) return { ...ex, ...contentFields(ov), custom: true, review: stripAutoReview(ex.review) };
    return { ...ex, pose: PENDING_POSE, review: [stripAutoReview(ex.review), NO_LIB_REVIEW].filter(Boolean).join(' ') };
  }
  if (ownContent) return { ...ex, libKey: lib.key };
  const ov = overrides[lib.key];
  if (ov) return { ...ex, libKey: lib.key, ...contentFields(ov), custom: true, review: stripAutoReview(ex.review) };
  const rest = stripAutoReview(ex.review);
  if (lib.pending) {
    return { ...ex, libKey: lib.key, ...contentFields({ equipment: lib.equipment, pose: PENDING_POSE }), review: [rest, pendingReview(lib)].filter(Boolean).join(' ') };
  }
  return { ...ex, libKey: lib.key, ...contentFields(lib), review: rest };
}

export function syncRoutine(r: Routine, overrides: Record<string, LibContent> = {}): Routine {
  return { ...r, blocks: r.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => syncExercise(e, overrides)) })) };
}

/** Aplica la versión actual de la biblioteca a todas las rutinas guardadas (una vez por versión). */
export function syncLibrary(s: AppState): AppState {
  if ((s.libVersion ?? 1) >= LIB_VERSION) return s;
  const ov = s.exerciseLib ?? {};
  return {
    ...s,
    routines: s.routines.map((r) => syncRoutine(r, ov)),
    active: s.active ? { ...s.active, snapshot: syncRoutine(s.active.snapshot, ov) } : null,
    libVersion: LIB_VERSION,
  };
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
          fromLib(L('via-anterior'), { name: 'Estiramiento de la vía anterior', seconds: 60 }),
          fromLib(L('hombros-caja'), { name: 'Estiramiento de hombros en caja', seconds: 60 }),
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
    seeds: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Completa campos de ejercicio añadidos en versiones posteriores. */
export function normalizeRoutine(r: Routine): Routine {
  return {
    ...r,
    comments: r.comments ?? [],
    blocks: (r.blocks ?? []).map((b) => ({
      ...b,
      exercises: (b.exercises ?? []).map((e) => ({
        ...newExercise(),
        ...e,
        repsMax: e.repsMax ?? null,
        repUnit: e.repUnit ?? '',
        perSide: e.perSide ?? '',
        start: e.start ?? '',
        breathing: e.breathing ?? '',
        equipment: e.equipment ?? [],
      })),
    })),
  };
}

/** Completa campos ausentes de versiones anteriores o de copias importadas. */
export function migrate(raw: unknown): AppState {
  const d = defaultState();
  const s = (raw ?? {}) as Partial<AppState>;
  if (!Array.isArray(s.routines)) return d;
  const routines = (s.routines as Routine[]).map(normalizeRoutine);
  return {
    ...d,
    ...s,
    routines,
    seeds: Array.isArray(s.seeds) ? s.seeds : [],
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
