import type { PatientParams } from './types';
import { elastic, equilibrium, resistivePressure, updateMech, type MechState } from './mechanics';

export interface PVPoint {
  v: number; // mL sobre el volumen inicial
  paw: number;
  pl: number;
  pcw: number;
}

/**
 * Curva P-V cuasiestática con flujo constante bajo (5 L/min) desde ZEEP hasta Pmax,
 * seguida de deflación al mismo flujo. Paciente pasivo. El componente resistivo
 * a 5 L/min es < 1 cmH2O, por lo que Paw ≈ Pel.
 */
export function quasiStaticPV(p: PatientParams, pmax = 40, flowLmin = 5): { infl: PVPoint[]; defl: PVPoint[] } {
  const st: MechState = equilibrium(p, 0);
  // partir de un pulmón «desreclutado» a ZEEP tras un periodo en ZEEP
  st.r = Math.max(p.rMin, Math.min(1, st.r));
  const v0 = st.v;
  const q = flowLmin / 60;
  const dt = 0.01;
  const infl: PVPoint[] = [];
  const defl: PVPoint[] = [];
  let t = 0;
  while (t < 60) {
    const e = elastic(p, st);
    const paw = e.pEl + resistivePressure(q, p.rInsp, p.k2);
    if (Math.round(t / dt) % 10 === 0) infl.push({ v: (st.v - v0) * 1000, paw, pl: e.pLung, pcw: e.pCw });
    if (paw >= pmax || st.v - v0 > 3) break;
    updateMech(p, st, q, dt);
    t += dt;
  }
  t = 0;
  while (t < 60) {
    const e = elastic(p, st);
    const paw = e.pEl - resistivePressure(q, p.rExp, p.k2);
    if (Math.round(t / dt) % 10 === 0) defl.push({ v: (st.v - v0) * 1000, paw, pl: e.pLung, pcw: e.pCw });
    if (paw <= 0 || st.v <= v0 - 0.3) break;
    updateMech(p, st, -q, dt);
    t += dt;
  }
  return { infl, defl };
}
