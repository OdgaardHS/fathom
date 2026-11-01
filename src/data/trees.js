/**
 * Talent trees, in the style of a modern WoW spec tree. Every character and every weapon has
 * one; the talents themselves are defined in data/talents.js.
 *
 *   maxPoints  how many points the tree can ever have (its owner's top level - 1). Trees hold
 *              more ranks than that, so you choose a path through them.
 *   gates      { row: points } a row opens once that many points are spent in the rows above it
 *   nodes      each { id, row, col, from } for a talent, or { key, choice: [ids], row, col, from }
 *              for a choice node, where you take one of the talents (and can swap any time).
 *              `from` lists the nodes (by id or key) that lead into it: you need a point in at
 *              least one of them. Nodes with no `from` are where the tree starts.
 *
 * Columns run 0..4. Points come from levelling: characters level up from all the pearls you
 * collect, weapons from the pearls you collect while carrying them (systems/progression.js).
 */

export const CHARACTER_TREES = {
  otto: {
    maxPoints: 12,
    gates: { 3: 5, 5: 9 },
    nodes: [
      { id: 'scrapRecycler', row: 0, col: 1 },
      { id: 'spotterUplink', row: 0, col: 3 },
      { id: 'autoLoader', row: 1, col: 0, from: ['scrapRecycler'] },
      { id: 'emergencyVenting', row: 1, col: 2, from: ['scrapRecycler', 'spotterUplink'] },
      { id: 'signalBoost', row: 1, col: 4, from: ['spotterUplink'] },
      { id: 'fieldRepairs', row: 2, col: 1, from: ['autoLoader', 'emergencyVenting'] },
      { id: 'laserSweep', row: 2, col: 3, from: ['emergencyVenting', 'signalBoost'] },
      { id: 'towCable', row: 3, col: 0, from: ['fieldRepairs'] },
      { key: 'ottoSystems', choice: ['calibration', 'sensorBuoy'], row: 3, col: 2, from: ['fieldRepairs', 'laserSweep'] },
      { id: 'cascade', row: 3, col: 4, from: ['laserSweep'] },
      { id: 'failsafe', row: 4, col: 1, from: ['towCable', 'ottoSystems'] },
      { id: 'uplinkRelay', row: 4, col: 3, from: ['ottoSystems', 'cascade'] },
      { key: 'ottoCapstone', choice: ['overclock', 'juryRig'], row: 5, col: 2, from: ['failsafe', 'uplinkRelay'] },
    ],
  },
  captain: {
    // Crew on the left, supply down the middle, the ship's guns on the right.
    maxPoints: 12,
    gates: { 3: 5, 5: 9 },
    nodes: [
      { id: 'veteranCrew', row: 0, col: 1 },
      { id: 'depthCharges', row: 0, col: 3 },
      { id: 'coveringFire', row: 1, col: 0, from: ['veteranCrew'] },
      { id: 'supplyDrop', row: 1, col: 2, from: ['veteranCrew', 'depthCharges'] },
      { id: 'spotterRounds', row: 1, col: 4, from: ['depthCharges'] },
      { id: 'fieldMedic', row: 2, col: 1, from: ['coveringFire', 'supplyDrop'] },
      { id: 'bracketingFire', row: 2, col: 3, from: ['supplyDrop', 'spotterRounds'] },
      { key: 'captainCrew', choice: ['crewSpecialist', 'secondMate'], row: 3, col: 0, from: ['fieldMedic'] },
      { id: 'ammoCrate', row: 3, col: 2, from: ['fieldMedic', 'bracketingFire'] },
      { id: 'torpedoRun', row: 3, col: 4, from: ['bracketingFire'] },
      { id: 'lifeline', row: 4, col: 1, from: ['captainCrew', 'ammoCrate'] },
      { id: 'quartermaster', row: 4, col: 3, from: ['ammoCrate', 'torpedoRun'] },
      { key: 'captainCapstone', choice: ['broadside', 'allHands'], row: 5, col: 2, from: ['lifeline', 'quartermaster'] },
    ],
  },
  jory: {
    // New songs on the left, how songs build and end in the middle, grog and mischief on the right.
    maxPoints: 12,
    gates: { 3: 5, 5: 9 },
    nodes: [
      { id: 'drunkenSailor', row: 0, col: 1 },
      { id: 'encore', row: 0, col: 3 },
      { id: 'wellerman', row: 1, col: 0, from: ['drunkenSailor'] },
      { id: 'crescendo', row: 1, col: 2, from: ['drunkenSailor', 'encore'] },
      { id: 'grogRation', row: 1, col: 4, from: ['encore'] },
      { id: 'southAustralia', row: 2, col: 1, from: ['wellerman', 'crescendo'] },
      { id: 'liquidCourage', row: 2, col: 3, from: ['crescendo', 'grogRation'] },
      { id: 'spanishLadies', row: 3, col: 0, from: ['southAustralia'] },
      { key: 'joryVerse', choice: ['finale', 'harmony'], row: 3, col: 2, from: ['southAustralia', 'liquidCourage'] },
      { id: 'rumBarrel', row: 3, col: 4, from: ['liquidCourage'] },
      { id: 'callAndResponse', row: 4, col: 1, from: ['spanishLadies', 'joryVerse'] },
      { id: 'seaLegs', row: 4, col: 3, from: ['joryVerse', 'rumBarrel'] },
      { key: 'joryCapstone', choice: ['seaChoir', 'ghostChorus'], row: 5, col: 2, from: ['callAndResponse', 'seaLegs'] },
    ],
  },
  coral: {
    // Regrowth on the left, thorns down the middle, the spreading reef on the right.
    maxPoints: 12,
    gates: { 3: 5, 5: 9 },
    nodes: [
      { id: 'thickCoral', row: 0, col: 1 },
      { id: 'barbedPolyps', row: 0, col: 3 },
      { id: 'rapidGrowth', row: 1, col: 0, from: ['thickCoral'] },
      { id: 'fireCoral', row: 1, col: 2, from: ['thickCoral', 'barbedPolyps'] },
      { id: 'reefSeed', row: 1, col: 4, from: ['barbedPolyps'] },
      { id: 'symbiosis', row: 2, col: 1, from: ['rapidGrowth', 'fireCoral'] },
      { id: 'stingingBloom', row: 2, col: 3, from: ['fireCoral', 'reefSeed'] },
      { id: 'livingStone', row: 3, col: 0, from: ['symbiosis'] },
      { id: 'overgrowth', row: 3, col: 2, from: ['symbiosis', 'stingingBloom'] },
      { key: 'coralReef', choice: ['brainCoral', 'atoll'], row: 3, col: 4, from: ['stingingBloom'] },
      { id: 'petrify', row: 4, col: 1, from: ['livingStone', 'overgrowth'] },
      { id: 'reefKeeper', row: 4, col: 3, from: ['overgrowth', 'coralReef'] },
      { key: 'coralCapstone', choice: ['greatBarrier', 'colossus'], row: 5, col: 2, from: ['petrify', 'reefKeeper'] },
    ],
  },
  hollow: {
    // The choice itself on the left, what it carries down the middle, chests and trinkets on the right.
    maxPoints: 12,
    gates: { 3: 5, 5: 9 },
    nodes: [
      { id: 'spitItOut', row: 0, col: 1 },
      { id: 'hollowOut', row: 0, col: 3 },
      { id: 'gorge', row: 1, col: 0, from: ['spitItOut'] },
      { id: 'emptySuit', row: 1, col: 2, from: ['spitItOut', 'hollowOut'] },
      { id: 'gildedHunger', row: 1, col: 4, from: ['hollowOut'] },
      { id: 'aftertaste', row: 2, col: 1, from: ['gorge', 'emptySuit'] },
      { id: 'pourOut', row: 2, col: 3, from: ['emptySuit', 'gildedHunger'] },
      { key: 'hollowMaw', choice: ['onePath', 'devour'], row: 3, col: 0, from: ['aftertaste'] },
      { id: 'overflow', row: 3, col: 2, from: ['aftertaste', 'pourOut'] },
      { id: 'twinSockets', row: 3, col: 4, from: ['pourOut'] },
      { id: 'lastMeal', row: 4, col: 1, from: ['hollowMaw', 'overflow'] },
      { id: 'innerShrine', row: 4, col: 3, from: ['overflow', 'twinSockets'] },
      { key: 'hollowCapstone', choice: ['nothingWasted', 'bottomless'], row: 5, col: 2, from: ['lastMeal', 'innerShrine'] },
    ],
  },
};

