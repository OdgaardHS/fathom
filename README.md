# Fathom (working title)

A deep-sea roguelike/survivor in plain JavaScript and HTML5 Canvas. No build step, no dependencies.

An expedition dives toward something ancient waking at the bottom of the sea. Each depth is its own
level: survive until its boss surfaces, kill it, and the next depth unlocks. The old god stays
mostly offstage, hinted at more strongly the deeper you go.

## Play it online

**https://odgaardhs.github.io/fathom/**

The site is served by GitHub Pages straight from the `main` branch, so every push to `main`
updates it within a minute or two. It needs no build step: every path in the game is relative,
and `.nojekyll` tells GitHub to serve the files exactly as they are.

## Run it locally

Double-click **`serve.bat`**, or run:

```
python serve.py
```

That opens http://127.0.0.1:8000. The code uses JavaScript modules, which browsers won't load
straight from a file on disk, so it needs this tiny local server. Any static server works too
(e.g. VS Code's Live Server). Caching is off, so a browser refresh always loads your latest code.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrow keys | Swim (weapons fire on their own) |
| Number keys or click | Pick an upgrade or trinket |
| Click | On the loadout: a porthole to swap diver or weapon, a talent to learn it |
| Right-click | On the loadout: take a point back from a talent |
| Drag | On the trinket screen, drag a trinket onto one of your weapons (or press its number, then the weapon's; Esc puts it back) |
| R | Spit out both level-up cards and draw new ones (the Hollow Diver's *Spit It Out*) |
| L | Open the loadout from the game-over or cleared screen |
| Esc / P | Pause (the pause screen also has Music and Sounds on/off buttons) |
| M | Mute or unmute all sound |
| Enter | On the loadout: go on to the depths. On the depth screen: dive into the deepest open one |
| R or Enter | Dive again after dying |
| F3 or \` | Toggle debug overlay |

## What's in it

- **Depth map**: seven depths from Sunlit Shallows (0–200 m) down to something below the sea floor.
  Clearing a depth's boss unlocks the next. Progress is saved in the browser.
- **Enemies come in waves**: most arrive in packs, a school of one kind swimming in from one side
  every 5 to 8 seconds, with the rest trickling in between, and there are plenty from the first
  seconds. They're tough enough that most weapons don't kill them in one hit: every enemy but a
  depth's final boss has 1.8 times its listed health, and everything gets 20% tougher per minute.
  The knobs are `CONFIG.enemies` in `src/config.js` (`hpBase`, `hpScalePerMinute`, `packShare`,
  `packEvery`) and each depth's `timeline` in `src/data/levels.js`.
- **Sunlit Shallows** (depth 1) is built: a pale sandy seabed with ripples, coral, rocks, seaweed,
  sunlight rippling over the sand, sun rays and drifting particles. Enemies: snappers, reef crabs,
  jellyfish, pufferfish (fire a ring of spines), barracuda (telegraphed lunges). Elites: a pufferfish
  (2:10) and a reef crab (3:20). Boss: **the Bleached
  Matriarch**, who slams the ground (telegraphed circles) and calls her brood. Teases: rocks with a
  carved spiral, fish circling in unnaturally perfect loops, the same spiral on the Matriarch's shell,
  and a heartbeat from far below when she dies.
- **The Open Blue** (depth 3) is built: open water with no seabed. Depth comes from layers that scroll
  slower the further down they are (huge faint fish, schools, drifting specks), and a **current** that
  carries you and loose pearls, swinging direction over time. Enemies: mackerel schools, moon jellies,
  glass squid (keep their distance and spit ink), sailfish (lunge with their sail raised), blue
  sharks (circle you, then strike). Elites: a glass squid (2:10) and a blue shark (3:40).
  Boss: **The Omen**, a giant oarfish whose whole long body hurts
  to touch; it lunges and calls in mackerel. Tease: something enormous passes far beneath you, and on
  its second, closer pass an eye opens and looks up.
- Depth 2 (Kelp Twilight) isn't built yet, so in normal play you can't reach The Open Blue. Use
  debug mode (below) to try it.
- **Mix and match a diver and a weapon.** Before each dive, the **loadout** shows the diver and
  the starting weapon side by side, each with its talent tree: click a porthole above a column to
  swap, learn talents right there, then *Choose depth*. Any character can use any weapon.
  - **Characters** each have one passive and a talent tree of their own:
    - **Otto Brask, ROV Pilot**: *Field Engineer*, +20% duration. 90 health. Visor helmet,
      radio antenna, a drone docked on his back and a controller in his hands.
    - **Captain Isolde Crane, Expedition Commander**: *First Mate*, a crewmate dives at her side
      and fires weaker copies of all your weapons (35% damage). Navy coat with gold epaulettes, a
      peaked helmet with an anchor badge, a radio handset on a coiled cord. The crewmate is a
      smaller diver in white with an orange helmet and a red knit cap.
    - **Old Jory, Shantyman**: *Shanty*, he's always singing, and each song helps while he sings
      it: *Haul Away* (swim 20% faster), *Blow the Man Down* (weapons recharge 20% faster) and
      *Leave Her, Johnny* (heal 2 health a second). He moves on to the next song every 12 seconds;
      the HUD shows which one. Yellow oilskins, a brass helmet, a red beard, a knit cap and a
      squeezebox; notes drift up while he sings.
    - **Coralline, Reef-grown** (the tank): *Coral Armor*, coral plates cover her, and each one
      blocks a hit completely, then breaks off and regrows after 8 seconds (3 to start). 160 health,
      swims 15% slower. A helmet half grown over with coral, a starfish on top, anemones trailing
      behind; her plates circle her as coral nubs.
    - **The Hollow Diver, Nobody inside** (secret): *Hollow*, level-ups show 2 cards instead of 3,
      but the card you take is 25% stronger. A passive gives 25% more (Vitality: +25 max health a
      level), an augment 25% more (+5% damage becomes +6.25%; an exotic's +1 rounds, so only a card
      worth 1.5 or more makes it +2), and a weapon level-up improves its weapon 25% more (+4 damage
      becomes +5; counts and pierce round to the nearest whole number). An old copper suit gone green, with no air tank, empty
      gloves on loose cuffs, and a helmet whose front window is missing: inside there's only a
      deep-blue dark with specks drifting in it. Dark wisps leak from it instead of bubbles.
      **To unlock it**, clear a depth while carrying only one weapon the whole dive. Until then the
      loadout shows a dark silhouette behind a barred porthole, with no name and no hint, and its
      talent tree is hidden (debug mode shows it). It's saved in `progress.secrets`.
  - **13 weapons**, each with its own talent tree (see [Weapons](#weapons) below). More weapons can be
    picked up on level-up cards during a dive, up to 4.
  - Every weapon but one can be picked at the start for now. **The Watching Eye is found deeper
    down**: level-ups only offer it from The Open Blue on, and once you've taken it on a dive it
    unlocks as a starting weapon (saved in `progress.unlockedWeapons`). `CONFIG.unlockAllWeapons` in
    `src/config.js` switches the rest to the same rule; `foundFrom` on a weapon sets where it's found.
- **Talent trees** (progression between dives, see [Talent trees](#talent-trees)): every diver and
  every weapon has a tree. Level-ups during a dive are all upgrade cards now; the talents are what
  you build up from dive to dive.
- **Trinkets**: elite enemies drop a chest that glows blue. Besides its upgrade, it offers a choice
  of trinkets, shown above your weapon slots: drag the one you want onto a weapon. Hovering a weapon
  while you drag says what the trinket will do there. Each weapon holds one trinket, which stays on it
  for the rest of the dive, and you find each trinket at most once per dive (two elites per depth,
  so up to two trinkets). Every trinket does something for the weapon it's on **and** something with
  your other weapons (see below).
- **Weapon bar** (bottom centre, like a spell bar): a row of numbered weapon slots with each
  weapon's level, a small gem with how many augments it has (in the color of its rarest one), the
  socket for its trinket right underneath each one, and your passives in a small block to the right
  (in a row above on narrow screens). While a weapon recharges, a dark
  wedge sweeps around its slot like a spell cooldown. Weapon notes (drones out, Conductor Coil
  charge, the Watching Eye's heat) sit just above the bar; a boss's health bar shows at the top,
  under the timer.
- **Weapon augments** make one weapon better, never all of them. Their level-up card names the
  weapon ("Might · on your Harpoon: +5% damage"), and a weapon can take any number of them. They
  come in rarities: **common** (+5% to one stat), **uncommon** (+10%), **rare** (+8% to two stats,
  with a blue edge) and **exotic** (purple: *Plus One*, one more of whatever the weapon makes more
  of, like one more harpoon per volley or one more jump for the Eel Lance's arcs; Sonar Pulse, which
  has nothing to count, gets +12% to all its stats instead). An augment only boosts stats its weapon
  uses. They're defined in `src/data/augments.js`.
- **6 passives** for the diver themselves: Vitality, Swiftness, Armor, Recovery, Attractor and
  Insight, up to 4 at once, offered on level-up cards next to weapons and augments. Pearls are XP.

## Weapons

| Weapon | How it attacks | Stats it uses |
| --- | --- | --- |
| **Harpoon** | Harpoons at the nearest enemy. Steady, long range | damage, haste, size, duration, amount |
| **Drone Launcher** | Flings one pod per launch into the water around you; it deploys a drone that holds that spot and fires instant lasers at whatever comes in range. No limit on how many are out | all six (amount: every laser also hits one more enemy) |
| **Needle Darts** | Fast piercing darts the way you swim, snapping onto enemies ahead; stop swimming to auto-aim | damage, haste, size, duration, amount |
| **Razor Starfish** | Starfish orbit you and cut what they touch | damage, size, amount, attack speed |
| **Sonar Pulse** | Pulses that hurt everything close to you | damage, haste, size |
| **Eel Lance** | Zaps the nearest enemy; the shock arcs on to 2 more nearby, 15% weaker each jump | damage, haste, size (arc reach), amount (+1 jump) |
| **Ink Sac** | Squirts ink clouds behind you that hurt and slow anything inside | damage, haste, size, duration (cloud life), amount (+1 cloud) |
| **Riptide Trident** | Sweeps three quick thrusts across the biggest crowd near you. Hardest hits, shortest reach | damage, haste, size (reach), amount (+1 thrust) |
| **Bubble Net** | Big slow bubbles trap what they catch for 2 seconds, then pop. Trapped enemies can't hurt you; bosses and elites are only slowed | damage, haste, size, duration (trap time), amount |
| **Anglerfish Lure** | Casts a glowing lure near the biggest crowd that draws enemies in, then huge jaws bite | damage, haste, size (pull and bite), duration (glow time), amount (+1 lure) |
| **Pistol Shrimp Claw** | A slow, loud snap: a cavitation bubble that bursts where it stops, blasting everything back | damage, haste, size (blast), duration (range), amount |
| **Siphonophore Tendrils** | Stinging tendrils trail behind you along the path you swim. No cooldown | damage, duration (length), attack speed (sting rate), size, amount (+1 tendril) |
| **The Watching Eye** | Stares at the toughest enemy near you; the gaze burns hotter the longer it holds, up to 6× damage. Full heat takes 5 seconds, 2 seconds at +50% haste. Starts over on a new target | damage, haste (heat-up speed), size (sight), amount (+1 eye) |

The close-range weapons (Razor Starfish, Sonar Pulse, Riptide Trident, Ink Sac, Siphonophore
Tendrils) want you to let enemies come near. Ink and tendrils are left behind you, so they work
best when you swim loops around a crowd rather than straight away from it.

## Sound and music

Everything you hear is generated in the browser with the Web Audio API, so there are no sound
files. Sound starts on your first click or key press, since browsers block audio before that.

- **Sound effects** for every weapon (Harpoon whoosh and twang, Needle Darts puffs, Drone Launcher
  thunk plus a chirp when each drone deploys and laser zaps when they fire, a sonar ping, the Razor
  Starfish's slices, the Eel Lance's crackle, a wet squirt of ink, trident swishes, bubble bloops
  and pops, the lure's glassy shimmer and the jaws' crunch, the shrimp claw's crack and its boom,
  tendril prickles, and the Watching Eye's uneasy chord and a sizzle that climbs as it heats up),
  enemy hits (lower for bigger creatures) and deaths (a bubble pop), elites and
  bosses (a low horn when they arrive, a deep boom when they die), enemy shots, the Matriarch's
  slams, your own hits and death, pearls (they climb a scale when you scoop up several in a row),
  chests, level-ups, talents, trinkets, Conductor Coil overcharges, warnings before rings and
  swarms, the omens' whale-like moans and the heartbeat when a depth is cleared.
- **Ambient music** that never loops exactly: slow pad chords, a low drone, sparse bell notes and a
  rumbling sea bed. The menus have the calmest version; Sunlit Shallows is warm and bright; The
  Open Blue is darker, in a minor key, with distant whale calls. While a final boss is up, a slow
  heartbeat pulse joins in and the chords move faster. The music drops out for the heartbeat when
  you clear a depth.
- The music is muffled while paused or picking upgrades, and everything goes quiet when the tab
  is hidden. When lots of things happen at once, each sound has a short cooldown and there's a cap
  on how many play together, so big fights don't turn into noise.

## Talent trees

Between dives you grow stronger through talent trees, shaped like a modern WoW spec tree. They live
on the **loadout**, the screen between the title and the depths: the diver's tree and the equipped
weapon's tree side by side (the diver's on the left), each with its level and points. Pointing at a
talent, a porthole or a name shows what it does on a bronze plaque beside it. To work on another weapon's tree, equip it. A small amber lamp
on a porthole says that diver or weapon has points waiting. The game-over and cleared screens have
a **Loadout** button (or press **L**) that says how many points are waiting in all.

- **Points**: your diver levels up from every pearl you collect in a dive, and each weapon from the
  pearls you collect while carrying it. The XP is banked when the dive ends, whether you die, clear
  the depth or abandon it, and the game-over and cleared screens say what levelled up. Each level is
  one talent point for that tree. The first diver level comes after even a short dive, the full
  diver tree takes about eight cleared depths, and a weapon earns about one point per dive you carry
  it through. The curves are `CONFIG.progression` in `src/config.js`.
- **Shape**: talents sit on a grid with lines between them. You can learn a talent once you have a
  point in one that leads into it. Dashed gates open the lower rows once enough points are spent in
  the rows above. Some talents have several ranks (0/2). **Choice nodes** hold two (or three)
  talents side by side: you take one and can swap freely. Capstones sit at the bottom.
- **Budget**: a tree holds more than its points can buy (a diver's 12 points against 14 to 17 ranks), so
  you pick a path. Small weapon trees have 3 to 6 points.
- **Respec is free**: right-click a talent to take a point back (as long as nothing below depends
  on it), or reset the whole tree.
- **In a dive**, everything you've learned is active from the start. A weapon's talents switch on
  when you pick that weapon up.
- **Debug mode** (F3) adds a "+1 level" button to each tree on the loadout, for testing.

**Otto's tree** leans into machines: *Scrap Recycler*, *Spotter Uplink*, *Auto-Loader* (every few
attacks reload at once), *Emergency Venting*, *Signal Boost* (marks jump on when their enemy dies),
*Field Repairs*, *Laser Sweep* (his docked drone fires on the nearest enemies), *Tow Cable*, a choice
of *Calibration* or *Sensor Buoy*, *Cascade*, *Failsafe*, *Uplink Relay* (hits on marked enemies
reload that weapon), and a capstone choice of *Overclock* or *Jury-Rig*.

**The Captain's tree** has three directions. *Crew*: *Veteran Crew* (stronger copies), *Covering
Fire*, *Field Medic*, a choice of *Specialist* (the crewmate stops copying and instead wields the
weapon in an extra weapon slot at full strength; that slot is framed in gold) or *Second Mate* (a
second copying crewmate), and *Lifeline*. *Supply*: *Supply Drop* (a crate with an upgrade every 45
seconds), *Ammo Crate*, *Quartermaster*. *The ship's guns*: *Depth Charges* on the biggest crowd
(a marker shows where they'll land), *Spotter Rounds*, *Bracketing Fire*, *Torpedo Run*. Capstone
choice: *Broadside* or *All Hands on Deck*.

**Jory's tree**: new songs (*Drunken Sailor* +20% damage, *Wellerman* pearls, *South Australia*
attack speed, *Spanish Ladies* slows enemies around you), how songs build and end (*Encore* longer
verses, *Crescendo*, a choice of *Finale* (a blast at the end of every song) or *Harmony* (the last
song lingers), *Call and Response* reloads everything on each new song), and grog and mischief
(*Grog Ration*, *Liquid Courage*, *Rum Barrel*, *Sea Legs*). Capstone choice: *Sea Choir* (two songs
at once) or *Ghost Ship Chorus* (every song at once, now and then).

**Coralline's tree**: regrowth (*Thick Coral*, *Rapid Growth*, *Symbiosis*, *Living Stone*,
*Overgrowth*), thorns (*Barbed Polyps*, *Fire Coral*, *Stinging Bloom*, *Petrify*) and the reef
(*Reef Seed* grows coral outcrops that enemies have to swim around, a choice of *Brain Coral* or
*Atoll*, *Reef Keeper*). Capstone choice: *Great Barrier* (a ring of coral holds the horde back) or
*Coral Colossus* (when her last plate breaks, she can't be hurt for a while and crushes what she
touches).

**The Hollow Diver's tree** changes how it chooses. *The choice itself*: *Spit It Out* (redraw both
cards, 3 or 5 times a dive), *Gorge* (every 5th level-up you take both), *Aftertaste* (the card you
pass up comes back next time, 50% stronger), a choice of *One Path* (1 card, 75% stronger) or
*Devour* (the card you pass up heals 10), and *Last Meal* (once a dive it eats its next level-up
instead of dying). *What it carries*: *Hollow Out* (eat a weapon on the level-up screen: its slot
frees up, its talents stay, and so does its trinket's effect on your other weapons; it never comes
back), *Pour Out* (drop a passive and share what it was worth among the others), *Empty Suit* (each
empty passive slot makes cards 10% stronger), *Overflow* (maxed passives keep offering cards, which
pour into your weakest passive). *Chests and trinkets*: *Gilded Hunger* (every chest holds one more
upgrade), *Twin Sockets* (two trinkets per weapon, but 2 trinket choices instead of 3), *Inner
Shrine* (a socket in the suit: its trinket works on every weapon as if attached to each, without its
effect on your other weapons). Capstone choice: *Nothing Wasted* (take both cards every level-up,
the second at normal strength) or *Bottomless* (every card is 3% stronger than the one before).
Each card shows how much stronger it is, and the HUD shows the current bonus.

**Weapon trees** hold each weapon's own talents. The old build-defining talents became capstone
choices, e.g. the Drone Launcher's *Mothership*, *Hive* or *Kamikaze*, and Needle Darts' *Needle
Cyclone* or *Sniper*.

## Shared stats and talents

Every hero uses the same stats, and a stat always means the same thing for everyone:

| Stat | What it does | Raised by |
| --- | --- | --- |
| might | damage | Might augments (one weapon each) |
| haste | weapons and drone launches recharge faster; the Watching Eye heats up faster | Haste augments |
| duration | effects, clouds, traps and drones last longer, shots travel further, tendrils grow longer | Persistence augments |
| attack speed | drones, orbiting weapons and tendrils attack faster | Overdrive augments |
| area | size of weapons, shots, blasts, clouds and reach | Reach augments |
| amount | extra projectiles, orbiters, clouds, lures, thrusts, tendrils, eyes and arc jumps; drone lasers hit one more enemy | the exotic *Plus One* augment |
| growth | pearl (XP) value | Insight, Jory's *Wellerman* |
| magnet, speed, armor, regen, max health | as named | Attractor, Swiftness, Armor, Recovery, Vitality |

Bonuses to the same stat **add**; different stats **multiply**. Haste turns into cooldowns as
`1 / (1 + haste)`, so it never reaches zero. A weapon's augments add to the same stats, but only
while that weapon (or its drones) is working: `Weapon.withBoost` in `src/entities/weapon.js` shows
`player.stats` with them on top for the length of its turn.

**Talents never add stats or change what a stat means.** Each one changes how a skill works or
scales, so the stats you're already collecting pay off in a new way, often a step or two removed.
Character talents tend to touch every weapon you carry; weapon talents change that one weapon.
For example:

- *Recycled Cores* (Drone Launcher): drones that run out of charge make your next launch come
  sooner. Shorter duration → drones return more often → more launches → more drones out.
- *Linked Fire* (Drone Launcher): drones only shoot in bursts when you launch. Haste now decides
  how often drones fire, and attack speed stops mattering for them.
- *Reeling Line* (Harpoon): every harpoon that hits brings the next volley closer. Extra harpoons
  → more hits → faster volleys → more hits.
- *Scrap Recycler* (Otto): every kill brings all your weapons a little closer to firing, so
  anything that kills more (area, amount) also makes every weapon fire faster.
- *Call and Response* (Jory): every new song reloads all your weapons, so *Encore* (longer songs)
  quietly becomes a trade between longer buffs and fewer free reloads.

Each talent shows "Plays off" in its tree with the stats it makes matter.

## Trinkets

| Trinket | On its weapon | With your other weapons | No effect on |
| --- | --- | --- | --- |
| **Conductor Coil** | Charged by your other weapons' hits; at 15 charge its next attack is overcharged: triple damage at double size (Sonar, Ink Sac, Pistol Shrimp: double area; Drone Launcher: that drone stays overcharged for as long as it lasts; Watching Eye: the next target burns at triple damage until it dies) | Every hit adds 1 charge | Razor Starfish, Siphonophore Tendrils |
| **Pilot Fish** | Fires sooner each time another weapon fires (the Watching Eye heats up instead) | Each attack takes 0.15 s off its cooldown | Razor Starfish, Siphonophore Tendrils |
| **Undertow Stone** | Shots are pulled back to you once they stop or run out of range, passing through every enemy on the way at 50% damage. Sonar: each pulse rolls back inward. Trident: it sweeps back the other way. Bubble Net: bubbles drift back, trapping on the way. Pistol Shrimp: each blast collapses back in, pulling enemies in. All at 50% | Shots fly 10% further | Drone Launcher, Razor Starfish, Eel Lance, Ink Sac, Anglerfish Lure, Siphonophore Tendrils, The Watching Eye |
| **Split Coral** | Shots that fly out of range split into 3 half-damage pieces that seek the nearest enemies. Pistol Shrimp: every blast throws 3 smaller half-damage blasts onto the nearest enemies | 20% of kills by their shots split the shot into 2 seeking pieces | everything but the Harpoon, Needle Darts, Bubble Net and Pistol Shrimp Claw |

Not every trinket works on every weapon. The trinket card lists the weapons you carry that it does
nothing for. While you drag one (or after picking it with its number key), each free weapon slot
glows where it works and is marked "No effect" where it doesn't, and hovering a slot says exactly
what it will do there. Its effect on your other weapons works wherever you put it.

The Hollow Diver can change this: with *Twin Sockets* each weapon holds two trinkets (two small
sockets under each weapon on the bar), and with *Inner Shrine* the suit has a socket of its own (on
the trinket screen it's the last slot; on the bar it sits to the left, marked "Suit"). Code that
asks whether a weapon holds a trinket uses `hasTrinket(w, id)` and `mountsOf(w)` in
`src/data/trinkets.js`, which cover all three sockets.

What counts as "firing" (Pilot Fish, Conductor Coil): a weapon's regular attack, i.e. a Harpoon or
Needle Darts volley, a Drone Launcher launch, a Sonar pulse, a zap, a squirt, a trident attack, a
volley of bubbles, a cast, a snap, or the Watching Eye locking onto a new target. The drones' own
shots and extra shots from talents (Ring Volley, Echo, Riposte and so on) don't count. Razor
Starfish and Siphonophore Tendrils never fire.

Some combos to look for: Split Coral and Splitting Barbs on the Harpoon (Barbs splits a harpoon that
stops in an enemy, Coral one that flies out of range), Pilot Fish on a slow weapon fed by Needle
Darts, Conductor Coil on Sonar Pulse next to weapons that hit a lot, the Anglerfish Lure herding a
crowd into Sonar Pulse or the Pistol Shrimp's blasts, Bubble Net's *Soft Target* or the Watching
Eye's *Evil Eye* setting up a hard-hitting second weapon.

## Debug tools

- **F3** (or add `?debug` to the URL) shows FPS, entity counts, spawn rate and seed, and enables cheats:
  **L** level up, **K** kill every enemy (killing the boss clears the depth), **T** skip 30 seconds,
  **C** open a trinket chest, **G** god mode. While debug mode is on, every built depth is open on
  the depth map.
- **`?seed=1234`** in the URL replays the same dive: same spawns, drops and upgrade offers (as long
  as you make the same choices).
- **`window.game`** in the browser console gives you the live game object, e.g. `game.player.hp = 999`.
- To reset saved progress (depths, diver and weapon levels, talents), run
  `localStorage.removeItem('fathom:progress')` in the console
  (`fathom:hero` and `fathom:weapon` remember your last picks, `fathom:audio` your sound settings).

## How it's put together

```
index.html            canvas + HTML menus (title, loadout, depths, level-up, pause, game over, cleared)
style.css             menu styling, like an old diving helmet drawn a little exaggerated: matte,
                      hand-hammered copper plates in studded brass bands, brass portholes and
                      nameplates, dark outlines, rust at the bottom screws, kelp caught on some
                      plates. Text sits on dark bronze plaques screwed onto the copper (`.plaque`,
                      and `.tag-plaque` for single labels), like the ones on statues. Fonts come
                      from Google Fonts (Alfa Slab One, Barlow, Barlow Condensed); offline it falls
                      back to system fonts.
serve.py / serve.bat  local dev server
src/
  main.js             boots everything and starts the loop
  config.js           tuning knobs: player stats, XP curve, enemy cap, drop rates
  game.js             a dive: state machine, tick order, spawning/killing, draw order, progress
  audio/
    audio.js          the audio engine and every sound effect recipe (SOUNDS)
    music.js          the generated ambient music, one theme per depth plus the menus
  core/               engine pieces with no game rules in them
    loop.js           fixed 60 Hz simulation + smooth interpolated rendering
    input.js          keyboard state
    camera.js         follow, zoom-to-fit, screen shake
    spatialGrid.js    fast "enemies near this point" lookups
    math.js           helpers + seeded random number generator
    canvas.js         high-DPI canvas sizing
    storage.js        saved progress in localStorage
  data/               CONTENT — most new stuff goes here
    levels.js         the depths: spawn timeline, scripted events, boss, theme
    heroes.js         the crew: base stats and their one passive
    talents.js        every talent: character talents and weapon talents
    trees.js          how they're laid out in each diver's and weapon's talent tree
    enemies.js        enemy stats, behaviour and sprite names, colors
    weapons.js        the weapon list; the five original weapons' stats per level + behaviour
    weapons/          one file per newer weapon (eel, ink, trident, bubbles, lure, shrimp,
                      tendrils, eye), plus common.js with helpers they share
    trinkets.js       trinkets: what each does on its weapon and with your other weapons
    passives.js       the diver's own stats (health, speed, armor, regen, pickup range, pearl value)
    augments.js       weapon augments: one weapon each, any number, common to exotic
  entities/           player (stats, talent and trinket hooks), drone, enemy, enemy behaviours,
                      projectile, hazard, pickup, weapon (incl. its trinket slot)
  systems/            spawner, upgrade rolls, progression (levels, talent points, trees),
                      particles/bubbles & damage numbers
  render/
    sprites.js        drawing code for every creature, the drones and the divers (with their gear)
    icons.js          a small picture for every weapon, passive and trinket (HUD, cards, menus)
    themes/           one file per depth's look (shallows.js, openblue.js): floor or
                      depth layers, light, overlay, omens
    omens.js          old-god effects any depth can use (the heartbeat)
    debug.js          debug overlay
  ui/                 canvas HUD (hud.js), HTML menus (menus.js), and metal.js, which draws the
                      hammered metal surface, porthole rings, studs, rusty corner screws and kelp
                      at startup (its FINISH sets shine, dent depth and size, patina and grain);
                      the menus get them as CSS variables, the HUD draws them directly
```

Each simulation tick (in `Game.tick`): rebuild the spatial grid → player moves and weapons fire →
spawner adds enemies → enemies move, push apart and touch the player → projectiles, enemy shots and
hazards resolve → pickups fly in → dead things are removed → a level-up menu opens if one is pending.

Two rules keep things predictable:

1. **Gameplay randomness uses `game.rng`** (seeded); purely visual randomness can use `Math.random`.
2. **Entities keep `x/y` (now), `px/py` (last tick) and `rx/ry` (render position).** Draw with `rx/ry`.

## Adding content

**A depth:** fill in its entry in `src/data/levels.js` with a `theme`, `timeline` and `events`
(one event with `final: true` is the boss that clears it), and optionally a `current`. It becomes
playable as soon as it has a timeline. Add its look as a new file in `src/render/themes/` and
register it in `themes/index.js`. A theme without a seabed sets `shadows: false`. Give it music by
adding an entry with the same id as its `theme` to `MUSIC_THEMES` in `src/audio/music.js` (root
note, chords, tempo, brightness, bells, drone, sea); a depth without one plays no music.

**A sound effect:** add a recipe to `SOUNDS` in `src/audio/audio.js` (built from `tone` and `noise`
calls), then call `game.audio.play('name')` where it should happen.

**An enemy:** add an entry to `src/data/enemies.js`, pick a `behavior` (or write a new one in
`src/entities/behaviors.js`) and a `sprite` (or draw a new one in `src/render/sprites.js`), then put
its id in a level's `pool`. Enemies can fire shots (`game.spawnEnemyShot`) and place telegraphed
area attacks (`game.spawnHazard`), as the pufferfish, glass squid and the Matriarch do. The Omen's
`serpent` behavior shows how to give an enemy a long body that follows its head.

**A weapon:** add a file to `src/data/weapons/` (the newer weapons there are good examples) and
list it in `WEAPONS` in `src/data/weapons.js`. Give it `levels` (stats per level),
an `update(w, dt, game)` that counts down `w.timer` and fires, and optionally `draw` (and
`drawUnder` for a layer below the enemies). Call
`game.weaponFired(w)` once per regular attack and scale that attack by what it returns
(`damage`, `size`), so Pilot Fish and Conductor Coil work with it. Hits that aren't projectiles go
through `game.strike(enemy, damage, SOURCES.yourKind)` or `game.blast(...)` so hit hooks, marks and
the Coil's charge work; add the kind to `SOURCES` and `KIND_WEAPON` in `src/entities/projectile.js`.
A projectile can take `onHit` to do something other than plain damage (Bubble Net traps), and
`selfTrinkets: true` if the weapon applies Undertow Stone and Split Coral its own way. `foundFrom`
(a depth id) makes it a weapon you have to find before you can start with it.
Scale by the shared stats (`might`, `area`, `cooldown`, `amount`, `duration`, `attackSpeed`) so
augments and talents affect it, and list them in `scaling` (stat → what it does for this weapon):
that decides which augments it can get, and `scaling.amount` is the text of its exotic *Plus One*. Give it `tags` (the stats it leans on), a talent list in
`WEAPON_TALENTS` in `src/data/talents.js` and a tree for them in `WEAPON_TREES` in
`src/data/trees.js`, and optionally `apply(b, rank, player, flags)` plus
`passiveText` for something built in while you carry it. It shows up on the weapon screen and on
level-up cards automatically.

**A passive:** add an entry to `src/data/passives.js` with `apply(b, level)` and `tags`. Passives
are for the diver's own stats; anything that makes a weapon better is an augment
(`src/data/augments.js`: its rarities, values and how often each comes up).

**Item pictures:** weapons, passives and trinkets each get a picture from `src/render/icons.js`,
drawn in a 32×32 box. Add a function under the item's id there; until you do, the item shows its
two-letter `icon` code instead.

**A trinket:** add an entry to `src/data/trinkets.js` with `attached` and `others` (card text),
`onWeapon` (what it does on each weapon it works on; weapons left out are listed as "No effect on"),
and `hooks` like a talent's, which also get the weapon it's attached to as a third argument. Extra
events for trinkets: `weaponFire` (a weapon's regular attack) and `shot` (a projectile was just
fired). Optional `power(holder, game)` changes the holder's next attack, and `hud(holder)` adds a
HUD line.

**A character:** add an entry to `src/data/heroes.js` (palette, `stats`, and one passive as
`trait`). Their look comes from `palette.gear`: add a new kit to `drawDiver` in
`src/render/sprites.js` so they're easy to tell apart. Then give them a list in `CHARACTER_TALENTS`
in `src/data/talents.js`, a tree in `CHARACTER_TREES` in `src/data/trees.js`, and add their id to
`HERO_ORDER`.

**A talent:** add it to a character's or a weapon's list in `src/data/talents.js` and place it in
that owner's tree in `src/data/trees.js` (row, column, and which nodes lead into it). Ids must be
unique across all lists. The rule: change how a skill works, don't add stats or give a stat a new
meaning. `ranks` lets it take several points, and `text` can be a function of the rank. A talent
can:
- `apply(b, rank, player, flags)`: usually just sets a flag that the skill's code checks
  (e.g. `flags.linkedFire` in `drone.js` and `weapons.js`)
- `hooks`: react to `kill`, `hit`, `pickup`, `hurt`, `shield` (return true to block a hit),
  `lethal`, `levelUp`, `droneLaunch`, `droneExpire`, `weaponFire`, `shot`, `tick` or `draw`
- `derive(b, rank, player, flags)`: rare overrides that need final values after every `apply`

Set `tags` to the shared stats the talent makes matter. They show as "Plays off" in the tree.

**An old-god tease:** add an `{ type: 'omen', omen: 'name' }` event to a level and handle that name
in the theme's `omen()` function.

## Ideas for next steps

- Kelp Twilight, depth 2 (kelp that slows you and hides enemies, ancient stone ruins). Building it
  makes The Open Blue reachable in normal play.
- More trinkets (Barnacle Charm, Lens of the Deep, Cleaner Wrasse, Signal Flare, Bubble Net, ...),
  and old-god trinkets with a cost that only drop deeper down
- More weapons found deeper down, like the Watching Eye
- More crew: Brann (hardsuit tank), Kaia (pearl diver), Sister Vey (the god's power), Ines
  (marine biologist), Volt (electrician), Elias (lamp keeper)
- Unlocking characters by playing
- Between-dive ship upgrades paid for with salvage (meta-progression)
- Logbook pages from the lost first expedition as rare pickups
- Pacts with the old god in the deeper zones
- Gamepad and touch controls
