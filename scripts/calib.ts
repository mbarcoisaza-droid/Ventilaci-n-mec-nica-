import { Simulator } from '../src/engine/simulator';
import { PHENOTYPES, DEFAULT_SETTINGS } from '../src/engine/presets';
const ph = process.argv[2] || 'healthy';
const p = PHENOTYPES[ph];
for (const peep of [5, 10, 15, 20]) {
  const s = { ...DEFAULT_SETTINGS, peep, vt: +(process.argv[3]||420), rr: +(process.argv[4]||20), peakFlow: 60, pause: 0.3, fio2: 0.8, alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 70 } };
  const sim = new Simulator(s, p);
  sim.advance(60);
  const m = sim.monitor();
  const g = sim.gasEx.gas;
  console.log(ph, 'PEEP', peep, 'Ppk', m.ppeak.toFixed(1), 'Pplat', m.pplat?.toFixed(1), 'DP', m.dp?.toFixed(1), 'Cst', m.cstat?.toFixed(0),
    'r', sim.mech.r.toFixed(2), 'autoP', m.autoPeepModel.toFixed(1), 'PLei', m.ptpEI.toFixed(1), 'PLee', m.ptpEE.toFixed(1), 'over', m.overIndex.toFixed(2),
    'PaO2', g.pao2.toFixed(0), 'PaCO2', g.paco2.toFixed(0), 'pH', g.ph.toFixed(2), 'MAP', g.map.toFixed(0), 'shunt', g.shunt.toFixed(2), 'R', m.rInsp?.toFixed(1), 'Vte', m.vte.toFixed(0));
}
