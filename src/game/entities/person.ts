// Подданные: бродяга → крестьянин → профессия (лучник, строитель, фермер,
// оруженосец, рыцарь, пикинёр). Поведение по времени суток, заказы строителей,
// охота, оборона стен, отряды, «десятина» монарху.

import { Entity } from '../entity';
import type { Renderer } from '../../render/renderer';
import { blit } from '../../engine/sprite';
import { humanFrames, type HumanAnim, type Role as ArtRole } from '../../art/humans';
import { M, PEOPLE, TITHE, PURSE, TOWER_TIERS } from '../config';
import { Coin, DroppedTool } from './pickups';
import type { Monarch } from './monarch';
import type { Structure } from '../structures/structure';
import type { Shop } from '../structures/town';
import type { Tower, Wall } from '../structures/defense';
import type { Tree, Camp, BerryBush } from '../structures/nature';
import type { Portal } from '../structures/portal';
import type { Job } from '../jobs';
import { outerWall, kingdomEdge, townX, insideKingdom, wallBetween } from '../kingdom';
import { fxRng } from '../../engine/rng';
import type { RackItem } from '../../art/items';
import { Arrow } from './projectile';
import type { Greed } from './greed';
import type { Animal } from './animal';

export type Role = 'vagrant' | 'villager' | 'archer' | 'builder' | 'farmer' | 'squire' | 'knight' | 'pikeman';

const TOOL_ROLE: Record<string, Role> = { bow: 'archer', hammer: 'builder', scythe: 'farmer', shield: 'squire', pike: 'pikeman', sword: 'knight' };
const ROLE_TOOL: Partial<Record<Role, RackItem>> = { archer: 'bow', builder: 'hammer', farmer: 'scythe', squire: 'shield', knight: 'sword', pikeman: 'pike' };

export interface FieldSlot {
  x: number;
  progress: number;
  farmerId: number;
}

export interface FarmLike extends Structure {
  fields: FieldSlot[];
  isMill: boolean;
}

export class Person extends Entity {
  readonly tag = 'person' as const;
  role: Role;
  variant: number;
  /** Несомые монеты (у оруженосца и рыцаря — броня). */
  coins = 0;
  side: -1 | 1 = 1;
  targetX: number | null = null;
  running = false;
  private moveSpeed = 0;
  action: HumanAnim | null = null;
  actionTimer = 0;
  state = 'idle';
  timer = 0;

  homeCamp = 0;
  towerId = 0;
  leaderId = 0;
  squad: number[] = [];
  job: Job | null = null;
  toolTarget: { kind: 'shop' | 'ground'; id: number; item: RackItem } | null = null;
  coinTarget = 0;
  fieldFarm = 0;
  fieldIndex = -1;
  berryTarget = 0;
  shootCd = fxRng.range(0, 1.5);
  meleeCd = 0;
  pikeHits = 0;
  /** Аура боевого коня поглощает один удар. */
  aura = 0;
  capturedBy = 0;
  stunned = 0;
  /** Портал, на который идёт отряд. */
  attackTarget = 0;
  /** Ранг в строю у стены (для расстановки). */
  rank = 0;
  /** Идёт на борт лодки (id пристани). */
  boarding = 0;
  /** Бродягу позвал хлеб пекарни (id пекарни). */
  lured = 0;
  /** Командир сопровождает монарха к пещере. */
  escort = 0;
  aboard = false;
  private titheTimer = 0;
  private wanderTimer = 0;
  private hop = 0;
  private stepPhase = fxRng.next();
  kingdomColor = '#a82a2a';

  constructor(x: number, role: Role, variant: number) {
    super();
    this.x = x;
    this.role = role;
    this.variant = variant;
    this.z = 22 + (variant % 5) * 0.1;
    this.facing = fxRng.chance(0.5) ? 1 : -1;
  }

  get drawRadius(): number {
    return 14;
  }

  get isSoldier(): boolean {
    return this.role === 'squire' || this.role === 'knight';
  }

  get maxCarry(): number {
    switch (this.role) {
      case 'archer':
        return PEOPLE.archerCoins;
      case 'farmer':
        return PEOPLE.farmerCoins;
      case 'squire':
        return PEOPLE.squireCoins;
      case 'knight':
        return PEOPLE.knightCoins;
      case 'pikeman':
        return PEOPLE.pikemanCoins;
      case 'villager':
        return 4;
      case 'builder':
        return 6;
      default:
        return 0;
    }
  }

  /** Сколько монет подданный отдаёт монарху (крестьянин оставляет себе монету найма). */
  get titheable(): number {
    if (this.isSoldier) return 0;
    if (this.role === 'villager') return Math.max(0, this.coins - 1);
    if (this.role === 'vagrant') return 0;
    return this.coins;
  }

  // ——— Движение ———

  goTo(x: number, run = false): void {
    this.targetX = x;
    this.running = run;
  }

  stop(): void {
    this.targetX = null;
  }

