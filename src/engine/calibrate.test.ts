import { describe, expect, it } from 'vitest';
import { calibrate, type RealPatientInput } from './calibrate';
import { DEFAULT_SETTINGS } from './presets';

const ARDS: RealPatientInput = {
  sex: 'M', age: 58, heightCm: 172, weightKg: 85, phenotype: 'ardsModerate',
  settings: { ...DEFAULT_SETTINGS, mode: 'VCV', vt: 410, rr: 24, peep: 12, fio2: 0.6, peakFlow: 60, flowPattern: 'square', pause: 0.3 },
  measured: { ppeak: 34, pplat: 27, peepTotal: 13, vte: 405 },
  clinical: { map: 72, hr: 105, hb: 10.5 },
  abg: { ph: 7.29, paco2: 52, pao2: 78 },
};

const row = (r: ReturnType<typeof calibrate>, label: string) => r.rows.find((x) => x.label.startsWith(label))!;

describe('calibración con datos de un paciente real', () => {
  it('SDRA en VCV: reproduce presiones, gases y PAM', () => {
    const r = calibrate(ARDS);
    expect(Math.abs(row(r, 'Ppico').model - 34)).toBeLessThan(1.5);
    expect(Math.abs(row(r, 'Pplat').model - 27)).toBeLessThan(1);
    expect(Math.abs(row(r, 'PaCO₂').model - 52)).toBeLessThan(3);
    expect(Math.abs(row(r, 'PaO₂').model - 78)).toBeLessThan(6);
    expect(Math.abs(row(r, 'pH').model - 7.29)).toBeLessThan(0.03);
    expect(Math.abs(row(r, 'PAM').model - 72)).toBeLessThan(4);
  });

  it('EPOC: reproduce la auto-PEEP medida', () => {
    const r = calibrate({
      sex: 'F', age: 70, heightCm: 158, weightKg: 60, phenotype: 'copd',
      settings: { ...DEFAULT_SETTINGS, mode: 'VCV', vt: 400, rr: 18, peep: 5, fio2: 0.35, peakFlow: 50, flowPattern: 'square', pause: 0.2 },
      measured: { ppeak: 38, pplat: 18, peepTotal: 11, vte: 398 },
      clinical: {}, abg: { ph: 7.24, paco2: 68, pao2: 66 },
    });
    expect(Math.abs(row(r, 'PEEP total').model - 11)).toBeLessThan(1.2);
  });

  it('PSV: ajusta el esfuerzo para reproducir el Vte medido', () => {
    const r = calibrate({
      sex: 'M', age: 50, heightCm: 180, weightKg: 80, phenotype: 'ardsMild',
      settings: { ...DEFAULT_SETTINGS, mode: 'PSV', ps: 10, peep: 8, fio2: 0.4 },
      measured: { vte: 520, rrTotal: 24 }, clinical: {}, abg: { ph: 7.42, paco2: 38, pao2: 90 },
    });
    expect(r.patient.effort.pmusMax).toBeGreaterThan(0);
    expect(Math.abs(row(r, 'VTe').model - 520)).toBeLessThan(60);
  });
});

describe('asincronía observada en el paciente real', () => {
  it.each([
    ['double', 'frecuente', 0.2, 0.55],
    ['ineffective', 'frecuente', 0.2, 0.55],
    ['reverse', 'constante', 0.6, 1],
  ] as const)('%s (%s) se reproduce con la frecuencia pedida sin cambiar el ventilador', (type, severity, lo, hi) => {
    const r = calibrate({ ...ARDS, asynchrony: { type, severity } });
    const d = r.derived.find((x) => x.label === 'Asincronía reproducida')!;
    const pct = parseInt(d.value, 10) / 100;
    expect(pct).toBeGreaterThanOrEqual(lo);
    expect(pct).toBeLessThanOrEqual(hi);
    expect(r.settings.mode).toBe('VCV');
    expect(r.settings.vt).toBe(410);
  });
});
