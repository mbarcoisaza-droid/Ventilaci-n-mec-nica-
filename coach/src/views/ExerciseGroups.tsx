/** Ejercicios agrupados por nombre en todas las rutinas: confirmar o completar una vez y aplicar a todas. */
import { useMemo, useState } from 'react';
import { upsertRoutine } from '../actions';
import { Thumb } from '../components/Illustration';
import { Field, Sheet } from '../components/ui';
import { norm } from '../library';
import { AppState, Exercise } from '../model';
import { POSE_OPTIONS } from '../poses';
import { parseYouTubeId } from '../youtube';

type Upd = (fn: (s: AppState) => AppState) => void;

interface Group {
  key: string;
  sample: Exercise;
  count: number;
  routines: string[];
  pending: boolean;
}

const lines = (t: string) =>
  t
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

export function pendingExerciseCount(s: AppState) {
  return groupsOf(s).filter((g) => g.pending).length;
}

function groupsOf(s: AppState): Group[] {
  const map = new Map<string, Group>();
  for (const r of s.routines)
    for (const b of r.blocks)
      for (const e of b.exercises) {
        const k = norm(e.name);
        const g = map.get(k) ?? { key: k, sample: e, count: 0, routines: [], pending: false };
        g.count++;
        if (!g.routines.includes(r.name)) g.routines.push(r.name);
        if (e.review) g.pending = true;
        map.set(k, g);
      }
  return [...map.values()].sort((a, b) => Number(b.pending) - Number(a.pending) || a.sample.name.localeCompare(b.sample.name, 'es'));
}

export function ExerciseGroups({ state, update, onClose }: { state: AppState; update: Upd; onClose: () => void }) {
  const [onlyPending, setOnlyPending] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => groupsOf(state), [state]);
  const shown = groups.filter((g) => !onlyPending || g.pending);

  /** Aplica un cambio a todos los ejercicios con ese nombre. */
  const applyAll = (key: string, fn: (e: Exercise) => Exercise) =>
    update((s) =>
      s.routines.reduce(
        (acc, r) =>
          r.blocks.some((b) => b.exercises.some((e) => norm(e.name) === key))
            ? upsertRoutine(acc, { ...r, blocks: r.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => (norm(e.name) === key ? fn(e) : e)) })) })
            : acc,
        s,
      ),
    );

  return (
    <Sheet title="Ejercicios de todas las rutinas" onClose={onClose} wide>
      <p className="muted tiny">Los cambios se aplican a todas las rutinas donde aparece el ejercicio con el mismo nombre. Así confirmas o completas un ejercicio una sola vez.</p>
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
        {shown.map((g) => (
          <li key={g.key}>
            <button onClick={() => setOpen(open === g.key ? null : g.key)} aria-expanded={open === g.key}>
              <span className="ex-thumb">
                <Thumb pose={g.sample.pose} />
              </span>
              <span className="ex-txt">
                <b>{g.sample.name}</b>
                <small>
                  En {g.routines.length} rutina(s){g.sample.videoUrl ? ' · ▶ video' : ''}
                </small>
                {g.pending && <small className="warn-txt">⚠ {g.sample.review}</small>}
              </span>
              <span className="chev" aria-hidden>
                {open === g.key ? '˅' : '›'}
              </span>
            </button>
            {open === g.key && <GroupEditor key={g.key} group={g} onApply={(fn) => applyAll(g.key, fn)} />}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function GroupEditor({ group, onApply }: { group: Group; onApply: (fn: (e: Exercise) => Exercise) => void }) {
  const e = group.sample;
  const [video, setVideo] = useState(e.videoUrl);
  const [pose, setPose] = useState(e.pose);
  const [summary, setSummary] = useState(e.summary);
  const [steps, setSteps] = useState(e.steps.join('\n'));
  const [keyPoints, setKeyPoints] = useState(e.keyPoints.join('\n'));
  const [errors, setErrors] = useState(e.errors.join('\n'));
  const [saved, setSaved] = useState(false);
  const vid = parseYouTubeId(video);

  const save = (confirm: boolean) => {
    onApply((x) => ({
      ...x,
      videoUrl: video.trim(),
      pose,
      summary: summary.trim(),
      steps: lines(steps),
      keyPoints: lines(keyPoints),
      errors: lines(errors),
      review: confirm ? null : x.review,
    }));
    setSaved(true);
  };

  return (
    <div className="card group-editor">
      <p className="tiny muted">Rutinas: {group.routines.join(' · ')}</p>
      <Field label="Video de YouTube (URL o ID)" hint={video ? (vid ? `ID detectado: ${vid}` : 'No se reconoce un video de YouTube.') : 'Opcional.'}>
        <input value={video} onChange={(ev) => setVideo(ev.target.value)} placeholder="https://youtu.be/…" inputMode="url" />
      </Field>
      <Field label="Ilustración">
        <select value={pose} onChange={(ev) => setPose(ev.target.value)}>
          {POSE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Descripción breve">
        <textarea rows={2} value={summary} onChange={(ev) => setSummary(ev.target.value)} />
      </Field>
      <Field label="Instrucciones (una por línea)">
        <textarea rows={4} value={steps} onChange={(ev) => setSteps(ev.target.value)} />
      </Field>
      <Field label="Puntos clave (uno por línea)">
        <textarea rows={2} value={keyPoints} onChange={(ev) => setKeyPoints(ev.target.value)} />
      </Field>
      <Field label="Errores frecuentes (uno por línea)">
        <textarea rows={2} value={errors} onChange={(ev) => setErrors(ev.target.value)} />
      </Field>
      <div className="row2">
        <button className="btn primary" onClick={() => save(!!group.pending)}>
          {group.pending ? 'Guardar y confirmar' : 'Guardar'} en {group.count > 1 ? `las ${group.count}` : 'la rutina'}
        </button>
        <button className="btn" onClick={() => save(false)}>
          Solo guardar
        </button>
      </div>
      {saved && <p className="notice ok tiny">Guardado en todas las rutinas con este ejercicio.</p>}
    </div>
  );
}
