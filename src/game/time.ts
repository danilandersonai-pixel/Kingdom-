// Время: сутки по 240 секунд (рассвет → день → закат → ночь),
// счёт дней, времена года по 16 дней и Кровавые луны.

import type { Season } from '../render/atmosphere';
import { TIME } from './config';

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAMES: Record<Season, string> = { spring: 'Весна', summer: 'Лето', autumn: 'Осень', winter: 'Зима' };

export class DayCycle {
  /** Номер дня правления, начиная с 1. */
  day = 1;
  /** Фаза суток 0..1 (0 — рассвет). */
  phase = 0.02;
  /** Остановка суток (затмение ответной волны). */
  frozen = false;
  onDawn: Array<(day: number) => void> = [];
  onNoon: Array<(day: number) => void> = [];
  onSunset: Array<(day: number) => void> = [];
  onNight: Array<(day: number) => void> = [];
  onMidnight: Array<(day: number) => void> = [];
  private fired = { noon: false, sunset: false, night: false, midnight: false };

  update(dt: number): void {
    if (this.frozen) return;
    this.phase += dt / TIME.day;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.day++;
      this.fired = { noon: false, sunset: false, night: false, midnight: false };
      for (const fn of this.onDawn) fn(this.day);
    }
    const fire = (key: keyof DayCycle['fired'], at: number, list: Array<(d: number) => void>) => {
      if (!this.fired[key] && this.phase >= at) {
        this.fired[key] = true;
        for (const fn of list) fn(this.day);
      }
    };
    fire('noon', TIME.noon, this.onNoon);
    fire('sunset', TIME.sunset, this.onSunset);
    fire('night', TIME.night, this.onNight);
    fire('midnight', TIME.midnight, this.onMidnight);
  }

  /** Жадность нападает. */
  get isNight(): boolean {
    return this.phase >= TIME.night - 0.01 || this.phase < 0.01;
  }

  /** После заката — подданные уходят за стены. */
  get isEvening(): boolean {
    return this.phase >= TIME.sunset;
  }

  /** Светлое время, когда идут дневные работы. */
  get isDay(): boolean {
    return this.phase >= 0.01 && this.phase < TIME.sunset;
  }

  /** Время после рассвета, когда солнце вредит Жадности. */
  get sunUp(): boolean {
    // В затмение (время заморожено) солнце Жадность не жжёт.
    return !this.frozen && this.phase >= 0.015 && this.phase < TIME.sunset + 0.02;
  }

  get secondsToSunset(): number {
    return Math.max(0, (TIME.sunset - this.phase) * TIME.day);
  }

  get season(): Season {
    return SEASONS[Math.floor((this.day - 1) / TIME.seasonDays) % 4];
  }

  get dayInSeason(): number {
    return ((this.day - 1) % TIME.seasonDays) + 1;
  }

  /** Кровавая луна: 15-й день каждого сезона, с 193-го дня — ещё и 8-й. */
  static isBloodMoonDay(day: number): boolean {
    const d = ((day - 1) % TIME.seasonDays) + 1;
    if (d === 15) return true;
    return day >= 193 && d === 8;
  }

  get isBloodMoon(): boolean {
    return DayCycle.isBloodMoonDay(this.day);
  }

  /** Ночь после Кровавой луны — затишье. */
  get isCalmNight(): boolean {
    return DayCycle.isBloodMoonDay(this.day - 1);
  }

  /** Номер Кровавой луны (1 — первая) для дня `day` или 0. */
  static bloodMoonIndex(day: number): number {
    let n = 0;
    for (let d = 1; d <= day; d++) if (DayCycle.isBloodMoonDay(d)) n++;
    return n;
  }

  serialize(): { day: number; phase: number } {
    return { day: this.day, phase: this.phase };
  }

  restore(o: { day: number; phase: number }): void {
    this.day = o.day;
    this.phase = o.phase;
    this.fired = {
      noon: this.phase >= TIME.noon,
      sunset: this.phase >= TIME.sunset,
      night: this.phase >= TIME.night,
      midnight: this.phase >= TIME.midnight,
    };
  }
}
