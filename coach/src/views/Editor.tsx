/** Edición de rutinas por bloques y de cada ejercicio. */
import { useState } from 'react';
import { ExerciseMedia } from '../components/ExerciseMedia';
import { Thumb } from '../components/Illustration';
import { DurationInput, Field, ListEditor, Sheet, Stepper } from '../components/ui';
import { fmtDur } from '../dates';
import { LIBRARY } from '../library';
import { BLOCK_ICON, BLOCK_LABEL, Block, BlockKind, Exercise, Param, Routine, fromLib, newBlock, newExercise, newParam } from '../model';
import { POSE_OPTIONS } from '../poses';
import { amountText, estimateSeconds, paramText } from '../sequence';
import { parseYouTubeId } from '../youtube';

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function RoutineEditor({ initial, focusExercise, onSave, onCancel, isNew }: { initial: Routine; focusExercise?: string; onSave: (r: Routine) => void; onCancel: () => void; isNew?: boolean }) {
  const [r, setR] = useState<Routine>(initial);
  const [editing, setEditing] = useState<{ blockId: string; exId: string } | null>(() => {
    if (!focusExercise) return null;
    const b = initial.blocks.find((x) => x.exercises.some((e) => e.id === focusExercise));
    return b ? { blockId: b.id, exId: focusExercise } : null;
  });
  const [picker, setPicker] = useState<string | null>(null);
  const dirty = JSON.stringify(r) !== JSON.stringify(initial);

  const setBlock = (id: string, fn: (b: Block) => Block) => setR((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === id ? fn(b) : b)) }));
  const setEx = (blockId: string, exId: string, fn: (e: Exercise) => Exercise) => setBlock(blockId, (b) => ({ ...b, exercises: b.exercises.map((e) => (e.id === exId ? fn(e) : e)) }));

  const editBlock = editing && r.blocks.find((b) => b.id === editing.blockId);
  const editEx = editBlock?.exercises.find((e) => e.id === editing!.exId);

  return (
    <div className="page editor">
      <div className="topbar">
        <button className="btn ghost sm" onClick={onCancel}>
          {dirty ? 'Cancelar' : '← Atrás'}
        </button>
        <b>{isNew ? 'Nueva rutina' : 'Editar rutina'}</b>
        <button className="btn sm primary" onClick={() => onSave(r)} disabled={!r.name.trim()}>
          Guardar
        </button>
      </div>

      <section className="card">
        <Field label="Nombre de la rutina">
          <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
        </Field>
        <Field label="Lugar">
          <input value={r.place} onChange={(e) => setR({ ...r, place: e.target.value })} placeholder="Casa, gimnasio…" />
        </Field>
        <Field label="Descripción">
          <textarea rows={2} value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} />
        </Field>
        <p className="muted tiny">Duración estimada: {fmtDur(estimateSeconds(r))}</p>
      </section>

      {r.blocks.map((b, bi) => (
        <section key={b.id} className={`card block blk-${b.kind}`}>
          <div className="block-edit-head">
            <select value={b.kind} onChange={(e) => setBlock(b.id, (x) => ({ ...x, kind: e.target.value as BlockKind }))} aria-label="Tipo de bloque">
              {(Object.keys(BLOCK_LABEL) as BlockKind[]).map((k) => (
                <option key={k} value={k}>
                  {BLOCK_ICON[k]} {BLOCK_LABEL[k]}
                </option>
              ))}
            </select>
            <div className="row">
              <button className="iconbtn" onClick={() => setR({ ...r, blocks: move(r.blocks, bi, -1) })} aria-label="Subir bloque" disabled={bi === 0}>
                ↑
              </button>
              <button className="iconbtn" onClick={() => setR({ ...r, blocks: move(r.blocks, bi, 1) })} aria-label="Bajar bloque" disabled={bi === r.blocks.length - 1}>
                ↓
              </button>
              <button className="iconbtn danger" onClick={() => setR({ ...r, blocks: r.blocks.filter((x) => x.id !== b.id) })} aria-label="Eliminar bloque">
                🗑
              </button>
            </div>
          </div>
          <Field label="Título del bloque">
            <input value={b.title} onChange={(e) => setBlock(b.id, (x) => ({ ...x, title: e.target.value }))} />
          </Field>
          <div className="grid2">
            <Field label="Rondas o series">
              <Stepper label="Rondas" value={b.rounds} min={1} max={50} onChange={(n) => setBlock(b.id, (x) => ({ ...x, rounds: n }))} />
            </Field>
            <Field label="Descanso entre ejercicios">
              <Stepper label="Descanso entre ejercicios" value={b.restBetweenExercises} step={5} suffix="s" onChange={(n) => setBlock(b.id, (x) => ({ ...x, restBetweenExercises: n }))} />
            </Field>
            <Field label="Descanso entre rondas">
              <Stepper label="Descanso entre rondas" value={b.restBetweenRounds} step={15} suffix="s" onChange={(n) => setBlock(b.id, (x) => ({ ...x, restBetweenRounds: n }))} />
            </Field>
          </div>
          <Field label="Notas del bloque">
            <textarea rows={2} value={b.notes} onChange={(e) => setBlock(b.id, (x) => ({ ...x, notes: e.target.value }))} />
          </Field>

          <ol className="ex-edit-list">
            {b.exercises.map((e, ei) => (
              <li key={e.id}>
                <button className="ex-edit-main" onClick={() => setEditing({ blockId: b.id, exId: e.id })}>
                  <span className="ex-thumb">
                    <Thumb pose={e.pose} />
                  </span>
                  <span className="ex-txt">
                    <b>{e.name}</b>
                    <small>
                      {amountText(e)}
                      {e.params.map((p) => ` · ${p.label}: ${paramText(p)}`).join('')}
                    </small>
                    {(e.review || e.params.some((p) => p.pending)) && <small className="warn-txt">⚠ Por confirmar</small>}
                  </span>
                </button>
                <div className="col">
                  <button className="iconbtn" onClick={() => setBlock(b.id, (x) => ({ ...x, exercises: move(x.exercises, ei, -1) }))} aria-label="Subir ejercicio" disabled={ei === 0}>
                    ↑
                  </button>
                  <button
                    className="iconbtn"
                    onClick={() => setBlock(b.id, (x) => ({ ...x, exercises: move(x.exercises, ei, 1) }))}
                    aria-label="Bajar ejercicio"
                    disabled={ei === b.exercises.length - 1}
                  >
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button className="btn sm" onClick={() => setPicker(b.id)}>
            + Añadir ejercicio
          </button>
        </section>
      ))}

      <div className="add-block">
        <span className="muted">Añadir bloque:</span>
        {(['calentamiento', 'fuerza', 'circuito', 'cardio', 'enfriamiento'] as BlockKind[]).map((k) => (
          <button key={k} className="btn sm" onClick={() => setR({ ...r, blocks: [...r.blocks, newBlock(k)] })}>
            {BLOCK_ICON[k]} {BLOCK_LABEL[k]}
          </button>
        ))}
      </div>

      <button className="btn big primary" onClick={() => onSave(r)} disabled={!r.name.trim()}>
        Guardar rutina
      </button>

      {picker && (
        <Sheet title="Añadir ejercicio" onClose={() => setPicker(null)}>
          <button
            className="btn wide"
            onClick={() => {
              const ex = newExercise();
              setBlock(picker, (x) => ({ ...x, exercises: [...x.exercises, ex] }));
              setEditing({ blockId: picker, exId: ex.id });
              setPicker(null);
            }}
          >
            + Ejercicio en blanco (lo describes tú)
          </button>
          <p className="muted tiny">O elige uno de la biblioteca (incluye instrucciones básicas editables):</p>
          <ul className="lib-list">
            {LIBRARY.map((l) => (
              <li key={l.key}>
                <button
                  onClick={() => {
                    const ex = fromLib(l, { seconds: 30 });
                    setBlock(picker, (x) => ({ ...x, exercises: [...x.exercises, ex] }));
                    setPicker(null);
                  }}
                >
                  <span className="ex-thumb">
                    <Thumb pose={l.pose} />
                  </span>
                  <span>
                    <b>{l.name}</b>
                    <small className="muted">{l.summary}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {editBlock && editEx && (
        <ExerciseEditor
          ex={editEx}
          onChange={(fn) => setEx(editBlock.id, editEx.id, fn)}
          onDelete={() => {
            setBlock(editBlock.id, (x) => ({ ...x, exercises: x.exercises.filter((e) => e.id !== editEx.id) }));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ExerciseEditor({ ex, onChange, onDelete, onClose }: { ex: Exercise; onChange: (fn: (e: Exercise) => Exercise) => void; onDelete: () => void; onClose: () => void }) {
  const set = (p: Partial<Exercise>) => onChange((e) => ({ ...e, ...p }));
  const setParam = (id: string, p: Partial<Param>) => onChange((e) => ({ ...e, params: e.params.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const vid = parseYouTubeId(ex.videoUrl);
  const [preview, setPreview] = useState(false);
  return (
    <Sheet
      title="Editar ejercicio"
      onClose={onClose}
      wide
      footer={
        <div className="row2">
          <button className="btn primary" onClick={onClose}>
            Listo
          </button>
          <button className="btn ghost danger" onClick={onDelete}>
            Eliminar ejercicio
          </button>
        </div>
      }
    >
      {ex.review && (
        <div className="notice warn">
          ⚠ {ex.review}
          <button className="btn sm ok" style={{ marginTop: 8 }} onClick={() => set({ review: null })}>
            Marcar como confirmado
          </button>
        </div>
      )}
      <Field label="Nombre">
        <input value={ex.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="seg" role="radiogroup" aria-label="Medida">
        <button role="radio" aria-checked={ex.mode === 'tiempo'} className={ex.mode === 'tiempo' ? 'on' : ''} onClick={() => set({ mode: 'tiempo', seconds: ex.seconds ?? 30 })}>
          Por tiempo
        </button>
        <button role="radio" aria-checked={ex.mode === 'reps'} className={ex.mode === 'reps' ? 'on' : ''} onClick={() => set({ mode: 'reps', reps: ex.reps ?? 10 })}>
          Por repeticiones
        </button>
      </div>
      {ex.mode === 'tiempo' ? (
        <Field label="Duración">
          <DurationInput label="Duración" value={ex.seconds ?? 0} onChange={(n) => set({ seconds: n || null })} />
        </Field>
      ) : (
        <Field label="Repeticiones">
          <Stepper label="Repeticiones" value={ex.reps ?? 0} min={1} onChange={(n) => set({ reps: n })} />
        </Field>
      )}
      {ex.mode === 'reps' && (
        <div className="grid2">
          <Field label="Hasta (rango, opcional)" hint="Ej.: 12 a 15 repeticiones.">
            <input inputMode="numeric" value={ex.repsMax ?? ''} placeholder="—" onChange={(e) => set({ repsMax: Number(e.target.value.replace(/\D/g, '')) || null })} aria-label="Máximo de repeticiones" />
          </Field>
          <Field label="Unidad">
            <input value={ex.repUnit} placeholder="repeticiones" onChange={(e) => set({ repUnit: e.target.value })} />
          </Field>
        </div>
      )}
      <Field label="Por lado (opcional)" hint="Ej.: por pierna, a cada lado, por brazo.">
        <input value={ex.perSide} placeholder="—" onChange={(e) => set({ perSide: e.target.value })} />
      </Field>
      <Field label="Descanso después de este ejercicio" hint="Vacío = el del bloque.">
        <div className="row">
          <input
            inputMode="numeric"
            value={ex.restAfter ?? ''}
            placeholder="del bloque"
            onChange={(e) => set({ restAfter: e.target.value.trim() === '' ? null : Number(e.target.value.replace(/\D/g, '')) || 0 })}
            aria-label="Descanso en segundos"
          />
          <span className="muted">s</span>
        </div>
      </Field>

      <h4>Parámetros</h4>
      <p className="tiny muted">Velocidad, inclinación, peso u otros. Marca «Por definir» si el dato debe confirmarlo el entrenador.</p>
      {ex.params.map((p) => (
        <div key={p.id} className="param-row">
          <input value={p.label} onChange={(e) => setParam(p.id, { label: e.target.value })} aria-label="Parámetro" placeholder="Parámetro" />
          <input value={p.value} onChange={(e) => setParam(p.id, { value: e.target.value })} aria-label="Valor" placeholder="Valor" />
          {p.unitOptions ? (
            <select value={p.unit} onChange={(e) => setParam(p.id, { unit: e.target.value })} aria-label="Unidad">
              <option value="">Unidad…</option>
              {p.unitOptions.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          ) : (
            <input value={p.unit} onChange={(e) => setParam(p.id, { unit: e.target.value })} aria-label="Unidad" placeholder="Unidad" />
          )}
          <label className="check">
            <input type="checkbox" checked={p.pending} onChange={(e) => setParam(p.id, { pending: e.target.checked })} /> Por definir
          </label>
          <button className="iconbtn" onClick={() => onChange((e) => ({ ...e, params: e.params.filter((x) => x.id !== p.id) }))} aria-label="Quitar parámetro">
            ✕
          </button>
        </div>
      ))}
      <div className="row wrap">
        {[
          ['Velocidad', ['km/h', 'mph']],
          ['Inclinación', null],
          ['Peso', ['kg', 'lb']],
          ['Otro', null],
        ].map(([label, opts]) => (
          <button
            key={label as string}
            className="btn sm ghost"
            onClick={() =>
              onChange((e) => ({ ...e, params: [...e.params, newParam({ label: label === 'Otro' ? '' : (label as string), unit: label === 'Inclinación' ? '%' : '', unitOptions: (opts as string[]) ?? undefined })] }))
            }
          >
            + {label as string}
          </button>
        ))}
      </div>

      <h4>Video de YouTube</h4>
      <Field label="URL o ID del video" hint={ex.videoUrl ? (vid ? `ID detectado: ${vid}` : 'No se reconoce un video de YouTube en este texto.') : 'Se reproduce dentro de la app. Si no puede incrustarse, se muestra la ilustración.'}>
        <input value={ex.videoUrl} onChange={(e) => set({ videoUrl: e.target.value.trim() })} placeholder="https://youtu.be/…" inputMode="url" />
      </Field>
      <Field label="Ilustración (si no hay video)">
        <select value={ex.pose} onChange={(e) => set({ pose: e.target.value })}>
          {POSE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <button className="btn sm ghost" onClick={() => setPreview((v) => !v)}>
        {preview ? 'Ocultar vista previa' : 'Ver vista previa'}
      </button>
      {preview && <ExerciseMedia ex={ex} compact />}

      <h4>Explicación</h4>
      <Field label="Descripción breve">
        <textarea rows={2} value={ex.summary} onChange={(e) => set({ summary: e.target.value })} />
      </Field>
      <span className="field-label">Instrucciones numeradas</span>
      <ListEditor items={ex.steps} onChange={(steps) => set({ steps })} placeholder="Paso" numbered />
      <span className="field-label">Puntos clave</span>
      <ListEditor items={ex.keyPoints} onChange={(keyPoints) => set({ keyPoints })} placeholder="Punto clave" />
      <span className="field-label">Errores frecuentes</span>
      <ListEditor items={ex.errors} onChange={(errors) => set({ errors })} placeholder="Error frecuente" />

      <h4>Variantes</h4>
      {(
        [
          ['easier', 'Más fácil'],
          ['harder', 'Más difícil'],
          ['lowImpact', 'Bajo impacto'],
        ] as const
      ).map(([k, label]) => (
        <Field key={k} label={label}>
          <input value={ex[k]?.name ?? ''} onChange={(e) => set({ [k]: e.target.value ? { ...(ex[k] ?? {}), name: e.target.value } : undefined } as Partial<Exercise>)} placeholder="Sin variante" />
        </Field>
      ))}

      <Field label="Notas del entrenador">
        <textarea rows={3} value={ex.coachNotes} onChange={(e) => set({ coachNotes: e.target.value })} />
      </Field>
    </Sheet>
  );
}
