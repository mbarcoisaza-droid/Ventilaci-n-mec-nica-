import type { Simulator, Monitor } from '../engine/simulator';
import { Simulator as Sim } from '../engine/simulator';
import type { PatientParams, VentSettings } from '../engine/types';
import { ASYNCHRONIES, ASYNC_EVENT_LABEL } from './asynchronies';

/**
 * Asistente de resolución de asincronías (nivel guiado).
 *  - dominantAsync: asincronía predominante en una ventana reciente (detector del modelo).
 *  - planFix: ajustes del ventilador calculados a partir de la programación actual y del
 *    esfuerzo del paciente, una corrección «de la causa» en el paciente (lo que en la clínica
 *    sería analgesia, reparar una fuga, broncodilatadores…) y recomendaciones para la práctica.
 */

const PRIORITY = ['stacking', 'double', 'reverse', 'autotrigger', 'ineffective', 'airTrapping', 'prematureCycle', 'delayedCycle', 'lateTrigger', 'flowStarvation', 'flowAsync', 'flowExcess'];

export function dominantAsync(sim: Simulator, windowSec = 30): { type: string; count: number; label: string } | null {
  const t0 = sim.t - windowSec;
  const counts: Record<string, number> = {};
  for (const e of sim.asyncEvents) if (e.t > t0) counts[e.type] = (counts[e.type] ?? 0) + 1;
  if (sim.modeAllowsTrigger) {
    const ineff = sim.drive.efforts.filter((e) => e.onset > t0 && e.onset < sim.t - e.ti - 0.3 && !e.triggered && !e.reverse).length;
    if (ineff) counts.ineffective = ineff;
  }
  // el doble ciclado por disparo reverso se atribuye al disparo reverso
  if (counts.reverse && counts.double) delete counts.double;
  // la de mayor relevancia clínica entre las frecuentes (≥ 2 eventos y ≥ 25 % de la más frecuente)
  const max = Math.max(0, ...Object.values(counts));
  const best = PRIORITY.find((k) => (counts[k] ?? 0) >= 2 && (counts[k] ?? 0) >= max * 0.25) ?? null;
  if (!best) return null;
  return { type: best, count: counts[best], label: ASYNC_EVENT_LABEL[best] ?? best };
}

export interface FixStep {
  label: string; // «ETS 25 → 45 %»
  why: string;
}

