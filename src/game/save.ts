// Сохранение кампании в localStorage: каждое утро (автосохранение) и при выходе.
// Сохраняются все посещённые острова: постройки, жители, монеты на земле,
// трава, а также общее состояние кампании (самоцветы, технологии, банк).

import { loadJson, saveJson, removeKey } from '../engine/storage';
import { Campaign, randomRuler } from './campaign';
import type { World } from './world';
import { emptyIsland, installIslandSystems } from './island';
import { Monarch } from './entities/monarch';
import { Person, type Role } from './entities/person';
import { Coin, DroppedTool } from './entities/pickups';
import type { Entity } from './entity';
import { TownCenter, Shop } from './structures/town';
import { Wall, Tower } from './structures/defense';
import { Tree, Stump, Rock, Camp, Chest, BerryBush } from './structures/nature';
import { Portal, type PortalKind } from './structures/portal';
import { Farm, type FarmStage } from './structures/farm';
import { MerchantHut, Merchant, Banker, GemKeeper } from './structures/economy';
import { CentralDock, FarDock, type BoatStage } from './structures/boat';
import { Mine, Statue, MountSpot, DogTrap, SquadBanner, SiegeWorkshop, Catapult, Teleport, CitizenHouse } from './structures/special';
import { HermitHut, Hermit, Ballista, Bakery, HornPost, type HermitKind } from './structures/hermits';
import { BombBanner, Bomb, Nest } from './structures/cave';
import { Dog, Boar } from './entities/npc';
import type { Structure } from './structures/structure';
import type { MountId } from './mounts';
import type { TreeKind } from '../render/treegen';
import type { ShopKind, StatueKind } from '../art/buildings';
import type { RackItem } from '../art/items';

const KEY = 'campaign-v1';

type Rec = Record<string, any>;

function base(s: Structure): Rec {
  return { x: s.x, level: s.level, hp: s.hp, building: s.building, bp: s.buildProgress, bt: s.buildTime, tl: s.targetLevel, sc: s.scaffold };
}

