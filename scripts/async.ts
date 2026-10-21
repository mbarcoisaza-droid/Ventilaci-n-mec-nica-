import { Simulator } from '../src/engine/simulator';
import { DEFAULT_SETTINGS } from '../src/engine/presets';
import { ASYNCHRONIES, buildPreset } from '../src/education/asynchronies';
for (const a of ASYNCHRONIES) {
  const { patient, settings } = buildPreset(a.activate, { ...DEFAULT_SETTINGS, alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 50 } });
  const sim = new Simulator(settings, patient);
  sim.advance(40);
  const sum = (s: Simulator) => { const m = s.monitor(); const ev: Record<string, number> = {}; for (const e of s.asyncEvents) if (e.t > s.t - 30) ev[e.type] = (ev[e.type]||0)+1;
    const ineff = s.drive.efforts.filter(e=>e.onset> s.t-30 && e.onset < s.t-2 && !e.triggered && !e.reverse).length;
    return `rr ${m.rrTotal.toFixed(0)} vte ${m.vte.toFixed(0)} ppk ${m.ppeak.toFixed(0)} ti ${m.ti.toFixed(2)} eef ${m.eef.toFixed(0)} autoP ${m.autoPeepModel.toFixed(1)} AI ${m.asyncIndex.toFixed(0)} ineff ${ineff} ${JSON.stringify(ev)}`; };
  const before = sum(sim);
  const r = buildPreset(a.resolve, sim.settings, sim.patient);
  sim.setPatient(r.patient); sim.setSettings(r.settings);
  sim.advance(40);
  console.log(a.id.padEnd(15), '| ON:', before, '\n               | FIX:', sum(sim));
}
