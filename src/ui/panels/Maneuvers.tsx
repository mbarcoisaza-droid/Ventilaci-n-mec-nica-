import { useState } from 'react';
import type { Controller } from '../controller';
import type { ManeuverResult } from '../../engine/types';
import type { Monitor } from '../../engine/simulator';
import { quasiStaticPV } from '../../engine/pvcurve';
import { StaticChart } from '../StaticChart';

const f = (v: number | undefined | null, d = 1) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

const NAMES: Record<string, string> = {
  inspHold: 'Pausa inspiratoria',
  expHold: 'Pausa espiratoria',
  p01: 'P0.1 (oclusión 100 ms)',
  pocc: 'Oclusión espiratoria (ΔPocc)',
};

function Result({ r, showModel }: { r: ManeuverResult; showModel: boolean }) {
  const e = r.extra ?? {};
  return (
    <div className="item">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="ttl">{NAMES[r.kind]}</span>
        <span className={'badge ' + (r.valid ? 'b-ok' : 'b-bad')}>{r.valid ? 'válida' : 'no fiable'}</span>
      </div>
      {r.kind === 'inspHold' && (
        <dl className="kv num">
          <dt>Ppico</dt><dd>{f(e.ppeak)} cmH₂O</dd>
          <dt>P1 (cese de flujo)</dt><dd>{f(e.p1)} cmH₂O</dd>
          <dt>Pplat (P2)</dt><dd>{f(e.pplat)} cmH₂O</dd>
          <dt>PEEP de referencia</dt><dd>{f(e.peepTot)} cmH₂O</dd>
          <dt>Driving pressure</dt><dd>{f(e.dp)} cmH₂O</dd>
          <dt>Cstat = Vt / DP</dt><dd>{f(e.cstat, 0)} mL/cmH₂O</dd>
          <dt>R insp = (Ppico − Pplat)/V̇</dt><dd>{f(e.rinsp)} cmH₂O·s/L</dd>
          <dt>Rmín = (Ppico − P1)/V̇</dt><dd>{f(e.rmin)} cmH₂O·s/L</dd>
          <dt>τ = R·C</dt><dd>{Number.isFinite(e.rinsp) && Number.isFinite(e.cstat) ? f((e.rinsp * e.cstat) / 1000, 2) : '—'} s</dd>
        </dl>
      )}
      {r.kind === 'expHold' && (
        <dl className="kv num">
          <dt>PEEP total</dt><dd>{f(e.peepTotal)} cmH₂O</dd>
          <dt>PEEP programada</dt><dd>{f(e.peepSet, 0)} cmH₂O</dd>
          <dt>Auto-PEEP</dt><dd>{f(e.autoPeep)} cmH₂O</dd>
          <dt>Paw al ocluir</dt><dd>{f(e.start)} cmH₂O</dd>
        </dl>
      )}
      {r.kind === 'p01' && (
        <dl className="kv num">
          <dt>P0.1</dt><dd>{f(r.value)} cmH₂O</dd>
        </dl>
      )}
      {r.kind === 'pocc' && (
        <dl className="kv num">
          <dt>ΔPocc</dt><dd>{f(e.pocc)} cmH₂O</dd>
          <dt>Pmus estimada</dt><dd>{f(e.pmusEst)} cmH₂O</dd>
          <dt>ΔPL,din estimada</dt><dd>{f(e.ptpDyn)} cmH₂O</dd>
          <dt>P0.1</dt><dd>{f(e.p01)} cmH₂O</dd>
        </dl>
      )}
      {r.notes.filter((n) => showModel || !n.startsWith('Verificación del modelo')).map((n) => (
        <div className="small muted" key={n}>• {n}</div>
      ))}
    </div>
  );
}

