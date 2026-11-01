import { Projectile, weaponOf } from '../entities/projectile.js';

/**
 * Trinkets. Each weapon has one trinket slot. Trinkets drop from elite chests,
 * you get each one at most once per dive, and once attached a trinket stays on
 * that weapon for the rest of the dive.
 *
 * Every trinket does something for the weapon it's attached to *and* something
 * for (or with) your other weapons. Not every trinket works on every weapon:
 * `onWeapon` says what it does on each weapon it works on, and any weapon
 * missing from it is listed on the card as "No effect on ...".
 *
 *   name, icon, color
 *   attached   what it does for the weapon it's on (card text)
 *   others     what it does with your other weapons (card text)
 *   onWeapon   { weaponId: text } shown when you choose which weapon gets it
 *   hooks      same events as talents, each (game, payload, holder) where
 *              holder is the weapon the trinket is attached to. Extra events:
 *                weaponFire  a weapon's regular attack (volley, launch, pulse)
 *                shot        one of your projectiles was just spawned
 *   power(holder, game)  optional: called when the holder fires; may return
 *                        { damage, size, color, charged } for that attack
 *   hud(holder)          optional extra HUD line
 *
 * Some effects need the game's projectile code (Undertow Stone, Split Coral):
 * their `shot` hooks mark projectiles and game.js acts on those marks. Weapons that
 * do these two their own way (Riptide Trident, Pistol Shrimp Claw) check `w.trinket`
 * themselves, and their shots carry `selfTrinkets` so the marks skip them.
 */

export const UNDERTOW_RETURN = 0.5; // damage on the way back, compared to the way out
const COIL_CHARGE = 15; // hits from your other weapons per overcharged attack
const PILOT_CUT = 0.15; // seconds taken off the cooldown per attack from another weapon
const SPLIT_CHANCE = 0.2; // Split Coral: share of other weapons' kills that split the shot
const RANGE_BONUS = 1.1; // Undertow Stone: other weapons' shots fly 10% further

