import { importText, parseDuration } from './importer';
import { findLib } from './library';
import { SAMPLE_TEXT, defaultState, ensurePlanSessions, sampleRoutine } from './model';
import { compliance, streak } from './progress';
import { buildSteps, estimateSeconds, findIssues } from './sequence';
import { parseYouTubeId, parseYouTubeStart } from './youtube';

const ORIGINAL = `"Cardio y abdomen — casa o gimnasio"

1. Calentamiento
- 3 rondas.
- Círculos de cadera de pie: 30 segundos.
- Círculos de brazos: 30 segundos.
- Saltos suaves: 1 minuto.

2. Abdomen — circuito
- 3 rondas.
- 30 segundos por ejercicio.
- 10 segundos de descanso entre ejercicios.
- 1 minuto de descanso entre rondas.
- Ejercicios:
  a. Tocarse los dedos del pie en decúbito supino.
  b. Crujido de rana.
  c. Escalador de montaña.
  d. Palanca de pierna.
  e. V-ups.
  f. Plancha de antebrazos.

3. Cardio — caminadora
- 20 minutos.
- Velocidad objetivo: 3,5; permitir configurar la unidad.
- Inclinación: mostrar “máxima” como un dato pendiente de definir por el entrenador, no convertirlo automáticamente en un valor.

4. Enfriamiento
- Estiramiento de la vía anterior: 1 minuto.
- Estiramiento de hombros en caja: 1 minuto.
- Estiramiento de cobra: 20 segundos.`;

