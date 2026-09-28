// Интерфейс звуков, который видит игровая логика. Реальная реализация —
// в audio.ts (WebAudio); в тестах используется пустая заглушка.

export type SoundName =
  | 'coin'
  | 'coinDrop'
  | 'coinPay'
  | 'coinSlot'
  | 'purchase'
  | 'build'
  | 'hammer'
  | 'chop'
  | 'treeFall'
  | 'bow'
  | 'arrowHit'
  | 'greedHit'
  | 'greedDie'
  | 'greedScream'
  | 'wallHit'
  | 'wallBreak'
  | 'hurt'
  | 'crownLost'
  | 'hoof'
  | 'gallop'
  | 'neigh'
  | 'eat'
  | 'recruit'
  | 'chest'
  | 'gem'
  | 'dawn'
  | 'dusk'
  | 'bloodMoon'
  | 'horn'
  | 'portalHit'
  | 'portalBreak'
  | 'bomb'
  | 'splash'
  | 'bell'
  | 'upgrade'
  | 'bark'
  | 'shieldHit'
  | 'fire'
  | 'swing';

export interface Sfx {
  /** pan: -1..1 — стерео по положению на экране; vol: 0..1. */
  play(name: SoundName, pan?: number, vol?: number): void;
}

export const silentSfx: Sfx = { play() {} };
