import type { PatientParams, VentSettings } from './types';
import { Simulator } from './simulator';
import { PHENOTYPES, DEFAULT_SETTINGS } from './presets';
import { predictedBodyWeight } from './mechanics';
import { pao2Model } from './gas';

/**
 * Calibración del modelo a partir de los datos de un paciente real.
 *
 * Se parte de un fenotipo (que aporta la forma no lineal: reclutabilidad, sobredistensión,
 * limitación espiratoria) y se ajustan sus parámetros, simulando de forma iterativa con la
 * configuración real del ventilador, hasta reproducir lo medido:
 *   1. Esfuerzo: FR total > FR programada o modo espontáneo → Pmus desde ΔPocc o P0.1.
 *   2. Compliance estática Vt/(Pplat − PEEPtot) → escala de EL (Ecw desde Pes si se dispone).
 *      Sin Pplat: en modos por presión se ajusta al Vte; en VC, a la Ppico.
 *   3. Resistencia (Ppico − Pplat)/flujo en VC con flujo constante.
 *   4. Auto-PEEP medida → escala de la resistencia espiratoria y de la limitación al flujo.
 *   5. Gases: HCO3⁻ desde pH y PaCO2 (Henderson-Hasselbalch); espacio muerto alveolar (y VCO2
 *      si hace falta) para reproducir la PaCO2; shunt para reproducir la PaO2 con la FiO2 real.
 *   6. PAM y PIC: desplazamiento de los valores basales del modelo.
 * Todo lo que no se mide se conserva del fenotipo y se informa como supuesto.
 */

export interface RealPatientInput {
  sex: 'M' | 'F';
  age: number;
  heightCm: number;
  weightKg: number;
  phenotype: string;
  tempC?: number;
  settings: VentSettings;
  measured: {
    ppeak?: number;
    pplat?: number;
    peepTotal?: number;
    vte?: number;
    rrTotal?: number;
    rInsp?: number;
    p01?: number;
    pocc?: number;
    pesEI?: number;
    pesEE?: number;
  };
  clinical: { map?: number; hr?: number; hb?: number; icp?: number };
  abg: { ph?: number; paco2?: number; pao2?: number; hco3?: number };
  /** asincronía observada en el paciente real (opcional) */
  asynchrony?: { type: string; severity: AsyncSeverity };
}

export type AsyncSeverity = 'ocasional' | 'frecuente' | 'constante';
const SEVERITY_TARGET: Record<AsyncSeverity, number> = { ocasional: 0.15, frecuente: 0.35, constante: 0.7 };

export interface CalRow {
  label: string;
  unit: string;
  measured: number | null;
  model: number;
  digits: number;
}

export interface CalibrationResult {
  patient: PatientParams;
  settings: VentSettings;
  initPaco2?: number;
  rows: CalRow[];
  derived: { label: string; value: string }[];
  notes: string[];
}

const has = (v: number | undefined | null): v is number => v !== undefined && v !== null && Number.isFinite(v);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

interface RunOut {
  sim: Simulator;
  cstat: number; // mL/cmH2O (modelo, estático)
  ppeak: number;
  pplat: number;
  autoPeep: number;
  vte: number;
  rr: number;
}

function run(p: PatientParams, s: VentSettings, seconds = 30, initPaco2?: number): RunOut {
  const sim = new Simulator(s, p, { initPaco2 });
  sim.advance(seconds);
  const recent = sim.breaths.filter((b) => b.tEnd > sim.t - 15 && b.kind !== 'APRV');
  const list = recent.length ? recent : sim.breaths.slice(-3);
  const avg = (f: (b: (typeof list)[number]) => number) => (list.length ? list.reduce((x, b) => x + f(b), 0) / list.length : 0);
  const m = sim.monitor();
  const vtL = avg((b) => Math.max(1, b.vtLung));
  const dpStatic = avg((b) => b.pElEI - b.peepTotalModel);
  return {
    sim,
    cstat: dpStatic > 0.3 ? vtL / dpStatic : 0,
    ppeak: avg((b) => b.ppeak),
    pplat: avg((b) => b.pElEI),
    autoPeep: m.autoPeepModel,
    vte: avg((b) => b.vte),
    rr: m.rrTotal,
  };
}

/** Busca un factor de escala por bisección geométrica para que f(factor) alcance el objetivo (f monótona). */
function solveScale(f: (k: number) => number, target: number, lo: number, hi: number, increasing: boolean, iters = 9): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iters; i++) {
    const mid = Math.sqrt(a * b);
    const v = f(mid);
    const tooHigh = v > target;
    if (tooHigh === increasing) b = mid;
    else a = mid;
  }
  return Math.sqrt(a * b);
}

