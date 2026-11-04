/** Convierte una rutina en la secuencia de pasos del modo entrenamiento. */
import { fmtDur } from './dates';
import { Block, Exercise, Routine } from './model';

export interface Step {
  kind: 'trabajo' | 'descanso';
  blockIdx: number;
  block: Block;
  round: number;
  rounds: number;
  exIdx: number;
  exercise: Exercise;
  seconds: number | null;
  reps: number | null;
  restKind?: 'ejercicios' | 'rondas' | 'bloque';
  /** De dónde sale el tiempo de un ejercicio en modo corrido. */
  timeSource?: 'tiempo' | 'reps' | 'defecto';
  /** Ejercicio por tiempo y por lado: segundos de cada lado (a la mitad se avisa «Cambia de lado»). */
  sideSeconds?: number;
}

/** Opciones del modo entrenamiento corrido (sin detenerse entre ejercicios ni bloques). */
export interface FlowOptions {
  continuous: boolean;
  /** Segundos por repetición para calcular el tiempo de los ejercicios por repeticiones. */
  secPerRep: number;
  /** Cuenta «Prepárate» antes de cada bloque nuevo (segundos; 0 = sin transición). */
  transition: number;
  /** Tiempo para un ejercicio sin repeticiones ni duración indicadas. */
  defaultWork: number;
}

/** Segundos de trabajo de un ejercicio por repeticiones: usa el máximo del rango y duplica si es por lado. */
export const repSeconds = (ex: Exercise, secPerRep: number) => Math.round((ex.repsMax ?? ex.reps ?? 0) * secPerRep * (ex.perSide ? 2 : 1));

/** Segundos estimados por repetición cuando el ejercicio va por repeticiones. */
export const SEC_PER_REP = 3;

export function displayName(ex: Exercise, lowImpact: boolean) {
  return lowImpact && ex.lowImpact?.name ? ex.lowImpact.name : ex.name;
}

/** «12–15 repeticiones por pierna», «30 pasos», «30 s», «20 min». */
export function amountText(ex: Exercise) {
  const side = ex.perSide ? ` ${ex.perSide}` : '';
  if (ex.mode === 'tiempo') return ex.seconds ? `${fmtDur(ex.seconds)}${side}` : 'Duración sin definir';
  if (!ex.reps) return 'Repeticiones sin definir';
  return `${repsNumber(ex)} ${ex.repUnit || 'repeticiones'}${side}`;
}
export const repsNumber = (ex: Exercise) => `${ex.reps ?? '?'}${ex.repsMax ? `–${ex.repsMax}` : ''}`;

export function buildSteps(r: Routine, flow?: FlowOptions): Step[] {
  const out: Step[] = [];
  let firstBlock = true;
  r.blocks.forEach((block, blockIdx) => {
    if (!block.exercises.length) return;
    const rounds = Math.max(1, Math.round(block.rounds || 1));
    if (flow?.continuous && flow.transition > 0 && !firstBlock) {
      out.push({ blockIdx, block, round: 1, rounds, exIdx: 0, exercise: block.exercises[0], kind: 'descanso', seconds: flow.transition, reps: null, restKind: 'bloque' });
    }
    firstBlock = false;
    for (let round = 1; round <= rounds; round++) {
      block.exercises.forEach((ex, exIdx) => {
        const base = { blockIdx, block, round, rounds, exIdx, exercise: ex };
        const reps = ex.mode === 'reps' ? ex.reps : null;
        let seconds = ex.mode === 'tiempo' ? ex.seconds || null : null;
        let timeSource: Step['timeSource'] = seconds ? 'tiempo' : undefined;
        if (flow?.continuous && seconds == null) {
          const rs = ex.mode === 'reps' ? repSeconds(ex, flow.secPerRep) : 0;
          seconds = rs > 0 ? rs : flow.defaultWork;
          timeSource = rs > 0 ? 'reps' : 'defecto';
        }
        let sideSeconds: number | undefined;
        if (flow?.continuous && ex.mode === 'tiempo' && ex.perSide && seconds) {
          sideSeconds = seconds;
          seconds = seconds * 2;
        }
        out.push({ ...base, kind: 'trabajo', seconds, reps, timeSource, sideSeconds });
        const lastEx = exIdx === block.exercises.length - 1;
        if (!lastEx) {
          const rest = ex.restAfter ?? block.restBetweenExercises;
          if (rest > 0) out.push({ ...base, kind: 'descanso', seconds: rest, reps: null, restKind: 'ejercicios' });
        } else if (round < rounds && block.restBetweenRounds > 0) {
          out.push({ ...base, kind: 'descanso', seconds: block.restBetweenRounds, reps: null, restKind: 'rondas' });
        }
      });
    }
  });
  return out;
}

export function stepSeconds(st: Step) {
  if (st.seconds != null) return st.seconds;
  if (st.reps != null) return st.reps * SEC_PER_REP * (st.exercise.perSide ? 2 : 1);
  return 0;
}

/** Duración estimada con el mismo cálculo que el entrenamiento corrido (3 s por repetición, sin transiciones). */
export function estimateSeconds(r: Routine, secPerRep = SEC_PER_REP) {
  return buildSteps(r, { continuous: true, secPerRep, transition: 0, defaultWork: 0 }).reduce((a, st) => a + (st.seconds ?? 0), 0);
}

export function blockSeconds(r: Routine, blockIdx: number) {
  return buildSteps(r)
    .filter((s) => s.blockIdx === blockIdx)
    .reduce((a, st) => a + stepSeconds(st), 0);
}

export interface Issue {
  blockId: string;
  exerciseId: string;
  paramId?: string;
  kind: 'ejercicio' | 'parametro' | 'duracion';
  title: string;
  text: string;
}

/** Datos ambiguos o pendientes que conviene confirmar antes de empezar. */
export function findIssues(r: Routine): Issue[] {
  const out: Issue[] = [];
  for (const b of r.blocks) {
    for (const ex of b.exercises) {
      if (ex.review) out.push({ blockId: b.id, exerciseId: ex.id, kind: 'ejercicio', title: ex.name, text: ex.review });
      if ((ex.mode === 'tiempo' && !ex.seconds) || (ex.mode === 'reps' && !ex.reps))
        out.push({ blockId: b.id, exerciseId: ex.id, kind: 'duracion', title: ex.name, text: 'Falta la duración o el número de repeticiones.' });
      for (const p of ex.params) {
        if (p.pending)
          out.push({
            blockId: b.id,
            exerciseId: ex.id,
            paramId: p.id,
            kind: 'parametro',
            title: `${ex.name} · ${p.label}`,
            text: p.note || 'Dato pendiente de confirmar.',
          });
      }
    }
  }
  return out;
}

export const paramText = (p: { value: string; unit: string }) => `${p.value}${p.unit ? ` ${p.unit}` : ''}`;