  get arrived(): boolean {
    return this.targetX === null || Math.abs(this.targetX - this.x) < 2;
  }

  private integrate(dt: number): void {
    const isl = this.world.island;
    if (this.targetX !== null) {
      const dx = this.targetX - this.x;
      if (Math.abs(dx) < 1.5) {
        this.moveSpeed = 0;
        this.targetX = null;
      } else {
        const sp = this.running ? PEOPLE.run : PEOPLE.walk;
        this.moveSpeed = sp;
        this.facing = dx > 0 ? 1 : -1;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
      }
    } else {
      this.moveSpeed = 0;
    }
    this.x = Math.max(isl.left + 20, Math.min(isl.right - 20, this.x));
  }

  // ——— Смена роли ———

  setRole(role: Role): void {
    const w = this.world;
    this.role = role;
    this.releaseLinks();
    this.state = 'idle';
    this.action = null;
    this.stop();
    if (role === 'squire' || role === 'knight') {
      this.coins = Math.max(this.coins, 0);
    }
    w.emit('roleChanged', this);
  }

  private releaseLinks(): void {
    const w = this.world;
    if (this.job) {
      this.job.workers.delete(this.id);
      this.job = null;
    }
    if (this.towerId) {
      const t = w.all<Tower>('structure').find((s) => s.id === this.towerId);
      if (t) t.archers = t.archers.filter((id) => id !== this.id);
      this.towerId = 0;
    }
    if (this.leaderId) {
      const l = w.all<Person>('person').find((p) => p.id === this.leaderId);
      if (l) l.squad = l.squad.filter((id) => id !== this.id);
      this.leaderId = 0;
    }
    if (this.squad.length) {
      for (const p of w.all<Person>('person')) if (this.squad.includes(p.id)) p.leaderId = 0;
      this.squad = [];
    }
    if (this.fieldFarm) {
      const f = w.all<FarmLike>('structure').find((s) => s.id === this.fieldFarm);
      if (f && f.fields[this.fieldIndex]?.farmerId === this.id) f.fields[this.fieldIndex].farmerId = 0;
      this.fieldFarm = 0;
      this.fieldIndex = -1;
    }
    if (this.world) this.releaseTool();
    else this.toolTarget = null;
    if (this.coinTarget) this.releaseCoin();
    this.coinTarget = 0;
    this.y = 0;
  }

  /** Удар Жадности. Возвращает, что выпало (для вора). */
  hitByGreed(fromX: number): { kind: 'tool'; item: DroppedTool } | { kind: 'coin'; item: Coin } | { kind: 'none' } {
    const w = this.world;
    if (this.role === 'vagrant' || this.capturedBy) return { kind: 'none' };
    if (this.aura > 0) {
      this.aura = 0;
      w.fx.particles.burst(this.x, 10, 8, { color: '#f0e0a0', speed: 30, life: 0.5, emissive: true });
      return { kind: 'none' };
    }
    this.hop = 0.25;
    const away = this.x >= fromX ? 1 : -1;
    w.sound('hurt', this.x, 0.5);
    // Оруженосцы и рыцари теряют монеты-броню.
    if (this.isSoldier && this.coins > 0) {
      this.coins--;
      w.sound('shieldHit', this.x, 0.6);
      const c = new Coin(this.x, 12, away * fxRng.range(10, 30), 50);
      c.noPickup = 0.4;
      // Выбитую монету-броню сам солдат поднимет не сразу — иначе удар «бесплатный».
      c.owner = this.id;
      c.ownerLock = 8;
      w.add(c);
      return { kind: 'coin', item: c };
    }
    if (this.role === 'pikeman') {
      this.pikeHits++;
      if (this.pikeHits < PEOPLE.pikeDurability) return { kind: 'none' };
    }
    const tool = ROLE_TOOL[this.role];
    if (tool) {
      const d = new DroppedTool(this.x, tool, -away * 20, 50);
      w.add(d);
      // Монеты-выручка тоже рассыпаются.
      this.spill(away);
      this.pikeHits = 0;
      this.setRole('villager');
      this.coins = Math.max(this.coins, 1);
      return { kind: 'tool', item: d };
    }
    if (this.role === 'villager') {
      this.coins = 0;
      const c = new Coin(this.x, 12, away * fxRng.range(10, 30), 50);
      c.noPickup = 0.4;
      w.add(c);
      this.setRole('vagrant');
      this.homeCamp = 0;
      return { kind: 'coin', item: c };
    }
    return { kind: 'none' };
  }

  private spill(away: number): void {
    const w = this.world;
    const n = this.titheable;
    for (let i = 0; i < n; i++) {
      const c = new Coin(this.x, 12, away * fxRng.range(10, 40), fxRng.range(30, 60));
      c.noPickup = 0.5;
      w.add(c);
    }
    this.coins -= n;
  }

  // ——— Основной цикл ———

