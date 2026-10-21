import type { EffortParams, PatientParams } from '../../engine/types';
import { PHENOTYPE_LIST, PHENOTYPES } from '../../engine/presets';
import { predictedBodyWeight } from '../../engine/mechanics';

interface P {
  p: PatientParams;
  onChange: (p: PatientParams) => void;
  onPhenotype: (id: string) => void;
  hidden: boolean;
}

function Slider({ id, label, unit, v, min, max, step, on }: { id: string; label: string; unit: string; v: number; min: number; max: number; step: number; on: (v: number) => void }) {
  return (
    <div className="knob">
      <label className="lab" htmlFor={id}>
        <span>{label}</span>
        <span className="num">{Math.round(v * 100) / 100} {unit}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(parseFloat(e.target.value))} />
    </div>
  );
}

export function PatientPanel({ p, onChange, onPhenotype, hidden }: P) {
  const set = (k: keyof PatientParams, v: number | string) => onChange({ ...p, [k]: v });
  const setE = (k: keyof EffortParams, v: number | boolean) => onChange({ ...p, effort: { ...p.effort, [k]: v } });
  const pbw = predictedBodyWeight(p.sex, p.heightCm);
  const ers = p.eL + p.eCW;
  return (
    <>
      <div className="sec">
        <h3>Paciente</h3>
        <div className="row">
          <label htmlFor="sex" className="small muted">Sexo</label>
          <select id="sex" value={p.sex} onChange={(e) => set('sex', e.target.value)}>
            <option value="M">Varón</option>
            <option value="F">Mujer</option>
          </select>
          <label htmlFor="height" className="small muted">Talla (cm)</label>
          <input id="height" type="number" value={p.heightCm} min={130} max={210} onChange={(e) => set('heightCm', parseFloat(e.target.value) || 170)} style={{ width: 70 }} />
          <label htmlFor="weight" className="small muted">Peso real (kg)</label>
          <input id="weight" type="number" value={p.weightKg} min={30} max={250} onChange={(e) => set('weightKg', parseFloat(e.target.value) || 70)} style={{ width: 70 }} />
        </div>
        <p className="small">
          PBW = {p.sex === 'M' ? '50' : '45.5'} + 0.91 × ({p.heightCm} − 152.4) = <b className="num">{pbw.toFixed(1)} kg</b> · Vt 6 mL/kg = <b className="num">{(pbw * 6).toFixed(0)} mL</b>
        </p>
      </div>
      {hidden ? (
        <div className="note">En el desafío experto la mecánica y el esfuerzo del paciente están ocultos: dedúzcalos de las curvas y de las maniobras.</div>
      ) : (
        <>
          <div className="sec">
            <h3>Fenotipo</h3>
            <select aria-label="Fenotipo fisiológico" value={Object.keys(PHENOTYPES).find((k) => PHENOTYPES[k].label === p.label) ?? ''} onChange={(e) => onPhenotype(e.target.value)}>
              <option value="" disabled>— personalizado —</option>
              {PHENOTYPE_LIST.map((x) => (
                <option key={x.id} value={x.id}>{x.label}</option>
              ))}
            </select>
            <p className="small muted">Cambiar de fenotipo conserva la configuración del ventilador.</p>
          </div>
          <div className="sec">
            <h3>Mecánica</h3>
            <p className="small num">Ers {ers.toFixed(0)} cmH₂O/L (Crs ≈ {(1000 / ers).toFixed(0)} mL/cmH₂O con pulmón abierto) · EL/Ers {(p.eL / ers).toFixed(2)}</p>
            <div className="knobs">
              <Slider id="p-eL" label="Elastancia pulmonar" unit="cmH₂O/L" v={p.eL} min={3} max={40} step={0.5} on={(v) => set('eL', v)} />
              <Slider id="p-eCW" label="Elastancia pared" unit="cmH₂O/L" v={p.eCW} min={2} max={30} step={0.5} on={(v) => set('eCW', v)} />
              <Slider id="p-ppl0" label="Ppl a CRF" unit="cmH₂O" v={p.ppl0} min={-6} max={12} step={0.5} on={(v) => set('ppl0', v)} />
              <Slider id="p-rI" label="R inspiratoria" unit="cmH₂O·s/L" v={p.rInsp} min={2} max={50} step={0.5} on={(v) => set('rInsp', v)} />
              <Slider id="p-rE" label="R espiratoria" unit="cmH₂O·s/L" v={p.rExp} min={2} max={60} step={0.5} on={(v) => set('rExp', v)} />
              <Slider id="p-k2" label="Rohrer K2" unit="cmH₂O·s²/L²" v={p.k2} min={0} max={15} step={0.5} on={(v) => set('k2', v)} />
              <Slider id="p-efl" label="Limitación espiratoria (Rus)" unit="0 = no" v={p.eflRus} min={0} max={100} step={1} on={(v) => set('eflRus', v)} />
              <Slider id="p-rmin" label="Pulmón aireado mínimo" unit="fracción" v={p.rMin} min={0.25} max={1} step={0.01} on={(v) => set('rMin', v)} />
              <Slider id="p-popen" label="P apertura (50 %)" unit="cmH₂O PL" v={p.pOpen} min={-4} max={30} step={0.5} on={(v) => set('pOpen', v)} />
              <Slider id="p-vod" label="Inicio sobredistensión" unit="L sobre CRF" v={p.vOd} min={0.5} max={3} step={0.05} on={(v) => set('vOd', v)} />
              <Slider id="p-leak" label="Fuga" unit="L/min a 10 cmH₂O" v={p.leak} min={0} max={30} step={0.5} on={(v) => set('leak', v)} />
              <div className="knob">
                <label className="lab" htmlFor="p-leaksite"><span>Sitio de la fuga</span></label>
                <select id="p-leaksite" value={p.leakSite} onChange={(e) => set('leakSite', e.target.value)}>
                  <option value="airway">Vía aérea / neumotaponamiento</option>
                  <option value="alveolar">Alveolar (fístula broncopleural)</option>
                </select>
              </div>
              <Slider id="p-card" label="Oscilación cardiogénica" unit="cmH₂O" v={p.cardiacAmp} min={0} max={2} step={0.1} on={(v) => set('cardiacAmp', v)} />
            </div>
          </div>
          <div className="sec">
            <h3>Esfuerzo inspiratorio</h3>
            <div className="knobs">
              <Slider id="e-pmus" label="Pmus pico" unit="cmH₂O" v={p.effort.pmusMax} min={0} max={30} step={0.5} on={(v) => setE('pmusMax', v)} />
              <Slider id="e-rr" label="FR neural" unit="rpm" v={p.effort.rr} min={6} max={45} step={1} on={(v) => setE('rr', v)} />
              <Slider id="e-ti" label="Ti neural" unit="s" v={p.effort.tiNeural} min={0.4} max={2} step={0.05} on={(v) => setE('tiNeural', v)} />
              <Slider id="e-relax" label="Relajación τ" unit="s" v={p.effort.relaxTau} min={0.05} max={0.5} step={0.01} on={(v) => setE('relaxTau', v)} />
              <Slider id="e-actexp" label="Espiración activa" unit="cmH₂O" v={p.effort.activeExp} min={0} max={15} step={0.5} on={(v) => setE('activeExp', v)} />
              <Slider id="e-reflex" label="Reflejo espiratorio" unit="cmH₂O" v={p.effort.expReflex} min={0} max={15} step={0.5} on={(v) => setE('expReflex', v)} />
              <Slider id="e-var" label="Variabilidad" unit="CV" v={p.effort.variability} min={0} max={0.3} step={0.01} on={(v) => setE('variability', v)} />
              <Slider id="e-chemo" label="Control químico (CO₂)" unit="/mmHg" v={p.effort.chemoGain} min={0} max={0.1} step={0.005} on={(v) => setE('chemoGain', v)} />
            </div>
            <label className="small row">
              <input type="checkbox" checked={p.effort.reverseTrigger} onChange={(e) => setE('reverseTrigger', e.target.checked)} /> Disparo reverso (arrastre)
            </label>
            {p.effort.reverseTrigger && (
              <div className="knobs">
                <Slider id="e-rtd" label="Retraso" unit="s" v={p.effort.rtDelay} min={0.1} max={1.5} step={0.05} on={(v) => setE('rtDelay', v)} />
                <Slider id="e-rta" label="Amplitud" unit="cmH₂O" v={p.effort.rtAmp} min={1} max={25} step={0.5} on={(v) => setE('rtAmp', v)} />
                <Slider id="e-rtr" label="Relación" unit="1:n" v={p.effort.rtRatio} min={1} max={3} step={1} on={(v) => setE('rtRatio', v)} />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
