/**
 * Ilustraciones vectoriales sencillas: un muñeco de palitos animado entre la posición inicial y la final.
 * Lienzo 120 × 90, suelo en y = 81.
 */

export type Pt = [number, number];
export type Joint = 'head' | 'neck' | 'hip' | 'eL' | 'hL' | 'eR' | 'hR' | 'kL' | 'fL' | 'kR' | 'fR';
export type Pose = Record<Joint, Pt>;

export interface Anim {
  label: string;
  /** Pose para t ∈ [0, 1) (ciclo completo). */
  at: (t: number) => Pose;
  /** Flechas (trazos SVG) que indican la dirección del movimiento. */
  arrows: string[];
  /** Momentos del ciclo para la secuencia de cuadros. */
  frames: { t: number; label: string }[];
  /** Elementos de fondo. */
  prop?: 'caminadora' | 'colchoneta';
  /** Ilustración genérica: el movimiento no está definido. */
  generic?: boolean;
}

const lerp = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const mix = (A: Pose, B: Pose, k: number): Pose => {
  const o = {} as Pose;
  (Object.keys(A) as Joint[]).forEach((j) => (o[j] = lerp(A[j], B[j], k)));
  return o;
};
/** 0 → 1 → 0 suave a lo largo del ciclo. */
const pingpong = (t: number) => (1 - Math.cos(2 * Math.PI * t)) / 2;
const shift = (P: Pose, dx: number, dy: number, only?: Joint[]): Pose => {
  const o = { ...P };
  (only ?? (Object.keys(P) as Joint[])).forEach((j) => (o[j] = [P[j][0] + dx, P[j][1] + dy]));
  return o;
};
const between = (A: Pose, B: Pose) => (t: number) => mix(A, B, pingpong(t));
const STD_FRAMES = [
  { t: 0, label: 'Inicio' },
  { t: 0.25, label: 'Movimiento' },
  { t: 0.5, label: 'Final' },
];

const STAND: Pose = {
  head: [60, 13], neck: [60, 23], hip: [60, 48],
  eL: [52, 35], hL: [50, 47], eR: [68, 35], hR: [70, 47],
  kL: [56, 64], fL: [55, 81], kR: [64, 64], fR: [65, 81],
};

const HANDS_HIPS: Pose = { ...STAND, eL: [48, 34], hL: [55, 46], eR: [72, 34], hR: [65, 46] };

const SIDE_STAND: Pose = {
  head: [58, 13], neck: [58, 23], hip: [58, 48],
  eL: [60, 36], hL: [62, 47], eR: [56, 36], hR: [54, 47],
  kL: [59, 64], fL: [58, 81], kR: [57, 64], fR: [58, 81],
};
const walk = (P: Pose) => (t: number) => {
  const s = Math.sin(2 * Math.PI * t);
  return {
    ...P,
    kL: [P.hip[0] + 5 * s, 64] as Pt,
    fL: [P.hip[0] + 9 * s, 81 - Math.max(0, -Math.cos(2 * Math.PI * t)) * 3] as Pt,
    kR: [P.hip[0] - 5 * s, 64] as Pt,
    fR: [P.hip[0] - 9 * s, 81 - Math.max(0, Math.cos(2 * Math.PI * t)) * 3] as Pt,
    eL: [P.neck[0] - 4 * s, 36] as Pt,
    hL: [P.neck[0] - 7 * s, 46] as Pt,
    eR: [P.neck[0] + 4 * s, 36] as Pt,
    hR: [P.neck[0] + 7 * s, 46] as Pt,
  };
};

// Acostado boca arriba, cabeza a la izquierda
const SUPINE: Pose = {
  head: [18, 75], neck: [27, 77], hip: [60, 78],
  eL: [38, 79], hL: [48, 79], eR: [37, 79], hR: [47, 79],
  kL: [80, 79], fL: [100, 79], kR: [80, 79], fR: [100, 79],
};
const LEGS_UP = { kL: [61, 61] as Pt, fL: [62, 43] as Pt, kR: [60, 61] as Pt, fR: [61, 43] as Pt };

// Boca abajo, cabeza a la izquierda
const PRONE: Pose = {
  head: [19, 75], neck: [28, 78], hip: [62, 79],
  eL: [38, 70], hL: [31, 80], eR: [37, 71], hR: [30, 80],
  kL: [82, 80], fL: [102, 80], kR: [82, 80], fR: [102, 80],
};

