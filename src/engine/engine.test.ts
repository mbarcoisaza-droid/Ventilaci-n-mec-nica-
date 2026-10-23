import { describe, expect, it } from 'vitest';
import { Simulator, DT } from './simulator';
import { DEFAULT_SETTINGS, PHENOTYPES } from './presets';
import { elastic, equilibrium, flowFromDrive, resistivePressure } from './mechanics';
import type { PatientParams, VentSettings } from './types';

/** Paciente lineal pasivo: sin Rohrer, sin viscoelasticidad, sin reclutamiento ni sobredistensión */
const LINEAR: PatientParams = {
  ...PHENOTYPES.healthy,
  k2: 0,
  e2: 0,
  kOd: 0,
  rMin: 1,
  eL: 10,
  eCW: 10, // Ers = 20 cmH2O/L → Crs = 50 mL/cmH2O
  rInsp: 10,
  rExp: 10,
};
const S = (o: Partial<VentSettings> = {}): VentSettings => ({
  ...DEFAULT_SETTINGS,
  alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 80, vteMin: 0, mvMin: 0 },
  ...o,
});

describe('mecánica: ecuaciones básicas', () => {
  it('Rohrer: flowFromDrive invierte resistivePressure', () => {
    for (const d of [-30, -5, -0.1, 0.1, 3, 25]) {
      const q = flowFromDrive(d, 8, 3);
      expect(resistivePressure(q, 8, 3)).toBeCloseTo(d, 6);
    }
  });

  it('equilibrio estático: Pel(V) = Paw y V = C·PEEP en el modelo lineal', () => {
    for (const peep of [0, 5, 12]) {
      const st = equilibrium(LINEAR, peep);
      expect(elastic(LINEAR, st).pEl).toBeCloseTo(peep, 4);
      expect(st.v).toBeCloseTo(peep / 20, 4);
    }
  });

  it('partición pulmón/pared: Ptp + Ppl = Pel y la Ppl a CRF es Ppl0', () => {
    const p = PHENOTYPES.obese;
    const e0 = elastic(p, { v: 0, p2: 0, r: 1 });
    expect(e0.pCw).toBeCloseTo(p.ppl0, 6);
    expect(e0.pLung + e0.pCw).toBeCloseTo(0, 6);
  });
});

describe('VCV con flujo constante', () => {
  const sim = new Simulator(S({ mode: 'VCV', vt: 500, rr: 12, peep: 5, peakFlow: 60, pause: 0.5 }), LINEAR);
  sim.advance(40);
  const b = sim.breaths[sim.breaths.length - 1];

  it('Ppico − Pplat = R × flujo', () => {
    expect(b.ppeak - (b.pplat as number)).toBeCloseTo(10 * 1.0, 0);
  });

  it('Pplat − PEEP = Vt / Crs (driving pressure)', () => {
    expect((b.pplat as number) - 5).toBeCloseTo(0.5 * 20, 0);
  });

  it('conservación de volumen: Vti ≈ Vte en estado estable sin fugas', () => {
    expect(Math.abs(b.vti - b.vte) / b.vti).toBeLessThan(0.01);
    expect(b.vti).toBeCloseTo(500, -1);
  });

  it('unidades: volumen minuto = Vt × FR', () => {
    const m = sim.monitor();
    expect(m.mv).toBeCloseTo((500 * 12) / 1000, 0);
    expect(m.rrTotal).toBeCloseTo(12, 0);
  });

  it('integración flujo–volumen: el volumen mostrado es la integral del flujo', () => {
    const idx = sim.window(5);
    let v = sim.bvol[idx[0]];
    let maxErr = 0;
    for (let k = 1; k < idx.length; k++) {
      const i = idx[k];
      if (sim.bvol[i] === 0 && sim.bvol[idx[k - 1]] !== 0) {
        v = 0; // reinicio en el inicio del ciclo
        continue;
      }
      v += (sim.bflow[i] / 60) * 0.01 * 1000;
      maxErr = Math.max(maxErr, Math.abs(v - sim.bvol[i]));
    }
    expect(maxErr).toBeLessThan(15); // mL (error de muestreo a 100 Hz)
  });

  it('mínimos cuadrados recupera R y E en paciente pasivo', () => {
    expect(b.lsf?.valid).toBe(true);
    expect(b.lsf!.r).toBeCloseTo(10, 0);
    expect(b.lsf!.e).toBeGreaterThan(18);
    expect(b.lsf!.e).toBeLessThan(22);
  });
});

