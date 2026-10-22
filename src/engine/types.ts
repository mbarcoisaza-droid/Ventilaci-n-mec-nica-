/**
 * Tipos del motor fisiológico.
 *
 * UNIDADES INTERNAS (todo el motor):
 *   presión  cmH2O  (relativa a presión atmosférica)
 *   volumen  L      (volumen pulmonar por encima del volumen de relajación del sistema
 *                    respiratorio a ZEEP, es decir, la CRF pasiva)
 *   flujo    L/s    (positivo = hacia el paciente / inspiratorio)
 *   tiempo   s
 * La interfaz convierte a mL y L/min sólo para mostrar.
 *
 * CONVENCIÓN DE SIGNOS (ecuación de movimiento):
 *   Paw(t) + Pmus(t) = Pel(V) + R·V̇ + P2
 *   Pmus > 0 = esfuerzo INSPIRATORIO (equivale a descenso de la presión pleural).
 *   Pmus < 0 = espiración activa.
 *   Ppl  = Pcw(V) − Pmus     Palv = Paw − R·V̇     PL(transpulmonar) = Palv − Ppl
 */

export type ModeId =
  | 'VCV'
  | 'PCV'
  | 'PSV'
  | 'CPAP'
  | 'SIMV_VC'
  | 'SIMV_PC'
  | 'PRVC'
  | 'VS'
  | 'APRV'
  | 'BILEVEL';

export type FlowPattern = 'square' | 'decel';
export type TriggerType = 'flow' | 'pressure' | 'off';

export interface Alarms {
  pawMax: number; // cmH2O: también límite de presión que cicla la inspiración
  vteMin: number; // mL
  vteMax: number; // mL
  mvMin: number; // L/min
  mvMax: number; // L/min
  rrMax: number; // rpm
  apneaTime: number; // s
}

export interface VentSettings {
  mode: ModeId;
  vt: number; // mL  (VC; objetivo en PRVC/VS)
  rr: number; // rpm (frecuencia mandatoria)
  peep: number; // cmH2O
  fio2: number; // fracción 0.21–1
  peakFlow: number; // L/min (VC)
  flowPattern: FlowPattern;
  pause: number; // s (pausa inspiratoria programada, VC)
  ti: number; // s (modos controlados por presión)
  pinsp: number; // cmH2O sobre PEEP
  ps: number; // cmH2O sobre PEEP
  triggerType: TriggerType;
  flowTrigger: number; // L/min
  pressureTrigger: number; // cmH2O por debajo de PEEP
  ets: number; // % del flujo pico (criterio de ciclado)
  riseTime: number; // s
  pHigh: number; // APRV/BiLevel
  pLow: number;
  tHigh: number;
  tLow: number;
  leakComp: boolean;
  alarms: Alarms;
}

export interface EffortParams {
  pmusMax: number; // cmH2O pico de presión muscular (0 = pasivo)
  rr: number; // frecuencia neural (rpm)
  tiNeural: number; // s tiempo inspiratorio neural
  relaxTau: number; // s constante de relajación muscular
  activeExp: number; // cmH2O espiración activa basal (0 = pasiva)
  expReflex: number; // cmH2O espiración activa refleja si la insuflación supera el Ti neural
  reverseTrigger: boolean; // arrastre respiratorio (entrainment)
  rtDelay: number; // s retraso desde el inicio del ciclo mecánico
  rtAmp: number; // cmH2O
  rtRatio: number; // 1 = 1:1, 2 = 1:2 ...
  variability: number; // coeficiente de variación ciclo a ciclo (0–0.3)
  chemoGain: number; // aumento relativo de impulso por mmHg de PaCO2 (0 = sin control químico)
  /** esfuerzo alternativo intermitente (asincronía en una fracción de los ciclos) */
  alt?: { prob: number; pmusMax: number; tiNeural: number; expReflex?: number };
}