function snapEntity(e: Entity): Rec | null {
  const id = e.id;
  if (e instanceof TownCenter) return { cls: 'TownCenter', id, ...base(e), cooldown: e.cooldown };
  if (e instanceof Wall) return { cls: 'Wall', id, ...base(e), destroyed: e.destroyed, inner: e.inner, horn: e.horn };
  if (e instanceof Tower) return { cls: 'Tower', id, ...base(e), special: e.special };
  if (e instanceof Shop) return { cls: 'Shop', id, ...base(e), kind: e.kind, stock: e.stock, max: e.max, side: e.side };
  if (e instanceof Farm) return { cls: 'Farm', id, ...base(e), stage: e.stage, fields: e.fields.map((f) => f.progress) };
  if (e instanceof Tree) return { cls: 'Tree', id, x: e.x, kind: e.kind, variant: e.variant, height: e.height, marked: e.marked, bp: e.buildProgress };
  if (e instanceof Stump) return { cls: 'Stump', id, x: e.x };
  if (e instanceof Rock) return { cls: 'Rock', id, x: e.x, variant: e.variant };
  if (e instanceof Camp) return { cls: 'Camp', id, x: e.x };
  if (e instanceof Chest) return { cls: 'Chest', id, x: e.x, gems: e.gems, amount: e.amount, opened: e.opened };
  if (e instanceof BerryBush) return { cls: 'BerryBush', id, x: e.x, berries: e.berries, regrow: e.regrow };
  if (e instanceof Portal) return { cls: 'Portal', id, x: e.x, kind: e.kind, side: e.side, hp: e.hp, destroyed: e.destroyed, key: (e as Portal & { key?: string }).key };
  if (e instanceof CentralDock) return { cls: 'CentralDock', id, x: e.x, stage: e.stage === 'crewed' ? 'launched' : e.stage === 'launching' ? 'repaired' : e.stage, parts: e.parts, ordered: e.ordered };
  if (e instanceof FarDock) return { cls: 'FarDock', id, ...base(e), has: e.hasLighthouse };
  if (e instanceof MerchantHut) return { cls: 'MerchantHut', id, x: e.x };
  if (e instanceof Merchant) return { cls: 'Merchant', id, x: e.x, hutId: e.hutId, state: e.state, loaded: e.loaded, giveDay: e.giveDay };
  if (e instanceof GemKeeper) return { cls: 'GemKeeper', id, x: e.x };
  if (e instanceof Mine) return { cls: 'Mine', id, ...base(e), kind: e.kind, built: e.built };
  if (e instanceof Statue) return { cls: 'Statue', id, x: e.x, kind: e.kind };
  if (e instanceof MountSpot) return { cls: 'MountSpot', id, x: e.x, mount: e.mount, left: e.leftBehind };
  if (e instanceof DogTrap) return { cls: 'DogTrap', id, x: e.x, freed: e.freed };
  if (e instanceof SquadBanner) return { cls: 'SquadBanner', id, side: e.side };
  if (e instanceof SiegeWorkshop) return { cls: 'SiegeWorkshop', id, side: e.side };
  if (e instanceof Catapult) return { cls: 'Catapult', id, ...base(e), side: e.side };
  if (e instanceof Teleport) return { cls: 'Teleport', id, ...base(e), built: e.built, pairX: e.pairX };
  if (e instanceof CitizenHouse) return { cls: 'CitizenHouse', id, ...base(e), built: e.built, citizens: e.citizens };
  if (e instanceof HermitHut) return { cls: 'HermitHut', id, x: e.x, kind: e.kind, released: e.released };
  if (e instanceof Hermit) return e.state === 'settled' ? null : { cls: 'Hermit', id, x: e.x, kind: e.kind };
  if (e instanceof Ballista) return { cls: 'Ballista', id, towerId: e.towerId };
  if (e instanceof Bakery) return { cls: 'Bakery', id, towerId: e.towerId, shopId: e.shopId };
  if (e instanceof HornPost) return { cls: 'HornPost', id, wallId: e.wallId };
  if (e instanceof BombBanner) return { cls: 'BombBanner', id, side: e.side, bought: e.bought };
  if (e instanceof Bomb) return e.stage === 'boom' ? null : { cls: 'Bomb', id, x: e.x, stage: e.stage === 'armed' ? 'march' : e.stage };
  if (e instanceof Nest) return { cls: 'Nest', id, x: e.x, hp: e.hp };
  if (e instanceof Person) return e.aboard ? null : { cls: 'Person', id, x: e.x, role: e.role, variant: e.variant, coins: e.coins, side: e.side, homeCamp: e.homeCamp, pikeHits: e.pikeHits };
  if (e instanceof Coin) return e.homing ? null : { cls: 'Coin', id, x: e.x, kind: e.kind };
  if (e instanceof DroppedTool) return { cls: 'DroppedTool', id, x: e.x, item: e.item };
  if (e instanceof Banker) return { cls: 'Banker', id, x: e.x };
  if (e instanceof Dog) return { cls: 'Dog', id, x: e.x };
  if (e instanceof Boar) return e.dead ? null : { cls: 'Boar', id, x: e.den, hp: e.hp };
  return null;
}

function snapWorld(w: World): Rec {
  const entities: Rec[] = [];
  for (const e of w.entities) {
    if (e.dead || e.tag === 'monarch') continue;
    const r = snapEntity(e);
    if (r) entities.push(r);
  }
  return {
    index: w.island.index,
    beachSide: w.island.beachSide,
    time: w.time.serialize(),
    terrain: w.terrain.serialize(),
    caveCleared: w.caveCleared,
    stolenGems: w.stolenGems,
    entities,
  };
}

