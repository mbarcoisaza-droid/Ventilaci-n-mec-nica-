import { calibrate } from '../src/engine/calibrate';
import { DEFAULT_SETTINGS } from '../src/engine/presets';
const cases = [
  { name: 'SDRA', inp: { sex: 'M', age: 58, heightCm: 172, weightKg: 85, phenotype: 'ardsModerate',
    settings: { ...DEFAULT_SETTINGS, mode: 'VCV', vt: 410, rr: 24, peep: 12, fio2: 0.6, peakFlow: 60, flowPattern: 'square', pause: 0.3 },
    measured: { ppeak: 34, pplat: 27, peepTotal: 13, vte: 405 }, clinical: { map: 72, hr: 105, hb: 10.5 }, abg: { ph: 7.29, paco2: 52, pao2: 78 } } },
  { name: 'EPOC', inp: { sex: 'F', age: 70, heightCm: 158, weightKg: 60, phenotype: 'copd',
    settings: { ...DEFAULT_SETTINGS, mode: 'VCV', vt: 400, rr: 18, peep: 5, fio2: 0.35, peakFlow: 50, flowPattern: 'square', pause: 0.2 },
    measured: { ppeak: 38, pplat: 18, peepTotal: 11, vte: 398 }, clinical: { map: 68, hr: 110, hb: 13 }, abg: { ph: 7.24, paco2: 68, pao2: 66 } } },
  { name: 'PSV', inp: { sex: 'M', age: 50, heightCm: 180, weightKg: 80, phenotype: 'ardsMild',
    settings: { ...DEFAULT_SETTINGS, mode: 'PSV', ps: 10, peep: 8, fio2: 0.4 },
    measured: { vte: 520, rrTotal: 24, p01: 2.5 }, clinical: { map: 85 }, abg: { ph: 7.42, paco2: 38, pao2: 90 } } },
];
for (const c of cases) {
  const t0 = Date.now();
  const r = calibrate(c.inp as any);
  console.log('\n==', c.name, (Date.now() - t0) + ' ms');
  for (const row of r.rows) console.log(row.label.padEnd(20), String(row.measured ?? '—').padStart(6), row.model.toFixed(row.digits).padStart(7));
  for (const d of r.derived) console.log('  ', d.label, d.value);
  for (const n of r.notes) console.log('  •', n);
}
