import type { Simulator } from '../engine/simulator';
import type { VentSettings } from '../engine/types';
import type { ClinicalCase, MetricKey, ProcessRule, Rule } from './types';

export type Metrics = Record<MetricKey, number | null>;

export interface Snapshot {
  t: number;
  settings: VentSettings;
  metrics: Metrics;
  measured: { pplat: boolean; peepTotal: boolean; p01: boolean };
}

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

/** Variables del estado actual. Las que en la clínica requieren maniobras usan la medición si existe y, si no, la verdad del modelo. */
export function snapshot(sim: Simulator): Snapshot {
  const m = sim.monitor();
  const g = sim.gasEx.gas;
  const s = sim.settings;
  const t = sim.t;
  const recent = sim.breaths.filter((b) => b.tEnd > t - 30);
  const last8 = recent.slice(-8);
  const pElEI = last8.length ? median(last8.filter((b) => b.kind !== 'PS' || s.mode === 'PSV').map((b) => b.pElEI)) : null;
  const autoPeep = m.autoPeepModel;
  const peepTot = m.peep + autoPeep;
  const pplatMeasured = m.pplat !== null && m.pplatValid;
  const pplat = pplatMeasured ? m.pplat! : pElEI;
  const segs = sim.gasEx.exhal.filter((e) => e.t > t - 30 && e.vt > 0.08).map((e) => e.vt * 1000);
  const vtReal = segs.length ? median(segs) : m.vte;
  const leak = last8.length ? last8.reduce((x, b) => x + b.leakVol, 0) / last8.length : 0;
  const metrics: Metrics = {
    vtPerKg: vtReal / sim.pbw,
    pplat,
    dp: pplat !== null ? pplat - peepTot : null,
    dpL: m.ptpEI - m.ptpEE,
    peep: m.peep,
    peepTotal: peepTot,
    autoPeep,
    rr: m.rrTotal,
    mv: m.mv,
    ph: g.ph,
    paco2: g.paco2,
    pao2: g.pao2,
    spo2: g.sao2 * 100,
    pf: g.pao2 / s.fio2,
    fio2: s.fio2 * 100,
    mp: m.mp,
    ptpEI: m.ptpEI,
    ptpEE: m.ptpEE,
    map: g.map,
    icp: sim.patient.icpBase > 0 ? g.icp : null,
    cpp: sim.patient.icpBase > 0 ? g.cpp : null,
    eef: m.eef,
    asyncIndex: m.asyncIndex,
    pmus: m.pmusModel,
    p01: m.p01 ?? (sim.patient.effort.pmusMax > 0 ? m.p01Model : null),
    ieRatio: m.ieRatio,
    ps: s.mode === 'VS' ? sim.adaptiveP : s.mode === 'PSV' || s.mode.startsWith('SIMV') || s.mode === 'BILEVEL' ? s.ps : null,
    ppeak: m.ppeak,
    leakVol: leak,
    overIndex: m.overIndex,
    rsbi: m.rsbi,
    pplSwing: m.pplSwing,
  };
  return {
    t,
    settings: { ...s, alarms: { ...s.alarms } },
    metrics,
    measured: { pplat: pplatMeasured, peepTotal: m.peepTotal !== null, p01: m.p01 !== null },
  };
}

export type Status = 'óptimo' | 'aceptable' | 'fuera' | 'n/d';

export interface RuleResult {
  rule: Rule;
  value: number | null;
  status: Status;
}

export function evalRule(rule: Rule, m: Metrics, mode: VentSettings['mode']): RuleResult {
  if (rule.when?.modeIn && !rule.when.modeIn.includes(mode)) return { rule, value: null, status: 'n/d' };
  const v = m[rule.metric];
  if (v === null || !Number.isFinite(v)) return { rule, value: null, status: 'n/d' };
  const inRange = (lo?: number, hi?: number) => (lo === undefined || v >= lo) && (hi === undefined || v <= hi);
  if (!inRange(rule.min, rule.max)) return { rule, value: v, status: 'fuera' };
  const hasOpt = rule.optMin !== undefined || rule.optMax !== undefined;
  if (!hasOpt || inRange(rule.optMin, rule.optMax)) return { rule, value: v, status: 'óptimo' };
  return { rule, value: v, status: 'aceptable' };
}

