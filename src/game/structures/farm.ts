// Фермы: колодец на ручье в открытом поле (4 поля), апгрейд до мельницы
// (6 полей, фермеры ночуют там), конюшня отшельника. Поля растут только
// под руками фермера и дают по 6 монет.

import { Structure } from './structure';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import { blit, makeCanvas, type Sprite } from '../../engine/sprite';
import { farmSprite, millSprite, stableSprite, scaffoldSprite } from '../../art/buildings';
import { PRICES, WORK, M, PEOPLE, TC_TIERS } from '../config';
import type { FieldSlot, FarmLike } from '../entities/person';
import { ellipse, rect, px } from '../../art/px';
import { passengerKind, type Hermit } from './hermits';
import { MOUNTS, type MountId } from '../mounts';

let wellSpriteCache: Sprite | null = null;
function wellSprite(): Sprite {
  if (wellSpriteCache) return wellSpriteCache;
  const [c, ctx] = makeCanvas(16, 18);
  rect(ctx, 3, 10, 10, 8, '#8a8a90');
  for (let y = 10; y < 18; y += 3) rect(ctx, 3, y, 10, 1, '#5e5e66');
  rect(ctx, 3, 3, 1, 8, '#6a4a2a');
  rect(ctx, 12, 3, 1, 8, '#6a4a2a');
  rect(ctx, 2, 2, 12, 2, '#8a3a2a');
  rect(ctx, 7, 4, 1, 4, '#c8b080');
  rect(ctx, 6, 8, 3, 2, '#6a4a2a');
  wellSpriteCache = { img: c, w: 16, h: 18, ax: 8, ay: 18 };
  return wellSpriteCache;
}

let streamCache: Sprite | null = null;
function streamSprite(): Sprite {
  if (streamCache) return streamCache;
  const [c, ctx] = makeCanvas(14, 4);
  ellipse(ctx, 7, 2, 6, 1.6, '#4a7a9a');
  px(ctx, 5, 1, '#9ac8e0');
  px(ctx, 9, 2, '#9ac8e0');
  streamCache = { img: c, w: 14, h: 4, ax: 7, ay: 3 };
  return streamCache;
}

/** Родник под будущую ферму: прудик в каменном ободке, рогоз, колышек с
 *  дощечкой-колосом — издалека видно, что здесь можно завести хозяйство. */
const springCache = new Map<boolean, Sprite>();
function springSprite(winter: boolean): Sprite {
  let sp = springCache.get(winter);
  if (sp) return sp;
  const W = 30;
  const H = 16;
  const [c, ctx] = makeCanvas(W, H);
  const cx = 14;
  const wy = H - 3;
  // Каменный ободок.
  for (let x = cx - 12; x <= cx + 12; x++) {
    const k = (x - cx) / 12.5;
    const top = Math.round(wy - 2.6 * Math.sqrt(Math.max(0, 1 - k * k)));
    px(ctx, x, top, (x & 1) === 0 ? '#8a8a90' : '#6e6e76');
    if ((x & 3) === 0) px(ctx, x, top - 1, '#a8a8b0');
  }
  // Вода (зимой — лёд).
  ellipse(ctx, cx, wy, 10.5, 2.4, winter ? '#b8cce0' : '#3a6a8a');
  if (winter) {
    px(ctx, cx - 5, wy - 1, '#eef4fa');
    px(ctx, cx + 3, wy, '#eef4fa');
  } else {
    px(ctx, cx - 5, wy - 1, '#8ac0dc');
    px(ctx, cx - 4, wy - 1, '#8ac0dc');
    px(ctx, cx + 4, wy, '#6aa0c0');
    // Лист кувшинки.
    px(ctx, cx + 1, wy - 1, '#4a7a36');
    px(ctx, cx + 2, wy - 1, '#5a8a3e');
  }
  // Рогоз у левого края.
  for (const [x, hh] of [[cx - 10, 8], [cx - 8, 11], [cx - 6, 7]] as Array<[number, number]>) {
    for (let y = 0; y < hh; y++) px(ctx, x, wy - 1 - y, winter ? '#9a8a6a' : y > hh - 3 ? '#8a9a4a' : '#5a7a34');
    rect(ctx, x, wy - hh + 1, 1, 3, winter ? '#6a5a42' : '#6a4424');
  }
  // Колышек с дощечкой, на ней колос.
  rect(ctx, cx + 11, H - 13, 1, 11, '#6a4a2a');
  rect(ctx, cx + 9, H - 14, 6, 4, '#c8b890');
  rect(ctx, cx + 9, H - 14, 6, 1, '#e0d0a8');
  px(ctx, cx + 11, H - 13, '#c89a2a');
  px(ctx, cx + 12, H - 12, '#c89a2a');
  px(ctx, cx + 11, H - 11, '#c89a2a');
  if (winter) rect(ctx, cx + 9, H - 15, 6, 1, '#f4f8fc');
  sp = { img: c, w: W, h: H, ax: cx, ay: H - 1 };
  springCache.set(winter, sp);
  return sp;
}

export type FarmStage = 'site' | 'well' | 'mill' | 'stable';

export class Farm extends Structure implements FarmLike {
  readonly type = 'farm' as const;
  override solid = 56;
  stage: FarmStage = 'site';
  fields: FieldSlot[] = [];
  /** Хранит скакунов (конюшня). */
  stabled: string[] = [];

