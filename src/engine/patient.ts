import type { EffortParams, EffortRecord } from './types';

/**
 * Generador de presión muscular (Pmus).
 *  Fase inspiratoria neural:  Pmus = Pmax·sin(π/2 · t/TiN)   (pendiente inicial marcada → P0.1 realista)
 *  Relajación:                Pmus = Pmax·exp(−(t−TiN)/τrelax)
 *  Espiración activa basal:   Pmus negativa durante el 60 % inicial de la espiración neural.
 *  Reflejo espiratorio:       si el ventilador sigue insuflando > 0.15 s tras el fin del Ti
 *                             neural, se reclutan músculos espiratorios (ciclo tardío).
 *  Disparo reverso:           el esfuerzo se inicia con retraso fijo tras un ciclo mecánico
 *                             disparado por máquina (arrastre / entrainment).
 * El ritmo neural es independiente del ventilador (salvo el disparo reverso).
 */

// PRNG determinista para reproducibilidad
export class Rng {
  private s: number;
  constructor(seed = 12345) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  gauss(): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export class PatientDrive {
  efforts: EffortRecord[] = [];
  private onset = -100;
  private ti = 1;
  private pmax = 0;
  private nextOnset = 0.8;
  private reverse = false;
  private reflexStart: number | null = null;
  private reflexLevel = 0;
  private reflexRelease: number | null = null;
  private mechCount = 0;
  private rng = new Rng(4242);
  /** factor químico (PaCO2) aplicado por el simulador */
  chemo = 1;

  reset(t: number) {
    this.efforts = [];
    this.onset = -100;
    this.nextOnset = t + 0.8;
    this.reflexStart = null;
    this.reflexRelease = null;
    this.reflexLevel = 0;
  }

  private jitter(e: EffortParams): number {
    return 1 + e.variability * Math.max(-2, Math.min(2, this.rng.gauss()));
  }

  private startEffort(t: number, e: EffortParams, pmax: number, reverse: boolean, tiOverride?: number) {
    this.onset = t;
    this.ti = Math.max(0.3, (tiOverride ?? e.tiNeural) * (reverse ? 1 : this.jitter(e)));
    this.pmax = pmax;
    this.reverse = reverse;
    if (pmax < 0.3) return; // ciclo sin esfuerzo (paciente pasivo con esfuerzo intermitente)
    this.efforts.push({
      onset: t,
      ti: this.ti,
      pmax,
      triggered: false,
      triggerDelay: null,
      breathsTriggered: 0,
      reverse,
    });
    if (this.efforts.length > 400) this.efforts.splice(0, 100);
  }

  /** Avisar al generador de que el ventilador inició un ciclo disparado por máquina. */
  onMachineBreath(t: number, e: EffortParams) {
    if (!e.reverseTrigger) return;
    this.mechCount++;
    if (this.mechCount % Math.max(1, Math.round(e.rtRatio)) === 0) {
      this.nextOnset = t + e.rtDelay;
      this.pendingReverse = true;
    }
  }
  private pendingReverse = false;
  private altActive = false;

  /** Ventilador en inspiración/pausa (para el reflejo espiratorio). */
  pmus(t: number, e: EffortParams, ventInspiring: boolean): number {
    // Programación de esfuerzos
    if (e.reverseTrigger) {
      if (this.pendingReverse && t >= this.nextOnset) {
        this.pendingReverse = false;
        this.startEffort(t, e, e.rtAmp, true);
      }
    } else if ((e.pmusMax > 0 || (e.alt && e.alt.prob > 0)) && t >= this.nextOnset) {
      const useAlt = !!e.alt && this.rng.next() < e.alt.prob;
      this.altActive = useAlt;
      const base = useAlt ? e.alt!.pmusMax : e.pmusMax;
      const pm = Math.min(40, base * this.chemo * this.jitter(e));
      this.startEffort(t, e, Math.max(0, pm), false, useAlt ? e.alt!.tiNeural : undefined);
      const rate = Math.max(4, Math.min(50, e.rr * Math.sqrt(this.chemo)));
      this.nextOnset = t + (60 / rate) * this.jitter(e);
    }
    const tt = t - this.onset;
    let p = 0;
    if (tt >= 0) {
      if (tt < this.ti) p = this.pmax * Math.sin((Math.PI / 2) * (tt / this.ti));
      else p = this.pmax * Math.exp(-(tt - this.ti) / Math.max(0.03, e.relaxTau));
      // espiración activa basal
      if (e.activeExp > 0 && tt > this.ti && !this.reverse) {
        const period = 60 / Math.max(4, e.rr);
        const texp = Math.max(0.3, period - this.ti);
        const x = (tt - this.ti) / (0.6 * texp);
        if (x < 1) p -= e.activeExp * Math.sin(Math.PI * x);
      }
    }
    // Reflejo espiratorio ante insuflación prolongada
    const neuralEnd = this.onset + this.ti;
    const reflex = this.altActive && e.alt?.expReflex !== undefined ? e.alt.expReflex : e.expReflex;
    if (reflex > 0 && this.pmax > 0 && ventInspiring && t > neuralEnd + 0.15 && t - this.onset < 6) {
      if (this.reflexStart === null) this.reflexStart = t;
      this.reflexRelease = null;
      this.reflexLevel = reflex * Math.min(1, (t - this.reflexStart) / 0.12);
    } else if (this.reflexStart !== null) {
      if (this.reflexRelease === null) this.reflexRelease = t;
      const lvl = this.reflexLevel * Math.exp(-(t - this.reflexRelease) / 0.12);
      if (lvl < 0.05) {
        this.reflexStart = null;
        this.reflexLevel = 0;
      } else {
        p -= lvl;
        return p;
      }
    }
    if (this.reflexStart !== null) p -= this.reflexLevel;
    return p;
  }

  /** ¿Hay un esfuerzo inspiratorio neural en curso? */
  inspiring(t: number): boolean {
    return t >= this.onset && t < this.onset + this.ti && this.pmax > 0.3;
  }

  currentEffort(t: number): EffortRecord | null {
    const last = this.efforts[this.efforts.length - 1];
    if (!last) return null;
    if (t >= last.onset && t < last.onset + last.ti + 0.25) return last;
    return null;
  }
}
