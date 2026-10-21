import { describe, expect, it } from 'vitest';
import { ASYNCHRONIES, buildPreset } from './asynchronies';
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
