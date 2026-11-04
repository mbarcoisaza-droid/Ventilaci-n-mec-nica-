/** Instancias de alarmas por día y exportación a calendario (.ics). */
import { addDays, diffDays, fromMin, ISODate, rangeDates, toMin } from './dates';
import { AppState } from './model';
import { dayBlocks, dayType as TYPE_OF, inPlan } from './plan';

export type AlarmKind = 'kaplan' | 'gym' | 'sleepPrep' | 'endOfDay' | 'weekly' | 'milestone';

export interface AlarmInstance {
  id: string;
  date: ISODate;
  kind: AlarmKind;
  baseTime: string;
  time: string; // hora efectiva (reprogramada o pospuesta)
  title: string;
  body: string;
  dismissed: boolean;
  fired: boolean;
  snoozed: boolean;
  rescheduled: boolean;
}

export const ALARM_LABEL: Record<AlarmKind, string> = {
  kaplan: 'Bloque Kaplan',
  gym: 'Ejercicio',
  sleepPrep: 'Prepararse para dormir',
  endOfDay: 'Revisión de pendientes',
  weekly: 'Meta semanal',
  milestone: 'Hito',
};

export function alarmsForDay(s: AppState, d: ISODate): AlarmInstance[] {
  if (!inPlan(s, d)) return [];
  const cfg = s.alarms;
  const raw: Omit<AlarmInstance, 'time' | 'dismissed' | 'fired' | 'snoozed' | 'rescheduled'>[] = [];
  for (const blk of dayBlocks(s, d)) {
    if (blk.kind === 'kaplan' && cfg.kaplan.enabled) {
      raw.push({
        id: `${d}|kaplan|${blk.id}`, date: d, kind: 'kaplan', baseTime: fromMin(toMin(blk.start) - cfg.kaplan.lead),
        title: /kaplan/i.test(blk.label) ? blk.label : `Kaplan: ${blk.label}`,
        body: `${blk.start}–${blk.end}${blk.questions ? ` · meta ${blk.questions} preguntas` : ''}`,
      });
    }
    if (blk.kind === 'gym' && cfg.gym.enabled) {
      raw.push({
        id: `${d}|gym|${blk.id}`, date: d, kind: 'gym', baseTime: fromMin(toMin(blk.start) - cfg.gym.lead),
        title: 'Hora del ejercicio', body: `${blk.label} · ${blk.start}–${blk.end}`,
      });
    }
  }
  if (cfg.sleepPrep.enabled && TYPE_OF(s, d) !== 'exam') {
    raw.push({
      id: `${d}|sleepPrep`, date: d, kind: 'sleepPrep', baseTime: fromMin(toMin(s.settings.sleep.bed) - cfg.sleepPrep.lead),
      title: 'Rutina para dormir', body: `Acostarse a las ${s.settings.sleep.bed} · meta ${s.settings.sleep.minHours}–${s.settings.sleep.maxHours} h de sueño`,
    });
  }
  if (cfg.endOfDay.enabled) {
    raw.push({
      id: `${d}|endOfDay`, date: d, kind: 'endOfDay', baseTime: cfg.endOfDay.time,
      title: 'Revisión de pendientes', body: 'Registra tus preguntas, marca el checklist y completa el día.',
    });
  }
  if (cfg.weekly.enabled && d <= s.settings.newDeadline) {
    raw.push({
      id: `${d}|weekly`, date: d, kind: 'weekly', baseTime: cfg.weekly.time,
      title: 'Control de la meta semanal', body: 'Solo avisa si vas por debajo de la meta semanal.',
    });
  }
  if (cfg.milestone.enabled) {
    for (const m of s.milestones) {
      const left = diffDays(d, m.date);
      if (left >= 0 && left <= cfg.milestone.daysBefore) {
        raw.push({
          id: `${d}|milestone|${m.id}`, date: d, kind: 'milestone', baseTime: cfg.milestone.time,
          title: left === 0 ? `Hoy: ${m.label}` : `Faltan ${left} día${left === 1 ? '' : 's'}: ${m.label}`,
          body: m.cumulative ? `Meta acumulada: ${m.cumulative} preguntas nuevas.` : m.date,
        });
      }
    }
  }
  return raw
    .map((a) => {
      const st = s.alarmState[a.id] || {};
      const time = st.snoozeUntil || st.rescheduled || a.baseTime;
      return {
        ...a, time, dismissed: !!st.dismissed, fired: !!st.firedAt, snoozed: !!st.snoozeUntil, rescheduled: !!st.rescheduled,
      };
    })
    .sort((x, y) => x.time.localeCompare(y.time));
}

/** Alarmas que deben sonar ahora (vencidas hace menos de 60 min, no descartadas ni ya disparadas). */
export function dueAlarms(s: AppState, d: ISODate, nowMin: number): AlarmInstance[] {
  return alarmsForDay(s, d).filter((a) => !a.dismissed && !a.fired && toMin(a.time) <= nowMin && nowMin - toMin(a.time) < 60);
}

// ---------- exportación iCalendar ----------

const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
const icsDate = (d: ISODate) => d.replace(/-/g, '');
const icsDT = (d: ISODate, hhmm: string) => `${icsDate(d)}T${hhmm.replace(':', '')}00`;

function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function buildICS(s: AppState, from: ISODate, to: ISODate): { ics: string; count: number } {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plan Kaplan//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Plan Kaplan'];
  let count = 0;
  const ev = (uid: string, d: ISODate, start: string, end: string, summary: string, desc: string, alarmMin: number | null) => {
    const endD = toMin(end) <= toMin(start) ? addDays(d, 1) : d;
    lines.push('BEGIN:VEVENT', `UID:${uid.replace(/[^\w.-]/g, '-')}@plan-kaplan`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsDT(d, start)}`, `DTEND:${icsDT(endD, end)}`, `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(desc)}`);
    if (alarmMin != null) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
    count++;
  };
  const cfg = s.alarms;
  for (const d of rangeDates(from, to)) {
    if (!inPlan(s, d)) continue;
    const alarms = alarmsForDay(s, d);
    const byId = new Map(alarms.map((a) => [a.id, a]));
    for (const blk of dayBlocks(s, d)) {
      if (blk.kind === 'kaplan' || blk.kind === 'gym') {
        const a = byId.get(`${d}|${blk.kind}|${blk.id}`);
        const enabled = blk.kind === 'kaplan' ? cfg.kaplan.enabled : cfg.gym.enabled;
        const lead = a && a.rescheduled ? Math.max(0, toMin(blk.start) - toMin(a.time)) : blk.kind === 'kaplan' ? cfg.kaplan.lead : cfg.gym.lead;
        const skip = a?.dismissed;
        ev(`${d}-${blk.id}`, d, blk.start, blk.end, blk.kind === 'kaplan' ? `📚 ${blk.label}` : `🏋️ ${blk.label}`,
          blk.questions ? `Meta: ${blk.questions} preguntas nuevas` : 'Plan Kaplan', enabled && !skip ? lead : null);
      }
    }
    for (const a of alarms) {
      if (a.dismissed || a.kind === 'kaplan' || a.kind === 'gym' || a.kind === 'weekly') continue;
      const dur = a.kind === 'sleepPrep' ? cfg.sleepPrep.lead || 15 : 15;
      ev(a.id, d, a.time, fromMin(toMin(a.time) + dur), a.title, a.body, 0);
    }
  }
  lines.push('END:VCALENDAR');
  return { ics: lines.map(fold).join('\r\n') + '\r\n', count };
}
