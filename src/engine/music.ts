// Генеративная музыка. Инструменты синтезируются на лету: щипковая «лютня»
// по алгоритму Карплуса—Стронга, тёплые пэды из расстроенных пил, мягкий
// бас, колокольчики зимой и барабаны в Кровавую луну. Всё звучит в «зале» —
// свёрточная реверберация с синтетическим откликом.
//
// Мелодия строится из мотивов: такт-вопрос и такт-ответ повторяются,
// переносятся вслед за аккордами и закрываются каденцией, поэтому выходит
// песня, а не поток случайных нот. Настроение (день, ночь, зима, Кровавая
// луна) меняется на границе такта, между песнями бывают передышки.

export interface MusicEnv {
  night: number;
  winter: boolean;
  blood: boolean;
  danger: number;
}

type Mood = 'day' | 'night' | 'winter' | 'blood';

interface MoodParams {
  bpm: number;
  /** MIDI-нота тоники для баса и перебора. */
  root: number;
  /** MIDI-нота нулевой ступени мелодии. */
  mel: number;
  scale: number[];
  /** Ступени аккордов, каждый звучит два такта. */
  progs: number[][];
  /** Вероятность, что двутакт мелодии прозвучит. */
  melody: number;
  lead: 'pluck' | 'bell';
  /** Перебор: [восьмая в такте, ступень от основного тона аккорда]. */
  arp: Array<[number, number]>;
  padCut: number;
  padVol: number;
  /** Срез фильтра щипковых: чем ниже, тем глуше. */
  bright: number;
  /** Вероятность передышки после песни. */
  rest: number;
}

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

const MOODS: Record<Mood, MoodParams> = {
  // Ре дорийский: Dm–G–Dm–C, Dm–F–G–Dm, F–C–Dm, Dm–Am–G–C.
  day: {
    bpm: 76, root: 50, mel: 62, scale: DORIAN,
    progs: [[0, 3, 0, 6], [0, 2, 3, 0], [2, 6, 0, 0], [0, 4, 3, 6]],
    melody: 0.85, lead: 'pluck', arp: [[0, 0], [2, 4], [3, 7], [4, 9], [6, 7]],
    padCut: 1250, padVol: 0.009, bright: 3400, rest: 0.3,
  },
  // Ля эолийский: Am–F–C–G, Am–Dm–Am–Em, F–G–Am, Am–G–F–G.
  night: {
    bpm: 62, root: 45, mel: 69, scale: AEOLIAN,
    progs: [[0, 5, 2, 6], [0, 3, 0, 4], [5, 6, 0, 0], [0, 6, 5, 6]],
    melody: 0.6, lead: 'pluck', arp: [[0, 0], [3, 4], [6, 7]],
    padCut: 720, padVol: 0.011, bright: 1900, rest: 0.4,
  },
  // Ми минор, колокольчики высоко: Em–C–G–D, Em–Am–C–Bm.
  winter: {
    bpm: 66, root: 52, mel: 76, scale: AEOLIAN,
    progs: [[0, 5, 2, 6], [0, 3, 5, 4]],
    melody: 0.75, lead: 'bell', arp: [[0, 0], [4, 7]],
    padCut: 950, padVol: 0.009, bright: 2400, rest: 0.35,
  },
  // Ми фригийский: Em–F–Em–F, Em–F–Dm–Em, Em–C–F–Em — низкое остинато и барабаны.
  blood: {
    bpm: 88, root: 40, mel: 64, scale: PHRYGIAN,
    progs: [[0, 1, 0, 1], [0, 1, 6, 0], [0, 5, 1, 0]],
    melody: 0.5, lead: 'pluck', arp: [],
    padCut: 620, padVol: 0.012, bright: 1500, rest: 0,
  },
};

