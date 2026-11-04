/**
 * Convierte instrucciones en texto libre en una rutina estructurada.
 * Regla principal: no se inventa nada. Lo que no se reconoce se marca para confirmar.
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

const UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(horas?|h|minutos?|mins?|m|segundos?|segs?|s|")(?![a-z])/g;

/** Duración en segundos a partir de "30 segundos", "1 minuto", "1:30", "1 min 30 s". */
export function parseDuration(text: string): number | null {
  const t = norm(text);
  const clock = t.match(/\b(\d{1,2}):(\d{2})\b/);
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

const reps = (t: string) => {
  const m = norm(t).match(/(\d+)\s*(repeticiones|repeticion|reps|rep)\b/);
  return m ? Number(m[1]) : null;
};

export function blockKindOf(text: string): BlockKind {
  const t = norm(text);
  if (/calentamiento|activacion|movilidad/.test(t)) return 'calentamiento';
  if (/enfriamiento|estiramiento|vuelta a la calma|relajacion/.test(t)) return 'enfriamiento';
  if (/cardio|caminadora|cinta de correr|bicicleta|eliptica|correr|trote|remo/.test(t)) return 'cardio';
  if (/circuito|abdomen|abdominal|core|hiit|tabata/.test(t)) return 'circuito';
  if (/fuerza|pesas|piernas|gluteo|brazos|espalda|pecho|tren (superior|inferior)/.test(t)) return 'fuerza';
  return 'otro';
}

const BULLET_RE = /^\s*(?:[-•*·–]|[a-z][.)]|\d+[.)])\s+/i;
const HEADER_RE = /^\s*(\d+)[.)]\s+(.+)$/;
const PARAM_RE = /^(velocidad[^:]*|inclinaci[oó]n[^:]*|peso[^:]*|carga[^:]*|resistencia[^:]*|ritmo[^:]*|nivel[^:]*|cadencia[^:]*|pulsaciones[^:]*|frecuencia card[^:]*|distancia[^:]*)\s*:\s*(.+)$/i;

