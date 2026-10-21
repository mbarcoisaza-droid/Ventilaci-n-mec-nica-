import type { EffortParams, PatientParams, VentSettings } from '../engine/types';

export interface AsyncPreset {
  phenotype: string;
  patient?: Partial<PatientParams>;
  effort?: Partial<EffortParams>;
  settings?: Partial<VentSettings>;
}

export interface Asynchrony {
  id: string;
  name: string;
  phase: 'disparo' | 'ciclado' | 'flujo' | 'espiración';
  mechanism: string;
  generation: string;
  curves: string;
  signs: string[];
  differentials: string[];
  corrections: string[];
  consequences: string;
  activate: AsyncPreset;
  resolve: AsyncPreset & { text: string };
}

export const ASYNCHRONIES: Asynchrony[] = [
  {
    id: 'ineffective',
    name: 'Esfuerzo inefectivo',
    phase: 'disparo',
    mechanism:
      'El esfuerzo inspiratorio no alcanza a disparar el ventilador. La causa más frecuente es la auto-PEEP: el paciente debe generar primero una Pmus igual a la PEEP intrínseca para que el flujo se haga inspiratorio, y sólo después alcanzar la sensibilidad. También por sobreasistencia (Vt grande → Ti neural acortado, impulso reducido), sensibilidad poco sensible o debilidad muscular.',
    generation:
      'EPOC con limitación al flujo, PSV alta (Vt grande, constante de tiempo larga) y disparo por presión poco sensible. En el modelo la condición de disparo aparece sola: Pmus debe superar Pel(EELV) − PEEP.',
    curves:
      'Durante la espiración, deflexión negativa de Paw (pequeña) y, sobre todo, una «joroba» en el flujo espiratorio que se acerca a cero (o lo cruza) sin generar un ciclo; aumento transitorio de volumen.',
    signs: [
      'Flujo espiratorio que se interrumpe y se recupera sin ciclo nuevo.',
      'Frecuencia del paciente (observada en el tórax o en las curvas) > frecuencia del ventilador.',
      'Flujo telespiratorio ≠ 0 (auto-PEEP).',
    ],
    differentials: ['Oscilaciones cardiogénicas (rítmicas con el pulso, sin cambio de volumen relevante)', 'Secreciones/agua en el circuito', 'Hipo'],
    corrections: [
      'Reducir la asistencia (PS o Vt) si hay sobreasistencia.',
      'Aumentar el criterio de ciclado (ETS) en EPOC para alargar la espiración.',
      'PEEP externa ≈ 70–80 % de la auto-PEEP medida (contrabalanceo) en limitación al flujo.',
      'Disparo por flujo más sensible sin provocar autodisparo.',
      'Tratar la obstrucción (broncodilatadores).',
    ],
    consequences: 'Trabajo respiratorio desperdiciado, fatiga, disconfort, mayor duración de VM; marcador de sobreasistencia y de mortalidad (índice de asincronía > 10 %).',
    activate: {
      phenotype: 'copd',
      effort: { pmusMax: 7, rr: 22, tiNeural: 0.9, relaxTau: 0.15, chemoGain: 0 },
      settings: { mode: 'PSV', ps: 16, peep: 0, ets: 15, triggerType: 'pressure', pressureTrigger: 3, fio2: 0.35 },
    },
    resolve: {
      phenotype: 'copd',
      settings: { ps: 9, ets: 40, peep: 6, triggerType: 'flow', flowTrigger: 2 },
      text: 'PS 16→9, ETS 15→40 %, PEEP 0→6 (≈ 75 % de la auto-PEEP), disparo por flujo 2 L/min.',
    },
  },
  {
    id: 'autotrigger',
    name: 'Autodisparo',
    phase: 'disparo',
    mechanism:
      'El ventilador interpreta como esfuerzo una señal que no lo es: fuga (el flujo de fuga en espiración simula un flujo inspiratorio), oscilaciones cardiogénicas, agua en el circuito, o sensibilidad excesiva.',
    generation: 'Paciente sedado sin esfuerzo, fuga de 9 L/min en el neumotaponamiento, disparo por flujo a 1 L/min sin compensación de fugas.',
    curves:
      'Ciclos que comienzan sin deflexión negativa previa de Paw; flujo telespiratorio positivo constante; el volumen no vuelve a cero (Vti > Vte); frecuencia elevada y regular.',
    signs: ['FR total > FR programada en un paciente sin esfuerzo clínico', 'Ausencia de muesca de disparo en Paw', 'Vti − Vte elevado (fuga)'],
    differentials: ['Taquipnea real por alta demanda (sí hay deflexión previa y contracción visible)', 'Doble disparo'],
    corrections: ['Reparar la fuga (neumotaponamiento, circuito, fístula)', 'Activar compensación de fugas', 'Reducir la sensibilidad (p. ej. 3–4 L/min) sin inducir esfuerzos inefectivos'],
    consequences: 'Alcalosis respiratoria, hiperinsuflación dinámica, interpretación errónea del estado neurológico (p. ej. evaluación de muerte encefálica).',
    activate: {
      phenotype: 'healthy',
      patient: { leak: 9, leakSite: 'airway' },
      effort: { pmusMax: 0, reverseTrigger: false },
      settings: { mode: 'VCV', rr: 12, vt: 450, flowTrigger: 1, triggerType: 'flow', leakComp: false, peep: 8 },
    },
    resolve: {
      phenotype: 'healthy',
      patient: { leak: 9, leakSite: 'airway' },
      settings: { leakComp: true, flowTrigger: 3 },
      text: 'Compensación de fugas activada y sensibilidad 1→3 L/min (lo definitivo es corregir la fuga).',
    },
  },
  {
    id: 'double',
    name: 'Doble disparo',
    phase: 'ciclado',
    mechanism:
      'El esfuerzo inspiratorio neural dura más que el Ti del ventilador: al terminar el primer ciclo la Pmus persiste, supera la sensibilidad y dispara un segundo ciclo dentro del mismo esfuerzo, con espiración nula o mínima entre ambos.',
    generation: 'VCV con Vt 6 mL/kg y flujo alto (Ti mecánico ≈ 0.45 s) en un paciente con impulso alto y Ti neural ≈ 1.3 s.',
    curves:
      'Dos ciclos consecutivos separados por un tiempo espiratorio muy corto (< 50 % del Ti medio); el segundo parte de un volumen no exhalado; el flujo espiratorio entre ambos casi no aparece.',
    signs: ['Dos inspiraciones seguidas con Te muy corto', 'Vt real ≈ 2 × Vt programado', 'Ppico del 2.º ciclo mayor'],
    differentials: ['Disparo reverso con doble ciclado (el esfuerzo empieza DESPUÉS del ciclo mecánico)', 'Autodisparo'],
    corrections: [
      'Prolongar el Ti mecánico (menor flujo, rampa descendente, pausa inspiratoria) para acercarlo al Ti neural.',
      'En PSV: reducir el ETS (ciclar más tarde).',
      'Considerar aumentar Vt sólo si la presión meseta/driving lo permiten (controvertido en SDRA).',
      'Tratar la causa del impulso alto (dolor, acidosis, fiebre, ansiedad); sedación si persiste.',
    ],
    consequences: 'Breath stacking: Vt y presión transpulmonar excesivos (lesión pulmonar), pérdida de la ventilación protectora.',
    activate: {
      phenotype: 'ardsMild',
      effort: { pmusMax: 13, rr: 20, tiNeural: 1.3, variability: 0.05, chemoGain: 0 },
      settings: { mode: 'VCV', vt: 420, peakFlow: 60, flowPattern: 'square', pause: 0, rr: 14, peep: 8 },
    },
    resolve: {
      phenotype: 'ardsMild',
      settings: { peakFlow: 40, flowPattern: 'decel', pause: 0.3 },
      text: 'Flujo 60→40 L/min con rampa descendente y pausa 0.3 s: Ti mecánico ≈ 1.3 s (≈ Ti neural). Observe el compromiso: con este impulso el flujo menor produce concavidad de Paw (flujo insuficiente); la alternativa es PCV con Ti ≈ 1.2 s o tratar el impulso.',
    },
  },
  {
    id: 'reverse',
    name: 'Disparo reverso',
    phase: 'disparo',
    mechanism:
      'Contracción diafragmática desencadenada por la insuflación pasiva (arrastre respiratorio, «entrainment»), típica en pacientes profundamente sedados o con SDRA. El esfuerzo comienza DESPUÉS del inicio del ciclo disparado por máquina, con relación de fase fija (1:1, 1:2…). Puede generar doble ciclado si el esfuerzo persiste tras el ciclado.',
    generation: 'PCV en paciente pasivo; el generador inicia un esfuerzo 0.5 s después de cada ciclo por máquina (relación 1:1).',
    curves:
      'En PCV: deformación del flujo inspiratorio (aumento tardío del flujo) y de la meseta; en VCV: caída de Paw durante la insuflación. Si el esfuerzo continúa en espiración: muesca en el flujo espiratorio o un segundo ciclo (doble ciclado).',
    signs: ['Ciclo inicial SIN muesca de disparo (disparado por máquina)', 'Deformación aparece a mitad de la inspiración, con latencia constante', 'Patrón repetitivo con relación de fase fija'],
    differentials: ['Doble disparo por Ti neural largo (el esfuerzo PRECEDE al primer ciclo)', 'Ciclado prematuro'],
    corrections: [
      'Confirmar con presión esofágica o EAdi si está disponible.',
      'Reducir la sedación permitiendo ventilación espontánea, o modificar FR/Ti (cambia la relación de arrastre).',
      'Pasar a un modo espontáneo si el estado clínico lo permite; bloqueo neuromuscular sólo en casos seleccionados.',
    ],
    consequences: 'Breath stacking, Pmus «excéntrica» (contracción durante elongación) con posible daño diafragmático, aumento de presión transpulmonar.',
    activate: {
      phenotype: 'ardsModerate',
      effort: { pmusMax: 0, reverseTrigger: true, rtDelay: 0.5, rtAmp: 10, tiNeural: 0.9, rtRatio: 1 },
      settings: { mode: 'PCV', pinsp: 14, ti: 0.8, rr: 18, peep: 10 },
    },
    resolve: {
      phenotype: 'ardsModerate',
      effort: { reverseTrigger: false, pmusMax: 0 },
      text: 'En el modelo, el arrastre se elimina (equivale a modificar sedación o FR/Ti hasta perder el acoplamiento). En la clínica la respuesta es variable e impredecible.',
    },
  },
  {
    id: 'lateTrigger',
    name: 'Disparo tardío',
    phase: 'disparo',
    mechanism:
      'Retraso excesivo (> 100–150 ms) entre el inicio del esfuerzo neural y el inicio del ciclo. Causa principal: auto-PEEP (umbral elástico) y sensibilidad baja; también tiempos de respuesta del ventilador.',
    generation: 'EPOC en A/C-VC con FR alta, PEEP 0 y disparo por presión −2.5 cmH₂O.',
    curves: 'Deflexión negativa prolongada de Paw y flujo espiratorio que debe frenarse hasta cero antes de que inicie el ciclo; el ciclo arranca tarde respecto a la muesca.',
    signs: ['Muesca de Paw ancha/profunda antes del ciclo', 'Flujo espiratorio truncado bruscamente', 'Auto-PEEP medida elevada'],
    differentials: ['Esfuerzo inefectivo (el extremo del mismo fenómeno)'],
    corrections: ['PEEP externa ≈ 70–80 % de la auto-PEEP', 'Disparo por flujo', 'Reducir Vt/FR o aumentar flujo para alargar Te'],
    consequences: 'Aumento del trabajo isométrico, disconfort, progresión a esfuerzos inefectivos.',
    activate: {
      phenotype: 'copd',
      effort: { pmusMax: 13, rr: 18, tiNeural: 0.9, chemoGain: 0 },
      settings: { mode: 'VCV', rr: 16, vt: 500, peakFlow: 45, pause: 0, peep: 0, triggerType: 'pressure', pressureTrigger: 2.5 },
    },
    resolve: {
      phenotype: 'copd',
      settings: { peep: 6, triggerType: 'flow', flowTrigger: 2, pause: 0.25 },
      text: 'PEEP 0→6 (≈ 75 % de la auto-PEEP medida) y disparo por flujo 2 L/min: el umbral elástico baja y el ciclo arranca antes; pausa 0.25 s para que el Ti mecánico (≈ 0.9 s) siga al Ti neural y no aparezca doble disparo. Reducir la auto-PEEP (menos FR o Vt) también ayuda.',
    },
  },
  {
    id: 'prematureCycle',
    name: 'Ciclado prematuro',
    phase: 'ciclado',
    mechanism:
      'El ventilador termina la inspiración antes que el paciente. En PSV ocurre con ETS alto y constantes de tiempo cortas (SDRA, restrictivos): el flujo cae rápido y alcanza el umbral precozmente mientras la Pmus sigue activa.',
    generation: 'SDRA moderado con esfuerzo moderado y Ti neural 1.3 s en PSV 10 con ETS 60 %.',
    curves:
      'Tras el ciclado, el flujo espiratorio inicial se interrumpe o se invierte (inspiración residual) y aparece una depresión de Paw al inicio de la espiración; puede progresar a doble disparo.',
    signs: ['Ti mecánico corto (< 0.6 s) respecto al esfuerzo', 'Muesca/joroba al inicio de la espiración', 'Doble disparos intermitentes'],
    differentials: ['Doble disparo', 'Esfuerzo inefectivo precoz'],
    corrections: ['Reducir ETS (p. ej. 60 → 25 %)', 'Aumentar PS moderadamente', 'En PCV prolongar Ti'],
    consequences: 'Disnea, trabajo inspiratorio extra, doble disparo y Vt excesivo.',
    activate: {
      phenotype: 'ardsModerate',
      effort: { pmusMax: 10, rr: 18, tiNeural: 1.3, chemoGain: 0 },
      settings: { mode: 'PSV', ps: 10, ets: 60, peep: 10, riseTime: 0.1 },
    },
    resolve: { phenotype: 'ardsModerate', settings: { ets: 25, ps: 12 }, text: 'ETS 60→25 % y PS 10→12 cmH₂O.' },
  },
  {
    id: 'delayedCycle',
    name: 'Ciclado tardío',
    phase: 'ciclado',
    mechanism:
      'El ventilador sigue insuflando cuando el paciente ya terminó su inspiración neural. Típico en EPOC con PSV y ETS bajo: la constante de tiempo larga hace que el flujo tarde en caer al umbral. El paciente recluta músculos espiratorios.',
    generation: 'EPOC en PSV 18 con ETS 5 % y Ti neural 0.7 s; reflejo espiratorio activo.',
    curves: 'Pico de presión al final de la inspiración (por encima de la PS) y caída brusca del flujo inspiratorio; Ti mecánico largo; puede ciclar por presión.',
    signs: ['Espiga de Paw tardía', 'Caída abrupta («escalón») del flujo antes del ciclado', 'Ti > 1.2 s en PSV con FR alta'],
    differentials: ['Fuga (el flujo nunca cae al umbral → ciclado por tiempo)', 'Tos'],
    corrections: ['Aumentar ETS (40–60 % en EPOC)', 'Reducir PS', 'Revisar fugas'],
    consequences: 'Menor tiempo espiratorio → hiperinsuflación y esfuerzos inefectivos; trabajo espiratorio, disconfort.',
    activate: {
      phenotype: 'copd',
      effort: { pmusMax: 8, rr: 18, tiNeural: 0.7, expReflex: 7, chemoGain: 0 },
      settings: { mode: 'PSV', ps: 18, ets: 5, peep: 5, riseTime: 0.1, triggerType: 'flow', flowTrigger: 2 },
    },
    resolve: { phenotype: 'copd', settings: { ets: 45, ps: 11 }, text: 'ETS 5→45 % y PS 18→11 cmH₂O.' },
  },
  {
    id: 'flowStarvation',
    name: 'Flujo inspiratorio insuficiente (VCV)',
    phase: 'flujo',
    mechanism:
      'En VCV el flujo está fijado: si la demanda del paciente supera el flujo programado, la Pmus «tira» de la vía aérea y la Paw cae durante la insuflación (el ventilador no aporta más flujo).',
    generation: 'VCV con flujo 30 L/min y esfuerzo intenso (Pmus ≈ 14 cmH₂O).',
    curves: 'Curva de Paw cóncava hacia arriba («scooping») durante la inspiración, comparada con la morfología pasiva; el flujo cuadrado no cambia.',
    signs: ['Concavidad de Paw inspiratoria', 'Ppico variable ciclo a ciclo', 'Uso de musculatura accesoria'],
    differentials: ['Disparo reverso en VCV (deformación tardía)'],
    corrections: ['Aumentar el flujo pico (60–80 L/min) o usar rampa descendente', 'Cambiar a modo por presión (PCV/PSV) que entregue flujo variable', 'Tratar la demanda'],
    consequences: 'Trabajo respiratorio elevado, fatiga, disnea, riesgo de P-SILI.',
    activate: {
      phenotype: 'healthy',
      effort: { pmusMax: 14, rr: 22, tiNeural: 1.0, chemoGain: 0 },
      settings: { mode: 'VCV', vt: 450, peakFlow: 30, flowPattern: 'square', pause: 0, rr: 14, peep: 5 },
    },
    resolve: {
      phenotype: 'healthy',
      settings: { mode: 'PSV', ps: 10, riseTime: 0.1, ets: 25 },
      text: 'Cambio a PSV 10 cmH₂O (flujo libre según la demanda). Observe que con este impulso el Vt resultante es muy alto (riesgo de P-SILI): la asincronía se corrige, pero el problema de fondo es la demanda. Aumentar sólo el flujo en VCV acorta el Ti mecánico y, con este impulso, provoca doble disparo: pruébelo.',
    },
  },
  {
    id: 'flowExcess',
    name: 'Flujo inspiratorio excesivo',
    phase: 'flujo',
    mechanism:
      'Presurización demasiado rápida (rise time mínimo) o flujo VC excesivo: sobreimpulso de presión al inicio de la inspiración, flujo pico muy alto y, en PSV, ciclado precoz porque el flujo cae rápido desde un pico elevado.',
    generation: 'PSV 18 con rise time 0 s en paciente con impulso bajo.',
    curves: 'Espiga de presión inicial por encima del nivel programado, oscilación de Paw, flujo pico alto y ciclado precoz.',
    signs: ['Sobreimpulso («overshoot») inicial de Paw', 'Flujo pico > 80–100 L/min', 'Ti mecánico corto'],
    differentials: ['Tos', 'Secreciones'],
    corrections: ['Aumentar rise time (0.15–0.3 s)', 'Reducir PS', 'En VCV reducir flujo pico'],
    consequences: 'Disconfort, ciclado prematuro, posible doble disparo.',
    activate: {
      phenotype: 'ardsMild',
      effort: { pmusMax: 4, rr: 16, tiNeural: 1.0, chemoGain: 0 },
      settings: { mode: 'PSV', ps: 18, riseTime: 0, ets: 25, peep: 8 },
    },
    resolve: { phenotype: 'ardsMild', settings: { riseTime: 0.2, ps: 12 }, text: 'Rise time 0→0.2 s y PS 18→12 cmH₂O.' },
  },
  {
    id: 'airTrapping',
    name: 'Atrapamiento aéreo con auto-PEEP',
    phase: 'espiración',
    mechanism:
      'El tiempo espiratorio es insuficiente para la constante de tiempo (R·C) del sistema: la espiración se interrumpe antes de alcanzar el volumen de relajación → hiperinsuflación dinámica y PEEP intrínseca. La limitación al flujo lo agrava.',
    generation: 'EPOC pasivo en VCV con FR 24, Vt 550 mL y flujo 40 L/min (Ti largo, Te corto).',
    curves: 'El flujo espiratorio no llega a cero antes del siguiente ciclo (flujo telespiratorio ≠ 0); bucle flujo-volumen que no cierra en el origen; Pplat y PEEP total aumentan.',
    signs: ['Flujo telespiratorio ≠ 0', 'Auto-PEEP en pausa espiratoria', 'Hipotensión con aumento de Pplat'],
    differentials: ['Fuga espiratoria', 'Esfuerzo espiratorio activo'],
    corrections: ['Reducir FR y Vt (↓ ventilación minuto)', 'Aumentar flujo inspiratorio (↓ Ti)', 'Broncodilatadores', 'Aceptar hipercapnia permisiva'],
    consequences: 'Hipotensión, barotrauma, esfuerzos inefectivos, sobrestimación de la Crs si se ignora la PEEP intrínseca.',
    activate: {
      phenotype: 'copd',
      effort: { pmusMax: 0 },
      settings: { mode: 'VCV', rr: 24, vt: 550, peakFlow: 40, flowPattern: 'square', pause: 0, peep: 0 },
    },
    resolve: { phenotype: 'copd', settings: { rr: 12, vt: 450, peakFlow: 80 }, text: 'FR 24→12, Vt 550→450 mL, flujo 40→80 L/min.' },
  },
  {
    id: 'flowAsync',
    name: 'Asincronía de flujo (modos por presión)',
    phase: 'flujo',
    mechanism:
      'En modos por presión el flujo es variable, pero una presurización lenta (rise time largo) o una presión de soporte baja frente a una demanda alta hacen que el flujo entregado sea inferior al deseado al inicio de la inspiración.',
    generation: 'SDRA con esfuerzo intenso (riesgo P-SILI) en PSV 6 con rise time 0.4 s.',
    curves: 'Paw no alcanza el nivel programado de forma rápida, muesca/concavidad inicial; flujo pico tardío; Vt variable y grande por la Pmus.',
    signs: ['Presurización lenta y deformada', 'Vt muy variable', 'Esfuerzo visible intenso'],
    differentials: ['Flujo insuficiente en VCV (morfología análoga en Paw)'],
    corrections: ['Rise time más corto (0.05–0.1 s)', 'Aumentar PS (vigilando Vt)', 'Si el esfuerzo es excesivo: tratar demanda/considerar sedación y modo controlado'],
    consequences: 'Trabajo respiratorio elevado; con esfuerzos intensos, presión transpulmonar alta (P-SILI).',
    activate: {
      phenotype: 'psili',
      effort: { chemoGain: 0 },
      settings: { mode: 'PSV', ps: 6, riseTime: 0.4, peep: 10, ets: 25 },
    },
    resolve: { phenotype: 'psili', settings: { riseTime: 0.05, ps: 10 }, text: 'Rise time 0.4→0.05 s, PS 6→10 cmH₂O (observe que el Vt puede quedar alto: el problema de fondo es el impulso).' },
  },
  {
    id: 'stacking',
    name: 'Breath stacking',
    phase: 'ciclado',
    mechanism:
      'Apilamiento de dos (o más) ciclos sin espiración intermedia, por doble disparo o disparo reverso. El volumen entregado se suma y la presión transpulmonar puede superar con creces la de un ciclo aislado.',
    generation: 'SDRA moderado en VCV 380 mL con esfuerzo muy intenso (Pmus 18 cmH₂O) y Ti neural 1.5 s.',
    curves: 'Escalón de volumen: el segundo ciclo empieza cerca del volumen tele-inspiratorio del primero; Vte del ciclo combinado ≈ 2 × Vt; Ppico y Pplat del segundo ciclo mayores.',
    signs: ['Volumen que no regresa a la línea basal entre ciclos', 'Vte ≈ 2 × Vt programado', 'Alarmas de presión alta intermitentes'],
    differentials: ['Doble disparo sin apilamiento significativo', 'Disparo reverso'],
    corrections: ['Alargar el Ti mecánico', 'Tratar el impulso (analgesia, sedación)', 'En SDRA grave, considerar bloqueo neuromuscular de corta duración si persiste con ventilación lesiva'],
    consequences: 'Vt real 10–12 mL/kg PBW, lesión pulmonar, pérdida de la estrategia protectora.',
    activate: {
      phenotype: 'ardsModerate',
      effort: { pmusMax: 18, rr: 22, tiNeural: 1.5, variability: 0.05, chemoGain: 0 },
      settings: { mode: 'VCV', vt: 380, peakFlow: 70, flowPattern: 'square', pause: 0, rr: 14, peep: 10 },
    },
    resolve: {
      phenotype: 'ardsModerate',
      effort: { pmusMax: 6 },
      settings: { peakFlow: 35, flowPattern: 'decel', pause: 0.4 },
      text: 'Ti mecánico prolongado (flujo 35 L/min, rampa, pausa 0.4 s) y reducción del impulso (Pmus 18→6: analgesia/sedación ajustada).',
    },
  },
];