  override update(dt: number): void {
    const w = this.world;
    if (this.hop > 0) this.hop -= dt;
    if (this.aura > 0) this.aura -= dt;
    if (this.capturedBy) {
      const g = w.all<Greed>('greed').find((e) => e.id === this.capturedBy);
      if (!g || g.dead) {
        this.capturedBy = 0;
        this.y = 30;
        this.vy = 0;
      } else {
        this.x = g.x;
        this.y = g.y - 10;
        return;
      }
    }
    if (this.y > 0) {
      this.vy -= 200 * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0 && !this.towerId) this.vy = 0;
    }
    if (this.stunned > 0) {
      this.stunned -= dt;
      return;
    }
    if (this.actionTimer > 0) {
      this.actionTimer -= dt;
      if (this.actionTimer <= 0) this.action = null;
    }
    this.shootCd -= dt;
    this.meleeCd -= dt;
    this.wanderTimer -= dt;
    // Команда лодки идёт на борт.
    if (this.boarding) {
      const dock = w.all<Structure>('structure').find((s) => s.id === this.boarding);
      if (!dock) this.boarding = 0;
      else {
        if (Math.abs(dock.x - this.x) > 3) this.goTo(dock.x, true);
        else this.aboard = true;
        this.integrate(dt);
        return;
      }
    }

