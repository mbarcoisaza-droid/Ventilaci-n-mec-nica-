import { describe, expect, it } from 'vitest';
import { Simulator } from '../engine/simulator';
import { DEFAULT_SETTINGS, PHENOTYPES } from '../engine/presets';
import { ASYNCHRONIES, buildPreset } from './asynchronies';
import { NO_INTERVENTIONS, applyInterventions } from './interventions';

describe('intervenciones clínicas', () => {
  it('sin intervenciones no cambia el paciente', () => {
    const p = PHENOTYPES.ardsModerate;
    expect(applyInterventions(p, NO_INTERVENTIONS)).toEqual({ ...p, effort: { ...p.effort } });
  });

  it('la sedación reduce el impulso de forma graduada y la relajación lo anula', () => {
    const base = { ...PHENOTYPES.highDemand };
    const pm = (s: 0 | 1 | 2 | 3, nmb = false) => applyInterventions(base, { sedation: s, nmb, fluid: 0 }).effort.pmusMax;
    expect(pm(1)).toBeLessThan(pm(0));
    expect(pm(2)).toBeLessThan(pm(1));
    expect(pm(0, true)).toBe(0);
  });

  it('la relajación neuromuscular elimina el doble disparo', () => {
    const a = ASYNCHRONIES.find((x) => x.id === 'double')!;
    const { patient, settings } = buildPreset(a.activate, DEFAULT_SETTINGS);
    const sim = new Simulator(settings, applyInterventions(patient, { sedation: 3, nmb: true, fluid: 0 }));
    sim.advance(40);
    expect(sim.asyncStats(30, 0, 'double').pct).toBe(0);
    expect(sim.monitor().patientTriggeredPct).toBe(0);
  });

  it('el balance negativo mejora la oxigenación en el edema cardiogénico', () => {
    const base = PHENOTYPES.cardiogenic;
    const s = { ...DEFAULT_SETTINGS, mode: 'VCV' as const, peep: 8, fio2: 0.5 };
    const a = new Simulator(s, base);
    const b = new Simulator(s, applyInterventions(base, { sedation: 0, nmb: false, fluid: 2 }));
    a.advance(90);
    b.advance(90);
    expect(b.gasEx.gas.pao2).toBeGreaterThan(a.gasEx.gas.pao2 + 5);
  });
});