/** The common shape of the smaller weapon trees: two starts, a choice, a capstone. */
function small([left, right], choice, capstone, key) {
  return {
    maxPoints: 3,
    gates: { 2: 2 },
    nodes: [
      { id: left, row: 0, col: 1 },
      { id: right, row: 0, col: 3 },
      { key: `${key}Choice`, choice, row: 1, col: 2, from: [left, right] },
      { id: capstone, row: 2, col: 2, from: [`${key}Choice`] },
    ],
  };
}

export const WEAPON_TREES = {
  harpoon: {
    maxPoints: 5,
    gates: { 2: 3, 3: 4 },
    nodes: [
      { id: 'longThrow', row: 0, col: 1 },
      { id: 'reelingLine', row: 0, col: 3 },
      { id: 'splittingBarbs', row: 1, col: 0, from: ['longThrow'] },
      { id: 'anchorLine', row: 1, col: 2, from: ['longThrow', 'reelingLine'] },
      { id: 'ringVolley', row: 1, col: 4, from: ['reelingLine'] },
      { key: 'harpoonReturn', choice: ['tidalHarpoons', 'chainHarpoon'], row: 2, col: 2, from: ['splittingBarbs', 'anchorLine', 'ringVolley'] },
      { id: 'skewer', row: 3, col: 2, from: ['harpoonReturn'] },
    ],
  },
  drones: {
    maxPoints: 6,
    gates: { 2: 3, 3: 5 },
    nodes: [
      { id: 'recycledCores', row: 0, col: 1 },
      { id: 'spotterDrones', row: 0, col: 3 },
      { key: 'droneAge', choice: ['veteranDrones', 'burnout'], row: 1, col: 0, from: ['recycledCores'] },
      { id: 'laserFence', row: 1, col: 2, from: ['recycledCores', 'spotterDrones'] },
      { id: 'refraction', row: 1, col: 4, from: ['spotterDrones'] },
      { id: 'scrapDetonation', row: 2, col: 1, from: ['droneAge', 'laserFence'] },
      { key: 'droneFiring', choice: ['linkedFire', 'capacitorBank'], row: 2, col: 3, from: ['laserFence', 'refraction'] },
      { key: 'droneCapstone', choice: ['mothership', 'hive', 'kamikaze'], row: 3, col: 2, from: ['scrapDetonation', 'droneFiring'] },
    ],
  },
  darts: {
    maxPoints: 4,
    gates: { 2: 3 },
    nodes: [
      { id: 'venom', row: 0, col: 1 },
      { id: 'wideFan', row: 0, col: 3 },
      { id: 'rapidReload', row: 1, col: 0, from: ['venom'] },
      { id: 'ricochetDarts', row: 1, col: 2, from: ['venom', 'wideFan'] },
      { id: 'rearGuard', row: 1, col: 4, from: ['wideFan'] },
      { key: 'dartCapstone', choice: ['needleCyclone', 'sniper'], row: 2, col: 2, from: ['rapidReload', 'ricochetDarts', 'rearGuard'] },
    ],
  },
  starfish: {
    maxPoints: 4,
    gates: { 2: 3 },
    nodes: [
      { id: 'stingingArms', row: 0, col: 1 },
      { id: 'counterSpin', row: 0, col: 3 },
      { id: 'thrownStars', row: 1, col: 0, from: ['stingingArms'] },
      { id: 'regrowth', row: 1, col: 2, from: ['stingingArms', 'counterSpin'] },
      { id: 'tidalPull', row: 1, col: 4, from: ['counterSpin'] },
      { key: 'starCapstone', choice: ['starShield', 'supernova'], row: 2, col: 2, from: ['thrownStars', 'regrowth', 'tidalPull'] },
    ],
  },
  sonar: {
    maxPoints: 4,
    gates: { 2: 3 },
    nodes: [
      { id: 'echo', row: 0, col: 1 },
      { id: 'resonance', row: 0, col: 3 },
      { id: 'concussive', row: 1, col: 0, from: ['echo'] },
      { key: 'sonarMarks', choice: ['sonarMark', 'depthCharge'], row: 1, col: 2, from: ['echo', 'resonance'] },
      { id: 'stunPulse', row: 1, col: 4, from: ['resonance'] },
      { id: 'shockwave', row: 2, col: 2, from: ['concussive', 'sonarMarks', 'stunPulse'] },
    ],
  },
  eel: {
    maxPoints: 4,
    gates: { 2: 3 },
    nodes: [
      { id: 'stunningArc', row: 0, col: 1 },
      { id: 'feedback', row: 0, col: 3 },
      { id: 'buildingCharge', row: 1, col: 1, from: ['stunningArc'] },
      { key: 'eelJumps', choice: ['groundLoop', 'storedCharge'], row: 1, col: 3, from: ['feedback'] },
      { id: 'livingStorm', row: 2, col: 2, from: ['buildingCharge', 'eelJumps'] },
    ],
  },
  ink: {
    maxPoints: 4,
    gates: { 2: 3 },
    nodes: [
      { id: 'murkyWater', row: 0, col: 1 },
      { id: 'jetSquirt', row: 0, col: 3 },
      { id: 'smokescreen', row: 1, col: 1, from: ['murkyWater'] },
      { key: 'inkClouds', choice: ['inkBomb', 'huntingInk'], row: 1, col: 3, from: ['jetSquirt'] },
      { id: 'krakenWake', row: 2, col: 2, from: ['smokescreen', 'inkClouds'] },
    ],
  },
  trident: {
    maxPoints: 4,
    gates: { 2: 3 },
    nodes: [
      { id: 'riposte', row: 0, col: 1 },
      { id: 'riptide', row: 0, col: 3 },
      { id: 'lunge', row: 1, col: 1, from: ['riposte'] },
      { key: 'tridentFinish', choice: ['impale', 'brineWave'], row: 1, col: 3, from: ['riptide'] },
      { id: 'whirlpool', row: 2, col: 2, from: ['lunge', 'tridentFinish'] },
    ],
  },
  bubbles: small(['softTarget', 'burstSpray'], ['pressure', 'netting'], 'humpbackNet', 'bubble'),
  lure: small(['secondBite', 'deepHunger'], ['brightLure', 'swallowWhole'], 'lanternHunt', 'lure'),
  shrimp: small(['sonicBoom', 'bigCatch'], ['stunningSnap', 'boilingWater'], 'cavitationLance', 'shrimp'),
  tendrils: small(['numbingSting', 'coilingDrift'], ['entangle', 'dragNet'], 'shedTendrils', 'tendril'),
  eye: small(['lingeringGaze', 'evilEye'], ['glare', 'searingDeath'], 'eyeOpens', 'eye'),
};
