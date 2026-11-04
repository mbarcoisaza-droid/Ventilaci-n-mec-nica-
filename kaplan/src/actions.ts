/** Transformaciones puras del estado. */
import { fromMin, ISODate } from './dates';
import { AlarmState, AppState, DayLog, DayPlan, DayStatus, emptyLog, uid } from './model';

export const setLog = (d: ISODate, patch: Partial<DayLog>) => (s: AppState): AppState => ({
  ...s, logs: { ...s.logs, [d]: { ...emptyLog(), ...s.logs[d], ...patch } },
});

export const setDay = (d: ISODate, patch: Partial<DayPlan>) => (s: AppState): AppState => ({
  ...s, days: { ...s.days, [d]: { ...s.days[d], ...patch } },
});

export const addMove = (from: ISODate, to: ISODate, qty: number, reason: string) => (s: AppState): AppState => ({
  ...s, moves: [...s.moves, { id: uid('mv'), from, to, qty, reason }],
});

export const removeMove = (id: string) => (s: AppState): AppState => ({ ...s, moves: s.moves.filter((m) => m.id !== id) });

export const closeDay = (d: ISODate, status: DayStatus, frozenTarget: number) =>
  setLog(d, { status, frozenTarget, closedAt: new Date().toISOString() });

export const reopenDay = (d: ISODate) => (s: AppState): AppState => {
  const s2 = { ...s, moves: s.moves.filter((m) => !(m.from === d && m.reason === 'deficit')) };
  const l = { ...emptyLog(), ...s.logs[d], status: 'pending' as DayStatus };
  delete l.frozenTarget;
  delete l.closedAt;
  return { ...s2, logs: { ...s2.logs, [d]: l } };
};

const setAlarm = (id: string, patch: Partial<AlarmState> | null) => (s: AppState): AppState => {
  const next = { ...s.alarmState };
  if (patch === null) delete next[id];
  else next[id] = { ...next[id], ...patch };
  return { ...s, alarmState: next };
};

export const markFired = (id: string) => setAlarm(id, { firedAt: new Date().toISOString() });
export const snoozeAlarm = (id: string, minutes: number, nowMin: number) =>
  setAlarm(id, { snoozeUntil: fromMin(Math.min(nowMin + minutes, 1439)), firedAt: undefined, dismissed: false });
export const dismissAlarm = (id: string) => setAlarm(id, { dismissed: true });
export const rescheduleAlarm = (id: string, time: string) => setAlarm(id, { rescheduled: time, snoozeUntil: undefined, firedAt: undefined, dismissed: false });
export const resetAlarm = (id: string) => setAlarm(id, null);
