// Небольшой набор математических помощников, общих для всей игры.

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : (v - a) / (b - a));

export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Двигает значение к цели не более чем на шаг `step`. */
export const approach = (v: number, target: number, step: number): number =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

/** Экспоненциальное сглаживание, не зависящее от частоты кадров. */
export const damp = (v: number, target: number, rate: number, dt: number): number =>
  lerp(v, target, 1 - Math.exp(-rate * dt));

export const wrap = (v: number, lo: number, hi: number): number => {
  const span = hi - lo;
  return ((((v - lo) % span) + span) % span) + lo;
};

export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

/** Римские цифры для номера дня. */
export function toRoman(n: number): string {
  if (n <= 0) return '';
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [value, sym] of table) {
    while (n >= value) {
      out += sym;
      n -= value;
    }
  }
  return out;
}

/** Хеш двух целых в [0,1) — удобно для детерминированного «шума». */
export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Гладкий одномерный шум по целочисленной решётке. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(i, seed);
  const b = hash2(i + 1, seed);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

/** Фрактальный шум (несколько октав). Результат примерно в [0,1). */
export function fbm1(x: number, seed = 0, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise1(x * freq, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
