import { Simulator } from '../src/engine/simulator';
import { CASES } from '../src/cases/cases';
import { buildCase } from '../src/cases/load';
import { snapshot, evalRule } from '../src/cases/evaluate';
const fixes: Record<string, any> = {
  'ards-severe': { vt: 400, peep: 12, rr: 28, fio2: 0.7, pause: 0.3, peakFlow: 60 },
  copd: { vt: 480, rr: 12, peakFlow: 70, fio2: 0.3 },
  asthma: { vt: 420, rr: 12, peakFlow: 80, peep: 0, fio2: 0.4 },
  'ards-async': { peakFlow: 35, flowPattern: 'decel', pause: 0.3 },
  obese: { vt: 360, peep: 16, fio2: 0.45, rr: 22 },
  weaning: { ps: 8, ets: 30, triggerType: 'flow', flowTrigger: 2 },
  tbi: { vt: 520, rr: 18 },
  bpf: { vt: 380, peep: 8, rr: 24, fio2: 0.7, pause: 0, peakFlow: 60 },
  metabolic: { vt: 480, rr: 30, peakFlow: 70, pause: 0 },
  'pneumonia-hetero': { peep: 8, fio2: 0.7 },
  rv: { peep: 10, rr: 26, fio2: 0.8 },
};
for (const c of CASES) {
  const b = buildCase(c);
  const sim = new Simulator(b.settings, b.patient, { initPaco2: b.initPaco2 });
  sim.advance(30);
  const s0 = snapshot(sim);
  sim.setSettings({ ...sim.settings, ...(fixes[c.id] || {}) });
  sim.advance(150);
  const s1 = snapshot(sim);
  const f = (s: any) => `vt/kg ${s.metrics.vtPerKg?.toFixed(1)} pplat ${s.metrics.pplat?.toFixed(1)} dp ${s.metrics.dp?.toFixed(1)} aP ${s.metrics.autoPeep?.toFixed(1)} pH ${s.metrics.ph?.toFixed(2)} CO2 ${s.metrics.paco2?.toFixed(0)} PaO2 ${s.metrics.pao2?.toFixed(0)} SpO2 ${s.metrics.spo2?.toFixed(0)} MAP ${s.metrics.map?.toFixed(0)} AI ${s.metrics.asyncIndex?.toFixed(0)} PLei ${s.metrics.ptpEI?.toFixed(1)} PLee ${s.metrics.ptpEE?.toFixed(1)} cpp ${s.metrics.cpp?.toFixed(0)} leak ${s.metrics.leakVol?.toFixed(0)} over ${s.metrics.overIndex?.toFixed(2)} rr ${s.metrics.rr?.toFixed(0)} pmus ${s.metrics.pmus?.toFixed(0)} p01 ${s.metrics.p01?.toFixed(1)}`;
  console.log(c.id, '\n  INI', f(s0), '\n  FIX', f(s1));
  console.log('  ', c.rules.map(r => { const e = evalRule(r, s1.metrics, s1.settings.mode); return r.id + ':' + e.status; }).join(' '));
}