  constructor(x: number) {
    super();
    this.x = x;
    this.z = 5;
    this.payWidth = 14;
    this.payPriority = 2;
  }

  get isMill(): boolean {
    return this.stage === 'mill' || this.stage === 'stable';
  }

  get drawRadius(): number {
    return 70;
  }

  get fieldCount(): number {
    if (this.stage === 'site') return 0;
    const base = this.stage === 'well' ? 4 : 6;
    return base + (this.world.meta.blessings.has('scythe') ? 2 : 0);
  }

  private syncFields(): void {
    const n = this.fieldCount;
    while (this.fields.length < n) {
      const i = this.fields.length;
      const side = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      this.fields.push({ x: this.x + side * (18 + k * 16), progress: 0, farmerId: 0 });
    }
    if (this.fields.length > n) this.fields.length = n;
  }

  override slotY(): number {
    return this.stage === 'site' ? 16 : this.isMill ? 46 : 24;
  }

  override price(m: Monarch): number {
    if (this.building) return 0;
    const tc = this.world.all<Structure>('structure').find((s) => s.type === 'townCenter');
    if (!tc || tc.level < 3) return 0;
    if (this.stage === 'site') return PRICES.well;
    if (this.stage === 'well') return PRICES.mill;
    if (this.stage === 'mill' && passengerKind(this.world, m) === 'stable') return PRICES.stable;
    // Конюшня: сменить скакуна на другого открытого — 3 монеты.
    if (this.stage === 'stable' && this.nextMount(m)) return PRICES.mountSwap;
    void TC_TIERS;
    return 0;
  }

  /** Следующий открытый скакун (по кругу), кроме нынешнего. */
  private nextMount(m: Monarch): MountId | null {
    const all = Object.keys(MOUNTS) as MountId[];
    const open = all.filter((id) => id === 'horse' || this.world.meta.gemUnlocks.has(`mount:${id}`));
    if (open.length < 2) return null;
    const i = open.indexOf(m.mount.id);
    return open[(i + 1) % open.length] === m.mount.id ? null : open[(i + 1) % open.length];
  }

  override onPaid(m: Monarch): void {
    if (this.stage === 'stable') {
      const id = this.nextMount(m);
      if (id) {
        m.setMount(id);
        m.stamina = 1;
        this.world.banner(MOUNTS[id].name.toUpperCase(), MOUNTS[id].desc);
        this.world.sound('neigh', this.x, 1);
      }
      return;
    }
    const next: FarmStage = this.stage === 'site' ? 'well' : this.stage === 'well' ? 'mill' : 'stable';
    this.targetStage = next;
    this.startBuild(0, next === 'well' ? WORK.well : next === 'mill' ? WORK.mill : WORK.stable);
    this.world.jobs.add('build', this, 2, this.world.clock);
    if (next === 'stable') {
      const h = this.world.all<Structure>('structure').find((s) => s.id === m.passenger) as Hermit | undefined;
      h?.settle();
    }
  }

  targetStage: FarmStage = 'site';

  override finishBuild(): void {
    this.stage = this.targetStage;
    this.world.jobs.removeFor(this, 'build');
    this.world.terrain.block(this.x - 40, this.x + 40, true);
    this.syncFields();
    this.world.sound('build', this.x, 0.8);
  }

  override update(): void {
    if (this.stage !== 'site' && this.fields.length !== this.fieldCount) this.syncFields();
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    const winter = this.world.time.season === 'winter';
    if (this.stage === 'site') {
      blit(ctx, farmSprite(0, winter, false), sx + 26, gy);
      blit(ctx, springSprite(winter), sx, gy + 3);
    } else {
      for (const f of this.fields) {
        const stage = f.farmerId ? Math.min(3, Math.floor((f.progress / PEOPLE.fieldWork) * 4)) : 0;
        const s = farmSprite(stage, winter, true);
        ctx.drawImage(s.img, 8, 0, 16, s.h, Math.round(r.sx(f.x) - 8), gy - s.h, 16, s.h);
      }
      blit(ctx, streamSprite(), sx, gy + 1);
      if (this.stage === 'well') blit(ctx, wellSprite(), sx, gy);
      else if (this.stage === 'mill') this.drawMill(ctx, sx, gy);
      else blit(ctx, stableSprite(), sx, gy);
    }
    if (this.scaffold) blit(ctx, scaffoldSprite(22, this.targetStage === 'well' ? 16 : 36), sx, gy, false, 0.85);
    void M;
  }

  private drawMill(ctx: CanvasRenderingContext2D, sx: number, gy: number): void {
    blit(ctx, millSprite(), sx, gy);
    // Крылья мельницы вращаются.
    const t = this.world.clock * 0.8;
    const cx = sx;
    const cy = gy - 30;
    ctx.fillStyle = '#e8dcc0';
    for (let k = 0; k < 4; k++) {
      const a = t + (k * Math.PI) / 2;
      for (let i = 2; i < 14; i++) {
        ctx.fillRect(Math.round(cx + Math.cos(a) * i), Math.round(cy + Math.sin(a) * i), 1, 1);
        if (i > 5) ctx.fillRect(Math.round(cx + Math.cos(a) * i + Math.cos(a + Math.PI / 2) * 2), Math.round(cy + Math.sin(a) * i + Math.sin(a + Math.PI / 2) * 2), 1, 1);
      }
    }
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), stage: this.stage, fields: this.fields.map((f) => ({ x: f.x, progress: f.progress })) };
  }
}