describe('espiración pasiva', () => {
  it('flujo espiratorio decae exponencialmente con τ = (Rexp + Rválvula)·C', () => {
    const sim = new Simulator(S({ mode: 'VCV', vt: 500, rr: 6, peep: 5, pause: 0 }), LINEAR);
    sim.advance(25);
    // buscar una espiración completa en el registro
    const idx = sim.window(10).filter((i) => sim.bphase[i] === 0);
    const pts: { t: number; f: number }[] = [];
    for (const i of idx) if (sim.bflow[i] < -3 && sim.bflow[i] > -25) pts.push({ t: sim.bt[i], f: -sim.bflow[i] });
    // regresión de ln(f) en el primer tramo continuo
    const seg: typeof pts = [pts[0]];
    for (let k = 1; k < pts.length && pts[k].t - pts[k - 1].t < 0.02; k++) seg.push(pts[k]);
    const n = seg.length;
    const mx = seg.reduce((a, p) => a + p.t, 0) / n;
    const my = seg.reduce((a, p) => a + Math.log(p.f), 0) / n;
    const slope =
      seg.reduce((a, p) => a + (p.t - mx) * (Math.log(p.f) - my), 0) / seg.reduce((a, p) => a + (p.t - mx) ** 2, 0);
    const tau = -1 / slope;
    expect(tau).toBeCloseTo((10 + 1.5) * 0.05, 1);
  });

  it('PEEP: el volumen telespiratorio aumenta con la PEEP (ΔV = C·ΔPEEP)', () => {
    const a = new Simulator(S({ peep: 5 }), LINEAR);
    const b = new Simulator(S({ peep: 15 }), LINEAR);
    a.advance(30);
    b.advance(30);
    const va = a.breaths[a.breaths.length - 1].peepTotalModel;
    const vb = b.breaths[b.breaths.length - 1].peepTotalModel;
    expect(vb - va).toBeCloseTo(10, 0);
    expect(b.mech.v - a.mech.v).toBeCloseTo(0.5, 1);
  });
});

describe('PCV', () => {
  it('Vt = C·ΔP·(1 − e^(−Ti/τ)) en paciente lineal', () => {
    for (const ti of [0.4, 0.8, 1.6]) {
      const sim = new Simulator(S({ mode: 'PCV', pinsp: 15, ti, rr: 10, riseTime: 0.03, peep: 5 }), LINEAR);
      sim.advance(30);
      const b = sim.breaths[sim.breaths.length - 1];
      const expected = 50 * 15 * (1 - Math.exp(-ti / 0.5));
      expect(Math.abs(b.vti - expected) / expected).toBeLessThan(0.08);
    }
  });

  it('aumentar Ti incrementa Vt hasta que el flujo llega a cero', () => {
    const vt = [0.3, 0.6, 1.2, 2.4].map((ti) => {
      const sim = new Simulator(S({ mode: 'PCV', pinsp: 15, ti, rr: 10 }), LINEAR);
      sim.advance(25);
      return sim.breaths[sim.breaths.length - 1].vti;
    });
    expect(vt[1]).toBeGreaterThan(vt[0]);
    expect(vt[2]).toBeGreaterThan(vt[1]);
    expect(vt[3] - vt[2]).toBeLessThan(vt[1] - vt[0]);
  });
});

