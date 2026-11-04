/**
 * Biblioteca de ejercicios conocidos. Solo incluye movimientos de uso común cuya ejecución básica
 * es estándar; el entrenador puede editar todo. Los nombres ambiguos NO se incluyen: el importador
 * los marca para que la persona los confirme.
 * No hay videos: los enlaces se añaden manualmente (no se inventan identificadores).
 */

export interface LibVariant {
  name: string;
  note?: string;
}

export interface LibEntry {
  key: string;
  name: string;
  /** Fragmentos normalizados (minúsculas, sin tildes) que identifican el ejercicio. */
  aliases: string[];
  summary: string;
  steps: string[];
  keyPoints: string[];
  errors: string[];
  pose: string;
  easier?: LibVariant;
  harder?: LibVariant;
  lowImpact?: LibVariant;
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[“”"«»'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const SUGERENCIA = 'Sugerencia para revisar con el entrenador.';

export const LIBRARY: LibEntry[] = [
  {
    key: 'circulos-cadera',
    name: 'Círculos de cadera de pie',
    aliases: ['circulos de cadera', 'circulo de cadera', 'rotacion de cadera', 'hip circles'],
    summary: 'Movilidad de cadera: dibuja círculos amplios con la pelvis manteniendo el tronco estable.',
    steps: [
      'De pie, con los pies separados al ancho de los hombros y las manos en la cintura.',
      'Lleva la cadera hacia un lado, adelante, al otro lado y atrás, dibujando un círculo amplio.',
      'Mantén el movimiento lento y continuo.',
      'A mitad del tiempo cambia el sentido del giro.',
    ],
    keyPoints: ['Rodillas ligeramente flexionadas.', 'El movimiento sale de la cadera; los hombros quedan quietos.'],
    errors: ['Mover el tronco o los hombros en lugar de la cadera.', 'Hacer el círculo demasiado rápido.'],
    pose: 'circulos-cadera',
  },
  {
    key: 'circulos-brazos',
    name: 'Círculos de brazos',
    aliases: ['circulos de brazos', 'circulos con los brazos', 'rotacion de brazos', 'arm circles'],
    summary: 'Movilidad de hombros con los brazos extendidos a los lados.',
    steps: [
      'De pie, con los brazos extendidos a los lados a la altura de los hombros.',
      'Haz círculos pequeños hacia adelante y aumenta poco a poco el tamaño.',
      'A mitad del tiempo cambia el sentido (hacia atrás).',
    ],
    keyPoints: ['Hombros lejos de las orejas.', 'Codos extendidos sin bloquearlos.'],
    errors: ['Encoger los hombros.', 'Arquear la espalda baja para compensar.'],
    pose: 'circulos-brazos',
  },
  {
    key: 'saltos-suaves',
    name: 'Saltos suaves',
    aliases: ['saltos suaves', 'saltitos', 'saltos en el sitio', 'saltos en el lugar', 'rebotes'],
    summary: 'Saltos pequeños y rítmicos para elevar la temperatura corporal.',
    steps: [
      'De pie, pies al ancho de la cadera.',
      'Haz saltos pequeños despegando apenas del suelo.',
      'Aterriza sobre la parte delantera del pie con las rodillas suaves.',
      'Mantén un ritmo cómodo y respira de forma continua.',
    ],
    keyPoints: ['Aterrizaje silencioso.', 'Rodillas ligeramente flexionadas al caer.'],
    errors: ['Caer con las piernas rígidas o sobre los talones.', 'Saltar demasiado alto.'],
    pose: 'saltos',
    lowImpact: { name: 'Marcha en el sitio elevando rodillas', note: SUGERENCIA },
  },
  {
    key: 'toe-touch-supino',
    name: 'Tocarse los dedos del pie en decúbito supino',
    aliases: ['dedos del pie en decubito supino', 'toe touch', 'tocarse los dedos del pie', 'toques de punta'],
    summary: 'Abdominal acostado boca arriba con las piernas hacia el techo: las manos buscan los pies.',
    steps: [
      'Acuéstate boca arriba y eleva las piernas extendidas hacia el techo.',
      'Extiende los brazos hacia los pies.',
      'Contrae el abdomen y despega los hombros del suelo llevando las manos hacia los dedos de los pies.',
      'Baja los hombros con control y repite.',
    ],
    keyPoints: ['Zona lumbar apoyada en el suelo.', 'Exhala al subir.'],
    errors: ['Tirar del cuello hacia adelante.', 'Balancear las piernas para impulsarse.'],
    pose: 'toe-touch',
    easier: { name: 'Con las rodillas flexionadas', note: SUGERENCIA },
  },
  {
    key: 'crujido-rana',
    name: 'Crujido de rana',
    aliases: ['crujido de rana', 'crunch de rana', 'frog crunch', 'abdominal de rana'],
    summary: 'Abdominal boca arriba con las plantas de los pies juntas y las rodillas abiertas.',
    steps: [
      'Acuéstate boca arriba, junta las plantas de los pies y deja caer las rodillas hacia los lados.',
      'Extiende los brazos al frente o crúzalos sobre el pecho.',
      'Eleva el tronco contrayendo el abdomen.',
      'Vuelve a bajar con control.',
    ],
    keyPoints: ['Movimiento corto y controlado.', 'Mirada hacia el techo, sin pegar el mentón al pecho.'],
    errors: ['Tirar del cuello con las manos.', 'Subir con impulso.'],
    pose: 'crujido-rana',
  },
  {
    key: 'escalador',
    name: 'Escalador de montaña',
    aliases: ['escalador de montana', 'escaladores', 'escalador', 'mountain climber'],
    summary: 'Desde plancha alta, lleva las rodillas al pecho de forma alterna.',
    steps: [
      'Colócate en plancha alta con las manos debajo de los hombros.',
      'Lleva una rodilla hacia el pecho.',
      'Regresa la pierna y cambia de lado.',
      'Mantén el ritmo que puedas sostener con buena postura.',
    ],
    keyPoints: ['Cadera a la altura de los hombros.', 'Abdomen firme durante todo el ejercicio.'],
    errors: ['Elevar demasiado la cadera.', 'Dejar los hombros por delante de las manos.'],
    pose: 'escalador',
    easier: { name: 'Manos apoyadas en un banco o caja', note: SUGERENCIA },
    lowImpact: { name: 'Escalador lento, apoyando el pie en cada paso (sin salto)', note: SUGERENCIA },
  },
  {
    key: 'palanca-pierna',
    name: 'Palanca de pierna',
    aliases: ['palanca de pierna', 'palancas de pierna', 'elevacion de piernas', 'leg lever', 'leg raise'],
    summary: 'Boca arriba, eleva las piernas extendidas y bájalas con control.',
    steps: [
      'Acuéstate boca arriba con las piernas extendidas y los brazos junto al cuerpo.',
      'Eleva ambas piernas juntas hasta que queden verticales.',
      'Bájalas lentamente sin tocar el suelo.',
      'Repite manteniendo el control.',
    ],
    keyPoints: ['La zona lumbar permanece apoyada.', 'La bajada es más lenta que la subida.'],
    errors: ['Arquear la espalda al bajar.', 'Dejar caer las piernas.'],
    pose: 'palanca',
    easier: { name: 'Con las rodillas flexionadas', note: SUGERENCIA },
  },
  {
    key: 'v-ups',
    name: 'V-ups',
    aliases: ['v-ups', 'v ups', 'v-up', 'abdominal en v', 'navaja'],
    summary: 'Eleva tronco y piernas a la vez para formar una V.',
    steps: [
      'Acuéstate boca arriba con los brazos extendidos por encima de la cabeza y las piernas extendidas.',
      'Eleva al mismo tiempo el tronco y las piernas, llevando las manos hacia los pies.',
      'Forma una V en la parte alta.',
      'Baja con control hasta la posición inicial.',
    ],
    keyPoints: ['Exhala al subir.', 'Controla la bajada.'],
    errors: ['Subir con impulso de los brazos.', 'Golpear el suelo al bajar.'],
    pose: 'v-up',
    easier: { name: 'V-up con rodillas flexionadas (recogido)', note: SUGERENCIA },
    lowImpact: { name: 'V-up alterno, una pierna cada vez', note: SUGERENCIA },
  },
  {
    key: 'plancha-antebrazos',
    name: 'Plancha de antebrazos',
    aliases: ['plancha de antebrazos', 'plancha en antebrazos', 'plancha frontal', 'plancha abdominal', 'plancha'],
    summary: 'Mantén el cuerpo recto apoyado en antebrazos y puntas de los pies.',
    steps: [
      'Apoya los antebrazos en el suelo con los codos debajo de los hombros.',
      'Extiende las piernas y apóyate en las puntas de los pies.',
      'Forma una línea recta de la cabeza a los talones.',
      'Mantén la posición respirando con normalidad.',
    ],
    keyPoints: ['Glúteos y abdomen activos.', 'Cuello en línea con la espalda.'],
    errors: ['Dejar caer la cadera.', 'Elevar demasiado los glúteos.', 'Contener la respiración.'],
    pose: 'plancha',
    easier: { name: 'Plancha con rodillas apoyadas', note: SUGERENCIA },
  },
  {
    key: 'caminadora',
    name: 'Caminadora',
    aliases: ['caminadora', 'cinta de correr', 'treadmill', 'trotadora'],
    summary: 'Caminata en caminadora a la velocidad e inclinación indicadas.',
    steps: [
      'Sube a la caminadora con la banda detenida y coloca el clip de seguridad si lo tiene.',
      'Aumenta la velocidad poco a poco hasta el objetivo.',
      'Ajusta la inclinación indicada por el entrenador.',
      'Al terminar, reduce la velocidad antes de bajarte.',
    ],
    keyPoints: ['Postura erguida y pasos naturales.', 'Usa el pasamanos solo como apoyo de seguridad.'],
    errors: ['Sostenerse con fuerza del pasamanos.', 'Bajarse con la banda en movimiento.'],
    pose: 'caminadora',
  },
  {
    key: 'cobra',
    name: 'Estiramiento de cobra',
    aliases: ['cobra'],
    summary: 'Boca abajo, eleva el pecho empujando suavemente con las manos.',
    steps: [
      'Acuéstate boca abajo con las manos debajo de los hombros.',
      'Empuja suavemente para elevar el pecho, manteniendo la cadera en el suelo.',
      'Sostén la posición en un rango cómodo.',
      'Baja despacio.',
    ],
    keyPoints: ['Hombros lejos de las orejas.', 'Solo hasta donde resulte cómodo.'],
    errors: ['Forzar la espalda baja bloqueando los codos.', 'Despegar la cadera del suelo.'],
    pose: 'cobra',
    easier: { name: 'Posición de esfinge (apoyado en antebrazos)', note: SUGERENCIA },
  },
  {
    key: 'marcha',
    name: 'Marcha en el sitio',
    aliases: ['marcha en el sitio', 'marcha en el lugar', 'marcha estatica'],
    summary: 'Marcha sin desplazarte, elevando las rodillas a un ritmo cómodo.',
    steps: ['De pie, eleva una rodilla y luego la otra de forma alterna.', 'Acompaña con el balanceo de los brazos.'],
    keyPoints: ['Tronco erguido.'],
    errors: ['Inclinarse hacia atrás.'],
    pose: 'marcha',
  },
];

/** Busca un ejercicio por nombre. Prefiere el alias más largo que coincida. */
export function findLib(name: string): LibEntry | null {
  const n = norm(name);
  if (!n) return null;
  let best: LibEntry | null = null;
  let bestLen = 0;
  for (const e of LIBRARY) {
    for (const a of e.aliases) {
      if (n.includes(a) && a.length > bestLen) {
        best = e;
        bestLen = a.length;
      }
    }
  }
  return best;
}

export const libByKey = (key?: string) => LIBRARY.find((e) => e.key === key) ?? null;