export function calibrate(inp: RealPatientInput): CalibrationResult {
  const notes: string[] = [];
  const derived: { label: string; value: string }[] = [];
  const base = PHENOTYPES[inp.phenotype] ?? PHENOTYPES.healthy;
  const s: VentSettings = { ...DEFAULT_SETTINGS, ...inp.settings, alarms: { ...DEFAULT_SETTINGS.alarms, ...inp.settings.alarms, pawMax: Math.max(inp.settings.alarms?.pawMax ?? 40, (inp.measured.ppeak ?? 0) + 10, 50) } };
  const pbw = predictedBodyWeight(inp.sex, inp.heightCm);
  const p: PatientParams = {
    ...base,
    label: `Paciente real (${base.label.toLowerCase()})`,
    sex: inp.sex,
    age: inp.age,
    heightCm: inp.heightCm,
    weightKg: inp.weightKg,
    effort: { ...base.effort, chemoGain: 0, reverseTrigger: false },
    leak: 0,
    cardiacAmp: 0,
  };
  if (has(inp.clinical.hb)) p.hb = clamp(inp.clinical.hb, 4, 20);
  if (has(inp.clinical.hr)) p.hr = clamp(inp.clinical.hr, 30, 200);
  const temp = inp.tempC ?? 37;
  p.vco2 = Math.round(3 * pbw * (1 + 0.1 * clamp(temp - 37, -3, 4)));
  p.vo2 = Math.round(p.vco2 * 1.25);
  derived.push({ label: 'Peso predicho (PBW)', value: `${pbw.toFixed(1)} kg` });

  // ---------- 1. esfuerzo
  const m = inp.measured;
  const spontMode = ['PSV', 'CPAP', 'VS', 'BILEVEL', 'APRV'].includes(s.mode);
  const triggering = has(m.rrTotal) && m.rrTotal > s.rr + 2;
  const active = spontMode || triggering || has(m.p01) || has(m.pocc);
  if (active) {
    const rrN = has(m.rrTotal) ? clamp(m.rrTotal, 6, 45) : 18;
    const tiN = clamp((60 / rrN) * 0.38, 0.5, 1.4);
    let pmus = 6;
    if (has(m.pocc)) {
      pmus = 0.75 * m.pocc;
      notes.push(`Pmus estimada a partir de ΔPocc (0.75 × ${m.pocc}) = ${pmus.toFixed(1)} cmH₂O.`);
    } else if (has(m.p01)) {
      pmus = m.p01 / Math.sin((Math.PI / 2) * (0.1 / tiN));
      notes.push(`Estimación inicial de Pmus a partir de P0.1 (forma de esfuerzo del modelo): ${pmus.toFixed(1)} cmH₂O.`);
    } else notes.push('Paciente con esfuerzo sin P0.1 ni ΔPocc: se asume Pmus de 6 cmH₂O (ajústela en el panel Paciente).');
    p.effort = { ...p.effort, pmusMax: clamp(pmus, 1, 30), rr: rrN, tiNeural: tiN, variability: 0.06 };
    if (has(m.pplat)) notes.push('Con esfuerzo inspiratorio la Pplat medida puede no ser estática; la compliance calibrada hereda ese error.');
  } else {
    p.effort = { ...p.effort, pmusMax: 0 };
  }

  // ---------- 2. elastancia
  const peepTot = has(m.peepTotal) ? m.peepTotal : s.peep;
  const vtMeas = has(m.vte) ? m.vte : s.vt;
  const vc = s.mode === 'VCV' || s.mode === 'SIMV_VC';
  const pcMode = s.mode === 'PCV' || s.mode === 'SIMV_PC' || s.mode === 'PRVC';
  // pared torácica
  if (has(m.pesEI) && has(m.pesEE) && m.pesEI > m.pesEE) {
    p.eCW = clamp((m.pesEI - m.pesEE) / (vtMeas / 1000), 2, 40);
    notes.push(`Elastancia de pared torácica desde ΔPes: ${p.eCW.toFixed(1)} cmH₂O/L.`);
    if (has(m.pesEE)) p.ppl0 = clamp(m.pesEE - p.eCW * 0.3, -6, 14);
  } else {
    const bmi = inp.weightKg / (inp.heightCm / 100) ** 2;
    if (bmi >= 35 && inp.phenotype !== 'obese') {
      p.eCW = Math.max(p.eCW, 12 + (bmi - 35) * 0.4);
      p.ppl0 = Math.max(p.ppl0, 3 + (bmi - 35) * 0.2);
      notes.push(`IMC ${bmi.toFixed(0)}: se aumenta la elastancia de pared torácica (sin Pes la partición pulmón/pared es un supuesto).`);
    } else notes.push('Sin presión esofágica: la partición entre pulmón y pared torácica procede del fenotipo elegido (supuesto).');
  }
  const eL0 = p.eL;
  if (has(m.pplat) && m.pplat - peepTot > 0.5) {
    const cTarget = vtMeas / (m.pplat - peepTot);
    const k = solveScale(
      (kk) => run({ ...p, eL: eL0 * kk }, s, 20).cstat,
      cTarget,
      0.15,
      6,
      false,
    );
    p.eL = eL0 * k;
    derived.push({ label: 'Crs estática medida', value: `${cTarget.toFixed(0)} mL/cmH₂O` });
  } else if (pcMode && has(m.vte) && !active) {
    const k = solveScale((kk) => run({ ...p, eL: eL0 * kk }, s, 20).vte, m.vte, 0.15, 6, false);
    p.eL = eL0 * k;
    notes.push('Sin Pplat: la elastancia se ajustó para reproducir el Vte en modo por presión (asume la resistencia del fenotipo).');
  } else if (vc && has(m.ppeak) && !active) {
    const k = solveScale((kk) => run({ ...p, eL: eL0 * kk }, s, 20).ppeak, m.ppeak, 0.15, 6, true);
    p.eL = eL0 * k;
    notes.push('Sin Pplat: la elastancia se ajustó a la Ppico, asumiendo la resistencia del fenotipo. Mida la Pplat para separar ambos componentes.');
  } else if (active && !vc && has(m.vte) && has(m.pocc)) {
    // esfuerzo conocido (ΔPocc): la compliance se ajusta para reproducir el Vte
    const k = solveScale((kk) => run({ ...p, eL: eL0 * kk }, s, 25).vte, m.vte, 0.15, 6, false);
    p.eL = eL0 * k;
    notes.push('Compliance ajustada para reproducir el Vte con la Pmus derivada de ΔPocc.');
  } else if (active && !vc && has(m.vte)) {
    // compliance del fenotipo; la Pmus se ajusta para reproducir el Vte (la relación P0.1–Pmus es individual)
    const pm0 = p.effort.pmusMax;
    const k = solveScale((kk) => run({ ...p, effort: { ...p.effort, pmusMax: clamp(pm0 * kk, 0.5, 35) } }, s, 25).vte, m.vte, 0.05, 4, true);
    p.effort = { ...p.effort, pmusMax: clamp(pm0 * k, 0.5, 35) };
    notes.push(`Compliance del fenotipo; Pmus ajustada a ${p.effort.pmusMax.toFixed(1)} cmH₂O para reproducir el Vte medido. Con Pplat (pausa en PSV) o ΔPocc la calibración sería más fiable.`);
  } else notes.push('No hay datos suficientes para calibrar la compliance: se conserva la del fenotipo.');

  // ---------- 3. resistencia inspiratoria
  const ratioExp = p.rExp / p.rInsp;
  if (has(m.rInsp)) {
    p.rInsp = clamp(m.rInsp - p.k2 * (s.peakFlow / 60), 2, 60);
    notes.push('Resistencia inspiratoria tomada del valor medido por el ventilador.');
  } else if (vc && s.flowPattern === 'square' && has(m.ppeak) && has(m.pplat) && m.ppeak > m.pplat) {
    const q = s.peakFlow / 60;
    const rTot = (m.ppeak - m.pplat) / q;
    // el modelo añade la caída viscoelástica P1→P2 a la diferencia Ppico−Pplat; se descuenta aproximadamente
    const rAdj = solveScale(
      (kk) => {
        const o = run({ ...p, rInsp: Math.max(1, (rTot - p.k2 * q) * kk) }, s, 15);
        return o.ppeak - o.pplat;
      },
      m.ppeak - m.pplat,
      0.2,
      3,
      true,
      7,
    );
    p.rInsp = clamp((rTot - p.k2 * q) * rAdj, 1, 60);
    derived.push({ label: 'R insp medida (Ppico − Pplat)/V̇', value: `${rTot.toFixed(1)} cmH₂O·s/L` });
  } else notes.push('Resistencia: sin VC de flujo constante con Ppico y Pplat (ni R medida) se conserva la del fenotipo.');
  p.rExp = p.rInsp * ratioExp;

  // ---------- 4. auto-PEEP
  if (has(m.peepTotal)) {
    const apTarget = Math.max(0, m.peepTotal - s.peep);
    const rExp0 = p.rExp;
    const efl0 = p.eflRus;
    const ap = (kk: number) => run({ ...p, rExp: rExp0 * kk, eflRus: efl0 * kk }, s, 30).autoPeep;
    const now = ap(1);
    // la auto-PEEP medida tiene una precisión de ~1 cmH₂O: sólo se calibra si la discrepancia es clara
    if ((apTarget >= 2 && Math.abs(now - apTarget) > 1) || now > apTarget + 1.5) {
      if (apTarget > 0.8 && efl0 <= 0 && apTarget > now + 1) {
        p.eflRus = 25;
        p.eflPcrit = 1;
        notes.push('La auto-PEEP medida sugiere limitación al flujo espiratorio: se añadió al modelo.');
      }
      const efl1 = p.eflRus;
      const k = solveScale((kk) => run({ ...p, rExp: rExp0 * kk, eflRus: efl1 * kk }, s, 30).autoPeep, apTarget, 0.15, 8, true, 8);
      p.rExp = rExp0 * k;
      p.eflRus = efl1 * k;
    }
  }

  // ---------- 5. gases
  let initPaco2: number | undefined;
  const g = inp.abg;
  if (has(g.paco2)) {
    initPaco2 = g.paco2;
    p.co2Setpoint = g.paco2;
    if (has(g.ph)) {
      const hco3 = 0.0307 * g.paco2 * 10 ** (g.ph - 6.1);
      p.hco3 = clamp(hco3, 3, 60);
      if (has(g.hco3) && Math.abs(g.hco3 - hco3) > 3) notes.push(`El HCO₃⁻ informado (${g.hco3}) difiere del calculado con pH y PaCO₂ (${hco3.toFixed(1)}): se usa el calculado para mantener la coherencia de Henderson-Hasselbalch.`);
    } else if (has(g.hco3)) p.hco3 = g.hco3;
  } else if (has(g.hco3)) p.hco3 = g.hco3;

  let probe = run(p, s, 40, initPaco2);
  if (has(g.paco2)) {
    const va = probe.sim.gasEx.gas.va;
    const vaReq = (0.863 * p.vco2) / g.paco2;
    if (va > 0.2) {
      const f0 = p.vdAlvFrac + 0.25 * probe.sim.monitor().overIndex;
      let f = 1 - ((1 - f0) * vaReq) / va - 0.25 * probe.sim.monitor().overIndex;
      if (f < 0) {
        f = 0;
        const vaMax = va / (1 - f0);
        p.vco2 = Math.round((vaMax * g.paco2) / 0.863);
        notes.push(`Para la PaCO₂ medida con esta ventilación hace falta una V̇CO₂ menor (${p.vco2} mL/min) que la estimada por peso.`);
      } else if (f > 0.8) {
        f = 0.8;
        const vaMin = va * (1 - 0.8) / (1 - f0);
        p.vco2 = Math.round((vaMin * g.paco2) / 0.863);
        notes.push(`La PaCO₂ medida exige un espacio muerto muy alto o una V̇CO₂ elevada (${p.vco2} mL/min).`);
      }
      p.vdAlvFrac = clamp(f, 0, 0.8);
    }
  }
  if (has(g.pao2)) {
    probe = run(p, s, 30, initPaco2);
    const gas = probe.sim.gasEx.gas;
    const paco2 = initPaco2 ?? gas.paco2;
    const target = clamp(g.pao2, 30, 600);
    const f = (sh: number) => pao2Model(s.fio2, paco2, p.vqGradient, p.hb, p.vo2, gas.co, sh);
    let lo = 0;
    let hi = 0.75;
    if (f(0) < target) {
      // incluso sin shunt no se alcanza: reducir el componente V/Q
      p.vqGradient = 0;
      if (f(0) < target) notes.push('La PaO₂ medida es mayor de la que permite el gas alveolar con esta FiO₂: revise FiO₂ y PaO₂.');
    }
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > target) lo = mid;
      else hi = mid;
    }
    const sTarget = (lo + hi) / 2;
    const mon = probe.sim.monitor();
    const span = p.shuntMax - p.shuntMin;
    const rest = sTarget - 0.05 * mon.overIndex;
    p.shuntMin = clamp(rest - span * (1 - mon.recruitFrac), 0, 0.7);
    p.shuntMax = clamp(p.shuntMin + span, p.shuntMin, 0.8);
    derived.push({ label: 'Shunt efectivo', value: `${(sTarget * 100).toFixed(0)} %` });
  }

  // ---------- 6. hemodinamia y PIC
  if (has(inp.clinical.map) || has(inp.clinical.icp)) {
    probe = run(p, s, 30, initPaco2);
    const gas = probe.sim.gasEx.gas;
    if (has(inp.clinical.map) && gas.map > 10) p.mapBase = clamp(p.mapBase * (inp.clinical.map / gas.map), 30, 160);
    if (has(inp.clinical.icp)) {
      const icpModel = p.icpBase > 0 ? gas.icp : 20 + 0.5 * (gas.paco2 - 40);
      const icpBase0 = p.icpBase > 0 ? p.icpBase : 20;
      p.icpBase = clamp(icpBase0 + (inp.clinical.icp - icpModel), 1, 60);
    }
  }

  // ---------- asincronía observada
  let asyncInfo: { label: string; achieved: number; target: number } | null = null;
  if (inp.asynchrony && inp.asynchrony.type !== 'none') {
    const r = injectAsynchrony(p, s, inp.asynchrony.type, inp.asynchrony.severity, initPaco2);
    Object.assign(p, r.patient);
    p.effort = r.patient.effort;
    notes.push(...r.notes);
    asyncInfo = { label: inp.asynchrony.type, achieved: r.achieved, target: SEVERITY_TARGET[inp.asynchrony.severity] };
  }

  // ---------- verificación final
  const fin = run(p, s, 45, initPaco2);
  const gas = fin.sim.gasEx.gas;
  const mon = fin.sim.monitor();
  const paco2ss = (0.863 * p.vco2) / Math.max(gas.va, 0.3);
  const rows: CalRow[] = [
    { label: 'Ppico', unit: 'cmH₂O', measured: m.ppeak ?? null, model: fin.ppeak, digits: 1 },
    { label: 'Pplat', unit: 'cmH₂O', measured: m.pplat ?? null, model: fin.pplat, digits: 1 },
    { label: 'PEEP total', unit: 'cmH₂O', measured: m.peepTotal ?? null, model: s.peep + fin.autoPeep, digits: 1 },
    { label: 'VTe', unit: 'mL', measured: m.vte ?? null, model: fin.vte, digits: 0 },
    { label: 'FR total', unit: '/min', measured: m.rrTotal ?? null, model: fin.rr, digits: 0 },
    { label: 'PaCO₂ (equilibrio)', unit: 'mmHg', measured: g.paco2 ?? null, model: paco2ss, digits: 0 },
    { label: 'PaO₂', unit: 'mmHg', measured: g.pao2 ?? null, model: gas.pao2, digits: 0 },
    { label: 'pH', unit: '', measured: g.ph ?? null, model: 6.1 + Math.log10((p.hco3 + 0.1 * (paco2ss - p.co2Setpoint)) / (0.0307 * paco2ss)), digits: 2 },
    { label: 'PAM', unit: 'mmHg', measured: inp.clinical.map ?? null, model: gas.map, digits: 0 },
  ];
  if (has(inp.clinical.icp)) rows.push({ label: 'PIC', unit: 'mmHg', measured: inp.clinical.icp, model: gas.icp, digits: 0 });
  const ers = p.eL / Math.max(fin.sim.mech.r, 0.05) + p.eCW;
  derived.push(
    { label: 'Crs del modelo', value: `${fin.cstat.toFixed(0)} mL/cmH₂O` },
    { label: 'EL / Ers (pulmón / sistema)', value: ((p.eL / Math.max(fin.sim.mech.r, 0.05)) / ers).toFixed(2) },
    { label: 'R insp / esp', value: `${p.rInsp.toFixed(1)} / ${p.rExp.toFixed(1)} cmH₂O·s/L` },
    { label: 'Constante de tiempo esp.', value: `${((p.rExp + 1.5) / ers).toFixed(2)} s` },
    { label: 'Limitación al flujo espiratorio', value: p.eflRus > 0 ? 'sí' : 'no' },
    { label: 'Pulmón reclutable abierto', value: `${(mon.recruitFrac * 100).toFixed(0)} %` },
    { label: 'V̇CO₂ / espacio muerto alveolar', value: `${p.vco2} mL/min / ${(p.vdAlvFrac * 100).toFixed(0)} %` },
    { label: 'VD/VT fisiológico (modelo)', value: `${(gas.vdvt * 100).toFixed(0)} %` },
    { label: 'Pmus del paciente', value: p.effort.pmusMax > 0 ? `${p.effort.pmusMax.toFixed(1)} cmH₂O a ${p.effort.rr.toFixed(0)}/min` : 'pasivo' },
  );
  const bad = rows.filter((r) => r.measured !== null && Math.abs(r.model - r.measured) > Math.max(2, Math.abs(r.measured) * 0.12) && r.label !== 'pH');
  if (bad.length) notes.push(`No se reprodujo con exactitud: ${bad.map((r) => r.label).join(', ')}. El modelo de un compartimento no siempre puede ajustar todos los datos a la vez; revise que las mediciones sean coherentes (p. ej., Pplat con paciente pasivo).`);
  if (asyncInfo) derived.push({ label: 'Asincronía reproducida', value: `${Math.round(asyncInfo.achieved * 100)} % de los ciclos (objetivo ≈ ${Math.round(asyncInfo.target * 100)} %)` });
  notes.push('La calibración describe el estado actual; la respuesta a cambios (PEEP, FR…) depende de la forma no lineal del fenotipo elegido y es una predicción del modelo, no del paciente.');
  return { patient: p, settings: s, initPaco2, rows, derived, notes };
}

