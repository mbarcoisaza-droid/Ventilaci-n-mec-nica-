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
    aliases: ['circulos de brazos', 'circulo de brazos', 'circulos con los brazos', 'rotacion de brazos', 'arm circles'],
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
    aliases: ['saltos suaves', 'saltitos', 'saltos en el sitio', 'saltos en el lugar', 'rebotes', 'saltando'],
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
    aliases: ['palanca de pierna', 'palancas de pierna', 'leg lever'],
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
    aliases: ['v-ups', 'v ups', 'v-up', 'v arriba', 'abdominal en v', 'navaja'],
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

const E = (
  key: string,
  name: string,
  aliases: string[],
  pose: string,
  summary: string,
  steps: string[],
  keyPoints: string[],
  errors: string[],
  more: Partial<LibEntry> = {},
): LibEntry => ({ key, name, aliases, pose, summary, steps, keyPoints, errors, ...more });

/** Ejercicios de gimnasio y casa de uso común (descripción general, editable). */
LIBRARY.push(
  E('jalon-pecho', 'Jalón al pecho', ['jalon al pecho', 'jalon', 'pulldown'], 'jalon',
    'En la máquina de polea alta, tira de la barra hacia la parte alta del pecho.',
    ['Siéntate con los muslos sujetos bajo los rodillos y toma la barra con el agarre indicado.', 'Lleva los hombros hacia abajo y atrás.', 'Tira de la barra hasta la parte alta del pecho llevando los codos hacia abajo.', 'Sube la barra con control hasta estirar los brazos.'],
    ['Pecho alto y tronco estable.', 'El movimiento lo inician los hombros y la espalda.'],
    ['Balancear el tronco hacia atrás para tirar.', 'Llevar la barra por detrás de la nuca.']),
  E('elevacion-lateral', 'Elevación lateral con mancuernas', ['elevacion lateral', 'elevaciones laterales'], 'elev-lateral',
    'De pie, eleva las mancuernas hacia los lados hasta la altura de los hombros.',
    ['De pie, con una mancuerna en cada mano a los lados del cuerpo.', 'Con los codos ligeramente flexionados, eleva los brazos hacia los lados.', 'Detente a la altura de los hombros.', 'Baja despacio.'],
    ['Hombros lejos de las orejas.', 'Peso ligero y movimiento controlado.'],
    ['Impulsarse con el cuerpo.', 'Subir las manos por encima de los hombros.']),
  E('remo-inclinado', 'Remo con mancuernas inclinado', ['remo con mancuernas inclinado', 'remo inclinado', 'remo con mancuerna', 'remo con mancuernas'], 'remo',
    'Con el tronco inclinado hacia adelante, lleva las mancuernas hacia la cadera.',
    ['De pie, flexiona ligeramente las rodillas e inclina el tronco hacia adelante con la espalda recta.', 'Deja colgar las mancuernas con el agarre indicado.', 'Lleva los codos hacia atrás acercando las mancuernas a la cadera.', 'Baja con control.'],
    ['Espalda recta durante todo el ejercicio.', 'Junta las escápulas al subir.'],
    ['Redondear la espalda.', 'Tirar con impulso.']),
  E('remo-apoyo-pecho', 'Remo con mancuernas con apoyo en el pecho', ['remo con mancuernas con apoyo en el pecho', 'con apoyo en el pecho'], 'remo',
    'Boca abajo sobre un banco inclinado, rema con las mancuernas.',
    ['Apoya el pecho en un banco inclinado con una mancuerna en cada mano.', 'Deja colgar los brazos.', 'Lleva los codos hacia atrás juntando las escápulas.', 'Baja con control.'],
    ['El pecho permanece apoyado.'],
    ['Despegar el pecho del banco para impulsarse.']),
  E('elevacion-frontal', 'Elevación frontal con mancuernas', ['elevacion frontal', 'elevaciones frontales'], 'elev-frontal',
    'De pie, eleva las mancuernas al frente hasta la altura de los hombros.',
    ['De pie, con las mancuernas delante de los muslos.', 'Eleva los brazos al frente con los codos ligeramente flexionados.', 'Detente a la altura de los hombros.', 'Baja despacio.'],
    ['Tronco quieto.'],
    ['Balancear el cuerpo.', 'Subir por encima de los hombros.']),
  E('press-hombros', 'Press de hombros con mancuernas', ['press de hombros', 'press militar', 'press de hombro'], 'press',
    'Empuja las mancuernas desde la altura de los hombros hacia arriba.',
    ['Sentado con la espalda apoyada, sostén las mancuernas a la altura de los hombros.', 'Empuja hacia arriba hasta casi estirar los brazos.', 'Baja con control a la altura de los hombros.'],
    ['Abdomen activo y espalda apoyada.'],
    ['Arquear la espalda baja.', 'Bloquear los codos de golpe.']),
  E('elevacion-piernas-banco', 'Elevación de piernas en banco plano', ['elevacion de piernas en decubito supino sobre banco', 'elevacion de piernas en banco', 'elevacion de piernas'], 'palanca',
    'Acostado en un banco, eleva las piernas y bájalas con control.',
    ['Acuéstate boca arriba en el banco y sujétate del borde detrás de la cabeza.', 'Con las piernas juntas, elévalas hasta la vertical.', 'Bájalas lentamente sin que toquen el suelo.'],
    ['La zona lumbar permanece apoyada.'],
    ['Arquear la espalda.', 'Dejar caer las piernas.']),
  E('giro-ruso', 'Giro ruso', ['giro ruso', 'giros rusos', 'russian twist'], 'giro-ruso',
    'Sentado con el tronco inclinado hacia atrás, gira el tronco de un lado a otro.',
    ['Siéntate con las rodillas flexionadas e inclina el tronco hacia atrás con la espalda recta.', 'Junta las manos frente al pecho.', 'Gira el tronco hacia un lado y luego hacia el otro.'],
    ['El giro sale del tronco, no solo de los brazos.'],
    ['Redondear la espalda.', 'Hacerlo con prisa.'],
    { easier: { name: 'Con los pies apoyados en el suelo', note: SUGERENCIA } }),
  E('curl-concentracion', 'Curl de concentración', ['curl de concentracion'], 'curl',
    'Sentado, con el codo apoyado en el muslo, flexiona el brazo.',
    ['Siéntate en un banco con las piernas separadas.', 'Apoya el codo en la cara interna del muslo con la mancuerna colgando.', 'Flexiona el codo llevando la mancuerna hacia el hombro.', 'Baja despacio.'],
    ['El brazo no se mueve; solo el antebrazo.'],
    ['Balancear el tronco.']),
  E('curl-martillo', 'Curl de martillo', ['curl de martillo', 'curl martillo'], 'curl',
    'Flexiona los codos con las palmas mirándose entre sí.',
    ['De pie, con las mancuernas a los lados y las palmas hacia el cuerpo.', 'Flexiona los codos sin girar las muñecas.', 'Baja con control.'],
    ['Codos pegados al cuerpo.'],
    ['Mover los codos hacia adelante.', 'Impulsarse con la espalda.']),
  E('curl-alterno', 'Curl de bíceps alterno', ['curl de biceps alterno', 'curl alterno', 'curl de biceps'], 'curl',
    'Flexiona un codo y luego el otro, de forma alterna.',
    ['De pie, con una mancuerna en cada mano y las palmas al frente.', 'Flexiona un codo llevando la mancuerna hacia el hombro.', 'Baja y repite con el otro brazo.'],
    ['Codos quietos junto al cuerpo.'],
    ['Balancear el cuerpo.']),
  E('triceps-cuerda', 'Extensión de tríceps con cuerda', ['extension de triceps con cuerda', 'triceps en polea', 'jalon de triceps'], 'sin-ilustracion',
    'En la polea alta, extiende los codos tirando de la cuerda hacia abajo.',
    ['De pie frente a la polea alta, toma la cuerda con ambas manos.', 'Codos pegados al cuerpo y flexionados.', 'Extiende los codos hacia abajo separando ligeramente los extremos de la cuerda.', 'Vuelve con control.'],
    ['Solo se mueven los antebrazos.'],
    ['Separar los codos del cuerpo.', 'Inclinarse para empujar con el peso del cuerpo.']),
  E('triceps-sobre-cabeza', 'Extensión de tríceps por encima de la cabeza', ['extension de triceps con mancuernas por encima de la cabeza', 'extension de triceps por encima de la cabeza', 'extension de triceps con mancuerna'], 'sin-ilustracion',
    'Sentado, baja la mancuerna detrás de la cabeza y extiende los codos.',
    ['Sentado con la espalda recta, sostén la mancuerna con ambas manos por encima de la cabeza.', 'Flexiona los codos bajando la mancuerna detrás de la cabeza.', 'Extiende los codos para volver arriba.'],
    ['Codos apuntando hacia arriba.', 'Abdomen activo.'],
    ['Abrir demasiado los codos.', 'Arquear la espalda.']),
  E('sentadilla-sumo', 'Sentadilla sumo', ['sentadilla sumo'], 'sentadilla',
    'Sentadilla con los pies más separados que los hombros y las puntas hacia afuera.',
    ['Separa los pies más que el ancho de los hombros con las puntas hacia afuera.', 'Baja la cadera flexionando las rodillas en la dirección de las puntas.', 'Mantén el pecho alto.', 'Empuja el suelo para subir.'],
    ['Rodillas alineadas con las puntas de los pies.', 'Peso repartido en todo el pie.'],
    ['Juntar las rodillas hacia adentro.', 'Inclinar demasiado el tronco.']),
  E('sentadilla-profunda', 'Sentadilla profunda', ['sentadilla profunda'], 'sentadilla',
    'Baja a una sentadilla profunda y mantén la posición.',
    ['Pies al ancho de los hombros o un poco más.', 'Baja la cadera tanto como te resulte cómodo manteniendo los talones apoyados.', 'Mantén la posición respirando con calma.'],
    ['Talones en el suelo.', 'Pecho alto.'],
    ['Forzar más rango del cómodo.']),
  E('sentadilla-talones', 'Sentadilla con talones elevados', ['sentadilla con pesa y talones elevados', 'talones elevados'], 'sentadilla',
    'Sentadilla con los talones sobre un disco o cuña y una pesa al pecho.',
    ['Apoya los talones sobre una superficie baja.', 'Sostén la pesa frente al pecho.', 'Baja manteniendo el tronco erguido.', 'Sube empujando el suelo.'],
    ['Rodillas en la dirección de los pies.'],
    ['Despegar la planta delantera.', 'Redondear la espalda.']),
  E('sentadilla-salto', 'Sentadilla con salto', ['sentadilla con salto'], 'sentadilla',
    'Sentadilla seguida de un salto y aterrizaje suave.',
    ['Baja a una sentadilla.', 'Salta hacia arriba extendiendo cadera y rodillas.', 'Aterriza suave con las rodillas flexionadas y encadena la siguiente.'],
    ['Aterrizaje silencioso.'],
    ['Caer con las piernas rígidas.', 'Rodillas hacia adentro al aterrizar.'],
    { lowImpact: { name: 'Sentadilla sin salto, subiendo de puntillas', note: SUGERENCIA } }),
  E('hip-thrust-barra', 'Empuje de cadera con barra', ['empuje de cadera con barra', 'hip thrust'], 'empuje-cadera',
    'Con la espalda alta apoyada en un banco, eleva la cadera con la barra sobre ella.',
    ['Apoya la parte alta de la espalda en el borde de un banco y coloca la barra sobre la cadera.', 'Pies apoyados al ancho de la cadera.', 'Eleva la cadera hasta que el tronco quede alineado con los muslos.', 'Baja con control.'],
    ['Aprieta los glúteos arriba.', 'Mentón hacia el pecho.'],
    ['Arquear la espalda baja arriba.', 'Empujar con la punta de los pies.']),
  E('puente-gluteos', 'Puente de glúteos', ['puente de gluteos', 'puente gluteo'], 'puente',
    'Acostado boca arriba con las rodillas flexionadas, eleva la cadera.',
    ['Acuéstate boca arriba con las rodillas flexionadas y los pies apoyados.', 'Eleva la cadera apretando los glúteos.', 'Baja con control.'],
    ['Empuja con los talones.', 'Costillas abajo, sin arquear la espalda.'],
    ['Elevar demasiado y arquear la zona lumbar.']),
  E('puente-una-pierna', 'Puente de glúteos a una pierna', ['puente de gluteos con una sola pierna', 'puente de gluteos a una pierna', 'puente a una pierna'], 'puente',
    'Puente de glúteos apoyando un solo pie.',
    ['Boca arriba con una rodilla flexionada y el pie apoyado; la otra pierna elevada.', 'Eleva la cadera empujando con el talón apoyado.', 'Baja con control y completa las repeticiones; luego cambia de pierna.'],
    ['Cadera nivelada, sin girar.'],
    ['Dejar caer la cadera hacia un lado.']),
  E('abduccion-puente-banda', 'Puente de glúteos con abducción y banda', ['abduccion de cadera con puente de gluteos'], 'puente',
    'En posición de puente, abre las rodillas contra la banda.',
    ['Coloca la banda por encima de las rodillas y haz un puente de glúteos.', 'Arriba, abre las rodillas contra la banda y vuelve.', 'Mantén la cadera elevada mientras abres y cierras.'],
    ['Pies apoyados y fijos.'],
    ['Bajar la cadera al abrir las rodillas.']),
  E('abduccion-sentado', 'Abducción de cadera sentado con banda', ['abduccion sentada', 'abduccion de cadera sentado', 'abduccion sentado'], 'sin-ilustracion',
    'Sentado con una banda sobre las rodillas, ábrelas hacia los lados.',
    ['Siéntate en el borde de un banco o silla con la banda por encima de las rodillas.', 'Abre las rodillas hacia afuera contra la banda.', 'Vuelve con control sin perder la tensión.'],
    ['Pies apoyados.'],
    ['Cerrar de golpe.']),
  E('subida-escalon', 'Subida al escalón con mancuernas', ['subida al escalon', 'step up'], 'escalon',
    'Sube a un escalón o caja con una pierna y baja con control.',
    ['De pie frente a un escalón o caja, con una mancuerna en cada mano.', 'Apoya un pie completo en el escalón.', 'Empuja con esa pierna para subir.', 'Baja con control y repite.'],
    ['Todo el pie apoyado en el escalón.', 'Tronco erguido.'],
    ['Impulsarse con la pierna de abajo.', 'Rodilla hacia adentro.']),
  E('sentadilla-bulgara', 'Sentadilla búlgara', ['sentadilla dividida con el pie trasero elevado', 'sentadilla bulgara'], 'zancada',
    'Sentadilla a una pierna con el pie trasero apoyado en un banco.',
    ['Apoya el empeine del pie trasero en un banco.', 'Adelanta el otro pie a una distancia cómoda.', 'Baja la rodilla trasera hacia el suelo.', 'Sube empujando con la pierna delantera.'],
    ['Rodilla delantera alineada con el pie.', 'Tronco ligeramente inclinado hacia adelante.'],
    ['Pie delantero demasiado cerca del banco.', 'Perder el equilibrio por ir rápido.']),
  E('zancada-inversa', 'Zancada inversa', ['zancada inversa', 'zancada hacia atras'], 'zancada',
    'Da un paso hacia atrás y baja la rodilla trasera.',
    ['De pie, da un paso largo hacia atrás.', 'Baja hasta que ambas rodillas queden flexionadas.', 'Empuja con la pierna delantera para volver.', 'Alterna o completa un lado según indique el entrenador.'],
    ['Tronco erguido.', 'Rodilla delantera sobre el pie.'],
    ['Golpear el suelo con la rodilla.']),
  E('zancada-caminando', 'Zancada caminando', ['zancada caminando', 'zancadas caminando'], 'zancada',
    'Zancadas avanzando hacia adelante, alternando las piernas.',
    ['Da un paso largo hacia adelante y baja la rodilla trasera.', 'Empuja y lleva la otra pierna adelante para la siguiente zancada.', 'Avanza de forma continua.'],
    ['Pasos controlados.'],
    ['Rodilla delantera hacia adentro.']),
  E('extension-rodilla', 'Extensión de rodilla en máquina', ['extension de rodilla sentado', 'extension de rodilla', 'extension de cuadriceps'], 'sin-ilustracion',
    'Sentado en la máquina, extiende las rodillas.',
    ['Ajusta el respaldo y el rodillo sobre los tobillos.', 'Extiende las rodillas hasta casi estirar las piernas.', 'Baja con control.'],
    ['Espalda apoyada.'],
    ['Dar patadas con impulso.']),
  E('sentarse-pared', 'Sentarse contra la pared', ['sentarse contra la pared', 'sentadilla en pared', 'sentadilla isometrica', 'wall sit'], 'pared',
    'Con la espalda apoyada en la pared, mantén la posición de sentadilla.',
    ['Apoya la espalda en la pared.', 'Desliza hacia abajo hasta que las rodillas queden flexionadas, como sentado en una silla.', 'Mantén la posición el tiempo indicado.'],
    ['Rodillas sobre los tobillos.', 'Espalda completamente apoyada.'],
    ['Pies demasiado cerca de la pared.']),
  E('prensa-piernas', 'Prensa de piernas', ['prensa de piernas', 'prensa'], 'sin-ilustracion',
    'En la máquina, empuja la plataforma con las piernas.',
    ['Siéntate con la espalda apoyada y los pies en la plataforma al ancho de la cadera.', 'Baja la plataforma flexionando las rodillas.', 'Empuja sin bloquear las rodillas.'],
    ['Espalda baja pegada al respaldo.'],
    ['Bloquear las rodillas arriba.', 'Despegar la cadera del asiento.']),
  E('flexor-cadera', 'Estiramiento del flexor de cadera medio arrodillado', ['estiramiento del flexor de cadera', 'flexor de cadera medio arrodillado', 'flexor de cadera'], 'flexor',
    'Con una rodilla en el suelo, lleva la cadera hacia adelante.',
    ['Apoya una rodilla en el suelo y el otro pie delante.', 'Aprieta el glúteo de la pierna de atrás.', 'Lleva la cadera suavemente hacia adelante hasta notar el estiramiento.', 'Cambia de pierna.'],
    ['Tronco erguido.'],
    ['Arquear la espalda baja.']),
  E('shinbox', 'Shinbox switch (90/90)', ['shinbox', 'shin box', '90/90'], 'sin-ilustracion',
    'Sentado con ambas rodillas flexionadas hacia un lado, gíralas al otro lado.',
    ['Siéntate con una pierna delante y otra al lado, ambas rodillas a unos 90 grados.', 'Manteniendo los pies apoyados, gira las rodillas hacia el otro lado.', 'Alterna de forma lenta y controlada.'],
    ['Tronco erguido; usa las manos de apoyo si lo necesitas.'],
    ['Hacerlo con prisa o forzando las rodillas.']),
  E('pica-sentado', 'Estiramiento de pica sentado', ['estiramiento de pica sentado', 'pica sentado'], 'sin-ilustracion',
    'Sentado con las piernas estiradas, inclínate hacia los pies.',
    ['Siéntate con las piernas juntas y estiradas.', 'Inclina el tronco hacia adelante desde la cadera.', 'Lleva las manos hacia los pies hasta donde sea cómodo.'],
    ['Espalda larga.'],
    ['Rebotar.']),
  E('figura-cuatro', 'Estiramiento de glúteo en figura cuatro', ['figura cuatro', 'forma de cuatro'], 'sin-ilustracion',
    'Boca arriba, cruza un tobillo sobre la rodilla contraria y acerca las piernas.',
    ['Acuéstate boca arriba con las rodillas flexionadas.', 'Cruza un tobillo sobre la rodilla contraria.', 'Sujeta el muslo de la pierna de apoyo y acércalo al pecho.', 'Cambia de lado.'],
    ['Cabeza y hombros relajados en el suelo.'],
    ['Forzar la rodilla cruzada.']),
  E('thomas', 'Estiramiento de Thomas', ['thomas stretch', 'estiramiento de thomas'], 'sin-ilustracion',
    'Acostado en el borde de un banco, abraza una rodilla y deja colgar la otra pierna.',
    ['Siéntate en el borde de un banco y túmbate boca arriba.', 'Abraza una rodilla hacia el pecho.', 'Deja colgar la otra pierna relajada.', 'Cambia de lado.'],
    ['Zona lumbar apoyada.'],
    ['Arquear la espalda.']),
);

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