const PLANK_HIGH: Pose = {
  head: [22, 51], neck: [31, 56], hip: [66, 61],
  eL: [31, 68], hL: [31, 80], eR: [30, 68], hR: [30, 80],
  kL: [84, 70], fL: [102, 80], kR: [84, 70], fR: [102, 80],
};

export const ANIMS: Record<string, Anim> = {
  'circulos-cadera': {
    label: 'Círculos de cadera',
    at: (t) => {
      const a = 2 * Math.PI * t;
      const dx = 5 * Math.cos(a);
      const dy = 1.5 * Math.sin(a);
      const P = shift(HANDS_HIPS, dx, dy, ['hip', 'hL', 'hR']);
      return shift(P, dx / 2, 0, ['kL', 'kR']);
    },
    arrows: ['M46 56 A14 5 0 1 0 74 56'],
    frames: [
      { t: 0, label: 'Cadera a un lado' },
      { t: 0.25, label: 'Adelante' },
      { t: 0.5, label: 'Al otro lado' },
    ],
  },
  'circulos-brazos': {
    label: 'Círculos de brazos',
    at: (t) => {
      const a = 2 * Math.PI * t;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return {
        ...STAND,
        eL: [47 + 2 * c, 25 + 2 * s], hL: [33 + 4 * c, 25 + 4 * s],
        eR: [73 - 2 * c, 25 + 2 * s], hR: [87 - 4 * c, 25 + 4 * s],
      };
    },
    arrows: ['M27 25 A6 6 0 1 1 33 31', 'M93 25 A6 6 0 1 0 87 31'],
    frames: [
      { t: 0, label: 'Brazos a los lados' },
      { t: 0.25, label: 'Círculo' },
      { t: 0.5, label: 'Continúa' },
    ],
  },
  saltos: {
    label: 'Saltos suaves',
    at: between(
      { ...STAND, hip: [60, 51], kL: [55, 66], kR: [65, 66], head: [60, 16], neck: [60, 26], eL: [52, 38], hL: [50, 50], eR: [68, 38], hR: [70, 50] },
      shift(STAND, 0, -8),
    ),
    arrows: ['M94 66 L94 44', 'M94 44 L94 66'],
    frames: [
      { t: 0, label: 'Rodillas suaves' },
      { t: 0.25, label: 'Impulso' },
      { t: 0.5, label: 'Salto pequeño' },
    ],
  },
  marcha: {
    label: 'Marcha',
    at: (t) => {
      const k = Math.sin(2 * Math.PI * t);
      const up = Math.max(0, k);
      const up2 = Math.max(0, -k);
      return {
        ...SIDE_STAND,
        kL: [59 + 9 * up, 64 - 9 * up], fL: [58 + 2 * up, 81 - 10 * up],
        kR: [57 + 9 * up2, 64 - 9 * up2], fR: [58 + 2 * up2, 81 - 10 * up2],
        eL: [58 - 4 * k, 36], hL: [58 - 7 * k, 46], eR: [58 + 4 * k, 36], hR: [58 + 7 * k, 46],
      };
    },
    arrows: ['M80 72 L80 56'],
    frames: STD_FRAMES,
  },
  'toe-touch': {
    label: 'Manos hacia los pies',
    at: between(
      { ...SUPINE, ...LEGS_UP, eL: [30, 64], hL: [33, 51], eR: [29, 64], hR: [32, 51] },
      { ...SUPINE, ...LEGS_UP, head: [30, 62], neck: [37, 67], eL: [48, 56], hL: [58, 46], eR: [47, 57], hR: [57, 47] },
    ),
    arrows: ['M24 54 Q30 40 50 38'],
    frames: STD_FRAMES,
    prop: 'colchoneta',
  },
  'crujido-rana': {
    label: 'Crujido de rana',
    at: between(
      { ...SUPINE, kL: [71, 64], fL: [80, 78], kR: [75, 69], fR: [81, 79], eL: [38, 79], hL: [48, 79] },
      { ...SUPINE, head: [30, 61], neck: [37, 67], kL: [71, 64], fL: [80, 78], kR: [75, 69], fR: [81, 79], eL: [48, 64], hL: [60, 62], eR: [47, 65], hR: [59, 63] },
    ),
    arrows: ['M20 62 Q24 50 36 48'],
    frames: STD_FRAMES,
    prop: 'colchoneta',
  },
  escalador: {
    label: 'Escalador',
    at: (t) => {
      const IN = { k: [50, 66] as Pt, f: [62, 77] as Pt };
      const OUT = { k: [84, 70] as Pt, f: [102, 80] as Pt };
      const kL = t < 0.5 ? pingpong(t * 2) : 0;
      const kR = t >= 0.5 ? pingpong((t - 0.5) * 2) : 0;
      return {
        ...PLANK_HIGH,
        kL: lerp(OUT.k, IN.k, kL), fL: lerp(OUT.f, IN.f, kL),
        kR: lerp(OUT.k, IN.k, kR), fR: lerp(OUT.f, IN.f, kR),
      };
    },
    arrows: ['M92 50 L58 50', 'M58 50 L92 50'],
    frames: [
      { t: 0, label: 'Plancha alta' },
      { t: 0.25, label: 'Rodilla al pecho' },
      { t: 0.75, label: 'Cambia de pierna' },
    ],
    prop: 'colchoneta',
  },
  palanca: {
    label: 'Palanca de pierna',
    at: between(SUPINE, { ...SUPINE, ...LEGS_UP }),
    arrows: ['M100 70 Q98 44 74 38'],
    frames: STD_FRAMES,
    prop: 'colchoneta',
  },
  'v-up': {
    label: 'V-up',
    at: between(
      { ...SUPINE, head: [26, 75], neck: [35, 77], eL: [23, 78], hL: [10, 78], eR: [23, 77], hR: [10, 77] },
      { ...SUPINE, hip: [62, 79], neck: [47, 61], head: [42, 54], eL: [58, 52], hL: [72, 43], eR: [57, 53], hR: [71, 44], kL: [73, 62], fL: [84, 46], kR: [72, 63], fR: [83, 47] },
    ),
    arrows: ['M14 66 Q22 44 40 42', 'M104 70 Q102 50 90 42'],
    frames: STD_FRAMES,
    prop: 'colchoneta',
  },
  plancha: {
    label: 'Plancha de antebrazos',
    at: between(
      { head: [22, 60], neck: [31, 64], hip: [62, 72], eL: [31, 80], hL: [43, 80], eR: [30, 80], hR: [42, 80], kL: [80, 80], fL: [100, 80], kR: [80, 80], fR: [100, 80] },
      { head: [22, 57], neck: [31, 62], hip: [64, 67], eL: [31, 80], hL: [43, 80], eR: [30, 80], hR: [42, 80], kL: [83, 73], fL: [102, 80], kR: [83, 73], fR: [102, 80] },
    ),
    arrows: ['M64 80 L64 70'],
    frames: [
      { t: 0, label: 'Rodillas apoyadas' },
      { t: 0.25, label: 'Eleva el cuerpo' },
      { t: 0.5, label: 'Línea recta: mantén' },
    ],
    prop: 'colchoneta',
  },
  cobra: {
    label: 'Cobra',
    at: between(PRONE, { ...PRONE, neck: [37, 59], head: [31, 51], eL: [36, 70], hL: [31, 80], eR: [35, 70], hR: [30, 80] }),
    arrows: ['M18 66 Q20 50 30 42'],
    frames: STD_FRAMES,
    prop: 'colchoneta',
  },
  caminadora: {
    label: 'Caminadora',
    at: walk(SIDE_STAND),
    arrows: ['M90 60 L40 60'],
    frames: [
      { t: 0, label: 'Paso' },
      { t: 0.25, label: 'Apoyo' },
      { t: 0.5, label: 'Paso contrario' },
    ],
    prop: 'caminadora',
  },
  estiramiento: {
    label: 'Movimiento por definir',
    at: () => STAND,
    arrows: [],
    frames: [{ t: 0, label: 'Por definir' }],
    generic: true,
  },
  generico: {
    label: 'Movimiento por definir',
    at: () => STAND,
    arrows: [],
    frames: [{ t: 0, label: 'Por definir' }],
    generic: true,
  },
};

export const POSE_OPTIONS = Object.entries(ANIMS)
  .filter(([k]) => k !== 'estiramiento')
  .map(([k, v]) => ({ key: k, label: k === 'generico' ? 'Genérica (sin movimiento)' : v.label }));

export const animFor = (key: string) => ANIMS[key] ?? ANIMS.generico;
