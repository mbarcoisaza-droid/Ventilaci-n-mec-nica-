/**
 * Paquetes de rutinas precargadas. Se añaden una sola vez.
 * Una versión nueva del paquete reemplaza las rutinas del paquete anterior (y la rutina de ejemplo)
 * solo si la persona no las ha modificado; si las modificó, se conservan con «(español)» en el nombre.
 */
import { OLD_SEED_IDS, TRAINER_SEED_ID, TRAINER_TEXT } from './data/trainerText';
import { importMany } from './importer';
import { norm } from './library';
import { AppState, Routine } from './model';

export const TRAINER_DESC = 'Rutina del entrenador importada desde texto. Revisa los datos marcados.';

export function trainerRoutines(): Routine[] {
  return importMany(TRAINER_TEXT).results.map((r) => ({ ...r.routine, description: TRAINER_DESC }));
}

/** Clave para emparejar versiones: sin tildes, sin plural final, sin lugar «gimnasio/gym». */
const matchKey = (r: Routine) =>
  norm(`${r.name} ${r.place}`)
    .replace(/\bgym\b/g, 'gimnasio')
    .split(' ')
    .map((w) => w.replace(/s$/, ''))
    .join(' ');

export function withSeeds(s: AppState): AppState {
  if (s.seeds.includes(TRAINER_SEED_ID)) return s;
  const fresh = trainerRoutines();
  const byKey = new Map(fresh.map((r) => [matchKey(r), r]));
  const hadOld = OLD_SEED_IDS.some((id) => s.seeds.includes(id));
  const remap = new Map<string, string>();
  const kept: Routine[] = [];
  const replaced = new Set<string>();

  for (const r of s.routines) {
    const isSeeded = r.sample || (hadOld && r.description === TRAINER_DESC);
    const match = byKey.get(matchKey(r));
    if (!isSeeded || !match) {
      kept.push(r);
      if (match && !isSeeded) replaced.add(match.id); // rutina propia con el mismo nombre: no se duplica
      continue;
    }
    const edited = r.updatedAt !== r.createdAt;
    if (edited) kept.push({ ...r, name: `${r.name} (español)` });
    else remap.set(r.id, match.id);
  }
  const add = fresh.filter((r) => !replaced.has(r.id));
  const fix = (id: string) => remap.get(id) ?? id;
  return {
    ...s,
    routines: [...kept, ...add],
    sessions: s.sessions.map((x) => (remap.has(x.routineId) ? { ...x, routineId: fix(x.routineId) } : x)),
    history: s.history.map((h) => (remap.has(h.routineId) ? { ...h, routineId: fix(h.routineId) } : h)),
    reminders: { ...s.reminders, routineId: fix(s.reminders.routineId) },
    active: s.active && remap.has(s.active.routineId) ? { ...s.active, routineId: fix(s.active.routineId) } : s.active,
    seeds: [...s.seeds, TRAINER_SEED_ID],
  };
}
