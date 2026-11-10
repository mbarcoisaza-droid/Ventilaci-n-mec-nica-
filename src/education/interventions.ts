import type { PatientParams } from '../engine/types';

/**
 * Intervenciones clínicas sobre el paciente simulado. Se aplican como una transformación pura de los
 * parámetros del paciente «sin intervenciones» (base), de modo que se pueden combinar y revertir.
 * Los tiempos están comprimidos: el efecto aparece en segundos (en la clínica, minutos u horas).
 */
export type Sedation = 0 | 1 | 2 | 3;
export type FluidBalance = 0 | 1 | 2;

export interface Interventions {
  sedation: Sedation;
  nmb: boolean;
  fluid: FluidBalance;
}

export const NO_INTERVENTIONS: Interventions = { sedation: 0, nmb: false, fluid: 0 };

export const SEDATION_LABEL: Record<Sedation, string> = {
  0: 'Sin sedación',
  1: 'Ligera (RASS −1 a −2)',
  2: 'Moderada (RASS −3)',
  3: 'Profunda (RASS −4 a −5)',
};

export const FLUID_LABEL: Record<FluidBalance, string> = {
  0: 'Sin balance negativo',
  1: 'Diurético (≈ −1 L)',
  2: 'Diurético / ultrafiltración (≈ −2 L)',
};

const SED_DRIVE = [1, 0.75, 0.45, 0];
const SED_RATE = [1, 0.85, 0.7, 0.6];
const SED_CHEMO = [1, 0.8, 0.5, 0];
const SED_EXP = [1, 0.6, 0.3, 0];
const SED_MAP = [0, 3, 8, 12];
const SED_VCO2 = [1, 0.95, 0.9, 0.85];

/** ¿Pulmón con lesión/edema donde el balance negativo mejora la mecánica y la oxigenación? */
const edemaFactor = (p: PatientParams) => Math.max(0.3, Math.min(1, (p.shuntMax - 0.05) / 0.25));

/** ¿Pulmón con SDRA (reclutable)? En sedación profunda puede aparecer disparo reverso (arrastre). */
const isArds = (p: PatientParams) => p.rMin < 0.9 && p.shuntMax > 0.2;

export function applyInterventions(base: PatientParams, iv: Interventions): PatientParams {
  const s = iv.nmb ? 3 : iv.sedation;
  const e = { ...base.effort };
  const hadDrive = e.pmusMax > 0.3 || (e.alt?.prob ?? 0) > 0 || e.reverseTrigger;
  e.pmusMax = e.pmusMax * SED_DRIVE[s];
  e.rr = Math.max(6, e.rr * SED_RATE[s]);
  e.chemoGain = e.chemoGain * SED_CHEMO[s];
  e.activeExp = e.activeExp * SED_EXP[s];
  e.expReflex = e.expReflex * SED_EXP[s];
  if (e.alt) e.alt = s >= 3 ? undefined : { ...e.alt, pmusMax: e.alt.pmusMax * SED_DRIVE[s] };
  if (s === 3 && !iv.nmb && hadDrive && isArds(base)) {
    // sedación profunda en SDRA: arrastre respiratorio con disparo reverso (Akoumianaki 2013)
    e.reverseTrigger = true;
    e.rtAmp = Math.max(e.rtAmp, 6);
    e.rtDelay = 0.5;
    e.rtRatio = 1;
  }
  if (iv.nmb) {
    e.pmusMax = 0;
    e.reverseTrigger = false;
    e.activeExp = 0;
    e.expReflex = 0;
    e.chemoGain = 0;
    e.alt = undefined;
  }
  const p: PatientParams = {
    ...base,
    effort: e,
    mapBase: base.mapBase - SED_MAP[s],
    vco2: base.vco2 * SED_VCO2[s] * (iv.nmb ? 0.92 : 1),
    vo2: base.vo2 * SED_VCO2[s] * (iv.nmb ? 0.92 : 1),
  };
  if (iv.fluid > 0) {
    // menos agua pulmonar extravascular: mejor distensibilidad y menos cortocircuito, a costa de precarga
    const k = edemaFactor(base) * (iv.fluid === 1 ? 0.5 : 1);
    p.eL = base.eL * (1 - 0.18 * k);
    p.shuntMin = base.shuntMin * (1 - 0.35 * k);
    p.shuntMax = base.shuntMax * (1 - 0.3 * k);
    p.vqGradient = base.vqGradient * (1 - 0.25 * k);
    p.pOpen = Math.max(0, base.pOpen - 2 * k);
    const vol = iv.fluid === 1 ? 1 : 2;
    p.mapBase -= vol * 2;
    p.coBase = base.coBase * (1 - 0.04 * vol);
    p.preloadSens = base.preloadSens * (1 + 0.15 * vol);
  }
  return p;
}

/** Advertencias clínicas de la combinación elegida. */
export function interventionWarnings(iv: Interventions, base: PatientParams, mode: string): string[] {
  const w: string[] = [];
  const spont = mode === 'PSV' || mode === 'CPAP' || mode === 'VS';
  if (iv.nmb && iv.sedation < 3) w.push('El bloqueo neuromuscular exige sedación profunda: se aplica sedación profunda.');
  if ((iv.nmb || iv.sedation >= 2) && spont) w.push('Sin esfuerzo suficiente en un modo espontáneo: habrá apnea y ventilación de respaldo. Pase a un modo controlado.');
  if (iv.sedation === 3 && !iv.nmb && isArds(base) && base.effort.pmusMax > 0.3) w.push('Sedación profunda en SDRA: puede aparecer disparo reverso (arrastre).');
  if (iv.fluid > 0 && base.mapBase - (iv.fluid === 1 ? 2 : 4) - SED_MAP[iv.nmb ? 3 : iv.sedation] < 65) w.push('Riesgo de hipotensión: vigile la PAM y la respuesta a la PEEP.');
  if (iv.fluid > 0 && edemaFactor(base) < 0.5) w.push('Pulmón sin edema relevante: el balance negativo apenas mejora la mecánica.');
  return w;
}
