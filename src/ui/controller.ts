import { Simulator, type SimOptions } from '../engine/simulator';
import type { PatientParams, VentSettings } from '../engine/types';
import { setGlowEnabled } from './canvas';

type Draw = () => void;

/** Bucle de animación: avanza el motor en tiempo real × velocidad y notifica a los lienzos. */
export class Controller {
  sim: Simulator;
  running = true;
  speed = 1;
  private draws = new Set<Draw>();
  private last = 0;
  private raf = 0;
  private frameEma = 1 / 60;
  private lastQualityChange = 0;
  private glow = true;
  private qualityHold = 2000; // crece tras cada degradación para no alternar el halo

  constructor(settings: VentSettings, patient: PatientParams, opts?: SimOptions) {
    this.sim = new Simulator(settings, patient, opts);
  }

  replace(settings: VentSettings, patient: PatientParams, opts?: SimOptions, warmup = 0) {
    this.sim = new Simulator(settings, patient, opts);
    if (warmup > 0) this.sim.advance(warmup);
    this.redraw();
  }

  start() {
    const loop = (now: number) => {
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      // calidad adaptativa del trazado: prioriza la fluidez (≈ 60 fps) sobre el halo luminoso
      if (dt > 0) {
        this.frameEma += (dt - this.frameEma) * 0.05;
        if (now - this.lastQualityChange > this.qualityHold) {
          if (this.glow && this.frameEma > 1 / 45) {
            this.glow = false;
            this.lastQualityChange = now;
            this.qualityHold = Math.min(60000, this.qualityHold * 3);
            setGlowEnabled(false);
          } else if (!this.glow && this.frameEma < 1 / 58) {
            this.glow = true;
            this.lastQualityChange = now;
            setGlowEnabled(true);
          }
        }
      }
      if (this.running && dt > 0) this.sim.advance(dt * this.speed);
      this.redraw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  redraw() {
    for (const d of this.draws) d();
  }

  subscribe(d: Draw) {
    this.draws.add(d);
    return () => {
      this.draws.delete(d);
    };
  }
}
