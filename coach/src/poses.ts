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
  prop?: 'caminadora' | 'colchoneta' | 'banco' | 'caja' | 'pared';
  /** Ilustración genérica: el movimiento no está definido. */
  generic?: boolean;
  /** Ejercicio conocido sin dibujo propio. */
  noDrawing?: boolean;
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

const ANIMS_EXTRA: Record<string, Anim> = {};

// De pie de perfil con los brazos colgando (mirando a la derecha)
const SIDE_ARMS_DOWN: Pose = { ...SIDE_STAND, eL: [60, 36], hL: [61, 48], eR: [59, 36], hR: [60, 48] };
const SQUAT: Pose = {
  head: [58, 30], neck: [56, 39], hip: [46, 60],
  eL: [64, 46], hL: [74, 44], eR: [63, 47], hR: [73, 45],
  kL: [64, 62], fL: [58, 81], kR: [63, 63], fR: [57, 81],
};
const BENT: Pose = {
  head: [32, 34], neck: [40, 38], hip: [66, 46],
  eL: [41, 50], hL: [42, 62], eR: [40, 50], hR: [41, 62],
  kL: [62, 64], fL: [64, 81], kR: [61, 64], fR: [63, 81],
};
const BRIDGE_DOWN: Pose = {
  head: [18, 75], neck: [27, 77], hip: [58, 78],
  eL: [38, 79], hL: [48, 79], eR: [37, 79], hR: [47, 79],
  kL: [74, 62], fL: [84, 79], kR: [73, 63], fR: [83, 79],
};
const BRIDGE_UP: Pose = { ...BRIDGE_DOWN, hip: [58, 62], kL: [76, 58], kR: [75, 59] };
const SEATED: Pose = {
  head: [52, 22], neck: [52, 32], hip: [52, 58],
  eL: [56, 20], hL: [58, 6], eR: [55, 21], hR: [57, 7],
  kL: [72, 58], fL: [72, 80], kR: [71, 59], fR: [71, 80],
};

