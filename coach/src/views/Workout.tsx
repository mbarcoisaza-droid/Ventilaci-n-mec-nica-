/** Modo entrenamiento: un ejercicio a la vez con temporizador, descansos y resumen final. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { finishWorkout, discardWorkout } from '../actions';
import { ExerciseInfo, ExerciseMedia } from '../components/ExerciseMedia';
import { Thumb } from '../components/Illustration';
import { Sheet } from '../components/ui';
import { fmtClock, fmtDur, todayISO } from '../dates';
import { AppState, BLOCK_ICON, Discomfort, ExerciseLog, HistoryEntry, uid } from '../model';
import { tone, unlockAudio, vibrate } from '../notify';
import { Step, buildSteps, displayName, estimateSeconds, paramText, stepSeconds } from '../sequence';

type Status = 'listo' | 'corriendo' | 'pausado';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  onClose: () => void;
}

const FEELINGS = [
  { v: 1, e: '😣', t: 'Muy exigente' },
  { v: 2, e: '😕', t: 'Exigente' },
  { v: 3, e: '😐', t: 'Normal' },
  { v: 4, e: '🙂', t: 'Bien' },
  { v: 5, e: '😄', t: 'Muy bien' },
];

export function Workout({ state, update, onClose }: Props) {
  const active = state.active!;
  const routine = active.snapshot;
  const steps = useMemo(() => buildSteps(routine), [routine]);
  const lowImpact = active.lowImpact;
  const { sound, vibrate: vib, autoAdvance } = state.settings;

  const [index, setIndex] = useState(Math.min(active.index, steps.length));
  const [results, setResults] = useState(active.results);
  const [spent, setSpent] = useState(active.spent);
  const [status, setStatus] = useState<Status>('listo');
  const [remaining, setRemaining] = useState(() => stepSeconds(steps[index] ?? steps[0]) * 1000);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<'entreno' | 'resumen'>(index >= steps.length ? 'resumen' : 'entreno');
  const [outcome, setOutcome] = useState<'completada' | 'detenida'>('completada');
  const [discomfort, setDiscomfort] = useState<Discomfort | null>(null);
  const [stopSheet, setStopSheet] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [endedAt, setEndedAt] = useState<string | null>(null);

  const endAt = useRef(0);
  const lastBeep = useRef(-1);
  const startedRun = useRef(0);

  const step: Step | undefined = steps[index];
  const timed = step ? step.seconds != null || step.kind === 'descanso' : false;

  // persistir el avance para poder continuar si se cierra la app
  useEffect(() => {
    update((s) => (s.active ? { ...s, active: { ...s.active, index, results, spent } } : s));
  }, [index, results, spent, update]);

  // mantener la pantalla encendida mientras corre el temporizador
  useEffect(() => {
    if (status !== 'corriendo') return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [status]);

  const loadStep = useCallback(
    (i: number, autostart: boolean) => {
      const st = steps[i];
      setIndex(i);
      setElapsed(0);
      lastBeep.current = -1;
      if (!st) {
        setStatus('listo');
        setEndedAt(new Date().toISOString());
        setPhase('resumen');
        if (sound) tone(880, 400);
        return;
      }
      const ms = stepSeconds(st) * 1000;
      setRemaining(ms);
      if (autostart) {
        endAt.current = Date.now() + ms;
        startedRun.current = Date.now();
        setStatus('corriendo');
      } else setStatus('listo');
    },
    [steps, sound],
  );

  /** Avanza tras terminar el paso actual. */
  const advance = useCallback(
    (from: number) => {
      const cur = steps[from];
      const next = steps[from + 1];
      if (!next) return loadStep(from + 1, false);
      const sameBlock = cur && next.blockIdx === cur.blockIdx;
      const auto = next.kind === 'descanso' || (sameBlock && autoAdvance && (next.seconds != null || next.kind !== 'trabajo'));
      if (sound) tone(next.kind === 'descanso' ? 520 : 880, 260);
      if (vib) vibrate([200]);
      loadStep(from + 1, auto);
    },
    [steps, autoAdvance, loadStep, sound, vib],
  );

  const markWork = (i: number, r: 'hecho' | 'saltado', secs: number) => {
    setResults((x) => ({ ...x, [i]: r }));
    setSpent((x) => ({ ...x, [i]: secs }));
  };

  // temporizador basado en la hora real (resiste la suspensión de pestañas)
  useEffect(() => {
    if (status !== 'corriendo' || phase !== 'entreno' || !step) return;
    const iv = setInterval(() => {
      if (timed) {
        const left = endAt.current - Date.now();
        setRemaining(Math.max(0, left));
        const sec = Math.ceil(left / 1000);
        if (sec <= 3 && sec >= 1 && sec !== lastBeep.current) {
          lastBeep.current = sec;
          if (sound) tone(660, 120);
        }
        if (left <= 0) {
          clearInterval(iv);
          if (step.kind === 'trabajo') markWork(index, 'hecho', stepSeconds(step));
          advance(index);
        }
      } else {
        setElapsed(Date.now() - startedRun.current);
      }
    }, 200);
    return () => clearInterval(iv);
  }, [status, phase, step, timed, index, advance, sound]);

  const start = () => {
    unlockAudio();
    if (timed) endAt.current = Date.now() + remaining;
    startedRun.current = Date.now() - elapsed;
    setStatus('corriendo');
  };
  const pause = () => {
    if (timed) setRemaining(Math.max(0, endAt.current - Date.now()));
    else setElapsed(Date.now() - startedRun.current);
    setStatus('pausado');
  };
  const adjust = (d: number) => {
    if (status === 'corriendo') endAt.current = Math.max(Date.now() + 1000, endAt.current + d * 1000);
    setRemaining((r) => Math.max(1000, r + d * 1000));
  };
  const finishExercise = () => {
    if (!step) return;
    if (step.kind === 'trabajo') {
      const used = timed ? Math.round((stepSeconds(step) * 1000 - (status === 'corriendo' ? endAt.current - Date.now() : remaining)) / 1000) : Math.round((status === 'corriendo' ? Date.now() - startedRun.current : elapsed) / 1000);
      markWork(index, 'hecho', Math.max(0, used));
    }
    advance(index);
  };
  const skip = () => {
    if (!step) return;
    if (step.kind === 'trabajo') {
      markWork(index, 'saltado', 0);
      // salta también el descanso que sigue
      let j = index + 1;
      while (steps[j] && steps[j].kind === 'descanso') j++;
      loadStep(j, false);
    } else {
      const next = steps[index + 1];
      loadStep(index + 1, !!next && autoAdvance && next.blockIdx === step.blockIdx && next.seconds != null);
    }
  };
  const back = () => {
    let j = index - 1;
    while (j > 0 && steps[j].kind === 'descanso') j--;
    if (j < 0) j = 0;
    setResults((x) => {
      const y = { ...x };
      delete y[j];
      return y;
    });
    loadStep(j, false);
  };

  const stopNow = (d: Discomfort | null) => {
    setDiscomfort(d);
    setOutcome('detenida');
    setStatus('pausado');
    setEndedAt(new Date().toISOString());
    setPhase('resumen');
    setStopSheet(false);
  };

  if (phase === 'resumen') {
    return (
      <Summary
        state={state}
        steps={steps}
        results={results}
        spent={spent}
        outcome={outcome}
        discomfort={discomfort}
        endedAt={endedAt ?? new Date().toISOString()}
        onBack={() => {
          setPhase('entreno');
          setOutcome('completada');
          loadStep(Math.min(index, steps.length - 1), false);
        }}
        onSave={(entry) => {
          update((s) => finishWorkout(s, entry));
          onClose();
        }}
      />
    );
  }

  if (!step) return null;
  const ex = step.exercise;
  const name = displayName(ex, lowImpact);
  const workSteps = steps.filter((s) => s.kind === 'trabajo').length;
  const workIndex = steps.slice(0, index + 1).filter((s) => s.kind === 'trabajo').length;
  const total = stepSeconds(step) * 1000;
  const shown = timed ? remaining : elapsed;
  const pct = timed && total ? 1 - remaining / total : 0;
  const nextWork = steps.slice(index + 1).find((s) => s.kind === 'trabajo');
  const R = 88;
  const C = 2 * Math.PI * R;
  const isRest = step.kind === 'descanso';
  const blockChanged = !isRest && status === 'listo' && (index === 0 || steps[index - 1]?.blockIdx !== step.blockIdx);

  return (
    <div className={`workout ${isRest ? 'resting' : ''}`}>
      <header className="wo-head">
        <button className="iconbtn" onClick={() => (status === 'corriendo' && pause(), setStopSheet(true))} aria-label="Detener o salir">
          ✕
        </button>
        <div className="wo-title">
          <b>{routine.name}</b>
          <span>
            {BLOCK_ICON[step.block.kind]} {step.block.title} · Ronda {step.round} de {step.rounds}
          </span>
        </div>
        <span className="wo-count">
          {workIndex}/{workSteps}
        </span>
      </header>
      <div className="wo-progress" aria-hidden>
        <i style={{ width: `${(index / steps.length) * 100}%` }} />
      </div>

      <main className="wo-main">
        {blockChanged && <p className="notice">Nuevo bloque: {step.block.title}. Pulsa «Empezar» cuando estés listo.</p>}
        {isRest ? (
          <div className="rest-card">
            <p className="eyebrow">{step.restKind === 'rondas' ? 'Descanso entre rondas' : 'Descanso'}</p>
            {nextWork && (
              <div className="next-up">
                <div className="next-thumb">
                  <Thumb pose={nextWork.exercise.pose} />
                </div>
                <div>
                  <span className="muted">Sigue</span>
                  <b>{displayName(nextWork.exercise, lowImpact)}</b>
                  <span className="muted">
                    {nextWork.seconds != null ? fmtDur(nextWork.seconds) : nextWork.reps != null ? `${nextWork.reps} repeticiones` : ''}
                    {nextWork.round !== step.round ? ` · Ronda ${nextWork.round}` : ''}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 className="wo-name">{name}</h1>
            {lowImpact && ex.lowImpact && <p className="tiny muted center">Variante de bajo impacto · original: {ex.name}</p>}
            {ex.params.length > 0 && (
              <div className="wo-params">
                {ex.params.map((p) => (
                  <span key={p.id} className={`chip ${p.pending ? 'warn' : ''}`}>
                    {p.label}: <b>{paramText(p) || '—'}</b>
                    {p.pending ? ' (por definir)' : ''}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="timer" aria-live="polite">
          <svg viewBox="0 0 200 200">
            <circle cx="100" cy="100" r={R} className="track" />
            {timed && <circle cx="100" cy="100" r={R} className="prog" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 100 100)" />}
          </svg>
          <div className="timer-txt">
            {step.reps != null && !isRest ? (
              <>
                <b>{step.reps}</b>
                <span>repeticiones</span>
                <small>{fmtClock(shown / 1000)}</small>
              </>
            ) : (
              <>
                <b>{fmtClock(shown / 1000)}</b>
                <span>{isRest ? 'descanso' : status === 'listo' ? 'listo' : status === 'pausado' ? 'en pausa' : 'en curso'}</span>
              </>
            )}
          </div>
        </div>
        {timed && (
          <div className="adjust">
            <button className="btn ghost sm" onClick={() => adjust(-10)} aria-label="Restar 10 segundos">
              −10 s
            </button>
            <button className="btn ghost sm" onClick={() => adjust(10)} aria-label="Sumar 10 segundos">
              +10 s
            </button>
          </div>
        )}

        <div className="wo-ctrls">
          {status === 'corriendo' ? (
            <button className="btn big" onClick={pause}>
              ⏸ Pausar
            </button>
          ) : (
            <button className="btn big primary" onClick={start}>
              ▶ {status === 'pausado' ? 'Reanudar' : 'Empezar'}
            </button>
          )}
          <button className="btn big ok" onClick={finishExercise}>
            ✓ {isRest ? 'Terminar descanso' : 'Terminar ejercicio'}
          </button>
          <div className="row2">
            <button className="btn" onClick={back} disabled={index === 0}>
              ← Volver
            </button>
            <button className="btn" onClick={skip}>
              Saltar →
            </button>
          </div>
        </div>

        {!isRest && (
          <section className="wo-guide">
            <ExerciseMedia ex={ex} compact />
            <button className="btn ghost wide" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo}>
              {showInfo ? 'Ocultar instrucciones' : 'Ver instrucciones'}
            </button>
            {showInfo && <ExerciseInfo ex={ex} lowImpact={lowImpact} />}
            {!showInfo && ex.steps.length > 0 && (
              <ol className="steps short">
                {ex.steps.slice(0, 3).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
          </section>
        )}
        {!isRest && nextWork && (
          <p className="tiny muted center">
            Después: {displayName(nextWork.exercise, lowImpact)}
          </p>
        )}
        <button className="btn ghost danger wide" onClick={() => (status === 'corriendo' && pause(), setStopSheet(true))}>
          Detener y registrar malestar
        </button>
      </main>

      {stopSheet && (
        <StopSheet
          onClose={() => setStopSheet(false)}
          onStop={stopNow}
          onExit={() => onClose()}
          onDiscard={() => {
            update(discardWorkout);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function StopSheet({ onClose, onStop, onExit, onDiscard }: { onClose: () => void; onStop: (d: Discomfort | null) => void; onExit: () => void; onDiscard: () => void }) {
  const [form, setForm] = useState(false);
  const [d, setD] = useState<Discomfort>({ where: '', intensity: 3, note: '' });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  return (
    <Sheet title={form ? 'Registrar dolor o malestar' : 'Detener entrenamiento'} onClose={onClose}>
      {!form ? (
        <div className="stack">
          <button className="btn big danger" onClick={() => setForm(true)}>
            Detener y registrar dolor o malestar
          </button>
          <button className="btn big" onClick={() => onStop(null)}>
            Terminar la sesión aquí
          </button>
          <button className="btn big ghost" onClick={onExit}>
            Salir y continuar más tarde
          </button>
          {!confirmDiscard ? (
            <button className="linkbtn danger" onClick={() => setConfirmDiscard(true)}>
              Descartar este entrenamiento
            </button>
          ) : (
            <div className="notice warn">
              No se guardará nada de esta sesión. La sesión programada seguirá pendiente.
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn sm danger" onClick={onDiscard}>
                  Sí, descartar
                </button>
                <button className="btn sm ghost" onClick={() => setConfirmDiscard(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <button className="btn ghost" onClick={onClose}>
            Seguir entrenando
          </button>
        </div>
      ) : (
        <div className="stack">
          <label className="field">
            <span className="field-label">¿Dónde lo notas?</span>
            <input value={d.where} onChange={(e) => setD({ ...d, where: e.target.value })} placeholder="Por ejemplo: rodilla derecha, espalda baja" />
          </label>
          <div className="field">
            <span className="field-label">Intensidad (0 = nada, 10 = máxima): {d.intensity}</span>
            <input type="range" min={0} max={10} value={d.intensity} onChange={(e) => setD({ ...d, intensity: Number(e.target.value) })} aria-label="Intensidad" />
          </div>
          <label className="field">
            <span className="field-label">Notas (opcional)</span>
            <textarea rows={3} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Qué ejercicio hacías, cómo empezó…" />
          </label>
          <p className="notice">
            Esta información se guarda para que la compartas con tu entrenador. La app no evalúa ni diagnostica. Si el dolor es intenso, no cede o se acompaña de otros síntomas,
            busca atención profesional.
          </p>
          <button className="btn big danger" onClick={() => onStop(d)}>
            Detener y guardar
          </button>
          <button className="btn ghost" onClick={() => setForm(false)}>
            Volver
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Summary({
  state,
  steps,
  results,
  spent,
  outcome,
  discomfort,
  endedAt,
  onBack,
  onSave,
}: {
  state: AppState;
  steps: Step[];
  results: Record<number, 'hecho' | 'saltado'>;
  spent: Record<number, number>;
  outcome: 'completada' | 'detenida';
  discomfort: Discomfort | null;
  endedAt: string;
  onBack: () => void;
  onSave: (e: HistoryEntry) => void;
}) {
  const a = state.active!;
  const [feeling, setFeeling] = useState<number | null>(null);
  const [effort, setEffort] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const logs: ExerciseLog[] = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.kind === 'trabajo' && results[i])
    .map(({ s, i }) => ({ name: displayName(s.exercise, a.lowImpact), block: s.block.title, round: s.round, status: results[i], seconds: spent[i] ?? 0 }));
  const done = logs.filter((l) => l.status === 'hecho').length;
  const skipped = logs.filter((l) => l.status === 'saltado').length;
  const totalWork = steps.filter((s) => s.kind === 'trabajo').length;
  const duration = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(a.startedAt)) / 1000));
  const planned = estimateSeconds(a.snapshot);

  const save = () =>
    onSave({
      id: uid(),
      sessionId: a.sessionId,
      routineId: a.routineId,
      routineName: a.snapshot.name,
      date: todayISO(),
      startedAt: a.startedAt,
      endedAt,
      durationSec: duration,
      plannedSec: planned,
      outcome,
      exercises: logs,
      feeling,
      effort,
      notes,
      discomfort,
      lowImpact: a.lowImpact,
    });

  return (
    <div className="workout summary">
      <main className="wo-main">
        <div className="sum-hero">
          <div className="sum-icon" aria-hidden>
            {outcome === 'completada' ? '🎉' : '🛑'}
          </div>
          <h1>{outcome === 'completada' ? '¡Entrenamiento terminado!' : 'Sesión detenida'}</h1>
          <p className="muted">{a.snapshot.name}</p>
        </div>
        <div className="stats">
          <div className="stat">
            <b>
              {done}/{totalWork}
            </b>
            <span>ejercicios hechos</span>
          </div>
          <div className="stat">
            <b>{fmtDur(duration)}</b>
            <span>duración real</span>
          </div>
          <div className="stat">
            <b>{fmtDur(planned)}</b>
            <span>estimada</span>
          </div>
        </div>
        {skipped > 0 && <p className="tiny muted center">{skipped} ejercicio(s) saltado(s).</p>}
        {discomfort && (
          <div className="notice warn">
            Malestar registrado{discomfort.where ? ` en ${discomfort.where}` : ''} · intensidad {discomfort.intensity}/10. Se guardará en tu historial para comentarlo con tu entrenador.
          </div>
        )}

        <section className="card">
          <h3>¿Cómo te sentiste?</h3>
          <div className="feelings" role="radiogroup" aria-label="Cómo te sentiste">
            {FEELINGS.map((f) => (
              <button key={f.v} role="radio" aria-checked={feeling === f.v} className={feeling === f.v ? 'on' : ''} onClick={() => setFeeling(f.v)}>
                <span aria-hidden>{f.e}</span>
                <small>{f.t}</small>
              </button>
            ))}
          </div>
          <h4>Esfuerzo percibido (opcional)</h4>
          <div className="rpe" role="radiogroup" aria-label="Esfuerzo percibido de 1 a 10">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} role="radio" aria-checked={effort === n} className={effort === n ? 'on' : ''} onClick={() => setEffort(effort === n ? null : n)}>
                {n}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-label">Comentarios (opcional)</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué te costó, qué ajustarías…" />
          </label>
        </section>

        <details className="card">
          <summary>Ejercicios realizados ({logs.length})</summary>
          <ul className="log">
            {logs.map((l, i) => (
              <li key={i} className={l.status}>
                <span>{l.status === 'hecho' ? '✓' : '↷'}</span>
                {l.name}
                <small>
                  {l.block} · R{l.round}
                  {l.seconds ? ` · ${fmtDur(l.seconds)}` : ''}
                </small>
              </li>
            ))}
            {!logs.length && <li className="muted">Sin ejercicios registrados.</li>}
          </ul>
        </details>

        <button className="btn big primary" onClick={save}>
          Guardar entrenamiento
        </button>
        {outcome === 'detenida' && !discomfort && (
          <button className="btn ghost" onClick={onBack}>
            Volver al entrenamiento
          </button>
        )}
      </main>
    </div>
  );
}
