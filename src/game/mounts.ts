// Скакуны монарха (по спецификации): скорость в м/с, запас галопа в секундах,
// особые способности. Самоцветы открывают скакуна навсегда, монеты — «оседлать».

import type { MountLook } from '../art/horse';
import { HORSE } from '../art/horse';

export type MountId = 'horse' | 'griffin' | 'stag' | 'draft' | 'warhorse' | 'bear' | 'lizard' | 'unicorn';
export type MountAbility = 'none' | 'flap' | 'charm' | 'aura' | 'dash' | 'fire' | 'coins';

export interface MountDef {
  id: MountId;
  name: string;
  look: MountLook;
  /** м/с */
  walk: number;
  run: number;
  /** Секунд галопа на полном запасе. */
  stamina: number;
  /** Множитель восстановления. */
  regen: number;
  forest: number;
  /** Может есть где угодно и зимой (грифон — крыс). */
  eatsAnywhere: boolean;
  /** Заряжается от солнца вместо еды (ящер). */
  solar: boolean;
  ability: MountAbility;
  gems: number;
  coins: number;
  island: number;
  desc: string;
}

export const MOUNTS: Record<MountId, MountDef> = {
  horse: { id: 'horse', name: 'Серый конь', look: HORSE, walk: 2.2, run: 5.0, stamina: 16.7, regen: 1, forest: 1, eatsAnywhere: false, solar: false, ability: 'none', gems: 0, coins: 0, island: 0, desc: 'Средняя скорость и выносливость.' },
  griffin: {
    id: 'griffin',
    name: 'Грифон',
    look: { ...HORSE, body: '#c8a060', mane: '#f0ece0', socks: undefined, blaze: false, saddle: '#2a4a8a', saddleTrim: '#f2d870' },
    walk: 2.4,
    run: 5.5,
    stamina: 20,
    regen: 1,
    forest: 1.18,
    eatsAnywhere: true,
    solar: false,
    ability: 'flap',
    gems: 2,
    coins: 8,
    island: 1,
    desc: 'Взмахом крыльев отбрасывает гридлингов.',
  },
  stag: {
    id: 'stag',
    name: 'Олень',
    look: { ...HORSE, body: '#9a6a42', mane: '#5a3a22', socks: undefined, blaze: false, antlers: '#e0d0b0', saddle: '#3a6a3a', saddleTrim: '#d0c080' },
    walk: 1.75,
    run: 3.95,
    stamina: 17,
    regen: 1,
    forest: 1.18,
    eatsAnywhere: false,
    solar: false,
    ability: 'charm',
    gems: 1,
    coins: 3,
    island: 2,
    desc: 'Очаровывает оленей — они идут за ним к охотникам.',
  },
  draft: {
    id: 'draft',
    name: 'Тяжеловоз',
    look: { ...HORSE, body: '#6a5a4a', mane: '#e8e0d0', socks: '#e8e0d0', blaze: true, saddle: '#5a3a2a', saddleTrim: '#c8a040', scale: 1.08 },
    walk: 2.2,
    run: 4.6,
    stamina: 30,
    regen: 1,
    forest: 1,
    eatsAnywhere: false,
    solar: false,
    ability: 'none',
    gems: 1,
    coins: 3,
    island: 3,
    desc: 'Лучшая выносливость.',
  },
  warhorse: {
    id: 'warhorse',
    name: 'Боевой конь',
    look: { ...HORSE, body: '#4a4450', mane: '#1a1618', socks: undefined, blaze: false, barding: '#8a2a2a', saddle: '#6a2020', saddleTrim: '#d0a030' },
    walk: 2.0,
    run: 5.0,
    stamina: 10,
    regen: 1,
    forest: 1,
    eatsAnywhere: false,
    solar: false,
    ability: 'aura',
    gems: 2,
    coins: 8,
    island: 3,
    desc: 'Галоп дарит подданным защитную ауру.',
  },
  bear: {
    id: 'bear',
    name: 'Медведь',
    look: { ...HORSE, body: '#5a3e2a', mane: '#3a281a', socks: undefined, blaze: false, saddle: '#6a4a8a', saddleTrim: '#d0a030', scale: 1.12 },
    walk: 2.5,
    run: 5.0,
    stamina: 8,
    regen: 2,
    forest: 1.3,
    eatsAnywhere: false,
    solar: false,
    ability: 'dash',
    gems: 3,
    coins: 10,
    island: 4,
    desc: 'Рывком бьёт Жадность и дичь.',
  },
  lizard: {
    id: 'lizard',
    name: 'Ящер',
    look: { ...HORSE, body: '#4a7a4a', mane: '#2a4a2a', socks: undefined, blaze: false, saddle: '#8a5a2a', saddleTrim: '#d0a030', scale: 1.1 },
    walk: 2.4,
    run: 5.2,
    stamina: 9,
    regen: 1,
    forest: 1,
    eatsAnywhere: false,
    solar: true,
    ability: 'fire',
    gems: 3,
    coins: 10,
    island: 4,
    desc: 'Поджигает землю перед собой.',
  },
  unicorn: {
    id: 'unicorn',
    name: 'Единорог',
    look: { ...HORSE, body: '#e8e4f0', mane: '#b08ad8', socks: undefined, blaze: false, horn: '#f2d870', saddle: '#4a4a9a', saddleTrim: '#f2d870' },
    walk: 2.2,
    run: 5.0,
    stamina: 15,
    regen: 1,
    forest: 1,
    eatsAnywhere: false,
    solar: false,
    ability: 'coins',
    gems: 4,
    coins: 12,
    island: 5,
    desc: 'Пасясь, роняет монеты.',
  },
};
