// Способности скакунов: взмах крыльев грифона, чары оленя, аура боевого
// коня, рывок медведя, огонь ящера.

import type { World } from './world';
import type { Monarch } from './entities/monarch';
import type { Greed } from './entities/greed';
import type { Animal } from './entities/animal';
import type { Person } from './entities/person';
import { Entity } from './entity';
import type { Renderer } from '../render/renderer';
import type { Light } from '../render/lighting';
import { M } from './config';
import { fxRng } from '../engine/rng';
import { hex } from '../engine/sprite';

/** Огонь ящера на земле: 5 секунд жжёт Жадность. */
class GroundFire extends Entity {
  readonly tag = 'fx' as const;
  life = 5;
  len = 3 * M;
  private tick = 0;
  constructor(x: number, dir: number) {
    super();
    this.x = x + (dir * 3 * M) / 2;
    this.z = 38;
  }
  override update(dt: number): void {
    this.life -= dt;
    this.tick -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    if (fxRng.chance(dt * 30)) this.world.fx.particles.spawn({ x: this.x + fxRng.range(-this.len / 2, this.len / 2), y: 1, vy: fxRng.range(10, 30), life: 0.6, max: 0.6, color: fxRng.chance(0.5) ? '#ff8a3a' : '#ffcf5a', emissive: true, wobble: 10 });
    if (this.tick <= 0) {
      this.tick = 1;
      for (const g of this.world.all<Greed>('greed')) if (Math.abs(g.x - this.x) < this.len / 2 && g.y < 10) g.takeDamage(1, this.x);
    }
  }
  lights(out: Light[]): void {
    out.push({ x: this.x, y: 4, radius: 40, color: hex('#ff9a40'), intensity: 0.9, flicker: 1 });
  }
  override draw(_ctx: CanvasRenderingContext2D, _r: Renderer): void {}
}

export function installAbilities(w: World): void {
  w.on('mountAbility', (m: Monarch, pressed: boolean) => {
    if (m.abilityCd > 0) return;
    const ab = m.mount.ability;
    if (ab === 'flap' && pressed) {
      m.abilityCd = 8;
      w.sound('swing', m.x, 1);
      w.fx.particles.burst(m.x, 14, 20, { color: '#f0ece0', speed: 60, life: 0.6, spread: Math.PI * 2 });
      for (const g of w.all<Greed>('greed')) {
        if (Math.abs(g.x - m.x) < 3 * M) {
          g.x += Math.sign(g.x - m.x || 1) * 3 * M;
          g.stun = 1.5;
        }
      }
    } else if (ab === 'charm' && pressed) {
      m.abilityCd = 10;
      w.sound('bell', m.x, 0.5);
      for (const a of w.all<Animal>('animal')) if ((a.kind === 'deer' || a.kind === 'stag') && Math.abs(a.x - m.x) < 6 * M) a.charmedBy = m.id;
    } else if (ab === 'aura' && m.galloping) {
      m.abilityCd = 15;
      const subjects = w
        .all<Person>('person')
        .filter((p) => p.role !== 'vagrant')
        .sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))
        .slice(0, 20);
      for (const p of subjects) p.aura = 12;
      w.fx.particles.burst(m.x, 16, 16, { color: '#f8e8a0', speed: 40, life: 0.8, emissive: true, spread: Math.PI * 2 });
    } else if (ab === 'dash' && m.galloping) {
      let hit = false;
      for (const g of w.all<Greed>('greed')) {
        if (Math.abs(g.x - (m.x + m.facing * 10)) < 2 * M) {
          g.takeDamage(1, m.x);
          hit = true;
        }
      }
      for (const a of w.all<Animal>('animal')) {
        if (a.huntable && Math.abs(a.x - (m.x + m.facing * 10)) < 2 * M) {
          a.hurt(1, 0);
          hit = true;
        }
      }
      if (hit) {
        m.abilityCd = 3;
        w.sound('swing', m.x, 0.8);
      }
    } else if (ab === 'fire' && (pressed || m.galloping)) {
      m.abilityCd = 6;
      w.add(new GroundFire(m.x + m.facing * 10, m.facing));
      w.sound('fire', m.x, 1);
    }
  });
}
