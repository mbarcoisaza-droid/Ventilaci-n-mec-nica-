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
  /** Ficha pendiente de confirmación: dibujo neutral sin técnica. */
  pending?: boolean;
  /** Equipo que se dibuja sobre la figura (mancuernas, barra, banda…). */
  equip?: string[];
  /** Equipo fijo dibujado como trazos SVG (bancos, cajas, máquinas). */
  shapes?: string[];
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

// ───────── Animaciones con equipo (v2) ─────────
const smooth = (u: number) => u * u * (3 - 2 * u);
/** Recorre varias poses en ciclo (A → B → C → … → A) con transiciones suaves. */
const seq = (poses: Pose[]) => (t: number) => {
  const n = poses.length;
  const x = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(x);
  return mix(poses[i], poses[(i + 1) % n], smooth(x - i));
};

const S_STAND: Pose = { ...SIDE_STAND, eL: [60, 36], hL: [61, 48], eR: [59, 36], hR: [60, 48] };
const F_STAND: Pose = STAND;
const BENCH_LOW = 'M30 64 H74 V68 H30 Z M36 68 V84 M68 68 V84';
const BENCH_BACK = 'M38 66 H72 V70 H38 Z M44 70 V84 M66 70 V84 M38 66 L34 30 L38 30 L42 66';
const BOX = (x: number, y: number, w: number) => `M${x} ${y} H${x + w} V84 H${x} Z`;