export const ASYNC_EVENT_LABEL: Record<string, string> = {
  ineffective: 'Esfuerzo inefectivo',
  double: 'Doble ciclado',
  autotrigger: 'Autodisparo',
  reverse: 'Disparo reverso',
  lateTrigger: 'Disparo tardío',
  prematureCycle: 'Ciclado prematuro',
  delayedCycle: 'Ciclado tardío',
  stacking: 'Breath stacking',
  flowStarvation: 'Flujo insuficiente (VCV)',
  flowExcess: 'Flujo excesivo / sobreimpulso',
  flowAsync: 'Asincronía de flujo',
  airTrapping: 'Atrapamiento aéreo (auto-PEEP)',
};

import { PHENOTYPES } from '../engine/presets';

/** Construye paciente y ajustes a partir de un preset (sobre la configuración actual). */
export function buildPreset(
  pre: AsyncPreset,
  baseSettings: VentSettings,
  basePatient?: PatientParams,
): { patient: PatientParams; settings: VentSettings } {
  const ph = PHENOTYPES[pre.phenotype] ?? PHENOTYPES.healthy;
  const src = basePatient ?? ph;
  const patient: PatientParams = {
    ...src,
    ...(pre.patient ?? {}),
    effort: { ...src.effort, ...(pre.effort ?? {}) },
  };
  const settings: VentSettings = { ...baseSettings, ...(pre.settings ?? {}), alarms: { ...baseSettings.alarms } };
  return { patient, settings };
}
