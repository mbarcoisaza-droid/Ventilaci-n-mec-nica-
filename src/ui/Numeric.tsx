import type { Monitor } from '../engine/simulator';
import type { Gas } from '../engine/types';

const f = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));

function Tile({ k, v, u, s, badge, wide, color }: { k: string; v: string; u?: string; s?: string; badge?: [string, string]; wide?: boolean; color?: string }) {
  return (
    <div className={'tile' + (wide ? ' wide' : '')}>
      <div className="k">
        <span>{k}</span>
        {badge && <span className={'badge ' + badge[1]}>{badge[0]}</span>}
      </div>
      <div className="v" style={color ? { color } : undefined}>
        {v}
        {u && <span className="u">{u}</span>}
      </div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

export function Numeric({ m, showModel }: { m: Monitor; showModel: boolean }) {
  const MOD: [string, string] = ['modelo', 'b-model'];
  return (
    <div className="nums" aria-label="Monitor numérico">
      {m.noBreath && <Tile wide k="Sin ciclos completos" v="" s="No se ha completado ningún ciclo en los últimos 30 s (apnea, esfuerzos inefectivos o inicio de la simulación)." color="var(--warn)" />}
      <Tile k="Ppico" v={m.noBreath ? '—' : f(m.ppeak, 1)} u="cmH₂O" color="var(--paw)" />
      <Tile
        k="Pplat"
        v={f(m.pplat, 1)}
        u="cmH₂O"
        badge={m.pplat === null ? ['maniobra', 'b-man'] : m.pplatValid ? ['válida', 'b-ok'] : ['no fiable', 'b-bad']}
        s={m.pplatSource}
        color="var(--paw)"
      />
      <Tile k="PEEP / PEEPtot" v={`${f(m.peep, 0)} / ${f(m.peepTotal, 1)}`} u="cmH₂O" badge={m.peepTotal === null ? ['maniobra', 'b-man'] : undefined} s={showModel ? `auto-PEEP modelo ${f(m.autoPeepModel, 1)}` : m.peepTotalSource} />
      <Tile k="Driving P" v={f(m.dp, 1)} u="cmH₂O" badge={m.dp === null ? ['maniobra', 'b-man'] : undefined} />
      <Tile k="Vti / Vte" v={m.noBreath ? '— / —' : `${f(m.vti)} / ${f(m.vte)}`} u="mL" color="var(--vol)" />
      <Tile k="Vt / PBW" v={m.noBreath ? '—' : f(m.vtPerKg, 1)} u="mL/kg" />
      <Tile k="Vol. minuto" v={f(m.mv, 1)} u="L/min" />
      <Tile k="FR total / esp." v={`${f(m.rrTotal)} / ${f(m.rrSpont)}`} u="rpm" />
      <Tile k="Cstat / Cdin" v={`${f(m.cstat)} / ${f(m.cdyn)}`} u="mL/cmH₂O" badge={m.cstat === null ? ['maniobra', 'b-man'] : undefined} />
      <Tile k="R insp" v={f(m.rInsp, 1)} u="cmH₂O/L/s" s={m.rSource} badge={m.rSource === 'mínimos cuadrados' ? ['estimada', 'b-est'] : undefined} />
      <Tile k="τ = R·C" v={f(m.tau, 2)} u="s" badge={m.tau !== null ? ['estimada', 'b-est'] : undefined} />
      <Tile k="Pmedia" v={f(m.pmean, 1)} u="cmH₂O" />
      <Tile k="I:E" v={m.ie} s={`Ti ${f(m.ti, 2)} s · Te ${f(m.te, 2)} s`} />
      <Tile k="Flujo tele-esp." v={f(m.eef)} u="L/min" color={m.eef < -3 ? 'var(--warn)' : undefined} s={m.eef < -3 ? 'no llega a 0: atrapamiento' : 'flujo al final de la espiración'} />
      <Tile k="Potencia mec." v={f(m.mp, 1)} u="J/min" badge={['∫Paw·dV', 'b-est']} />
      <Tile k="P0.1" v={m.p01 !== null ? f(m.p01, 1) : showModel ? f(m.p01Model, 1) : '—'} u="cmH₂O" badge={m.p01 !== null ? ['medida', 'b-ok'] : showModel ? MOD : ['maniobra', 'b-man']} />
      {showModel && (
        <>
          <Tile k="Pmus pico" v={f(m.pmusModel, 1)} u="cmH₂O" badge={MOD} color="var(--pmus)" s={m.pmusEst !== null ? `estimada por Pocc ${f(m.pmusEst, 1)}` : undefined} />
          <Tile k="WOB paciente" v={f(m.wobJL, 2)} u="J/L" badge={MOD} s={`${f(m.wobJmin, 1)} J/min · PTP ${f(m.ptpMin)} cmH₂O·s/min`} />
          <Tile k="PL ei / ee" v={`${f(m.ptpEI, 1)} / ${f(m.ptpEE, 1)}`} u="cmH₂O" badge={MOD} color="var(--ptp)" s="equivale a disponer de Pes" />
          <Tile k="Reclutamiento" v={f(m.recruitFrac * 100)} u="%" badge={MOD} s={`sobredistensión ${f(m.overIndex * 100)} %`} />
        </>
      )}
      <Tile k="Índ. asincronía" v={showModel ? f(m.asyncIndex) : '—'} u="%" badge={showModel ? MOD : ['oculto', 'b-est']} s="últimos 60 s" />
      <Tile k="FR/Vt" v={f(m.rsbi)} u="rpm/L" />
    </div>
  );
}

export function GasTiles({ g, fio2, showIcp }: { g: Gas; fio2: number; showIcp: boolean }) {
  const ph = g.ph;
  return (
    <div className="nums" aria-label="Gasometría y hemodinamia estimadas">
      <Tile k="SpO₂" v={f(g.sao2 * 100)} u="%" color={g.sao2 < 0.88 ? 'var(--crit)' : undefined} />
      <Tile k="PaO₂ / FiO₂" v={f(g.pao2 / fio2)} s={`PaO₂ ${f(g.pao2)} mmHg`} />
      <Tile k="pH" v={f(ph, 2)} color={ph < 7.2 || ph > 7.5 ? 'var(--crit)' : undefined} s={`HCO₃⁻ ${f(g.hco3, 1)}`} />
      <Tile k="PaCO₂" v={f(g.paco2)} u="mmHg" s={`V̇A ${f(g.va, 1)} L/min · VD/VT ${f(g.vdvt * 100)} %`} />
      <Tile k="PAM" v={f(g.map)} u="mmHg" color={g.map < 65 ? 'var(--crit)' : undefined} badge={['estimada', 'b-est']} s={`FC ${f(g.hrate)} · GC ${f(g.co, 1)} L/min`} />
      <Tile k="Shunt" v={f(g.shunt * 100)} u="%" badge={['modelo', 'b-model']} />
      {showIcp && (
        <>
          <Tile k="PIC" v={f(g.icp)} u="mmHg" badge={['estimada', 'b-est']} />
          <Tile k="PPC" v={f(g.cpp)} u="mmHg" color={g.cpp < 60 ? 'var(--crit)' : undefined} />
        </>
      )}
      <Tile wide k="Gasometría" v="" s="Modelo de compartimento único con dinámica acelerada (τCO₂ ≈ 30 s): tendencias, no valores clínicos." />
    </div>
  );
}
