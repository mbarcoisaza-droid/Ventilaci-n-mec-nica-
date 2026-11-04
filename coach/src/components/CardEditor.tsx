/**
 * Editor de la ficha de un ejercicio (gráfico, video y descripción). Lo usa el entrenador para completar
 * las fichas «por confirmar» o reemplazar el gráfico. Se aplica a todas las rutinas con ese ejercicio,
 * con cualquiera de sus nombres, sin tocar series, repeticiones, pesos ni tiempos.
 */
import { useState } from 'react';
import { applyExerciseContent, contentOf } from '../actions';
import { LibContent, PENDING_POSE, libByKey } from '../library';
import { AppState, Exercise, groupKeyOf } from '../model';
import { POSE_OPTIONS } from '../poses';
import { parseYouTubeId } from '../youtube';
import { ExerciseMedia } from './ExerciseMedia';
import { Field, Sheet } from './ui';

const lines = (t: string) =>
  t
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

export function CardEditor({ state, update, ex, onClose }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; ex: Exercise; onClose: () => void }) {
  const key = groupKeyOf(ex);
  const lib = libByKey(ex.libKey);
  const count = state.routines.reduce((a, r) => a + r.blocks.reduce((b, bl) => b + bl.exercises.filter((e) => groupKeyOf(e) === key).length, 0), 0);
  const names = [...new Set(state.routines.flatMap((r) => r.blocks.flatMap((b) => b.exercises.filter((e) => groupKeyOf(e) === key).map((e) => e.name))))];
  const c0 = contentOf(ex);
  const [video, setVideo] = useState(ex.videoUrl);
  const [pose, setPose] = useState(c0.pose);
  const [summary, setSummary] = useState(c0.summary);
  const [start, setStart] = useState(c0.start);
  const [steps, setSteps] = useState(c0.steps.join('\n'));
  const [breathing, setBreathing] = useState(c0.breathing);
  const [keyPoints, setKeyPoints] = useState(c0.keyPoints.join('\n'));
  const [errors, setErrors] = useState(c0.errors.join('\n'));
  const [equipment, setEquipment] = useState(c0.equipment.join('\n'));
  const [easier, setEasier] = useState(c0.easier?.name ?? '');
  const vid = parseYouTubeId(video);

  const useCandidate = () => {
    const c = lib?.candidate;
    if (!c) return;
    setPose(c.pose ?? pose);
    setSummary(c.summary ?? '');
    setStart(c.start ?? '');
    setSteps((c.steps ?? []).join('\n'));
    setEquipment((c.equipment ?? []).join('\n'));
  };

  const content = (): LibContent => ({
    ...c0,
    pose,
    summary: summary.trim(),
    start: start.trim(),
    steps: lines(steps),
    breathing: breathing.trim(),
    keyPoints: lines(keyPoints),
    errors: lines(errors),
    equipment: lines(equipment),
    easier: easier.trim() ? { name: easier.trim() } : undefined,
  });
  const hasDescription = !!(start.trim() || lines(steps).length);
  const save = (confirm: boolean) => {
    update((s) => applyExerciseContent(s, key, content(), { videoUrl: video.trim(), confirm }));
    onClose();
  };
  const preview: Exercise = { ...ex, ...content(), videoUrl: video.trim() };

  return (
    <Sheet
      title="Ficha del ejercicio"
      onClose={onClose}
      wide
      footer={
        <div className="row2">
          <button className="btn primary" onClick={() => save(true)} disabled={!hasDescription && !vid}>
            Guardar y confirmar
          </button>
          <button className="btn" onClick={() => save(false)}>
            Solo guardar
          </button>
        </div>
      }
    >
      <p className="tiny muted">
        {names.join(' · ')} — se aplica a {count} ejercicio(s) en tus rutinas. No cambia series, repeticiones, pesos ni tiempos.
      </p>
      {lib?.pending && <p className="notice warn">{lib.pending}</p>}
      {lib?.candidate && (
        <button className="btn sm" onClick={useCandidate}>
          Usar la variante propuesta: {lib.candidate.label}
        </button>
      )}
      <Field label="Video de YouTube (URL o ID)" hint={video ? (vid ? `ID detectado: ${vid}. Se reproduce dentro de la app.` : 'No se reconoce un video de YouTube.') : 'Opcional. Si no hay video se muestra la ilustración.'}>
        <input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtu.be/…" inputMode="url" />
      </Field>
      <Field label="Ilustración">
        <select value={pose} onChange={(e) => setPose(e.target.value)}>
          {POSE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <ExerciseMedia ex={preview} compact />
      <Field label="Descripción breve">
        <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <Field label="Posición inicial">
        <textarea rows={2} value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="Ejecución (un paso por línea)">
        <textarea rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </Field>
      <Field label="Respiración (opcional)">
        <input value={breathing} onChange={(e) => setBreathing(e.target.value)} />
      </Field>
      <Field label="Claves de técnica (una por línea)">
        <textarea rows={2} value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} />
      </Field>
      <Field label="Errores frecuentes (uno por línea)">
        <textarea rows={2} value={errors} onChange={(e) => setErrors(e.target.value)} />
      </Field>
      <Field label="Equipo (uno por línea)">
        <textarea rows={2} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
      </Field>
      <Field label="Variante más sencilla (opcional)">
        <input value={easier} onChange={(e) => setEasier(e.target.value)} />
      </Field>
      {pose === PENDING_POSE && hasDescription && <p className="tiny muted">Elige una ilustración que corresponda al movimiento o añade un video; si no, se seguirá mostrando el dibujo neutral.</p>}
    </Sheet>
  );
}
