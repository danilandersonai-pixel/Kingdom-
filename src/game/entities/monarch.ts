// Монарх на скакуне: шаг и галоп с выносливостью, поедание травы и «сытость»,
// физический кошелёк (40 монет, переполнение до 50), оплата построек,
// удары Жадности (монета выпадает, без монет слетает корона).

import { Entity } from '../entity';
import type { Renderer } from '../../render/renderer';
import { groundShadow } from '../../render/shadow';
import type { Light } from '../../render/lighting';
import { blit, hex } from '../../engine/sprite';
import { mountFrames, KING, type RiderLook, type MountAnim } from '../../art/horse';
import type { PlayerInput } from '../../engine/input';
import { M, MS, PURSE } from '../config';
import { MOUNTS, type MountDef, type MountId } from '../mounts';
import { Coin, DroppedCrown } from './pickups';
import type { Payable } from '../structures/structure';
import { Structure } from '../structures/structure';
import { approach, clamp } from '../../engine/math';
import { fxRng } from '../../engine/rng';

export interface Control {
  axis: number;
  run: boolean;
  drop: boolean;
  /** Кнопка «вниз» только что нажата. */
  dropPressed: boolean;
  /** Способность скакуна (свайп вверх / Shift стоя). */
  ability: boolean;
}

export class Monarch extends Entity {
  readonly tag = 'monarch' as const;
  readonly player: number;
  input: PlayerInput | null = null;
  rider: RiderLook = KING;
  riderKey = 'k0';
  private breath = 0;
  mount: MountDef = MOUNTS.horse;

  coins = 0;
  gems = 0;
  hasCrown = true;

  /** Выносливость 0..1. */
  stamina = 1;
  /** «Выдохся»: галоп недоступен, сек. */
  tired = 0;
  /** «Сытость»: галоп не тратит силы, сек. */
  wellFed = 0;
  eating = false;
  private eatTime = 0;
  private idleTime = 0;
  private speed = 0;
  private gallop = false;
  private stepTimer = 0;
  abilityCd = 0;
  private unicornCd = 0;

  payTarget: Payable | null = null;
  private payTimer = 0;
  private refundTimer = 0;
  private dropHeld = 0;
  private dropTimer = 0;
  /** После покупки кнопку держат — не роняем монеты, пока не отпустят. */
  private holdAfterPay = false;
  hoverTarget: Payable | null = null;
  purseFlash = 0;
  hitCooldown = 0;
  purchases = 0;
  /** Кто-то из подданных едет с монархом (отшельник). */
  passenger = 0;
  autopilot: ((m: Monarch, dt: number) => Partial<Control>) | null = null;
  /** Внешнее управление касанием: цель по X в мире. */
  touch: { targetX: number | null; run: boolean; drop: boolean; dropPressed: boolean; ability: boolean } | null = null;

  constructor(player: number, x: number, rider: RiderLook = KING) {
    super();
    this.player = player;
    this.x = x;
    this.rider = rider;
    this.z = 30;
  }

  setMount(id: MountId): void {
    this.mount = MOUNTS[id];
  }

  get drawRadius(): number {
    return 30;
  }

  get velocity(): number {
    return this.speed;
  }

  get moving(): boolean {
    return Math.abs(this.speed) > 1;
  }

  get galloping(): boolean {
    return this.gallop && Math.abs(this.speed) > this.walkSpeed + 3;
  }

  get walkSpeed(): number {
    const forest = this.world?.terrain?.isForest(this.x) ? this.mount.forest : 1;
    return this.mount.walk * MS * forest;
  }

  get runSpeed(): number {
    const forest = this.world?.terrain?.isForest(this.x) ? this.mount.forest : 1;
    return this.mount.run * MS * forest;
  }

  /** Занято «монетных мест» в кошельке. */
  get purseSlots(): number {
    return this.coins + this.gems * PURSE.gemSlots;
  }