Object.assign(ANIMS_EXTRA, {
  pendiente: {
    label: 'Descripción por confirmar',
    at: () => STAND,
    arrows: [],
    frames: [{ t: 0, label: 'Por confirmar' }],
    generic: true,
    pending: true,
  },
  skipping: {
    label: 'Saltos suaves',
    at: (t: number) => {
      const k = Math.sin(2 * Math.PI * t);
      const up = Math.max(0, k);
      const up2 = Math.max(0, -k);
      const lift = -2 * Math.abs(k);
      return shift(
        {
          ...S_STAND,
          kL: [59 + 10 * up, 64 - 10 * up], fL: [58 + 3 * up, 81 - 11 * up],
          kR: [57 + 10 * up2, 64 - 10 * up2], fR: [58 + 3 * up2, 81 - 11 * up2],
          eL: [58 - 5 * k, 35], hL: [62 - 4 * k, 28 + 6 * Math.abs(k)], eR: [58 + 5 * k, 35], hR: [62 + 4 * k, 28 + 6 * Math.abs(k)],
        },
        0,
        lift,
      );
    },
    arrows: ['M84 74 L84 58', 'M36 58 L36 74'],
    frames: [
      { t: 0, label: 'Inicio' },
      { t: 0.25, label: 'Rodilla arriba' },
      { t: 0.75, label: 'Cambia de pierna' },
    ],
  },
  'sentadilla-profunda': {
    label: 'Sentadilla profunda sostenida',
    at: (t: number) => {
      const DEEP: Pose = { head: [58, 34], neck: [56, 43], hip: [48, 70], eL: [64, 56], hL: [62, 50], eR: [63, 57], hR: [61, 51], kL: [66, 60], fL: [58, 81], kR: [65, 61], fR: [57, 81] };
      const k = t < 0.3 ? smooth(t / 0.3) : t < 0.8 ? 1 : 1 - smooth((t - 0.8) / 0.2);
      return mix(S_STAND, DEEP, k);
    },
    arrows: ['M30 30 L30 60'],
    frames: [
      { t: 0, label: 'De pie' },
      { t: 0.15, label: 'Baja' },
      { t: 0.55, label: 'Mantén abajo' },
    ],
  },
  shinbox: {
    label: 'Cambio 90/90',
    at: seq([
      { head: [60, 34], neck: [60, 44], hip: [60, 72], eL: [50, 58], hL: [46, 74], eR: [70, 58], hR: [74, 74], kL: [40, 70], fL: [56, 79], kR: [46, 77], fR: [32, 80] },
      { head: [60, 34], neck: [60, 44], hip: [60, 72], eL: [50, 58], hL: [46, 74], eR: [70, 58], hR: [74, 74], kL: [52, 58], fL: [48, 80], kR: [68, 58], fR: [72, 80] },
      { head: [60, 34], neck: [60, 44], hip: [60, 72], eL: [50, 58], hL: [46, 74], eR: [70, 58], hR: [74, 74], kL: [74, 77], fL: [88, 80], kR: [80, 70], fR: [64, 79] },
      { head: [60, 34], neck: [60, 44], hip: [60, 72], eL: [50, 58], hL: [46, 74], eR: [70, 58], hR: [74, 74], kL: [52, 58], fL: [48, 80], kR: [68, 58], fR: [72, 80] },
    ]),
    arrows: ['M38 56 Q60 40 82 56', 'M82 56 Q60 40 38 56'],
    frames: [
      { t: 0, label: 'Rodillas a un lado' },
      { t: 0.25, label: 'Rota' },
      { t: 0.5, label: 'Rodillas al otro lado' },
    ],
    prop: 'colchoneta',
  },
  straddle: {
    label: 'Piernas separadas dinámico',
    at: (t: number) => {
      const base: Pose = { ...F_STAND, kL: [46, 64], fL: [34, 81], kR: [74, 64], fR: [86, 81], eL: [52, 36], hL: [54, 46], eR: [68, 36], hR: [66, 46] };
      const L: Pose = { ...base, hip: [48, 56], neck: [52, 31], head: [53, 21], kL: [40, 66], kR: [70, 68], eL: [44, 44], hL: [42, 56], eR: [60, 44], hR: [58, 56] };
      const R: Pose = { ...base, hip: [72, 56], neck: [68, 31], head: [67, 21], kL: [50, 68], kR: [80, 66], eL: [60, 44], hL: [62, 56], eR: [76, 44], hR: [78, 56] };
      return seq([base, L, base, R])(t);
    },
    arrows: ['M60 72 L36 72', 'M60 72 L84 72'],
    frames: [
      { t: 0, label: 'Centro' },
      { t: 0.25, label: 'Cadera a un lado' },
      { t: 0.75, label: 'Al otro lado' },
    ],
  },
  pica: {
    label: 'Pica sentado',
    at: between(
      { head: [44, 46], neck: [46, 56], hip: [48, 79], eL: [54, 66], hL: [62, 74], eR: [53, 67], hR: [61, 75], kL: [72, 79], fL: [98, 79], kR: [72, 79], fR: [98, 79] },
      { head: [74, 62], neck: [66, 64], hip: [48, 79], eL: [78, 70], hL: [92, 75], eR: [77, 71], hR: [91, 76], kL: [72, 79], fL: [98, 79], kR: [72, 79], fR: [98, 79] },
    ),
    arrows: ['M44 36 Q66 34 80 52'],
    frames: [
      { t: 0, label: 'Sentado' },
      { t: 0.25, label: 'Inclina desde la cadera' },
      { t: 0.5, label: 'Alcanza las piernas' },
    ],
    prop: 'colchoneta',
  },
  'figura-cuatro': {
    label: 'Figura cuatro',
    at: between(
      { ...SUPINE, kR: [72, 62], fR: [80, 79], kL: [72, 52], fL: [70, 62], eL: [52, 70], hL: [66, 66], eR: [51, 71], hR: [65, 67] },
      { ...SUPINE, kR: [64, 52], fR: [76, 44], kL: [64, 42], fL: [64, 52], eL: [48, 66], hL: [60, 56], eR: [47, 67], hR: [59, 57] },
    ),
    arrows: ['M88 62 Q86 44 74 38'],
    frames: [
      { t: 0, label: 'Tobillo sobre el muslo' },
      { t: 0.25, label: 'Acerca el muslo' },
      { t: 0.5, label: 'Estiramiento' },
    ],
    prop: 'colchoneta',
  },
  thomas: {
    label: 'Estiramiento de Thomas',
    at: between(
      { head: [22, 55], neck: [30, 58], hip: [60, 59], eL: [40, 50], hL: [50, 46], eR: [39, 51], hR: [49, 47], kR: [54, 44], fR: [66, 46], kL: [78, 58], fL: [92, 66] },
      { head: [22, 55], neck: [30, 58], hip: [60, 59], eL: [38, 50], hL: [46, 42], eR: [37, 51], hR: [45, 43], kR: [48, 42], fR: [60, 42], kL: [78, 64], fL: [84, 81] },
    ),
    arrows: ['M90 56 Q96 70 88 80', 'M60 34 L46 34'],
    frames: [
      { t: 0, label: 'En el borde del banco' },
      { t: 0.25, label: 'Rodilla al pecho' },
      { t: 0.5, label: 'Pierna relajada abajo' },
    ],
    shapes: ['M14 60 H70 V64 H14 Z M20 64 V84 M64 64 V84'],
  },
  'remo-pecho': {
    label: 'Remo con apoyo en el pecho',
    at: between(
      { head: [74, 38], neck: [66, 44], hip: [38, 64], eL: [66, 56], hL: [66, 68], eR: [65, 57], hR: [65, 69], kL: [24, 70], fL: [24, 84], kR: [23, 71], fR: [23, 84] },
      { head: [74, 38], neck: [66, 44], hip: [38, 64], eL: [56, 46], hL: [60, 56], eR: [55, 47], hR: [59, 57], kL: [24, 70], fL: [24, 84], kR: [23, 71], fR: [23, 84] },
    ),
    arrows: ['M82 70 L82 52'],
    frames: STD_FRAMES,
    equip: ['mancuernas'],
    shapes: ['M30 70 L70 44 L73 48 L33 74 Z M40 70 V84 M64 56 V84'],
  },
  'press-sentado': {
    label: 'Press de hombros sentado',
    at: between(
      { head: [44, 24], neck: [44, 34], hip: [46, 64], eL: [54, 42], hL: [54, 30], eR: [53, 43], hR: [53, 31], kL: [70, 64], fL: [72, 82], kR: [69, 65], fR: [71, 82] },
      { head: [44, 24], neck: [44, 34], hip: [46, 64], eL: [50, 18], hL: [50, 4], eR: [49, 19], hR: [49, 5], kL: [70, 64], fL: [72, 82], kR: [69, 65], fR: [71, 82] },
    ),
    arrows: ['M70 30 L70 8'],
    frames: STD_FRAMES,
    equip: ['mancuernas'],
    shapes: [BENCH_BACK],
  },
  'leg-raise-banco': {
    label: 'Elevación de piernas en banco',
    at: between(
      { head: [20, 57], neck: [28, 59], hip: [58, 60], eL: [20, 50], hL: [14, 58], eR: [19, 51], hR: [13, 59], kL: [78, 60], fL: [98, 60], kR: [78, 60], fR: [98, 60] },
      { head: [20, 57], neck: [28, 59], hip: [58, 60], eL: [20, 50], hL: [14, 58], eR: [19, 51], hR: [13, 59], kL: [62, 41], fL: [64, 22], kR: [61, 41], fR: [63, 22] },
    ),
    arrows: ['M102 54 Q100 28 76 22'],
    frames: STD_FRAMES,
    shapes: ['M10 62 H74 V66 H10 Z M16 66 V84 M68 66 V84'],
  },
  'curl-concentracion': {
    label: 'Curl de concentración',
    at: between(
      { head: [64, 30], neck: [60, 39], hip: [48, 62], eL: [68, 56], hL: [70, 72], eR: [58, 50], hR: [64, 60], kL: [72, 62], fL: [74, 82], kR: [70, 63], fR: [72, 82] },
      { head: [64, 30], neck: [60, 39], hip: [48, 62], eL: [68, 56], hL: [64, 44], eR: [58, 50], hR: [64, 60], kL: [72, 62], fL: [74, 82], kR: [70, 63], fR: [72, 82] },
    ),
    arrows: ['M84 72 Q88 54 74 42'],
    frames: STD_FRAMES,
    equip: ['mancuerna'],
    shapes: [BENCH_LOW],
  },
  'flexion-banco': {
    label: 'Flexión con manos en banco',
    at: between(
      { head: [24, 33], neck: [32, 38], hip: [68, 58], eL: [31, 48], hL: [30, 58], eR: [30, 48], hR: [29, 58], kL: [86, 70], fL: [104, 81], kR: [86, 70], fR: [104, 81] },
      { head: [26, 46], neck: [34, 50], hip: [69, 64], eL: [44, 50], hL: [30, 58], eR: [43, 51], hR: [29, 58], kL: [87, 73], fL: [104, 81], kR: [87, 73], fR: [104, 81] },
    ),
    arrows: ['M50 28 L50 44'],
    frames: STD_FRAMES,
    shapes: ['M14 58 H42 V62 H14 Z M18 62 V84 M38 62 V84'],
  },
  'triceps-polea': {
    label: 'Extensión de tríceps en polea',
    at: between({ ...S_STAND, eL: [60, 36], hL: [66, 28], eR: [59, 37], hR: [65, 29] }, { ...S_STAND, eL: [60, 36], hL: [64, 52], eR: [59, 37], hR: [63, 53] }),
    arrows: ['M50 28 L50 50'],
    frames: STD_FRAMES,
    equip: ['cable:84,4'],
    shapes: ['M86 2 H92 V84 H86 Z'],
  },
  'curl-alterno': {
    label: 'Curl alterno',
    at: (t: number) => {
      const a = t < 0.5 ? pingpong(t * 2) : 0;
      const b = t >= 0.5 ? pingpong((t - 0.5) * 2) : 0;
      return { ...S_STAND, eL: [60, 36], hL: lerp([61, 48], [66, 28], a), eR: [57, 36], hR: lerp([58, 48], [63, 28], b) };
    },
    arrows: ['M80 46 Q84 34 74 24'],
    frames: [
      { t: 0, label: 'Brazos abajo' },
      { t: 0.25, label: 'Sube un brazo' },
      { t: 0.75, label: 'Sube el otro' },
    ],
    equip: ['mancuernas'],
  },
  'triceps-sobre-cabeza': {
    label: 'Tríceps sobre la cabeza',
    at: between(
      { head: [52, 26], neck: [52, 36], hip: [52, 64], eL: [56, 12], hL: [48, 22], eR: [55, 13], hR: [47, 23], kL: [74, 64], fL: [76, 82], kR: [73, 65], fR: [75, 82] },
      { head: [52, 26], neck: [52, 36], hip: [52, 64], eL: [56, 12], hL: [56, 0], eR: [55, 13], hR: [55, 1], kL: [74, 64], fL: [76, 82], kR: [73, 65], fR: [75, 82] },
    ),
    arrows: ['M70 22 Q74 10 64 4'],
    frames: STD_FRAMES,
    equip: ['mancuerna-2manos'],
    shapes: [BENCH_LOW],
  },
  'triceps-banda': {
    label: 'Tríceps sobre la cabeza con banda',
    at: between(
      { ...shift(S_STAND, 0, 8), eL: [66, 12], hL: [54, 22], eR: [52, 46], hR: [50, 56] },
      { ...shift(S_STAND, 0, 8), eL: [66, 12], hL: [70, 0], eR: [52, 46], hR: [50, 56] },
    ),
    arrows: ['M84 26 Q90 10 76 2'],
    frames: STD_FRAMES,
  },
  'curl-sin-peso': {
    label: 'Curl de bíceps',
    at: between(S_STAND, { ...S_STAND, eL: [60, 36], hL: [66, 26], eR: [59, 36], hR: [65, 27] }),
    arrows: ['M80 46 Q84 34 74 24'],
    frames: STD_FRAMES,
  },
  sumo: {
    label: 'Sentadilla sumo',
    at: between(
      { ...F_STAND, kL: [48, 64], fL: [40, 81], kR: [72, 64], fR: [80, 81], eL: [52, 36], hL: [58, 40], eR: [68, 36], hR: [62, 40] },
      { head: [60, 28], neck: [60, 38], hip: [60, 62], eL: [52, 50], hL: [58, 52], eR: [68, 50], hR: [62, 52], kL: [42, 64], fL: [40, 81], kR: [78, 64], fR: [80, 81] },
    ),
    arrows: ['M100 30 L100 56'],
    frames: STD_FRAMES,
  },
  'goblet-talones': {
    label: 'Sentadilla goblet con talones elevados',
    at: between(
      { ...S_STAND, eL: [62, 34], hL: [64, 30], eR: [61, 35], hR: [63, 31], fL: [58, 79], fR: [58, 79] },
      { head: [58, 32], neck: [55, 41], hip: [46, 62], eL: [62, 50], hL: [62, 44], eR: [61, 51], hR: [61, 45], kL: [67, 61], fL: [58, 79], kR: [66, 62], fR: [58, 79] },
    ),
    arrows: ['M30 30 L30 56'],
    frames: STD_FRAMES,
    equip: ['mancuerna-pecho'],
    shapes: ['M50 79 L62 79 L62 84 L50 84 Z'],
  },
  'puente-pesa': {
    label: 'Puente con pesa rusa',
    at: between(BRIDGE_DOWN, BRIDGE_UP),
    arrows: ['M58 46 L58 30'],
    frames: STD_FRAMES,
    prop: 'colchoneta',
    equip: ['pesa-rusa'],
  },
  'escalon-mancuernas': {
    label: 'Subida al escalón con mancuernas',
    at: between(
      { ...S_STAND, kL: [70, 58], fL: [74, 66], hip: [58, 48] },
      { ...shift(S_STAND, 12, -16), kL: [72, 50], fL: [74, 66], kR: [70, 52], fR: [74, 66] },
    ),
    arrows: ['M40 60 Q50 30 70 26'],
    frames: STD_FRAMES,
    prop: 'caja',
    equip: ['mancuernas'],
  },
  'empuje-una-pierna': {
    label: 'Puente a una pierna con hombros elevados',
    at: between(
      { head: [22, 52], neck: [30, 60], hip: [52, 76], eL: [40, 62], hL: [50, 70], eR: [39, 63], hR: [49, 71], kL: [72, 60], fL: [80, 80], kR: [70, 64], fR: [90, 58] },
      { head: [22, 52], neck: [30, 60], hip: [54, 60], eL: [40, 58], hL: [50, 62], eR: [39, 59], hR: [49, 63], kL: [74, 60], fL: [80, 80], kR: [74, 50], fR: [96, 44] },
    ),
    arrows: ['M54 46 L54 30'],
    frames: STD_FRAMES,
    prop: 'banco',
  },
  'extension-maquina': {
    label: 'Extensión de rodilla en máquina',
    at: between(
      { head: [46, 24], neck: [46, 34], hip: [52, 62], eL: [54, 50], hL: [58, 62], eR: [53, 51], hR: [57, 63], kL: [72, 62], fL: [74, 80], kR: [71, 63], fR: [73, 80] },
      { head: [46, 24], neck: [46, 34], hip: [52, 62], eL: [54, 50], hL: [58, 62], eR: [53, 51], hR: [57, 63], kL: [72, 62], fL: [92, 58], kR: [71, 63], fR: [91, 59] },
    ),
    arrows: ['M84 82 Q100 76 98 60'],
    frames: STD_FRAMES,
    equip: ['rodillo'],
    shapes: ['M44 66 H76 V70 H44 Z M44 70 V84 M70 70 V84 M40 66 L36 22 L40 22 L44 66'],
  },
  pared: {
    label: 'Sentadilla isométrica contra la pared',
    at: between(
      { head: [30, 16], neck: [30, 26], hip: [30, 50], eL: [34, 38], hL: [38, 48], eR: [33, 39], hR: [37, 49], kL: [32, 66], fL: [36, 81], kR: [31, 66], fR: [35, 81] },
      { head: [30, 31], neck: [30, 41], hip: [30, 62], eL: [36, 50], hL: [44, 58], eR: [35, 51], hR: [43, 59], kL: [52, 62], fL: [52, 81], kR: [51, 63], fR: [51, 81] },
    ),
    arrows: ['M66 24 L66 50'],
    frames: [
      { t: 0, label: 'Espalda en la pared' },
      { t: 0.25, label: 'Deslízate hacia abajo' },
      { t: 0.5, label: 'Mantén la posición' },
    ],
    prop: 'pared',
  },
  prensa: {
    label: 'Prensa de piernas',
    at: between(
      { head: [20, 44], neck: [26, 52], hip: [44, 72], eL: [36, 64], hL: [46, 72], eR: [35, 65], hR: [45, 73], kL: [58, 50], fL: [74, 58], kR: [57, 51], fR: [73, 59] },
      { head: [20, 44], neck: [26, 52], hip: [44, 72], eL: [36, 64], hL: [46, 72], eR: [35, 65], hR: [45, 73], kL: [66, 58], fL: [88, 48], kR: [65, 59], fR: [87, 49] },
    ),
    arrows: ['M70 34 L90 26'],
    frames: STD_FRAMES,
    equip: ['plataforma'],
    shapes: ['M18 46 L40 78 L56 78 L56 82 L36 82 L14 48 Z M40 82 V84 M54 82 V84'],
  },
  'empuje-deficit': {
    label: 'Empuje de cadera desde déficit',
    at: between(
      { head: [22, 52], neck: [30, 60], hip: [52, 78], eL: [40, 62], hL: [50, 70], eR: [39, 63], hR: [49, 71], kL: [72, 58], fL: [84, 70], kR: [71, 59], fR: [83, 70] },
      { head: [22, 52], neck: [30, 60], hip: [56, 58], eL: [40, 58], hL: [52, 60], eR: [39, 59], hR: [51, 61], kL: [76, 56], fL: [84, 70], kR: [75, 57], fR: [83, 70] },
    ),
    arrows: ['M56 44 L56 28'],
    frames: STD_FRAMES,
    prop: 'banco',
    equip: ['banda-rodillas'],
    shapes: [BOX(78, 70, 18)],
  },
  'puente-una-pierna': {
    label: 'Puente a una pierna',
    at: between(
      { ...BRIDGE_DOWN, kR: [74, 66], fR: [92, 58] },
      { ...BRIDGE_UP, kR: [78, 52], fR: [98, 44] },
    ),
    arrows: ['M58 46 L58 30'],
    frames: STD_FRAMES,
    prop: 'colchoneta',
  },
  bulgara: {
    label: 'Sentadilla dividida con pie trasero elevado',
    at: between(
      { head: [60, 14], neck: [60, 24], hip: [60, 50], eL: [61, 37], hL: [62, 49], eR: [60, 37], hR: [61, 49], kL: [64, 66], fL: [66, 81], kR: [48, 62], fR: [32, 58] },
      { head: [62, 28], neck: [62, 38], hip: [58, 62], eL: [63, 51], hL: [64, 62], eR: [62, 51], hR: [63, 62], kL: [74, 64], fL: [68, 81], kR: [46, 76], fR: [32, 58] },
    ),
    arrows: ['M92 30 L92 54'],
    frames: STD_FRAMES,
    shapes: ['M16 60 H38 V64 H16 Z M20 64 V84 M34 64 V84'],
  },
  'abduccion-sentado': {
    label: 'Abducción sentado con banda',
    at: between(
      { head: [60, 22], neck: [60, 32], hip: [60, 60], eL: [50, 44], hL: [46, 60], eR: [70, 44], hR: [74, 60], kL: [54, 62], fL: [54, 82], kR: [66, 62], fR: [66, 82] },
      { head: [60, 22], neck: [60, 32], hip: [60, 60], eL: [50, 44], hL: [46, 60], eR: [70, 44], hR: [74, 60], kL: [42, 62], fL: [52, 82], kR: [78, 62], fR: [68, 82] },
    ),
    arrows: ['M50 72 L36 72', 'M70 72 L84 72'],
    frames: STD_FRAMES,
    equip: ['banda-rodillas'],
    shapes: ['M42 62 H78 V66 H42 Z M46 66 V84 M74 66 V84'],
  },
  'zancada-inversa': {
    label: 'Zancada inversa',
    at: between(
      { ...S_STAND, head: [66, 13], neck: [66, 23], hip: [66, 48], kL: [67, 64], fL: [66, 81], kR: [65, 64], fR: [66, 81], eL: [67, 36], hL: [68, 48], eR: [66, 36], hR: [67, 48] },
      { head: [62, 27], neck: [62, 37], hip: [60, 60], eL: [63, 49], hL: [64, 60], eR: [62, 49], hR: [63, 60], kL: [74, 64], fL: [68, 81], kR: [50, 79], fR: [38, 80] },
    ),
    arrows: ['M64 88 L40 88'],
    frames: [
      { t: 0, label: 'De pie' },
      { t: 0.25, label: 'Paso atrás' },
      { t: 0.5, label: 'Baja' },
    ],
  },
  'zancada-caminando': {
    label: 'Zancada caminando',
    at: between(S_STAND, { head: [62, 27], neck: [62, 37], hip: [58, 60], eL: [63, 49], hL: [64, 60], eR: [62, 49], hR: [63, 60], kL: [74, 64], fL: [76, 81], kR: [48, 79], fR: [36, 80] }),
    arrows: ['M60 88 L86 88'],
    frames: [
      { t: 0, label: 'De pie' },
      { t: 0.25, label: 'Paso al frente' },
      { t: 0.5, label: 'Baja y continúa' },
    ],
  },
  excentrica: {
    label: 'Sentadilla excéntrica a una pierna',
    at: (t: number) => {
      const A: Pose = { head: [58, 13], neck: [58, 23], hip: [58, 48], eL: [66, 32], hL: [76, 34], eR: [65, 33], hR: [75, 35], kL: [59, 64], fL: [58, 81], kR: [66, 58], fR: [76, 64] };
      const B: Pose = { head: [60, 32], neck: [56, 41], hip: [44, 62], eL: [66, 46], hL: [78, 46], eR: [65, 47], hR: [77, 47], kL: [64, 64], fL: [58, 81], kR: [66, 64], fR: [86, 66] };
      const k = t < 0.65 ? smooth(t / 0.65) : 1 - smooth((t - 0.65) / 0.35);
      return mix(A, B, k);
    },
    arrows: ['M30 30 L30 58'],
    frames: [
      { t: 0, label: 'Sobre una pierna' },
      { t: 0.3, label: 'Baja lentamente' },
      { t: 0.65, label: 'Abajo' },
    ],
  },
  'salto-sentadilla': {
    label: 'Sentadilla con salto',
    at: seq([S_STAND, SQUAT, shift(S_STAND, 0, -12), S_STAND]),
    arrows: ['M90 60 L90 30'],
    frames: [
      { t: 0, label: 'De pie' },
      { t: 0.25, label: 'Sentadilla' },
      { t: 0.5, label: 'Salto' },
    ],
  },
  'extension-silla': {
    label: 'Extensión de rodilla sentado',
    at: between(
      { head: [48, 24], neck: [48, 34], hip: [50, 62], eL: [52, 48], hL: [54, 62], eR: [51, 49], hR: [53, 63], kL: [70, 62], fL: [72, 82], kR: [69, 63], fR: [71, 82] },
      { head: [48, 24], neck: [48, 34], hip: [50, 62], eL: [52, 48], hL: [54, 62], eR: [51, 49], hR: [53, 63], kL: [70, 62], fL: [90, 60], kR: [69, 63], fR: [71, 82] },
    ),
    arrows: ['M82 82 Q98 78 96 62'],
    frames: STD_FRAMES,
    shapes: ['M36 64 H66 V68 H36 Z M40 68 V84 M62 68 V84 M36 64 L34 26 L38 26 L40 64'],
  },
  'peso-muerto-banda': {
    label: 'Bisagra de cadera con banda',
    at: between(
      { ...S_STAND, hL: [60, 50], hR: [59, 50] },
      { head: [82, 36], neck: [74, 40], hip: [52, 46], eL: [74, 52], hL: [72, 62], eR: [73, 53], hR: [71, 63], kL: [56, 64], fL: [58, 81], kR: [55, 64], fR: [57, 81] },
    ),
    arrows: ['M40 44 Q40 30 56 26'],
    frames: STD_FRAMES,
    equip: ['banda-pie-mano'],
  },
  'puente-abduccion': {
    label: 'Puente con abducción y banda',
    at: seq([
      BRIDGE_DOWN,
      BRIDGE_UP,
      { ...BRIDGE_UP, kL: [80, 56], kR: [72, 62] },
      BRIDGE_UP,
    ]),
    arrows: ['M58 46 L58 30', 'M86 48 L96 42'],
    frames: [
      { t: 0, label: 'Abajo' },
      { t: 0.25, label: 'Eleva la pelvis' },
      { t: 0.5, label: 'Separa las rodillas' },
    ],
    prop: 'colchoneta',
    equip: ['banda-rodillas'],
  },
  fondos: {
    label: 'Fondos en banco',
    at: between(
      { head: [46, 24], neck: [44, 34], hip: [46, 60], eL: [40, 46], hL: [38, 58], eR: [39, 47], hR: [37, 58], kL: [72, 60], fL: [74, 81], kR: [71, 61], fR: [73, 81] },
      { head: [48, 36], neck: [46, 46], hip: [48, 72], eL: [30, 50], hL: [38, 58], eR: [29, 51], hR: [37, 58], kL: [72, 64], fL: [74, 81], kR: [71, 65], fR: [73, 81] },
    ),
    arrows: ['M58 30 L58 54'],
    frames: STD_FRAMES,
    shapes: ['M14 58 H40 V62 H14 Z M18 62 V84 M36 62 V84'],
  },
  'flexion-rodillas': {
    label: 'Flexión con apoyo en rodillas',
    at: between(
      { head: [26, 54], neck: [34, 58], hip: [66, 68], eL: [34, 69], hL: [34, 80], eR: [33, 69], hR: [33, 80], kL: [84, 80], fL: [100, 70], kR: [84, 80], fR: [100, 70] },
      { head: [26, 69], neck: [34, 72], hip: [66, 76], eL: [46, 72], hL: [34, 80], eR: [45, 73], hR: [33, 80], kL: [84, 80], fL: [100, 70], kR: [84, 80], fR: [100, 70] },
    ),
    arrows: ['M20 40 L20 60'],
    frames: STD_FRAMES,
    prop: 'colchoneta',
  },
  walkout: {
    label: 'Caminata de manos',
    at: seq([
      { head: [96, 13], neck: [96, 23], hip: [96, 48], eL: [95, 36], hL: [94, 48], eR: [97, 36], hR: [96, 48], kL: [96, 64], fL: [96, 81], kR: [97, 64], fR: [97, 81] },
      { head: [76, 70], neck: [80, 62], hip: [96, 46], eL: [78, 72], hL: [80, 81], eR: [79, 72], hR: [81, 81], kL: [96, 64], fL: [96, 81], kR: [97, 64], fR: [97, 81] },
      { head: [22, 54], neck: [31, 58], hip: [66, 64], eL: [31, 70], hL: [31, 81], eR: [30, 70], hR: [30, 81], kL: [82, 72], fL: [97, 81], kR: [82, 72], fR: [97, 81] },
      { head: [76, 70], neck: [80, 62], hip: [96, 46], eL: [78, 72], hL: [80, 81], eR: [79, 72], hR: [81, 81], kL: [96, 64], fL: [96, 81], kR: [97, 64], fR: [97, 81] },
    ]),
    arrows: ['M76 88 L36 88', 'M36 88 L76 88'],
    frames: [
      { t: 0, label: 'De pie' },
      { t: 0.25, label: 'Manos al suelo' },
      { t: 0.5, label: 'Plancha alta' },
    ],
  },
  'pull-apart': {
    label: 'Apertura de banda',
    at: between(
      { ...F_STAND, eL: [55, 28], hL: [56, 28], eR: [65, 28], hR: [64, 28] },
      { ...F_STAND, eL: [46, 27], hL: [32, 27], eR: [74, 27], hR: [88, 27] },
    ),
    arrows: ['M52 16 L32 16', 'M68 16 L88 16'],
    frames: STD_FRAMES,
    equip: ['banda-manos'],
  },
  jacks: {
    label: 'Saltos de tijera',
    at: seq([
      { ...F_STAND, kL: [58, 64], fL: [57, 81], kR: [62, 64], fR: [63, 81], eL: [55, 36], hL: [54, 48], eR: [65, 36], hR: [66, 48] },
      { ...shift(F_STAND, 0, -4), kL: [50, 60], fL: [44, 77], kR: [70, 60], fR: [76, 77], eL: [46, 20], hL: [42, 8], eR: [74, 20], hR: [78, 8] },
      { ...F_STAND, kL: [50, 64], fL: [42, 81], kR: [70, 64], fR: [78, 81], eL: [48, 14], hL: [52, 3], eR: [72, 14], hR: [68, 3] },
      { ...shift(F_STAND, 0, -4), kL: [54, 60], fL: [52, 77], kR: [66, 60], fR: [68, 77], eL: [46, 26], hL: [40, 20], eR: [74, 26], hR: [80, 20] },
    ]),
    arrows: ['M40 50 Q30 30 40 12', 'M80 50 Q90 30 80 12'],
    frames: [
      { t: 0, label: 'Pies juntos' },
      { t: 0.25, label: 'Salta y abre' },
      { t: 0.5, label: 'Abierto' },
    ],
  },
} as Record<string, Anim>);
// las animaciones existentes reciben su equipo
const addEquip = (k: string, equip: string[], shapes?: string[]) => {
  const a = ANIMS_EXTRA[k] ?? ANIMS[k];
  if (a) Object.assign(a, { equip, ...(shapes ? { shapes } : {}) });
};
addEquip('elev-lateral', ['mancuernas']);
addEquip('elev-frontal', ['mancuernas']);
addEquip('remo', ['mancuernas']);
addEquip('curl', ['mancuernas']);
addEquip('jalon', ['barra-jalon'], ['M40 60 H66 V64 H40 Z M46 64 V84 M60 64 V84 M70 62 H80 V66 H70 Z']);
addEquip('empuje-cadera', ['barra-cadera']);

Object.assign(ANIMS, ANIMS_EXTRA);

export const POSE_OPTIONS = Object.entries(ANIMS)
  .filter(([k]) => !['estiramiento', 'generico', 'sin-ilustracion'].includes(k))
  .map(([k, v]) => ({ key: k, label: k === 'pendiente' ? 'Descripción por confirmar (dibujo neutral)' : v.label }));

/** Sin animación conocida se usa el dibujo neutral «por confirmar», nunca una figura genérica. */
export const animFor = (key: string) => (key === 'generico' || key === 'estiramiento' || key === 'sin-ilustracion' ? ANIMS.pendiente : ANIMS[key] ?? ANIMS.pendiente);
