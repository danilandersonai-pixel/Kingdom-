// Атмосфера: цвета неба, дальних слоёв леса, затемнения и воды
// в зависимости от времени суток, времени года, погоды и Кровавой луны.

import { type RGB, hex, mix } from '../engine/sprite';
import { clamp, smoothstep } from '../engine/math';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface LayerTone {
  base: RGB;
  shade: RGB;
  light: RGB;
}

export interface Atmosphere {
  skyTop: RGB;
  skyMid: RGB;
  skyHorizon: RGB;
  /** Цвета слоёв фона от дальнего (0) к ближнему. */
  layers: LayerTone[];
  /** Тон хвойных в тех же слоях: осенью они не желтеют, зимой — зелень под снегом. */
  evergreen: LayerTone[];
  cloudBase: RGB;
  cloudLight: RGB;
  cloudShade: RGB;
  /** Затемнение объектов мира (ночь). */
  overlay: RGB;
  overlayAlpha: number;
  /** Цветокоррекция мира умножением: отсвет заката, багрянец Кровавой луны,
   *  серость ненастья. gradeAlpha — сила (0 — без изменений). */
  grade: RGB;
  gradeAlpha: number;
  /** Сила источников света (0 днём, 1 ночью). */
  glow: number;
  starAlpha: number;
  /** Высота солнца и луны над горизонтом: 0 — горизонт, 1 — зенит, <0 — не видно. */
  sunH: number;
  moonH: number;
  sunColor: RGB;
  moonColor: RGB;
  waterDeep: RGB;
  waterAlpha: number;
  fogColor: RGB;
  fogAlpha: number;
  foreground: RGB;
  bloodMoon: boolean;
  /** Фаза луны 0..1 (0 — новолуние, 0.5 — полнолуние). */
  moonPhase: number;
  /** Зимняя ночь — может быть северное сияние. */
  aurora: number;
  /** Экранные доли X солнца и луны (свет спрайтов — слева). */
  sunX: number;
  moonX: number;
  /** Насколько светила видны сквозь тучи (0..1). */
  clear: number;
}

interface Key {
  top: string;
  mid: string;
  hor: string;
  far: string;
  near: string;
  nearLight: string;
  nearShade: string;
  cloud: string;
  cloudLight: string;
  overlay: string;
  overlayAlpha: number;
  glow: number;
  stars: number;
  fog: string;
  fogAlpha: number;
  water: string;
}