export interface Report {
  caseId: string;
  title: string;
  duration: number;
  initial: Snapshot;
  final: Snapshot;
  rules: RuleResult[];
  process: { rule: ProcessRule; done: boolean }[];
  risks: string[];
  physiology: string[];
  settingsChanges: { label: string; from: string; to: string }[];
  verdict: string;
  answers: { q: string; chosen: number | null; correct: number; options: string[]; explanation: string }[];
  justification: string;
}

const SETTING_LABELS: [keyof VentSettings, string, (v: unknown) => string][] = [
  ['mode', 'Modo', (v) => String(v)],
  ['vt', 'Vt (mL)', (v) => String(v)],
  ['rr', 'FR (rpm)', (v) => String(v)],
  ['peep', 'PEEP (cmH₂O)', (v) => String(v)],
  ['fio2', 'FiO₂ (%)', (v) => String(Math.round((v as number) * 100))],
  ['peakFlow', 'Flujo (L/min)', (v) => String(v)],
  ['flowPattern', 'Patrón de flujo', (v) => (v === 'square' ? 'constante' : 'desacelerado')],
  ['pause', 'Pausa (s)', (v) => String(v)],
  ['ti', 'Ti (s)', (v) => String(v)],
  ['pinsp', 'Pinsp (cmH₂O)', (v) => String(v)],
  ['ps', 'PS (cmH₂O)', (v) => String(v)],
  ['ets', 'ETS (%)', (v) => String(v)],
  ['riseTime', 'Rise time (s)', (v) => String(v)],
  ['triggerType', 'Disparo', (v) => String(v)],
  ['flowTrigger', 'Sens. flujo (L/min)', (v) => String(v)],
  ['pressureTrigger', 'Sens. presión (cmH₂O)', (v) => String(v)],
  ['pHigh', 'Phigh', (v) => String(v)],
  ['pLow', 'Plow', (v) => String(v)],
  ['tHigh', 'Thigh', (v) => String(v)],
  ['tLow', 'Tlow', (v) => String(v)],
];

/** Cambios de programación entre dos estados (rótulo, valor previo y nuevo). */
export function settingsDiff(a: VentSettings, b: VentSettings): { label: string; from: string; to: string }[] {
  const out: { label: string; from: string; to: string }[] = [];
  for (const [k, label, f] of SETTING_LABELS) if (a[k] !== b[k]) out.push({ label, from: f(a[k]), to: f(b[k]) });
  if (a.leakComp !== b.leakComp) out.push({ label: 'Compensación de fugas', from: a.leakComp ? 'sí' : 'no', to: b.leakComp ? 'sí' : 'no' });
  return out;
}

const fmt = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

export function genericRisks(m: Metrics, s: VentSettings, pbw: number): string[] {
  const r: string[] = [];
  if (m.pplat !== null && m.pplat > 30) r.push(`Pplat ${fmt(m.pplat)} cmH₂O > 30: riesgo de VILI/barotrauma (interprétese con la PL si la pared torácica es rígida).`);
  if (m.dp !== null && m.dp > 15) r.push(`Driving pressure ${fmt(m.dp)} > 15 cmH₂O: asociada a mayor mortalidad en SDRA.`);
  if (m.vtPerKg !== null && m.vtPerKg > 8.5) r.push(`Vt real ${fmt(m.vtPerKg)} mL/kg PBW (${fmt((m.vtPerKg ?? 0) * pbw, 0)} mL): volutrauma.`);
  if (m.autoPeep !== null && m.autoPeep > 5) r.push(`Auto-PEEP ${fmt(m.autoPeep)} cmH₂O: hiperinsuflación dinámica (hipotensión, barotrauma, esfuerzos inefectivos).`);
  if (m.map !== null && m.map < 65) r.push(`PAM estimada ${fmt(m.map, 0)} mmHg: compromiso hemodinámico.`);
  if (m.ph !== null && m.ph < 7.15) r.push(`pH ${fmt(m.ph, 2)}: acidemia grave.`);
  if (m.spo2 !== null && m.spo2 < 88) r.push(`SpO₂ ${fmt(m.spo2, 0)} %: hipoxemia.`);
  if (m.spo2 !== null && m.spo2 > 97 && s.fio2 > 0.5) r.push(`SpO₂ ${fmt(m.spo2, 0)} % con FiO₂ ${Math.round(s.fio2 * 100)} %: hiperoxia evitable.`);
  if (m.ptpEI !== null && m.ptpEI > 22) r.push(`PL tele-inspiratoria ${fmt(m.ptpEI)} cmH₂O (modelo): estrés pulmonar elevado.`);
  if (m.pmus !== null && m.pmus > 15) r.push(`Pmus ${fmt(m.pmus)} cmH₂O (modelo): esfuerzo excesivo (riesgo de P-SILI y lesión diafragmática).`);
  if (m.asyncIndex !== null && m.asyncIndex > 10) r.push(`Índice de asincronía ${fmt(m.asyncIndex, 0)} %.`);
  if (m.mp !== null && m.mp > 17) r.push(`Potencia mecánica ${fmt(m.mp)} J/min > ~17 J/min (umbral asociado a peor pronóstico en estudios observacionales).`);
  if (m.overIndex !== null && m.overIndex > 0.3) r.push('Sobredistensión tele-inspiratoria significativa (modelo).');
  if (m.cpp !== null && m.cpp < 60) r.push(`PPC ${fmt(m.cpp, 0)} mmHg < 60.`);
  return r;
}

