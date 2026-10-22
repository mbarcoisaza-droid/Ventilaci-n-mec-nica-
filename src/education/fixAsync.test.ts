import { describe, expect, it } from 'vitest';
import { ASYNCHRONIES, buildPreset } from './asynchronies';
import { dominantAsync, planFix } from './fixAsync';
import { Simulator } from '../engine/simulator';
import { DEFAULT_SETTINGS } from '../engine/presets';

const count = (sim: Simulator, type: string) => {
  const t0 = sim.t - 30;
  if (type === 'ineffective') return sim.drive.efforts.filter((e) => e.onset > t0 && e.onset < sim.t - e.ti - 0.3 && !e.triggered && !e.reverse).length;
  return sim.asyncEvents.filter((e) => e.t > t0 && e.type === type).length;
};

describe('asistente para resolver asincronías', () => {
  it.each(ASYNCHRONIES.map((a) => [a.id, a] as const))('«%s»: ventilador + causa la eliminan', (_id, a) => {
    const { patient, settings } = buildPreset(a.activate, { ...DEFAULT_SETTINGS, alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 60 } });
    const sim = new Simulator(settings, patient);
    sim.advance(40);
    expect(dominantAsync(sim)).not.toBeNull();
    const before = count(sim, a.id);
    const plan = planFix(a.id, sim.settings, sim.patient, sim.monitor());
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.realLife.length).toBeGreaterThan(2);
    const after = new Simulator(plan.settings, plan.patient);
    after.advance(40);
    expect(count(after, a.id)).toBeLessThanOrEqual(Math.max(2, before * 0.3));
  });
});