// Ритмы мотивов: [восьмая в такте, длина в восьмых].
const RHYTHMS: Array<Array<[number, number]>> = [
  [[0, 3], [3, 1], [4, 4]],
  [[0, 2], [2, 2], [4, 2], [6, 2]],
  [[0, 1], [1, 1], [2, 2], [4, 4]],
  [[2, 1], [3, 1], [4, 4]],
  [[0, 4], [4, 2], [6, 2]],
  [[0, 3], [3, 3], [6, 2]],
  [[1, 1], [2, 2], [4, 1], [5, 3]],
];

interface Note {
  step: number;
  len: number;
  /** Абсолютная ступень лада (0 — тоника мелодии). */
  deg: number;
  vel: number;
}

interface Section {
  kind: 'song' | 'breath';
  bars: number;
  /** Ступень аккорда на каждый такт. */
  chords: number[];
  melody: Note[];
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** Полутоны от тоники для ступени лада (ступени могут выходить за октаву). */
function semis(deg: number, scale: number[]): number {
  const o = Math.floor(deg / 7);
  return o * 12 + scale[deg - o * 7];
}

function moodOf(env: MusicEnv): Mood {
  if (env.blood) return 'blood';
  if (env.night > 0.5) return 'night';
  return env.winter ? 'winter' : 'day';
}

/** Отклик зала: стерео-шум с затуханием, который к концу темнеет. */
function hallImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.018);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      lp += (0.8 - 0.62 * t) * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - t, 2.4);
    }
  }
  return buf;
}

/**
 * Струна по Карплусу—Стронгу: щипок шумом по линии задержки с усредняющим
 * фильтром. Высота строится точно через скорость воспроизведения.
 */
function stringBuffer(ctx: BaseAudioContext, midi: number): { buf: AudioBuffer; f0: number } {
  const sr = ctx.sampleRate;
  const f = mtof(midi);
  // Усреднение соседних отсчётов даёт задержку N − 0.5.
  const N = Math.max(4, Math.round(sr / f + 0.5));
  const f0 = sr / (N - 0.5);
  const t60 = Math.max(0.9, Math.min(2.3, 2.3 - (midi - 45) * 0.035));
  const n = Math.floor(sr * t60);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  // Потери за период подобраны под время затухания t60 (−60 дБ).
  const loop = Math.cos((Math.PI * f0) / sr);
  const rho = Math.min(0.99995, Math.pow(0.001, 1 / (f0 * t60)) / loop);
  const line = new Float32Array(N);
  // Мягкий щипок: сглаженный шум без постоянной составляющей, «место щипка» —
  // вычитание сдвинутой копии (как у гитары, щипнутой ближе к подставке).
  const raw = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += 0.55 * (Math.random() * 2 - 1 - lp);
    raw[i] = lp;
  }
  const shift = Math.max(1, Math.round(N * 0.13));
  let mean = 0;
  for (let i = 0; i < N; i++) {
    line[i] = raw[i] - raw[(i + shift) % N];
    mean += line[i];
  }
  mean /= N;
  for (let i = 0; i < N; i++) line[i] -= mean;
  let idx = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = line[idx];
    const nx = idx + 1 === N ? 0 : idx + 1;
    d[i] = a;
    line[idx] = rho * 0.5 * (a + line[nx]);
    idx = nx;
    const v = a < 0 ? -a : a;
    if (v > peak) peak = v;
  }
  // Нормировка и короткое затухание в конце буфера — без щелчка.
  const k = peak > 0 ? 1 / peak : 1;
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < n; i++) d[i] *= k * (i > n - fade ? (n - i) / fade : 1);
  return { buf, f0 };
}

export class Music {
  private bus: GainNode;
  private pluckIn: BiquadFilterNode;
  private noise: AudioBuffer;
  private strings = new Map<number, { buf: AudioBuffer; f0: number }>();
  private env: MusicEnv = { night: 0, winter: false, blood: false, danger: 0 };
  private mood: Mood = 'day';
  private stepDur = 30 / MOODS.day.bpm;
  private next = 0;
  private pos = 0;
  private section: Section | null = null;
  private padMean = 0;