Object.assign(ANIMS_EXTRA, {
  sentadilla: { label: 'Sentadilla', at: between(SIDE_ARMS_DOWN, SQUAT), arrows: ['M30 30 L30 56'], frames: STD_FRAMES },
  zancada: {
    label: 'Zancada',
    at: between(SIDE_ARMS_DOWN, { ...SIDE_ARMS_DOWN, head: [56, 27], neck: [56, 37], hip: [56, 60], eL: [57, 49], hL: [58, 60], eR: [56, 49], hR: [57, 60], kL: [70, 62], fL: [72, 81], kR: [46, 78], fR: [34, 80] }),
    arrows: ['M92 34 L92 56'],
    frames: STD_FRAMES,
  },
  puente: { label: 'Puente de glúteos', at: between(BRIDGE_DOWN, BRIDGE_UP), arrows: ['M58 50 L58 34'], frames: STD_FRAMES, prop: 'colchoneta' },
  'empuje-cadera': {
    label: 'Empuje de cadera',
    at: between(
      { ...BRIDGE_DOWN, head: [22, 52], neck: [30, 60], hip: [52, 76], eL: [40, 62], hL: [52, 70], eR: [39, 63], hR: [51, 71], kL: [72, 60], fL: [80, 80], kR: [71, 61], fR: [79, 80] },
      { ...BRIDGE_DOWN, head: [22, 52], neck: [30, 60], hip: [54, 60], eL: [42, 56], hL: [54, 56], eR: [41, 57], hR: [53, 57], kL: [74, 60], fL: [80, 80], kR: [73, 61], fR: [79, 80] },
    ),
    arrows: ['M54 46 L54 30'],
    frames: STD_FRAMES,
    prop: 'banco',
  },
  curl: {
    label: 'Curl',
    at: between(SIDE_ARMS_DOWN, { ...SIDE_ARMS_DOWN, eL: [60, 36], hL: [66, 26] }),
    arrows: ['M80 46 Q84 34 74 24'],
    frames: STD_FRAMES,
  },
  press: {
    label: 'Press de hombros',
    at: between(
      { ...shift(STAND, 0, 8), eL: [44, 38], hL: [44, 24], eR: [76, 38], hR: [76, 24] },
      { ...shift(STAND, 0, 8), eL: [50, 18], hL: [54, 4], eR: [70, 18], hR: [66, 4] },
    ),
    arrows: ['M30 30 L30 8', 'M90 30 L90 8'],
    frames: STD_FRAMES,
  },
  'elev-lateral': {
    label: 'Elevación lateral',
    at: between(STAND, { ...STAND, eL: [46, 26], hL: [34, 24], eR: [74, 26], hR: [86, 24] }),
    arrows: ['M40 50 Q28 44 28 30', 'M80 50 Q92 44 92 30'],
    frames: STD_FRAMES,
  },
  'elev-frontal': {
    label: 'Elevación frontal',
    at: between(SIDE_ARMS_DOWN, { ...SIDE_ARMS_DOWN, eL: [70, 25], hL: [82, 24], eR: [69, 26], hR: [81, 25] }),
    arrows: ['M72 52 Q90 46 90 30'],
    frames: STD_FRAMES,
  },
  remo: {
    label: 'Remo',
    at: between(BENT, { ...BENT, eL: [56, 34], hL: [52, 46], eR: [55, 35], hR: [51, 47] }),
    arrows: ['M30 66 L30 48'],
    frames: STD_FRAMES,
  },
  jalon: {
    label: 'Jalón al pecho',
    at: between(SEATED, { ...SEATED, eL: [62, 44], hL: [58, 30], eR: [61, 45], hR: [57, 31] }),
    arrows: ['M86 8 L86 34'],
    frames: STD_FRAMES,
  },
  'giro-ruso': {
    label: 'Giro ruso',
    at: (t) => {
      const k = Math.sin(2 * Math.PI * t);
      const base: Pose = { head: [42, 46], neck: [46, 54], hip: [60, 78], eL: [50 + 4 * k, 64], hL: [56 + 10 * k, 62], eR: [50 + 4 * k, 65], hR: [56 + 10 * k, 63], kL: [76, 62], fL: [90, 78], kR: [75, 63], fR: [89, 79] };
      return base;
    },
    arrows: ['M44 40 L70 40', 'M70 40 L44 40'],
    frames: [
      { t: 0, label: 'Centro' },
      { t: 0.25, label: 'Gira a un lado' },
      { t: 0.75, label: 'Gira al otro' },
    ],
    prop: 'colchoneta',
  },
  escalon: {
    label: 'Subida al escalón',
    at: between(
      { ...SIDE_ARMS_DOWN, kL: [70, 58], fL: [74, 66], hip: [58, 48] },
      { ...shift(SIDE_ARMS_DOWN, 12, -16), kL: [72, 50], fL: [74, 66], kR: [70, 52], fR: [74, 66] },
    ),
    arrows: ['M40 60 Q50 30 70 26'],
    frames: STD_FRAMES,
    prop: 'caja',
  },
  pared: {
    label: 'Sentarse contra la pared',
    at: between(
      { head: [30, 31], neck: [30, 41], hip: [30, 62], eL: [36, 50], hL: [44, 58], eR: [35, 51], hR: [43, 59], kL: [52, 62], fL: [52, 81], kR: [51, 63], fR: [51, 81] },
      { head: [30, 32], neck: [30, 42], hip: [30, 63], eL: [36, 51], hL: [44, 59], eR: [35, 52], hR: [43, 60], kL: [52, 63], fL: [52, 81], kR: [51, 64], fR: [51, 81] },
    ),
    arrows: [],
    frames: [{ t: 0, label: 'Mantén la posición' }],
    prop: 'pared',
  },
  flexor: {
    label: 'Flexor de cadera',
    at: between(
      { head: [56, 26], neck: [56, 36], hip: [56, 60], eL: [57, 48], hL: [58, 58], eR: [56, 48], hR: [57, 58], kL: [74, 62], fL: [74, 81], kR: [44, 80], fR: [30, 81] },
      { head: [60, 26], neck: [60, 36], hip: [61, 61], eL: [61, 48], hL: [62, 58], eR: [60, 48], hR: [61, 58], kL: [76, 62], fL: [74, 81], kR: [46, 80], fR: [30, 81] },
    ),
    arrows: ['M50 52 L66 52'],
    frames: STD_FRAMES,
  },
  'sin-ilustracion': {
    label: 'Sin ilustración',
    at: () => STAND,
    arrows: [],
    frames: [{ t: 0, label: 'Sin ilustración' }],
    generic: true,
    noDrawing: true,
  },
} as Record<string, Anim>);

Object.assign(ANIMS, ANIMS_EXTRA);

export const POSE_OPTIONS = Object.entries(ANIMS)
  .filter(([k]) => k !== 'estiramiento')
  .map(([k, v]) => ({ key: k, label: k === 'generico' ? 'Genérica (movimiento por definir)' : v.label }));

export const animFor = (key: string) => ANIMS[key] ?? ANIMS.generico;
