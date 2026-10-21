import { Simulator, type SimOptions } from '../engine/simulator';
import type { PatientParams, VentSettings } from '../engine/types';

type Draw = () => void;

/** Bucle de animación: avanza el motor en tiempo real × velocidad y notifica a los lienzos. */
export class Controller {
  sim: Simulator;
  running = true;
  speed = 1;
  private draws = new Set<Draw>();
  private last = 0;
  private raf = 0;

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