function applyBase(s: Structure, r: Rec): void {
  s.level = r.level ?? s.level;
  s.hp = r.hp ?? s.hp;
  s.building = !!r.building;
  s.buildProgress = r.bp ?? 0;
  s.buildTime = r.bt ?? 0;
  s.targetLevel = r.tl ?? 0;
  s.scaffold = !!r.sc;
}

function restoreWorld(r: Rec, c: Campaign): World {
  const w = emptyIsland(c.seed, r.index, r.beachSide, c.meta);
  installIslandSystems(w, r.index);
  if (c.caves.has(r.index)) w.caveCleared = true;
  w.caveCleared = w.caveCleared || !!r.caveCleared;
  w.stolenGems = r.stolenGems ?? 0;
  w.time.restore(r.time);
  const byOld = new Map<number, Entity>();
  const later: Array<() => void> = [];
  for (const e of r.entities as Rec[]) {
    let ent: Entity | null = null;
    switch (e.cls) {
      case 'TownCenter': {
        const s = new TownCenter(e.x, e.level);
        applyBase(s, e);
        s.cooldown = e.cooldown;
        ent = s;
        break;
      }
      case 'Wall': {
        const s = new Wall(e.x, e.level);
        applyBase(s, e);
        s.destroyed = e.destroyed;
        s.inner = e.inner;
        s.horn = e.horn;
        ent = s;
        break;
      }
      case 'Tower': {
        const s = new Tower(e.x, e.level);
        applyBase(s, e);
        s.special = e.special;
        ent = s;
        break;
      }
      case 'Shop': {
        const s = new Shop(e.x, e.kind as ShopKind, e.max);
        applyBase(s, e);
        s.stock = e.stock;
        s.side = e.side;
        if (s.kind === 'pike') s.condition = () => w.all<Wall>('structure').some((x) => x.type === 'wall' && x.blocks && x.level >= 3);
        if (s.kind === 'sword') s.condition = () => w.meta.tech >= 2;
        ent = s;
        break;
      }
      case 'Farm': {
        const s = new Farm(e.x);
        applyBase(s, e);
        s.stage = e.stage as FarmStage;
        later.push(() => {
          s.update();
          (e.fields as number[]).forEach((p, i) => {
            if (s.fields[i]) s.fields[i].progress = p;
          });
          if (s.stage !== 'site') w.terrain.block(s.x - 40, s.x + 40, true);
        });
        ent = s;
        break;
      }
      case 'Tree': {
        const s = new Tree(e.x, e.kind as TreeKind, e.variant, e.height);
        if (e.marked) {
          s.marked = true;
          s.startBuild(0, 8);
          s.buildProgress = e.bp ?? 0;
          later.push(() => w.jobs.add('chop', s, 2, 0));
        }
        ent = s;
        break;
      }
      case 'Stump':
        ent = new Stump(e.x);
        break;
      case 'Rock':
        ent = new Rock(e.x, e.variant);
        break;
      case 'Camp':
        ent = new Camp(e.x);
        break;
      case 'Chest': {
        const s = new Chest(e.x, e.gems, e.amount);
        s.opened = e.opened;
        ent = s;
        break;
      }
      case 'BerryBush': {
        const s = new BerryBush(e.x);
        s.berries = e.berries;
        s.regrow = e.regrow;
        ent = s;
        break;
      }
      case 'Portal': {
        const s = new Portal(e.x, e.kind as PortalKind, e.side);
        s.hp = e.hp;
        s.destroyed = e.destroyed;
        (s as Portal & { key?: string }).key = e.key;
        ent = s;
        break;
      }
      case 'CentralDock': {
        const s = new CentralDock(e.x, r.index);
        s.stage = e.stage as BoatStage;
        s.parts = e.parts;
        s.ordered = e.ordered;
        ent = s;
        break;
      }
      case 'FarDock': {
        const s = new FarDock(e.x);
        applyBase(s, e);
        s.hasLighthouse = e.has;
        ent = s;
        break;
      }
      case 'MerchantHut':
        ent = new MerchantHut(e.x);
        break;
      case 'Merchant': {
        const s = new Merchant(e.x, 0, 0);
        s.state = e.state;
        s.loaded = e.loaded;
        s.giveDay = e.giveDay;
        later.push(() => (s.hutId = byOld.get(e.hutId)?.id ?? 0));
        ent = s;
        break;
      }
      case 'GemKeeper':
        ent = new GemKeeper(e.x);
        break;
      case 'Mine': {
        const s = new Mine(e.x, e.kind);
        applyBase(s, e);
        s.built = e.built;
        ent = s;
        break;
      }
      case 'Statue':
        ent = new Statue(e.x, e.kind as StatueKind);
        break;
      case 'MountSpot': {
        const s = new MountSpot(e.x, e.mount as MountId);
        s.leftBehind = e.left;
        ent = s;
        break;
      }
      case 'DogTrap': {
        const s = new DogTrap(e.x);
        s.freed = e.freed;
        ent = s;
        break;
      }
      case 'SquadBanner':
        ent = new SquadBanner(e.side);
        break;
      case 'SiegeWorkshop':
        ent = new SiegeWorkshop(e.side);
        break;
      case 'Catapult': {
        const s = new Catapult(e.side, e.x);
        applyBase(s, e);
        ent = s;
        break;
      }
      case 'Teleport': {
        const s = new Teleport(e.x);
        applyBase(s, e);
        s.built = e.built;
        s.pairX = e.pairX;
        ent = s;
        break;
      }
      case 'CitizenHouse': {
        const s = new CitizenHouse(e.x);
        applyBase(s, e);
        s.built = e.built;
        s.citizens = e.citizens;
        ent = s;
        break;
      }
      case 'HermitHut': {
        const s = new HermitHut(e.x, e.kind as HermitKind);
        s.released = e.released;
        ent = s;
        break;
      }
      case 'Hermit': {
        const s = new Hermit(e.x, e.kind as HermitKind);
        s.state = 'waiting';
        ent = s;
        break;
      }
      case 'Ballista':
        later.push(() => {
          const t = byOld.get(e.towerId) as Tower | undefined;
          if (t) w.add(new Ballista(t));
        });
        break;
      case 'Bakery':
        later.push(() => {
          const t = byOld.get(e.towerId) as Tower | undefined;
          const shop = byOld.get(e.shopId);
          if (t && shop) w.add(new Bakery(t, shop.id));
        });
        break;
      case 'HornPost':
        later.push(() => {
          const wl = byOld.get(e.wallId) as Wall | undefined;
          if (wl) w.add(new HornPost(wl));
        });
        break;
      case 'BombBanner': {
        const s = new BombBanner(e.side);
        s.bought = e.bought;
        ent = s;
        break;
      }
      case 'Bomb': {
        const s = new Bomb(e.x);
        s.stage = e.stage;
        if (s.stage === 'march') later.push(() => w.jobs.add('push', s, 3, 0));
        ent = s;
        break;
      }
      case 'Nest': {
        const s = new Nest(e.x);
        s.hp = e.hp;
        ent = s;
        break;
      }
      case 'Person': {
        const p = new Person(e.x, e.role as Role, e.variant);
        p.coins = e.coins;
        p.side = e.side;
        p.pikeHits = e.pikeHits ?? 0;
        later.push(() => (p.homeCamp = byOld.get(e.homeCamp)?.id ?? 0));
        ent = p;
        break;
      }
      case 'Coin': {
        const cn = new Coin(e.x, 0, 0, 0, e.kind);
        cn.settled = true;
        ent = cn;
        break;
      }
      case 'DroppedTool': {
        const d = new DroppedTool(e.x, e.item as RackItem, 0, 0);
        d.y = 0;
        d.settled = true;
        ent = d;
        break;
      }
      case 'Banker':
        ent = new Banker(e.x);
        break;
      case 'Dog':
        ent = new Dog(e.x, 0);
        break;
      case 'Boar': {
        const b = new Boar(e.x);
        b.hp = e.hp;
        ent = b;
        break;
      }
    }
    if (ent) {
      w.addNow(ent);
      byOld.set(e.id, ent);
    }
  }
  for (const fn of later) fn();
  // Лагеря: восстановить списки бродяг.
  for (const camp of w.all<Camp>('structure')) {
    if (camp.type !== 'camp') continue;
    camp.vagrants = w.all<Person>('person').filter((p) => p.homeCamp === camp.id).map((p) => p.id);
  }
  // Незавершённые стройки — снова в очередь строителей.
  for (const s of w.all<Structure>('structure')) {
    if (s.building && s.type !== 'townCenter' && s.type !== 'tree' && !(s as Mine).isMine && s.type !== 'dock') w.jobs.add('build', s, 2, 0);
  }
  w.terrain.restore(r.terrain);
  w.update(0);
  return w;
}

