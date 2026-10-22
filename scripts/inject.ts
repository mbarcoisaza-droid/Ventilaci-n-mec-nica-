import { calibrate } from '../src/engine/calibrate';
import { DEFAULT_SETTINGS } from '../src/engine/presets';
import { ASYNCHRONIES } from '../src/education/asynchronies';
const bases: any = {
  VC: { sex: 'M', age: 58, heightCm: 172, weightKg: 85, phenotype: 'ardsModerate',
    settings: { ...DEFAULT_SETTINGS, mode: 'VCV', vt: 410, rr: 24, peep: 12, fio2: 0.6, peakFlow: 60, flowPattern: 'square', pause: 0.3 },
    measured: { ppeak: 34, pplat: 27, peepTotal: 13, vte: 405 }, clinical: { map: 72 }, abg: { ph: 7.29, paco2: 52, pao2: 78 } },
  PSV: { sex: 'M', age: 50, heightCm: 180, weightKg: 80, phenotype: 'copd',
    settings: { ...DEFAULT_SETTINGS, mode: 'PSV', ps: 12, peep: 5, fio2: 0.35, ets: 25, riseTime: 0.15 },
    measured: { vte: 480, rrTotal: 22 }, clinical: {}, abg: { ph: 7.36, paco2: 55, pao2: 70 } },
};
for (const [bn, b] of Object.entries(bases)) for (const a of ASYNCHRONIES) {
  const t0 = Date.now();
  const r = calibrate({ ...(b as any), asynchrony: { type: a.id, severity: 'frecuente' } });
  const d = r.derived.find(x => x.label === 'Asincronía reproducida');
  console.log(bn, a.id.padEnd(15), (Date.now()-t0+'ms').padStart(7), d?.value, '|', r.notes.filter(n => n.startsWith('La asincronía sólo') || n.startsWith('El flujo excesivo')).join(''));
}