export function buildReport(
  c: ClinicalCase,
  initial: Snapshot,
  final: Snapshot,
  flags: Record<string, number>,
  caseStart: number,
  answers: Record<string, number | null>,
  justification: string,
  pbw: number,
): Report {
  const rules = c.rules.map((r) => evalRule(r, final.metrics, final.settings.mode));
  const process = c.process.map((p) => ({ rule: p, done: (flags[p.flag] ?? -1) >= caseStart }));
  const settingsChanges = settingsDiff(initial.settings, final.settings);
  const pairs: [MetricKey, string, number, string][] = [
    ['vtPerKg', 'Vt real', 1, 'mL/kg'],
    ['pplat', 'Pplat', 1, 'cmH₂O'],
    ['dp', 'Driving pressure', 1, 'cmH₂O'],
    ['autoPeep', 'Auto-PEEP', 1, 'cmH₂O'],
    ['ptpEI', 'PL tele-inspiratoria (modelo)', 1, 'cmH₂O'],
    ['ptpEE', 'PL telespiratoria (modelo)', 1, 'cmH₂O'],
    ['mp', 'Potencia mecánica', 1, 'J/min'],
    ['paco2', 'PaCO₂', 0, 'mmHg'],
    ['ph', 'pH', 2, ''],
    ['pao2', 'PaO₂', 0, 'mmHg'],
    ['pf', 'PaO₂/FiO₂', 0, ''],
    ['map', 'PAM (estimada)', 0, 'mmHg'],
    ['asyncIndex', 'Índice de asincronía', 0, '%'],
  ];
  const physiology = pairs
    .map(([k, label, d, u]) => {
      const a = initial.metrics[k];
      const b = final.metrics[k];
      if (a === null || b === null) return null;
      const arrow = Math.abs(b - a) < 10 ** -d ? '→' : b > a ? '↑' : '↓';
      return `${label}: ${fmt(a, d)} ${arrow} ${fmt(b, d)} ${u}`;
    })
    .filter((x): x is string => !!x);
  const crit = rules.filter((r) => r.status === 'fuera' && r.rule.severity === 'crítico').length;
  const major = rules.filter((r) => r.status === 'fuera' && r.rule.severity === 'mayor').length;
  const okCount = rules.filter((r) => r.status === 'óptimo' || r.status === 'aceptable').length;
  const verdict =
    crit > 0
      ? 'Estrategia con objetivos críticos no alcanzados: revise los puntos marcados antes de considerar el caso resuelto.'
      : major > 0
        ? 'Estrategia globalmente razonable con objetivos mejorables.'
        : `Estrategia adecuada: ${okCount}/${rules.length} objetivos dentro de rangos aceptables. Recuerde que varias configuraciones pueden ser igualmente válidas.`;
  return {
    caseId: c.id,
    title: c.title,
    duration: final.t - caseStart,
    initial,
    final,
    rules,
    process,
    risks: genericRisks(final.metrics, final.settings, pbw),
    physiology,
    settingsChanges,
    verdict,
    answers: c.questions.map((q) => ({ q: q.q, chosen: answers[q.id] ?? null, correct: q.correct, options: q.options, explanation: q.explanation })),
    justification,
  };
}