    switch (this.role) {
      case 'vagrant':
        this.vagrantAI();
        break;
      case 'villager':
        this.villagerAI();
        break;
      case 'archer':
        this.archerAI();
        break;
      case 'builder':
        this.builderAI(dt);
        break;
      case 'farmer':
        this.farmerAI(dt);
        break;
      case 'squire':
      case 'knight':
        this.soldierAI();
        break;
      case 'pikeman':
        this.pikemanAI(dt);
        break;
    }
    this.integrate(dt);
    this.tithe(dt);
  }

  private greedNear(range: number): Greed | null {
    let best: Greed | null = null;
    let bd = range;
    for (const g of this.world.all<Greed>('greed')) {
      if (g.dead || g.kind === 'floater') continue;
      const d = Math.abs(g.x - this.x);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  private wander(center: number, radius: number, pause = 3): void {
    if (this.wanderTimer > 0 || !this.arrived) return;
    this.wanderTimer = pause + fxRng.range(0, pause * 1.5);
    if (fxRng.chance(0.35)) return;
    this.goTo(center + fxRng.range(-radius, radius));
  }

  private camp(): Camp | null {
    if (!this.homeCamp) return null;
    const c = this.world.all<Camp>('structure').find((s) => s.id === this.homeCamp && !s.dead);
    if (!c) this.homeCamp = 0;
    return c ?? null;
  }

  // ——— Бродяга ———

  private vagrantAI(): void {
    const w = this.world;
    if (this.lured) {
      const bakery = w.all<Structure>('structure').find((s) => s.id === this.lured) as (Structure & { feed(p: Person): boolean }) | undefined;
      if (!bakery) this.lured = 0;
      else {
        this.goTo(bakery.x, false);
        if (Math.abs(bakery.x - this.x) < 4 && !bakery.feed(this)) this.lured = 0;
        return;
      }
    }
    const scared = this.greedNear(4 * M);
    // Монета, брошенная прямо на бродягу, — берёт даже в страхе.
    const coinRange = scared ? 4 : 5 * M;
    let coin = this.coinTarget ? w.all<Coin>('coin').find((c) => c.id === this.coinTarget && !c.dead) : null;
    if (!coin) {
      this.coinTarget = 0;
      coin = w.nearest(w.all<Coin>('coin'), this.x, coinRange, (c) => c.kind === 'coin' && (!c.claimedBy || c.claimedBy === this.id) && c.y < 30 && c.noPickup <= 0 && !c.homing);
      if (coin) {
        coin.claimedBy = this.id;
        this.coinTarget = coin.id;
      }
    }
    if (coin) {
      if (!scared || Math.abs(coin.x - this.x) < 4) this.goTo(coin.x, true);
      if (Math.abs(coin.x - this.x) < 3 && coin.y < 6) {
        coin.dead = true;
        this.coinTarget = 0;
        this.coins = 1;
        const c = this.camp();
        if (c) c.vagrants = c.vagrants.filter((id) => id !== this.id);
        this.homeCamp = 0;
        this.setRole('villager');
        this.coins = 1;
        w.sound('recruit', this.x, 0.8);
        w.fx.particles.burst(this.x, 14, 8, { color: '#fff0a0', speed: 25, life: 0.6, emissive: true });
        w.emit('recruited', this);
      }
      return;
    }
    if (scared) {
      this.stop();
      this.action = 'panic';
      this.actionTimer = 0.3;
      return;
    }
    const c = this.camp();
    this.wander(c ? c.x : this.x, c ? 30 : 50, 4);
  }

  // ——— Крестьянин ———

  private villagerAI(): void {
    const w = this.world;
    const tc = townX(w);
    const danger = this.greedNear(6 * M);
    if (!w.time.isDay || danger) {
      this.releaseTool();
      if (this.coinTarget) this.releaseCoin();
      if (danger && Math.abs(danger.x - this.x) < 3 * M) this.goTo(this.x + Math.sign(this.x - danger.x) * 30, true);
      else if (!insideKingdom(w, this.x, 10) || Math.abs(this.x - tc) > 60) this.goTo(tc + fxRng.range(-40, 40), true);
      else this.wander(tc, 40, 3);
      return;
    }
    // Инструмент на стойке или на земле.
    if (this.toolTarget) {
      if (this.pursueTool()) return;
    } else if (this.findTool()) {
      return;
    }
    // Собирать брошенные монеты и нести монарху.
    if (this.coins < this.maxCarry && this.collectCoins(30 * M)) return;
    this.wander(tc + (this.id % 2 ? -1 : 1) * 30, 50, 3);
  }

  /** Отказаться от похода за инструментом (снять бронь). */
  private releaseTool(): void {
    const t = this.toolTarget;
    if (t && t.kind === 'ground') {
      const item = this.world.all<DroppedTool>('item').find((i) => i.id === t.id) as DroppedTool | undefined;
      if (item && item.claimedBy === this.id) item.claimedBy = 0;
    }
    this.toolTarget = null;
  }

  private releaseCoin(): void {
    const c = this.world.all<Coin>('coin').find((e) => e.id === this.coinTarget);
    if (c && c.claimedBy === this.id) c.claimedBy = 0;
    this.coinTarget = 0;
  }

  /** Подбирать монеты на земле; true — занят этим. */
  private collectCoins(range: number): boolean {
    const w = this.world;
    let coin = this.coinTarget ? w.all<Coin>('coin').find((c) => c.id === this.coinTarget && !c.dead) : null;
    if (!coin) {
      this.coinTarget = 0;
      coin = w.nearest(w.all<Coin>('coin'), this.x, range, (c) => c.kind === 'coin' && c.settled && !c.claimedBy && !c.homing && c.noPickup <= 0 && c.age > 1.5);
      if (!coin) return false;
      coin.claimedBy = this.id;
      this.coinTarget = coin.id;
    }
    this.goTo(coin.x, true);
    if (Math.abs(coin.x - this.x) < 3) {
      coin.dead = true;
      this.coins++;
      this.coinTarget = 0;
      w.sound('coin', this.x, 0.3);
    }
    return true;
  }

  private findTool(): boolean {
    const w = this.world;
    let bestShop: Shop | null = null;
    let bd = Infinity;
    for (const s of w.all<Structure>('structure')) {
      if (s.type !== 'shop') continue;
      const shop = s as Shop;
      if (shop.available <= 0) continue;
      if (shop.item === 'bomb' || shop.item === 'bread' || shop.item === 'sword') continue;
      const d = Math.abs(shop.x - this.x);
      if (d < bd) {
        bd = d;
        bestShop = shop;
      }
    }
    const ground = w.nearest(w.all<DroppedTool>('item').filter((i) => i instanceof DroppedTool) as DroppedTool[], this.x, 40 * M, (t) => t.settled && !t.claimedBy && t.item !== 'sword' && insideKingdom(w, t.x, -40));
    if (ground && Math.abs(ground.x - this.x) < bd) {
      ground.claimedBy = this.id;
      this.toolTarget = { kind: 'ground', id: ground.id, item: ground.item };
      return true;
    }
    if (bestShop) {
      bestShop.reserved++;
      this.toolTarget = { kind: 'shop', id: bestShop.id, item: bestShop.item };
      return true;
    }
    return false;
  }

  private pursueTool(): boolean {
    const w = this.world;
    const t = this.toolTarget!;
    if (t.kind === 'shop') {
      const shop = w.all<Shop>('structure').find((s) => s.id === t.id);
      if (!shop || shop.stock <= 0) {
        if (shop) shop.reserved = Math.max(0, shop.reserved - 1);
        this.toolTarget = null;
        return false;
      }
      this.goTo(shop.x, true);
      if (Math.abs(shop.x - this.x) < 4 && shop.take()) {
        this.becomeTool(t.item);
      }
      return true;
    }
    const item = w.all<DroppedTool>('item').find((i) => i.id === t.id && !i.dead) as DroppedTool | undefined;
    if (!item) {
      this.toolTarget = null;
      return false;
    }
    this.goTo(item.x, true);
    if (Math.abs(item.x - this.x) < 4) {
      item.dead = true;
      this.becomeTool(t.item);
    }
    return true;
  }

  private becomeTool(item: RackItem): void {
    const role = TOOL_ROLE[item];
    this.toolTarget = null;
    if (!role) return;
    const keep = this.coins;
    const side = this.side;
    this.setRole(role);
    this.coins = role === 'squire' ? Math.min(keep, PEOPLE.squireCoins) : role === 'knight' ? keep : Math.max(0, keep - 1);
    if (role === 'knight') this.side = side;
    if (role === 'squire') {
      const shieldShop = this.world.all<Shop>('structure').find((s) => s.type === 'shop' && s.kind === 'shield' && Math.abs(s.x - this.x) < 20);
      if (shieldShop && shieldShop.side) this.side = shieldShop.side as -1 | 1;
    }
    this.world.sound('upgrade', this.x, 0.5);
    this.world.fx.particles.burst(this.x, 12, 6, { color: '#fff0c0', speed: 20, life: 0.5, emissive: true });
  }

  // ——— Лучник ———

  private archerRange(): number {
    const t = this.tower();
    return PEOPLE.archerRange + (t ? TOWER_TIERS[t.level].range * M : 0);
  }

  tower(): Tower | null {
    if (!this.towerId) return null;
    const t = this.world.all<Tower>('structure').find((s) => s.id === this.towerId && !s.dead);
    if (!t) {
      this.towerId = 0;
      this.y = 0;
    }
    return t ?? null;
  }

  private archerAI(): void {
    const w = this.world;
    // В отряде — идём за командиром.
    if (this.leaderId) {
      const leader = w.all<Person>('person').find((p) => p.id === this.leaderId && !p.dead && p.isSoldier);
      if (!leader) {
        this.leaderId = 0;
      } else {
        const behind = leader.x - leader.facing * (10 + (leader.squad.indexOf(this.id) + 1) * 7);
        if (Math.abs(behind - this.x) > 6) this.goTo(behind, Math.abs(behind - this.x) > 30);
        this.shootAt(this.findShootTarget(this.archerRange(), true));
        return;
      }
    }
    // В башне.
    const tower = this.tower();
    if (tower) {
      const slot = tower.archers.indexOf(this.id);
      const px = tower.x + (slot - (tower.archers.length - 1) / 2) * 5;
      if (this.y < tower.platform - 1) {
        this.goTo(px, true);
        if (Math.abs(this.x - px) < 3) {
          this.y = tower.platform;
          this.vy = 0;
        }
        return;
      }
      this.x = px;
      this.y = tower.platform;
      const target = this.findShootTarget(this.archerRange(), w.time.isDay);
      this.shootAt(target);
      return;
    }
    // Свободные башни — занимаем.
    if (this.state !== 'toTower') {
      for (const t of w.all<Tower>('structure')) {
        if (t.type !== 'tower' || t.building || t.level < 1) continue;
        if (t.archers.length < t.slots) {
          t.archers.push(this.id);
          this.towerId = t.id;
          return;
        }
      }
    }
    if (!w.time.isDay || w.time.phase > 0.6) {
      this.defendPosition(8);
      this.shootAt(this.findShootTarget(this.archerRange(), false));
      return;
    }
    // Днём — охота.
    if (this.coins >= this.maxCarry) {
      this.goTo(townX(w) + this.side * 20);
      return;
    }
    const target = this.findShootTarget(this.archerRange(), true);
    if (target) {
      this.stop();
      this.shootAt(target);
      return;
    }
    // Ищем дичь дальше.
    const prey = w.nearest(w.all<Animal>('animal'), this.x, 30 * M, (a) => a.huntable);
    if (prey) {
      const standoff = prey.x - Math.sign(prey.x - this.x) * (PEOPLE.archerRange * 0.7);
      this.goTo(standoff);
      return;
    }
    // Собираем монеты с добычи.
    if (this.collectCoins(12 * M)) return;
    const edge = kingdomEdge(w, this.side);
    this.wander(edge + this.side * 18 * M, 14 * M, 4);
  }

  /** Встать у внешней стены своей стороны (изнутри). */
  private defendPosition(inside: number): void {
    const w = this.world;
    const side = w.hornCall && (this.role === 'archer' || this.isSoldier) ? w.hornCall : this.side;
    const ow = outerWall(w, side);
    const edge = ow ? ow.x : kingdomEdge(w, side);
    const pos = edge - side * (inside + (this.rank % 6) * 5);
    if (Math.abs(this.x - pos) > 3) this.goTo(pos, !w.time.isDay || Math.abs(this.x - pos) > 60);
    else if (this.arrived) this.facing = side;
  }

  private findShootTarget(range: number, hunt: boolean): Entity | null {
    const w = this.world;
    let best: Entity | null = null;
    let bd = range;
    for (const g of w.all<Greed>('greed')) {
      if (g.dead) continue;
      const d = Math.abs(g.x - this.x);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    if (best) return best;
    if (!hunt) return null;
    for (const a of w.all<Animal>('animal')) {
      if (a.dead || !a.huntable) continue;
      const d = Math.abs(a.x - this.x);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    // Отряд атакует портал.
    if (!best && this.leaderId) {
      const leader = w.all<Person>('person').find((p) => p.id === this.leaderId);
      if (leader?.attackTarget) {
        const portal = w.all<Portal>('structure').find((s) => s.id === leader.attackTarget && !s.dead);
        if (portal && !portal.destroyed && Math.abs(portal.x - this.x) < range) return portal;
      }
    }
    return best;
  }

  private shootAt(target: Entity | null): void {
    if (!target || this.shootCd > 0) return;
    const w = this.world;
    this.shootCd = PEOPLE.archerInterval * fxRng.range(0.85, 1.15);
    this.facing = target.x > this.x ? 1 : -1;
    this.action = 'act';
    this.actionTimer = 0.5;
    const blessed = w.meta.blessings.has('archery');
    const accurate = blessed || fxRng.chance(PEOPLE.archerAccuracy);
    const tx = target.x + (target.vx || 0) * 0.5 + (accurate ? 0 : fxRng.range(-18, 18));
    const ty = target.tag === 'greed' ? (target as Greed).hitHeight / 2 + target.y : target.tag === 'structure' ? 16 : 3;
    const arrow = new Arrow(this.x + this.facing * 4, this.y + 12, tx, ty, blessed ? PEOPLE.archerDamage * 1.5 : PEOPLE.archerDamage, this.id);
    w.add(arrow);
    w.sound('bow', this.x, 0.45);
  }

  // ——— Строитель ———

  private builderAI(dt: number): void {
    const w = this.world;
    if (this.job && (this.job.target.dead || !w.jobs.jobs.includes(this.job))) {
      this.job.workers.delete(this.id);
      this.job = null;
    }
    // Днём расчёт катапульты уходит на стройку, если есть свободный заказ.
    if (this.job?.kind === 'operate' && w.time.isDay && fxRng.chance(dt * 0.5)) {
      const other = w.jobs.jobs.some((j) => j.kind !== 'operate' && !j.target.dead && j.workers.size < j.maxWorkers);
      if (other) {
        this.job.workers.delete(this.id);
        this.job = null;
      }
    }
    if (!this.job) {
      this.job = w.jobs.claim(this.id, this.x, () => true, !w.time.isDay || w.time.phase > 0.6);
    }
    if (this.job) {
      const j = this.job;
      const t = j.target;
      const standX = t.x + (this.id % 2 ? -1 : 1) * (t.type === 'tree' ? 6 : 5);
      if (Math.abs(this.x - standX) > 3) {
        this.goTo(standX, Math.abs(this.x - standX) > 40 || !w.time.isDay);
        return;
      }
      this.stop();
      this.facing = t.x > this.x ? 1 : -1;
      this.action = 'act';
      this.actionTimer = 0.3;
      if (fxRng.chance(dt * 2.2)) w.sound(j.kind === 'chop' ? 'chop' : 'hammer', this.x, 0.35);
      if (j.kind === 'repair') {
        const done = (t as Wall).repair(2 * dt);
        if (done) {
          w.jobs.remove(j);
          this.job = null;
        }
      } else if (j.kind === 'chop') {
        const tree = t as Tree;
        if (tree.addWork(dt)) {
          this.coins += tree.rollCoins();
          this.job = null;
        }
      } else if (j.kind === 'build' || j.kind === 'boat') {
        if (t.addWork(dt) || !t.building) {
          w.jobs.remove(j);
          this.job = null;
        }
      } else if (j.kind === 'operate') {
        (t as Structure & { operate?: (dt: number, p: Person) => void }).operate?.(dt, this);
      } else if (j.kind === 'push') {
        (t as Structure & { push?: (dt: number) => void }).push?.(dt);
        this.x = t.x - Math.sign(t.x - this.x || 1) * 6;
      }
      return;
    }
    // Свободный строитель.
    if (!w.time.isDay || w.time.phase > 0.6) {
      const ow = outerWall(w, this.side);
      if (ow) {
        const threat = this.greedNear(12 * M);
        const pos = threat ? ow.x - this.side * (10 + (this.rank % 4) * 4) : ow.x + this.side * (7 + (this.rank % 4) * 4);
        if (Math.abs(this.x - pos) > 3) this.goTo(pos, true);
      } else {
        this.goTo(townX(w) + fxRng.range(-30, 30), true);
      }
      return;
    }
    if (this.collectCoins(8 * M)) return;
    this.wander(townX(w) + this.side * 40, 40, 4);
  }

  // ——— Фермер ———

  private farm(): FarmLike | null {
    if (!this.fieldFarm) return null;
    const f = this.world.all<FarmLike>('structure').find((s) => s.id === this.fieldFarm && !s.dead);
    if (!f || !f.fields[this.fieldIndex]) {
      this.fieldFarm = 0;
      this.fieldIndex = -1;
      return null;
    }
    return f;
  }

  private farmerAI(dt: number): void {
    const w = this.world;
    const winter = w.time.season === 'winter';
    // Ягоды по приказу (обычно зимой).
    if (w.time.isDay) {
      let bush = this.berryTarget ? (w.all<Structure>('structure').find((s) => s.id === this.berryTarget) as BerryBush | undefined) : undefined;
      if (!bush || !bush.ordered) {
        this.berryTarget = 0;
        bush = w.all<Structure>('structure').find((s) => (s as BerryBush).isBerryBush && (s as BerryBush).ordered && !w.all<Person>('person').some((p) => p !== this && p.berryTarget === s.id)) as BerryBush | undefined;
        if (bush) this.berryTarget = bush.id;
      }
      if (bush) {
        if (Math.abs(bush.x - this.x) > 4) {
          this.goTo(bush.x, true);
          this.timer = 0;
        } else {
          this.stop();
          this.action = 'act';
          this.actionTimer = 0.3;
          this.timer += dt;
          if (this.timer >= PEOPLE.berryTime) {
            this.coins = Math.min(this.maxCarry, this.coins + bush.harvest());
            this.berryTarget = 0;
            this.timer = 0;
          }
        }
        return;
      }
    }
    let farm = this.farm();
    if (!farm) {
      for (const f of w.all<FarmLike>('structure')) {
        if (!f.fields) continue;
        const idx = f.fields.findIndex((s) => !s.farmerId);
        if (idx >= 0) {
          f.fields[idx].farmerId = this.id;
          this.fieldFarm = f.id;
          this.fieldIndex = idx;
          farm = f;
          break;
        }
      }
    }
    if (!w.time.isDay || w.time.phase > 0.6 || winter || !farm) {
      if (farm?.isMill && !winter) {
        this.goTo(farm.x);
        return;
      }
      if (!insideKingdom(w, this.x, 10) || Math.abs(this.x - townX(w)) > 70) this.goTo(townX(w) + fxRng.range(-40, 40), !w.time.isDay);
      else this.wander(townX(w), 45, 4);
      return;
    }
    const field = farm.fields[this.fieldIndex];
    if (Math.abs(this.x - field.x) > 4) {
      this.goTo(field.x, false);
      return;
    }
    this.stop();
    this.action = 'act';
    this.actionTimer = 0.3;
    field.progress += dt;
    if (field.progress >= PEOPLE.fieldWork) {
      field.progress = 0;
      this.coins = Math.min(this.maxCarry, this.coins + PEOPLE.fieldCoins);
      w.sound('coin', this.x, 0.6);
      w.fx.particles.burst(this.x, 6, 10, { color: '#f0d868', speed: 30, life: 0.7, emissive: true });
    }
  }

  // ——— Оруженосец и рыцарь ———

  private soldierAI(): void {
    const w = this.world;
    // Оруженосец идёт за мечом в кузницу.
    if (this.role === 'squire' && w.time.isDay) {
      if (this.toolTarget) {
        if (this.pursueTool()) return;
      } else {
        const forge = w.all<Shop>('structure').find((s) => s.type === 'shop' && s.kind === 'sword' && s.available > 0);
        if (forge) {
          forge.reserved++;
          this.toolTarget = { kind: 'shop', id: forge.id, item: 'sword' };
          return;
        }
      }
    }
    // Пополнение брони: подбираем монеты, брошенные рядом.
    if (this.coins < this.maxCarry) {
      const c = w.nearest(w.all<Coin>('coin'), this.x, 3 * M, (e) => e.kind === 'coin' && e.y < 20 && e.noPickup <= 0 && !(e.ownerLock > 0 && e.owner === this.id) && (!e.claimedBy || e.claimedBy === this.id) && !e.homing);
      if (c) {
        this.goTo(c.x, true);
        if (Math.abs(c.x - this.x) < 3) {
          c.dead = true;
          this.coins++;
          w.sound('coin', this.x, 0.4);
        }
        return;
      }
    }
    // Набираем лучников в отряд.
    if (this.squad.length < PEOPLE.squadSize) {
      for (const p of w.all<Person>('person')) {
        if (p.role !== 'archer' || p.leaderId || p.towerId) continue;
        if (Math.abs(p.x - this.x) < 2.5 * M) {
          p.leaderId = this.id;
          this.squad.push(p.id);
          if (this.squad.length >= PEOPLE.squadSize) break;
        }
      }
    }
    const enemy = this.greedNear(1.4 * M);
    if (enemy && !wallBetween(w, this.x, enemy.x)) {
      this.stop();
      this.facing = enemy.x > this.x ? 1 : -1;
      if (this.meleeCd <= 0) {
        this.meleeCd = PEOPLE.meleeInterval;
        this.action = 'act';
        this.actionTimer = 0.45;
        enemy.takeDamage(this.role === 'knight' ? PEOPLE.knightDamage : PEOPLE.squireDamage, this.x);
        w.sound('swing', this.x, 0.5);
      }
      return;
    }
    // Статуя рыцарей: выпад через стену.
    if (enemy && w.meta.blessings.has('knights') && this.role === 'knight' && this.meleeCd <= 0) {
      this.meleeCd = PEOPLE.meleeInterval * 1.2;
      this.action = 'act';
      this.actionTimer = 0.45;
      enemy.takeDamage(PEOPLE.knightDamage, this.x);
    }
    // Сопровождение монарха с бомбой к пещере.
    if (this.escort) {
      const m = w.all<Monarch>('monarch').find((e) => e.id === this.escort);
      if (!m || w.caveCleared) this.escort = 0;
      else {
        const pos = m.x - m.facing * 20;
        if (Math.abs(pos - this.x) > 6) this.goTo(pos, Math.abs(pos - this.x) > 40);
        return;
      }
    }
    // Приказ атаковать портал.
    if (this.attackTarget) {
      const portal = w.all<Portal>('structure').find((s) => s.id === this.attackTarget);
      if (!portal || portal.destroyed) {
        this.attackTarget = 0;
      } else {
        const stand = portal.x - Math.sign(portal.x - this.x) * 12;
        if (Math.abs(this.x - stand) > 4) {
          this.goTo(stand, false);
        } else {
          this.stop();
          this.facing = portal.x > this.x ? 1 : -1;
          if (this.meleeCd <= 0) {
            this.meleeCd = PEOPLE.meleeInterval;
            this.action = 'act';
            this.actionTimer = 0.45;
            portal.damage(this.role === 'knight' ? PEOPLE.knightDamage : PEOPLE.squireDamage, this.x);
          }
        }
        return;
      }
    }
    this.defendPosition(4);
  }

  // ——— Пикинёр ———

  private pikemanAI(dt: number): void {
    const w = this.world;
    if (!w.time.isDay || w.time.phase > 0.6) {
      this.defendPosition(3);
      const enemy = this.greedNear(PEOPLE.pikeReach);
      if (enemy && this.meleeCd <= 0) {
        this.meleeCd = PEOPLE.meleeInterval;
        this.facing = enemy.x > this.x ? 1 : -1;
        this.action = 'act';
        this.actionTimer = 0.45;
        enemy.takeDamage(PEOPLE.pikeDamage, this.x);
      }
      return;
    }
    // Днём — рыбалка у реки внутри королевства.
    if (this.coins >= this.maxCarry) {
      this.wander(townX(w), 40, 3);
      return;
    }
    const spot = townX(w) + this.side * (30 + (this.id % 5) * 12);
    if (Math.abs(this.x - spot) > 4) {
      this.goTo(spot);
      this.timer = 0;
      return;
    }
    this.stop();
    this.action = 'act';
    this.actionTimer = 0.2;
    this.timer += dt;
    if (this.timer > PEOPLE.fishInterval) {
      this.timer = 0;
      this.coins++;
      w.fx.ripple(this.x + this.facing * 8, 5);
      w.sound('splash', this.x, 0.4);
    }
  }

  // ——— «Десятина» ———

  private tithe(dt: number): void {
    const n = this.titheable;
    if (n <= 0) return;
    const w = this.world;
    this.titheTimer -= dt;
    if (this.titheTimer > 0) return;
    for (const m of w.all<Monarch>('monarch')) {
      if (!m.hasCrown) continue;
      if (Math.abs(m.x - this.x) > TITHE.range) continue;
      if (Math.abs(m.velocity) > m.walkSpeed * TITHE.speedFrac) continue;
      if (m.coins >= PURSE.overflow) continue;
      this.titheTimer = TITHE.interval;
      this.coins--;
      const c = new Coin(this.x, this.y + 14, (m.x - this.x) * 1.4, 70);
      c.homing = m.id;
      w.add(c);
      this.action = 'act';
      this.actionTimer = 0.25;
      return;
    }
  }

  // ——— Отрисовка ———

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.aboard) return;
    let anim: HumanAnim = 'idle';
    if (this.action) anim = this.action;
    else if (this.moveSpeed > 0) anim = this.running ? 'run' : 'walk';
    if (this.capturedBy) anim = 'panic';
    const artRole: ArtRole = this.role === 'villager' ? 'peasant' : (this.role as ArtRole);
    const frames = humanFrames(artRole, this.variant % 6, anim, this.kingdomColor);
    const fps = anim === 'run' ? 12 : anim === 'walk' ? 8 : anim === 'act' ? 8 : 3;
    const f = frames[Math.floor((this.anim + this.stepPhase) * fps) % frames.length];
    const hopY = this.hop > 0 ? Math.sin((this.hop / 0.25) * Math.PI) * 3 : 0;
    blit(ctx, f, r.sx(this.x), r.sy(this.y + hopY), this.facing < 0);
    // Монеты-броня у оруженосца и рыцаря — маленький мешочек.
    if (this.isSoldier && this.coins > 0 && this.aura <= 0) {
      ctx.fillStyle = '#f2c84a';
      ctx.fillRect(r.sx(this.x) - this.facing * 3, r.sy(this.y + 7), 1, 1);
    }
    if (this.aura > 0) {
      ctx.globalAlpha = 0.35 + Math.sin(this.anim * 8) * 0.15;
      ctx.fillStyle = '#f8e8a0';
      ctx.fillRect(r.sx(this.x) - 5, r.sy(this.y + 20), 10, 1);
      ctx.globalAlpha = 1;
    }
  }

  serialize(): Record<string, unknown> {
    return { x: this.x, role: this.role, variant: this.variant, coins: this.coins, side: this.side, homeCamp: this.homeCamp, pikeHits: this.pikeHits };
  }
}