export interface PatientParams {
  label: string;
  sex: 'M' | 'F';
  heightCm: number;
  weightKg: number;
  age: number;
  // --- mecánica ---
  eL: number; // elastancia pulmonar del pulmón aireado (cmH2O/L)
  eCW: number; // elastancia de pared torácica (cmH2O/L)
  ppl0: number; // presión pleural a volumen de relajación (cmH2O); >0 en obesidad/HIA
  rInsp: number; // resistencia lineal inspiratoria (cmH2O·s/L) incluye tubo
  rExp: number; // resistencia lineal espiratoria
  k2: number; // coeficiente de Rohrer (cmH2O·s²/L²)
  eflRus: number; // limitación al flujo espiratorio: resistencia corriente arriba del punto de igual presión (0 = ausente)
  eflPcrit: number; // presión crítica de cierre de la vía aérea colapsable (cmH2O)
  e2: number; // elastancia viscoelástica (cuerpo de Maxwell) cmH2O/L
  tau2: number; // s
  rMin: number; // fracción aireada con colapso máximo (1 = no reclutable)
  pOpen: number; // PL a la que se abre el 50 % del pulmón reclutable
  kOpen: number; // pendiente de la sigmoide de reclutamiento (cmH2O)
  tauOpen: number; // s
  tauClose: number; // s
  vOd: number; // L sobre CRF a partir del cual el pulmón (totalmente aireado) se sobredistiende
  kOd: number; // cmH2O/L² rigidez de sobredistensión
  effort: EffortParams;
  cardiacAmp: number; // cmH2O oscilación cardiogénica
  hr: number; // lpm
  leak: number; // L/min a 10 cmH2O
  leakSite: 'airway' | 'alveolar';
  // --- intercambio gaseoso / hemodinamia (modelo de compartimento único) ---
  vco2: number; // mL/min
  vo2: number; // mL/min
  hb: number; // g/dL
  hco3: number; // mEq/L basal
  shuntMin: number; // fracción con reclutamiento completo
  shuntMax: number; // fracción con colapso máximo
  vqGradient: number; // mmHg (efecto de unidades V/Q bajas a FiO2 0.21)
  vdAlvFrac: number; // espacio muerto alveolar basal (fracción)
  vdApp: number; // mL espacio muerto instrumental
  mapBase: number; // mmHg
  coBase: number; // L/min
  preloadSens: number; // sensibilidad del GC a presión pleural media (1 = normal)
  rvSens: number; // sensibilidad del VD a presión transpulmonar/hipercapnia (0–1)
  icpBase: number; // mmHg (0 = no monitorizado)
  co2Setpoint: number; // mmHg (para control químico)
}

/** Muestra registrada (100 Hz) */
export interface Sample {
  t: number;
  paw: number;
  flow: number; // L/min medido en la pieza en Y
  vol: number; // mL (volumen mostrado, reinicia en cada ciclo)
  pmus: number;
  ppl: number;
  ptp: number;
  palv: number;
  phase: number;
}

export type BreathTrigger = 'patient' | 'machine';
export type BreathKind = 'VC' | 'PC' | 'PS' | 'APRV';

export interface BreathRecord {
  index: number;
  tStart: number;
  tEnd: number;
  kind: BreathKind;
  trigger: BreathTrigger;
  mandatory: boolean;
  ti: number;
  te: number;
  vti: number; // mL medido
  vte: number; // mL medido
  vtLung: number; // mL volumen real del paciente (insp)
  ppeak: number;
  pplat: number | null; // de pausa programada
  pplatStable: boolean;
  pmean: number;
  peep: number;
  peepTotalModel: number; // verdad del modelo
  eef: number; // L/min flujo al final de la espiración
  peakInspFlow: number; // L/min
  peakExpFlow: number; // L/min
  endInspFlow: number; // L/min (para resistencia)
  energy: number; // J por ciclo (∫Paw·dV inspiratorio)
  wobPatient: number; // J por ciclo (∫Pmus·dV)
  ptpMus: number; // cmH2O·s por ciclo
  pmusPeak: number;
  pplSwing: number;
  ptpEI: number; // PL al final de inspiración (modelo)
  ptpEE: number; // PL al final de espiración (modelo)
  pawEI: number;
  pElEI: number; // retroceso elástico estático tele-inspiratorio (Pplat «verdadera» del modelo)
  pOverEI: number;
  leakVol: number; // mL fugados por ciclo (verdad del modelo)
  lsf: { e: number; r: number; p0: number; r2: number; valid: boolean } | null;
  cycleReason: string;
}

export interface EffortRecord {
  onset: number;
  ti: number;
  pmax: number;
  triggered: boolean;
  triggerDelay: number | null;
  breathsTriggered: number;
  reverse: boolean;
}

export type ManeuverKind = 'inspHold' | 'expHold' | 'p01' | 'pocc';

export interface ManeuverResult {
  kind: ManeuverKind;
  t: number;
  value: number;
  valid: boolean;
  notes: string[];
  extra?: Record<string, number>;
}

export interface Gas {
  paco2: number;
  pao2: number;
  ph: number;
  hco3: number;
  sao2: number;
  va: number; // L/min ventilación alveolar
  vdvt: number;
  shunt: number;
  co: number;
  map: number;
  hrate: number;
  icp: number;
  cpp: number;
  pplMean: number;
}

export interface AlarmState {
  id: string;
  level: 'high' | 'medium';
  text: string;
}
