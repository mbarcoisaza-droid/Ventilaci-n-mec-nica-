import { rangeDates } from './dates';
import { alarmsForDay, buildICS, dueAlarms } from './alarms';
import { exportDaysCSV, exportJSON, importCSV, importJSON } from './io';
import { defaultState, emptyLog } from './model';
import { computePlan, conflicts, dayType, goalMet, weekSummary } from './plan';

describe('plan Kaplan', () => {
  it('precarga noviembre con meta de 815 preguntas', () => {
    const s = defaultState();
    const plan = computePlan(s, '2026-11-03');
    const nov = rangeDates('2026-11-03', '2026-11-30').reduce((a, d) => a + plan.target(d), 0);
    expect(nov).toBe(815);
    expect(dayType(s, '2026-11-05')).toBe('shift12');
    expect(dayType(s, '2026-11-09')).toBe('shift6');
    expect(dayType(s, '2026-11-07')).toBe('weekend');
    expect(dayType(s, '2026-11-28')).toBe('free');
    expect(dayType(s, '2027-02-16')).toBe('review');
    expect(dayType(s, '2027-02-21')).toBe('exam');
  });

  it('la cuota automática de días sin definir completa 3.000 antes del 14 de febrero', () => {
    const s = defaultState();
    const plan = computePlan(s, '2026-11-03');
    expect(plan.plannedTotal).toBeGreaterThanOrEqual(3000);
    expect(plan.plannedTotal - 3000).toBeLessThan(plan.autoDays);
    expect(plan.target('2027-02-15')).toBe(0);
  });

  it('no da por cumplida la meta sin un número real ingresado', () => {
    const s = defaultState();
    const plan = computePlan(s, '2026-11-04');
    expect(goalMet(s, plan, '2026-11-03')).toBe(false);
    s.logs['2026-11-03'] = { ...emptyLog(), exercise: true, explanations: true, newDone: 44 };
    expect(goalMet(s, computePlan(s, '2026-11-04'), '2026-11-03')).toBe(false);
    s.logs['2026-11-03'].newDone = 45;
    expect(goalMet(s, computePlan(s, '2026-11-04'), '2026-11-03')).toBe(true);
  });

  it('los repasos no suman al total de preguntas nuevas', () => {
    const s = defaultState();
    s.logs['2026-11-03'] = { ...emptyLog(), newDone: 45, reviewDone: 30 };
    const plan = computePlan(s, '2026-11-04');
    expect(plan.totalNew).toBe(45);
    expect(plan.totalReview).toBe(30);
    expect(plan.remaining).toBe(2955);
  });

  it('reprogramar traslada preguntas sin cambiar el total planeado', () => {
    const s = defaultState();
    const before = computePlan(s, '2026-11-03').plannedTotal;
    s.moves.push({ id: 'x', from: '2026-11-05', to: '2026-11-11', qty: 5, reason: 'test' });
    const plan = computePlan(s, '2026-11-03');
    expect(plan.target('2026-11-05')).toBe(5);
    expect(plan.target('2026-11-11')).toBe(50);
    expect(plan.plannedTotal).toBe(before);
  });

  it('resumen semanal con referencia de 205 prorrateada', () => {
    const s = defaultState();
    const plan = computePlan(s, '2026-11-12');
    const w = weekSummary(s, plan, '2026-11-09');
    expect(w.weeklyRef).toBe(205);
    expect(w.behind).toBe(true);
    const first = weekSummary(s, plan, '2026-11-03');
    expect(first.phaseDays).toBe(6);
  });

  it('rutinas iniciales sin superposiciones y detección de conflictos', () => {
    const s = defaultState();
    for (const d of ['2026-11-03', '2026-11-05', '2026-11-07', '2026-11-09']) expect(conflicts(s, d)).toEqual([]);
    s.days['2026-11-05'] = { type: 'shift12', blocksOverride: [...s.routines.shift12.blocks, { id: 'z', kind: 'kaplan', label: 'Extra', start: '18:00', end: '18:30' }] };
    expect(conflicts(s, '2026-11-05').length).toBeGreaterThan(0);
    s.settings.sleep.bed = '23:30';
    expect(conflicts(s, '2026-11-03').some((c) => c.message.includes('sueño'))).toBe(true);
  });

  it('alarmas: posponer, descartar y exportar a .ics', () => {
    const s = defaultState();
    const al = alarmsForDay(s, '2026-11-03');
    expect(al.some((a) => a.kind === 'kaplan' && a.time === '09:00')).toBe(true);
    expect(al.some((a) => a.kind === 'sleepPrep' && a.time === '21:30')).toBe(true);
    const k = al.find((a) => a.kind === 'kaplan')!;
    expect(dueAlarms(s, '2026-11-03', 9 * 60 + 1).map((a) => a.id)).toContain(k.id);
    s.alarmState[k.id] = { snoozeUntil: '09:10' };
    expect(dueAlarms(s, '2026-11-03', 9 * 60 + 5).map((a) => a.id)).not.toContain(k.id);
    s.alarmState[k.id] = { dismissed: true };
    expect(dueAlarms(s, '2026-11-03', 9 * 60 + 5).map((a) => a.id)).not.toContain(k.id);
    const { ics, count } = buildICS(s, '2026-11-03', '2026-11-09');
    expect(count).toBeGreaterThan(10);
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('DTSTART:20261105T054000');
  });

  it('exporta y restaura JSON y CSV sin perder progreso', () => {
    const s = defaultState();
    s.logs['2026-11-03'] = { ...emptyLog(), newDone: 47, reviewDone: 5, exercise: true, status: 'completed', frozenTarget: 45 };
    s.review.push({ id: 'r1', date: '2026-11-03', topic: 'Cardiología, "IAM"', kind: 'doubt', ref: '123', note: 'a,b', resolved: false });
    const back = importJSON(exportJSON(s));
    expect(back.logs['2026-11-03'].newDone).toBe(47);
    expect(back.review[0].topic).toBe('Cardiología, "IAM"');
    const csv = exportDaysCSV(s, '2026-11-04');
    const r = importCSV(defaultState(), csv).state;
    expect(r.logs['2026-11-03'].newDone).toBe(47);
    expect(r.logs['2026-11-03'].exercise).toBe(true);
    expect(r.logs['2026-11-04'].newDone).toBe(null);
  });
});