describe('YouTube', () => {
  it('extrae el ID de distintos formatos', () => {
    const id = 'dQw4w9WgXcQ';
    for (const u of [
      id,
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?t=10`,
      `youtube.com/shorts/${id}`,
      `https://m.youtube.com/watch?feature=share&v=${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
    ])
      expect(parseYouTubeId(u)).toBe(id);
  });
  it('rechaza lo que no es YouTube', () => {
    expect(parseYouTubeId('https://vimeo.com/123')).toBeNull();
    expect(parseYouTubeId('hola')).toBeNull();
    expect(parseYouTubeId('https://youtube.com/watch?v=corto')).toBeNull();
    expect(parseYouTubeId('')).toBeNull();
  });
  it('lee el segundo de inicio', () => {
    expect(parseYouTubeStart('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(90);
    expect(parseYouTubeStart('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toBe(90);
  });
});

describe('Duraciones', () => {
  it('interpreta textos comunes', () => {
    expect(parseDuration('30 segundos')).toBe(30);
    expect(parseDuration('1 minuto')).toBe(60);
    expect(parseDuration('20 minutos.')).toBe(1200);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1 min 30 s')).toBe(90);
    expect(parseDuration('Plancha')).toBeNull();
  });
});

describe('Biblioteca', () => {
  it('reconoce ejercicios por alias', () => {
    expect(findLib('Escalador de montaña')?.key).toBe('escalador');
    expect(findLib('Giros de cintura')).toBeNull();
    expect(findLib('Estiramiento de la vía anterior')?.pending).toBeTruthy();
  });
});

describe('Importador', () => {
  for (const [label, text] of [
    ['texto original', ORIGINAL],
    ['texto de ejemplo', SAMPLE_TEXT],
  ] as const) {
    it(`estructura la rutina (${label})`, () => {
      const { routine } = importText(text);
      expect(routine.name).toBe('Cardio y abdomen');
      expect(routine.place.toLowerCase()).toBe('casa o gimnasio');
      expect(routine.blocks.map((b) => b.kind)).toEqual(['calentamiento', 'circuito', 'cardio', 'enfriamiento']);
      const [warm, abs, cardio, cool] = routine.blocks;
      expect(warm.rounds).toBe(3);
      expect(warm.exercises.map((e) => e.seconds)).toEqual([30, 30, 60]);
      expect(abs.rounds).toBe(3);
      expect(abs.restBetweenExercises).toBe(10);
      expect(abs.restBetweenRounds).toBe(60);
      expect(abs.exercises).toHaveLength(6);
      expect(abs.exercises.every((e) => e.seconds === 30)).toBe(true);
      expect(abs.exercises.filter((e) => e.review).map((e) => e.libKey)).toEqual(['palanca-pierna']);
      expect(cardio.exercises).toHaveLength(1);
      const tm = cardio.exercises[0];
      expect(tm.libKey).toBe('caminadora');
      expect(tm.seconds).toBe(1200);
      const speed = tm.params.find((p) => /velocidad/i.test(p.label))!;
      expect(speed.value).toBe('3,5');
      expect(speed.unit).toBe('');
      expect(speed.pending).toBe(true);
      expect(speed.unitOptions).toEqual(['km/h', 'mph']);
      const incl = tm.params.find((p) => /inclinaci/i.test(p.label))!;
      expect(incl.value).toBe('máxima');
      expect(incl.pending).toBe(true);
      expect(cool.exercises.map((e) => e.seconds)).toEqual([60, 60, 20]);
      // los estiramientos ambiguos no se inventan
      expect(cool.exercises[0].review).toBeTruthy();
      expect(cool.exercises[0].steps).toEqual([]);
      expect(cool.exercises[1].review).toBeTruthy();
      expect(cool.exercises[2].libKey).toBe('cobra');
      expect(cool.exercises[2].review).toBeNull();
    });
  }

  it('marca ejercicios desconocidos y sin duración', () => {
    const { routine } = importText('Piernas\n- Movimiento raro inventado\n- Plancha: 40 s\n- Escalador 12 repeticiones');
    const ex = routine.blocks[0].exercises;
    expect(ex[0].review).toMatch(/no reconocido/);
    expect(ex[0].review).toMatch(/Falta/);
    expect(ex[1].seconds).toBe(40);
    expect(ex[2].mode).toBe('reps');
    expect(ex[2].reps).toBe(12);
  });
});

describe('Secuencia', () => {
  it('genera pasos y duración estimada de la rutina de ejemplo', () => {
    const r = sampleRoutine();
    const steps = buildSteps(r);
    const work = steps.filter((s) => s.kind === 'trabajo');
    expect(work).toHaveLength(9 + 18 + 1 + 3);
    // abdomen: 5 descansos de 10 s por ronda y 2 descansos entre rondas
    const absRests = steps.filter((s) => s.blockIdx === 1 && s.kind === 'descanso');
    expect(absRests).toHaveLength(15 + 2);
    expect(estimateSeconds(r)).toBe(360 + 690 + 120 + 1200 + 140);
  });
  it('lista los datos pendientes', () => {
    const issues = findIssues(sampleRoutine());
    expect(issues.filter((i) => i.kind === 'parametro')).toHaveLength(2);
    expect(issues.filter((i) => i.kind === 'ejercicio')).toHaveLength(3);
  });
});

describe('Plan y cumplimiento', () => {
  it('programa las sesiones del plan semanal sin duplicarlas', () => {
    const s0 = defaultState();
    const s1 = ensurePlanSessions(s0, '2026-11-04');
    expect(s1.sessions.length).toBe(9); // lun, mié, vie durante 3 semanas
    expect(s1.sessions[0].date).toBe('2026-11-02');
    const s2 = ensurePlanSessions(s1, '2026-11-04');
    expect(s2.sessions.length).toBe(9);
    // una sesión eliminada no se recrea
    const s3 = ensurePlanSessions({ ...s2, sessions: s2.sessions.slice(1) }, '2026-11-04');
    expect(s3.sessions.length).toBe(8);
  });
  it('la racha no se rompe por sesiones pendientes', () => {
    const s = defaultState();
    const mk = (date: string, status: 'completada' | 'pendiente' | 'omitida') => ({ id: date, routineId: 'r', date, time: '', status, rescheduledFrom: [] });
    expect(streak([mk('2026-11-01', 'completada'), mk('2026-11-02', 'pendiente'), mk('2026-11-03', 'completada')], '2026-11-04')).toBe(2);
    expect(streak([mk('2026-11-01', 'completada'), mk('2026-11-02', 'omitida'), mk('2026-11-03', 'completada')], '2026-11-04')).toBe(1);
    const c = compliance({ ...s, sessions: [mk('2026-11-02', 'completada'), mk('2026-11-04', 'pendiente')] }, '2026-11-04');
    expect(c.done).toBe(1);
    expect(c.pending).toBe(1);
  });
});

describe('Inicio de entrenamiento', () => {
  it('reutiliza la sesión pendiente de hoy', async () => {
    const { startWorkout } = await import('./actions');
    const { todayISO } = await import('./dates');
    const s0 = defaultState();
    const r = s0.routines[0];
    const s = { ...s0, sessions: [{ id: 'x', routineId: r.id, date: todayISO(), time: '18:00', status: 'pendiente' as const, rescheduledFrom: [] }] };
    const s1 = startWorkout(s, r.id, null);
    expect(s1.sessions).toHaveLength(1);
    expect(s1.sessions[0].status).toBe('en_curso');
    expect(s1.active?.sessionId).toBe('x');
  });
});

describe('Rutinas del entrenador (nombres en inglés)', () => {
  it('reconoce las rutinas en inglés sin líneas perdidas', async () => {
    const { importMany } = await import('./importer');
    const { TRAINER_TEXT } = await import('./data/trainerText');
    const text = `${TRAINER_TEXT}\n\nHola Mayra,\n\nNo hiciste tu entrenamiento programado para el sábado 6 de abril de 2024.\n\n${TRAINER_TEXT.slice(TRAINER_TEXT.indexOf('femoral casa'))}`;
    const r = importMany(text);
    expect(r.results.map((x) => `${x.routine.name} · ${x.routine.place}`)).toEqual([
      'Cuadriceps · Gimnasio',
      'Pierna/cuadriceps · Casa',
      'Espalda y hombro y abdomen · Gimnasio',
      'Brazos y abdomen · Gimnasio',
      'Tren superior · Casa',
      'Cardio y abdomen · Casa o gimnasio',
      'Gluteo · Gimnasio',
      'Gluteo · Casa',
      'Tren superior (versión 2) · Casa',
      'Femoral · Casa',
    ]);
    expect(r.ignored).toHaveLength(2);
    expect(r.duplicates).toEqual(['Femoral']);
    expect(r.results.every((x) => x.unparsed.length === 0)).toBe(true);
  });
  it('interpreta superseries, series de calentamiento, rangos y parámetros', async () => {
    const { trainerRoutines } = await import('./seed');
    const all = trainerRoutines();
    const espalda = all.find((r) => r.name.startsWith('Espalda'))!;
    expect(espalda.blocks[0]).toMatchObject({ kind: 'calentamiento', title: 'Calentamiento', rounds: 3 });
    expect(espalda.blocks[0].exercises.map((e) => e.libKey)).toEqual(['circulos-cadera', 'circulos-brazos', 'saltos-suaves']);
    const warm = espalda.blocks[1];
    expect(warm.rounds).toBe(2);
    expect(warm.exercises[0].review).toMatch(/no indicadas/);
    const a = espalda.blocks[2];
    expect(a).toMatchObject({ rounds: 4, restBetweenRounds: 60 });
    expect(a.exercises[0]).toMatchObject({ name: 'Reverse Grip Lat Pulldown', reps: 12, repsMax: 15, restAfter: 0, libKey: 'jalon-pecho' });
    expect(a.exercises[0].params[0]).toMatchObject({ value: '30–40', unit: 'lb' });
    const tm = espalda.blocks.find((b) => b.kind === 'cardio')!.exercises[0];
    expect(tm.params.find((p) => p.label === 'Velocidad')).toMatchObject({ value: '3–3,5', pending: true });
    expect(tm.params.find((p) => p.label === 'Inclinación')).toMatchObject({ value: 'máxima', pending: true });
    expect(espalda.blocks[espalda.blocks.length - 1]).toMatchObject({ kind: 'enfriamiento', title: 'Enfriamiento' });
    const cardio = all.find((r) => r.name === 'Cardio y abdomen')!;
    expect(cardio.blocks[1].exercises.map((e) => e.libKey)).toEqual(['toe-touch-supino', 'crujido-rana', 'escalador', 'palanca-pierna', 'v-ups', 'plancha-antebrazos']);
    expect(cardio.blocks[2].exercises[0].params.find((p) => p.label === 'Inclinación')?.value).toBe('máxima');
    const tren = all.find((r) => r.name === 'Tren superior')!;
    const abs = tren.blocks.find((b) => b.title === 'H · Abs')!;
    expect(abs).toMatchObject({ kind: 'circuito', rounds: 3, restBetweenExercises: 10, restBetweenRounds: 60 });
    expect(abs.exercises[0].review).toMatch(/por confirmar/); // knee slide crunch
    expect(abs.exercises.filter((e) => e.review).map((e) => e.libKey)).toEqual(['knee-slide-crunch', 'palanca-pierna']);
    const box = all.find((r) => r.name === 'Pierna/cuadriceps')!.blocks.flatMap((b) => b.exercises).find((e) => e.name === 'Box Step-Up')!;
    expect(box.libKey).toBe('box-step-up');
    expect(box.coachNotes).toMatch(/superficie alta/);
    const brazos = all.find((r) => r.name === 'Brazos y abdomen')!;
    expect(brazos.blocks[0].exercises[0]).toMatchObject({ libKey: 'caminadora', seconds: 300 });
  });
  it('reemplaza la versión en español sin duplicar y conserva las editadas', async () => {
    const { withSeeds, trainerRoutines, TRAINER_DESC } = await import('./seed');
    const fresh = withSeeds(defaultState());
    expect(fresh.routines).toHaveLength(10);
    expect(fresh.routines.some((r) => r.sample)).toBe(false);
    expect(fresh.routines.some((r) => r.id === fresh.reminders.routineId)).toBe(true);
    expect(withSeeds(fresh).routines).toHaveLength(10);
    // instalación anterior con rutinas en español
    const base = defaultState();
    const oldGlu = { ...trainerRoutines().find((r) => r.name === 'Gluteo' && r.place === 'Casa')!, name: 'Gluteo', id: 'old1', description: TRAINER_DESC };
    const oldCua = { ...trainerRoutines()[0], name: 'Cuádriceps', id: 'old2', description: TRAINER_DESC, updatedAt: 'editada' };
    const prev = { ...base, routines: [...base.routines, oldGlu, oldCua], seeds: ['entrenador-2024'], sessions: [{ id: 's', routineId: 'old1', date: '2026-11-05', time: '', status: 'pendiente' as const, rescheduledFrom: [] }] };
    const next = withSeeds(prev);
    expect(next.routines.find((r) => r.id === 'old1')).toBeUndefined();
    expect(next.routines.find((r) => r.id === 'old2')?.name).toBe('Cuádriceps (español)');
    expect(next.routines).toHaveLength(11);
    const ses = next.sessions[0];
    expect(next.routines.find((r) => r.id === ses.routineId)?.name).toBe('Gluteo');
  });
});

describe('Nombres en inglés', () => {
  it('pone mayúsculas solo a los nombres en inglés', async () => {
    const { englishTitle } = await import('./importer');
    expect(englishTitle('Deep squat hold')).toBe('Deep Squat Hold');
    expect(englishTitle('Supine leg raise on flat bench')).toBe('Supine Leg Raise on Flat Bench');
    expect(englishTitle('Sentadilla sumo')).toBe('Sentadilla sumo');
    expect(englishTitle('Flexiones en banco')).toBe('Flexiones en banco');
  });
});

describe('Fichas visuales de los ejercicios', () => {
  const LIST = [
    ['Standing Hip Circle', 'círculo de cadera de pie'], ['Arm Circle', 'círculo de brazos'], ['Skipping', 'saltos suaves'],
    ['Half Kneeling Hip Flexor Stretch', 'estiramiento del flexor de cadera medio arrodillado'], ['Deep Squat Hold', 'sentadilla profunda sostenida'],
    ['5 Way Hips', 'movilidad de cadera en cinco direcciones'], ['Shinbox Switch', 'shinbox switch'], ['Anterior Pathway Stretch', 'estiramiento de la vía anterior'],
    ['Dynamic Straddle Stretch', 'estiramiento dinámico de piernas separadas'], ['Seated Pike Stretch', 'estiramiento de pica sentado'],
    ['Supine Figure Four Glute Stretch', 'estiramiento de glúteos en figura cuatro'], ['Thomas Stretch', 'thomas stretch'],
    ['Box Shoulder Stretch', 'estiramiento de hombros en caja'], ['Cobra Stretch', 'estiramiento de cobra'],
    ['Reverse Grip Lat Pulldown', 'jalón al pecho con agarre inverso'], ['Dumbbell Lateral Raise', 'elevación lateral con mancuernas'],
    ['Bent Over Supinated Dumbbell Row', 'remo inclinado con mancuernas y agarre supino'], ['Dumbbell Front Raise', 'elevación frontal con mancuernas'],
    ['Chest Supported Dumbbell Row', 'remo con mancuernas con apoyo en el pecho'], ['Back Supported Dumbbell Shoulder Press', 'press de hombros con mancuernas y espalda apoyada'],
    ['V-Up', 'abdominal en V'], ['Supine Leg Raise on Flat Bench', 'elevación de piernas en decúbito supino sobre banco plano'],
    ['Bodyweight Russian Twist', 'giro ruso con peso corporal'], ['Forearm Plank', 'plancha de antebrazos'],
    ['Concentration Curl', 'curl de concentración'], ['Bench Push-Up', 'flexión con manos apoyadas en banco'], ['Hammer Curl', 'curl de martillo'],
    ['Standing Rope Triceps Extension', 'extensión de tríceps con cuerda de pie'], ['Alternating Dumbbell Biceps Curl', 'curl alterno de bíceps'],
    ['Seated Overhead Dumbbell Triceps Extension', 'extensión de tríceps por encima de la cabeza sentado'], ['Mountain Climber', 'escalador de montaña'],
    ['Leg Lever', 'palanca de pierna'], ['Treadmill', 'caminadora'], ['Sumo Squat', 'sentadilla sumo'], ['Barbell Hip Thrust', 'empuje de cadera con barra'],
    ['Heels-Elevated Goblet Squat', 'sentadilla goblet con talones elevados'], ['Kettlebell Glute Bridge', 'puente de glúteos con pesa rusa'],
    ['Dumbbell Step-Up', 'subida al escalón con mancuernas'], ['Shoulders-Elevated Single-Leg Hip Bridge', 'puente a una pierna con hombros elevados'],
    ['Seated Knee Extension', 'extensión de rodilla sentado en máquina'], ['Wall Sit', 'sentadilla isométrica contra la pared'], ['Seated Leg Press', 'prensa de piernas sentado'],
    ['Bodyweight Deficit Hip Thrust', 'empuje de cadera desde déficit con peso corporal'], ['Single-Leg Glute Bridge', 'puente de glúteos a una pierna'],
    ['Rear-Foot-Elevated Split Squat', 'sentadilla dividida con el pie trasero elevado'], ['Banded Seated Hip Abduction', 'abducción de cadera sentado con banda'],
    ['Reverse Lunge', 'zancada inversa'], ['Single-Leg Eccentric Squat', 'sentadilla excéntrica a una pierna'], ['Glute Bridge', 'puente de glúteos'],
    ['Box Step-Up', 'subida a un escalón'], ['Jump Squat', 'sentadilla con salto'], ['Seated Leg Extension with Mini Band', 'extensión de rodilla sentado con minibanda'],
    ['Single-Leg Box Hamstring Curl', 'flexión de isquiotibiales a una pierna con caja'], ['Mini Band Deadlift', 'peso muerto con minibanda'],
    ['Banded Glute Bridge Hip Abduction', 'puente de glúteos con abducción y banda'], ['Walking Lunge', 'zancada caminando'],
    ['Mini-Banded Biceps Curl', 'curl de bíceps con minibanda'], ['Mini-Band Overhead Triceps Extension', 'extensión de tríceps sobre la cabeza con banda'],
    ['Bench Dip', 'fondos de tríceps en banco'], ['Knee Push-Up', 'flexión con apoyo en rodillas'], ['Plank Walkout', 'caminata de manos desde plancha'],
    ['Banded Pull-Apart', 'apertura de banda'], ['Jumping Jacks', 'saltos de tijera'], ['Knee Slide Crunch', 'abdominal deslizando la rodilla'],
    ['Supine Toe Touch', 'toque de puntas de los pies acostado'], ['Frog Crunch', 'abdominal de rana'],
  ];
  const PENDING = ['5 Way Hips', 'Shinbox Switch', 'Anterior Pathway Stretch', 'Box Shoulder Stretch', 'Leg Lever', 'Single-Leg Box Hamstring Curl', 'Mini Band Deadlift', 'Knee Slide Crunch'];

  it('cada ejercicio tiene ficha con gráfico; inglés y español abren la misma', async () => {
    const { ANIMS } = await import('./poses');
    for (const [en, es] of LIST) {
      const a = findLib(en);
      const b = findLib(es);
      expect(a, en).toBeTruthy();
      expect(b?.key, `${es} → ${a?.key}`).toBe(a!.key);
      expect(ANIMS[a!.pose], `gráfico de ${en}`).toBeTruthy();
      if (PENDING.includes(en)) {
        expect(a!.pending, en).toBeTruthy();
        expect(a!.steps).toEqual([]);
        expect(ANIMS[a!.pose].pending).toBe(true);
      } else {
        expect(a!.pending, en).toBeFalsy();
        expect(a!.start.length, `posición inicial de ${en}`).toBeGreaterThan(5);
        expect(a!.steps.length, `ejecución de ${en}`).toBeGreaterThan(0);
        expect(ANIMS[a!.pose].pending, `${en} no usa el dibujo neutral`).toBeFalsy();
        expect(ANIMS[a!.pose].arrows.length + (ANIMS[a!.pose].frames.length > 1 ? 1 : 0), `${en} con flechas`).toBeGreaterThan(0);
      }
    }
  });

  it('la sincronización actualiza el gráfico sin tocar series, repeticiones ni tiempos', async () => {
    const { syncExercise, newExercise } = await import('./model');
    const old = newExercise({ name: 'Leg Lever', libKey: 'palanca-pierna', mode: 'reps', reps: 20, perSide: 'a cada lado', steps: ['paso inventado'], pose: 'palanca', restAfter: 0 });
    const s = syncExercise(old);
    expect(s).toMatchObject({ name: 'Leg Lever', reps: 20, perSide: 'a cada lado', restAfter: 0, pose: 'pendiente', steps: [] });
    expect(s.review).toMatch(/Descripción por confirmar/);
    const wall = syncExercise(newExercise({ name: 'Wall Sit', libKey: 'sentarse-pared', seconds: 50, review: 'Falta algo.' }));
    expect(wall).toMatchObject({ seconds: 50, pose: 'pared', review: 'Falta algo.' });
    expect(wall.start).toMatch(/pared/);
    // lo editado a mano se respeta
    const mine = syncExercise(newExercise({ name: 'Leg Lever', libKey: 'palanca-pierna', custom: true, steps: ['mi versión'] }));
    expect(mine.steps).toEqual(['mi versión']);
  });

  it('la ficha editada por el entrenador se aplica a todos los nombres equivalentes', async () => {
    const { applyExerciseContent } = await import('./actions');
    const { withSeeds } = await import('./seed');
    const { syncLibrary, contentFields } = await import('./model');
    const s0 = syncLibrary(withSeeds(defaultState()));
    const content = { ...contentFields({ pose: 'palanca', start: 'Boca arriba.', steps: ['Eleva ambas piernas juntas.'] }) } as never;
    const s1 = applyExerciseContent(s0, 'palanca-pierna', content, { confirm: true });
    const levers = s1.routines.flatMap((r) => r.blocks.flatMap((b) => b.exercises)).filter((e) => e.libKey === 'palanca-pierna');
    expect(levers.length).toBeGreaterThan(2);
    expect(levers.every((e) => e.steps[0] === 'Eleva ambas piernas juntas.' && !e.review && e.pose === 'palanca')).toBe(true);
    expect(s1.exerciseLib?.['palanca-pierna']).toBeTruthy();
  });
});
