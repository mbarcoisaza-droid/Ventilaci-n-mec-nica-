import { Simulator } from '../src/engine/simulator';
import { PHENOTYPES, DEFAULT_SETTINGS } from '../src/engine/presets';
const ph = process.argv[2];
const over = JSON.parse(process.argv[3] || '{}');
const p = { ...PHENOTYPES[ph], ...over };
for (const [rr, peep] of [[12,0],[20,0],[20,5],[20,8],[20,12],[28,0]]) {
  const s = { ...DEFAULT_SETTINGS, peep, vt: 500, rr, peakFlow: 60, pause: 0.2, fio2: 0.4, alarms: { ...DEFAULT_SETTINGS.alarms, pawMax: 80 } };
  const sim = new Simulator(s, p);
  sim.advance(60);
  const m = sim.monitor();
  const g = sim.gasEx.gas;
  console.log(ph, 'RR', rr, 'PEEP', peep, 'Ppk', m.ppeak.toFixed(1), 'Pplat', m.pplat?.toFixed(1), 'PEEPtot', (peep + m.autoPeepModel).toFixed(1), 'EEF', m.eef.toFixed(1), 'PEF', m.peakExpFlow.toFixed(0), 'EELV', (sim.mech.v*1000).toFixed(0), 'PaCO2', g.paco2.toFixed(0), 'MAP', g.map.toFixed(0), 'Vte', m.vte.toFixed(0));
}
