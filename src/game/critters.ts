// Живность и горожане для атмосферы — без влияния на игру: куры и овцы у ферм,
// кошка и дети в городе, бард у ночного костра, вороны на лугах (взлетают от
// всадника), сова на дереве ночью, бабочки над травой. Появляются рядом с камерой
// и исчезают вдали; не сохраняются, игровые системы их не видят (тег 'fx').

import { Entity } from './entity';
import type { World } from './world';
import type { Renderer } from '../render/renderer';
import type { Structure } from './structures/structure';
import type { Monarch } from './entities/monarch';
import type { Tree } from './structures/nature';
import { critterFrames, type CritterKind, type CritterAnim } from '../art/critters';
import { humanFrames, type HumanAnim } from '../art/humans';
import { blit } from '../engine/sprite';
import { fxRng } from '../engine/rng';
import { groundShadow } from '../render/shadow';
import { townX } from './kingdom';
import { M } from './config';
import type { Light } from '../render/lighting';
import { hex } from '../engine/sprite';

type Kind = CritterKind | 'child' | 'bard';

export class Critter extends Entity {
  readonly tag = 'fx' as const;
  kind: Kind;
  variant: number;
  /** Якорь: вокруг него бродит (ферма, город, луг, дерево). */
  home: number;
  range: number;
  /** Кто поселил (для учёта численности). */
  anchor: string;
  state: CritterAnim | HumanAnim = 'idle';
  private timer = fxRng.range(0.5, 3);
  private target: number;
  private fleeing = 0;
  /** Уходит насовсем (вечер, испуг, далеко от камеры). */
  leaving = false;

  constructor(kind: Kind, x: number, home: number, range: number, anchor: string, variant = fxRng.int(0, 5)) {
    super();
    this.kind = kind;
    this.x = x;
    this.home = home;
    this.range = range;
    this.anchor = anchor;
    this.variant = variant;
    this.target = x;
    this.z = kind === 'owl' ? 3 : kind === 'bard' || kind === 'child' ? 29 : 24;
    this.facing = fxRng.chance(0.5) ? 1 : -1;
  }

  get drawRadius(): number {
    return 20;
  }

  private get flier(): boolean {
    return this.kind === 'crow' || this.kind === 'butterfly' || this.kind === 'owl';
  }

  /** Вспугнуть: летуны взлетают и улетают, остальные убегают. */
  startFlee(dir: 1 | -1): void {
    this.fleeing = this.flier ? 6 : 1.6;
    this.facing = dir;
  }