// Ключевые кадры палитры. Фаза суток: 0 — рассвет, ~0.62 — закат, ~0.7..0.97 — ночь.
const KEYS: Array<[number, Key]> = [
  [0.0, { top: '#2d3564', mid: '#8a6a8c', hor: '#f0a577', far: '#9a7f98', near: '#2a2536', nearLight: '#7a5a6a', nearShade: '#1a1624', cloud: '#b07a8c', cloudLight: '#f7c29a', overlay: '#3c2440', overlayAlpha: 0.28, glow: 0.45, stars: 0.15, fog: '#e9b8a0', fogAlpha: 0.35, water: '#2c3050' }],
  [0.06, { top: '#4e6a9c', mid: '#a4a0b4', hor: '#f3d0a6', far: '#9eaab4', near: '#2c3a36', nearLight: '#7f8a6a', nearShade: '#1a2422', cloud: '#c9c0c8', cloudLight: '#fbe6cc', overlay: '#403040', overlayAlpha: 0.08, glow: 0.1, stars: 0, fog: '#f0dcc8', fogAlpha: 0.22, water: '#34506a' }],
  [0.14, { top: '#5a86bd', mid: '#90b5d6', hor: '#d9e7e6', far: '#9db8c2', near: '#2a3f35', nearLight: '#5d7a4f', nearShade: '#18261f', cloud: '#dfe8ee', cloudLight: '#ffffff', overlay: '#000000', overlayAlpha: 0, glow: 0, stars: 0, fog: '#dbe8ea', fogAlpha: 0.1, water: '#3a6a80' }],
  [0.45, { top: '#5a86bd', mid: '#90b5d6', hor: '#dde8e2', far: '#a0b9c0', near: '#2a3f35', nearLight: '#5d7a4f', nearShade: '#18261f', cloud: '#dfe8ee', cloudLight: '#ffffff', overlay: '#000000', overlayAlpha: 0, glow: 0, stars: 0, fog: '#dbe8ea', fogAlpha: 0.08, water: '#3a6a80' }],
  [0.56, { top: '#4c6aa0', mid: '#b09aa8', hor: '#f4bf86', far: '#a39aa6', near: '#2d3033', nearLight: '#8a6a4a', nearShade: '#1c1c22', cloud: '#c8a8b0', cloudLight: '#ffd7a0', overlay: '#402818', overlayAlpha: 0.1, glow: 0.1, stars: 0, fog: '#f2c8a0', fogAlpha: 0.2, water: '#3a4a64' }],
  [0.62, { top: '#2e2d5c', mid: '#9a5a78', hor: '#f08a5c', far: '#7a5a78', near: '#241c2c', nearLight: '#8a4a4a', nearShade: '#160f1c', cloud: '#8a5a78', cloudLight: '#ffa070', overlay: '#3a1a38', overlayAlpha: 0.32, glow: 0.55, stars: 0.1, fog: '#d8806a', fogAlpha: 0.25, water: '#2a2446' }],
  [0.68, { top: '#0c1230', mid: '#1c2448', hor: '#34385e', far: '#28304e', near: '#0d1222', nearLight: '#2a3350', nearShade: '#080b16', cloud: '#262c4a', cloudLight: '#48507a', overlay: '#070b1e', overlayAlpha: 0.66, glow: 1, stars: 0.8, fog: '#2c3658', fogAlpha: 0.2, water: '#0d1428' }],
  [0.83, { top: '#070b1d', mid: '#101a36', hor: '#1f2d4f', far: '#1f2b47', near: '#0a0f1c', nearLight: '#24304e', nearShade: '#060913', cloud: '#1c2440', cloudLight: '#3a4670', overlay: '#050818', overlayAlpha: 0.72, glow: 1, stars: 1, fog: '#24304e', fogAlpha: 0.22, water: '#0a1024' }],
  [0.95, { top: '#0e1330', mid: '#252a50', hor: '#4a4266', far: '#2e3050', near: '#0e1020', nearLight: '#303652', nearShade: '#080a14', cloud: '#2c2e50', cloudLight: '#5a5070', overlay: '#0a0c20', overlayAlpha: 0.62, glow: 0.95, stars: 0.7, fog: '#3a3a5a', fogAlpha: 0.3, water: '#10142c' }],
  [1.0, { top: '#2d3564', mid: '#8a6a8c', hor: '#f0a577', far: '#9a7f98', near: '#2a2536', nearLight: '#7a5a6a', nearShade: '#1a1624', cloud: '#b07a8c', cloudLight: '#f7c29a', overlay: '#3c2440', overlayAlpha: 0.28, glow: 0.45, stars: 0.15, fog: '#e9b8a0', fogAlpha: 0.35, water: '#2c3050' }],
];

const BLOOD: Key = {
  top: '#16030a', mid: '#3a0810', hor: '#7a1a18', far: '#461216', near: '#12050a', nearLight: '#4a1418', nearShade: '#0a0206', cloud: '#3a0c12', cloudLight: '#7a2020', overlay: '#1c0308', overlayAlpha: 0.62, glow: 1, stars: 0.35, fog: '#5a1418', fogAlpha: 0.3, water: '#1a0508',
};

interface ParsedKey {
  top: RGB; mid: RGB; hor: RGB; far: RGB; near: RGB; nearLight: RGB; nearShade: RGB;
  cloud: RGB; cloudLight: RGB; overlay: RGB; overlayAlpha: number; glow: number; stars: number;
  fog: RGB; fogAlpha: number; water: RGB;
}

function parse(k: Key): ParsedKey {
  return {
    top: hex(k.top), mid: hex(k.mid), hor: hex(k.hor), far: hex(k.far), near: hex(k.near),
    nearLight: hex(k.nearLight), nearShade: hex(k.nearShade), cloud: hex(k.cloud), cloudLight: hex(k.cloudLight),
    overlay: hex(k.overlay), overlayAlpha: k.overlayAlpha, glow: k.glow, stars: k.stars,
    fog: hex(k.fog), fogAlpha: k.fogAlpha, water: hex(k.water),
  };
}

const PARSED: Array<[number, ParsedKey]> = KEYS.map(([t, k]) => [t, parse(k)]);
const PARSED_BLOOD = parse(BLOOD);

function lerpKey(a: ParsedKey, b: ParsedKey, t: number): ParsedKey {
  const m = (x: RGB, y: RGB) => mix(x, y, t);
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    top: m(a.top, b.top), mid: m(a.mid, b.mid), hor: m(a.hor, b.hor), far: m(a.far, b.far), near: m(a.near, b.near),
    nearLight: m(a.nearLight, b.nearLight), nearShade: m(a.nearShade, b.nearShade), cloud: m(a.cloud, b.cloud),
    cloudLight: m(a.cloudLight, b.cloudLight), overlay: m(a.overlay, b.overlay), overlayAlpha: n(a.overlayAlpha, b.overlayAlpha),
    glow: n(a.glow, b.glow), stars: n(a.stars, b.stars), fog: m(a.fog, b.fog), fogAlpha: n(a.fogAlpha, b.fogAlpha),
    water: m(a.water, b.water),
  };
}

