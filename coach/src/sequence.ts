/** Convierte una rutina en la secuencia de pasos del modo entrenamiento. */
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
  restKind?: 'ejercicios' | 'rondas';
}

/** Segundos estimados por repetición cuando el ejercicio va por repeticiones. */
export const SEC_PER_REP = 3;

export function displayName(ex: Exercise, lowImpact: boolean) {
  return lowImpact && ex.lowImpact?.name ? ex.lowImpact.name : ex.name;
}

export function buildSteps(r: Routine): Step[] {
  const out: Step[] = [];
  r.blocks.forEach((block, blockIdx) => {
    if (!block.exercises.length) return;
    const rounds = Math.max(1, Math.round(block.rounds || 1));
    for (let round = 1; round <= rounds; round++) {
      block.exercises.forEach((ex, exIdx) => {
        const base = { blockIdx, block, round, rounds, exIdx, exercise: ex };
        out.push({ ...base, kind: 'trabajo', seconds: ex.mode === 'tiempo' ? ex.seconds : null, reps: ex.mode === 'reps' ? ex.reps : null });
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
  if (st.reps != null) return st.reps * SEC_PER_REP;
  return 0;
}

export function estimateSeconds(r: Routine) {
  return buildSteps(r).reduce((a, st) => a + stepSeconds(st), 0);
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
