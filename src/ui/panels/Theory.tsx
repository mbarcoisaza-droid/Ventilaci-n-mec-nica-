import { useState } from 'react';
import type { ModeId } from '../../engine/types';
import { MODES } from '../../education/modes';
import { REF } from '../../cases/cases';

export function TheoryPanel({ mode }: { mode: ModeId }) {
  const [sel, setSel] = useState<ModeId>(mode);
  const m = MODES.find((x) => x.id === sel)!;
  return (
    <>
      <div className="sec">
        <h3>Modos ventilatorios</h3>
        <select aria-label="Modo a consultar" value={sel} onChange={(e) => setSel(e.target.value as ModeId)}>
          {MODES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <dl className="kv small">
          <dt>Clasificación</dt><dd>{m.taxonomy}</dd>
          <dt>Nombres comerciales</dt><dd>{m.commercial}</dd>
          <dt>Disparo</dt><dd>{m.trigger}</dd>
          <dt>Control / objetivo</dt><dd>{m.target}</dd>
          <dt>Límite</dt><dd>{m.limit}</dd>
          <dt>Ciclado</dt><dd>{m.cycle}</dd>
          <dt>Basal</dt><dd>{m.baseline}</dd>
          <dt>Forma de onda</dt><dd>{m.waveform}</dd>
          <dt>Interacción</dt><dd>{m.interaction}</dd>
          <dt>Ventajas</dt><dd>{m.pros}</dd>
          <dt>Limitaciones y riesgos</dt><dd>{m.cons}</dd>
        </dl>
        <p className="small muted">Las denominaciones comerciales difieren entre fabricantes; la clasificación (Chatburn) describe el principio: variable de control (VC/PC), secuencia de respiración (CMV, IMV, CSV) y esquema de objetivo (set-point, dual, adaptativo…).</p>
      </div>
      <div className="sec">
        <h3>Motor fisiológico</h3>
        <div className="note num">Paw(t) + Pmus(t) = Pel(V) + R·V̇ + K₂·V̇|V̇| + P₂</div>
        <ul className="tight small">
          <li><b>Signos y referencias.</b> Presiones en cmH₂O relativas a la atmósfera. V̇ &gt; 0 hacia el paciente. Pmus &gt; 0 = esfuerzo inspiratorio (equivale a una caída de la presión pleural); Pmus &lt; 0 = espiración activa. V = volumen sobre la CRF pasiva (volumen de relajación a ZEEP).</li>
          <li><b>Partición.</b> Pel = PL,el + Pcw. Pcw = Ppl₀ + Ecw·V; Ppl = Pcw − Pmus; Palv = Paw − R·V̇; PL = Palv − Ppl.</li>
          <li><b>Pulmón no lineal.</b> PL,el = −Ppl₀ + (EL/r)·V + Kod·max(0, V − Vod·r)² + P₂. r = fracción aireada (reclutamiento) con cinética de apertura rápida (τ ≈ 2 s) y cierre lento (τ ≈ 6 s) hacia una sigmoide de la PL → efecto de la PEEP, histéresis y desreclutamiento.</li>
          <li><b>Viscoelasticidad.</b> Cuerpo de Maxwell (Bates): dP₂/dt = E₂·V̇ − P₂/τ₂. Explica Ppico → P1 → P2 durante la pausa y la diferencia entre compliance dinámica y estática.</li>
          <li><b>Resistencia.</b> Lineal + Rohrer (dependiente del flujo), distinta en inspiración y espiración.</li>
          <li><b>Limitación al flujo espiratorio.</b> V̇max = (PL,el − Pcrit)²/(Rus·5): independiente de Paw (efecto cascada), por eso una PEEP externa inferior a la crítica no aumenta la PEEP total.</li>
          <li><b>Ventilador.</b> VC impone flujo; PC/PS imponen Paw con rise time (subamortiguado si es 0); espiración a PEEP con resistencia de válvula; disparo por presión (circuito sin flujo basal) o flujo (flow-by), retraso de 40 ms y periodo refractario de 120 ms. El disparo, los esfuerzos inefectivos, el doble disparo y el atrapamiento emergen de la ecuación, no están programados.</li>
          <li><b>Integración.</b> Euler explícito a 500 Hz; registro a 100 Hz.</li>
          <li><b>Intercambio gaseoso.</b> PaCO₂ = 0.863·V̇CO₂/V̇A con espacio muerto anatómico (2.2 mL/kg PBW), instrumental y alveolar; PaO₂ por gas alveolar + shunt dependiente del reclutamiento + componente V/Q; dinámica acelerada (τCO₂ ≈ 30 s).</li>
          <li><b>Hemodinamia.</b> El gasto cae con la presión pleural media (retorno venoso) y, con disfunción del VD, con la PL y la hipercapnia. Es una estimación cualitativa.</li>
        </ul>
      </div>
      <div className="sec">
        <h3>Simplificaciones y lo que no se reproduce</h3>
        <ul className="tight small">
          <li>Modelo de un compartimento: no reproduce heterogeneidad regional, pendelluft, constantes de tiempo múltiples ni redistribución durante la pausa (salvo la viscoelasticidad global).</li>
          <li>El reclutamiento es una variable global; no hay apertura/cierre por regiones ni presión superimpuesta gravitacional.</li>
          <li>Sin compresibilidad del circuito, humidificación, ni dinámica de válvulas reales de un fabricante concreto.</li>
          <li>El impulso respiratorio tiene un control químico simple opcional; no modela dolor, ansiedad, reflejos vagales (salvo el reflejo espiratorio) ni fatiga muscular.</li>
          <li>La fuga por fístula no elimina CO₂ en el modelo (en la realidad sí participa en parte).</li>
          <li>PAM, gasto cardíaco y PIC son estimaciones cualitativas para mostrar tendencias.</li>
          <li>Las variables «modelo» (Pmus, Ppl, PL) equivalen a disponer de presión esofágica ideal; en la clínica la Pes tiene artefactos y requiere validación (test de oclusión).</li>
        </ul>
        <p className="disclaimer">Herramienta educativa sin validación clínica formal: no constituye un sistema de soporte a decisiones en pacientes reales. Los parámetros de los fenotipos son aproximaciones a valores publicados.</p>
      </div>
      <div className="sec">
        <h3>Bibliografía principal</h3>
        <ul className="tight small muted">
          {[REF.chatburn, REF.tobin, REF.marini, REF.hess, REF.bates, REF.hyatt, REF.ardsnet, REF.amato, REF.esicm, REF.power, REF.thille, REF.varon, REF.akoumianaki, REF.psili, REF.bertoni, REF.telias].map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </>
  );
}