function sample(phase: number): ParsedKey {
  const p = ((phase % 1) + 1) % 1;
  for (let i = 0; i < PARSED.length - 1; i++) {
    const [t0, k0] = PARSED[i];
    const [t1, k1] = PARSED[i + 1];
    if (p >= t0 && p <= t1) {
      const t = (p - t0) / (t1 - t0 || 1);
      return lerpKey(k0, k1, t * t * (3 - 2 * t));
    }
  }
  return PARSED[0][1];
}

// Сезонные оттенки ближнего леса.
const SEASON_TINT: Record<Season, { tint: RGB; amount: number; light: RGB; lightAmount: number }> = {
  spring: { tint: hex('#3a5a3a'), amount: 0.15, light: hex('#8ab86a'), lightAmount: 0.25 },
  summer: { tint: hex('#3c4a2a'), amount: 0.1, light: hex('#a0a860'), lightAmount: 0.15 },
  autumn: { tint: hex('#7a3e1c'), amount: 0.5, light: hex('#e8903a'), lightAmount: 0.6 },
  winter: { tint: hex('#8894a8'), amount: 0.35, light: hex('#e8eef6'), lightAmount: 0.55 },
};

const EVER_TINT: Record<Season, { tint: RGB; amount: number; light: RGB; lightAmount: number }> = {
  spring: { tint: hex('#2c4a34'), amount: 0.22, light: hex('#6a9a5a'), lightAmount: 0.2 },
  summer: { tint: hex('#284232'), amount: 0.2, light: hex('#7a9a58'), lightAmount: 0.12 },
  autumn: { tint: hex('#2a4430'), amount: 0.32, light: hex('#8a9a5a'), lightAmount: 0.22 },
  winter: { tint: hex('#2a3c38'), amount: 0.3, light: hex('#e8eef6'), lightAmount: 0.55 },
};

export interface AtmosphereInput {
  phase: number;
  season: Season;
  /** 0..1 — насколько Кровавая луна (ночь) проявилась. */
  blood: number;
  /** 0..1 — сила дождя/пасмурности. */
  overcast: number;
  /** 0..1 — зимняя белизна (снег). */
  snow: number;
  /** Номер дня (для фазы луны). */
  day?: number;
}

export const LAYER_COUNT = 5;

