// Звук целиком синтезируется WebAudio: эффекты, фон (ветер, река, птицы,
// сверчки, дождь) и генеративная музыка. Никаких аудиофайлов.

import type { Sfx, SoundName } from './sfx';

type Ctx = AudioContext;

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  ambient: number;
}

export class Audio implements Sfx {
  ctx: Ctx | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private noise!: AudioBuffer;
  private delay!: DelayNode;
  private delayGain!: GainNode;
  settings: AudioSettings = { master: 0.8, sfx: 0.9, music: 0.55, ambient: 0.7 };
  private lastPlay = new Map<SoundName, number>();
  // Фон.
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private river: GainNode | null = null;
  private rain: GainNode | null = null;
  private env = { night: 0, winter: false, rain: 0, blood: false, day: true, danger: 0 };
  private nextBird = 0;
  private nextCricket = 0;
  private music = { next: 0, step: 0, bar: 0, chord: 0 };
  muted = false;

  /** Запуск по первому жесту пользователя (требование браузеров). */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    // Общее «эхо» для музыки и колокола.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.32;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.28;
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.delay);
    this.delayGain.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applySettings();
    this.startAmbient();
  }

  applySettings(): void {
    if (!this.ctx) return;
    const s = this.settings;
    const m = this.muted ? 0 : s.master;
    this.master.gain.value = m;
    this.sfxBus.gain.value = s.sfx;
    this.musicBus.gain.value = s.music * 0.5;
    this.ambBus.gain.value = s.ambient * 0.6;
  }

  // ——— Примитивы ———

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { slide?: number; attack?: number; bus?: AudioNode; pan?: number; at?: number; echo?: boolean } = {}): void {
    const ctx = this.ctx!;
    const t = opts.at ?? ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    const out = this.panned(g, opts.pan ?? 0);
    out.connect(opts.bus ?? this.sfxBus);
    if (opts.echo) out.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, vol: number, filter: BiquadFilterType, freq: number, opts: { q?: number; slide?: number; pan?: number; bus?: AudioNode; at?: number; attack?: number } = {}): void {
    const ctx = this.ctx!;
    const t = opts.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (opts.slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, opts.slide), t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    this.panned(g, opts.pan ?? 0).connect(opts.bus ?? this.sfxBus);
    const off = Math.random() * 1.5;
    src.start(t, off, dur + 0.1);
  }

  private panned(node: AudioNode, pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!pan || !ctx.createStereoPanner) return node;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    return p;
  }

  private bell(freq: number, vol: number, pan = 0): void {
    for (const [mul, v, dur] of [[1, 1, 2.4], [2.76, 0.5, 1.6], [5.4, 0.25, 1], [8.9, 0.1, 0.6]] as Array<[number, number, number]>) {
      this.tone(freq * mul, dur, 'sine', vol * v, { pan, echo: true, attack: 0.002 });
    }
  }

  // ——— Эффекты ———

  play(name: SoundName, pan = 0, vol = 1): void {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    const now = this.ctx.currentTime;
    // Защита от «пулемёта» одинаковых звуков.
    const last = this.lastPlay.get(name) ?? -1;
    const minGap = name === 'coin' || name === 'coinSlot' ? 0.03 : name === 'hoof' || name === 'gallop' ? 0.08 : 0.05;
    if (now - last < minGap) return;
    this.lastPlay.set(name, now);
    const r = () => 0.94 + Math.random() * 0.12;
    const v = vol;
    switch (name) {
      case 'coin':
        this.tone(1900 * r(), 0.12, 'triangle', 0.18 * v, { pan });
        this.tone(2850 * r(), 0.18, 'sine', 0.12 * v, { pan, at: now + 0.04 });
        break;
      case 'coinDrop':
        this.tone(1400 * r(), 0.06, 'triangle', 0.12 * v, { pan });
        this.noiseBurst(0.04, 0.05 * v, 'highpass', 4000, { pan });
        break;
      case 'coinSlot':
        this.tone(1650 * r(), 0.1, 'triangle', 0.16 * v, { pan });
        this.tone(2475, 0.14, 'sine', 0.08 * v, { pan, at: now + 0.03 });
        break;
      case 'coinPay':
        this.tone(1650, 0.1, 'triangle', 0.14 * v, { pan });
        break;
      case 'purchase':
        [523, 659, 784].forEach((f, i) => this.tone(f * 2, 0.25, 'triangle', 0.12 * v, { pan, at: now + i * 0.06, echo: true }));
        break;
      case 'upgrade':
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1 * v, { pan, at: now + i * 0.09, echo: true }));
        break;
      case 'build':
        this.noiseBurst(0.08, 0.25 * v, 'lowpass', 900, { pan });
        this.tone(180, 0.1, 'sine', 0.2 * v, { pan, slide: 90 });
        this.noiseBurst(0.08, 0.2 * v, 'lowpass', 800, { pan, at: now + 0.15 });
        break;
      case 'hammer':
        this.noiseBurst(0.05, 0.16 * v, 'bandpass', 1200 * r(), { pan, q: 3 });
        this.tone(320 * r(), 0.05, 'triangle', 0.08 * v, { pan });
        break;
      case 'chop':
        this.noiseBurst(0.07, 0.22 * v, 'bandpass', 650 * r(), { pan, q: 4 });
        break;
      case 'treeFall':
        this.tone(160, 0.6, 'sawtooth', 0.04 * v, { pan, slide: 80 });
        this.noiseBurst(0.9, 0.3 * v, 'lowpass', 1500, { pan, slide: 200, at: now + 0.5 });
        break;
      case 'bow':
        this.tone(420 * r(), 0.12, 'triangle', 0.1 * v, { pan, slide: 180 });
        this.noiseBurst(0.12, 0.05 * v, 'bandpass', 2500, { pan, slide: 800 });
        break;
      case 'arrowHit':
        this.noiseBurst(0.05, 0.12 * v, 'lowpass', 600, { pan });
        break;
      case 'greedHit':
        this.tone(900 * r(), 0.07, 'square', 0.04 * v, { pan, slide: 500 });
        break;
      case 'greedDie':
        this.noiseBurst(0.35, 0.16 * v, 'highpass', 2000, { pan, slide: 600 });
        this.tone(700 * r(), 0.15, 'square', 0.03 * v, { pan, slide: 200 });
        break;
      case 'greedScream':
        this.tone(1300, 0.5, 'sawtooth', 0.06 * v, { pan, slide: 260 });
        this.tone(1320, 0.5, 'sawtooth', 0.05 * v, { pan, slide: 240 });
        break;
      case 'wallHit':
        this.tone(90 * r(), 0.18, 'sine', 0.3 * v, { pan, slide: 50 });
        this.noiseBurst(0.12, 0.12 * v, 'lowpass', 700, { pan });
        break;
      case 'wallBreak':
        this.noiseBurst(1.1, 0.4 * v, 'lowpass', 1800, { pan, slide: 150 });
        this.tone(70, 0.6, 'sine', 0.4 * v, { pan, slide: 35 });
        break;
      case 'hurt':
        this.tone(260, 0.2, 'triangle', 0.14 * v, { pan, slide: 150 });
        this.tone(1900, 0.1, 'triangle', 0.08 * v, { pan, at: now + 0.02 });
        break;
      case 'crownLost':
        [392, 311, 262, 196].forEach((f, i) => this.tone(f, 1.4, 'triangle', 0.14, { at: now + i * 0.25, echo: true }));
        this.tone(98, 2.5, 'sine', 0.2, { at: now });
        break;
      case 'hoof':
        this.noiseBurst(0.035, 0.07 * v, 'bandpass', 1300 * r(), { pan, q: 2 });
        break;
      case 'gallop':
        this.noiseBurst(0.03, 0.08 * v, 'bandpass', 1200 * r(), { pan, q: 2 });
        this.noiseBurst(0.03, 0.07 * v, 'bandpass', 1400 * r(), { pan, q: 2, at: now + 0.09 });
        break;
      case 'neigh': {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(600, now);
        o.frequency.linearRampToValueAtTime(950, now + 0.25);
        o.frequency.linearRampToValueAtTime(450, now + 0.7);
        lfo.frequency.value = 22;
        lg.gain.value = 40;
        lfo.connect(lg);
        lg.connect(o.frequency);
        f.type = 'bandpass';
        f.frequency.value = 1200;
        f.Q.value = 2;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.1 * v, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
        o.connect(f);
        f.connect(g);
        this.panned(g, pan).connect(this.sfxBus);
        o.start(now);
        lfo.start(now);
        o.stop(now + 0.8);
        lfo.stop(now + 0.8);
        break;
      }
      case 'eat':
        this.noiseBurst(0.08, 0.05 * v, 'bandpass', 2400, { pan, q: 3 });
        break;
      case 'recruit':
        this.tone(660, 0.2, 'triangle', 0.1 * v, { pan, echo: true });
        this.tone(990, 0.3, 'triangle', 0.1 * v, { pan, at: now + 0.08, echo: true });
        break;
      case 'chest':
        this.tone(200, 0.3, 'sawtooth', 0.04 * v, { pan, slide: 120 });
        for (let i = 0; i < 6; i++) this.tone(1800 + Math.random() * 1200, 0.12, 'triangle', 0.08 * v, { pan, at: now + 0.2 + i * 0.05 });
        break;
      case 'gem':
        this.tone(3000 * r(), 0.4, 'sine', 0.1 * v, { pan, echo: true });
        this.tone(4500 * r(), 0.3, 'sine', 0.06 * v, { pan, at: now + 0.05, echo: true });
        break;
      case 'dawn':
      case 'bell':
        this.bell(523.25, 0.12 * v, pan);
        this.bell(392, 0.08 * v, pan);
        break;
      case 'dusk':
        this.tone(147, 1.5, 'triangle', 0.1 * v, { pan, attack: 0.3 });
        break;
      case 'bloodMoon':
        this.tone(55, 4, 'sawtooth', 0.08, { attack: 1 });
        this.tone(58.3, 4, 'sawtooth', 0.07, { attack: 1 });
        [220, 233, 311].forEach((f, i) => this.tone(f, 3, 'triangle', 0.05, { at: now + 0.5 + i * 0.4, echo: true, attack: 0.3 }));
        break;
      case 'horn':
        this.tone(220, 1.2, 'sawtooth', 0.08 * v, { pan, attack: 0.15 });
        this.tone(330, 1.0, 'sawtooth', 0.05 * v, { pan, attack: 0.2, at: now + 0.2 });
        break;
      case 'portalHit':
        this.tone(160 * r(), 0.3, 'square', 0.05 * v, { pan, slide: 90 });
        break;
      case 'portalBreak':
        this.noiseBurst(1.8, 0.4, 'lowpass', 2500, { slide: 100 });
        this.tone(60, 1.5, 'sine', 0.4, { slide: 30 });
        [880, 1100, 1320].forEach((f, i) => this.tone(f, 1.5, 'sine', 0.05, { at: now + 0.3 + i * 0.1, echo: true }));
        break;
      case 'bomb':
        this.noiseBurst(2.2, 0.55 * v, 'lowpass', 3000, { pan, slide: 80 });
        this.tone(48, 1.8, 'sine', 0.5 * v, { pan, slide: 25 });
        break;
      case 'splash':
        this.noiseBurst(0.25, 0.1 * v, 'bandpass', 1100, { pan, slide: 400 });
        break;
      case 'bark':
        this.tone(520, 0.08, 'square', 0.07 * v, { pan, slide: 380 });
        this.tone(480, 0.09, 'square', 0.06 * v, { pan, slide: 330, at: now + 0.13 });
        break;
      case 'shieldHit':
        this.tone(1500 * r(), 0.12, 'square', 0.05 * v, { pan, slide: 900 });
        this.noiseBurst(0.06, 0.08 * v, 'highpass', 3000, { pan });
        break;
      case 'fire':
        for (let i = 0; i < 4; i++) this.noiseBurst(0.02, 0.05 * v, 'highpass', 2500, { pan, at: now + Math.random() * 0.3 });
        break;
      case 'swing':
        this.noiseBurst(0.18, 0.1 * v, 'bandpass', 900, { pan, slide: 2500, q: 2 });
        break;
      case 'owl':
        // «У-ху… у-у»: два мягких гулких тона.
        this.tone(392, 0.32, 'sine', 0.07 * v, { pan, slide: 370, attack: 0.07, echo: true });
        this.tone(370, 0.5, 'sine', 0.06 * v, { pan, slide: 330, attack: 0.1, at: now + 0.45, echo: true });
        break;
      case 'birds':
        // Хлопанье крыльев и карканье — стая взлетает.
        for (let i = 0; i < 5; i++) this.noiseBurst(0.05, 0.06 * v, 'bandpass', 1400 + i * 120, { pan, q: 3, at: now + i * 0.06 });
        this.tone(720, 0.13, 'square', 0.03 * v, { pan, slide: 520, at: now + 0.08 });
        break;
      case 'lute': {
        // Щипок струны: пентатоника ля-минор, тихий обертон октавой выше.
        const notes = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
        const f = notes[Math.floor(Math.random() * notes.length)];
        this.tone(f, 0.9, 'triangle', 0.06 * v, { pan, attack: 0.004, echo: true });
        this.tone(f * 2, 0.35, 'sine', 0.018 * v, { pan, attack: 0.004 });
        break;
      }
      case 'cluck':
        this.tone(640, 0.05, 'square', 0.025 * v, { pan, slide: 520 });
        this.tone(600, 0.06, 'square', 0.022 * v, { pan, slide: 480, at: now + 0.09 });
        break;
    }
  }

  // ——— Фон ———

  private startAmbient(): void {
    const ctx = this.ctx!;
    const loop = (f: BiquadFilterType, freq: number, vol: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = f;
      fl.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(fl);
      fl.connect(g);
      g.connect(this.ambBus);
      src.start();
      return { gain: g, filter: fl };
    };
    this.wind = loop('lowpass', 400, 0.05);
    this.river = loop('bandpass', 700, 0.035).gain;
    this.rain = loop('highpass', 2500, 0).gain;
  }

  /** Обновление фона раз в кадр. */
  update(dt: number, env: { night: number; winter: boolean; rain: number; blood: boolean; day: boolean; danger: number }): void {
    this.env = env;
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (this.wind) {
      const w = 0.04 + 0.03 * Math.sin(t * 0.2) + (env.winter ? 0.03 : 0);
      this.wind.gain.gain.setTargetAtTime(w, t, 0.5);
      this.wind.filter.frequency.setTargetAtTime(350 + 150 * Math.sin(t * 0.13), t, 0.5);
    }
    this.rain?.gain.setTargetAtTime(env.rain * 0.08, t, 0.5);
    this.river?.gain.setTargetAtTime(env.winter ? 0.005 : 0.035, t, 1);
    // Птицы днём, сверчки ночью.
    if (!env.winter) {
      if (env.day && t > this.nextBird) {
        this.nextBird = t + 2 + Math.random() * 5;
        const base = 2200 + Math.random() * 1800;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone(base * (1 + Math.random() * 0.2), 0.08, 'sine', 0.025, { slide: base * 1.3, at: t + i * 0.11, bus: this.ambBus, pan: Math.random() * 2 - 1 });
      }
      if (env.night > 0.6 && t > this.nextCricket) {
        this.nextCricket = t + 0.6 + Math.random() * 1.2;
        for (let i = 0; i < 3; i++) this.tone(4400 + Math.random() * 300, 0.03, 'sine', 0.012, { at: t + i * 0.06, bus: this.ambBus, pan: Math.random() * 2 - 1 });
      }
    }
    this.updateMusic();
    void dt;
  }

  // ——— Генеративная музыка ———

  private updateMusic(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (this.music.next === 0) this.music.next = t + 2;
    const bpm = this.env.blood ? 56 : this.env.night > 0.5 ? 60 : 68;
    const beat = 60 / bpm;
    while (this.music.next < t + 0.4) {
      this.scheduleBeat(this.music.next, beat);
      this.music.next += beat / 2;
    }
  }

  private scheduleBeat(at: number, beat: number): void {
    const m = this.music;
    const step = m.step++;
    const env = this.env;
    // Лады: день — дорийский ре, ночь — эолийский ля, Кровавая луна — фригийский.
    const scales = env.blood ? [0, 1, 3, 5, 7, 8, 10] : env.night > 0.5 ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 3, 5, 7, 9, 10];
    const root = env.blood ? 52 : env.night > 0.5 ? 57 : 50;
    const chords = [0, 5, 3, 4];
    if (step % 16 === 0) {
      m.bar++;
      m.chord = chords[m.bar % chords.length];
      // Мягкий аккорд-пэд на такт.
      const deg = m.chord;
      for (const k of [0, 2, 4]) {
        const note = root - 12 + scales[(deg + k) % 7] + (deg + k >= 7 ? 12 : 0);
        const f = 440 * Math.pow(2, (note - 69) / 12);
        this.tone(f, beat * 8, 'sine', env.blood ? 0.05 : 0.035, { at, attack: beat * 2, bus: this.musicBus });
        this.tone(f * 1.003, beat * 8, 'sine', 0.02, { at, attack: beat * 2, bus: this.musicBus });
      }
    }
    // Редкая мелодия щипковым «инструментом».
    const density = env.blood ? 0.2 : env.night > 0.5 ? 0.22 : 0.35;
    if (Math.random() < density && step % 2 === 0) {
      const deg = m.chord + [0, 2, 4, 1, 3, 5][Math.floor(Math.random() * 6)];
      const note = root + 12 + scales[deg % 7] + (deg >= 7 ? 12 : 0);
      const f = 440 * Math.pow(2, (note - 69) / 12);
      this.tone(f, beat * 2.5, 'triangle', 0.045, { at, bus: this.musicBus, echo: true, attack: 0.004 });
    }
    // Кровавая луна: глухой «барабан».
    if (env.blood && step % 4 === 0) this.tone(55, 0.4, 'sine', 0.12, { at, slide: 35, bus: this.musicBus });
  }
}