export const TRINKETS = {
  conductorCoil: {
    name: 'Conductor Coil',
    icon: 'Cc',
    color: '#ffe066',
    attached: `Hits from your other weapons charge it. At ${COIL_CHARGE} charge, its next attack is overcharged: triple damage at double size.`,
    others: 'Every hit adds 1 charge to the coil.',
    onWeapon: {
      harpoon: 'The next volley flies at triple damage and double size.',
      darts: 'The next volley flies at triple damage and double size.',
      drones: 'The next drone is overcharged for as long as it lasts: triple damage, double size, thicker lasers.',
      sonar: 'The next pulse hits for triple damage and covers twice the area.',
      eel: 'The next zap hits for triple damage and its arcs jump twice as far.',
      ink: 'The next squirt makes a cloud with triple damage that covers twice the area.',
      trident: 'The next attack thrusts for triple damage with double reach.',
      bubbles: 'The next bubbles pop for triple damage and are twice as big.',
      lure: 'The next lure bites for triple damage and pulls from twice as far.',
      shrimp: 'The next snap blasts for triple damage over twice the area.',
      eye: 'The next enemy the eye locks onto burns at triple damage until it dies.',
    },
    hooks: {
      hit(game, { projectile }, holder) {
        if (!worksOn('conductorCoil', holder.id)) return;
        const from = weaponOf(projectile);
        if (!from || from === holder.id) return;
        const st = holder.trinketState;
        st.charge = Math.min(COIL_CHARGE, (st.charge ?? 0) + 1);
      },
    },
    power(holder, game) {
      const st = holder.trinketState;
      if ((st.charge ?? 0) < COIL_CHARGE) return null;
      st.charge = 0;
      const p = game.player;
      game.effects.burst(p.x, p.y, '#ffe066', 10, 170);
      return { damage: 3, size: 2, color: '#ffe066', charged: true };
    },
    hud(holder) {
      if (!worksOn('conductorCoil', holder.id)) return null;
      const charge = holder.trinketState.charge ?? 0;
      return charge >= COIL_CHARGE ? 'Conductor Coil: overcharged' : `Conductor Coil ${charge}/${COIL_CHARGE}`;
    },
  },

  pilotFish: {
    name: 'Pilot Fish',
    icon: 'Pf',
    color: '#7fc8ff',
    attached: 'Your other weapons charge it: it fires sooner every time one of them fires.',
    others: `Each volley, launch or pulse takes ${PILOT_CUT} seconds off the attached weapon's cooldown.`,
    onWeapon: {
      harpoon: `Every attack from your other weapons brings the next volley ${PILOT_CUT} seconds closer.`,
      darts: `Every attack from your other weapons brings the next volley ${PILOT_CUT} seconds closer.`,
      drones: `Every attack from your other weapons brings the next launch ${PILOT_CUT} seconds closer.`,
      sonar: `Every attack from your other weapons brings the next pulse ${PILOT_CUT} seconds closer.`,
      eel: `Every attack from your other weapons brings the next zap ${PILOT_CUT} seconds closer.`,
      ink: `Every attack from your other weapons brings the next squirt ${PILOT_CUT} seconds closer.`,
      trident: `Every attack from your other weapons brings the next attack ${PILOT_CUT} seconds closer.`,
      bubbles: `Every attack from your other weapons brings the next bubbles ${PILOT_CUT} seconds closer.`,
      lure: `Every attack from your other weapons brings the next cast ${PILOT_CUT} seconds closer.`,
      shrimp: `Every attack from your other weapons brings the next snap ${PILOT_CUT} seconds closer.`,
      eye: `Every attack from your other weapons heats the gaze up as if it had stared ${PILOT_CUT} seconds longer.`,
    },
    hooks: {
      weaponFire(game, fired, holder) {
        if (fired === holder || !worksOn('pilotFish', holder.id)) return;
        // Weapons without a cooldown say what "sooner" means for them (the Watching Eye heats up).
        if (holder.def.onPilot) holder.def.onPilot(holder, PILOT_CUT, game);
        else holder.timer -= PILOT_CUT;
      },
    },
  },

  undertowStone: {
    name: 'Undertow Stone',
    icon: 'Us',
    color: '#5a8dd6',
    attached: `Its attacks are pulled back to you once they end, passing through every enemy on the way at ${UNDERTOW_RETURN * 100}% damage.`,
    others: `Their shots fly ${Math.round((RANGE_BONUS - 1) * 100)}% further.`,
    onWeapon: {
      harpoon: `Harpoons are reeled back to you after they stop or run out of range, passing through every enemy on the way at ${UNDERTOW_RETURN * 100}% damage.`,
      darts: `Darts are pulled back to you after they stop or run out of range, passing through every enemy on the way at ${UNDERTOW_RETURN * 100}% damage.`,
      sonar: `Every pulse rolls back inward, hitting again at ${UNDERTOW_RETURN * 100}% damage.`,
      trident: `After its thrusts, the trident sweeps back the other way across the same spots at ${UNDERTOW_RETURN * 100}% damage.`,
      bubbles: `Bubbles drift back to you after they catch an enemy or run out of range, trapping every enemy on the way. Those traps pop for ${UNDERTOW_RETURN * 100}% damage.`,
      shrimp: `Every blast collapses back in a moment later: a second blast at ${UNDERTOW_RETURN * 100}% damage that pulls enemies in.`,
    },
    hooks: {
      shot(game, pr, holder) {
        if (pr.generation !== 0 || !pr.weapon) return;
        if (pr.weapon === holder.id) {
          if (worksOn('undertowStone', holder.id) && !pr.selfTrinkets) pr.undertow = true;
        } else if (pr.kind !== 'pod') {
          // Pods fly exactly to their target, so a longer flight would only make them overshoot.
          pr.life *= RANGE_BONUS;
          pr.maxLife *= RANGE_BONUS;
        }
      },
    },
  },

  splitCoral: {
    name: 'Split Coral',
    icon: 'Sc',
    color: '#ff7f8e',
    attached: 'Shots that fly out of range split into 3 half-damage pieces that seek the nearest enemies.',
    others: `${Math.round(SPLIT_CHANCE * 100)}% of the kills by their shots split the shot into 2 half-damage pieces that seek the nearest enemies.`,
    onWeapon: {
      harpoon: 'Harpoons that fly out of range split into 3 half-damage harpoons that seek the nearest enemies.',
      darts: 'Darts that fly out of range split into 3 half-damage darts that seek the nearest enemies.',
      bubbles: 'Bubbles that fly out of range split into 3 half-damage bubbles that seek the nearest enemies.',
      shrimp: 'Every blast throws out 3 smaller half-damage blasts onto the nearest enemies around it.',
    },
    hooks: {
      shot(game, pr, holder) {
        // Pods land where they're aimed and deploy a drone, so on the Drone Launcher only drone shots split.
        if (pr.kind === 'pod' || pr.generation !== 0 || pr.selfTrinkets) return;
        if (pr.weapon === holder.id && worksOn('splitCoral', holder.id)) pr.splitCoral = true;
      },
      kill(game, { enemy, source }, holder) {
        if (!(source instanceof Projectile) || source.generation !== 0 || source.kind === 'pod') return;
        if (!source.weapon || source.weapon === holder.id) return;
        if (game.rng.chance(SPLIT_CHANCE)) game.splitShot(source, 2, enemy.x, enemy.y, enemy);
      },
    },
  },
};

export const TRINKET_ORDER = Object.keys(TRINKETS);

/** Whether trinket `id` does anything on weapon `weaponId` as the attached weapon. */
export const worksOn = (id, weaponId) => Boolean(TRINKETS[id]?.onWeapon[weaponId]);

/** The trinket on weapon `w` as a hook source for Player.trigger (hooks get the weapon as `holder`). */
export function trinketSource(w) {
  const def = TRINKETS[w.trinket];
  const hooks = {};
  for (const [event, fn] of Object.entries(def.hooks ?? {})) hooks[event] = (game, payload) => fn(game, payload, w);
  return { hooks, rank: 1, trinket: w.trinket };
}