  constructor(private ctx: BaseAudioContext, dest: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 1.4;
    this.bus.connect(dest);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    const hall = ctx.createConvolver();
    hall.buffer = hallImpulse(ctx, 2.6);
    this.bus.connect(send);
    send.connect(hall);
    hall.connect(dest);
    this.pluckIn = ctx.createBiquadFilter();
    this.pluckIn.type = 'lowpass';
    this.pluckIn.frequency.value = MOODS.day.bright;
    this.pluckIn.Q.value = 0.5;
    this.pluckIn.connect(this.bus);
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
  }

  setEnv(env: MusicEnv): void {
    this.env = env;
  }

  /** Раз в кадр: планирует ноты чуть вперёд по часам звука. */
  update(env: MusicEnv): void {
    this.env = env;
    const now = this.ctx.currentTime;
    // После паузы или скрытой вкладки пропущенные шаги не догоняем.
    if (this.next < now - 0.25) this.next = now + 0.1;
    this.schedule(now + 0.4);
  }

  schedule(until: number): void {
    while (this.next < until) {
      this.tick(this.next);
      this.next += this.stepDur;
    }
  }

  // ——— Сочинение ———

  private tick(at: number): void {
    if (this.pos % 8 === 0) this.barStart(at);
    const s = this.section!;
    const P = MOODS[this.mood];
    const bar = Math.floor(this.pos / 8);
    const step = this.pos % 8;
    const chord = s.chords[bar];
    if (s.kind === 'song') {
      for (const [st, deg] of P.arp) {
        if (st !== step) continue;
        const midi = P.root + semis(chord + deg, P.scale);
        const accent = st === 0 ? 1 : 0.8;
        this.pluck(midi, at + this.humanize(), 0.1 * accent, { pan: (deg % 3) * 0.15 - 0.15 });
      }
      if (this.mood === 'blood') this.bloodPulse(at, bar, step, chord);
      for (const n of s.melody) {
        if (n.step !== this.pos) continue;
        const midi = P.mel + semis(n.deg, P.scale);
        const pan = Math.random() * 0.5 - 0.25;
        if (P.lead === 'bell') this.bell(midi, at, 0.06 * n.vel, pan);
        else this.pluck(midi, at + this.humanize(), 0.22 * n.vel, { pan });
      }
    }
    this.pos++;
  }

  private humanize(): number {
    return Math.random() * 0.012;
  }

  private barStart(at: number): void {
    const mood = moodOf(this.env);
    if (mood !== this.mood || !this.section || this.pos / 8 >= this.section.bars) {
      const changed = mood !== this.mood || !this.section;
      const prev = this.section;
      this.mood = mood;
      const P = MOODS[mood];
      this.stepDur = 30 / P.bpm;
      this.pluckIn.frequency.setTargetAtTime(P.bright, at, 0.4);
      const breath = !changed && prev?.kind === 'song' && Math.random() < P.rest;
      this.section = breath ? this.breath() : this.song(P);
      this.pos = 0;
    }
    const s = this.section!;
    const P = MOODS[this.mood];
    const b = Math.floor(this.pos / 8);
    const bar = this.stepDur * 8;
    const chord = s.chords[b];
    // Пэд — на смену аккорда, бас — на каждый такт.
    if (b === 0 || chord !== s.chords[b - 1]) {
      let len = 1;
      while (b + len < s.bars && s.chords[b + len] === chord) len++;
      const vol = s.kind === 'breath' ? P.padVol * 0.7 : P.padVol;
      if (s.kind === 'song' || this.mood !== 'day') this.pad(this.voicing(chord, P), at, bar * len, vol, P.padCut);
    }
    if (s.kind === 'song') this.bass(P.root - 12 + semis(chord, P.scale), at, bar, this.mood === 'blood' ? 0.11 : 0.08);
    // Ночью рядом Жадность — глухое сердцебиение.
    if (this.mood === 'night' && this.env.danger >= 3) {
      const k = Math.min(1, (this.env.danger - 2) / 10);
      this.drum(at, 0.1 * k, 70);
      this.drum(at + 0.24, 0.07 * k, 62);
    }
  }