  override update(dt: number): void {
    const w = this.world;
    this.timer -= dt;
    // Испуг: всадник галопом или бегущий рядом.
    if (!this.fleeing && this.kind !== 'bard' && this.kind !== 'owl') {
      const m = w.nearest(w.all<Monarch>('monarch'), this.x, this.kind === 'crow' ? 34 : 20, (e) => Math.abs(e.velocity) > (this.kind === 'crow' ? 10 : 40));
      if (m) {
        this.fleeing = this.flier ? 6 : 1.6;
        this.facing = this.x >= m.x ? 1 : -1;
        if (this.kind === 'crow') w.sound('birds', this.x, 0.5);
        if (this.kind === 'hen' || this.kind === 'rooster') w.sound('cluck', this.x, 0.5);
      }
    }
    if (this.fleeing > 0) {
      this.fleeing -= dt;
      if (this.flier) {
        // Взлёт и прочь: вверх и в сторону от всадника.
        this.state = 'fly';
        this.x += this.facing * 42 * dt;
        this.y += 26 * dt;
        if (this.y > 90 || this.fleeing <= 0) this.dead = true;
      } else {
        this.state = this.kind === 'child' ? 'run' : 'walk';
        this.x += this.facing * 30 * dt;
      }
      return;
    }
    if (this.leaving) {
      // Уход домой (к якорю) — и исчезнуть.
      const dx = this.home - this.x;
      this.facing = dx >= 0 ? 1 : -1;
      this.state = this.kind === 'child' ? 'run' : 'walk';
      this.x += Math.sign(dx) * Math.min(Math.abs(dx), (this.kind === 'child' ? 26 : 14) * dt);
      if (Math.abs(dx) < 2) this.dead = true;
      return;
    }
    switch (this.kind) {
      case 'butterfly': {
        // Порхает над травой около якоря.
        this.state = 'fly';
        this.x += Math.sin(this.anim * 1.7 + this.variant) * 10 * dt + (this.home - this.x) * 0.1 * dt;
        this.y = 6 + Math.sin(this.anim * 2.3 + this.variant * 2) * 5 + Math.sin(this.anim * 7) * 1.5;
        this.facing = Math.cos(this.anim * 1.7 + this.variant) > 0 ? 1 : -1;
        return;
      }
      case 'owl':
        this.state = 'idle';
        if (this.timer <= 0) {
          this.timer = fxRng.range(8, 16);
          w.sound('owl', this.x, 0.3);
        }
        return;
      case 'bard':
        this.state = 'sit';
        this.facing = townX(w) > this.x ? 1 : -1;
        // Бард перебирает струны; ноты поднимаются над лютней.
        if (this.timer <= 0) {
          this.timer = fxRng.pick([0.35, 0.35, 0.7, 1.05]);
          w.sound('lute', this.x, 0.55);
        }
        if (fxRng.chance(dt * 1.6)) {
          w.fx.particles.spawn({ x: this.x + this.facing * 2, y: 10, vx: fxRng.range(-3, 3), vy: fxRng.range(8, 13), life: 2.2, max: 2.2, color: fxRng.chance(0.5) ? '#f2d488' : '#e8e0ff', emissive: true, wobble: 10 });
        }
        return;
    }
    // Наземные: постоять, поклевать/пощипать, пройтись.
    if (this.state === 'walk' || this.state === 'run') {
      const dx = this.target - this.x;
      const speed = this.kind === 'child' ? 24 : this.kind === 'cat' ? 10 : this.kind === 'sheep' ? 6 : 8;
      this.facing = dx >= 0 ? 1 : -1;
      this.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
      if (Math.abs(dx) < 1) {
        this.state = 'idle';
        this.timer = fxRng.range(0.8, 3.5);
      }
      return;
    }
    if (this.timer > 0) return;
    const r = fxRng.next();
    if (this.kind === 'child') {
      // Дети носятся друг за другом.
      this.state = 'run';
      this.target = this.home + fxRng.range(-this.range, this.range);
      return;
    }
    if (r < 0.45) {
      this.state = 'walk';
      this.target = this.home + fxRng.range(-this.range, this.range);
    } else if (r < 0.8 && this.kind !== 'cat') {
      this.state = 'peck';
      this.timer = fxRng.range(1, 3);
    } else {
      this.state = this.kind === 'cat' && r > 0.9 ? 'sleep' : 'idle';
      this.timer = fxRng.range(1.5, this.kind === 'cat' ? 9 : 4);
    }
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    if (this.kind === 'child' || this.kind === 'bard') {
      const anim = this.state as HumanAnim;
      const frames = humanFrames(this.kind, this.variant, anim === 'walk' ? 'run' : anim);
      const fps = anim === 'run' ? 12 : anim === 'sit' ? 4 : 3;
      if (this.y < 1) groundShadow(ctx, sx, r.sy(0), this.kind === 'child' ? 5 : 7);
      blit(ctx, frames[Math.floor(this.anim * fps) % frames.length], sx, r.sy(this.y), this.facing < 0);
      return;
    }
    const anim = this.state as CritterAnim;
    const frames = critterFrames(this.kind, anim, this.variant);
    const fps = anim === 'fly' ? (this.kind === 'butterfly' ? 12 : 8) : anim === 'peck' ? 3 : anim === 'walk' ? 7 : 1.2;
    const f = frames[Math.floor(this.anim * fps + this.variant) % frames.length];
    if (this.y < 1 && this.kind !== 'owl') groundShadow(ctx, sx, r.sy(0), this.kind === 'sheep' ? 11 : 5, 0.18);
    blit(ctx, f, sx, r.sy(this.y), this.facing < 0);
  }

  override drawEmissive(ctx: CanvasRenderingContext2D, r: Renderer): void {
    // Глаза совы и кошки светятся в темноте.
    if (this.world.time.isDay && this.world.time.phase < 0.62) return;
    const sx = r.sx(this.x);
    if (this.kind === 'owl' && Math.floor(this.anim * 1.2) % 5 !== 4) {
      ctx.fillStyle = '#f2d44a';
      const fx = this.facing < 0 ? -1 : 0;
      ctx.fillRect(sx - 2 + fx * 0, r.sy(this.y) - 6, 1, 1);
      ctx.fillRect(sx + fx * 0, r.sy(this.y) - 6, 1, 1);
    } else if (this.kind === 'cat' && this.state !== 'sleep') {
      ctx.fillStyle = '#c8e860';
      ctx.fillRect(sx + (this.facing > 0 ? 3 : -4), r.sy(this.y) - 6, 1, 1);
    }
  }

  lights(out: Light[]): void {
    if (this.kind === 'bard') out.push({ x: this.x, y: 8, radius: 14, color: hex('#ffc070'), intensity: 0.25 });
  }
}

/** Сколько живности каждого вида нужно у якоря сейчас. */
interface Want {
  anchor: string;
  kind: Kind;
  count: number;
  home: number;
  range: number;
  y?: number;
}