export function computeAtmosphere(inp: AtmosphereInput): Atmosphere {
  let k = sample(inp.phase);
  const night = nightFactor(inp.phase);
  if (inp.blood > 0) k = lerpKey(k, PARSED_BLOOD, clamp(inp.blood * night, 0, 1));

  // Пасмурность: серее и темнее.
  const oc = inp.overcast;
  if (oc > 0) {
    const grey: RGB = mix(k.hor, hex('#7c8590'), 0.6);
    k = {
      ...k,
      top: mix(k.top, mix(grey, k.top, 0.3), oc * 0.8),
      mid: mix(k.mid, grey, oc * 0.7),
      hor: mix(k.hor, grey, oc * 0.6),
      far: mix(k.far, grey, oc * 0.35),
      cloud: mix(k.cloud, mix(grey, hex('#50565e'), 0.4), oc * 0.8),
      cloudLight: mix(k.cloudLight, grey, oc * 0.7),
      overlayAlpha: Math.max(k.overlayAlpha, oc * 0.18),
      fogAlpha: k.fogAlpha + oc * 0.15,
    };
  }

  // Сезон влияет на ближние слои (с учётом ночи — ночью всё синее).
  const st = SEASON_TINT[inp.season];
  const dayness = 1 - night;
  const near = mix(k.near, st.tint, st.amount * dayness);
  const nearLight = mix(k.nearLight, st.light, st.lightAmount * dayness);
  const nearShade = mix(k.nearShade, st.tint, st.amount * 0.4 * dayness);
  const far = inp.season === 'winter' ? mix(k.far, hex('#c8d2de'), 0.25 * dayness) : k.far;

  const et = EVER_TINT[inp.season];
  const eNear = mix(k.near, et.tint, et.amount * dayness);
  const eLight = mix(k.nearLight, et.light, et.lightAmount * dayness);
  const eShade = mix(k.nearShade, et.tint, et.amount * 0.5 * dayness);
  const layers: LayerTone[] = [];
  const evergreen: LayerTone[] = [];
  for (let i = 0; i < LAYER_COUNT; i++) {
    // i=0 — самый дальний. Чем дальше слой, тем ближе он к цвету горизонта.
    const depth = 1 - i / (LAYER_COUNT - 1); // 1 — дальний, 0 — ближний
    const toward = mix(far, k.hor, 0.35);
    const dB = Math.pow(depth, 0.85);
    const dL = Math.pow(depth, 0.8) * 0.9;
    const dS = Math.pow(depth, 0.9);
    const lightFar = mix(k.hor, k.cloudLight, 0.3);
    const shadeFar = mix(far, k.top, 0.25);
    layers.push({ base: mix(near, toward, dB), shade: mix(nearShade, shadeFar, dS), light: mix(nearLight, lightFar, dL) });
    evergreen.push({ base: mix(eNear, toward, dB), shade: mix(eShade, shadeFar, dS), light: mix(eLight, lightFar, dL) });
  }

  const sunH = sunHeight(inp.phase);
  const moonH = moonHeight(inp.phase);

  // Низкое солнце окрашивает мир в цвет неба; ночью это уже делает затемнение.
  const sunLow = sunH > -0.15 ? 1 - smoothstep(0.06, 0.42, sunH) : 0;
  let grade: RGB = mix(k.hor, k.mid, 0.3);
  let gradeAlpha = 0.5 * sunLow * (1 - night * 0.85);
  const bloodK = clamp(inp.blood * night, 0, 1);
  if (bloodK > 0) {
    grade = mix(grade, hex('#ff4a3a'), bloodK);
    gradeAlpha = Math.max(gradeAlpha, 0.72 * bloodK);
  }
  if (oc > 0) {
    grade = mix(grade, hex('#8a929c'), oc * 0.8);
    gradeAlpha = Math.max(gradeAlpha, 0.3 * oc * (1 - night));
  }

  return {
    skyTop: k.top,
    skyMid: k.mid,
    skyHorizon: k.hor,
    layers,
    evergreen,
    cloudBase: k.cloud,
    cloudLight: k.cloudLight,
    cloudShade: mix(k.cloud, k.top, 0.35),
    overlay: k.overlay,
    overlayAlpha: k.overlayAlpha,
    grade,
    gradeAlpha,
    glow: k.glow,
    starAlpha: k.stars * (1 - oc * 0.9),
    sunH,
    moonH,
    sunColor: mix(hex('#ffd49a'), hex('#fff6e0'), smoothstep(0, 0.5, sunH)),
    moonColor: inp.blood > 0.5 ? hex('#e04030') : hex('#f2f0e0'),
    waterDeep: k.water,
    waterAlpha: 0.34 + night * 0.26,
    fogColor: k.fog,
    fogAlpha: k.fogAlpha,
    foreground: mix(k.nearShade, hex('#000000'), 0.35),
    bloodMoon: inp.blood > 0.5,
    moonPhase: inp.blood > 0.5 ? 0.5 : moonPhaseOf(inp.day ?? 15),
    aurora: inp.season === 'winter' && inp.blood <= 0 ? night * (1 - oc) * (0.55 + 0.45 * Math.sin((inp.day ?? 0) * 1.7)) : 0,
    sunX: 0.27,
    moonX: 0.72,
    clear: 1 - oc * 0.92,
  };
}

/** Фаза луны: полнолуние приходится на 15-й день сезона (ночь Кровавой луны). */
export function moonPhaseOf(day: number): number {
  const d = ((day - 1) % 16) + 1;
  return (((d - 15) / 16 + 0.5) % 1 + 1) % 1;
}

/** 0 днём, 1 глубокой ночью. */
export function nightFactor(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.08) return 1 - smoothstep(0, 0.08, p) * 1;
  if (p < 0.58) return 0;
  if (p < 0.7) return smoothstep(0.58, 0.7, p);
  if (p < 0.96) return 1;
  return 1 - smoothstep(0.96, 1.0, p) * 0.4;
}

function sunHeight(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  // Солнце над горизонтом от фазы -0.02 до 0.64.
  const start = -0.02;
  const end = 0.64;
  const t = (p - start) / (end - start);
  if (t < 0 || t > 1) return -1;
  return Math.sin(t * Math.PI);
}

function moonHeight(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  const start = 0.62;
  const end = 1.04;
  let q = p;
  if (q < 0.2) q += 1;
  const t = (q - start) / (end - start);
  if (t < 0 || t > 1) return -1;
  return Math.sin(t * Math.PI);
}