  private breath(): Section {
    return { kind: 'breath', bars: 4, chords: [0, 0, 0, 0], melody: [] };
  }

  private song(P: MoodParams): Section {
    const prog = pick(P.progs);
    const chords = prog.flatMap((c) => [c, c]);
    return { kind: 'song', bars: chords.length, chords, melody: this.compose(chords, P) };
  }

  /** Контур мотива: движение в основном по соседним ступеням, конец — на звуке аккорда. */
  private contour(n: number): number[] {
    const out: number[] = [];
    let d = pick([0, 2, 4]);
    for (let i = 0; i < n; i++) {
      out.push(d);
      d = Math.max(-2, Math.min(7, d + pick([-2, -1, -1, 1, 1, 2])));
    }
    const last = out[n - 1];
    out[n - 1] = [0, 2, 4, 7].reduce((b, c) => (Math.abs(c - last) < Math.abs(b - last) ? c : b), 0);
    return out;
  }

  private compose(chords: number[], P: MoodParams): Note[] {
    const rA = pick(RHYTHMS);
    const rB = pick(RHYTHMS);
    const cA = this.contour(rA.length);
    const cB = this.contour(rB.length);
    const phrases = [0, 1, 2, 3].map(() => Math.random() < P.melody);
    const notes: Note[] = [];
    for (let b = 0; b < chords.length; b++) {
      if (!phrases[b >> 1]) continue;
      let bar: Array<[number, number, number]>;
      if (b === 3) {
        // Полукаденция: долгий звук аккорда.
        const t = pick([2, 4]);
        bar = [[0, 2, cB[cB.length - 1]], [2, 6, t]];
      } else if (b === 7) {
        // Каденция: на основной тон.
        bar = [[0, 2, 2], [2, 6, 0]];
      } else if (b === 1 || b === 5) {
        bar = rB.map(([s, l], i) => [s, l, cB[i]]);
      } else {
        const up = b === 4 ? 2 : 0;
        bar = rA.map(([s, l], i) => [s, l, cA[i] + up]);
      }
      // Держим мелодию в удобном диапазоне: при выходе переносим такт на октаву.
      let shift = 0;
      const pitches = bar.map(([, , d]) => semis(chords[b] + d, P.scale));
      if (Math.max(...pitches) > 17) shift = -7;
      else if (Math.min(...pitches) < -5) shift = 7;
      for (const [s, l, d] of bar) {
        const strong = s === 0 || s === 4;
        notes.push({ step: b * 8 + s, len: l, deg: chords[b] + d + shift, vel: (strong ? 0.95 : 0.78) + Math.random() * 0.08 });
      }
    }
    return notes;
  }

  /** Трезвучие для пэда в обращении, ближайшем к предыдущему. */
  private voicing(chord: number, P: MoodParams): number[] {
    const base = P.root + 12;
    const center = this.padMean || base + 7;
    let best: number[] = [];
    let bd = Infinity;
    for (let inv = 0; inv < 3; inv++) {
      for (const oct of [-12, 0, 12]) {
        const notes = [0, 2, 4].map((k, i) => base + oct + semis(chord + k, P.scale) + (i < inv ? 12 : 0));
        const mean = notes.reduce((a, c) => a + c, 0) / 3;
        const dist = Math.abs(mean - center) + Math.abs(mean - (base + 7)) * 0.5;
        if (dist < bd) {
          bd = dist;
          best = notes;
        }
      }
    }
    this.padMean = best.reduce((a, c) => a + c, 0) / 3;
    return best;
  }