  /** Кладём монету в кошелёк; при переполнении она может соскользнуть. */
  private stash(kind: 'coin' | 'gem'): boolean {
    const slots = kind === 'gem' ? PURSE.gemSlots : 1;
    if (this.purseSlots + slots > PURSE.overflow) return false;
    if (kind === 'gem') this.gems++;
    else this.coins++;
    this.purseFlash = 2.5;
    // За пределом «полного» кошелька монеты соскальзывают с горки.
    const over = this.purseSlots - PURSE.full;
    if (over > 0 && fxRng.chance(over / (PURSE.overflow - PURSE.full))) {
      if (this.coins > 0) {
        this.coins--;
        this.spillCoin(fxRng.sign() * fxRng.range(15, 35));
      }
    }
    return true;
  }

  /** Монета падает: 50 % на землю, 50 % в реку. */
  private spillCoin(vx: number): Coin {
    const w = this.world;
    const c = new Coin(this.x, 18, vx, fxRng.range(40, 70));
    c.noPickup = 0.8;
    if (fxRng.chance(0.5)) c.sinking = 1;
    w.add(c);
    return c;
  }

  private control(dt: number): Control {
    const w = this.world;
    const none: Control = { axis: 0, run: false, drop: false, dropPressed: false, ability: false };
    if (w.crownLost) return none;
    if (this.autopilot) return { ...none, ...this.autopilot(this, dt) };
    if (this.touch) {
      const t = this.touch;
      let axis = 0;
      if (t.targetX !== null) {
        const dx = t.targetX - this.x;
        if (Math.abs(dx) > 10) axis = Math.sign(dx);
      }
      const c: Control = { axis, run: t.run && axis !== 0, drop: t.drop, dropPressed: t.dropPressed, ability: t.ability };
      t.dropPressed = false;
      t.ability = false;
      if (this.input && (this.input.axis !== 0 || this.input.dropping)) {
        return { axis: this.input.axis, run: this.input.running, drop: this.input.dropping, dropPressed: this.input.pressed('drop'), ability: this.input.running && this.input.axis === 0 };
      }
      return c;
    }
    if (this.input) {
      const i = this.input;
      return { axis: i.axis, run: i.running, drop: i.dropping, dropPressed: i.pressed('drop'), ability: (i.running && i.axis === 0) || i.pressed('up') };
    }
    return none;
  }

  update(dt: number): void {
    const w = this.world;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
    if (this.purseFlash > 0) this.purseFlash -= dt;
    if (this.abilityCd > 0) this.abilityCd -= dt;
    if (this.unicornCd > 0) this.unicornCd -= dt;
    const c = this.control(dt);

    // ——— Движение ———
    if (c.axis !== 0) this.facing = c.axis > 0 ? 1 : -1;
    const canGallop = this.tired <= 0 && (this.stamina > 0 || this.wellFed > 0);
    this.gallop = c.run && c.axis !== 0 && canGallop;
    const top = c.axis === 0 ? 0 : this.gallop ? this.runSpeed : this.walkSpeed;
    this.speed = approach(this.speed, c.axis * top, (c.axis === 0 ? 170 : 120) * dt);
    this.x += this.speed * dt;
    const isl = w.island;
    // Со стороны пляжа конь останавливается у кромки воды, а не заходит в море.
    const shore = 2 * M + 6;
    const lo = isl.left + (isl.beachSide < 0 ? shore : 16);
    const hi = isl.right - (isl.beachSide > 0 ? shore : 16);
    if (this.x < lo || this.x > hi) {
      this.x = clamp(this.x, lo, hi);
      this.speed = 0;
    }

    // ——— Выносливость ———
    if (this.tired > 0) this.tired -= dt;
    if (this.wellFed > 0) this.wellFed -= dt;
    const solarBoost = this.mount.solar && w.time.isDay && w.time.season !== 'winter' ? 0.15 : 0;
    if (this.galloping) {
      if (this.wellFed <= 0) this.stamina -= dt / this.mount.stamina;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.tired = 18;
        w.sound('neigh', this.x, 0.5);
      }
    } else if (Math.abs(this.speed) > 1) {
      this.stamina = Math.min(1, this.stamina + (0.06 * this.mount.regen + solarBoost) * dt);
    } else {
      this.stamina = Math.min(1, this.stamina + (0.22 * this.mount.regen + solarBoost) * dt);
    }

