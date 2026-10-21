import type { Gas, PatientParams } from './types';
import { predictedBodyWeight } from './mechanics';

/**
 * Intercambio gaseoso y hemodinamia: modelo de compartimento único, deliberadamente simple.
 *  - PaCO2 en estado estable = 0.863·VCO2 / V̇A (ecuación de ventilación alveolar),
 *    V̇A calculada respiración a respiración con espacio muerto anatómico (2.2 mL/kg PBW),
 *    instrumental y alveolar (aumenta con sobredistensión). Dinámica de primer orden ACELERADA.
 *  - PaO2: ecuación del gas alveolar + ecuación del cortocircuito (shunt dependiente del
 *    reclutamiento) + componente V/Q bajo que responde a FiO2. Curva de disociación de Severinghaus.
 *  - Gasto cardíaco: cae con la presión pleural media (retorno venoso) y, si hay
 *    disfunción del VD, con la presión transpulmonar y la hipercapnia. Estimación CUALITATIVA.
 *  - PIC (si aplica): reactividad al CO2 (~1 mmHg PIC por cada 2 mmHg PaCO2 en cerebro poco
 *    distensible) y efecto menor de presión intratorácica.
 */

export function satFromPo2(p: number): number {
  const x = Math.max(p, 0.1);
  return 1 / (23400 / (x * x * x + 150 * x) + 1);
}

export function o2Content(po2: number, hb: number): number {
  return 1.34 * hb * satFromPo2(po2) + 0.003 * po2;
}

export function po2FromContent(c: number, hb: number): number {
  let lo = 5;
  let hi = 700;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (o2Content(m, hb) > c) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}

export interface GasInputs {
  fio2: number;
  rNorm: number; // fracción del pulmón reclutable que está abierta (0–1)
  overIndex: number; // 0–1 índice de sobredistensión
  pplMeanRise: number; // aumento de Ppl media respecto de la basal (cmH2O)
  ptpMean: number; // PL media (cmH2O)
  pawMean: number;
}

export class GasExchange {
  gas: Gas;
  exhal: { t: number; va: number; vt: number }[] = [];
  /** factor de aceleración de la dinámica de gases (τCO2 ≈ 30 s de simulación) */
  tauCO2 = 30;
  tauO2 = 8;

  constructor(private p: PatientParams, initPaco2?: number) {
    const paco2 = initPaco2 ?? p.co2Setpoint;
    this.gas = {
      paco2,
      pao2: 80,
      ph: 7.4,
      hco3: p.hco3,
      sao2: 0.95,
      va: 0,
      vdvt: 0.3,
      shunt: p.shuntMin,
      co: p.coBase,
      map: p.mapBase,
      hrate: p.hr,
      icp: p.icpBase,
      cpp: p.mapBase - p.icpBase,
      pplMean: 0,
    };
  }

  setPatient(p: PatientParams) {
    this.p = p;
  }

  get pbw() {
    return predictedBodyWeight(this.p.sex, this.p.heightCm);
  }

  /** Registrar un segmento espiratorio completo (volumen real exhalado en L). */
  addExhalation(t: number, vtL: number, overIndex: number) {
    const vdAnat = (2.2 * this.pbw) / 1000;
    const vdApp = this.p.vdApp / 1000;
    const vdAlvFrac = Math.min(0.8, this.p.vdAlvFrac + 0.25 * overIndex);
    const va = Math.max(0, vtL - vdAnat - vdApp) * (1 - vdAlvFrac);
    this.exhal.push({ t, va, vt: vtL });
    while (this.exhal.length && this.exhal[0].t < t - 30) this.exhal.shift();
  }

  update(t: number, dt: number, inp: GasInputs, elapsed: number) {
    const p = this.p;
    const g = this.gas;
    const win = Math.min(30, Math.max(6, elapsed - 3));
    let vaSum = 0;
    let vtSum = 0;
    for (const e of this.exhal) if (e.t >= t - win) {
      vaSum += e.va;
      vtSum += e.vt;
    }
    const va = (vaSum / win) * 60; // L/min
    g.va = va;
    g.vdvt = vtSum > 0 ? 1 - vaSum / vtSum : 1;
    const paco2ss = Math.min(160, (0.863 * p.vco2) / Math.max(va, 0.4));
    if (elapsed > 15) g.paco2 += ((paco2ss - g.paco2) * dt) / this.tauCO2;
    g.paco2 = Math.max(12, Math.min(160, g.paco2));
    // tampón agudo: +0.1 mEq/L por mmHg
    g.hco3 = p.hco3 + 0.1 * (g.paco2 - p.co2Setpoint);
    g.ph = 6.1 + Math.log10(g.hco3 / (0.0307 * g.paco2));

    // hemodinamia
    const preloadDrop = p.preloadSens * 0.03 * Math.max(0, inp.pplMeanRise - 1.5);
    const rvDrop =
      p.rvSens * (0.035 * Math.max(0, inp.ptpMean - 8) + 0.006 * Math.max(0, g.paco2 - 50) + 0.004 * Math.max(0, 60 - g.pao2));
    const coFactor = Math.max(0.3, 1 - preloadDrop - rvDrop);
    const co = p.coBase * coFactor;
    g.co += ((co - g.co) * dt) / 4;
    g.map = p.mapBase * (0.45 + 0.55 * (g.co / p.coBase));
    g.hrate = p.hr * (1 + 0.6 * (1 - g.co / p.coBase));
    g.pplMean = inp.pplMeanRise;

    // oxigenación
    const shunt = Math.min(0.75, p.shuntMin + (p.shuntMax - p.shuntMin) * (1 - inp.rNorm) + 0.05 * inp.overIndex);
    g.shunt = shunt;
    const pao2Alv = Math.max(20, inp.fio2 * 713 - g.paco2 / 0.8);
    const pc = Math.max(20, pao2Alv - p.vqGradient * (0.21 / inp.fio2));
    const cc = o2Content(pc, p.hb);
    const avd = Math.min(12, p.vo2 / (Math.max(g.co, 0.8) * 10));
    const ca = Math.max(2, cc - (shunt * avd) / Math.max(0.05, 1 - shunt));
    const pao2 = po2FromContent(ca, p.hb);
    if (elapsed > 2) g.pao2 += ((pao2 - g.pao2) * dt) / this.tauO2;
    else g.pao2 = pao2;
    g.sao2 = satFromPo2(g.pao2);

    if (p.icpBase > 0) {
      const icp =
        p.icpBase + 0.5 * (g.paco2 - 40) + 0.12 * Math.max(0, inp.pawMean - 10) + 0.08 * Math.max(0, 60 - g.pao2);
      g.icp = Math.max(2, icp);
      g.cpp = g.map - g.icp;
    } else {
      g.icp = 0;
      g.cpp = 0;
    }
  }
}
