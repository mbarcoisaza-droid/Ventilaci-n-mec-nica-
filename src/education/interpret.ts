import type { Monitor } from '../engine/simulator';
import type { Gas, VentSettings } from '../engine/types';

/** Lectura fisiológica en tiempo real de lo que muestran las curvas (nivel 1–2). */
export function interpret(m: Monitor, s: VentSettings, g: Gas, pbw: number): string[] {
  const out: string[] = [];
  if (m.noBreath) out.push('El ventilador no ha completado ningún ciclo en 30 s. Si hay esfuerzos marcados con ✕, el paciente intenta respirar pero no logra disparar (auto-PEEP, sensibilidad, sobreasistencia previa). Vigile la alarma de apnea y la ventilación de respaldo.');
  const vc = s.mode === 'VCV' || s.mode === 'SIMV_VC';
  if (m.eef < -3) out.push(`El flujo espiratorio no llega a cero (${m.eef.toFixed(0)} L/min al iniciar el ciclo): hay presión alveolar residual (auto-PEEP ≈ ${m.autoPeepModel.toFixed(1)} cmH₂O en el modelo). Confírmelo con una pausa espiratoria.`);
  if (vc && m.pplat !== null) {
    const res = m.ppeak - m.pplat;
    out.push(`Ppico − Pplat = ${res.toFixed(1)} cmH₂O (componente resistivo); Pplat − PEEP = ${(m.pplat - m.peep).toFixed(1)} cmH₂O (componente elástico).`);
  } else if (vc) out.push('Sin pausa inspiratoria no puede separarse el componente resistivo del elástico: programe una pausa o use la maniobra.');
  if (m.dp !== null && m.dp > 15) out.push(`Driving pressure ${m.dp.toFixed(1)} cmH₂O: el Vt es grande para el pulmón aireado disponible (Crs ${m.cstat?.toFixed(0) ?? '—'} mL/cmH₂O).`);
  if (m.vtPerKg > 8.5 && m.vte > 0) out.push(`Vt exhalado ${m.vtPerKg.toFixed(1)} mL/kg PBW (PBW ${pbw.toFixed(0)} kg).`);
  if (m.tau !== null) out.push(`Constante de tiempo ≈ ${m.tau.toFixed(2)} s: vaciar el 95 % del Vt requiere ≈ ${(3 * m.tau).toFixed(1)} s; Te actual ${m.te.toFixed(2)} s.`);
  if (m.pmusModel > 12) out.push(`Esfuerzo inspiratorio intenso (Pmus ${m.pmusModel.toFixed(0)} cmH₂O, modelo): riesgo de P-SILI y de asincronías; en VCV deforma la curva de Paw.`);
  if (m.pmusModel > 0.5 && m.pmusModel < 3 && (s.mode === 'PSV' || s.mode === 'VS')) out.push('Esfuerzo muy bajo bajo soporte: posible sobreasistencia.');
  if (m.asyncIndex > 10) out.push(`Índice de asincronía ${m.asyncIndex.toFixed(0)} % (> 10 %). Revise los marcadores de esfuerzo (✕ = esfuerzo inefectivo).`);
  if (m.overIndex > 0.2) out.push('Aparece sobredistensión al final de la inspiración: la pendiente del bucle P-V se aplana (pico «en pico de pato»).');
  if (m.recruitFrac < 0.5 && m.recruitFrac > 0) out.push(`Sólo el ${(m.recruitFrac * 100).toFixed(0)} % del pulmón reclutable está abierto (modelo): la PL telespiratoria es ${m.ptpEE.toFixed(1)} cmH₂O.`);
  if (m.ptpEE < 0) out.push('PL telespiratoria negativa: la presión pleural supera la alveolar al final de la espiración → colapso de unidades dependientes.');
  if (g.map < 65) out.push(`PAM estimada ${g.map.toFixed(0)} mmHg: la presión intratorácica media (Ppl media +${g.pplMean.toFixed(1)} cmH₂O) reduce el retorno venoso.`);
  if (g.ph < 7.2) out.push(`Acidemia (pH ${g.ph.toFixed(2)}, PaCO₂ ${g.paco2.toFixed(0)}): V̇A ${g.va.toFixed(1)} L/min con VD/VT ${(g.vdvt * 100).toFixed(0)} %.`);
  if (!out.length) out.push('Sin hallazgos destacados en este momento. Modifique un parámetro y observe el cambio en curvas y bucles.');
  return out;
}
