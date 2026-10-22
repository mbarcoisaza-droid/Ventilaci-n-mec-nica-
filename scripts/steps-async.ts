import { Simulator } from '../src/engine/simulator';
import { DEFAULT_SETTINGS } from '../src/engine/presets';
import { ASYNCHRONIES, RESOLVE_STEPS, applySteps, buildPreset } from '../src/education/asynchronies';
const only = process.argv.slice(2);
for (const a of ASYNCHRONIES.filter((x) => !only.length || only.includes(x.id))) {
  const { patient, settings } = buildPreset(a.activate, { ...DEFAULT_SETTINGS, alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 60 } });
  const sim = new Simulator(settings, patient);
  sim.advance(40);
  const mon = () => { const m = sim.monitor(); const effs = sim.drive.efforts.filter((e) => e.onset > sim.t - 30); const dl = effs.filter((e) => e.triggerDelay != null).map((e) => e.triggerDelay!); return `rr ${m.rrTotal.toFixed(0)} eff ${effs.length} vte ${m.vte.toFixed(0)} ti ${m.ti.toFixed(2)} aP ${m.autoPeepModel.toFixed(1)} dly ${dl.length ? (dl.reduce((a, b) => a + b, 0) / dl.length).toFixed(2) : '-'}`; };
  const ev = (w: number) => { const m: Record<string, number> = {}; for (const e of sim.asyncEvents) if (e.t > sim.t - w) m[e.type] = (m[e.type] || 0) + 1; return JSON.stringify(m); };
  const out = [`${a.id.padEnd(15)} ON ${sim.syncStats(30, 10, a.id).pct}% ${ev(30)} | ${mon()}`];
  const steps = RESOLVE_STEPS[a.id];
  const s0 = sim.settings, p0 = sim.patient;
  steps.forEach((_, i) => {
    const r = applySteps(steps, i, s0, p0);
    sim.setSettings(r.settings); sim.setPatient(r.patient);
    sim.advance(35);
    const st = sim.syncStats(30, 10, a.id);
    out.push(`   step${i + 1} ${st.pct}% (${st.asyncCycles}/${st.cycles}) ${ev(30)} | ${mon()}`);
  });
  console.log(out.join('\n'));
}
