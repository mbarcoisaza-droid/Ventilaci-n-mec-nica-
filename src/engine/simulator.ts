import type {
  AlarmState,
  BreathKind,
  BreathRecord,
  BreathTrigger,
  ManeuverKind,
  ManeuverResult,
  PatientParams,
  VentSettings,
} from './types';
import {
  elastic,
  equilibrium,
  expiratoryFlowLimit,
  flowFromDrive,
  predictedBodyWeight,
  resistivePressure,
  updateMech,
  type MechState,
} from './mechanics';
import { PatientDrive } from './patient';
import { GasExchange } from './gas';

export const DT = 0.002; // s (500 Hz, Euler explícito; τ mínimo del modelo ≈ 0.1 s)
const REC_EVERY = 5; // registro a 100 Hz
const BUF = 12000; // 120 s
const QMAX = 3.3; // L/s flujo máximo de la válvula inspiratoria (~200 L/min)
const R_EXP_VALVE = 1.5; // cmH2O·s/L rama espiratoria + válvula PEEP
const R_TRIG_PRESSURE = 30; // impedancia del circuito durante el disparo por presión (sin flujo basal)
const R_TRIG_FLOW = 1.5; // con flujo basal (flow-by)
const TRIG_LOCKOUT = 0.12; // s periodo refractario tras el inicio de la espiración
const TRIG_RESPONSE = 0.04; // s retraso de respuesta de la válvula
const TI_MAX_PS = 2.5; // s ciclado de seguridad en PSV
const MIN_TE_MACHINE = 0.25; // s espiración mínima antes de un ciclo por máquina
const RELIEF = 3; // cmH2O sobre el objetivo a partir del cual se abre la válvula espiratoria durante la inspiración por presión
const CYCLE_RESPONSE = 0.04; // s retraso entre el criterio de ciclado por flujo y la apertura de la válvula espiratoria
const DECEL_END = 0.25;
/** asincronías mayores que cuentan para el % de sincronía (además de los esfuerzos inefectivos) */
const SYNC_MAJOR = new Set(['double', 'reverse', 'autotrigger', 'prematureCycle', 'delayedCycle', 'flowStarvation', 'flowAsync']);
/** asincronías que se cuentan al estudiar una concreta */
const SYNC_FAMILY: Record<string, string[]> = {
  ineffective: ['ineffective'],
  double: ['double'],
  flowStarvation: ['flowStarvation', 'double'],
  stacking: ['double', 'stacking'],
  flowExcess: ['flowExcess'],
}; // rampa descendente hasta el 25 % del flujo pico

export type Phase = 'exp' | 'insp' | 'pause' | 'holdI' | 'holdE' | 'occl';
export const PHASE_CODE: Record<Phase, number> = { exp: 0, insp: 1, pause: 2, holdI: 3, holdE: 4, occl: 5 };

export interface Marker {
  t: number;
  type: 'inspStart' | 'inspEnd';
  trigger?: BreathTrigger;
  mandatory?: boolean;
  kind?: BreathKind;
  tTrig?: number; // instante en que se cumplió el criterio de disparo del paciente
}

export interface AsyncEvent {
  t: number;
  /** índice del ciclo al que pertenece (BreathRecord.index) */
  breath?: number;
  type:
    | 'ineffective'
    | 'double'
    | 'autotrigger'
    | 'reverse'
    | 'lateTrigger'
    | 'prematureCycle'
    | 'delayedCycle'
    | 'stacking'
    | 'flowStarvation'
    | 'flowExcess'
    | 'flowAsync'
    | 'airTrapping';
}

interface BreathPlan {
  vt: number; // L
  flow: number; // L/s pico
  pattern: 'square' | 'decel';
  tiFlow: number; // s
  base: number;
  level: number; // presión objetivo absoluta
  rise: number;
  ti: number;
  pause: number;
}

interface Acc {
  ppeak: number;
  pawSum: number;
  n: number;
  vti: number;
  vte: number;
  vtLung: number;
  vStart: number;
  vMax: number;
  energy: number;
  wob: number;
  ptp: number;
  pmusPeak: number;
  pplMax: number;
  pplMin: number;
  pplat: number | null;
  pplatStable: boolean;
  ptpEI: number;
  pawEI: number;
  pElEI: number;
  pOverEI: number;
  leak: number;
  endInspFlow: number;
  peakInspFlow: number;
  peakExpFlow: number;
  inspEnd: number | null;
  cycleReason: string;
  inspPmusSum: number; // suma de Pmus positiva durante la insuflación
  inspN: number;
  t90: number | null; // tiempo hasta alcanzar el 90 % de la presión objetivo
  pawInspMax: number;
  pawEarlyMax: number;
  vcDip: number; // máxima caída de Paw durante una insuflación VC (concavidad por esfuerzo)
  s: number[]; // sumas para mínimos cuadrados (9 + 3 + 1)
}

function newAcc(v: number): Acc {
  return {
    ppeak: -99,
    pawSum: 0,
    n: 0,
    vti: 0,
    vte: 0,
    vtLung: 0,
    vStart: v,
    vMax: v,
    energy: 0,
    wob: 0,
    ptp: 0,
    pmusPeak: 0,
    pplMax: -99,
    pplMin: 99,
    pplat: null,
    pplatStable: false,
    ptpEI: 0,
    pawEI: 0,
    pElEI: 0,
    pOverEI: 0,
    leak: 0,
    endInspFlow: 0,
    peakInspFlow: 0,
    peakExpFlow: 0,
    inspEnd: null,
    cycleReason: '',
    inspPmusSum: 0,
    inspN: 0,
    t90: null,
    pawInspMax: -99,
    pawEarlyMax: -99,
    vcDip: 0,
    s: new Array(13).fill(0),
  };
}

export interface SimOptions {
  initPaco2?: number;
  seed?: number;
}

export interface Monitor {
  ppeak: number;
  pplat: number | null;
  pplatSource: string;
  pplatValid: boolean;
  peep: number;
  peepTotal: number | null;
  peepTotalSource: string;
  autoPeepModel: number;
  dp: number | null;
  vti: number;
  vte: number;
  vtPerKg: number;
  mv: number;
  rrTotal: number;
  rrSpont: number;
  cstat: number | null;
  cdyn: number;
  rInsp: number | null;
  rSource: string;
  tau: number | null;
  pmean: number;
  mp: number;
  wobJL: number;
  wobJmin: number;
  ptpMin: number;
  p01: number | null;
  p01Model: number;
  pmusModel: number;
  pmusEst: number | null;
  pplSwing: number;
  ptpEI: number;
  ptpEE: number;
  eef: number;
  ti: number;
  te: number;
  ie: string;
  ieRatio: number;
  peakInspFlow: number;
  peakExpFlow: number;
  lsfValid: boolean;
  cLsf: number | null;
  rLsf: number | null;
  asyncIndex: number;
  recruitFrac: number;
  overIndex: number;
  vEELV: number; // L sobre CRF (modelo)
  adaptiveP: number;
  rsbi: number | null;
  noBreath: boolean; // sin ciclos completos en los últimos 30 s
  patientTriggeredPct: number; // % de ciclos disparados por el paciente (asistidos o espontáneos)
}

export class Simulator {
  settings: VentSettings;
  patient: PatientParams;
  t = 0;
  mech: MechState;
  drive = new PatientDrive();
  gasEx: GasExchange;
  pbw: number;

  // registro
  bt = new Float64Array(BUF);
  bpaw = new Float32Array(BUF);
  bflow = new Float32Array(BUF);
  bvol = new Float32Array(BUF);
  bpmus = new Float32Array(BUF);
  bppl = new Float32Array(BUF);
  bptp = new Float32Array(BUF);
  bpalv = new Float32Array(BUF);
  bphase = new Uint8Array(BUF);
  head = 0;
  count = 0;
  private stepCount = 0;

  markers: Marker[] = [];
  breaths: BreathRecord[] = [];
  maneuvers: ManeuverResult[] = [];
  asyncEvents: AsyncEvent[] = [];
  alarms: AlarmState[] = [];
  flags: Record<string, number> = {};
  breathCounter = 0;

  // estado del ventilador
  phase: Phase = 'exp';
  phaseStart = 0;
  kind: BreathKind = 'VC';
  mandatory = true;
  trig: BreathTrigger = 'machine';
  breathStart = -10;
  nextMachine = 0.6;
  private trigPendingAt: number | null = null;
  private trigDetectAt: number | null = null;
  private plan: BreathPlan;
  private peakFlowMeas = 0;
  adaptiveP = 12;
  private simvPeriodStart = 0;
  private simvSatisfied = false;
  apneaBackup = false;
  private aprvLowEnd = 0;
  private aprvActive = false;
  private lastPatientBreath = 0;

