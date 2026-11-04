/** Paquetes de rutinas precargadas. Se añaden una sola vez y nunca sobrescriben rutinas existentes. */
import { TRAINER_SEED_ID, TRAINER_TEXT } from './data/trainerText';
import { importMany } from './importer';
import { norm } from './library';
import { AppState, Routine } from './model';

export function trainerRoutines(): Routine[] {
  return importMany(TRAINER_TEXT).results.map((r) => ({ ...r.routine, description: 'Rutina del entrenador importada desde texto. Revisa los datos marcados.' }));
}

export function withSeeds(s: AppState): AppState {
  if (s.seeds.includes(TRAINER_SEED_ID)) return s;
  const have = new Set(s.routines.map((r) => norm(`${r.name} ${r.place}`)));
  const add = trainerRoutines().filter((r) => !have.has(norm(`${r.name} ${r.place}`)));
  return { ...s, routines: [...s.routines, ...add], seeds: [...s.seeds, TRAINER_SEED_ID] };
}
