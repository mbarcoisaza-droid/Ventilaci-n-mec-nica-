import { DEFAULT_SETTINGS, PHENOTYPES } from '../engine/presets';
import type { PatientParams, VentSettings } from '../engine/types';
import type { ClinicalCase } from './types';

export function buildCase(c: ClinicalCase): { patient: PatientParams; settings: VentSettings; initPaco2?: number } {
  const ph = PHENOTYPES[c.patient.phenotype] ?? PHENOTYPES.healthy;
  const patient: PatientParams = {
    ...ph,
    ...(c.patient.overrides ?? {}),
    effort: { ...ph.effort, ...(c.patient.effort ?? {}) },
  };
  const init = c.initialSettings;
  const settings: VentSettings = {
    ...DEFAULT_SETTINGS,
    ...init,
    alarms: { ...DEFAULT_SETTINGS.alarms, ...(init.alarms ?? {}) },
  };
  return { patient, settings, initPaco2: c.initialGas?.paco2 };
}