  // maniobras
  pendingManeuver: ManeuverKind | null = null;
  inspHoldTime = 0.5;
  expHoldTime = 2.5;
  private occl: {
    kind: ManeuverKind;
    start: number;
    base: number;
    hist: { t: number; p: number }[];
    onset: number | null;
    p01: number | null;
    min: number;
  } | null = null;
  private holdPmusMax = 0;
  private holdStartPaw = 0;

  // valores instantáneos
  paw = 0;
  flowAw = 0; // L/s hacia el pulmón por la vía aérea
  flowMeas = 0; // L/s medido en Y
  pmusVal = 0;
  dispVol = 0; // L
  private cycleDetectAt: number | null = null;
  /** instante del último cambio de programación o de paciente (para la ventana de sincronía) */
  lastChange = 0;
  private el = { pLung: 0, pCw: 0, pEl: 0, pOver: 0 };
  private acc: Acc;
  private lastEffortOnset = -1;

  // segmentación espiratoria para intercambio gaseoso
  private segVol = 0;
  private inSeg = false;
  private lastOverIndex = 0;
  private gasTimer = 0;
  private emaPpl: number;
  private emaPtp = 0;
  private emaPaw = 0;

  constructor(settings: VentSettings, patient: PatientParams, opts: SimOptions = {}) {
    this.settings = { ...settings, alarms: { ...settings.alarms } };
    this.patient = clonePatient(patient);
    this.pbw = predictedBodyWeight(patient.sex, patient.heightCm);
    this.mech = equilibrium(this.patient, this.basePressure());
    this.gasEx = new GasExchange(this.patient, opts.initPaco2);
    this.emaPpl = this.patient.ppl0;
    this.acc = newAcc(this.mech.v);
    this.plan = this.makePlan('VC');
    this.adaptiveP = Math.max(5, Math.min(25, (settings.vt / 1000) * (this.patient.eL + this.patient.eCW)));
    this.drive.reset(0);
    this.el = elastic(this.patient, this.mech);
    this.paw = this.basePressure();
    this.aprvActive = settings.mode === 'APRV' || settings.mode === 'BILEVEL';
    this.aprvLowEnd = 0.5;
  }

  // ---------------------------------------------------------------- configuración
  setSettings(s: VentSettings) {
    const prevMode = this.settings.mode;
    this.lastChange = this.t;
    this.settings = { ...s, alarms: { ...s.alarms } };
    if (prevMode !== s.mode) {
      this.simvPeriodStart = this.t;
      this.simvSatisfied = false;
      this.apneaBackup = false;
      const wasAprv = prevMode === 'APRV' || prevMode === 'BILEVEL';
      this.aprvActive = s.mode === 'APRV' || s.mode === 'BILEVEL';
      if (this.aprvActive && !wasAprv) {
        this.goExp('cambio de modo');
        this.aprvLowEnd = this.t + 0.3;
      }
      if (!this.aprvActive && wasAprv) {
        this.goExp('cambio de modo');
        this.nextMachine = this.t + 0.5;
      }
      if (s.mode === 'PRVC') this.adaptiveP = Math.max(5, Math.min(this.adaptiveP, 30));
      if (s.mode === 'VS') this.adaptiveP = Math.max(5, Math.min(this.adaptiveP, 25));
    }
  }

  setPatient(p: PatientParams) {
    const keepV = this.mech;
    this.lastChange = this.t;
    this.patient = clonePatient(p);
    this.pbw = predictedBodyWeight(p.sex, p.heightCm);
    this.mech = { v: keepV.v, p2: keepV.p2, r: Math.max(p.rMin, Math.min(1, keepV.r)) };
    this.gasEx.setPatient(this.patient);
  }

  basePressure(): number {
    const s = this.settings;
    if (s.mode === 'APRV' || s.mode === 'BILEVEL') return s.pLow;
    return s.peep;
  }

  get modeAllowsTrigger(): boolean {
    return this.settings.triggerType !== 'off' && this.settings.mode !== 'APRV';
  }

  /** Ti efectivo de un ciclo VC (s) */
  static vcTi(s: VentSettings): number {
    const q = s.peakFlow / 60;
    const vt = s.vt / 1000;
    const mean = s.flowPattern === 'square' ? q : (q * (1 + DECEL_END)) / 2;
    return vt / Math.max(mean, 0.05);
  }

  static inspTime(s: VentSettings): number {
    switch (s.mode) {
      case 'VCV':
      case 'SIMV_VC':
        return Simulator.vcTi(s) + s.pause;
      case 'APRV':
      case 'BILEVEL':
        return s.tHigh;
      case 'PSV':
      case 'CPAP':
      case 'VS':
        return NaN;
      default:
        return s.ti;
    }
  }

  private makePlan(kind: BreathKind): BreathPlan {
    const s = this.settings;
    const base = this.basePressure();
    const plan: BreathPlan = {
      vt: s.vt / 1000,
      flow: s.peakFlow / 60,
      pattern: s.flowPattern,
      tiFlow: Simulator.vcTi(s),
      base,
      level: base,
      rise: s.riseTime,
      ti: s.ti,
      pause: kind === 'VC' ? s.pause : 0,
    };
    if (kind === 'PC') {
      const dp = s.mode === 'PRVC' ? this.adaptiveP : this.apneaBackup ? Math.max(s.pinsp, 10) : s.pinsp;
      plan.level = base + dp;
    } else if (kind === 'PS') {
      const dp = s.mode === 'VS' ? this.adaptiveP : s.mode === 'CPAP' ? 0 : s.ps;
      plan.level = base + dp;
    } else if (kind === 'APRV') {
      plan.base = s.pLow;
      plan.level = s.pHigh;
      plan.ti = s.tHigh;
    }
    return plan;
  }