// ======================================================================================
// Reproducción de una asincronía observada
// ======================================================================================

/**
 * Sólo se modifica al PACIENTE (la programación del ventilador es la real):
 *  - asincronías por esfuerzo: un «esfuerzo alternativo» (Pmus, Ti neural, reflejo espiratorio)
 *    aparece en una fracción de los ciclos; se busca la intensidad que la produce y la fracción
 *    que reproduce la frecuencia observada;
 *  - disparo reverso: relación de arrastre (1:1, 1:2, 1:4);
 *  - autodisparo: fuga u oscilación cardiogénica; atrapamiento: mecánica espiratoria.
 */
type AltGen = (p: PatientParams, s: VentSettings, k: number) => { rr: number; alt: { pmusMax: number; tiNeural: number; expReflex?: number } };

const ventTi = (s: VentSettings) => {
  const ti = Simulator.inspTime(s);
  return Number.isFinite(ti) ? ti : 0.8;
};
const rrFor = (p: PatientParams, s: VentSettings) => Math.max(p.effort.pmusMax > 0 ? p.effort.rr : 0, s.rr + 4, 16);

const EFFORT_GENS: Record<string, AltGen> = {
  ineffective: (p, s, k) => ({ rr: Math.max(rrFor(p, s), s.rr * 1.5), alt: { pmusMax: 7 / k, tiNeural: 0.9 } }),
  double: (p, s, k) => ({ rr: rrFor(p, s), alt: { pmusMax: 7 * k, tiNeural: clamp(ventTi(s) * 2.4, 1.0, 2.2) } }),
  stacking: (p, s, k) => ({ rr: rrFor(p, s), alt: { pmusMax: 10 * k, tiNeural: clamp(ventTi(s) * 2.6, 1.1, 2.4) } }),
  lateTrigger: (p, s, k) => ({ rr: rrFor(p, s), alt: { pmusMax: 8 / k, tiNeural: 1.4 } }),
  prematureCycle: (p, s, k) => ({ rr: rrFor(p, s), alt: { pmusMax: 5 * k, tiNeural: Math.max(1.1, ventTi(s) * 1.7) } }),
  delayedCycle: (p, s, k) => ({ rr: rrFor(p, s), alt: { pmusMax: 6, tiNeural: clamp(ventTi(s) * 0.45, 0.35, 0.8), expReflex: 4 * k } }),
  flowStarvation: (p, s, k) => ({ rr: rrFor(p, s), alt: { pmusMax: 7 * k, tiNeural: Math.max(0.8, ventTi(s)) } }),
  flowAsync: (p, s, k) => ({ rr: rrFor(p, s), alt: { pmusMax: 7 * k, tiNeural: 0.9 } }),
};

