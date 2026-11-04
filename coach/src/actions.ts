/** Transformaciones puras del estado. */
import { todayISO } from './dates';
import { LibContent } from './library';
import { AppState, Exercise, HistoryEntry, Routine, Session, contentFields, groupKeyOf, stripAutoReview, uid } from './model';

export function upsertRoutine(s: AppState, r: Routine): AppState {
  const rr = { ...r, updatedAt: new Date().toISOString() };
  const exists = s.routines.some((x) => x.id === r.id);
  return { ...s, routines: exists ? s.routines.map((x) => (x.id === r.id ? rr : x)) : [...s.routines, rr] };
}

export function deleteRoutine(s: AppState, id: string): AppState {
  return {
    ...s,
    routines: s.routines.filter((x) => x.id !== id),
    // se conservan las sesiones con historial; se quitan las pendientes
    sessions: s.sessions.filter((x) => x.routineId !== id || x.status === 'completada'),
    reminders: s.reminders.routineId === id ? { ...s.reminders, routineId: s.routines.find((x) => x.id !== id)?.id ?? '' } : s.reminders,
  };
}

export function duplicateRoutine(r: Routine): Routine {
  const copy: Routine = JSON.parse(JSON.stringify(r));
  copy.id = uid();
  copy.name = `${r.name} (copia)`;
  copy.sample = false;
  copy.blocks.forEach((b) => {
    b.id = uid();
    b.exercises.forEach((e) => {
      e.id = uid();
      e.params.forEach((p) => (p.id = uid()));
    });
  });
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  return copy;
}

export function scheduleSession(s: AppState, routineId: string, date: string, time: string): AppState {
  const ses: Session = { id: uid(), routineId, date, time, status: 'pendiente', rescheduledFrom: [] };
  return { ...s, sessions: [...s.sessions, ses] };
}

export const patchSession = (s: AppState, id: string, p: Partial<Session>): AppState => ({
  ...s,
  sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...p } : x)),
});

export function reschedule(s: AppState, id: string, date: string, time: string): AppState {
  const ses = s.sessions.find((x) => x.id === id);
  if (!ses) return s;
  return patchSession(s, id, {
    date,
    time,
    status: 'pendiente',
    rescheduledFrom: ses.date !== date ? [...ses.rescheduledFrom, ses.date] : ses.rescheduledFrom,
  });
}

export function startWorkout(s: AppState, routineId: string, sessionId: string | null): AppState {
  const r = s.routines.find((x) => x.id === routineId);
  if (!r) return s;
  let sessions = s.sessions;
  // si hay una sesión pendiente de esa rutina hoy, se usa en lugar de crear otra
  let sid = sessionId ?? s.sessions.find((x) => x.routineId === routineId && x.date === todayISO() && x.status === 'pendiente')?.id ?? null;
  if (!sid) {
    sid = uid();
    sessions = [...sessions, { id: sid, routineId, date: todayISO(), time: '', status: 'en_curso', rescheduledFrom: [], adhoc: true }];
  } else {
    sessions = sessions.map((x) => (x.id === sid ? { ...x, status: 'en_curso' } : x));
  }
  return {
    ...s,
    sessions,
    active: {
      routineId,
      sessionId: sid,
      snapshot: JSON.parse(JSON.stringify(r)),
      lowImpact: r.useLowImpact,
      index: 0,
      results: {},
      spent: {},
      startedAt: new Date().toISOString(),
    },
  };
}

/** Abandona sin guardar: la sesión vuelve a quedar pendiente. */
export function discardWorkout(s: AppState): AppState {
  const a = s.active;
  if (!a) return s;
  return {
    ...s,
    active: null,
    sessions: s.sessions
      .map((x) => (x.id === a.sessionId && x.status === 'en_curso' ? { ...x, status: 'pendiente' as const } : x))
      // una sesión creada al vuelo (sin programar) se elimina
      .filter((x) => !(x.id === a.sessionId && x.adhoc && !x.historyId)),
  };
}

export function finishWorkout(s: AppState, entry: HistoryEntry): AppState {
  return {
    ...s,
    active: null,
    history: [entry, ...s.history],
    sessions: s.sessions.map((x) => (x.id === entry.sessionId ? { ...x, status: 'completada', historyId: entry.id } : x)),
  };
}

/**
 * Guarda la ficha (gráfico + descripción + video) de un ejercicio en todas las rutinas donde aparece,
 * con cualquiera de sus nombres, y la recuerda para rutinas futuras. No cambia series, repeticiones ni tiempos.
 */
export function applyExerciseContent(s: AppState, key: string, content: LibContent, opts: { videoUrl?: string; confirm: boolean }): AppState {
  const patch = (e: Exercise): Exercise =>
    groupKeyOf(e) !== key
      ? e
      : {
          ...e,
          ...contentFields(content),
          videoUrl: opts.videoUrl ?? e.videoUrl,
          custom: true,
          review: opts.confirm ? stripAutoReview(e.review) : e.review,
        };
  const routines = s.routines.map((r) =>
    r.blocks.some((b) => b.exercises.some((e) => groupKeyOf(e) === key))
      ? { ...r, updatedAt: new Date().toISOString(), blocks: r.blocks.map((b) => ({ ...b, exercises: b.exercises.map(patch) })) }
      : r,
  );
  return {
    ...s,
    routines,
    active: s.active ? { ...s.active, snapshot: { ...s.active.snapshot, blocks: s.active.snapshot.blocks.map((b) => ({ ...b, exercises: b.exercises.map(patch) })) } } : null,
    exerciseLib: { ...(s.exerciseLib ?? {}), [key]: content },
  };
}

/** Contenido actual de un ejercicio en forma de ficha. */
export const contentOf = (e: Exercise): LibContent => ({
  summary: e.summary,
  start: e.start,
  steps: e.steps,
  breathing: e.breathing,
  keyPoints: e.keyPoints,
  errors: e.errors,
  equipment: e.equipment,
  pose: e.pose,
  easier: e.easier,
  harder: e.harder,
  lowImpact: e.lowImpact,
});