describe('atrapamiento aéreo', () => {
  it('EPOC: la auto-PEEP aumenta con la frecuencia respiratoria', () => {
    const ap = [10, 20, 30].map((rr) => {
      const sim = new Simulator(S({ mode: 'VCV', rr, vt: 500, peakFlow: 60, pause: 0, peep: 0 }), PHENOTYPES.copd);
      sim.advance(60);
      return sim.monitor().autoPeepModel;
    });
    expect(ap[1]).toBeGreaterThan(ap[0] + 1);
    expect(ap[2]).toBeGreaterThan(ap[1] + 1);
  });

  it('EPOC con limitación al flujo: PEEP externa < auto-PEEP no aumenta la PEEP total (efecto cascada)', () => {
    const tot = [0, 4].map((peep) => {
      const sim = new Simulator(S({ mode: 'VCV', rr: 20, vt: 500, peakFlow: 60, pause: 0, peep }), PHENOTYPES.copd);
      sim.advance(60);
      return peep + sim.monitor().autoPeepModel;
    });
    expect(Math.abs(tot[1] - tot[0])).toBeLessThan(1);
  });

  it('pausa espiratoria mide la PEEP total del modelo', () => {
    const sim = new Simulator(S({ mode: 'VCV', rr: 22, vt: 500, peakFlow: 60, pause: 0, peep: 0 }), PHENOTYPES.copd);
    sim.advance(50);
    const model = sim.monitor().autoPeepModel;
    sim.expHoldTime = 4;
    sim.requestManeuver('expHold');
    sim.advance(10);
    const m = sim.lastManeuver('expHold')!;
    expect(m).toBeTruthy();
    expect(Math.abs(m.value - model)).toBeLessThan(1.5);
  });

  it('pausa espiratoria se ejecuta aunque el paciente dispare todos los ciclos (A/C asistida)', () => {
    const p = { ...PHENOTYPES.ardsMild, effort: { ...PHENOTYPES.ardsMild.effort, pmusMax: 8, rr: 24, tiNeural: 0.9, chemoGain: 0 } };
    const sim = new Simulator(S({ mode: 'VCV', rr: 12, vt: 420, peakFlow: 60, pause: 0, peep: 8 }), p);
    sim.advance(20);
    expect(sim.monitor().patientTriggeredPct).toBeGreaterThan(80);
    sim.requestManeuver('expHold');
    sim.advance(6);
    expect(sim.pendingManeuver).toBeNull();
    const m = sim.lastManeuver('expHold')!;
    expect(m).toBeTruthy();
    expect(m.valid).toBe(false); // el esfuerzo durante la oclusión invalida la medida
  });

  it('el flujo telespiratorio es ≠ 0 cuando hay auto-PEEP', () => {
    const sim = new Simulator(S({ mode: 'VCV', rr: 25, vt: 500, peakFlow: 50, pause: 0, peep: 0 }), PHENOTYPES.copd);
    sim.advance(40);
    expect(sim.monitor().eef).toBeLessThan(-5);
  });
});

describe('fugas y disparo', () => {
  it('con fuga Vti > Vte', () => {
    const sim = new Simulator(S({ mode: 'PCV', triggerType: 'off' }), { ...LINEAR, leak: 12 });
    sim.advance(30);
    const b = sim.breaths[sim.breaths.length - 1];
    expect(b.vti - b.vte).toBeGreaterThan(30);
  });

  it('paciente pasivo sin fuga no dispara el ventilador', () => {
    const sim = new Simulator(S({ mode: 'VCV', rr: 12, flowTrigger: 1 }), LINEAR);
    sim.advance(60);
    expect(sim.breaths.filter((b) => b.trigger === 'patient').length).toBe(0);
  });

  it('un esfuerzo ≥ umbral dispara en A/C', () => {
    const p = { ...LINEAR, effort: { ...LINEAR.effort, pmusMax: 5, rr: 20, tiNeural: 0.9, variability: 0 } };
    const sim = new Simulator(S({ mode: 'VCV', rr: 10 }), p);
    sim.advance(60);
    const m = sim.monitor();
    expect(m.rrTotal).toBeGreaterThan(18);
  });
});