  /** Кровавая луна: глухое остинато восьмыми и барабаны «три-три-два». */
  private bloodPulse(at: number, bar: number, step: number, chord: number): void {
    const P = MOODS.blood;
    const up = step === 6 && bar % 2 === 1 ? 1 : 0;
    const midi = P.root + semis(chord + up, P.scale);
    const accent = step === 0 || step === 3 || step === 6;
    this.pluck(midi, at, accent ? 0.16 : 0.09, { mute: 0.09 });
    if (accent) this.drum(at, step === 0 ? 0.34 : 0.22, step === 0 ? 96 : 118);
  }

  // ——— Инструменты ———

  private string(midi: number): { buf: AudioBuffer; f0: number } {
    let s = this.strings.get(midi);
    if (!s) {
      s = stringBuffer(this.ctx, midi);
      this.strings.set(midi, s);
      if (this.strings.size > 48) this.strings.delete(this.strings.keys().next().value!);
    }
    return s;
  }

  private panned(node: AudioNode, pan: number): AudioNode {
    const ctx = this.ctx;
    if (!pan || !ctx.createStereoPanner) return node;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    return p;
  }

  pluck(midi: number, at: number, vol: number, opts: { pan?: number; mute?: number } = {}): void {
    const ctx = this.ctx;
    const s = this.string(midi);
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = mtof(midi) / s.f0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    if (opts.mute) g.gain.setTargetAtTime(0, at + opts.mute, opts.mute * 0.5);
    src.connect(g);
    this.panned(g, opts.pan ?? 0).connect(this.pluckIn);
    src.start(at);
    if (opts.mute) src.stop(at + opts.mute * 6);
  }

  private pad(midis: number[], at: number, dur: number, vol: number, cut: number): void {
    const ctx = this.ctx;
    const rel = 1.6;
    const atk = Math.min(1.4, dur * 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + atk);
    g.gain.setValueAtTime(vol, at + dur);
    g.gain.linearRampToValueAtTime(0, at + dur + rel);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.6;
    f.frequency.setValueAtTime(cut * 0.6, at);
    f.frequency.linearRampToValueAtTime(cut, at + dur * 0.5);
    f.frequency.linearRampToValueAtTime(cut * 0.7, at + dur + rel);
    f.connect(g);
    g.connect(this.bus);
    for (const m of midis) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(f);
        o.start(at);
        o.stop(at + dur + rel + 0.05);
      }
    }
  }

  private bass(midi: number, at: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.03);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, at + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur * 1.1);
    g.connect(this.bus);
    const f = mtof(midi);
    for (const [mul, type, v] of [[1, 'sine', 1], [2, 'triangle', 0.18]] as Array<[number, OscillatorType, number]>) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og);
      og.connect(g);
      o.start(at);
      o.stop(at + dur * 1.1 + 0.05);
    }
  }

  /** Колокольчик музыкальной шкатулки: основной тон и быстро гаснущие обертоны. */
  private bell(midi: number, at: number, vol: number, pan: number): void {
    const ctx = this.ctx;
    const f = mtof(midi);
    const out = ctx.createGain();
    out.gain.value = 1;
    this.panned(out, pan).connect(this.bus);
    for (const [mul, v, d] of [[1, 1, 2], [2, 0.3, 1], [3, 0.1, 0.5], [4.16, 0.06, 0.3]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * v, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(g);
      g.connect(out);
      o.start(at);
      o.stop(at + d + 0.05);
    }
  }

  /** Большой барабан: тон с падающей высотой и короткий шумовой удар. */
  private drum(at: number, vol: number, pitch: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(pitch, at);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.42, at + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    o.connect(g);
    g.connect(this.bus);
    o.start(at);
    o.stop(at + 0.65);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.4, at);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    n.connect(f);
    f.connect(ng);
    ng.connect(this.bus);
    n.start(at, Math.random() * 0.3, 0.1);
  }
}