const OTHER_GENS: Record<string, (p: PatientParams, s: VentSettings, k: number) => PatientParams> = {
  autotrigger: (p, s, k) =>
    s.triggerType === 'pressure'
      ? { ...p, cardiacAmp: k * 0.9 * s.pressureTrigger, hr: Math.max(p.hr, 100) }
      : { ...p, leak: k * 1.3 * s.flowTrigger * Math.sqrt(10 / Math.max(s.peep, 3)), leakSite: 'airway' },
  airTrapping: (p, _s, k) => ({ ...p, rExp: p.rExp * (1 + 2 * k), eflRus: Math.max(p.eflRus, 25) * (1 + k), eflPcrit: p.eflRus > 0 ? p.eflPcrit : 1 }),
  flowExcess: (p) => p,
};

const INTENSITIES = [0.35, 0.5, 0.7, 0.9, 1.2, 1.6, 2.1, 2.8, 3.6, 4.8, 6];
const RT_RATIO: Record<AsyncSeverity, number> = { ocasional: 5, frecuente: 2, constante: 1 };

function asyncFraction(p: PatientParams, s: VentSettings, type: string, initPaco2?: number): number {
  const sim = new Simulator(s, p, { initPaco2 });
  sim.advance(40);
  const t0 = sim.t - 30;
  const breaths = sim.breaths.filter((b) => b.tStart > t0).length;
  if (type === 'ineffective') {
    const ineff = sim.drive.efforts.filter((e) => e.onset > t0 && e.onset < sim.t - 2 && !e.triggered && !e.reverse).length;
    return breaths + ineff ? ineff / (breaths + ineff) : 0;
  }
  const n = sim.asyncEvents.filter((e) => e.t > t0 && e.type === type).length;
  // el disparo reverso se refiere a los ciclos disparados por máquina (los que lo provocan)
  const denom = type === 'reverse' ? sim.breaths.filter((b) => b.tStart > t0 && b.trigger === 'machine').length : breaths;
  return denom ? Math.min(1, n / denom) : 0;
}

