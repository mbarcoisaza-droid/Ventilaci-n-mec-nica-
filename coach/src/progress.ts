/** Cumplimiento, racha y exportación de calendario. */
import { addDays, todayISO, weekStart } from './dates';
import { AppState, Session } from './model';

/**
 * Racha: sesiones completadas seguidas, contando hacia atrás desde la más reciente.
 * Las sesiones pendientes no la rompen (pueden reprogramarse); solo la rompe una sesión
 * que la persona marcó como omitida.
 */
export function streak(sessions: Session[], today = todayISO()) {
  const relevant = sessions
    .filter((s) => (s.status === 'completada' || s.status === 'omitida') && s.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  let n = 0;
  for (const s of relevant) {
    if (s.status === 'omitida') break;
    n++;
  }
  return n;
}

export function compliance(s: AppState, today = todayISO()) {
  const from = weekStart(today);
  const to = addDays(from, 6);
  const week = s.sessions.filter((x) => x.date >= from && x.date <= to);
  const done = week.filter((x) => x.status === 'completada').length;
  const pending = week.filter((x) => x.status === 'pendiente' || x.status === 'en_curso').length;
  const daysDone = new Set(week.filter((x) => x.status === 'completada').map((x) => x.date)).size;
  return { from, to, done, pending, daysDone, goal: s.settings.weeklyGoal, streak: streak(s.sessions, today) };
}

/** Sesiones de fechas pasadas que siguen pendientes (para reprogramar, sin juzgar). */
export const overdue = (s: AppState, today = todayISO()) =>
  s.sessions.filter((x) => x.status === 'pendiente' && x.date < today).sort((a, b) => (a.date < b.date ? -1 : 1));

export function weekly(s: AppState, weeks = 8, today = todayISO()) {
  const cur = weekStart(today);
  const out: { from: string; done: number; scheduled: number; minutes: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(cur, -7 * i);
    const to = addDays(from, 6);
    const ss = s.sessions.filter((x) => x.date >= from && x.date <= to && x.status !== 'omitida');
    const mins = s.history.filter((h) => h.date >= from && h.date <= to).reduce((a, h) => a + h.durationSec / 60, 0);
    out.push({ from, done: ss.filter((x) => x.status === 'completada').length, scheduled: ss.length, minutes: Math.round(mins) });
  }
  return out;
}

const icsDate = (date: string, time: string) => `${date.replace(/-/g, '')}T${(time || '08:00').replace(':', '')}00`;
const esc = (t: string) => t.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Archivo .ics con las sesiones pendientes: el calendario del teléfono avisa aunque la app esté cerrada. */
export function buildICS(s: AppState, today = todayISO()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mi Coach//ES', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  for (const x of s.sessions) {
    if (x.status !== 'pendiente' || x.date < today) continue;
    const r = s.routines.find((y) => y.id === x.routineId);
    if (!r) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${x.id}@mi-coach`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(x.date, x.time)}`,
      'DURATION:PT45M',
      `SUMMARY:${esc(`Entrenamiento: ${r.name}`)}`,
      `DESCRIPTION:${esc('Abre Mi Coach para seguir la rutina paso a paso.')}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`Hora de entrenar: ${r.name}`)}`,
      'TRIGGER:-PT10M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