function parseParam(label: string, rest: string): Param {
  const cleanLabel = label.trim().replace(/^\w/, (c) => c.toUpperCase());
  const r = rest.trim().replace(/\.$/, '');
  const quoted = r.match(/[“"«]([^”"»]+)[”"»]/);
  const num = r.match(/^(\d+(?:[.,]\d+)?)\s*(km\/h|kmh|mph|kg|lb|lbs|%|rpm|w|km|m|ppm)?/i);
  const isSpeed = /velocidad/i.test(cleanLabel);
  if (num) {
    const unit = (num[2] ?? '').toLowerCase().replace('kmh', 'km/h');
    const rest2 = r.slice(num[0].length).replace(/^[;,.\s]+/, '');
    const needsUnit = isSpeed && !unit;
    return newParam({
      label: cleanLabel,
      value: num[1],
      unit,
      unitOptions: isSpeed ? ['km/h', 'mph'] : undefined,
      pending: needsUnit,
      note: needsUnit ? 'Elige la unidad (km/h o mph).' : rest2 ? `Indicación original: ${rest2}` : undefined,
    });
  }
  const value = quoted ? quoted[1] : /m[aá]xim/i.test(r) ? 'máxima' : /m[ií]nim/i.test(r) ? 'mínima' : r;
  return newParam({
    label: cleanLabel,
    value,
    unit: '',
    pending: true,
    note: 'Dato pendiente de definir por el entrenador (no es un valor numérico).',
  });
}

function makeExercise(rawName: string, seconds: number | null, repCount: number | null): Exercise {
  const name = rawName.replace(/[.:;,\s]+$/, '').trim();
  const lib = findLib(name);
  const mode: Exercise['mode'] = repCount != null && seconds == null ? 'reps' : 'tiempo';
  const base = { mode, seconds: mode === 'tiempo' ? seconds : null, reps: repCount };
  const missing = seconds == null && repCount == null ? 'Falta la duración o las repeticiones. ' : '';
  if (lib) {
    return fromLib(lib, { ...base, name: name.charAt(0).toUpperCase() + name.slice(1), review: missing ? missing.trim() : null });
  }
  return newExercise({
    ...base,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    pose: 'generico',
    review: `${missing}Ejercicio no reconocido: confirma el movimiento y añade las instrucciones.`,
  });
}

export function importText(text: string): ImportResult {
  const lines = text.replace(/\r/g, '').split('\n');
  const unparsed: string[] = [];
  const warnings: string[] = [];
  const routine = newRoutine({ name: 'Rutina importada' });
  type WBlock = Block & { _defaultSec: number | null; _duration: number | null; _header: string; _params?: Param[] };
  let block: WBlock | null = null;
  const blocks: WBlock[] = [];
  let titleSet = false;
  const desc: string[] = [];

  const closeBlock = () => {
    const b = block as WBlock | null;
    if (!b) return;
    if (!b.exercises.length && b._duration != null) {
      // bloque descrito solo con duración: el ejercicio es el subtítulo del encabezado
      const sub = b._header.split(/\s[—–-]\s/).slice(1).join(' ').trim() || b._header;
      const ex = makeExercise(sub, b._duration, null);
      ex.params = b._params ?? [];
      b.exercises.push(ex);
    } else if (b._params?.length) {
      const target = b.exercises[b.exercises.length - 1];
      if (target) target.params.push(...b._params);
      else unparsed.push(...b._params.map((p) => `${p.label}: ${p.value}`));
    }
    blocks.push(b);
    block = null;
  };

  const openBlock = (header: string) => {
    closeBlock();
    const kind = blockKindOf(header);
    const title = header.replace(/[:.]+$/, '').trim();
    block = Object.assign(newBlock(kind, { title }), { _header: title, _defaultSec: null, _duration: null });
  };

  for (const raw of lines) {
    const line = raw.trim().replace(/^["“]|["”]$/g, '').trim();
    if (!line) continue;
    // título: primera línea que no es viñeta ni encabezado numerado
    if (!titleSet && !block && !BULLET_RE.test(line) && !HEADER_RE.test(line)) {
      const parts = line.split(/\s[—–]\s/);
      routine.name = parts[0].trim();
      if (parts[1]) routine.place = parts.slice(1).join(' — ').trim().replace(/^\w/, (c) => c.toUpperCase());
      titleSet = true;
      continue;
    }

    const header = line.match(HEADER_RE);
    const looksHeader = header && !parseDuration(header[2]) && !/rondas?|series|vueltas/.test(norm(header[2]));
    if (looksHeader) {
      titleSet = true;
      openBlock(header![2]);
      continue;
    }
    // encabezado sin número: "Calentamiento:" o "Enfriamiento"
    if (!BULLET_RE.test(line) && blockKindOf(line) !== 'otro' && line.length < 50 && !parseDuration(line) && !/\d/.test(line)) {
      titleSet = true;
      openBlock(line);
      continue;
    }

    const body = line.replace(BULLET_RE, '').trim();
    const b = norm(body);

    if (!block) {
      if (/^\d/.test(b) || BULLET_RE.test(line)) {
        // instrucción antes de cualquier bloque: se crea un bloque genérico
        openBlock('Bloque');
      } else {
        desc.push(body);
        continue;
      }
    }
    const blk = block as unknown as WBlock; // asignado dentro de openBlock

    if (/^ejercicios\s*:?$/.test(b)) continue;

    const rounds = b.match(/^(\d+)\s*(rondas?|series|vueltas|circuitos)\b/);
    if (rounds) {
      blk.rounds = Number(rounds[1]);
      continue;
    }
    if (/descanso/.test(b)) {
      const d = parseDuration(b);
      if (d != null && /entre (los )?ejercicios/.test(b)) {
        blk.restBetweenExercises = d;
        continue;
      }
      if (d != null && /entre (las )?(rondas|series|vueltas|circuitos)/.test(b)) {
        blk.restBetweenRounds = d;
        continue;
      }
    }
    if (/por ejercicio|cada ejercicio/.test(b) && parseDuration(b) != null) {
      blk._defaultSec = parseDuration(b);
      blk.exercises.forEach((e) => {
        if (e.mode === 'tiempo' && e.seconds == null) {
          e.seconds = blk._defaultSec!;
          if (e.review?.startsWith('Falta')) e.review = e.review.replace(/^Falta la duración o las repeticiones\.\s*/, '') || null;
        }
      });
      continue;
    }
    const pm = body.match(PARAM_RE);
    if (pm) {
      const p = parseParam(pm[1], pm[2]);
      if (blk.exercises.length) blk.exercises[blk.exercises.length - 1].params.push(p);
      else (blk._params ??= []).push(p);
      continue;
    }
    // línea que solo indica duración ("20 minutos.")
    const dur = parseDuration(b);
    const onlyDuration = dur != null && b.replace(UNIT_RE, '').replace(/[\d\s.,:;y]/g, '').length === 0;
    if (onlyDuration) {
      blk._duration = dur;
      continue;
    }

    // ejercicio: "Nombre: 30 segundos", "Nombre — 1 min", "Nombre (12 repeticiones)", "Nombre"
    const sep = body.match(/^(.+?)\s*(?::|—|–|\s-\s|\()\s*(.+?)\)?\.?$/);
    let name = body;
    let seconds: number | null = null;
    let repCount: number | null = null;
    if (sep && (parseDuration(sep[2]) != null || reps(sep[2]) != null)) {
      name = sep[1];
      seconds = parseDuration(sep[2]);
      repCount = reps(sep[2]);
    } else if (reps(body) != null) {
      repCount = reps(body);
      name = body.replace(/\d+\s*(repeticiones|repeticion|reps|rep)\b\.?/i, '').trim();
    }
    if (seconds == null && repCount == null && blk._defaultSec != null) seconds = blk._defaultSec;
    if (!/[a-záéíóúñ]{3}/i.test(name)) {
      unparsed.push(line);
      continue;
    }
    // frases largas sin viñeta: probablemente instrucciones, no ejercicios
    if (!BULLET_RE.test(line) && name.split(' ').length > 8) {
      blk.notes = [blk.notes, body].filter(Boolean).join('\n');
      unparsed.push(line);
      continue;
    }
    blk.exercises.push(makeExercise(name, seconds, repCount));
  }
  closeBlock();

  routine.blocks = blocks.map(({ _header, _defaultSec, _duration, _params, ...rest }) => {
    void [_header, _defaultSec, _duration, _params];
    return rest;
  });
  routine.description = desc.join('\n');
  if (!routine.blocks.length) warnings.push('No se encontraron bloques ni ejercicios. Revisa el formato o crea la rutina manualmente.');
  const flagged = routine.blocks.flatMap((x) => x.exercises).filter((e) => e.review || e.params.some((p) => p.pending)).length;
  if (flagged) warnings.push(`${flagged} ejercicio(s) necesitan tu confirmación antes de entrenar.`);
  if (unparsed.length) warnings.push(`${unparsed.length} línea(s) no se pudieron interpretar; quedaron como notas.`);
  return { routine, unparsed, warnings };
}