describe('robustez numérica', () => {
  it('no produce NaN ni valores imposibles en configuraciones extremas', () => {
    const modes: VentSettings['mode'][] = ['VCV', 'PCV', 'PSV', 'CPAP', 'SIMV_VC', 'SIMV_PC', 'PRVC', 'VS', 'APRV', 'BILEVEL'];
    for (const ph of Object.keys(PHENOTYPES)) {
      for (const mode of modes) {
        const sim = new Simulator(
          S({ mode, rr: 35, vt: 900, peakFlow: 120, peep: 20, pinsp: 30, ps: 25, riseTime: 0, ti: 2.5, pHigh: 35, pLow: 5 }),
          PHENOTYPES[ph],
        );
        sim.advance(15);
        for (const i of sim.window(15)) {
          expect(Number.isFinite(sim.bpaw[i])).toBe(true);
          expect(Number.isFinite(sim.bflow[i])).toBe(true);
          expect(Math.abs(sim.bflow[i])).toBeLessThan(400);
          expect(sim.bpaw[i]).toBeGreaterThan(-60);
          expect(sim.bpaw[i]).toBeLessThan(120);
        }
        const g = sim.gasEx.gas;
        expect(g.pao2).toBeGreaterThan(5);
        expect(g.ph).toBeGreaterThan(6.5);
        expect(g.ph).toBeLessThan(7.9);
      }
    }
  });

  it('paso de integración suficientemente pequeño frente a la constante de tiempo mínima', () => {
    for (const p of Object.values(PHENOTYPES)) {
      const ers = p.eL / p.rMin + p.eCW;
      const tau = p.rInsp / ers;
      expect(DT).toBeLessThan(tau / 10);
    }
  });
});

describe('criterios de validez de las maniobras', () => {
  it('pausa inspiratoria válida en paciente pasivo y no fiable con esfuerzo activo', () => {
    const passive = new Simulator(S({ mode: 'VCV', pause: 0 }), PHENOTYPES.ardsModerate);
    passive.advance(15);
    passive.requestManeuver('inspHold');
    passive.advance(6);
    expect(passive.lastManeuver('inspHold')!.valid).toBe(true);

    const active = new Simulator(S({ mode: 'VCV', pause: 0, rr: 12 }), {
      ...PHENOTYPES.ardsModerate,
      effort: { ...PHENOTYPES.ardsModerate.effort, pmusMax: 10, rr: 22, tiNeural: 1.2, variability: 0 },
    });
    active.advance(15);
    active.inspHoldTime = 1;
    active.requestManeuver('inspHold');
    active.advance(8);
    expect(active.lastManeuver('inspHold')!.valid).toBe(false);
  });

  it('P0.1 medida por oclusión se aproxima a la Pmus a 100 ms del modelo', () => {
    const p = { ...PHENOTYPES.healthy, effort: { ...PHENOTYPES.healthy.effort, pmusMax: 8, rr: 18, tiNeural: 1, variability: 0 } };
    const sim = new Simulator(S({ mode: 'PSV', ps: 8 }), p);
    sim.advance(20);
    sim.requestManeuver('p01');
    sim.advance(10);
    const r = sim.lastManeuver('p01')!;
    const expected = 8 * Math.sin((Math.PI / 2) * 0.1);
    expect(r.valid).toBe(true);
    expect(Math.abs(r.value - expected)).toBeLessThan(0.6);
  });

  it('P0.1 no medible en paciente pasivo', () => {
    const sim = new Simulator(S({ mode: 'VCV' }), PHENOTYPES.healthy);
    sim.advance(5);
    sim.requestManeuver('p01');
    sim.advance(15);
    expect(sim.lastManeuver('p01')!.valid).toBe(false);
  });
});
