/** Fechas locales en formato AAAA-MM-DD (sin zonas horarias). */

export const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const todayISO = () => toISO(new Date());
export const addDays = (s: string, n: number) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
/** Lunes de la semana de la fecha. */
export const weekStart = (s: string) => {
  const d = parseISO(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
};
export const dow = (s: string) => parseISO(s).getDay();

export const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Orden de la semana empezando en lunes. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const fmtLong = (s: string) => {
  const d = parseISO(s);
  return `${DOW_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
};
export const fmtShort = (s: string) => {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};

/** Duración legible: 45 s, 3 min, 1 min 30 s, 1 h 5 min. */
export function fmtDur(sec: number) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h} h${m ? ` ${m} min` : ''}`;
  return `${m} min${s ? ` ${s} s` : ''}`;
}
/** Reloj m:ss. */
export const fmtClock = (sec: number) => {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
};
export const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
