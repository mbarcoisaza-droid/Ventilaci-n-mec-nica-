import { Simulator } from '../src/engine/simulator';
import { DEFAULT_SETTINGS } from '../src/engine/presets';
import { ASYNCHRONIES, buildPreset } from '../src/education/asynchronies';
import { dominantAsync, planFix } from '../src/education/fixAsync';
const cnt = (sim: Simulator, type: string) => {
  const t0 = sim.t - 30;
  if (type === 'ineffective') return sim.drive.efforts.filter(e => e.onset > t0 && e.onset < sim.t - e.ti - 0.3 && !e.triggered && !e.reverse).length;
  return sim.asyncEvents.filter(e => e.t > t0 && e.type === type).length;
};
for (const a of ASYNCHRONIES) {
  const { patient, settings } = buildPreset(a.activate, { ...DEFAULT_SETTINGS, alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 60 } });
  const sim = new Simulator(settings, patient); sim.advance(40);
  const dom = dominantAsync(sim); const before = cnt(sim, a.id);
  const plan = planFix(a.id, sim.settings, sim.patient, sim.monitor());
  const s1 = new Simulator(plan.settings, sim.patient); s1.advance(40);
  const s2 = new Simulator(sim.settings, plan.patient); s2.advance(40);
  const s3 = new Simulator(plan.settings, plan.patient); s3.advance(40);
  console.log(a.id.padEnd(15), 'dom', (dom?.type ?? '-').padEnd(14), 'antes', before, '| vent', cnt(s1, a.id), '| causa', cnt(s2, a.id), '| ambos', cnt(s3, a.id), '|', plan.steps.map(x => x.label).join('; '));
}
