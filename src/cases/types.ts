import type { EffortParams, ModeId, PatientParams, VentSettings } from '../engine/types';

export type MetricKey =
  | 'vtPerKg'
  | 'pplat'
  | 'dp'
  | 'dpL'
  | 'peep'
  | 'peepTotal'
  | 'autoPeep'
  | 'rr'
  | 'mv'
  | 'ph'
  | 'paco2'
  | 'pao2'
  | 'spo2'
  | 'pf'
  | 'fio2'
  | 'mp'
  | 'ptpEI'
  | 'ptpEE'
  | 'map'
  | 'icp'
  | 'cpp'
  | 'eef'
  | 'asyncIndex'
  | 'pmus'
  | 'p01'
  | 'ieRatio'
  | 'ps'
  | 'ppeak'
  | 'leakVol'
  | 'overIndex'
  | 'rsbi'
  | 'pplSwing';

export interface Rule {
  id: string;
  label: string;
  metric: MetricKey;
  min?: number;
  max?: number;
  optMin?: number;
  optMax?: number;
  severity: 'crítico' | 'mayor' | 'menor';
  why: string;
  fix: string;
  modelOnly?: boolean; // variable que en la clínica requiere presión esofágica u otra medición
  when?: { modeIn?: ModeId[] };
}

export interface ProcessRule {
  id: string;
  label: string;
  flag: 'inspHold' | 'expHold' | 'p01' | 'pocc';
  severity: 'crítico' | 'mayor' | 'menor';
  why: string;
}

export interface Question {
  id: string;
  q: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface CaseEvent {
  at: number; // s de simulación desde el inicio del caso
  text: string;
  patient?: Partial<PatientParams>;
  effort?: Partial<EffortParams>;
}

export interface ClinicalCase {
  id: string;
  title: string;
  subtitle: string;
  story: string;
  gasNote?: string;
  patient: { phenotype: string; overrides?: Partial<PatientParams>; effort?: Partial<EffortParams> };
  initialSettings: Partial<VentSettings>;
  initialGas?: { paco2?: number };
  objectives: string[];
  hints: string[];
  rules: Rule[];
  process: ProcessRule[];
  alternatives: string[];
  teaching: string[];
  questions: Question[];
  events?: CaseEvent[];
  refs: string[];
}
