/**
 * Convierte instrucciones en texto libre en rutinas estructuradas.
 * Regla principal: no se inventa nada. Lo que no se reconoce se marca para confirmar
 * y las indicaciones que no se pueden convertir en datos se guardan tal cual como notas.
 *
 * Formatos admitidos (se pueden mezclar):
 *  - Encabezados numerados: «1. Calentamiento», «2. Abdomen — circuito».
 *  - Encabezados de sección: «Calentamiento:», «Enfriarse:».
 *  - Grupos con letra: «A1) Jalón al pecho», «A2) Elevación lateral» (superserie en el mismo bloque).
 *  - Duración delante o detrás: «0:30 segundos círculo de brazos», «Saltando 1:00 minuto», «Plancha: 30 s».
 *  - Rondas, rangos de repeticiones, «por pierna», pesos en lb/kg, bandas, velocidad e inclinación.
 *  - «de seguido al siguiente ejercicio» (sin descanso), «1 minuto de descanso entre series».
 *  - Varias rutinas seguidas: cada una empieza con su título justo antes de «Calentamiento».
 */
import { findLib, norm } from './library';
import { Block, BlockKind, Exercise, Param, Routine, fromLib, newBlock, newExercise, newParam, newRoutine } from './model';

export interface ImportResult {
  routine: Routine;
  /** Líneas que no se pudieron interpretar. */
  unparsed: string[];
  /** Avisos generales. */
  warnings: string[];
}

export interface ImportManyResult {
  results: ImportResult[];
  /** Mensajes que no son instrucciones (p. ej. avisos de sesiones no realizadas). */
  ignored: string[];
  /** Rutinas repetidas en el texto que se importaron una sola vez. */
  duplicates: string[];
}

const UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(horas?|h|minutos?|mins?|m|segundos?|segs?|s|")(?![a-z])/g;
const CLOCK_RE = /\b(\d{1,2}):(\d{2})\b/;

/** Duración en segundos a partir de "30 segundos", "1 minuto", "1:30", "0:30 segundos", "1 min 30 s". */
export function parseDuration(text: string): number | null {
  const t = norm(text);
  const clock = t.match(CLOCK_RE);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  let total = 0;
  let found = false;
  for (const m of t.matchAll(UNIT_RE)) {
    const n = Number(m[1].replace(',', '.'));
    const u = m[2];
    found = true;
    if (u.startsWith('h')) total += n * 3600;
    else if (u.startsWith('m')) total += n * 60;
    else total += n;
  }
  return found ? Math.round(total) : null;
}

/** Quita la expresión de duración de una línea ("0:30 segundos de sentadilla" → "de sentadilla"). */
function stripDuration(text: string) {
  return text
    .replace(/\b\d{1,2}:\d{2}\b\s*(segundos?|minutos?|segs?|mins?|s)?\.?/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(segundos?|minutos?|horas?|segs?|mins?)\b\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SIDE_RE = /\b(por pierna|por lado|a cada lado|cada lado|por brazo|por cada pierna|cada pierna)\b/i;

interface RepInfo {
  reps: number;
  repsMax: number | null;
  repUnit: string;
  perSide: string;
}
function parseReps(text: string): RepInfo | null {
  const t = norm(text);
  const m = t.match(/(\d+)(?:\s*(?:-|a|–)\s*(\d+))?\s*(repeticiones|repeticion|reps|rep|pasos)\b/);
  if (!m) return null;
  const side = t.match(SIDE_RE);
  return {
    reps: Number(m[1]),
    repsMax: m[2] ? Number(m[2]) : null,
    repUnit: m[3] === 'pasos' ? 'pasos' : '',
    perSide: side ? side[1].replace('cada pierna', 'por pierna').replace(/^cada lado$/, 'a cada lado') : '',
  };
}

export function blockKindOf(text: string): BlockKind {
  const t = norm(text);
  if (/calentamiento|activacion|movilidad|warm ?-?up/.test(t)) return 'calentamiento';
  if (/enfriamiento|enfriarse|estiramiento|vuelta a la calma|relajacion|cool ?-?down/.test(t)) return 'enfriamiento';
  if (/cardio|caminadora|treadmill|cinta de correr|bicicleta|eliptica|correr|trote|remo ergometro/.test(t)) return 'cardio';
  if (/circuito|abdomen|abdominal|\babs\b|core|hiit|tabata/.test(t)) return 'circuito';
  if (/fuerza|pesas|piernas|gluteo|brazos|espalda|pecho|tren (superior|inferior)/.test(t)) return 'fuerza';
  return 'otro';
}

const BULLET_RE = /^\s*(?:[-•*·–]|[a-z][.]|\d+[.)])\s+/i;
const NUM_HEADER_RE = /^\s*(\d+)[.)]\s+(.+)$/;
const LETTER_RE = /^\s*([A-Za-z])(\d*)\)\s*(.+)$/;
const SECTION_RE = /^(calentamiento|warm ?-?up|cool ?-?down|enfriamiento|enfriarse|estiramientos?|vuelta a la calma|cardio|abdomen|circuito|fuerza)\s*:?\s*$/;
/** Avisos que no forman parte de la rutina (se ignoran). */
const IGNORE_RE = /^(hola\b.*|.*\bno hiciste\b.*|.*\bte perdiste\b.*|.*\bno realizaste\b.*)$/;
const GENERIC_BLOCK_NAMES = ['abdomen', 'abdominales', 'abs', 'circuito', 'core', 'cardio', 'fuerza', 'calentamiento', 'enfriamiento'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const numEs = (s: string) => s.replace('.', ',');

/** Título y lugar: «gimnasio de brazos y abdomen» → Brazos y abdomen · Gimnasio. */
export function splitTitle(line: string): { name: string; place: string } {
  let t = line.trim().replace(/^["“]|["”]$/g, '').trim();
  const dash = t.split(/\s[—–]\s/);
  if (dash.length > 1) return { name: cap(dash[0].trim()), place: cap(dash.slice(1).join(' — ').trim()) };
  let place = '';
  const tail = t.match(/\s+(casa o gimnasio|casa o gym|gimnasio o casa|gym o casa|en casa|en el gimnasio|gimnasio|gym|casa)$/i);
  if (tail) {
    place = tail[1].replace(/^en (el )?/i, '');
    t = t.slice(0, tail.index).trim();
  } else {
    const head = t.match(/^(gimnasio|gym|casa)\s+(de\s+)?/i);
    if (head && t.length > head[0].length) {
      place = head[1];
      t = t.slice(head[0].length).trim();
    }
  }
  return { name: cap(t), place: cap(place.replace(/\bgym\b/i, 'gimnasio')) };
}

/** Parámetros: velocidad, inclinación, peso, banda. Devuelve null si la línea no es un parámetro. */
function parseParamLine(line: string, isMachine: boolean): Param | null {
  const raw = line.trim().replace(/\.$/, '');
  const n = norm(raw);
  // velocidad: 3,5 / velocidad 3/3.5 / Velocidad objetivo: 3,5; permitir…
  const kv = (re: RegExp) => {
    if (!re.test(n)) return null;
    const i = raw.indexOf(':');
    if (i > 0) return [raw.slice(0, i), raw.slice(i + 1)] as const;
    const sp = raw.search(/\s/);
    return sp > 0 ? ([raw.slice(0, sp), raw.slice(sp + 1)] as const) : null;
  };
  let m = kv(/^velocidad\b/);
  if (m) return speedOrIncline(m[0], m[1], true);
  m = kv(/^inclinacion\b/);
  if (m) return speedOrIncline(m[0], m[1], false);
  // «elevación máxima» en una caminadora = inclinación
  if (isMachine && /^elevacion\s+(maxima|max|minima|\d)/.test(n)) {
    const p = speedOrIncline('Inclinación', raw.replace(/^elevaci[oó]n\s*/i, ''), false);
    p.note = `${p.note ?? ''} Texto original: «${raw}».`.trim();
    return p;
  }
  // peso: «mancuernas 5 lb», «20 libras», «peso de 30-40 lb», «mancuernas de 20 a 30 libras», «barra de 30 lb»
  const w = n.match(/(\d+(?:[.,]\d+)?)(?:\s*(?:-|a|–)\s*(\d+(?:[.,]\d+)?))?\s*(lb|lbs|libras?|kg|kilos?)\b/);
  if (w && !/repeticion|reps\b/.test(n)) {
    const unit = /^k/.test(w[3]) ? 'kg' : 'lb';
    const impl = /pesa rusa/.test(n) ? 'pesa rusa' : /mancuernas/.test(n) ? 'mancuernas' : /mancuerna/.test(n) ? 'mancuerna' : /barra/.test(n) ? 'barra' : '';
    return newParam({
      label: impl ? `Peso (${impl})` : 'Peso',
      value: numEs(w[1]) + (w[2] ? `–${numEs(w[2])}` : ''),
      unit,
      unitOptions: ['lb', 'kg'],
      pending: false,
    });
  }
  // bandas: «banda fuerte», «banda en las piernas»
  if (/\b(mini)?bandas?\b/.test(n) && n.split(' ').length <= 6) {
    return newParam({ label: 'Banda', value: /fuerte|media|suave|ligera/.test(n) ? (n.match(/fuerte|media|suave|ligera/)![0]) : raw, unit: '', pending: false });
  }
  return null;
}

function speedOrIncline(label: string, rest: string, isSpeed: boolean): Param {
  const cleanLabel = (cap(label.trim().replace(/[:\s]+$/, '')) || (isSpeed ? 'Velocidad' : 'Inclinación')).replace(/^Inclinacion/, 'Inclinación');
  const r = rest.trim().replace(/\.$/, '');
  const quoted = r.match(/[“"«]([^”"»]+)[”"»]/);
  const num = r.match(/^(\d+(?:[.,]\d+)?)(?:\s*(?:\/|-|a|–)\s*(\d+(?:[.,]\d+)?))?\s*(km\/h|kmh|mph|%)?/i);
  if (num) {
    const unit = (num[3] ?? '').toLowerCase().replace('kmh', 'km/h');
    const value = numEs(num[1]) + (num[2] ? `–${numEs(num[2])}` : '');
    const rest2 = r.slice(num[0].length).replace(/^[;,.\s]+/, '');
    const needsUnit = isSpeed && !unit;
    return newParam({
      label: cleanLabel,
      value,
      unit: unit || (isSpeed ? '' : unit),
      unitOptions: isSpeed ? ['km/h', 'mph'] : undefined,
      pending: needsUnit,
      note: needsUnit ? 'Elige la unidad (km/h o mph).' : rest2 ? `Indicación original: ${rest2}` : undefined,
    });
  }
  const value = quoted ? quoted[1] : /m[aá]xim|^max\b/i.test(r) ? 'máxima' : /m[ií]nim/i.test(r) ? 'mínima' : r;
  return newParam({ label: cleanLabel, value, unit: '', pending: true, note: 'Dato pendiente de definir por el entrenador (no es un valor numérico).' });
}

const ES_WORDS = /\b(de|del|con|en|la|el|los|las|y|por|al|sin|una?)\b/i;
const EN_WORDS =
  /\b(squat|stretch|hold|hips?|curl|row|raise|press|bridge|lunge|plank|crunch|lever|toe|touch|twist|climber|ups?|circle|skipping|jacks|dip|push|pull|extension|walkouts?|way|deadlift|leg|arm|treadmill|sit|wall|frog|mountain|single|seated|banded|supine|box|step|glute|knee|shoulders?|thrust|abduction|switch|straddle|pike|pathway|cobra|thomas)\b/i;
const EN_SMALL = new Set(['on', 'with', 'and', 'of', 'to', 'the', 'a']);
/** «deep squat hold» → «Deep Squat Hold» (solo nombres en inglés; los españoles se dejan igual). */
export function englishTitle(name: string) {
  if (/[áéíóúñü]/i.test(name) || ES_WORDS.test(name) || !/^[\w\s'’/-]+$/.test(name) || !EN_WORDS.test(name)) return name;
  return name
    .split(' ')
    .map((w, i) => (i > 0 && EN_SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function makeExercise(rawName: string, seconds: number | null, rep: RepInfo | null): Exercise {
  let name = rawName.replace(/[.:;,\s]+$/, '').replace(/^(de|del|en la|en el|en)\s+/i, '').trim();
  const side = name.match(SIDE_RE);
  let perSide = rep?.perSide ?? '';
  if (side) {
    perSide = perSide || side[1].toLowerCase();
    name = name.replace(SIDE_RE, '').replace(/\s+/g, ' ').trim();
  }
  name = englishTitle(cap(name));
  const lib = findLib(name);
  const mode: Exercise['mode'] = rep && seconds == null ? 'reps' : 'tiempo';
  const base: Partial<Exercise> = {
    name,
    mode,
    seconds: mode === 'tiempo' ? seconds : null,
    reps: rep?.reps ?? null,
    repsMax: rep?.repsMax ?? null,
    repUnit: rep?.repUnit ?? '',
    perSide,
  };
  if (lib) return fromLib(lib, base);
  return newExercise({ ...base, pose: 'generico', review: 'Ejercicio no reconocido: confirma el movimiento y añade las instrucciones.' });
}

/** Serie dentro de un ejercicio con letra (puede haber series de calentamiento y series de trabajo). */
interface SetSpec {
  rounds: number;
  warm: boolean;
  seconds: number | null;
  rep: RepInfo | null;
  params: Param[];
}
interface PendingEx {
  name: string;
  sets: SetSpec[];
  notes: string[];
  noRestAfter: boolean;
  /** Descanso indicado justo después de este ejercicio. */
  restSec: number | null;
}

type WBlock = Block & {
  _defaultSec: number | null;
  _duration: number | null;
  _header: string;
  _params: Param[];
  _letter: string | null;
  _pending: PendingEx[];
  _listMode: boolean;
};

function finalizeRoutine(chunk: string[]): ImportResult {
  const unparsed: string[] = [];
  const warnings: string[] = [];
  const routine = newRoutine({ name: 'Rutina importada' });
  const blocks: WBlock[] = [];
  const desc: string[] = [];
  let block: WBlock | null = null;
  let titleSet = false;

  const mk = (kind: BlockKind, title: string, listMode: boolean, letter: string | null = null): WBlock =>
    Object.assign(newBlock(kind, { title }), { _header: title, _defaultSec: null, _duration: null, _params: [], _letter: letter, _pending: [], _listMode: listMode });

  /** Convierte los ejercicios con letra en ejercicios reales (y bloque de calentamiento si hay series de aproximación). */
  const flushLetter = (b: WBlock) => {
    if (!b._pending.length) return;
    const warmBlocks: WBlock[] = [];
    let rounds = 0;
    const roundsSeen = new Set<number>();
    b._pending.forEach((p, i) => {
      const isLast = i === b._pending.length - 1;
      const work = [...p.sets].reverse().find((s) => !s.warm) ?? p.sets[p.sets.length - 1] ?? { rounds: 1, warm: false, seconds: null, rep: null, params: [] };
      const warm = p.sets.find((s) => s.warm && s !== work);
      const ex = makeExercise(p.name, work.seconds, work.rep);
      ex.params.push(...work.params);
      if (work.warm) p.notes.unshift('El entrenador indica estas series como calentamiento.');
      if (p.noRestAfter && !isLast) ex.restAfter = 0;
      else if (p.noRestAfter) p.notes.push('Indicación: de seguido al siguiente ejercicio.');
      else if (!isLast && p.restSec != null) ex.restAfter = p.restSec;
      if (p.notes.length) ex.coachNotes = [ex.coachNotes, ...p.notes].filter(Boolean).join('\n');
      if (ex.mode === 'tiempo' && !ex.seconds && !ex.reps) ex.review = [ex.review, 'Falta la duración o las repeticiones.'].filter(Boolean).join(' ');
      b.exercises.push(ex);
      rounds = Math.max(rounds, work.rounds);
      roundsSeen.add(work.rounds);
      if (warm) {
        const wex = makeExercise(p.name, warm.seconds, warm.rep);
        wex.params.push(...warm.params);
        if (!warm.rep && !warm.seconds) {
          wex.mode = 'reps';
          wex.review = [wex.review, 'Repeticiones de las series de calentamiento no indicadas.'].filter(Boolean).join(' ');
        }
        const wb = mk('fuerza', `${b._letter ?? ''} · Series de calentamiento`.replace(/^ · /, ''), false);
        wb.rounds = warm.rounds;
        wb.exercises.push(wex);
        warmBlocks.push(wb);
      }
    });
    b.rounds = rounds || 1;
    if (roundsSeen.size > 1) b.notes = [b.notes, 'Los ejercicios del bloque tienen distinto número de rondas; se usa el mayor.'].filter(Boolean).join('\n');
    b.title = b.exercises.length > 1 ? `${b._letter} · Superserie (${b.exercises.length} ejercicios)` : `${b._letter} · ${b.exercises[0].name}`;
    const idx = blocks.indexOf(b);
    if (warmBlocks.length) blocks.splice(idx, 0, ...warmBlocks);
  };

  const closeBlock = () => {
    const b = block;
    if (!b) return;
    if (b._pending.length) flushLetter(b);
    if (!b.exercises.length && b._duration != null) {
      // bloque descrito solo con duración: el ejercicio es el subtítulo del encabezado
      const sub = b._header.split(/\s[—–-]\s/).slice(1).join(' ').trim() || b._header;
      const ex = makeExercise(sub, b._duration, null);
      ex.params = b._params;
      b.exercises.push(ex);
    } else if (b._params.length) {
      const target = b.exercises[b.exercises.length - 1];
      if (target) target.params.push(...b._params);
      else unparsed.push(...b._params.map((p) => `${p.label}: ${p.value}`));
    }
    block = null;
  };

  const openBlock = (kind: BlockKind, title: string, listMode = true, letter: string | null = null) => {
    closeBlock();
    block = mk(kind, title, listMode, letter);
    blocks.push(block);
    return block;
  };

  const curPending = () => {
    const b = block;
    return b && b._pending.length ? b._pending[b._pending.length - 1] : null;
  };
  const curSet = (): SetSpec | null => {
    const p = curPending();
    if (!p) return null;
    if (!p.sets.length) p.sets.push({ rounds: 1, warm: false, seconds: null, rep: null, params: [] });
    return p.sets[p.sets.length - 1];
  };
  const lastExercise = () => {
    const b = block;
    return b && b.exercises.length ? b.exercises[b.exercises.length - 1] : null;
  };
  const addNote = (text: string) => {
    const p = curPending();
    if (p) return p.notes.push(text);
    const ex = lastExercise();
    if (ex) ex.coachNotes = [ex.coachNotes, text].filter(Boolean).join('\n');
    else if (block) block.notes = [block.notes, text].filter(Boolean).join('\n');
    else desc.push(text);
  };

  for (const raw of chunk) {
    const line = raw.trim().replace(/^["“]|["”]$/g, '').trim();
    if (!line) continue;
    const n = norm(line);

    // título: primera línea que no es viñeta, encabezado ni sección
    if (!titleSet && !block && !BULLET_RE.test(line) && !NUM_HEADER_RE.test(line) && !LETTER_RE.test(line) && !SECTION_RE.test(n)) {
      const t = splitTitle(line);
      routine.name = t.name;
      routine.place = t.place;
      titleSet = true;
      continue;
    }

    const numHeader = line.match(NUM_HEADER_RE);
    if (numHeader && parseDuration(numHeader[2]) == null && !/rondas?|series|vueltas/.test(norm(numHeader[2]))) {
      titleSet = true;
      const title = numHeader[2].replace(/[:.]+$/, '').trim();
      openBlock(blockKindOf(title), title);
      continue;
    }
    if (SECTION_RE.test(n)) {
      titleSet = true;
      const title = cap(line.replace(/[:.]+$/, '').trim())
        .replace(/^(Enfriarse|Cool ?-?down)$/i, 'Enfriamiento')
        .replace(/^Warm ?-?up$/i, 'Calentamiento');
      const ob = block as unknown as WBlock | null;
      if (ob && /^circuito$/.test(n) && ob.exercises.length === 0 && !ob._pending.length) {
        ob.kind = 'circuito';
        continue;
      }
      openBlock(blockKindOf(title), title);
      continue;
    }

    const letter = line.match(LETTER_RE);
    if (letter) {
      titleSet = true;
      const L = letter[1].toUpperCase();
      const name = letter[3].replace(/[.:]+$/, '').trim();
      const genericBlock = GENERIC_BLOCK_NAMES.includes(norm(name)) && !findLib(name);
      if (genericBlock) {
        const b = openBlock(blockKindOf(name), `${L} · ${cap(name)}`, true, L);
        b._letter = L;
        continue;
      }
      const b0 = block as WBlock | null;
      const b = b0 && b0._letter === L && !b0._listMode ? b0 : openBlock(blockKindOf(name) === 'cardio' ? 'cardio' : 'fuerza', `${L} · ${cap(name)}`, false, L);
      b._pending.push({ name, sets: [], notes: [], noRestAfter: false, restSec: null });
      continue;
    }

    if (IGNORE_RE.test(n)) continue;

    // «primero 5 minutos en la caminadora» dentro del calentamiento → bloque previo
    const first = n.match(/^primero\s+(.+)$/);
    const curBlock = block as unknown as WBlock | null;
    if (first && curBlock) {
      const cur = curBlock;
      const d = parseDuration(first[1]);
      const ex = makeExercise(stripDuration(line.replace(/^primero\s+/i, '')), d, parseReps(first[1]));
      const pre = mk(cur.kind, `${cur.title} — inicio`, true);
      pre.exercises.push(ex);
      blocks.splice(blocks.indexOf(cur), 0, pre);
      continue;
    }

    if (!block) {
      if (/^\d/.test(n) || BULLET_RE.test(line)) {
        openBlock('otro', 'Bloque');
      } else {
        desc.push(line);
        continue;
      }
    }
    const blk = block as unknown as WBlock; // asignado dentro de openBlock
    const body = line.replace(BULLET_RE, '').trim();
    const b = norm(body);
    const pending = curPending();

    if (/^ejercicios\s*:?$/.test(b)) continue;
    if (/^\(?calentamiento\)?$/.test(b)) {
      const s = curSet();
      if (s) s.warm = true;
      else blk.notes = [blk.notes, 'Indicado como calentamiento.'].filter(Boolean).join('\n');
      continue;
    }

    const rounds = b.match(/^(\d+)\s*(rondas?|series|vueltas|circuitos)\b/);
    if (rounds) {
      const r = Number(rounds[1]);
      if (pending) {
        const last = pending.sets[pending.sets.length - 1];
        // si la serie anterior aún no tiene datos y no es de calentamiento, se reemplaza
        if (last && !last.warm && !last.rep && !last.seconds && !last.params.length) last.rounds = r;
        else pending.sets.push({ rounds: r, warm: false, seconds: null, rep: null, params: [] });
      } else blk.rounds = r;
      continue;
    }

    // descansos
    if (/(de seg\w*|sin descanso|seguido).*(siguiente)/.test(b)) {
      if (pending) pending.noRestAfter = true;
      else {
        const ex = lastExercise();
        if (ex) ex.restAfter = 0;
      }
      continue;
    }
    if (/descans/.test(b)) {
      const d = parseDuration(b);
      if (d != null) {
        if (/entre (los )?ejercicios?/.test(b)) blk.restBetweenExercises = d;
        else {
          blk.restBetweenRounds = d;
          if (pending) pending.restSec = d;
        }
        continue;
      }
    }
    if (/por ejercicio|cada ejercicio/.test(b) && parseDuration(b) != null) {
      blk._defaultSec = parseDuration(b);
      blk.exercises.forEach((e) => {
        if (e.mode === 'tiempo' && e.seconds == null) {
          e.seconds = blk._defaultSec;
          if (e.review?.startsWith('Falta')) e.review = null;
        }
      });
      continue;
    }
    // pausas e indicaciones de técnica: se guardan tal cual
    if (/\bpausa\b|te quedas arriba|al final de cada/.test(b)) {
      addNote(cap(body));
      continue;
    }

    const isMachine = /caminadora|treadmill|cinta|bicicleta|eliptica/.test(norm(blk._header + ' ' + (pending?.name ?? '') + ' ' + (lastExercise()?.name ?? '')));
    const param = parseParamLine(body, isMachine);
    if (param) {
      const s = curSet();
      if (s) s.params.push(param);
      else if (blk.exercises.length && !blk._listMode) blk.exercises[blk.exercises.length - 1].params.push(param);
      else if (blk.exercises.length && blk._duration == null) blk.exercises[blk.exercises.length - 1].params.push(param);
      else blk._params.push(param);
      continue;
    }

    const rep = parseReps(body);
    const dur = parseDuration(b);
    const rest = stripDuration(body).replace(/[\d\s.,:;]/g, '');
    const onlyDuration = dur != null && rest.length === 0;

    if (pending) {
      const s = curSet()!;
      if (rep && norm(stripDuration(body)).replace(/\d+(\s*(-|a)\s*\d+)?\s*(repeticiones|repeticion|reps|rep|pasos)/, '').replace(SIDE_RE, '').replace(/[\s.,]/g, '') === '') {
        s.rep = rep;
        continue;
      }
      if (onlyDuration) {
        s.seconds = dur;
        continue;
      }
      // cualquier otra indicación del entrenador se conserva literalmente
      addNote(cap(body));
      continue;
    }

    if (onlyDuration) {
      blk._duration = dur;
      continue;
    }

    // ejercicio en bloque de lista: «Nombre: 30 segundos», «0:30 segundos Nombre», «Nombre 12 repeticiones», «Nombre»
    let name = body;
    let seconds: number | null = null;
    if (dur != null) {
      seconds = dur;
      name = stripDuration(body);
    }
    if (rep) name = name.replace(/\d+(?:\s*(?:-|a)\s*\d+)?\s*(repeticiones|repeticion|reps|rep|pasos)\b/i, '').replace(SIDE_RE, '');
    name = name.replace(/^[\s:—–-]+|[\s:—–(-]+$/g, '').replace(/\(\s*\)/g, '').trim();
    if (seconds == null && !rep && blk._defaultSec != null) seconds = blk._defaultSec;
    if (!/[a-záéíóúñ]{3}/i.test(name)) {
      unparsed.push(line);
      continue;
    }
    if (!BULLET_RE.test(line) && seconds == null && !rep && name.split(' ').length > 9) {
      addNote(body);
      unparsed.push(line);
      continue;
    }
    const ex = makeExercise(name, seconds, rep ? { ...rep, perSide: rep.perSide || (body.match(SIDE_RE)?.[1] ?? '') } : null);
    if (seconds == null && !rep) ex.review = [ex.review, 'Falta la duración o las repeticiones.'].filter(Boolean).join(' ');
    if (body.match(SIDE_RE) && !ex.perSide) ex.perSide = body.match(SIDE_RE)![1].toLowerCase();
    blk.exercises.push(ex);
  }
  closeBlock();

  routine.blocks = blocks
    .map(({ _header, _defaultSec, _duration, _params, _letter, _pending, _listMode, ...rest }) => {
      void [_header, _defaultSec, _duration, _params, _letter, _pending, _listMode];
      return rest as Block;
    })
    .filter((b) => b.exercises.length);
  routine.description = desc.join('\n');
  if (!routine.blocks.length) warnings.push('No se encontraron bloques ni ejercicios. Revisa el formato o crea la rutina manualmente.');
  const flagged = routine.blocks.flatMap((x) => x.exercises).filter((e) => e.review || e.params.some((p) => p.pending)).length;
  if (flagged) warnings.push(`${flagged} ejercicio(s) necesitan tu confirmación antes de entrenar.`);
  if (unparsed.length) warnings.push(`${unparsed.length} línea(s) no se pudieron interpretar; quedaron como notas.`);
  return { routine, unparsed, warnings };
}

/** Una sola rutina (la primera si el texto contiene varias). */
export function importText(text: string): ImportResult {
  const many = importMany(text);
  return many.results[0] ?? finalizeRoutine([]);
}

/** Divide el texto en rutinas: cada título va justo antes de una línea «Calentamiento». */
export function splitRoutines(text: string): { chunks: string[][]; ignored: string[] } {
  const lines = text.replace(/\r/g, '').split('\n');
  const ignored: string[] = [];
  const clean = lines.map((l) => {
    const n = norm(l.trim());
    if (n && IGNORE_RE.test(n)) {
      ignored.push(l.trim());
      return '';
    }
    return l;
  });
  const nonEmpty = clean.map((l, i) => ({ l: l.trim(), i })).filter((x) => x.l);
  const starts: number[] = [];
  nonEmpty.forEach((x, k) => {
    if (/^(calentamiento|warm ?-?up)\s*:?\s*$/i.test(norm(x.l)) && k > 0) {
      const prev = nonEmpty[k - 1];
      const pn = norm(prev.l);
      const isTitle = !BULLET_RE.test(prev.l) && !NUM_HEADER_RE.test(prev.l) && !LETTER_RE.test(prev.l) && parseDuration(pn) == null && !parseReps(pn) && !/\d/.test(pn);
      if (isTitle) starts.push(prev.i);
    }
  });
  if (starts.length <= 1) return { chunks: [clean], ignored };
  const chunks: string[][] = [];
  if (clean.slice(0, starts[0]).some((l) => l.trim())) chunks.push(clean.slice(0, starts[0]));
  starts.forEach((s, k) => chunks.push(clean.slice(s, starts[k + 1] ?? clean.length)));
  return { chunks, ignored };
}

const signature = (lines: string[]) =>
  lines
    .map((l) => norm(l))
    .filter(Boolean)
    .join('|');

export function importMany(text: string): ImportManyResult {
  const { chunks, ignored } = splitRoutines(text);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const results: ImportResult[] = [];
  for (const c of chunks) {
    const sig = signature(c);
    if (!sig) continue;
    const res = finalizeRoutine(c);
    if (seen.has(sig)) {
      duplicates.push(res.routine.name);
      continue;
    }
    seen.add(sig);
    if (!res.routine.blocks.length) continue;
    const same = results.filter((x) => norm(x.routine.name + ' ' + x.routine.place) === norm(res.routine.name + ' ' + res.routine.place)).length;
    if (same) res.routine.name = `${res.routine.name} (versión ${same + 1})`;
    results.push(res);
  }
  return { results, ignored, duplicates };
}
