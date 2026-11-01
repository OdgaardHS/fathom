import { CHARACTER_TALENTS } from './talents.js';

/**
 * The expedition crew. A character is a unique passive (or stat) plus a few
 * character talents. Weapons are picked separately before each dive, so any
 * character can use any weapon you've unlocked.
 *
 *   name, role, blurb, statsText   shown on the character select screen
 *   accent, palette                UI color, and the diver sprite's colors and `gear`
 *                                  (their kit, see drawDiver in render/sprites.js)
 *   stats(b)                       base stat changes, in the same buckets passives use
 *   trait                          the passive: { name, text, tags?, apply?, derive?, hooks? }
 *                                  (`tags` like a passive's: shows which weapons it affects)
 *   talents                        this character's share of the talent pool (data/talents.js)
 */
export const HEROES = {
  mara: {
    name: 'Mara Quell',
    role: 'Salvage Diver',
    blurb: 'Turns every pearl into progress.',
    statsText: '100 health · average speed',
    accent: '#f0b35a',
    palette: { suit: '#c9893a', helmet: '#d4a94f', trim: '#6e4f1a', fins: '#3b2a18', gear: 'salvager' },
    stats() {},
    trait: {
      name: 'Salvager',
      text: '+15% pearl value and +20% pickup range',
      tags: ['growth', 'magnet'],
      apply(b) {
        b.growth += 0.15;
        b.magnet += 0.2;
      },
    },
    talents: CHARACTER_TALENTS.mara,
  },

  otto: {
    name: 'Otto Brask',
    role: 'ROV Pilot',
    blurb: 'Keeps machines running longer than they should.',
    statsText: '90 health · average speed',
    accent: '#7ff9ff',
    palette: { suit: '#2f5f7f', helmet: '#f2a541', trim: '#7a4a12', fins: '#1f3b4d', gear: 'pilot' },
    stats(b) {
      b.maxHp -= 10;
    },
    trait: {
      name: 'Field Engineer',
      text: '+20% duration',
      tags: ['duration'],
      apply(b) {
        b.duration += 0.2;
      },
    },
    talents: CHARACTER_TALENTS.otto,
  },
};

/** Order on the character select screen. */
export const HERO_ORDER = ['mara', 'otto'];