export function installCritters(w: World): void {
  let t = 0;
  let crowCd = 10;
  w.systems.push({
    update(dt: number) {
      t -= dt;
      crowCd -= dt;
      if (t > 0) return;
      t = 0.5;
      const cam = w.listenerX;
      const near = (x: number) => Math.abs(x - cam) < 420;
      const time = w.time;
      const day = time.isDay && time.phase < 0.6;
      const night = !time.isDay || time.phase > 0.64;
      const season = time.season;
      const winter = season === 'winter';
      const wants: Want[] = [];
      const structs = w.all<Structure>('structure');
      const tc = structs.find((s) => s.type === 'townCenter');
      const tx = townX(w);
      // Ферма: куры днём (кроме зимы), овцы у мельницы.
      for (const f of structs) {
        if (f.type !== 'farm' || !near(f.x)) continue;
        const stage = (f as Structure & { stage: string }).stage;
        if (stage === 'site') continue;
        if (day && !winter) wants.push({ anchor: `hen${f.id}`, kind: 'hen', count: 3, home: f.x - 10, range: 3 * M });
        if (day && !winter) wants.push({ anchor: `roo${f.id}`, kind: 'rooster', count: 1, home: f.x - 14, range: 2 * M });
        if (day && stage !== 'well') wants.push({ anchor: `sheep${f.id}`, kind: 'sheep', count: 3, home: f.x + 20, range: 3 * M });
      }
      // Город: кошка, дети днём, бард ночью у костра.
      if (tc && near(tx)) {
        if (tc.level >= 3) wants.push({ anchor: 'cat', kind: 'cat', count: 1, home: tx + 26, range: 2.5 * M });
        if (tc.level >= 3 && day && !winter) wants.push({ anchor: 'kids', kind: 'child', count: 3, home: tx, range: 4 * M });
        if (tc.level >= 2 && night) wants.push({ anchor: 'bard', kind: 'bard', count: 1, home: tx + 17, range: 0 });
      }
      // Сова на дереве у камеры ночью.
      if (night) {
        const tree = w.nearest(w.all<Tree>('structure'), cam + 60, 200, (s) => s.type === 'tree' && (s as Tree).kind !== 'birch' && !(s as Tree).falling);
        if (tree) wants.push({ anchor: 'owl', kind: 'owl', count: 1, home: tree.x + 3, range: 0, y: Math.round((tree as Tree).height * 0.52) });
      }
      // Вороны на лугу днём; бабочки весной и летом.
      if (day && !winter && crowCd <= 0 && !w.all<Critter>('fx').some((c) => c instanceof Critter && c.kind === 'crow')) {
        const t2 = w.terrain;
        const x = cam + fxRng.range(-200, 200);
        const i = t2.cell(x);
        if (!t2.forest[i] && !t2.blocked[i]) {
          wants.push({ anchor: `crow${Math.round(x)}`, kind: 'crow', count: fxRng.int(2, 4), home: x, range: 2 * M });
          crowCd = fxRng.range(20, 45);
        }
      }
      if (day && (season === 'spring' || season === 'summer')) {
        const t2 = w.terrain;
        for (const off of [-150, 60, 190]) {
          const x = Math.round((cam + off) / 60) * 60;
          const i = t2.cell(x);
          if (t2.grass[i] > 0.5 && !t2.forest[i]) wants.push({ anchor: `bf${x}`, kind: 'butterfly', count: 2, home: x, range: 2 * M });
        }
      }
      // Сверить с тем, что есть.
      const have = w.all<Critter>('fx').filter((c): c is Critter => c instanceof Critter && !c.dead);
      const byAnchor = new Map<string, Critter[]>();
      for (const c of have) {
        const list = byAnchor.get(c.anchor) ?? [];
        list.push(c);
        byAnchor.set(c.anchor, list);
      }
      const wanted = new Set(wants.map((wt) => wt.anchor));
      for (const wt of wants) {
        const list = (byAnchor.get(wt.anchor) ?? []).filter((c) => !c.leaving);
        for (let k = list.length; k < wt.count; k++) {
          // Дети выбегают из города, остальные появляются на месте.
          const x = wt.kind === 'child' ? tx : wt.home + fxRng.range(-wt.range, wt.range);
          const c = new Critter(wt.kind, x, wt.home, wt.range, wt.anchor);
          if (wt.y !== undefined) c.y = wt.y;
          w.add(c);
        }
      }
      // Лишние: дети и бард уходят в город, куры и овцы — к ферме, прочие исчезают вдали.
      for (const c of have) {
        if (Math.abs(c.x - cam) > 600) {
          c.dead = true;
          continue;
        }
        if (wanted.has(c.anchor) || c.leaving) continue;
        switch (c.kind) {
          case 'crow':
          case 'butterfly':
            if (!near(c.x)) c.dead = true;
            break;
          case 'owl':
            if (!night) c.startFlee(1);
            break;
          case 'child':
          case 'bard':
            c.leaving = true;
            c.home = tx;
            break;
          default:
            c.leaving = true;
        }
      }
    },
  });
}