export interface FixPlan {
  type: string;
  name: string;
  settings: VentSettings;
  steps: FixStep[];
  patient: PatientParams;
  patientSteps: FixStep[];
  realLife: string[];
  confirm: string[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function planFix(type: string, s0: VentSettings, p0: PatientParams, m: Monitor): FixPlan {
  const s: VentSettings = { ...s0, alarms: { ...s0.alarms } };
  const steps: FixStep[] = [];
  const change = <K extends keyof VentSettings>(k: K, v: VentSettings[K], label: string, why: string) => {
    if (s[k] === v) return;
    s[k] = v;
    steps.push({ label, why });
  };
  const vc = s.mode === 'VCV' || s.mode === 'SIMV_VC';
  const pc = s.mode === 'PCV' || s.mode === 'SIMV_PC' || s.mode === 'PRVC';
  const ps = s.mode === 'PSV' || s.mode === 'VS' || s.mode === 'CPAP' || s.mode === 'BILEVEL';
  const tiNeural = p0.effort.alt?.tiNeural ?? p0.effort.tiNeural;
  const autoPeep = Math.max(0, m.autoPeepModel);
  const peepTot = s.peep + autoPeep;
  const def = ASYNCHRONIES.find((a) => a.id === type);
  const realLife: string[] = [];

  /** alarga el Ti mecánico en VC hasta ≈ ti objetivo con pausa y/o menos flujo */
  const vcTiTo = (target: number) => {
    const tiFlow = Sim.vcTi(s);
    const need = target - tiFlow;
    if (need <= 0.05) return;
    const pause = Math.min(0.5, r2(Math.max(0, need)));
    if (pause > s.pause) change('pause', pause, `Pausa inspiratoria ${s.pause} → ${pause} s`, `Prolonga el Ti mecánico hacia el Ti neural (≈ ${r2(tiNeural)} s).`);
    const rest = target - (Sim.vcTi(s) + s.pause);
    if (rest > 0.05) {
      const meanFlow = (s.vt / 1000) / (target - s.pause); // L/s
      const peak = Math.max(30, Math.round((s.flowPattern === 'square' ? meanFlow : meanFlow / 0.625) * 60));
      if (peak < s.peakFlow) change('peakFlow', peak, `Flujo pico ${s.peakFlow} → ${peak} L/min`, 'Con menos flujo la insuflación dura más; vigile que no aparezca flujo insuficiente.');
    }
  };

  switch (type) {
    case 'ineffective': {
      if (ps && s.ps > 8) change('ps', Math.max(6, Math.round(s.ps * 0.65)), `Presión de soporte ${s.ps} → ${Math.max(6, Math.round(s.ps * 0.65))} cmH₂O`, 'Menos sobreasistencia: Vt menor, espiración más corta y menos auto-PEEP.');
      if (ps && s.ets < 35) change('ets', 40, `Ciclado (ETS) ${s.ets} → 40 %`, 'Termina antes la inspiración y alarga la espiración.');
      if (autoPeep >= 2) {
        const pe = Math.round(peepTot * 0.75);
        if (pe > s.peep) change('peep', pe, `PEEP ${s.peep} → ${pe} cmH₂O`, `Contrabalancea ≈ 75 % de la PEEP total (${r1(peepTot)}): reduce el umbral que el esfuerzo debe vencer.`);
      }
      if (s.triggerType === 'pressure') {
        change('triggerType', 'flow', 'Disparo por presión → por flujo', 'El disparo por flujo responde antes al esfuerzo.');
        change('flowTrigger', 2, 'Sensibilidad 2 L/min', 'Sensibilidad habitual sin autodisparo.');
      } else if (s.flowTrigger > 2) change('flowTrigger', 2, `Sensibilidad ${s.flowTrigger} → 2 L/min`, 'Más sensible al esfuerzo.');
      if (vc && autoPeep >= 2) change('rr', Math.max(10, s.rr - 4), `FR ${s.rr} → ${Math.max(10, s.rr - 4)}/min`, 'Más tiempo espiratorio, menos auto-PEEP.');
      break;
    }
    case 'autotrigger':
      change('leakComp', true, 'Activar compensación de fugas', 'Evita que el flujo de fuga se interprete como esfuerzo.');
      if (s.triggerType === 'flow') change('flowTrigger', Math.min(6, Math.max(3, s.flowTrigger + 2)), `Sensibilidad ${s.flowTrigger} → ${Math.min(6, Math.max(3, s.flowTrigger + 2))} L/min`, 'Menos sensible: por encima de la fuga y de las oscilaciones cardíacas.');
      else change('pressureTrigger', Math.min(5, s.pressureTrigger + 1), `Sensibilidad ${s.pressureTrigger} → ${Math.min(5, s.pressureTrigger + 1)} cmH₂O`, 'Menos sensible a las oscilaciones cardiogénicas.');
      break;
    case 'double':
    case 'stacking':
    case 'prematureCycle': {
      const target = Math.min(2.2, tiNeural * 0.9);
      if (vc) {
        if (s.flowPattern === 'square') change('flowPattern', 'decel', 'Patrón de flujo constante → desacelerado', 'Entrega el flujo más pronto y prolonga la insuflación.');
        vcTiTo(target);
      } else if (pc) {
        const ti = r2(Math.max(s.ti, target));
        change('ti', ti, `Ti ${s.ti} → ${ti} s`, `Ajusta el Ti mecánico al Ti neural (≈ ${r2(tiNeural)} s).`);
      } else if (ps) {
        const ets = Math.max(10, Math.min(25, s.ets - 20));
        change('ets', ets, `Ciclado (ETS) ${s.ets} → ${ets} %`, 'Cicla más tarde: la inspiración acompaña al esfuerzo.');
        if (type === 'prematureCycle') change('ps', s.ps + 2, `Presión de soporte ${s.ps} → ${s.ps + 2} cmH₂O`, 'Algo más de soporte durante el esfuerzo.');
      }
      break;
    }
    case 'reverse':
      if (!ps) {
        change('rr', s.rr + 6, `FR ${s.rr} → ${s.rr + 6}/min`, 'Cambiar la FR modifica la relación de arrastre; su efecto es impredecible.');
      }
      break;
    case 'lateTrigger':
      if (s.triggerType === 'pressure') {
        change('triggerType', 'flow', 'Disparo por presión → por flujo', 'Detecta antes el esfuerzo.');
        change('flowTrigger', 2, 'Sensibilidad 2 L/min', '');
      }
      if (autoPeep >= 2) {
        const pe = Math.round(peepTot * 0.75);
        if (pe > s.peep) change('peep', pe, `PEEP ${s.peep} → ${pe} cmH₂O`, `Contrabalanceo de la auto-PEEP (PEEP total ${r1(peepTot)}).`);
      }
      break;
    case 'delayedCycle': {
      if (ps) {
        const ets = Math.min(60, s.ets + 25);
        change('ets', ets, `Ciclado (ETS) ${s.ets} → ${ets} %`, 'Cicla antes, cuando termina el esfuerzo (clave en EPOC).');
        if (s.ps > 8) change('ps', s.ps - 3, `Presión de soporte ${s.ps} → ${s.ps - 3} cmH₂O`, 'Menos Vt y menos tiempo inspiratorio.');
      } else if (pc) {
        const ti = r2(Math.max(0.5, tiNeural + 0.1));
        if (ti < s.ti) change('ti', ti, `Ti ${s.ti} → ${ti} s`, `Ajusta el Ti mecánico al Ti neural (≈ ${r2(tiNeural)} s).`);
      } else if (vc) {
        if (s.pause > 0) change('pause', 0, `Pausa ${s.pause} → 0 s`, 'Acorta la inspiración.');
        if (Sim.vcTi(s) > tiNeural + 0.15) {
          const peak = Math.min(100, Math.round(s.peakFlow * 1.3));
          change('peakFlow', peak, `Flujo pico ${s.peakFlow} → ${peak} L/min`, 'Insuflación más corta.');
        }
      }
      break;
    }
    case 'flowStarvation':
      if (vc) {
        const peak = Math.min(110, Math.max(80, Math.round(s.peakFlow * 1.8)));
        change('peakFlow', peak, `Flujo pico ${s.peakFlow} → ${peak} L/min`, 'Cubre la demanda inspiratoria del paciente durante toda la insuflación.');
        realLife.push('Si persiste con flujo alto, pase a un modo por presión (PCV/PSV), que entrega el flujo que el paciente demanda, vigilando el Vt.');
      }
      break;
    case 'flowAsync':
      if (s.riseTime > 0.08) change('riseTime', 0.05, `Rampa ${s.riseTime} → 0.05 s`, 'Presurización más rápida al inicio del esfuerzo.');
      if (ps || pc) {
        const k = ps ? 'ps' : 'pinsp';
        const v = (s[k] as number) + 3;
        change(k, v, `${ps ? 'Presión de soporte' : 'Pinsp'} ${s[k]} → ${v} cmH₂O`, 'Más presión para la demanda; vigile el Vt.');
      }
      break;
    case 'flowExcess':
      if (s.riseTime < 0.1) change('riseTime', 0.2, `Rampa ${s.riseTime} → 0.2 s`, 'Elimina el sobreimpulso de presión inicial.');
      if (ps && s.ps > 14) change('ps', s.ps - 4, `Presión de soporte ${s.ps} → ${s.ps - 4} cmH₂O`, 'Flujo pico menor.');
      if (vc && s.peakFlow > 80) change('peakFlow', 60, `Flujo pico ${s.peakFlow} → 60 L/min`, 'Menos flujo en un Ti tan corto.');
      break;
    case 'airTrapping': {
      const rr = Math.max(10, Math.round(s.rr * 0.6));
      if (rr < s.rr && !ps) change('rr', rr, `FR ${s.rr} → ${rr}/min`, 'La FR es lo que más alarga el tiempo espiratorio.');
      if (vc) {
        const peak = Math.min(100, Math.round(s.peakFlow * 1.4));
        change('peakFlow', peak, `Flujo pico ${s.peakFlow} → ${peak} L/min`, 'Acorta el Ti y deja más Te.');
        if (s.pause > 0.1) change('pause', 0, `Pausa ${s.pause} → 0 s`, 'Más tiempo espiratorio.');
        const vt = Math.round((s.vt * 0.85) / 10) * 10;
        change('vt', vt, `Vt ${s.vt} → ${vt} mL`, 'Menos volumen que exhalar.');
      } else if (pc) {
        const ti = r2(Math.max(0.6, s.ti * 0.8));
        change('ti', ti, `Ti ${s.ti} → ${ti} s`, 'Más tiempo espiratorio.');
      } else if (ps && s.ets < 40) change('ets', 40, `Ciclado (ETS) ${s.ets} → 40 %`, 'Espiración más larga.');
      realLife.push('Acepte hipercapnia permisiva (pH ≥ 7.20) antes que aumentar la ventilación minuto.');
      break;
    }
  }

  // ---- corrección de la causa en el paciente (equivalente a tratarla en la clínica)
  const p: PatientParams = { ...p0, effort: { ...p0.effort } };
  const patientSteps: FixStep[] = [];
  const effortTypes = ['ineffective', 'double', 'stacking', 'lateTrigger', 'prematureCycle', 'delayedCycle', 'flowStarvation', 'flowAsync'];
  if (effortTypes.includes(type)) {
    if (p.effort.alt) {
      p.effort.alt = undefined;
      patientSteps.push({ label: 'Retirar el patrón de esfuerzo asincrónico', why: 'Representa tratar la causa del impulso alterado (dolor, ansiedad, fiebre, acidosis, sobreasistencia).' });
    }
    if (p.effort.pmusMax > 12) {
      patientSteps.push({ label: `Pmus ${r1(p.effort.pmusMax)} → 7 cmH₂O`, why: 'Analgesia/sedación dirigida y control de la demanda (temperatura, acidosis).' });
      p.effort.pmusMax = 7;
    }
  }
  if (type === 'reverse' && p.effort.reverseTrigger) {
    p.effort.reverseTrigger = false;
    patientSteps.push({ label: 'Eliminar el arrastre respiratorio', why: 'Equivale a ajustar la sedación hasta recuperar un ritmo propio o, en casos graves y seleccionados, bloqueo neuromuscular.' });
  }
  if (type === 'autotrigger') {
    if (p.leak > 0) {
      p.leak = 0;
      patientSteps.push({ label: 'Reparar la fuga', why: 'Revisar neumotaponamiento, conexiones y circuito.' });
    }
    if (p.cardiacAmp > 0) {
      p.cardiacAmp = 0;
      patientSteps.push({ label: 'Sin oscilaciones cardiogénicas transmitidas', why: 'En la clínica se compensan con la sensibilidad.' });
    }
  }
  if (type === 'airTrapping') {
    p.rExp *= 0.65;
    p.eflRus *= 0.65;
    patientSteps.push({ label: 'Resistencia espiratoria −35 %', why: 'Efecto de broncodilatadores, aspiración de secreciones o un tubo de mayor calibre.' });
  }

  if (!steps.length) steps.push({ label: 'Sin cambio de programación eficaz para este modo', why: 'La corrección depende del paciente (ver abajo) o de cambiar de modo.' });

  realLife.unshift(...steps.filter((x) => !x.label.startsWith('Sin cambio')).map((x) => `${x.label}: ${x.why}`));
  realLife.push(...(def?.corrections ?? []));
  realLife.push('Cambie un parámetro cada vez y reevalúe las curvas durante varios ciclos; confirme con presión esofágica o EAdi cuando el mecanismo no esté claro.');
  realLife.push('Busque y trate la causa del impulso alterado: dolor, ansiedad, fiebre, acidosis, hipoxemia, sobreasistencia o secreciones.');

  return {
    type,
    name: def?.name ?? ASYNC_EVENT_LABEL[type] ?? type,
    settings: s,
    steps,
    patient: p,
    patientSteps,
    realLife,
    confirm: def?.signs ?? [],
  };
}
