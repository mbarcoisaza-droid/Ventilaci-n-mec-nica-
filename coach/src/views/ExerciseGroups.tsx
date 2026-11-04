/** Ejercicios de todas las rutinas agrupados por ficha (nombres en español e inglés juntos). */
import { useMemo, useState } from 'react';
import { CardEditor } from '../components/CardEditor';
import { Thumb } from '../components/Illustration';
import { Sheet } from '../components/ui';
import { libByKey } from '../library';
import { AppState, Exercise, groupKeyOf } from '../model';

type Upd = (fn: (s: AppState) => AppState) => void;

interface Group {
  key: string;
  sample: Exercise;
  names: string[];
  routines: string[];
  pending: boolean;
}

export function pendingExerciseCount(s: AppState) {
  return groupsOf(s).filter((g) => g.pending).length;
}

function groupsOf(s: AppState): Group[] {
  const map = new Map<string, Group>();
  for (const r of s.routines)
    for (const b of r.blocks)
      for (const e of b.exercises) {
        const k = groupKeyOf(e);
        const g = map.get(k) ?? { key: k, sample: e, names: [], routines: [], pending: false };
        if (!g.names.includes(e.name)) g.names.push(e.name);
        if (!g.routines.includes(r.name)) g.routines.push(r.name);
        if (e.review) {
          g.pending = true;
          g.sample = e;
        }
        map.set(k, g);
      }
  return [...map.values()].sort((a, b) => Number(b.pending) - Number(a.pending) || a.sample.name.localeCompare(b.sample.name, 'es'));
}

export function ExerciseGroups({ state, update, onClose }: { state: AppState; update: Upd; onClose: () => void }) {
  const [onlyPending, setOnlyPending] = useState(true);
  const [edit, setEdit] = useState<Exercise | null>(null);
  const groups = useMemo(() => groupsOf(state), [state]);
  const shown = groups.filter((g) => !onlyPending || g.pending);

  if (edit) return <CardEditor state={state} update={update} ex={edit} onClose={() => setEdit(null)} />;

  return (
    <Sheet title="Ejercicios de todas las rutinas" onClose={onClose} wide>
      <p className="muted tiny">Cada ficha reúne los nombres equivalentes en español e inglés. Lo que edites se aplica a todas las rutinas donde aparece.</p>
      <div className="seg">
        <button className={onlyPending ? 'on' : ''} aria-pressed={onlyPending} onClick={() => setOnlyPending(true)}>
          Por confirmar ({groups.filter((g) => g.pending).length})
        </button>
        <button className={!onlyPending ? 'on' : ''} aria-pressed={!onlyPending} onClick={() => setOnlyPending(false)}>
          Todos ({groups.length})
        </button>
      </div>
      {!shown.length && <p className="notice ok">No hay ejercicios por confirmar.</p>}
      <ul className="ex-list">
        {shown.map((g) => {
          const lib = libByKey(g.sample.libKey);
          return (
            <li key={g.key}>
              <button onClick={() => setEdit(g.sample)}>
                <span className="ex-thumb">
                  <Thumb pose={g.sample.pose} />
                </span>
                <span className="ex-txt">
                  <b>{g.names.join(' · ')}</b>
                  {lib && !g.names.includes(lib.name) && <small className="es-name">{lib.name}</small>}
                  <small>
                    En {g.routines.length} rutina(s){g.sample.videoUrl ? ' · ▶ video' : ''}
                  </small>
                  {g.pending && <small className="warn-txt">⚠ {g.sample.review}</small>}
                </span>
                <span className="chev" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