    // ——— Выпас ———
    const canEat = !this.mount.solar && (this.mount.eatsAnywhere || w.terrain.canGraze(this.x, w.time.season));
    if (c.axis === 0 && !c.drop && Math.abs(this.speed) < 1) {
      this.idleTime += dt;
      if (!this.eating && this.idleTime > 1.2 && canEat && this.wellFed < 40) {
        this.eating = true;
        this.eatTime = 0;
        this.anim = 0;
      }
    } else {
      this.idleTime = 0;
      this.eating = false;
    }
    if (this.eating) {
      this.eatTime += dt;
      if (fxRng.chance(dt * 1.2)) w.sound('eat', this.x, 0.3);
      if (this.eatTime >= 3) {
        this.eating = false;
        this.idleTime = -2;
        this.wellFed = 48;
        this.stamina = 1;
        this.tired = 0;
        if (!this.mount.eatsAnywhere) w.terrain.eat(this.x, 0.5);
        // Единорог роняет монеты, пасясь.
        if (this.mount.ability === 'coins' && this.unicornCd <= 0 && w.time.season !== 'winter') {
          this.unicornCd = 10;
          for (let i = 0; i < 3; i++) {
            const cn = new Coin(this.x + this.facing * 10, 4, fxRng.range(-20, 20), fxRng.range(30, 60));
            cn.noPickup = 0.6;
            w.add(cn);
          }
        }
      }
    }

    // Цокот копыт и пыль.
    if (this.moving) {
      this.stepTimer -= dt * (Math.abs(this.speed) / 30);
      if (this.stepTimer <= 0) {
        this.stepTimer = this.galloping ? 0.36 : 0.5;
        w.sound(this.galloping ? 'gallop' : 'hoof', this.x, this.galloping ? 0.45 : 0.3);
        const winter = w.time.season === 'winter';
        const p = w.fx.particles;
        if (winter) {
          // Следы копыт на снегу (держатся полминуты) и снежная пыль.
          for (const off of [-6, 5]) p.spawn({ x: this.x + off * this.facing, y: 0, life: 30, max: 30, color: 'rgba(120,136,168,0.7)', settle: true });
          if (this.galloping) p.burst(this.x - this.facing * 8, 2, 5, { color: '#f4f8fc', speed: 22, spread: 1.4, life: 0.7, gravity: 40, drag: 1.5 });
        } else if (this.galloping) {
          // Пыль клубами, в дождь — брызги грязи, на лугу — травинки.
          const wet = w.weatherWet ?? false;
          p.burst(this.x - this.facing * 8, 2, 4, { color: wet ? '#4a3a2a' : '#a08a6a', speed: wet ? 26 : 12, spread: 1.4, life: wet ? 0.5 : 0.9, gravity: wet ? 120 : 6, drag: wet ? 0 : 2.2, size: wet ? 1 : 2 });
          if (!wet && w.terrain.grass[w.terrain.cell(this.x)] > 0.5) p.burst(this.x - this.facing * 6, 2, 2, { color: '#6e9a40', speed: 20, spread: 1, life: 0.6, gravity: 90 });
        }
      }
    }

    if (w.time.season === 'winter' && (this.breath -= dt) <= 0) {
      this.breath = this.galloping ? 0.7 : 1.8;
      w.fx.particles.spawn({ x: this.x + this.facing * 17, y: 15, vx: this.facing * 6 + this.speed * 0.3, vy: 3, life: 1.1, max: 1.1, color: 'rgba(235,242,250,0.55)', size: 2, drag: 1.2, wobble: 3 });
    }

    if (c.ability || (this.galloping && (this.mount.ability === 'aura' || this.mount.ability === 'dash'))) w.emit('mountAbility', this, c.ability);

