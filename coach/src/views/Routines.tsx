/** Lista de rutinas, detalle de una rutina y revisión previa al entrenamiento. */
import { useState } from 'react';
import { deleteRoutine, duplicateRoutine, upsertRoutine } from '../actions';
import { CardEditor } from '../components/CardEditor';
import { ExerciseInfo, ExerciseMedia } from '../components/ExerciseMedia';
import { Thumb } from '../components/Illustration';
import { Empty, Sheet, Toggle } from '../components/ui';
import { ExerciseGroups, pendingExerciseCount } from './ExerciseGroups';
import { fmtDur, fmtShort, todayISO } from '../dates';
import { spanishName } from '../library';
import { AppState, BLOCK_ICON, Exercise, Routine, uid } from '../model';
import { amountText, displayName, estimateSeconds, findIssues, paramText } from '../sequence';

type Upd = (fn: (s: AppState) => AppState) => void;

export function RoutineList({
  state,
  update,
  onOpen,
  onEdit,
  onNew,
  onImport,
  onSchedule,
}: {
  state: AppState;
  update: Upd;
  onOpen: (id: string) => void;
  onEdit: (r: Routine) => void;
  onNew: () => void;
  onImport: () => void;
  onSchedule: (routineId: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState<Routine | null>(null);
  const [groups, setGroups] = useState(false);
  const pendingEx = pendingExerciseCount(state);
  return (
    <div className="page">
      <h1 className="page-title">Rutinas</h1>
      <div className="row2">
        <button className="btn primary" onClick={onNew}>
          + Nueva rutina
        </button>
        <button className="btn" onClick={onImport}>
          📋 Pegar o importar texto
        </button>
      </div>
      {state.routines.length > 0 && (
        <button className={`notice as-btn ${pendingEx ? 'warn' : ''}`} onClick={() => setGroups(true)}>
          🧩 {pendingEx ? `${pendingEx} ejercicio(s) por confirmar. Confírmalos o añade videos una sola vez para todas las rutinas.` : 'Ejercicios: añade videos o instrucciones una sola vez para todas las rutinas.'}
        </button>
      )}
      {groups && <ExerciseGroups state={state} update={update} onClose={() => setGroups(false)} />}
      {!state.routines.length && (
        <Empty icon="📝" title="Aún no tienes rutinas">
          <p className="muted">Crea una rutina por bloques o pega las instrucciones de tu entrenador para convertirlas en una rutina estructurada.</p>
        </Empty>
      )}
      {state.routines.map((r) => {
        const issues = findIssues(r).length;
        const n = r.blocks.reduce((a, b) => a + b.exercises.length, 0);
        return (
          <article key={r.id} className="card routine-card">
            <button className="routine-main" onClick={() => onOpen(r.id)}>
              <div>
                <h3>{r.name}</h3>
                <p className="muted">
                  {r.place && `${r.place} · `}
                  {fmtDur(estimateSeconds(r))} · {n} ejercicios
                </p>
                <div className="chips">
                  {r.blocks.map((b) => (
                    <span key={b.id} className={`chip blk-${b.kind}`}>
                      {BLOCK_ICON[b.kind]} {b.title}
                    </span>
                  ))}
                </div>
                {issues > 0 && <p className="chip warn">⚠ {issues} dato(s) por confirmar</p>}
              </div>
              <span className="chev" aria-hidden>
                ›
              </span>
            </button>
            <div className="card-actions">
              <button className="btn sm" onClick={() => onEdit(r)}>
                Editar
              </button>
              <button className="btn sm" onClick={() => onSchedule(r.id)}>
                Programar
              </button>
              <button className="btn sm" onClick={() => update((s) => upsertRoutine(s, duplicateRoutine(r)))}>
                Duplicar
              </button>
              <button className="btn sm ghost danger" onClick={() => setConfirmDel(r)}>
                Eliminar
              </button>
            </div>
          </article>
        );
      })}
      {confirmDel && (
        <Sheet title="Eliminar rutina" onClose={() => setConfirmDel(null)}>
          <p>
            ¿Eliminar «{confirmDel.name}»? Se quitarán sus sesiones pendientes. El historial de entrenamientos realizados se conserva.
          </p>
          <div className="row2">
            <button
              className="btn danger"
              onClick={() => {
                update((s) => deleteRoutine(s, confirmDel.id));
                setConfirmDel(null);
              }}
            >
              Eliminar
            </button>
            <button className="btn ghost" onClick={() => setConfirmDel(null)}>
              Cancelar
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

export function RoutineDetail({
  state,
  update,
  routine,
  sessionId,
  onBack,
  onEdit,
  onStart,
}: {
  state: AppState;
  update: Upd;
  routine: Routine;
  sessionId: string | null;
  onBack: () => void;
  onEdit: (r: Routine, exerciseId?: string) => void;
  onStart: (routineId: string, sessionId: string | null) => void;
}) {
  const [open, setOpen] = useState<Exercise | null>(null);
  const [card, setCard] = useState<Exercise | null>(null);
  const [check, setCheck] = useState(false);
  const [comment, setComment] = useState('');
  const save = (r: Routine) => update((s) => upsertRoutine(s, r));
  const issues = findIssues(routine);
  const session = sessionId ? state.sessions.find((x) => x.id === sessionId) : null;
  const restrictions = state.profile.restrictions.trim();
  const hasLow = routine.blocks.some((b) => b.exercises.some((e) => e.lowImpact));

  const tryStart = () => (issues.length ? setCheck(true) : onStart(routine.id, sessionId));

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn ghost sm" onClick={onBack}>
          ← Atrás
        </button>
        <button className="btn sm" onClick={() => onEdit(routine)}>
          ✎ Editar
        </button>
      </div>
      <header className="hero">
        <h1>{routine.name}</h1>
        <p className="muted">
          {routine.place && `${routine.place} · `}Duración estimada {fmtDur(estimateSeconds(routine))}
          {session && ` · ${fmtShort(session.date)}`}
        </p>
        {routine.description && <p>{routine.description}</p>}
      </header>

      {restrictions && (
        <div className="notice">
          Registraste estas restricciones: <i>«{restrictions}»</i>. La rutina no se modifica automáticamente.
          {hasLow ? ' Puedes revisar con tu entrenador las variantes de bajo impacto o más fáciles que aparecen en cada ejercicio.' : ' Revisa con tu entrenador si conviene alguna variante.'}
        </div>
      )}

      {hasLow && (
        <div className="card">
          <Toggle
            checked={routine.useLowImpact}
            onChange={(v) => save({ ...routine, useLowImpact: v })}
            label="Usar variantes de bajo impacto"
            hint="Cambia los ejercicios que tienen una variante sin saltos. Es una opción tuya, no un ajuste automático."
          />
        </div>
      )}

      {issues.length > 0 && (
        <button className="notice warn as-btn" onClick={() => setCheck(true)}>
          ⚠ Hay {issues.length} dato(s) por confirmar antes de entrenar. Toca para revisarlos.
        </button>
      )}

      {routine.blocks.map((b) => (
        <section key={b.id} className={`card block blk-${b.kind}`}>
          <header className="block-head">
            <h2>
              <span aria-hidden>{BLOCK_ICON[b.kind]}</span> {b.title}
            </h2>
            <p className="muted">
              {b.rounds > 1 ? `${b.rounds} rondas` : '1 ronda'}
              {b.restBetweenExercises > 0 && ` · ${fmtDur(b.restBetweenExercises)} entre ejercicios`}
              {b.restBetweenRounds > 0 && ` · ${fmtDur(b.restBetweenRounds)} entre rondas`}
            </p>
            {b.notes && <p className="tiny">{b.notes}</p>}
          </header>
          {!b.exercises.length && <p className="muted">Sin ejercicios en este bloque.</p>}
          <ol className="ex-list">
            {b.exercises.map((e) => (
              <li key={e.id}>
                <button onClick={() => setOpen(e)}>
                  <span className="ex-thumb">
                    <Thumb pose={e.pose} />
                  </span>
                  <span className="ex-txt">
                    <b>{displayName(e, routine.useLowImpact)}</b>
                    {spanishName(e) && <small className="es-name">{spanishName(e)}</small>}
                    <small>
                      {amountText(e)}
                      {e.params.map((p) => ` · ${p.label}: ${paramText(p)}`).join('')}
                      {e.videoUrl ? ' · ▶ video' : ''}
                    </small>
                    {(e.review || e.params.some((p) => p.pending)) && <small className="warn-txt">⚠ Por confirmar</small>}
                  </span>
                  <span className="chev" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="card">
        <h2>Comentarios del entrenador</h2>
        {!routine.comments.length && <p className="muted">Todavía no hay comentarios.</p>}
        <ul className="comments">
          {routine.comments.map((c) => (
            <li key={c.id}>
              <small className="muted">{fmtShort(c.date)}</small>
              <p>{c.text}</p>
              <button className="linkbtn danger" onClick={() => save({ ...routine, comments: routine.comments.filter((x) => x.id !== c.id) })}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escribe un comentario o indicación del entrenador" aria-label="Nuevo comentario" />
        <button
          className="btn sm"
          disabled={!comment.trim()}
          onClick={() => {
            save({ ...routine, comments: [...routine.comments, { id: uid(), date: todayISO(), text: comment.trim() }] });
            setComment('');
          }}
        >
          Añadir comentario
        </button>
      </section>

      <div className="sticky-cta">
        <button className="btn big primary" onClick={tryStart} disabled={!routine.blocks.some((b) => b.exercises.length)}>
          ▶ Iniciar entrenamiento
        </button>
      </div>

      {open && (
        <Sheet title={displayName(open, routine.useLowImpact)} onClose={() => setOpen(null)} wide>
          <ExerciseMedia ex={open} />
          <ExerciseInfo
            ex={open}
            lowImpact={routine.useLowImpact}
            onEditCard={() => {
              setCard(open);
              setOpen(null);
            }}
          />
          <button
            className="btn"
            onClick={() => {
              setOpen(null);
              onEdit(routine, open.id);
            }}
          >
            ✎ Editar series, tiempos y parámetros
          </button>
        </Sheet>
      )}
      {card && <CardEditor state={state} update={update} ex={card} onClose={() => setCard(null)} />}

      {check && (
        <PreStart
          routine={routine}
          onSave={save}
          onClose={() => setCheck(false)}
          onEdit={(exId) => {
            setCheck(false);
            onEdit(routine, exId);
          }}
          onStart={() => {
            setCheck(false);
            onStart(routine.id, sessionId);
          }}
        />
      )}
    </div>
  );
}

/** Revisión de datos ambiguos antes de empezar: cada uno se edita o se confirma. */
export function PreStart({ routine, onSave, onClose, onEdit, onStart }: { routine: Routine; onSave: (r: Routine) => void; onClose: () => void; onEdit: (exId: string) => void; onStart: () => void }) {
  const issues = findIssues(routine);
  const patchEx = (exId: string, fn: (e: Exercise) => Exercise) =>
    onSave({ ...routine, blocks: routine.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => (e.id === exId ? fn(e) : e)) })) });
  const findEx = (id: string) => routine.blocks.flatMap((b) => b.exercises).find((e) => e.id === id)!;

  return (
    <Sheet
      title="Antes de empezar"
      onClose={onClose}
      footer={
        <button className="btn big primary" onClick={onStart}>
          {issues.length ? 'Empezar de todos modos' : '▶ Empezar'}
        </button>
      }
    >
      {issues.length === 0 ? (
        <p className="notice ok">Todo confirmado. ¡Listo para entrenar!</p>
      ) : (
        <p className="muted">Estos datos no están claros. Edítalos o confírmalos tal como están; la app no inventa valores.</p>
      )}
      <ul className="issues">
        {issues.map((i) => {
          const ex = findEx(i.exerciseId);
          const p = i.paramId ? ex.params.find((x) => x.id === i.paramId) : null;
          return (
            <li key={`${i.exerciseId}-${i.paramId ?? i.kind}`} className="card">
              <b>{i.title}</b>
              <p className="muted">{i.text}</p>
              {p && (
                <div className="param-fix">
                  <input
                    value={p.value}
                    onChange={(e) => patchEx(ex.id, (x) => ({ ...x, params: x.params.map((y) => (y.id === p.id ? { ...y, value: e.target.value } : y)) }))}
                    aria-label={`Valor de ${p.label}`}
                  />
                  {p.unitOptions && (
                    <select
                      value={p.unit}
                      onChange={(e) => patchEx(ex.id, (x) => ({ ...x, params: x.params.map((y) => (y.id === p.id ? { ...y, unit: e.target.value } : y)) }))}
                      aria-label="Unidad"
                    >
                      <option value="">Unidad…</option>
                      {p.unitOptions.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  )}
                  <button
                    className="btn sm ok"
                    disabled={!!p.unitOptions && !p.unit}
                    onClick={() => patchEx(ex.id, (x) => ({ ...x, params: x.params.map((y) => (y.id === p.id ? { ...y, pending: false, note: undefined } : y)) }))}
                  >
                    Confirmar {paramText(p)}
                  </button>
                </div>
              )}
              {i.kind === 'duracion' && (
                <div className="param-fix">
                  <input
                    inputMode="numeric"
                    placeholder={ex.mode === 'tiempo' ? 'segundos' : 'repeticiones'}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/\D/g, '')) || null;
                      patchEx(ex.id, (x) => (x.mode === 'tiempo' ? { ...x, seconds: n } : { ...x, reps: n }));
                    }}
                    aria-label="Duración"
                  />
                  <span className="muted">{ex.mode === 'tiempo' ? 'segundos' : 'repeticiones'}</span>
                </div>
              )}
              {i.kind === 'ejercicio' && (
                <div className="row">
                  <button className="btn sm" onClick={() => onEdit(ex.id)}>
                    ✎ Editar ejercicio
                  </button>
                  <button className="btn sm ok" onClick={() => patchEx(ex.id, (x) => ({ ...x, review: null }))}>
                    Confirmar tal como está
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
