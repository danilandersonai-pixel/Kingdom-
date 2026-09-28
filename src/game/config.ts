// Все числа баланса в одном месте — по спецификации docs/mechanics.md.
// Расстояния в оригинале заданы в «метрах мира»; у нас 1 м = 13 пикселей
// (монарх на коне ≈ 2,5 м ≈ 33 пикселя).

export const M = 13;
/** Скорости из оригинала (м/с) переводим с небольшим ускорением — так
 * управление ощущается бодрее в браузере; соотношения сохраняются. */
export const MS = M * 1.25;

export const TIME = {
  /** Полные сутки, сек: 165 светлого времени + 75 ночи. */
  day: 240,
  /** Моменты суток (доли от 0 до 1; 0 — рассвет). */
  noon: 82 / 240,
  sunset: 150 / 240,
  night: 165 / 240,
  midnight: 205 / 240,
  seasonDays: 16,
  /** Лежащая монета исчезает через полдня. */
  coinLifetime: 120,
  /** Перезарядка между улучшениями городского центра. */
  tcCooldown: 180,
};

export const PURSE = {
  full: 40,
  overflow: 50,
  /** Самоцвет занимает 3 «монетных места». */
  gemSlots: 3,
  payInterval: 0.2,
  refundDelay: 1.0,
  pickupRange: 7,
  /** Сколько монет подданный берёт «на хранение». */
  depositMax: 2,
};

export const TITHE = {
  range: 3 * M,
  interval: 0.15,
  /** Монарх должен двигаться не быстрее этой доли шага. */
  speedFrac: 0.5,
};

export const PRICES = {
  recruit: 1,
  bow: 2,
  hammer: 3,
  scythe: 4,
  pike: 2,
  shield: 6,
  sword: 12,
  well: 3,
  mill: 8,
  stable: 8,
  mountSwap: 3,
  catapult: 6,
  ballista3: 15,
  ballista4: 18,
  bakery: 15,
  knightTower: 15,
  hornWall4: 12,
  hornWall5: 16,
  hornCall: 1,
  bread: 4,
  chop: 1,
  berries: 1,
  squadAttack: 4,
  stoneMine: 10,
  ironMine: 20,
  bomb: 18,
  bombGo: 5,
  bombLight: 5,
  boatStart: 10,
  boatPart: 2,
  boatLaunch: 2,
  boatBell: 2,
  boatSail: 10,
  lighthouse: 6,
  teleportBuild: 8,
  teleportUse: 2,
  merchantFee: 1,
  merchantGives: 8,
  gemKeeperTake: 1,
  hermitRide: 1,
  citizenHouse: 8,
  citizen: 7,
  coopCrown: 8,
};

/** Городской центр: цена перехода на тир i (индекс = новый тир). */
export const TC_TIERS = [
  { cost: 0, work: 0, tech: 0, name: 'Стоянка' },
  { cost: 3, work: 10, tech: 0, name: 'Костёр' },
  { cost: 6, work: 15, tech: 0, name: 'Лагерь' },
  { cost: 9, work: 20, tech: 0, name: 'Деревня' },
  { cost: 12, work: 30, tech: 0, name: 'Город' },
  { cost: 15, work: 40, tech: 1, name: 'Форт' },
  { cost: 18, work: 50, tech: 1, name: 'Замок' },
  { cost: 20, work: 60, tech: 2, name: 'Железная крепость' },
];

/** Максимальный тир стен и башен при данном тире городского центра. */
export const TC_CAPS = [
  { wall: 0, tower: 0 },
  { wall: 1, tower: 1 },
  { wall: 1, tower: 1 },
  { wall: 2, tower: 2 },
  { wall: 2, tower: 2 },
  { wall: 3, tower: 3 },
  { wall: 4, tower: 4 },
  { wall: 5, tower: 6 },
];

export const WALL_TIERS = [
  { cost: 0, rebuild: 0, work: 0, hp: 0, tech: 0 },
  { cost: 1, rebuild: 1, work: 6, hp: 10, tech: 0 },
  { cost: 3, rebuild: 2, work: 10, hp: 25, tech: 0 },
  { cost: 5, rebuild: 3, work: 16, hp: 60, tech: 1 },
  { cost: 8, rebuild: 5, work: 24, hp: 120, tech: 1 },
  { cost: 12, rebuild: 6, work: 32, hp: 240, tech: 2 },
];