    this.pickupCoins();
    this.updatePayment(dt, c);
  }

  private pickupCoins(): void {
    const w = this.world;
    for (const c of w.all<Coin>('coin')) {
      if (c.dead || c.noPickup > 0 || c.sinking) continue;
      if (c.ownerLock > 0 && c.owner === this.id) continue;
      const reach = PURSE.pickupRange + (c.homing === this.id ? 8 : 0);
      if (Math.abs(c.x - this.x) > reach || c.y > 28) continue;
      if (c.homing && c.homing !== this.id) continue;
      if (!this.hasCrown && c.kind === 'gem') continue;
      if (!this.stash(c.kind)) continue;
      c.dead = true;
      w.sound(c.kind === 'gem' ? 'gem' : 'coin', this.x, 0.5);
    }
  }

  findPayTarget(): Payable | null {
    if (!this.hasCrown) return null;
    let best: Payable | null = null;
    let bestScore = -Infinity;
    for (const s of this.world.all<Structure>('structure')) {
      if (s.dead) continue;
      const d = Math.abs(s.x - this.x);
      if (d > s.payWidth) continue;
      if (s.price(this) <= 0) continue;
      const ahead = Math.sign(s.x - this.x) === this.facing ? 1 : 0;
      const score = s.payPriority * 1000 - d * 2 + ahead;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  private wallet(t: Payable): number {
    return t.currency() === 'gem' ? this.gems : this.coins;
  }

  private spend(t: Payable): void {
    if (t.currency() === 'gem') this.gems--;
    else this.coins--;
    this.purseFlash = 2.5;
  }

  private updatePayment(dt: number, c: Control): void {
    const w = this.world;
    const target = this.findPayTarget();
    this.hoverTarget = target;
    if (!c.drop) {
      this.dropHeld = 0;
      this.holdAfterPay = false;
      if (this.payTarget) {
        if (this.payTarget.paid > 0) {
          this.refundTimer += dt;
          if (this.refundTimer > PURSE.refundDelay) this.refund(this.payTarget);
        } else {
          this.payTarget = null;
        }
      }
      return;
    }
    this.dropHeld += dt;
    this.refundTimer = 0;
    // Пустой кошелёк: в начале правления «вниз» перебирает облик правителя.
    if (c.dropPressed && this.coins <= 0 && this.gems <= 0) w.emit('emptyDrop', this);
    // В Two Crowns начатая оплата продолжается, даже если отъехать от объекта.
    const t = this.payTarget && this.payTarget.price(this) > 0 ? this.payTarget : target;
    if (t) {
      if (this.payTarget !== t) {
        if (this.payTarget && this.payTarget.paid > 0) this.refund(this.payTarget);
        this.payTarget = t;
        this.payTimer = 0;
      }
      this.payTimer -= dt;
      const price = t.price(this);
      if (this.payTimer <= 0 && t.paid < price) {
        if (this.wallet(t) <= 0) {
          this.payTimer = 0.3;
          return;
        }
        this.spend(t);
        t.paid++;
        this.payTimer = PURSE.payInterval;
        w.sound(t.currency() === 'gem' ? 'gem' : 'coinSlot', t.x, 0.6);
        if (t.paid >= price) {
          t.paid = 0;
          t.onPaid(this);
          this.purchases++;
          this.payTarget = null;
          this.payTimer = 0.45;
          this.holdAfterPay = true;
          w.sound('purchase', t.x, 0.8);
          w.emit('purchase', this, t);
        }
      }
      return;
    }
    // Никого рядом: первое нажатие роняет монету, удержание — ещё по одной.
    if (this.holdAfterPay) return;
    if (c.dropPressed) {
      this.dropCoin();
      this.dropTimer = 0.6;
    } else if (this.dropHeld > 0.6) {
      this.dropTimer -= dt;
      if (this.dropTimer <= 0) {
        this.dropTimer = 0.4;
        this.dropCoin();
      }
    }
  }

  /** Уронить монету (или самоцвет, если монет нет) перед собой. */
  dropCoin(): void {
    const w = this.world;
    let kind: 'coin' | 'gem' | null = null;
    if (this.coins > 0) {
      this.coins--;
      kind = 'coin';
    } else if (this.gems > 0) {
      this.gems--;
      kind = 'gem';
    }
    if (!kind) return;
    this.purseFlash = 2.5;
    const c = new Coin(this.x + this.facing * 5, 14, this.facing * 16 + this.speed * 0.5, 24, kind);
    c.noPickup = 0.3;
    c.ownerLock = 3;
    c.owner = this.id;
    w.add(c);
    w.sound('coinDrop', this.x, 0.5);
    w.emit('coinDropped', this, c);
  }

  refund(t: Payable): void {
    const w = this.world;
    const n = t.paid;
    t.paid = 0;
    for (let i = 0; i < n; i++) {
      const c = new Coin(t.x + fxRng.range(-4, 4), t.slotY(), fxRng.range(-25, 25), fxRng.range(20, 50), t.currency() === 'gem' ? 'gem' : 'coin');
      c.noPickup = 0.6;
      w.add(c);
    }
    if (this.payTarget === t) this.payTarget = null;
    this.refundTimer = 0;
  }

  /** Удар Жадности: выпадает 1 монета, без монет — самоцвет, потом корона. */
  hit(fromX: number): 'coins' | 'crown' | 'none' {
    if (!this.hasCrown) return 'none';
    const w = this.world;
    const away = this.x >= fromX ? 1 : -1;
    this.hitCooldown = 0.3;
    w.fx.shake(2);
    if (this.coins > 0 || this.gems > 0) {
      if (this.coins > 0) {
        this.coins--;
        this.spillCoin(away * fxRng.range(-10, 30));
      } else {
        this.gems--;
        const g = new Coin(this.x, 18, away * 20, 50, 'gem');
        g.noPickup = 0.8;
        w.add(g);
      }
      this.purseFlash = 2.5;
      w.sound('hurt', this.x, 0.8);
      return 'coins';
    }
    this.loseCrown(fromX);
    return 'crown';
  }

  loseCrown(fromX: number): void {
    if (!this.hasCrown) return;
    const w = this.world;
    const away = this.x >= fromX ? 1 : -1;
    this.hasCrown = false;
    const crown = new DroppedCrown(this.x, this.id);
    crown.vx = away * 30;
    w.add(crown);
    w.sound('crownLost', this.x, 1);
    w.fx.shake(6);
    w.emit('crownKnocked', this);
  }

  /** Вернуть корону (подобрали / убили вора / новая корона от товарища). */
  regainCrown(): void {
    this.hasCrown = true;
    this.world.sound('upgrade', this.x, 1);
  }

  lights(out: Light[]): void {
    out.push({ x: this.x, y: 20, radius: 56, color: hex('#ffe0a0'), intensity: 0.8, halo: false });
  }

  draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    let anim: MountAnim = 'idle';
    if (this.eating) anim = 'eat';
    else if (this.galloping) anim = 'gallop';
    else if (this.moving) anim = 'walk';
    const rider = this.hasCrown ? this.rider : { ...this.rider, crown: this.rider.hair, gem: this.rider.hair };
    const key = `${this.mount.id}:${this.riderKey}:${this.hasCrown ? 1 : 0}`;
    const frames = mountFrames(key, anim, this.mount.look, rider);
    const fps = anim === 'gallop' ? 13 * (Math.abs(this.speed) / this.runSpeed) : anim === 'walk' ? 9 * (Math.abs(this.speed) / this.walkSpeed) : anim === 'eat' ? 3 : 2.5;
    const f = frames[Math.floor(this.anim * Math.max(fps, 2)) % frames.length];
    groundShadow(ctx, r.sx(this.x) + this.facing * 2, r.sy(0), 24, 0.28);
    blit(ctx, f, r.sx(this.x), r.sy(0), this.facing < 0);
    // Уставший конь: пар изо рта.
    if (this.tired > 0 && Math.floor(this.anim * 2) % 3 === 0) {
      ctx.fillStyle = 'rgba(230,230,230,0.5)';
      ctx.fillRect(r.sx(this.x + this.facing * 18), r.sy(18), 2, 1);
    }
  }
}
