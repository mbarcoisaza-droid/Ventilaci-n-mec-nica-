/** Utilidades de fechas en hora local, con fechas ISO 'AAAA-MM-DD' y horas 'HH:MM'. */

export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // mediodía: evita saltos por horario de verano
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function rangeDates(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = lunes … 6 = domingo */
export function weekdayMon(s: ISODate): number {
  return (parseISO(s).getDay() + 6) % 7;
}

export function weekStart(s: ISODate): ISODate {
  return addDays(s, -weekdayMon(s));
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

export function monthGrid(year: number, month0: number): ISODate[] {
  const first = toISO(new Date(year, month0, 1, 12));
  const start = weekStart(first);
  const last = toISO(new Date(year, month0 + 1, 0, 12));
  const end = addDays(weekStart(last), 6);
  return rangeDates(start, end);
}

export function todayISO(now = new Date()): ISODate {
  return toISO(now);
}

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMin(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export const DOW_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const DOW_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function fmtLong(s: ISODate): string {
  const d = parseISO(s);
  return `${DOW_LONG[weekdayMon(s)]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function fmtShort(s: ISODate): string {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export const fmtNum = (n: number) => n.toLocaleString('es-CO');