export function injectAsynchrony(
  base: PatientParams,
  s: VentSettings,
  type: string,
  severity: AsyncSeverity,
  initPaco2?: number,
): { patient: PatientParams; achieved: number; notes: string[] } {
  const notes: string[] = [];
  const target = SEVERITY_TARGET[severity];
  const ps = ['PSV', 'CPAP', 'VS', 'BILEVEL'].includes(s.mode);
  let patient = base;
  let achieved = 0;

  // ¿el paciente calibrado ya la presenta con la programación actual?
  const f0 = type === 'flowExcess' ? 0 : asyncFraction(base, s, type, initPaco2);
  if (f0 >= target * 0.8) {
    notes.push(`El paciente calibrado ya presenta esta asincronía en el ${Math.round(f0 * 100)} % de los ciclos con la programación actual: no se añadió nada.`);
    return { patient: base, achieved: f0, notes };
  }

  if (type === 'reverse') {
    patient = {
      ...base,
      effort: { ...base.effort, pmusMax: 0, alt: undefined, reverseTrigger: true, rtAmp: 9, rtDelay: clamp(0.55 * ventTi(s), 0.3, 1), tiNeural: 0.9, rtRatio: RT_RATIO[severity], variability: 0.05 },
    };
    achieved = asyncFraction(patient, s, 'reverse', initPaco2);
    if (ps) notes.push('El disparo reverso se describe en ciclos disparados por máquina; en modos espontáneos el modelo sólo lo genera durante la ventilación de respaldo.');
  } else if (EFFORT_GENS[type]) {
    const gen = EFFORT_GENS[type];
    // 1) intensidad que produce la asincronía en casi todos los esfuerzos alternativos
    // la menor intensidad suficiente, con Pmus limitada a valores fisiológicos (≤ 25 cmH₂O)
    const genC = (k: number) => {
      const g = gen(base, s, k);
      return { ...g, alt: { ...g.alt, pmusMax: clamp(g.alt.pmusMax, 1, 25) } };
    };
    let best = { k: INTENSITIES[0], f: -1 };
    const enough = Math.min(0.8, target * 1.5);
    for (const k of INTENSITIES) {
      const g = genC(k);
      const cand = { ...base, effort: { ...base.effort, reverseTrigger: false, chemoGain: 0, variability: 0.06, rr: g.rr, alt: { prob: 1, ...g.alt } } };
      const f = asyncFraction(cand, s, type, initPaco2);
      if (f > best.f + 0.02) best = { k, f };
      if (f >= enough || g.alt.pmusMax >= 25 || g.alt.pmusMax <= 1) break;
    }
    // 2) fracción de ciclos con el esfuerzo alternativo para alcanzar la frecuencia observada
    const g = genC(best.k);
    const mk = (pr: number): PatientParams => ({ ...base, effort: { ...base.effort, reverseTrigger: false, chemoGain: 0, variability: 0.06, rr: g.rr, alt: { prob: pr, ...g.alt } } });
    // bisección sobre la fracción de esfuerzos alternativos (la relación no es lineal)
    let lo = 0.05;
    let hi = 1;
    let prob = 1;
    let closest = { prob: 1, f: best.f, err: Math.abs(best.f - target) };
    if (best.f > target) {
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        const fm = asyncFraction(mk(mid), s, type, initPaco2);
        if (Math.abs(fm - target) < closest.err) closest = { prob: mid, f: fm, err: Math.abs(fm - target) };
        if (fm < target) lo = mid;
        else hi = mid;
      }
    }
    prob = closest.prob;
    patient = mk(prob);
    achieved = closest.f;
    if (g.alt.pmusMax >= 18)
      notes.push(`Con esta mecánica y programación hace falta un esfuerzo intenso (Pmus ≈ ${g.alt.pmusMax.toFixed(0)} cmH₂O) para producirla: ${type === 'double' || type === 'stacking' ? 'el segundo disparo exige vencer el retroceso elástico tele-inspiratorio' : 'el flujo programado cubre buena parte de la demanda'}. Un esfuerzo así implica alto riesgo de P-SILI.`);
    notes.push(`Asincronía generada con un esfuerzo de ${g.alt.pmusMax.toFixed(1)} cmH₂O y Ti neural ${g.alt.tiNeural.toFixed(2)} s en el ${Math.round(prob * 100)} % de los ciclos neurales (panel Paciente para ver el resto del esfuerzo).`);
  } else if (OTHER_GENS[type]) {
    const gen = OTHER_GENS[type];
    let best = { f: -1, p: base };
    if (type !== 'flowExcess') {
      for (const k of INTENSITIES) {
        const cand = gen(base, s, k);
        const f = asyncFraction(cand, s, type, initPaco2);
        if (f > best.f) best = { f, p: cand };
        if (f >= target) {
          best = { f, p: cand };
          break;
        }
      }
    } else best = { f: asyncFraction(base, s, type, initPaco2), p: base };
    patient = best.p;
    achieved = Math.max(0, best.f);
    if (type === 'airTrapping') notes.push('Si introdujo la PEEP total medida, la auto-PEEP ya estaba calibrada: añadir atrapamiento la eleva por encima de lo medido.');
  } else {
    return { patient: base, achieved: 0, notes: [`Asincronía «${type}» no reconocida.`] };
  }

  if (achieved < target * 0.5) {
    const hint: Record<string, string> = {
      ineffective: 'sin auto-PEEP ni sensibilidad baja el modelo dispara incluso con esfuerzos débiles',
      autotrigger: 'compruebe la sensibilidad de disparo y la compensación de fugas',
      double: ps ? 'en PSV el ciclado por flujo acompaña al esfuerzo; suele requerir ETS alto o soporte bajo' : 'el Ti mecánico ya es largo respecto al esfuerzo',
      stacking: ps ? 'en PSV el ciclado por flujo acompaña al esfuerzo; suele requerir ETS alto o soporte bajo' : 'el Ti mecánico ya es largo respecto al esfuerzo',
      lateTrigger: 'suele requerir auto-PEEP o disparo por presión poco sensible',
      prematureCycle: ps ? 'depende de un ETS alto y una constante de tiempo corta' : 'el Ti mecánico ya cubre el esfuerzo',
      delayedCycle: ps ? 'depende de un ETS bajo y una constante de tiempo larga' : 'el Ti mecánico es corto',
      flowStarvation: 'sólo aparece en VCV con flujo bajo para la demanda',
      flowAsync: 'sólo aparece en modos por presión con rampa lenta o soporte bajo',
      flowExcess: 'depende de la programación: rampa de 0 s en modos por presión o flujo > 90 L/min con Ti corto',
      airTrapping: 'la constante de tiempo es corta para el tiempo espiratorio programado',
    };
    notes.push(`Con esta programación la asincronía sólo se reproduce en el ${Math.round(achieved * 100)} % de los ciclos${hint[type] ? ` (${hint[type]})` : ''}.`);
  }
  if (achieved > target * 1.6 && (type === 'autotrigger' || type === 'airTrapping'))
    notes.push(`Esta asincronía no admite un ajuste fino de frecuencia en el modelo: aparece en el ${Math.round(achieved * 100)} % de los ciclos.`);
  if (EFFORT_GENS[type]) notes.push('El esfuerzo añadido modifica el Vte y los gases respecto a la calibración sin asincronía; la tabla compara con el estado final.');
  return { patient, achieved, notes };
}
