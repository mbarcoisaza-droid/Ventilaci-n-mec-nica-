import { describe, expect, it } from 'vitest';
import { ASYNCHRONIES, RESOLVE_STEPS, applySteps, buildPreset } from './asynchronies';
import { Simulator } from '../engine/simulator';
import { DEFAULT_SETTINGS } from '../engine/presets';

describe('módulo de asincronías', () => {
  it.each(ASYNCHRONIES.map((a) => [a.id, a] as const))('«%s» se genera y el detector la reconoce', (_id, a) => {
    const { patient, settings } = buildPreset(a.activate, { ...DEFAULT_SETTINGS, alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 60 } });
    const sim = new Simulator(settings, patient);
    sim.advance(40);
    const t0 = sim.t - 30;
    const events = sim.asyncEvents.filter((e) => e.t > t0).map((e) => e.type as string);
    if (a.id === 'ineffective') {
      const ineff = sim.drive.efforts.filter((e) => e.onset > t0 && e.onset < sim.t - 2 && !e.triggered && !e.reverse).length;
      expect(ineff).toBeGreaterThan(2);
    } else {
      expect(events).toContain(a.id);
    }
  });
});

describe('resolución escalonada', () => {
  it.each(ASYNCHRONIES.map((a) => [a.id, a] as const))('«%s»: sincronía ≈ 0 % al activar y 100 % al final, sin retrocesos', (_id, a) => {
    const { patient, settings } = buildPreset(a.activate, { ...DEFAULT_SETTINGS, alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 60 } });
    const sim = new Simulator(settings, patient);
    sim.advance(40);
    const pcts = [sim.syncStats(30, 0, a.id).pct];
    const steps = RESOLVE_STEPS[a.id];
    expect(steps.length).toBeGreaterThanOrEqual(2);
    for (const st of steps) {
      const r = applySteps([st], 0, sim.settings, sim.patient);
      sim.setSettings(r.settings);
      sim.setPatient(r.patient);
      sim.advance(35);
      pcts.push(sim.syncStats(30, 0, a.id).pct);
    }
    expect(pcts[0]).toBeLessThanOrEqual(20);
    expect(pcts[pcts.length - 1]).toBeGreaterThanOrEqual(90);
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeGreaterThanOrEqual(pcts[i - 1] - 5);
  });
});