export function saveCampaign(c: Campaign, current: World, monarchs: Monarch[]): void {
  const islands: Rec = {};
  for (const [idx, entry] of c.islands) {
    islands[idx] = { leftDay: entry.leftDay, world: snapWorld(entry.world === current ? current : entry.world) };
  }
  islands[current.island.index] = { leftDay: current.time.day, world: snapWorld(current) };
  const data = {
    v: 1,
    campaign: c.serializeMeta(),
    reign: c.reign,
    rulerSeed: c.ruler.key,
    monarchs: monarchs.map((m) => ({ player: m.player, x: m.x, coins: m.coins, gems: m.gems, crown: m.hasCrown, mount: m.mount.id, stamina: m.stamina })),
    islands,
    dog: current.all('npc').some((e) => e instanceof Dog),
  };
  saveJson(KEY, data);
}

export function hasSave(): boolean {
  return !!loadJson(KEY);
}

export function clearSave(): void {
  removeKey(KEY);
}

export function loadCampaign(): { campaign: Campaign; world: World; monarchs: Monarch[] } | null {
  const data = loadJson<Rec>(KEY);
  if (!data || data.v !== 1) return null;
  try {
    const cm = data.campaign;
    const c = new Campaign(cm.seed);
    c.current = cm.current;
    c.reached = cm.reached;
    c.reign = cm.reign;
    c.destroyedPortals = new Set(cm.destroyedPortals);
    c.caves = new Set(cm.caves);
    c.meta = { ...cm.meta, blessings: new Set(cm.meta.blessings), gemUnlocks: new Set(cm.meta.gemUnlocks) };
    c.ruler = randomRuler(Number(String(data.rulerSeed).slice(1)) || cm.seed + 1);
    c.ruler.key = data.rulerSeed;
    let current: World | null = null;
    for (const [idx, entry] of Object.entries<Rec>(data.islands)) {
      const w = restoreWorld(entry.world, c);
      hookWorld(c, w, Number(idx));
      c.islands.set(Number(idx), { world: w, leftDay: entry.leftDay });
      if (Number(idx) === c.current) current = w;
    }
    if (!current) return null;
    const monarchs = (data.monarchs as Rec[]).map((d) => {
      const m = new Monarch(d.player, d.x, d.player === 0 ? c.ruler.look : randomRuler(c.seed + 4242).look);
      m.riderKey = d.player === 0 ? c.ruler.key : 'p2';
      m.coins = d.coins;
      m.gems = d.gems;
      m.hasCrown = d.crown;
      m.setMount(d.mount as MountId);
      m.stamina = d.stamina;
      current!.addNow(m);
      return m;
    });
    for (const dog of current.all<Dog>('npc')) if (dog instanceof Dog) dog.owner = monarchs[0].id;
    return { campaign: c, world: current, monarchs };
  } catch (err) {
    console.error('Не удалось загрузить сохранение', err);
    return null;
  }
}

function hookWorld(c: Campaign, w: World, index: number): void {
  c.hook(w, index);
}
