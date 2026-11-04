/** Exportación e importación del progreso (JSON completo o CSV). */
import { ISODate, rangeDates } from './dates';
import { AppState, DayLog, DayStatus, DayType, DAY_TYPES, emptyLog, migrate, ReviewItem, uid } from './model';
import { computePlan, dayType, getLog } from './plan';

export function exportJSON(s: AppState): string {
  return JSON.stringify({ app: 'plan-kaplan', exportedAt: new Date().toISOString(), ...s }, null, 2);
}

export function importJSON(text: string): AppState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  return migrate(raw);
}

const q = (v: unknown) => {
  const t = v == null ? '' : String(v);
  return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const row = (cells: unknown[]) => cells.map(q).join(',');

export const DAYS_HEADER = ['fecha', 'tipo', 'meta_nuevas', 'nuevas_realizadas', 'repaso', 'explicaciones', 'registro_errores', 'ejercicio', 'sueno', 'estado', 'nota'];
export const REVIEW_HEADER = ['id', 'fecha', 'tema', 'tipo', 'referencia', 'nota', 'resuelta'];

export function exportDaysCSV(s: AppState, today: ISODate): string {
  const plan = computePlan(s, today);
  const lines = [row(DAYS_HEADER)];
  for (const d of rangeDates(s.settings.startDate, s.settings.examDate)) {
    const l = getLog(s, d);
    const yn = (b: boolean) => (b ? 'si' : 'no');
    lines.push(row([d, dayType(s, d), plan.target(d), l.newDone ?? '', l.reviewDone, yn(l.explanations), yn(l.loggedErrors), yn(l.exercise), yn(l.sleep), l.status, s.days[d]?.note ?? '']));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function exportReviewCSV(s: AppState): string {
  const lines = [row(REVIEW_HEADER)];
  for (const r of s.review) lines.push(row([r.id, r.date, r.topic, r.kind === 'incorrect' ? 'incorrecta' : 'dudosa', r.ref, r.note, r.resolved ? 'si' : 'no']));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function parseCSV(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const firstLine = t.split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) {
      cur.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      cur.push(cell);
      if (cur.some((x) => x !== '')) rows.push(cur);
      cur = [];
      cell = '';
    } else cell += c;
  }
  cur.push(cell);
  if (cur.some((x) => x !== '')) rows.push(cur);
  return rows;
}

const yes = (v: string | undefined) => /^(si|sí|s|yes|y|true|1|x)$/i.test((v || '').trim());
const STATUSES: DayStatus[] = ['pending', 'completed', 'incomplete', 'rescheduled'];

/** Restaura desde CSV (diario o lista de repaso) sobre el estado actual, sin borrar lo demás. */
export function importCSV(s: AppState, text: string): { state: AppState; summary: string } {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('El CSV no tiene filas de datos.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  if (col('fecha') >= 0 && col('nuevas_realizadas') >= 0) {
    const logs = { ...s.logs };
    const days = { ...s.days };
    let n = 0;
    for (const r of rows.slice(1)) {
      const d = (r[col('fecha')] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const nd = (r[col('nuevas_realizadas')] || '').trim();
      const st = (r[col('estado')] || 'pending').trim() as DayStatus;
      const l: DayLog = {
        ...emptyLog(),
        ...logs[d],
        newDone: nd === '' ? null : Math.max(0, parseInt(nd, 10) || 0),
        reviewDone: Math.max(0, parseInt(r[col('repaso')] || '0', 10) || 0),
        explanations: yes(r[col('explicaciones')]),
        loggedErrors: yes(r[col('registro_errores')]),
        exercise: yes(r[col('ejercicio')]),
        sleep: yes(r[col('sueno')]),
        status: STATUSES.includes(st) ? st : 'pending',
      };
      const meta = parseInt(r[col('meta_nuevas')] || '', 10);
      if (l.status !== 'pending' && !Number.isNaN(meta)) l.frozenTarget = meta;
      logs[d] = l;
      const tp = (r[col('tipo')] || '').trim() as DayType;
      if (DAY_TYPES.includes(tp)) days[d] = { ...days[d], type: tp };
      const note = col('nota') >= 0 ? r[col('nota')] : undefined;
      if (note) days[d] = { ...days[d], note };
      n++;
    }
    return { state: { ...s, logs, days }, summary: `${n} días restaurados desde CSV.` };
  }
  if (col('tema') >= 0 && col('fecha') >= 0) {
    const byId = new Map(s.review.map((r) => [r.id, r]));
    let n = 0;
    for (const r of rows.slice(1)) {
      const id = (col('id') >= 0 && r[col('id')]) || uid('r');
      const item: ReviewItem = {
        id,
        date: (r[col('fecha')] || '').trim(),
        topic: (r[col('tema')] || '').trim(),
        kind: /dud/i.test(r[col('tipo')] || '') ? 'doubt' : 'incorrect',
        ref: col('referencia') >= 0 ? r[col('referencia')] || '' : '',
        note: col('nota') >= 0 ? r[col('nota')] || '' : '',
        resolved: yes(r[col('resuelta')]),
      };
      byId.set(id, item);
      n++;
    }
    return { state: { ...s, review: [...byId.values()] }, summary: `${n} preguntas de repaso restauradas desde CSV.` };
  }
  throw new Error('No se reconocen las columnas. Usa un CSV exportado por esta app (diario o repaso).');
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
