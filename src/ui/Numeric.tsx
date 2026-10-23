import type { Monitor } from '../engine/simulator';
import type { Gas } from '../engine/types';

const f = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));

type Badge = [string, string];
const MOD: Badge = ['modelo', 'b-model'];
const MAN: Badge = ['maniobra', 'b-man'];

/** Valor medido al estilo de un ventilador: rótulo y unidad arriba, cifra grande alineada a la derecha. */
function Val({ k, v, u, s, badge, big, tone, wide, bar }: { k: string; v: string; u?: string; s?: string; badge?: Badge; big?: boolean; tone?: string; wide?: boolean; bar?: number }) {
  return (
    <div className={'val' + (big ? ' big' : '') + (wide ? ' wide' : '')} style={tone ? ({ ['--tone' as string]: `var(--${tone})` } as React.CSSProperties) : undefined}>
      <div className="val-head">
        <span className="val-k">{k}</span>
        {badge ? <span className={'badge ' + badge[1]}>{badge[0]}</span> : <span className="val-u">{u}</span>}
      </div>
      <div className="val-v num">{v}</div>
      {bar !== undefined && (
        <div className="val-bar" aria-hidden="true">
          <div style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
      {(s || (badge && u)) && <div className="val-s">{badge && u ? <span className="val-u">{u}</span> : null}{s ? <span>{s}</span> : null}</div>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="vgroup">
      <h3 className="vg-title">{title}</h3>
      <div className="vg-grid">{children}</div>
    </section>
  );
}

interface Props {
  m: Monitor;
  g: Gas;
  fio2: number;
  showModel: boolean;
  showIcp: boolean;
  /** % de ciclos con asincronía (ventana reciente); `label` = asincronía estudiada, si la hay */
  asyn: { pct: number; cycles: number; asyncCycles: number; window: number; label: string | null };
}

export function Values({ m, g, fio2, showModel, showIcp, asyn }: Props) {
  const nb = m.noBreath;
  return (
    <div className="values" aria-label="Valores medidos">
      {nb && <div className="nobreath">Sin ciclos completos en 30 s: apnea, esfuerzos inefectivos o inicio de la simulación.</div>}
      <Group title="Presión">
        <Val big tone="paw" k="Ppico" u="cmH₂O" v={nb ? '—' : f(m.ppeak, 1)} />
        <Val big tone="paw" k="Pmeseta" u="cmH₂O" v={f(m.pplat, 1)} badge={m.pplat === null ? MAN : m.pplatValid ? undefined : ['no fiable', 'b-bad']} s={m.pplat !== null ? m.pplatSource : undefined} />
        <Val tone="paw" k="PEEP / PEEPtot" u="cmH₂O" v={`${f(m.peep, 0)} / ${f(m.peepTotal, 1)}`} s={showModel ? `PEEPi modelo ${f(m.autoPeepModel, 1)}` : m.peepTotalSource} />
        <Val tone="paw" k="ΔP (driving)" u="cmH₂O" v={f(m.dp, 1)} badge={m.dp === null ? MAN : undefined} />
        <Val tone="paw" k="Pmedia" u="cmH₂O" v={f(m.pmean, 1)} />
        <Val tone="paw" k="Pot. mecánica" u="J/min" v={f(m.mp, 1)} />
      </Group>
      <Group title="Volumen">
        <Val big tone="vol" k="VTe" u="mL" v={nb ? '—' : f(m.vte)} s={nb ? undefined : `VTi ${f(m.vti)} mL`} />
        <Val big tone="vol" k="VT / PBW" u="mL/kg" v={nb ? '—' : f(m.vtPerKg, 1)} />
        <Val tone="vol" k="VM" u="L/min" v={f(m.mv, 1)} />
        <Val tone="vol" k="FR tot / esp" u="/min" v={`${f(m.rrTotal)} / ${f(m.rrSpont)}`} />
        <Val wide tone="assist" k="Disparo paciente" u="% ciclos" v={nb ? '—' : f(m.patientTriggeredPct)} s="asistidos + espontáneos" />
        <Val
          wide
          big
          tone={asyn.cycles < 2 ? 'muted' : asyn.pct > 50 ? 'crit' : asyn.pct > 10 ? 'warn' : 'ok'}
          k={asyn.label ? `Asincronía · ${asyn.label}` : 'Asincronía'}
          u="% ciclos"
          v={asyn.cycles < 2 ? '—' : f(asyn.pct)}
          bar={asyn.cycles < 2 ? 0 : asyn.pct}
          s={asyn.cycles < 2 ? 'midiendo…' : `${asyn.asyncCycles} de ${asyn.cycles} ciclos · últimos ${f(asyn.window)} s · > 10 % = grave`}
        />
      </Group>
      <Group title="Mecánica">
        <Val tone="flow" k="Cstat / Cdin" u="mL/cmH₂O" v={`${f(m.cstat)} / ${f(m.cdyn)}`} badge={m.cstat === null ? MAN : undefined} />
        <Val tone="flow" k="R insp" u="cmH₂O/L/s" v={f(m.rInsp, 1)} s={m.rSource !== '—' ? m.rSource : undefined} />
        <Val tone="flow" k="τ = R·C" u="s" v={f(m.tau, 2)} />
        <Val tone="flow" k="I:E" u="" v={m.ie} s={`Ti ${f(m.ti, 2)} · Te ${f(m.te, 2)} s`} />
        <Val tone={m.eef < -3 ? 'warn' : 'flow'} k="Flujo tele-esp." u="L/min" v={f(m.eef)} s={m.eef < -3 ? 'no llega a 0: atrapamiento' : undefined} />
        <Val tone="flow" k="FR / VT" u="/min/L" v={f(m.rsbi)} />
      </Group>
      <Group title="Paciente">
        <Val tone="pmus" k="P0.1" u="cmH₂O" v={m.p01 !== null ? f(m.p01, 1) : showModel ? f(m.p01Model, 1) : '—'} badge={m.p01 !== null ? ['medida', 'b-ok'] : showModel ? MOD : MAN} />
        {showModel ? (
          <>
            <Val tone="pmus" k="Pmus pico" u="cmH₂O" v={f(m.pmusModel, 1)} badge={MOD} s={m.pmusEst !== null ? `estimada por Pocc ${f(m.pmusEst, 1)}` : undefined} />
            <Val tone="ptp" k="PL ei / ee" u="cmH₂O" v={`${f(m.ptpEI, 1)} / ${f(m.ptpEE, 1)}`} badge={MOD} s="≈ presión esofágica" />
            <Val tone="pmus" k="WOB" u="J/L" v={f(m.wobJL, 2)} badge={MOD} s={`PTP ${f(m.ptpMin)} cmH₂O·s/min`} />
            <Val tone="ptp" k="Reclutado" u="%" v={f(m.recruitFrac * 100)} badge={MOD} s={`sobredistensión ${f(m.overIndex * 100)} %`} />
            <Val tone="pmus" k="Índ. asincronía" u="%" v={f(m.asyncIndex)} badge={MOD} s="últimos 60 s" />
          </>
        ) : (
          <Val tone="pmus" k="Pmus / PL" u="" v="—" s="ocultos en el desafío experto" />
        )}
      </Group>
      <Group title="Gases y hemodinamia">
        <Val big tone={g.sao2 < 0.88 ? 'crit' : 'gas'} k="SpO₂" u="%" v={f(g.sao2 * 100)} />
        <Val big tone={g.ph < 7.2 || g.ph > 7.5 ? 'crit' : 'gas'} k="pH" u="" v={f(g.ph, 2)} s={`HCO₃⁻ ${f(g.hco3, 1)}`} />
        <Val tone="gas" k="PaCO₂" u="mmHg" v={f(g.paco2)} s={`V̇A ${f(g.va, 1)} L/min · VD/VT ${f(g.vdvt * 100)} %`} />
        <Val tone="gas" k="PaO₂ / FiO₂" u="" v={f(g.pao2 / fio2)} s={`PaO₂ ${f(g.pao2)} mmHg`} />
        <Val tone={g.map < 65 ? 'crit' : 'gas'} k="PAM" u="mmHg" v={f(g.map)} s={`estimada · FC ${f(g.hrate)} · GC ${f(g.co, 1)}`} />
        <Val tone="gas" k="Shunt" u="%" v={f(g.shunt * 100)} badge={MOD} />
        {showIcp && (
          <>
            <Val tone="gas" k="PIC" u="mmHg" v={f(g.icp)} s="estimada" />
            <Val tone={g.cpp < 60 ? 'crit' : 'gas'} k="PPC" u="mmHg" v={f(g.cpp)} />
          </>
        )}
      </Group>
      <p className="val-note">Gasometría de un modelo de compartimento único con dinámica acelerada (τCO₂ ≈ 30 s): muestra tendencias, no valores clínicos.</p>
    </div>
  );
}
