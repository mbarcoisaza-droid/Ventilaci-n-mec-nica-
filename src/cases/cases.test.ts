import { describe, expect, it } from 'vitest';
import { CASES } from './cases';
import { buildCase } from './load';
import { Simulator } from '../engine/simulator';
import { evalRule, snapshot, buildReport } from './evaluate';

describe('casos clínicos', () => {
  it('todos los casos son serializables a JSON y se reconstruyen igual', () => {
    for (const c of CASES) expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it('cada caso arranca, produce métricas finitas y un informe', () => {
    for (const c of CASES) {
      const b = buildCase(c);
      const sim = new Simulator(b.settings, b.patient, { initPaco2: b.initPaco2 });
      sim.advance(20);
      const s0 = snapshot(sim);
      sim.advance(10);
      const s1 = snapshot(sim);
      for (const r of c.rules) {
        const e = evalRule(r, s1.metrics, s1.settings.mode);
        expect(['óptimo', 'aceptable', 'fuera', 'n/d']).toContain(e.status);
      }
      const rep = buildReport(c, s0, s1, sim.flags, 20, {}, '', sim.pbw);
      expect(rep.rules.length).toBe(c.rules.length);
    }
  });

  it('SDRA grave: la configuración inicial viola el Vt protector y la corrección la cumple', () => {
    const c = CASES.find((x) => x.id === 'ards-severe')!;
    const b = buildCase(c);
    const sim = new Simulator(b.settings, b.patient, { initPaco2: b.initPaco2 });
    sim.advance(30);
    const vt = c.rules.find((r) => r.id === 'vt')!;
    expect(evalRule(vt, snapshot(sim).metrics, 'VCV').status).toBe('fuera');
    sim.setSettings({ ...sim.settings, vt: 400 });
    sim.advance(30);
    expect(evalRule(vt, snapshot(sim).metrics, 'VCV').status).toBe('óptimo');
  });
});