export const TOWER_TIERS = [
  { cost: 0, work: 0, archers: 0, range: 0, tech: 0, height: 0 },
  { cost: 3, work: 6, archers: 1, range: 2, tech: 0, height: 19 },
  { cost: 6, work: 10, archers: 1, range: 4, tech: 0, height: 28 },
  { cost: 9, work: 16, archers: 2, range: 5, tech: 1, height: 36 },
  { cost: 12, work: 22, archers: 3, range: 5, tech: 1, height: 44 },
  { cost: 15, work: 28, archers: 3, range: 8, tech: 2, height: 44 },
  { cost: 18, work: 34, archers: 4, range: 8, tech: 2, height: 50 },
];

export const WORK = {
  tree: 8,
  boatPart: 3,
  well: 8,
  mill: 14,
  stable: 14,
  catapult: 10,
  special: 24,
  lighthouse: 16,
  teleport: 10,
  citizenHouse: 14,
  repairPerSec: 2,
};

export const PEOPLE = {
  walk: 1.2 * MS,
  run: 2.2 * MS,
  campMax: 2,
  archerRange: 12 * M,
  archerInterval: 1.5,
  archerDamage: 1,
  archerAccuracy: 0.6,
  archerCoins: 6,
  farmerCoins: 12,
  squireCoins: 5,
  knightCoins: 11,
  pikemanCoins: 2,
  squadSize: 4,
  maxCommanders: 4,
  squireDamage: 1,
  knightDamage: 2,
  meleeInterval: 1,
  pikeDamage: 1.5,
  pikeReach: 3 * M,
  pikeDurability: 4,
  fishInterval: 25,
  fieldCoins: 6,
  fieldWork: 110,
  berryTime: 10,
  rabbitCoins: 1,
  deerCoins: 3,
  deerHp: 3,
  boarCoins: 29,
};

export const GREED = {
  greedlingSpeed: 2.6 * MS,
  lootSpeed: 3.2 * MS,
  hitInterval: 1,
  wallDamage: 1,
  armoredWallDamage: 2,
  sunDamageEvery: 2,
  floaterHp: 12,
  floaterSpeed: 1.2 * MS,
  floaterAltitude: 6 * M,
  breederHp: 40,
  armoredBreederHp: 80,
  breederSpeed: 0.9 * MS,
  breederHitEvery: 2.5,
  breederArea: 3 * M,
  breederWallDamage: 4,
  breederSummonEvery: 8,
  breederMaxSummons: 6,
  stealerHp: 6,
  stealerSpeed: 4 * MS,
  smallPortalHp: 150,
  dockPortalHp: 250,
  nestHp: 60,
  nestBatch: 7,
  nestEvery: 6,
  defenderEvery: 3,
};

export const SIEGE = {
  catapultDamage: 10,
  catapultRadius: 4 * M,
  catapultReload1: 10,
  catapultReload2: 6,
  catapultMin: 12 * M,
  catapultMax: 35 * M,
  ballistaDamage: 6,
  ballistaPierce: 5,
  ballistaReload: 5,
  ballistaRange: 30 * M,
};

export const ISLANDS = [
  { half: 160, smallPortals: 1, gems: 0, camps: 3, merchant: true, freeParts: 26 },
  { half: 200, smallPortals: 1, gems: 8, camps: 4, merchant: true, freeParts: 20 },
  { half: 240, smallPortals: 2, gems: 9, camps: 5, merchant: false, freeParts: 14 },
  { half: 280, smallPortals: 2, gems: 9, camps: 6, merchant: false, freeParts: 8 },
  { half: 320, smallPortals: 3, gems: 9, camps: 7, merchant: false, freeParts: 0 },
];

export const BOAT_PARTS = 59;

export const DIFFICULTY = {
  peaceful: 0,
  easy: 0.6,
  normal: 1,
  hard: 1.4,
  cursed: 1.8,
};
export type Difficulty = keyof typeof DIFFICULTY;