export function ManeuversPanel({ ctl, m, showModel, tick }: { ctl: Controller; m: Monitor; showModel: boolean; tick: number }) {
  const sim = ctl.sim;
  const [ih, setIh] = useState(0.5);
  const [eh, setEh] = useState(3);
  const [pv, setPv] = useState<ReturnType<typeof quasiStaticPV> | null>(null);
  void tick;
  const pending = sim.pendingManeuver;
  const busy = pending !== null || sim.phase === 'holdI' || sim.phase === 'holdE' || sim.phase === 'occl';
  const run = (k: 'inspHold' | 'expHold' | 'p01' | 'pocc') => {
    sim.inspHoldTime = ih;
    sim.expHoldTime = eh;
    sim.requestManeuver(k);
    ctl.running = true;
  };
  const passive = sim.patient.effort.pmusMax <= 0.3 && !sim.patient.effort.reverseTrigger;
  const results = [...sim.maneuvers].reverse().slice(0, 8);
  return (
    <>
      <div className="sec">
        <h3>Maniobras de mecánica</h3>
        <p className="small muted">Las maniobras se ejecutan en el siguiente ciclo oportuno. La presión meseta y la PEEP total sólo son estáticas si no hay actividad muscular ni fugas.</p>
        <div className="row">
          <button onClick={() => run('inspHold')} disabled={busy}>Pausa inspiratoria</button>
          <select aria-label="Duración de la pausa inspiratoria" value={ih} onChange={(e) => setIh(parseFloat(e.target.value))}>
            {[0.3, 0.5, 1, 2, 3].map((v) => <option key={v} value={v}>{v} s</option>)}
          </select>
        </div>
        <div className="row">
          <button onClick={() => run('expHold')} disabled={busy}>Pausa espiratoria</button>
          <select aria-label="Duración de la pausa espiratoria" value={eh} onChange={(e) => setEh(parseFloat(e.target.value))}>
            {[1, 2, 3, 5].map((v) => <option key={v} value={v}>{v} s</option>)}
          </select>
        </div>
        <div className="row">
          <button onClick={() => run('p01')} disabled={busy}>P0.1</button>
          <button onClick={() => run('pocc')} disabled={busy}>ΔPocc (Pmus estimada)</button>
          {busy && <button onClick={() => sim.cancelManeuver()}>Cancelar</button>}
        </div>
        {busy && <div className="note">Maniobra en curso o pendiente: {pending ? NAMES[pending] : NAMES[sim.phase === 'holdI' ? 'inspHold' : sim.phase === 'holdE' ? 'expHold' : 'pocc']}…</div>}
        {!passive && <div className="note warn">El paciente tiene esfuerzo inspiratorio: la Pplat y la PEEP total pueden no ser fiables; P0.1 y ΔPocc sí son aplicables.</div>}
      </div>
      <div className="sec">
        <h4>Evaluación continua</h4>
        <dl className="kv num small">
          <dt>Flujo telespiratorio</dt><dd>{f(m.eef, 0)} L/min {m.eef < -3 ? '→ atrapamiento' : ''}</dd>
          <dt>R/C por mínimos cuadrados</dt><dd>{m.lsfValid ? `${f(m.rLsf)} cmH₂O·s/L · ${f(m.cLsf, 0)} mL/cmH₂O` : 'no válido (esfuerzo o ajuste pobre)'}</dd>
          <dt>Constante de tiempo</dt><dd>{f(m.tau, 2)} s</dd>
        </dl>
      </div>
      <div className="sec">
        <h4>Resultados</h4>
        {results.length === 0 && <p className="small muted">Aún no hay maniobras.</p>}
        <div className="list">{results.map((r) => <Result key={r.t + r.kind} r={r} showModel={showModel} />)}</div>
      </div>
      <div className="sec">
        <h4>Curva P-V cuasiestática (5 L/min)</h4>
        <p className="small muted">Inflado a flujo bajo desde ZEEP hasta 40 cmH₂O y desinflado. Separa sistema respiratorio, pulmón (PL, requiere Pes en la clínica) y pared torácica. Requiere paciente pasivo.</p>
        <button onClick={() => setPv(quasiStaticPV(sim.patient))}>Calcular curva P-V</button>
        {pv && (
          <>
            <StaticChart
              xlabel="Presión (cmH₂O)"
              ylabel="Volumen (mL)"
              xZero={false}
              series={[
                { xs: pv.infl.map((p) => p.paw), ys: pv.infl.map((p) => p.v), color: 'paw' },
                { xs: pv.defl.map((p) => p.paw), ys: pv.defl.map((p) => p.v), color: 'paw', dash: [5, 3] },
                ...(showModel
                  ? [
                      { xs: pv.infl.map((p) => p.pl), ys: pv.infl.map((p) => p.v), color: 'ptp' },
                      { xs: pv.defl.map((p) => p.pl), ys: pv.defl.map((p) => p.v), color: 'ptp', dash: [5, 3] },
                      { xs: pv.infl.map((p) => p.pcw), ys: pv.infl.map((p) => p.v), color: 'vol', width: 1.5 },
                    ]
                  : []),
              ]}
            />
            <div className="legend">
              <span style={{ ['--c' as string]: 'var(--paw)' }}>Sistema (Paw)</span>
              {showModel && <span style={{ ['--c' as string]: 'var(--ptp)' }}>Pulmón (PL)</span>}
              {showModel && <span style={{ ['--c' as string]: 'var(--vol)' }}>Pared (Ppl)</span>}
              <span className="muted">continua: inflado · discontinua: desinflado</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