  private pressureTarget(tIn: number): number {
    const p = this.plan;
    const dp = p.level - p.base;
    let y: number;
    if (p.rise < 0.03) {
      // servo con respuesta subamortiguada (sobreimpulso) si el rise time es mínimo
      const wn = 40;
      const z = 0.45;
      const wd = wn * Math.sqrt(1 - z * z);
      y = 1 - Math.exp(-z * wn * tIn) * (Math.cos(wd * tIn) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * tIn));
    } else {
      y = 1 - Math.exp(-tIn / (p.rise / 3));
    }
    return p.base + dp * y;
  }

  private vcFlow(tIn: number): number {
    const p = this.plan;
    if (p.pattern === 'square') return p.flow;
    const f = 1 - ((1 - DECEL_END) * tIn) / p.tiFlow;
    return p.flow * Math.max(DECEL_END, f);
  }

  private leakFlow(paw: number, palv: number): number {
    const p = this.patient;
    if (p.leak <= 0) return 0;
    let k = p.leak / 60 / Math.sqrt(10);
    if (p.leakVar) k *= 1 + p.leakVar * (0.6 * Math.sin((2 * Math.PI * this.t) / 7.3) + 0.4 * Math.sin((2 * Math.PI * this.t) / 3.1));
    const pr = p.leakSite === 'airway' ? paw : palv;
    return k * Math.sqrt(Math.max(pr, 0));
  }

  // ---------------------------------------------------------------- transiciones
  private startBreath(kind: BreathKind, trigger: BreathTrigger, mandatory: boolean) {
    const prevVti = this.acc ? this.acc.vti : 0;
    const truncated = this.phase === 'exp' && this.t - this.phaseStart < 0.4 && this.dispVol > 0.4 * prevVti && prevVti > 0.05;
    this.finalizeBreath();
    const t = this.t;
    this.kind = kind;
    this.trig = trigger;
    this.mandatory = mandatory;
    this.plan = this.makePlan(kind);
    this.phase = 'insp';
    this.phaseStart = t;
    this.breathStart = t;
    // el volumen mostrado se reinicia en cada inspiración, salvo si la espiración previa quedó truncada
    // (doble disparo / breath stacking): entonces el nuevo ciclo se apila sobre el volumen no exhalado
    if (!truncated) this.dispVol = 0;
    this.cycleDetectAt = null;
    this.peakFlowMeas = 0;
    this.acc = newAcc(this.mech.v);
    const tTrig = trigger === 'patient' ? Math.min(t, this.trigDetectAt ?? t - TRIG_RESPONSE) : undefined;
    this.markers.push({ t, type: 'inspStart', trigger, mandatory, kind, tTrig });
    this.trigDetectAt = null;
    if (this.markers.length > 600) this.markers.splice(0, 200);
    if (mandatory && kind !== 'APRV') this.nextMachine = t + 60 / Math.max(1, this.settings.rr);
    if (trigger === 'machine' && mandatory) this.drive.onMachineBreath(t, this.patient.effort);
    if (trigger === 'patient') {
      this.lastPatientBreath = t;
      this.apneaBackup = false;
      const eff = this.drive.currentEffort(t);
      if (eff && eff.pmax > 0.3) {
        eff.breathsTriggered++;
        if (eff.reverse) {
          // esfuerzo reverso que dispara un segundo ciclo: doble ciclado por disparo reverso
          eff.triggered = true;
          this.pushAsync('double');
          if (this.lastExhaledFraction() < 0.5) this.pushAsync('stacking');
        } else if (!eff.triggered) {
          eff.triggered = true;
          eff.triggerDelay = t - eff.onset;
          if (eff.triggerDelay > 0.3) this.pushAsync('lateTrigger');
        } else {
          this.pushAsync(eff.reverse ? 'reverse' : 'double');
          if (this.lastExhaledFraction() < 0.5) this.pushAsync('stacking');
        }
      } else {
        this.pushAsync('autotrigger');
      }
    } else {
      const eff = this.drive.currentEffort(t);
      if (eff && !eff.triggered && eff.pmax > 0.3 && t - eff.onset < eff.ti) {
        // el ciclo por máquina coincide con un esfuerzo en curso
        eff.triggered = true;
        eff.breathsTriggered++;
      }
    }
  }

  private lastExhaledFraction(): number {
    const prev = this.breaths[this.breaths.length - 1];
    if (!prev || prev.vtLung <= 0) return 1;
    return Math.max(0, prev.vte) / prev.vtLung;
  }

  private pushAsync(type: AsyncEvent['type'], breath = this.breathCounter) {
    this.asyncEvents.push({ t: this.t, type, breath });
    if (this.asyncEvents.length > 500) this.asyncEvents.splice(0, 100);
  }

  private endInsp(reason: string) {
    const t = this.t;
    this.acc.inspEnd = t;
    this.acc.cycleReason = reason;
    this.acc.endInspFlow = this.flowMeas * 60;
    this.acc.ptpEI = this.el.pLung;
    this.acc.pawEI = this.paw;
    this.acc.pOverEI = this.el.pOver;
    this.acc.pElEI = this.el.pEl - this.mech.p2;
    this.markers.push({ t, type: 'inspEnd' });
    const hasPause = this.kind === 'VC' && this.plan.pause > 0 && this.pendingManeuver !== 'inspHold';
    if (!hasPause) this.checkCycleAsync(t);
    if (this.pendingManeuver === 'inspHold' && this.kind !== 'APRV') {
      this.pendingManeuver = null;
      this.phase = 'holdI';
      this.phaseStart = t;
      this.holdPmusMax = 0;
      this.holdStartPaw = this.paw;
      return;
    }
    if (this.kind === 'VC' && this.plan.pause > 0) {
      this.phase = 'pause';
      this.phaseStart = t;
      this.holdPmusMax = 0;
      return;
    }
    this.goExp(reason);
  }

  /** Ciclado prematuro / tardío respecto al esfuerzo neural (verdad del modelo), al terminar la insuflación. */
  private checkCycleAsync(t: number) {
    const eff = this.drive.currentEffort(this.breathStart) ?? this.drive.currentEffort(t);
    if (eff && eff.pmax > 0.3 && !eff.reverse && this.kind !== 'APRV') {
      const neuralEnd = eff.onset + eff.ti;
      if (neuralEnd - t > 0.25 && this.trig === 'patient') this.pushAsync('prematureCycle');
      else if (t - neuralEnd > 0.25 && eff.onset <= this.breathStart + 0.05) this.pushAsync('delayedCycle');
    }
  }

  private goExp(_reason: string) {
    this.phase = 'exp';
    this.phaseStart = this.t;
    this.trigPendingAt = null;
    if (this.aprvActive && this.kind === 'APRV') this.aprvLowEnd = this.t + this.settings.tLow;
  }

  private finalizeBreath() {
    if (this.breathStart < 0) return;
    const a = this.acc;
    const t = this.t;
    const inspEnd = a.inspEnd ?? t;
    const e = this.el;
    const lsf = solveLsf(a.s);
    const rec: BreathRecord = {
      index: this.breathCounter++,
      tStart: this.breathStart,
      tEnd: t,
      kind: this.kind,
      trigger: this.trig,
      mandatory: this.mandatory,
      ti: inspEnd - this.breathStart,
      te: t - inspEnd,
      vti: a.vti * 1000,
      vte: a.vte * 1000,
      vtLung: (a.vMax - a.vStart) * 1000,
      ppeak: a.ppeak,
      pplat: a.pplat,
      pplatStable: a.pplatStable,
      pmean: a.n ? a.pawSum / a.n : this.paw,
      peep: this.basePressure(),
      peepTotalModel: e.pEl,
      eef: this.flowMeas * 60,
      peakInspFlow: a.peakInspFlow,
      peakExpFlow: a.peakExpFlow,
      endInspFlow: a.endInspFlow,
      energy: a.energy * 0.098,
      wobPatient: a.wob * 0.098,
      ptpMus: a.ptp,
      pmusPeak: a.pmusPeak,
      pplSwing: a.pplMax - a.pplMin,
      ptpEI: a.ptpEI,
      ptpEE: e.pLung,
      pawEI: a.pawEI,
      pElEI: a.pElEI,
      pOverEI: a.pOverEI,
      leakVol: a.leak * 1000,
      lsf,
      cycleReason: a.cycleReason,
    };
    this.detectBreathAsync(rec, a);
    this.breaths.push(rec);
    if (this.breaths.length > 300) this.breaths.splice(0, 100);
    this.lastOverIndex = Math.min(1, a.pOverEI / 8);
    // control adaptativo (PRVC / VS): ajuste máximo ±3 cmH2O por ciclo
    const s = this.settings;
    if ((s.mode === 'PRVC' && rec.kind === 'PC') || (s.mode === 'VS' && rec.kind === 'PS')) {
      const vte = Math.max(rec.vte, 1);
      const dpNow = Math.max(1, this.plan.level - this.plan.base);
      const c = vte / dpNow; // mL/cmH2O
      const err = s.vt - vte;
      const step = Math.max(-3, Math.min(3, err / Math.max(c, 5)));
      const pmax = s.alarms.pawMax - 5 - s.peep;
      this.adaptiveP = Math.max(s.mode === 'VS' ? 2 : 5, Math.min(pmax, dpNow + step));
    }
    this.checkBreathAlarms(rec);
  }

  /** Asincronías de flujo y atrapamiento detectadas al cerrar cada ciclo (verdad del modelo). */
  private detectBreathAsync(rec: BreathRecord, a: Acc) {
    const meanPmus = a.inspN ? a.inspPmusSum / a.inspN : 0;
    const dp = this.plan.level - this.plan.base;
    const dipLimit = this.plan.pattern === 'square' ? 2.5 : 4;
    if (rec.kind === 'VC' && meanPmus > 2 && a.vcDip > dipLimit) this.pushAsync('flowStarvation', rec.index);
    if ((rec.kind === 'PC' || rec.kind === 'PS') && dp >= 3) {
      // sobreimpulso al inicio de la presurización (la espiga tardía por esfuerzo espiratorio es ciclado tardío)
      if (a.pawEarlyMax > this.plan.level + 1.5) this.pushAsync('flowExcess', rec.index);
      else if (meanPmus > 3 && (a.t90 === null || a.t90 > 0.3)) this.pushAsync('flowAsync', rec.index);
    }
    if (rec.kind === 'VC' && rec.peakInspFlow > 90 && rec.ti < 0.5) this.pushAsync('flowExcess', rec.index);
    if (rec.kind !== 'APRV' && rec.te > 0.4 && rec.eef < -5 && rec.peepTotalModel - rec.peep > 2) this.pushAsync('airTrapping', rec.index);
  }

  // ---------------------------------------------------------------- maniobras
  requestManeuver(k: ManeuverKind) {
    this.pendingManeuver = k;
  }

  cancelManeuver() {
    this.pendingManeuver = null;
    if (this.phase === 'holdE' || this.phase === 'occl' || this.phase === 'holdI') this.goExp('cancelada');
    this.occl = null;
  }

  private finishInspHold() {
    const s = this.settings;
    const a = this.acc;
    const pplat = this.paw;
    const p1 = this.pawAgo(this.t - this.phaseStart - 0.02);
    const st = this.plateauShape(Math.min(0.3, this.inspHoldTime * 0.6));
    const notes: string[] = [];
    let valid = st.stable;
    if (!st.stable) notes.push('Meseta inestable (oscilaciones o ascenso de la presión durante la pausa): probable esfuerzo muscular o fuga.');
    else if (st.drop > 0.4)
      notes.push(`La presión aún desciende ${st.drop.toFixed(1)} cmH₂O en los últimos 300 ms (relajación viscoelástica/redistribución): con una pausa más larga la Pplat sería algo menor.`);
    if (this.holdPmusMax > 1) {
      valid = false;
      notes.push(`Verificación del modelo: |Pmus| máx. durante la pausa = ${this.holdPmusMax.toFixed(1)} cmH₂O → la meseta NO es estática.`);
    }
    if (this.patient.leak > 0.5) {
      valid = false;
      notes.push('Fuga presente: la presión no se estabiliza y la meseta subestima la presión alveolar.');
    }
    const peepRef = this.lastManeuver('expHold', 90);
    const peepTot = peepRef && peepRef.valid ? peepRef.value : s.peep;
    if (!peepRef) notes.push('DP calculada con PEEP programada: realice pausa espiratoria para usar PEEP total.');
    const vt = a.vti * 1000;
    const dp = pplat - peepTot;
    const cstat = dp > 0.5 ? vt / dp : NaN;
    const flowEnd = a.endInspFlow / 60;
    let rinsp = NaN;
    let rmin = NaN;
    if (this.kind === 'VC' && this.plan.pattern === 'square' && flowEnd > 0.1) {
      rinsp = (a.ppeak - pplat) / flowEnd;
      rmin = (a.ppeak - p1) / flowEnd;
    } else notes.push('Resistencia: requiere flujo inspiratorio constante (VC, onda cuadrada).');
    if (this.kind !== 'VC') notes.push('En modos por presión la Ppico no refleja el componente resistivo de forma directa.');
    this.maneuvers.push({
      kind: 'inspHold',
      t: this.t,
      value: pplat,
      valid,
      notes,
      extra: { ppeak: a.ppeak, p1, pplat, dp, cstat, rinsp, rmin, vt, peepTot, flow: a.endInspFlow },
    });
    a.pplat = pplat;
    a.pplatStable = valid;
    this.flags.inspHold = this.t;
    this.goExp('fin de pausa');
  }

  /** Forma de la meseta: estable si no hay ascensos ni oscilaciones; tolera un descenso monótono lento. */
  private plateauShape(win: number): { stable: boolean; drop: number } {
    const n = Math.max(3, Math.round(win * 100));
    const v: number[] = [];
    for (let k = n; k >= 0; k -= 5) v.push(this.pawAgo(k / 100));
    let rise = 0;
    let wiggle = 0;
    for (let i = 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      if (d > 0.15) rise += d;
      if (i > 1 && Math.sign(d) !== Math.sign(v[i - 1] - v[i - 2]) && Math.abs(d) > 0.15) wiggle++;
    }
    const drop = v[0] - v[v.length - 1];
    return { stable: rise < 0.3 && wiggle === 0 && drop < 2, drop };
  }

  private finishExpHold() {
    const s = this.settings;
    const ptot = this.paw;
    const st = this.plateauShape(0.3);
    const notes: string[] = [];
    let valid = st.stable && Math.abs(st.drop) < 1;
    if (!valid) notes.push('Presión no estabilizada: esfuerzo, fuga o tiempo de oclusión insuficiente (constante de tiempo larga).');
    if (this.holdPmusMax > 1) {
      valid = false;
      notes.push(`Verificación del modelo: actividad muscular durante la oclusión (|Pmus| máx. ${this.holdPmusMax.toFixed(1)} cmH₂O). La espiración activa sobrestima la auto-PEEP; un esfuerzo inspiratorio la subestima.`);
    }
    if (this.patient.leak > 0.5) {
      valid = false;
      notes.push('Fuga presente: la presión cae durante la oclusión y la PEEP total se subestima.');
    }
    const auto = ptot - s.peep;
    this.maneuvers.push({
      kind: 'expHold',
      t: this.t,
      value: ptot,
      valid,
      notes,
      extra: { peepTotal: ptot, autoPeep: auto, peepSet: s.peep, start: this.holdStartPaw },
    });
    this.flags.expHold = this.t;
    if (this.settings.mode === 'APRV' || this.settings.mode === 'BILEVEL') {
      this.goExp('fin de pausa');
      return;
    }
    this.phase = 'exp';
    this.phaseStart = this.t - 1; // permitir ciclo inmediato
    if (this.isMandatoryMode()) this.nextMachine = this.t;
  }

  private finishOcclusion(abort: string | null) {
    const o = this.occl!;
    const notes: string[] = [];
    if (abort) {
      this.maneuvers.push({ kind: o.kind, t: this.t, value: NaN, valid: false, notes: [abort] });
    } else if (o.kind === 'p01') {
      notes.push('P0.1 normal en ventilación asistida ≈ 1–3.5 cmH₂O; > 3.5–4 sugiere impulso elevado; < 1 posible sobreasistencia.');
      this.maneuvers.push({ kind: 'p01', t: this.t, value: o.p01 ?? NaN, valid: o.p01 !== null, notes });
      this.flags.p01 = this.t;
    } else {
      const pocc = o.base - o.min;
      const last = this.breaths[this.breaths.length - 1];
      const pmusEst = 0.75 * pocc;
      const ptpDyn = last ? last.ppeak - last.peep - 0.66 * pocc : NaN;
      notes.push('Pmus estimada = 0.75 × ΔPocc; ΔPL,din estimada = (Ppico − PEEP) − 0.66 × ΔPocc (Bertoni et al., Crit Care 2019).');
      notes.push('ΔPocc > 15–20 cmH₂O sugiere esfuerzo excesivo; ΔPL,din estimada > 20 sugiere estrés pulmonar elevado.');
      this.maneuvers.push({
        kind: 'pocc',
        t: this.t,
        value: pocc,
        valid: true,
        notes,
        extra: { pocc, pmusEst, ptpDyn, p01: o.p01 ?? NaN },
      });
      this.flags.pocc = this.t;
    }
    this.occl = null;
    this.phase = 'exp';
    this.phaseStart = this.t;
    if (!abort && o.kind === 'p01' && this.modeAllowsTrigger) this.trigPendingAt = this.t;
  }

  lastManeuver(kind: ManeuverKind, maxAge = 1e9): ManeuverResult | null {
    for (let i = this.maneuvers.length - 1; i >= 0; i--) {
      const m = this.maneuvers[i];
      if (m.kind === kind) return this.t - m.t <= maxAge ? m : null;
    }
    return null;
  }

  private isMandatoryMode(): boolean {
    const m = this.settings.mode;
    return m === 'VCV' || m === 'PCV' || m === 'PRVC' || m === 'SIMV_VC' || m === 'SIMV_PC';
  }

  // ---------------------------------------------------------------- integración
  advance(seconds: number) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) this.step();
  }

  /** Avanza hasta el inicio del siguiente ciclo (máx. 20 s). */
  advanceBreath() {
    const c = this.breathCounter;
    const end = this.t + 20;
    while (this.breathCounter === c && this.t < end) this.step();
  }

  step() {
    const p = this.patient;
    const s = this.settings;
    const dt = DT;
    const t = this.t;
    const ventInsp = this.phase === 'insp' || this.phase === 'pause' || this.phase === 'holdI';
    const pmus = this.drive.pmus(t, p.effort, ventInsp && this.kind !== 'APRV');
    const pcard = p.cardiacAmp > 0 ? p.cardiacAmp * Math.sin(2 * Math.PI * (p.hr / 60) * t) : 0;
    const pm = pmus + pcard;
    this.pmusVal = pmus;
    const lastEff = this.drive.efforts[this.drive.efforts.length - 1];
    if (lastEff && lastEff.onset > this.lastEffortOnset) {
      this.lastEffortOnset = lastEff.onset;
      if (lastEff.reverse) this.pushAsync('reverse');
    }
    const e = elastic(p, this.mech);
    this.el = e;
    const pElTot = e.pEl;
    const palvPrev = this.paw - resistivePressure(this.flowAw, p.rInsp, p.k2);
    let flowAw = 0;
    let paw = 0;
    const leakPrev = this.leakFlow(this.paw, palvPrev);
    const airwayLeak = p.leakSite === 'airway' ? leakPrev : 0;
    const tIn = t - this.phaseStart;

    const pressureControl = (target: number) => {
      const drive = target + pm - pElTot;
      if (drive < 0) {
        // la válvula inspiratoria no puede aspirar y la espiratoria está cerrada: si el paciente empuja
        // (espiración activa), la Paw sube hasta la presión alveolar; por encima de objetivo + RELIEF se alivia
        const over = pElTot - pm - (target + RELIEF);
        if (over <= 0) return { q: 0, paw: pElTot - pm };
        let q = -flowFromDrive(over, p.rExp + R_EXP_VALVE, p.k2);
        q = -Math.min(-q, expiratoryFlowLimit(p, e.pLung));
        return { q, paw: target + RELIEF };
      }
      let q = flowFromDrive(drive, p.rInsp, p.k2);
      if (q < 0) q = -Math.min(-q, expiratoryFlowLimit(p, e.pLung));
      if (q + airwayLeak > QMAX) {
        q = QMAX - airwayLeak;
        return { q, paw: pElTot + resistivePressure(q, p.rInsp, p.k2) - pm };
      }
      return { q, paw: target };
    };

    switch (this.phase) {
      case 'insp': {
        if (this.kind === 'VC') {
          const qv = this.vcFlow(tIn);
          flowAw = qv - airwayLeak;
          paw = pElTot + resistivePressure(flowAw, p.rInsp, p.k2) - pm;
        } else {
          const r = pressureControl(this.pressureTarget(tIn));
          flowAw = r.q;
          paw = r.paw;
        }
        break;
      }
      case 'pause':
      case 'holdI':
      case 'holdE':
      case 'occl': {
        flowAw = -airwayLeak;
        paw = pElTot + resistivePressure(flowAw, p.rInsp, p.k2) - pm;
        if (Math.abs(pmus) > this.holdPmusMax) this.holdPmusMax = Math.abs(pmus);
        break;
      }
      case 'exp': {
        const base = this.basePressure();
        const drive = base + pm - pElTot;
        if (drive > 0) {
          // con disparo por flujo (flow-by) o compensación de fugas el ventilador aporta flujo basal y sostiene la PEEP
          const rt = (s.triggerType === 'flow' && this.modeAllowsTrigger) || s.leakComp ? R_TRIG_FLOW : R_TRIG_PRESSURE;
          const rtEff = this.aprvActive ? R_TRIG_FLOW : rt;
          flowAw = flowFromDrive(drive, p.rInsp + rtEff, p.k2);
          paw = base - rtEff * flowAw;
        } else {
          let q = flowFromDrive(drive, p.rExp + R_EXP_VALVE, p.k2);
          q = -Math.min(-q, expiratoryFlowLimit(p, e.pLung));
          flowAw = q;
          paw = base + R_EXP_VALVE * -q;
        }
        break;
      }
    }

    const palv = paw - resistivePressure(flowAw, flowAw >= 0 ? p.rInsp : p.rExp, p.k2);
    const leakNow = this.leakFlow(paw, palv);
    const lungFlow = p.leakSite === 'alveolar' ? flowAw - leakNow : flowAw;
    let meas = flowAw + (p.leakSite === 'airway' ? leakNow : 0);
    if (s.leakComp && p.leak > 0) meas -= leakNow * (p.leakSite === 'airway' ? 1 : 0.9);
    this.flowAw = flowAw;
    this.flowMeas = meas;
    this.paw = paw;
    this.dispVol += meas * dt;
    // corrección de deriva como en los ventiladores: el volumen mostrado no baja de 0 durante la espiración
    // (p. ej. exhalación de un volumen previo acumulado por esfuerzos o por un cambio de CRF)
    if (this.dispVol < 0 && (this.phase === 'exp' || this.phase === 'holdE')) this.dispVol = 0;

    // acumuladores
    const a = this.acc;
    if (paw > a.ppeak && (this.phase === 'insp' || this.phase === 'pause')) a.ppeak = paw;
    a.pawSum += paw;
    a.n++;
    if (this.phase === 'insp' || this.phase === 'pause' || this.phase === 'holdI') a.vti += meas * dt;
    else a.vte -= meas * dt;
    if (this.mech.v > a.vMax) a.vMax = this.mech.v;
    a.leak += leakNow * dt;
    if (this.phase === 'insp' && lungFlow > 0) a.energy += paw * lungFlow * dt;
    if (lungFlow > 0 && pmus > 0) a.wob += pmus * lungFlow * dt;
    if (pmus > 0) a.ptp += pmus * dt;
    if (this.phase === 'insp') {
      a.inspPmusSum += Math.max(0, pmus);
      a.inspN++;
      if (this.kind === 'VC' && tIn > 0.08) a.vcDip = Math.max(a.vcDip, a.pawInspMax - paw);
      if (paw > a.pawInspMax) a.pawInspMax = paw;
      if (tIn < 0.35 && paw > a.pawEarlyMax) a.pawEarlyMax = paw;
      if (this.kind !== 'VC' && a.t90 === null && paw >= this.plan.base + 0.9 * (this.plan.level - this.plan.base)) a.t90 = tIn;
    }
    if (pmus > a.pmusPeak) a.pmusPeak = pmus;
    const ppl = e.pCw - pmus;
    if (ppl > a.pplMax) a.pplMax = ppl;
    if (ppl < a.pplMin) a.pplMin = ppl;
    if (meas * 60 > a.peakInspFlow) a.peakInspFlow = meas * 60;
    if (-meas * 60 > a.peakExpFlow) a.peakExpFlow = -meas * 60;
    if (this.phase === 'insp' || this.phase === 'exp' || this.phase === 'pause') {
      const x1 = this.dispVol;
      const x2 = meas;
      const S = a.s;
      S[0] += x1 * x1; S[1] += x1 * x2; S[2] += x1;
      S[3] += x2 * x2; S[4] += x2; S[5] += 1;
      S[6] += x1 * paw; S[7] += x2 * paw; S[8] += paw;
      S[9] += paw * paw;
    }

    // segmentos espiratorios (intercambio gaseoso)
    if (!this.inSeg && lungFlow < -0.05) {
      this.inSeg = true;
      this.segVol = 0;
    }
    if (this.inSeg) {
      this.segVol += -lungFlow * dt;
      if (lungFlow > 0.05) {
        this.inSeg = false;
        if (this.segVol > 0.02) this.gasEx.addExhalation(t, this.segVol, this.lastOverIndex);
      }
    }

    // mecánica
    updateMech(p, this.mech, lungFlow, dt);

    this.t = t + dt;
    this.stepCount++;
    if (this.stepCount % REC_EVERY === 0) this.record(paw, meas, pmus, ppl, e.pLung, palv);

    // promedios para hemodinamia
    const k = dt / 10;
    this.emaPpl += (ppl - this.emaPpl) * k;
    this.emaPtp += (e.pLung - this.emaPtp) * k;
    this.emaPaw += (paw - this.emaPaw) * k;
    this.gasTimer += dt;
    if (this.gasTimer >= 0.1) {
      const rNorm = p.rMin >= 0.999 ? 1 : (this.mech.r - p.rMin) / (1 - p.rMin);
      this.gasEx.update(this.t, this.gasTimer, {
        fio2: s.fio2,
        rNorm,
        overIndex: this.lastOverIndex,
        pplMeanRise: this.emaPpl - p.ppl0,
        ptpMean: this.emaPtp,
        pawMean: this.emaPaw,
      }, this.t);
      this.gasTimer = 0;
      if (p.effort.chemoGain > 0) {
        const c = 1 + p.effort.chemoGain * (this.gasEx.gas.paco2 - p.co2Setpoint);
        this.drive.chemo = Math.max(0.25, Math.min(2.5, c));
      } else this.drive.chemo = 1;
    }

    this.control();
  }

  private record(paw: number, flow: number, pmus: number, ppl: number, ptp: number, palv: number) {
    const i = this.head;
    this.bt[i] = this.t;
    this.bpaw[i] = paw;
    this.bflow[i] = flow * 60;
    this.bvol[i] = this.dispVol * 1000;
    this.bpmus[i] = pmus;
    this.bppl[i] = ppl;
    this.bptp[i] = ptp;
    this.bpalv[i] = palv;
    this.bphase[i] = PHASE_CODE[this.phase];
    this.head = (i + 1) % BUF;
    if (this.count < BUF) this.count++;
  }

  /** Paw registrada hace `ago` segundos */
  pawAgo(ago: number): number {
    const nBack = Math.round(ago * 100);
    if (nBack <= 0 || this.count === 0) return this.paw;
    const idx = (this.head - 1 - Math.min(nBack, this.count - 1) + BUF * 2) % BUF;
    return this.bpaw[idx];
  }

  /** Índices de muestras en la ventana [t − w, t] (en orden) */
  window(w: number): number[] {
    const out: number[] = [];
    const n = Math.min(this.count, Math.round(w * 100) + 1);
    for (let k = n - 1; k >= 0; k--) out.push((this.head - 1 - k + BUF * 2) % BUF);
    return out;
  }

  // ---------------------------------------------------------------- lógica de modo
  private control() {
    const s = this.settings;
    const t = this.t;
    const tIn = t - this.phaseStart;
    const mode = s.mode;

    // ------- APRV / BiLevel: alternancia temporal de niveles
    if (this.aprvActive) {
      if (this.phase === 'insp' && this.kind === 'APRV') {
        if (tIn >= s.tHigh) this.endInsp('tiempo (Thigh)');
        return;
      }
      if (this.phase === 'holdE') {
        if (tIn >= this.expHoldTime) this.finishExpHold();
        return;
      }
      if ((this.phase === 'exp' || this.phase === 'insp') && t >= this.aprvLowEnd) {
        if (this.pendingManeuver === 'expHold' && this.phase === 'exp') {
          this.pendingManeuver = null;
          this.phase = 'holdE';
          this.phaseStart = t;
          this.holdPmusMax = 0;
          this.holdStartPaw = this.paw;
          return;
        }
        this.startBreath('APRV', 'machine', true);
        return;
      }
      if (this.phase === 'insp' && this.kind === 'PS') {
        this.psCycling(tIn);
        return;
      }
      if (this.phase === 'exp' && mode === 'BILEVEL' && s.ps > 0 && this.modeAllowsTrigger) {
        if (this.detectTrigger(tIn)) {
          // PS sobre Plow
          this.startBreath('PS', 'patient', false);
          this.plan.base = s.pLow;
          this.plan.level = s.pLow + s.ps;
        }
      }
      return;
    }

    switch (this.phase) {
      case 'insp': {
        if (this.kind === 'VC') {
          if (this.paw >= s.alarms.pawMax) {
            this.raise('pmax', 'high', 'Presión alta: inspiración interrumpida por límite de presión');
            this.endInsp('límite de presión');
          } else if (tIn >= this.plan.tiFlow) this.endInsp('volumen/tiempo');
        } else if (this.kind === 'PC') {
          if (tIn >= this.plan.ti) this.endInsp('tiempo');
          else if (this.paw >= s.alarms.pawMax) {
            this.raise('pmax', 'high', 'Presión alta: inspiración interrumpida');
            this.endInsp('límite de presión');
          }
        } else if (this.kind === 'PS') this.psCycling(tIn);
        break;
      }
      case 'pause':
        if (tIn >= this.plan.pause) {
          const stable = this.plateauShape(Math.min(0.3, this.plan.pause * 0.6)).stable;
          this.acc.pplat = this.paw;
          this.acc.inspEnd = this.t;
          this.checkCycleAsync(this.t);
          this.acc.pplatStable = stable && this.holdPmusMax < 1 && this.plan.pause >= 0.2;
          this.goExp('fin de pausa');
        }
        break;
      case 'holdI':
        if (tIn >= this.inspHoldTime) this.finishInspHold();
        break;
      case 'holdE':
        if (tIn >= this.expHoldTime) this.finishExpHold();
        break;
      case 'occl':
        this.occlusionLogic();
        break;
      case 'exp':
        this.expLogic(tIn);
        break;
    }
    // alarma de apnea continua
    const lastAny = Math.max(this.breathStart, 0);
    if (t - lastAny > s.alarms.apneaTime && t > 5) {
      this.raise('apnea', 'high', `Apnea > ${s.alarms.apneaTime} s`);
    }
  }

  private psCycling(tIn: number) {
    const s = this.settings;
    const fm = this.flowMeas;
    if (fm > this.peakFlowMeas) this.peakFlowMeas = fm;
    const target = this.pressureTarget(tIn);
    if (tIn > 0.12 && fm < this.peakFlowMeas * (s.ets / 100) && fm < this.peakFlowMeas * 0.98) {
      if (this.cycleDetectAt === null) this.cycleDetectAt = this.t;
    }
    if (this.cycleDetectAt !== null && this.t - this.cycleDetectAt >= CYCLE_RESPONSE) {
      this.endInsp(`flujo (${s.ets}% del pico)`);
    } else if (tIn >= TI_MAX_PS) {
      this.raise('timax', 'medium', 'Ciclado por tiempo máximo en PSV (¿fuga? ¿ETS bajo?)');
      this.endInsp('tiempo máximo de seguridad');
    } else if (tIn > 0.2 && this.paw > target + 3) {
      this.endInsp('presión (esfuerzo espiratorio)');
    } else if (this.paw >= s.alarms.pawMax) {
      this.endInsp('límite de presión');
    }
  }

  private detectTrigger(tExp: number): boolean {
    const s = this.settings;
    if (!this.modeAllowsTrigger || tExp < TRIG_LOCKOUT) {
      this.trigPendingAt = null;
      return false;
    }
    if (this.trigPendingAt === null) {
      const base = this.basePressure();
      const hit =
        s.triggerType === 'flow'
          ? this.flowMeas * 60 > s.flowTrigger
          : this.paw < base - s.pressureTrigger;
      if (hit) {
        this.trigPendingAt = this.t + TRIG_RESPONSE;
        this.trigDetectAt = this.t;
      }
      return false;
    }
    if (this.t >= this.trigPendingAt) {
      this.trigPendingAt = null;
      return true;
    }
    return false;
  }

  private expLogic(tExp: number) {
    const s = this.settings;
    const t = this.t;
    const mode = s.mode;
    // maniobras que comienzan en espiración
    if (this.pendingManeuver === 'p01' || this.pendingManeuver === 'pocc') {
      if (tExp > 0.4) {
        this.occl = { kind: this.pendingManeuver, start: t, base: this.paw, hist: [], onset: null, p01: null, min: this.paw };
        this.pendingManeuver = null;
        this.phase = 'occl';
        this.phaseStart = t;
        this.holdPmusMax = 0;
        return;
      }
    }
    const machineDue = (() => {
      if (mode === 'VCV' || mode === 'PCV' || mode === 'PRVC') return t >= this.nextMachine && tExp >= MIN_TE_MACHINE;
      if (mode === 'SIMV_VC' || mode === 'SIMV_PC') {
        const period = 60 / Math.max(1, s.rr);
        if (t >= this.simvPeriodStart + period) {
          this.simvPeriodStart += period;
          if (t - this.simvPeriodStart > period) this.simvPeriodStart = t;
          const due = !this.simvSatisfied;
          this.simvSatisfied = false;
          if (due) return true;
        }
        return false;
      }
      // espontáneos: respaldo por apnea
      if (t - Math.max(this.lastPatientBreath, this.breathStart) > s.alarms.apneaTime) {
        this.apneaBackup = true;
        this.raise('apnea', 'high', 'Apnea: ventilación de respaldo (PC) activada');
      }
      if (this.apneaBackup && t - this.breathStart >= 60 / Math.max(8, s.rr) && tExp > MIN_TE_MACHINE) return true;
      return false;
    })();

    // la pausa espiratoria ocluye al final de la espiración: en el siguiente ciclo programado o, si el
    // paciente dispara antes (A/C asistida, PSV), en el momento del disparo (el esfuerzo queda registrado
    // como deflexión durante la oclusión y la medida se marca como no fiable)
    let trig: boolean | null = null;
    if (this.pendingManeuver === 'expHold') {
      trig = this.detectTrigger(tExp);
      const ready = machineDue || trig || (!this.isMandatoryMode() && tExp > 1.2);
      if (ready) {
        this.pendingManeuver = null;
        this.phase = 'holdE';
        this.phaseStart = t;
        this.holdPmusMax = 0;
        this.holdStartPaw = this.paw;
        this.trigPendingAt = null;
        this.trigDetectAt = null;
        return;
      }
    }

    if (machineDue) {
      const kind = this.mandatoryKind();
      this.startBreath(kind, 'machine', true);
      if (mode === 'SIMV_VC' || mode === 'SIMV_PC') this.simvSatisfied = true;
      return;
    }

    if (trig ?? this.detectTrigger(tExp)) {
      if (mode === 'VCV' || mode === 'PCV' || mode === 'PRVC') {
        this.startBreath(this.mandatoryKind(), 'patient', true);
      } else if (mode === 'SIMV_VC' || mode === 'SIMV_PC') {
        const period = 60 / Math.max(1, s.rr);
        const inWindow = !this.simvSatisfied && t - this.simvPeriodStart < period * 0.6;
        if (inWindow) {
          this.startBreath(this.mandatoryKind(), 'patient', true);
          this.simvSatisfied = true;
        } else this.startBreath('PS', 'patient', false);
      } else {
        this.startBreath('PS', 'patient', false);
      }
    }
  }

  private mandatoryKind(): BreathKind {
    const m = this.settings.mode;
    if (m === 'VCV' || m === 'SIMV_VC') return 'VC';
    return 'PC';
  }

  private occlusionLogic() {
    const o = this.occl;
    if (!o) {
      this.goExp('');
      return;
    }
    const t = this.t;
    o.hist.push({ t, p: this.paw });
    if (o.hist.length > 400) o.hist.shift();
    if (o.onset === null) {
      // línea de base: presión estabilizada tras el cierre (la Paw sube hasta la presión alveolar)
      if (t - o.start < 0.3) {
        o.base = 0.8 * o.base + 0.2 * this.paw;
        return;
      }
      if (this.paw < o.base - 0.3) {
        // retroceder hasta el último punto en la línea de base
        let on = t;
        for (let i = o.hist.length - 1; i >= 0; i--) {
          if (o.hist[i].p >= o.base - 0.05) {
            on = o.hist[i].t;
            break;
          }
        }
        o.onset = on;
        o.min = this.paw;
      } else if (t - o.start > 8) {
        this.finishOcclusion('No se detectó esfuerzo inspiratorio en 8 s (paciente pasivo o apneico). P0.1/Pocc no medibles.');
        return;
      }
    } else {
      if (o.p01 === null && t >= o.onset + 0.1) {
        o.p01 = o.base - this.paw;
        if (o.kind === 'p01') {
          this.finishOcclusion(null);
          return;
        }
      }
      if (this.paw < o.min) o.min = this.paw;
      if (o.p01 !== null && ((this.paw > o.min + 0.5 && this.paw > o.base - 0.5) || t - o.onset > 3)) this.finishOcclusion(null);
    }
  }

  // ---------------------------------------------------------------- alarmas
  private raise(id: string, level: 'high' | 'medium', text: string) {
    const ex = this.alarms.find((a) => a.id === id);
    if (ex) {
      ex.text = text;
      (ex as AlarmState & { t?: number }).t = this.t;
    } else this.alarms.push(Object.assign({ id, level, text }, { t: this.t }));
  }

  private clear(id: string) {
    this.alarms = this.alarms.filter((a) => a.id !== id);
  }

  clearAlarms() {
    this.alarms = [];
  }

  private checkBreathAlarms(b: BreathRecord) {
    const al = this.settings.alarms;
    if (b.ppeak >= al.pawMax) this.raise('pmax', 'high', `Presión pico ≥ ${al.pawMax} cmH₂O`);
    else if (this.t - ((this.alarms.find((a) => a.id === 'pmax') as { t?: number } | undefined)?.t ?? 0) > 15) this.clear('pmax');
    if (b.kind !== 'APRV') {
      if (b.vte < al.vteMin) this.raise('vtelow', 'medium', `Vte bajo (${b.vte.toFixed(0)} mL)`);
      else this.clear('vtelow');
      if (b.vte > al.vteMax) this.raise('vtehigh', 'medium', `Vte alto (${b.vte.toFixed(0)} mL)`);
      else this.clear('vtehigh');
    }
    const m = this.monitor();
    if (this.t > 15) {
      if (m.mv < al.mvMin) this.raise('mvlow', 'high', `Volumen minuto bajo (${m.mv.toFixed(1)} L/min)`);
      else this.clear('mvlow');
      if (m.mv > al.mvMax) this.raise('mvhigh', 'medium', `Volumen minuto alto (${m.mv.toFixed(1)} L/min)`);
      else this.clear('mvhigh');
    }
    if (m.rrTotal > al.rrMax) this.raise('rrhigh', 'medium', `Frecuencia alta (${m.rrTotal.toFixed(0)} rpm)`);
    else this.clear('rrhigh');
    if (this.t - b.tStart < this.settings.alarms.apneaTime) this.clear('apnea');
    if (this.patient.leak > 0 && b.vti > 50 && (b.vti - b.vte) / b.vti > 0.15 && b.kind !== 'APRV')
      this.raise('leak', 'medium', `Fuga: Vti − Vte = ${(b.vti - b.vte).toFixed(0)} mL`);
    else this.clear('leak');
    const ap = b.peepTotalModel - b.peep;
    void ap;
  }

  // ---------------------------------------------------------------- monitor numérico
  monitor(): Monitor {
    const s = this.settings;
    const t = this.t;
    const recent = this.breaths.filter((b) => b.tEnd > t - 30);
    const last = this.breaths[this.breaths.length - 1];
    const lastN = recent.slice(-8);
    const meanPeriod = lastN.length ? lastN.reduce((x, b) => x + (b.tEnd - b.tStart), 0) / lastN.length : 0;
    const rrTotal = meanPeriod > 0 ? 60 / meanPeriod : 0;
    const spontFrac = lastN.length ? lastN.filter((b) => !b.mandatory).length / lastN.length : 0;
    const vteMean = lastN.length ? lastN.reduce((x, b) => x + Math.max(0, b.vte), 0) / lastN.length : 0;
    let mv = (vteMean * rrTotal) / 1000;
    if (t >= 60) {
      const win = this.breaths.filter((b) => b.tEnd > t - 60);
      mv = win.reduce((x, b) => x + Math.max(0, b.vte), 0) / 1000;
    }
    const peep = this.basePressure();
    const ih = this.lastManeuver('inspHold', 120);
    const eh = this.lastManeuver('expHold', 120);
    let pplat: number | null = null;
    let pplatSource = '—';
    let pplatValid = false;
    const lastMand = [...lastN].reverse().find((b) => b.mandatory);
    if (lastMand && lastMand.pplat !== null) {
      pplat = lastMand.pplat;
      pplatSource = 'pausa programada';
      pplatValid = lastMand.pplatStable;
    }
    if (ih && (!lastMand || lastMand.pplat === null || ih.t > lastMand.tStart)) {
      pplat = ih.value;
      pplatSource = 'pausa inspiratoria';
      pplatValid = ih.valid;
    }
    const peepTotal = eh ? eh.value : null;
    const peepRef = eh && eh.valid ? eh.value : peep;
    const dp = pplat !== null ? pplat - peepRef : null;
    const vt = last ? Math.max(1, last.vti) : 0;
    const vte = last ? last.vte : 0;
    const cstat = pplat !== null && dp! > 0.5 ? (lastMand ? lastMand.vti : vt) / dp! : null;
    const cdyn = last && last.ppeak - peep > 0.5 ? vte / (last.ppeak - peep) : 0;
    let rInsp: number | null = null;
    let rSource = '—';
    if (ih && ih.extra && isFinite(ih.extra.rinsp)) {
      rInsp = ih.extra.rinsp;
      rSource = 'pausa (VC flujo cte.)';
    } else if (lastMand && lastMand.kind === 'VC' && lastMand.pplat !== null && s.flowPattern === 'square' && lastMand.endInspFlow > 6) {
      rInsp = (lastMand.ppeak - lastMand.pplat) / (lastMand.endInspFlow / 60);
      rSource = 'pausa programada';
    }
    const lsf = last?.lsf;
    const lsfValid = !!lsf && lsf.valid;
    const cLsf = lsfValid ? 1000 / lsf!.e : null;
    const rLsf = lsfValid ? lsf!.r : null;
    if (rInsp === null && lsfValid) {
      rInsp = rLsf;
      rSource = 'mínimos cuadrados';
    }
    const cForTau = cstat ?? cLsf;
    const tau = rInsp !== null && cForTau !== null ? (rInsp * cForTau) / 1000 : null;
    const pmean = lastN.length ? lastN.reduce((x, b) => x + b.pmean * (b.tEnd - b.tStart), 0) / lastN.reduce((x, b) => x + (b.tEnd - b.tStart), 0) : this.paw;
    const energy = lastN.length ? lastN.reduce((x, b) => x + b.energy, 0) / lastN.length : 0;
    const wob = lastN.length ? lastN.reduce((x, b) => x + b.wobPatient, 0) / lastN.length : 0;
    const vtL = lastN.length ? lastN.reduce((x, b) => x + Math.max(1, b.vtLung), 0) / lastN.length / 1000 : 1;
    const ptp = lastN.length ? lastN.reduce((x, b) => x + b.ptpMus, 0) / lastN.length : 0;
    const p01m = this.lastManeuver('p01', 300);
    const pocc = this.lastManeuver('pocc', 300);
    const lastEff = [...this.drive.efforts].reverse().find((e) => e.onset < t - 0.15);
    const p01Model = lastEff ? lastEff.pmax * Math.sin((Math.PI / 2) * Math.min(1, 0.1 / lastEff.ti)) : 0;
    const ti = last ? last.ti : 0;
    const te = last ? last.te : 0;
    const ieRatio = ti > 0 ? te / ti : 0;
    // índice de asincronía (Thille): disparo y ciclado; el flujo y el atrapamiento se informan aparte
    const AI_TYPES = new Set(['double', 'autotrigger', 'lateTrigger', 'prematureCycle', 'delayedCycle']);
    const asyncWin = this.asyncEvents.filter((a) => a.t > t - 60 && AI_TYPES.has(a.type));
    const effortsWin = this.drive.efforts.filter((e) => e.onset > t - 60 && e.onset < t - e.ti - 0.3);
    const ineff = this.aprvActive || !this.modeAllowsTrigger ? 0 : effortsWin.filter((e) => !e.triggered && !e.reverse).length;
    const spontEfforts = this.aprvActive ? this.drive.efforts.filter((e) => e.onset > t - 30).length * 2 : 0;
    const brWin = this.breaths.filter((b) => b.tEnd > t - 60).length;
    const asyncIndex = brWin + ineff > 0 ? Math.min(100, (100 * (asyncWin.length + ineff)) / (brWin + ineff)) : 0;
    const p = this.patient;
    const rNorm = p.rMin >= 0.999 ? 1 : (this.mech.r - p.rMin) / (1 - p.rMin);
    return {
      ppeak: last ? last.ppeak : this.paw,
      pplat,
      pplatSource,
      pplatValid,
      peep,
      peepTotal,
      peepTotalSource: eh ? 'pausa espiratoria' : '—',
      autoPeepModel: last ? last.peepTotalModel - last.peep : 0,
      dp,
      vti: last ? last.vti : 0,
      vte,
      vtPerKg: vte / this.pbw,
      mv,
      rrTotal,
      rrSpont: this.aprvActive ? spontEfforts : rrTotal * spontFrac,
      cstat,
      cdyn,
      rInsp,
      rSource,
      tau,
      pmean,
      mp: energy * rrTotal,
      wobJL: wob / vtL,
      wobJmin: wob * rrTotal,
      ptpMin: ptp * rrTotal,
      p01: p01m && p01m.valid ? p01m.value : pocc && pocc.extra && isFinite(pocc.extra.p01) ? pocc.extra.p01 : null,
      p01Model,
      pmusModel: lastN.length ? Math.max(...lastN.map((b) => b.pmusPeak)) : 0,
      pmusEst: pocc && pocc.extra ? pocc.extra.pmusEst : null,
      pplSwing: last ? last.pplSwing : 0,
      ptpEI: last ? last.ptpEI : 0,
      ptpEE: last ? last.ptpEE : 0,
      eef: last ? last.eef : 0,
      ti,
      te,
      ie: ti > 0 ? (ieRatio >= 1 ? `1:${ieRatio.toFixed(1)}` : `${(1 / Math.max(ieRatio, 0.01)).toFixed(1)}:1`) : '—',
      ieRatio,
      peakInspFlow: last ? last.peakInspFlow : 0,
      peakExpFlow: last ? last.peakExpFlow : 0,
      lsfValid,
      cLsf,
      rLsf,
      asyncIndex,
      recruitFrac: rNorm,
      overIndex: this.lastOverIndex,
      vEELV: last ? this.mech.v : this.mech.v,
      adaptiveP: this.adaptiveP,
      rsbi: rrTotal > 0 && vteMean > 0 ? rrTotal / (vteMean / 1000) : null,
      noBreath: recent.length === 0,
      patientTriggeredPct: lastN.length ? (100 * lastN.filter((b) => b.trigger === 'patient').length) / lastN.length : 0,
    };
  }

  /** Exporta las curvas de la ventana a CSV */
  /**
   * Sincronía paciente-ventilador (%) en una ventana reciente = % de ciclos del ventilador sin
   * asincronía (un esfuerzo inefectivo marca el ciclo en cuya espiración ocurre). Con `focus` se mide sólo la asincronía estudiada (y su
   * familia); sin él, todas las asincronías mayores (Varón-Vega 2024). La ventana empieza en el último
   * cambio de programación (mín. `minSec`) para que el valor refleje la configuración actual.
   * En el doble disparo / breath stacking ambos ciclos del par cuentan como asincrónicos.
   */
  syncStats(windowSec = 30, minSec = 10, focus?: string): { pct: number; cycles: number; asyncCycles: number; window: number } {
    const t = this.t;
    const w = Math.min(windowSec, Math.max(minSec, t - this.lastChange));
    const from = t - w;
    const br = this.breaths.filter((b) => b.tStart > from);
    if (!br.length) return { pct: 100, cycles: 0, asyncCycles: 0, window: w };
    const family = focus ? SYNC_FAMILY[focus] ?? [focus] : null;
    const counted = (type: string) => (family ? family.includes(type) : SYNC_MAJOR.has(type));
    const flagged = new Set<number>();
    for (const a of this.asyncEvents) {
      if (a.t <= from - 5 || a.breath === undefined || !counted(a.type)) continue;
      flagged.add(a.breath);
      if (a.type === 'double' || a.type === 'stacking') flagged.add(a.breath - 1); // ambos ciclos del par
    }
    if (!family || family.includes('ineffective')) {
      if (!this.aprvActive && this.modeAllowsTrigger)
        for (const e of this.drive.efforts) {
          if (e.onset <= from || e.triggered || e.reverse) continue;
          const b = br.find((x) => e.onset >= x.tStart && e.onset < x.tEnd);
          if (b) flagged.add(b.index);
        }
    }
    const asyncCycles = br.filter((b) => flagged.has(b.index)).length;
    return { pct: Math.round(100 * (1 - asyncCycles / br.length)), cycles: br.length, asyncCycles, window: w };
  }

  /** Asincronía (%) = % de ciclos con asincronía en la ventana (complemento de syncStats). */
  asyncStats(windowSec = 30, minSec = 10, focus?: string): { pct: number; cycles: number; asyncCycles: number; window: number } {
    const st = this.syncStats(windowSec, minSec, focus);
    return { ...st, pct: st.cycles ? 100 - st.pct : 0 };
  }

  toCSV(w: number): string {
    const rows = ['t_s,paw_cmH2O,flow_Lmin,vol_mL,pmus_cmH2O,ppl_cmH2O,ptp_cmH2O,palv_cmH2O,phase'];
    for (const i of this.window(w)) {
      rows.push(
        [this.bt[i].toFixed(2), this.bpaw[i].toFixed(2), this.bflow[i].toFixed(2), this.bvol[i].toFixed(1), this.bpmus[i].toFixed(2), this.bppl[i].toFixed(2), this.bptp[i].toFixed(2), this.bpalv[i].toFixed(2), this.bphase[i]].join(','),
      );
    }
    return rows.join('\n');
  }
}

export function clonePatient(p: PatientParams): PatientParams {
  return { ...p, effort: { ...p.effort } };
}

/** Mínimos cuadrados de Paw = E·V + R·V̇ + P0 a partir de sumas acumuladas. */
export function solveLsf(S: number[]): { e: number; r: number; p0: number; r2: number; valid: boolean } | null {
  const n = S[5];
  if (n < 50) return null;
  const A = [
    [S[0], S[1], S[2]],
    [S[1], S[3], S[4]],
    [S[2], S[4], S[5]],
  ];
  const b = [S[6], S[7], S[8]];
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-12) return null;
  const col = (k: number) => A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)));
  const e = det(col(0)) / D;
  const r = det(col(1)) / D;
  const p0 = det(col(2)) / D;
  // R² = 1 − SSres/SStot ; SSres = Syy − β·Xᵀy
  const ssTot = S[9] - (S[8] * S[8]) / n;
  const ssRes = S[9] - (e * S[6] + r * S[7] + p0 * S[8]);
  const r2 = ssTot > 1e-9 ? 1 - ssRes / ssTot : 0;
  return { e, r, p0, r2, valid: r2 > 0.97 && e > 2 && r > 0.5 && r < 80 };
}
