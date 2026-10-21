import type { PatientParams } from './types';

/**
 * Modelo mecánico del sistema respiratorio (un compartimento, no lineal).
 *
 *  Pel_rs(V) = PL_el(V) + Pcw(V)
 *  PL_el(V)  = −Ppl0 + (EL / r)·V + Kod·max(0, V − Vod·r)² + P2      (retroceso pulmonar)
 *  Pcw(V)    =  Ppl0 + Ecw·V                                          (pared torácica pasiva)
 *
 *  - r ∈ [rMin, 1] es la fracción de pulmón aireado («baby lung»): al colapsar unidades
 *    la elastancia efectiva aumenta (EL/r) y la capacidad antes de sobredistender se reduce.
 *  - r evoluciona con cinética de primer orden hacia una sigmoide de la presión
 *    transpulmonar elástica (apertura rápida, cierre lento → histéresis y efecto PEEP).
 *  - P2 es un cuerpo de Maxwell (viscoelasticidad tisular, modelo de Bates):
 *    dP2/dt = E2·V̇ − P2/τ2. Explica la caída lenta P1→P2 durante la pausa.
 *  - Ppl0 desplaza la partición pulmón/pared: en obesidad la presión pleural es
 *    positiva a CRF y la PL espiratoria puede ser negativa (atelectasia).
 */
export interface MechState {
  v: number; // L sobre CRF
  p2: number; // cmH2O
  r: number; // fracción aireada
}

export interface Elastic {
  pLung: number; // retroceso elástico pulmonar (PL estática)
  pCw: number; // presión de la pared torácica pasiva
  pEl: number; // suma
  pOver: number; // componente de sobredistensión
}

export function elastic(p: PatientParams, s: MechState): Elastic {
  const eLeff = p.eL / s.r;
  const vodEff = p.vOd * s.r;
  const pOver = s.v > vodEff ? p.kOd * (s.v - vodEff) ** 2 : 0;
  const pLung = -p.ppl0 + eLeff * s.v + pOver + s.p2;
  const pCw = p.ppl0 + p.eCW * s.v;
  return { pLung, pCw, pEl: pLung + pCw, pOver };
}

/** Resuelve ΔP = R·V̇ + K2·V̇|V̇| para V̇ (ecuación de Rohrer). */
export function flowFromDrive(drive: number, r: number, k2: number): number {
  if (k2 <= 0) return drive / r;
  const a = Math.abs(drive);
  const q = (-r + Math.sqrt(r * r + 4 * k2 * a)) / (2 * k2);
  return drive >= 0 ? q : -q;
}

export function resistivePressure(flow: number, r: number, k2: number): number {
  return r * flow + k2 * flow * Math.abs(flow);
}

/**
 * Flujo espiratorio máximo por limitación dinámica (modelo de «cascada» / punto de igual presión):
 *   V̇max = (PL_el − Pcrit) / Rus · (PL_el − Pcrit) / Pref        (Pref = 5 cmH2O)
 * La dependencia cuadrática representa el aumento del calibre de la vía aérea con el volumen
 * (tracción radial): flujo pico inicial alto y caída brusca posterior (curva «cóncava»).
 * Independiente de la presión corriente abajo (Paw): una PEEP externa menor que la presión
 * crítica no reduce el flujo espiratorio ni aumenta el volumen (efecto cascada).
 */
export function expiratoryFlowLimit(p: PatientParams, pLung: number): number {
  if (p.eflRus <= 0) return Infinity;
  const d = Math.max(0, pLung - p.eflPcrit);
  return Math.max(0.01, (d * d) / (p.eflRus * 5));
}

export function recruitTarget(p: PatientParams, pLungElastic: number): number {
  if (p.rMin >= 0.999) return 1;
  const s = 1 / (1 + Math.exp(-(pLungElastic - p.pOpen) / p.kOpen));
  return p.rMin + (1 - p.rMin) * s;
}

export function updateMech(p: PatientParams, s: MechState, lungFlow: number, dt: number): void {
  // PL elástica sin componente viscoelástico (gobierna apertura/cierre)
  const e = elastic(p, s);
  const pl = e.pLung - s.p2;
  s.v += lungFlow * dt;
  if (s.v < -1.5) s.v = -1.5;
  s.p2 += (p.e2 * lungFlow - s.p2 / p.tau2) * dt;
  const target = recruitTarget(p, pl);
  const tau = target > s.r ? p.tauOpen : p.tauClose;
  s.r += ((target - s.r) * dt) / tau;
  s.r = Math.min(1, Math.max(p.rMin, s.r));
}

/**
 * Volumen de equilibrio estático para una presión en vía aérea dada
 * (Pmus = 0, P2 = 0, reclutamiento en equilibrio). Bisección + punto fijo en r.
 */
export function equilibrium(p: PatientParams, paw: number): MechState {
  let r = 1;
  let v = 0;
  for (let k = 0; k < 60; k++) {
    let lo = -1.5;
    let hi = 6;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const pe = elastic(p, { v: mid, p2: 0, r }).pEl;
      if (pe > paw) hi = mid;
      else lo = mid;
    }
    v = (lo + hi) / 2;
    const pl = elastic(p, { v, p2: 0, r }).pLung;
    const rt = recruitTarget(p, pl);
    if (Math.abs(rt - r) < 1e-6) break;
    r = r + 0.5 * (rt - r);
  }
  return { v, p2: 0, r };
}

export function predictedBodyWeight(sex: 'M' | 'F', heightCm: number): number {
  return (sex === 'M' ? 50 : 45.5) + 0.91 * (heightCm - 152.4);
}
