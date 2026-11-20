import type { PadLayout } from './gamepad';

export type NpcId = 'rickley' | 'kingger' | 'trout' | 'kioff' | 'charig';
export type Screen = 'title' | 'play' | 'shop' | 'paused' | 'gameover' | 'victory';
export type BotKind = 'grill' | 'spitter' | 'skewer' | 'tenderizer' | 'bomber';
export type UpgradeId =
  | 'slop'
  | 'tusks'
  | 'hide'
  | 'trotters'
  | 'repair'
  | 'rocket'
  | 'zap'
  | 'tesla'
  | 'squeal'
  | 'magnet'
  | 'cannon'
  | 'uppercut'
  | 'bellyflop'
  | 'cyclone'
  | 'tailwhip'
  | 'riverrush'
  | 'portal'
  | 'decoy'
  | 'rewind'
  | 'potion'
  | 'regen'
  | 'speedrun'
  | 'smash'
  | 'compost';

export interface UpgradeDef {
  id: UpgradeId;
  npc: NpcId;
  name: string;
  /** Optional combo/key notation shown in Trout's Dojo. */
  input?: string;
  /** One line per level describing what buying that level gives you. */
  levels: string[];
  costs: number[];
  repeatable?: boolean;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'slop',
    npc: 'rickley',
    name: 'Hearty Slop',
    levels: [
      '+25 max health, full heal (also patches up surviving hogs)',
      '+25 max health, full heal',
      '+30 max health, full heal',
      '+35 max health, full heal',
    ],
    costs: [35, 65, 100, 145],
  },
  {
    id: 'tusks',
    npc: 'rickley',
    name: 'Whetstone Tusks',
    levels: ['Attacks hit 22% harder', '+44% attack damage', '+66% attack damage', '+90% attack damage'],
    costs: [45, 80, 120, 165],
  },
  {
    id: 'hide',
    npc: 'rickley',
    name: 'Thick Hide',
    levels: ['Take 10% less damage', 'Take 20% less damage', 'Take 30% less damage'],
    costs: [40, 75, 115],
  },
  {
    id: 'trotters',
    npc: 'rickley',
    name: 'Trotter Training',
    levels: ['Run faster, +30 stamina, quicker recovery', 'Run faster still, +30 stamina', 'Peak pig agility, +35 stamina'],
    costs: [40, 75, 115],
  },
  {
    id: 'compost',
    npc: 'rickley',
    name: 'Truffle Compost',
    levels: [
      'Garden truffles grow 40% faster and each harvest gives +4',
      'Grow 80% faster, +8 a harvest, and watering lasts longer',
      'Grow twice as fast, +12 a harvest, and a 1 in 5 chance of a Golden Truffle (x3)',
    ],
    costs: [30, 70, 130],
  },
  {
    id: 'repair',
    npc: 'rickley',
    name: 'Replant the Farm',
    levels: ['Regrow 25% of the farm & heal surviving hogs +20 HP'],
    costs: [35],
    repeatable: true,
  },
  {
    id: 'rocket',
    npc: 'kingger',
    name: 'Rocket Trotters',
    levels: ['Hog Charge recharges 18% faster, +14 damage', 'Recharges 36% faster, +28 damage', 'Recharges 52% faster, +44 damage'],
    costs: [50, 85, 130],
  },
  {
    id: 'zap',
    npc: 'kingger',
    name: 'Lightning Zap',
    levels: [
      'Unlocks Lightning Zap: call a sky bolt that chains to 3 targets + Kingger zaps foes from his lab',
      'Chains to 5 targets, cracks Wok Guard, fries projectiles & faster cooldown + stronger Kingger zaps',
      'Mega-Storm: massive thunderbolt chains to 7 targets (6s CD) & Kingger rapid-zaps the battlefield',
    ],
    costs: [55, 95, 140],
  },
  {
    id: 'tesla',
    npc: 'kingger',
    name: 'Tesla Tusks',
    levels: ['Hog Charge shocks Allen & arcs lightning to kitchen bots', 'Longer stun & heavy chain-lightning across nearby foes'],
    costs: [65, 115],
  },
  {
    id: 'squeal',
    npc: 'kingger',
    name: 'Sonic Squeal Amp',
    levels: ['Unlocks Squeal: stuns nearby enemies & clears projectiles', 'Wider blast, longer stun, faster recharge'],
    costs: [60, 105],
  },
  {
    id: 'magnet',
    npc: 'kingger',
    name: 'Truffle Magnet',
    levels: ['Truffles fly to you from far away and are worth +1'],
    costs: [45],
  },
  {
    id: 'cannon',
    npc: 'kioff',
    name: 'Corn Cannon',
    levels: ['Builds an auto-turret that pelts kitchen bots & Allen', 'Fires faster and harder', 'Rapid-fire cob barrage'],
    costs: [75, 115, 155],
  },
  {
    id: 'uppercut',
    npc: 'trout',
    name: 'Upstream Uppercut',
    input: 'SHIFT → LMB',
    levels: [
      'Attack during or right after a roll to launch a rising corkscrew uppercut',
      'Stronger uppercut with wider splash reach; landing it refunds 15 stamina',
    ],
    costs: [30, 65],
  },
  {
    id: 'bellyflop',
    npc: 'trout',
    name: 'Tidal Belly Flop',
    input: 'SPACE → LMB',
    levels: [
      'Attack in mid-air to dive-slam the ground with a splashing AoE shockwave',
      'Wider tidal wave, heavier slam damage, clears projectiles & douses chili puddles',
    ],
    costs: [40, 75],
  },
  {
    id: 'cyclone',
    npc: 'trout',
    name: 'Trout Cyclone Combo',
    input: 'LMB × 4',
    levels: [
      'Extends your headbutt chain with a double-hitting 360° cyclone finisher',
      'Bigger vortex, heavier spin damage, and cuts 1.5s off Hog Charge on hit',
    ],
    costs: [45, 85],
  },
  {
    id: 'tailwhip',
    npc: 'trout',
    name: 'Tail-Whip Counter',
    levels: [
      'Unlocks Tail-Whip: 360° sweep that knocks back bombers & blocks projectiles',
      'Faster cooldown, wider arc, and reflects chopsticks & chili globs back at foes',
    ],
    costs: [50, 90],
  },
  {
    id: 'riverrush',
    npc: 'trout',
    name: 'River Rush Finisher',
    input: '2+ HITS → RMB',
    levels: [
      'Chain any 2 hits into Hog Charge for a hydro-surging River Rush (+45% dmg & stagger)',
      '+75% River Rush damage, fires early with <2.5s cooldown left, and doubles Combo Flow',
    ],
    costs: [60, 110],
  },
  {
    id: 'portal',
    npc: 'kioff',
    name: 'Backrooms Portal',
    levels: [
      'Opens a noclip portal that sends nearby kitchen bots to the Backrooms for good',
      'Bigger portal, faster recharge, and Allen falls in too: he wanders the Backrooms for 4s and has to walk back in',
    ],
    costs: [70, 120],
  },
  {
    id: 'decoy',
    npc: 'kioff',
    name: 'Wireframe Decoy',
    levels: [
      'Drops a glowing low-poly pig that kitchen bots and Allen chase for 6 seconds',
      'Lasts 8 seconds, then bursts into pixels that hurt everything nearby',
    ],
    costs: [55, 95],
  },
  {
    id: 'rewind',
    npc: 'kioff',
    name: 'Keyframe Rewind',
    levels: [
      'Once per course, a knockout hit rewinds you 3 seconds: back where you were, with the health you had',
      'Rewinds 4 seconds and always brings you back with at least half your health',
    ],
    costs: [80, 130],
  },
  {
    id: 'potion',
    npc: 'charig',
    name: 'Health Potion',
    levels: ['Chug a potion: heal 35 health, and pigs and hogs near you heal 20', 'Heals 60, nearby pigs and hogs heal 35, faster recharge'],
    costs: [40, 80],
  },
  {
    id: 'regen',
    npc: 'charig',
    name: 'Out-of-Combat Regen',
    levels: ['Heal 1.5 health a second after 4 seconds without getting hit', 'Heal 3 a second after just 3 seconds'],
    costs: [45, 90],
  },
  {
    id: 'speedrun',
    npc: 'charig',
    name: 'Speedrun Strats',
    levels: ['Run 12% faster; rolls cost 18 stamina instead of 28', 'Run 20% faster; rolls cost 12 stamina and stay invincible a bit longer'],
    costs: [40, 80],
  },
  {
    id: 'smash',
    npc: 'charig',
    name: 'Smash Battles',
    levels: [
      "Shove a phone in Allen's face: he's stunned for 2.5s, even when he'd normally resist, but then he's Tilted for 15s (faster and angrier)",
      'Stuns him for 3.5s and stuns kitchen bots nearby too; faster recharge',
    ],
    costs: [60, 110],
  },
];

export function costOf(def: UpgradeDef, level: number, repairCount: number): number {
  if (def.repeatable) return def.costs[0] + repairCount * 12;
  return def.costs[Math.min(level, def.costs.length - 1)];
}

export function maxLevel(def: UpgradeDef): number {
  return def.repeatable ? Infinity : def.costs.length;
}

export interface CourseDef {
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  /** Seconds between Allen's snack runs. */
  hunger: number;
  eatRate: number;
  throwN: number;
  volleys: number;
  dash: boolean;
  /** Bots spawned per wave. */
  bots: number;
  /** Max concurrent kitchen minions allowed on the farm. */
  maxBots: number;
  /** Seconds between kitchen reinforcement waves. */
  waveCd: number;
  /** Enemy types Allen's kitchen deploys this course. */
  roster: BotKind[];
  doubleSwipe: boolean;
  /** Telegraph time multiplier — lower is meaner. */
  tele: number;
  /** HP is split into this many phases; each phase line triggers an invincible Sauce Shield stage. */
  phases: number;
  /** Sauce jars that must be smashed to break each shield. */
  jars: number;
  guard: boolean;
  rain: boolean;
  spin: boolean;
  intro: string;
  newFoe?: string;
}

export const COURSES: CourseDef[] = [
  {
    name: 'Appetizer',
    hp: 420,
    speed: 6.7,
    dmg: 1.15,
    hunger: 18,
    eatRate: 15,
    throwN: 1,
    volleys: 1,
    dash: false,
    bots: 2,
    maxBots: 3,
    waveCd: 19,
    roster: ['grill'],
    doubleSwipe: false,
    tele: 1.0,
    phases: 2,
    jars: 2,
    guard: false,
    rain: false,
    spin: false,
    intro: 'Do I smell… pork belly? Grillbots, light the coals!',
    newFoe: 'Grillbots join the hunt',
  },
  {
    name: 'Dim Sum Blitz',
    hp: 620,
    speed: 7.2,
    dmg: 1.3,
    hunger: 17,
    eatRate: 17,
    throwN: 2,
    volleys: 1,
    dash: false,
    bots: 3,
    maxBots: 4,
    waveCd: 17,
    roster: ['grill', 'spitter'],
    doubleSwipe: false,
    tele: 0.94,
    phases: 2,
    jars: 3,
    guard: true,
    rain: false,
    spin: false,
    intro: 'Needs heat! Bring out the Sriracha Spitters!',
    newFoe: 'New foe: Sriracha Spitter (chili puddles)',
  },
  {
    name: 'Soup & Salad',
    hp: 850,
    speed: 7.6,
    dmg: 1.45,
    hunger: 16,
    eatRate: 18,
    throwN: 3,
    volleys: 2,
    dash: true,
    bots: 3,
    maxBots: 5,
    waveCd: 16,
    roster: ['grill', 'spitter', 'skewer'],
    doubleSwipe: false,
    tele: 0.89,
    phases: 3,
    jars: 3,
    guard: true,
    rain: true,
    spin: false,
    intro: 'Skewer Hounds — thread me some pork kebabs!',
    newFoe: 'New foe: Skewer Hound (piercing dash)',
  },
  {
    name: 'Main Course',
    hp: 1120,
    speed: 8.0,
    dmg: 1.6,
    hunger: 15,
    eatRate: 20,
    throwN: 3,
    volleys: 2,
    dash: true,
    bots: 3,
    maxBots: 5,
    waveCd: 15,
    roster: ['grill', 'spitter', 'tenderizer'],
    doubleSwipe: true,
    tele: 0.84,
    phases: 3,
    jars: 4,
    guard: true,
    rain: true,
    spin: false,
    intro: 'Tough meat? Send in the Tenderizer Brutes.',
    newFoe: 'New foe: Tenderizer Brute (armored slam)',
  },
  {
    name: "Chef's Special",
    hp: 1420,
    speed: 8.3,
    dmg: 1.78,
    hunger: 14,
    eatRate: 22,
    throwN: 4,
    volleys: 2,
    dash: true,
    bots: 4,
    maxBots: 6,
    waveCd: 14.5,
    roster: ['grill', 'skewer', 'bomber'],
    doubleSwipe: true,
    tele: 0.8,
    phases: 3,
    jars: 4,
    guard: true,
    rain: true,
    spin: true,
    intro: 'Pressure cookers are at max PSI. Catch!',
    newFoe: 'New foe: Kettle Bomber (explosive sprint)',
  },
  {
    name: 'Second Helping',
    hp: 1760,
    speed: 8.65,
    dmg: 1.95,
    hunger: 13.5,
    eatRate: 24,
    throwN: 5,
    volleys: 2,
    dash: true,
    bots: 4,
    maxBots: 7,
    waveCd: 13.5,
    roster: ['spitter', 'skewer', 'tenderizer', 'bomber'],
    doubleSwipe: true,
    tele: 0.76,
    phases: 4,
    jars: 4,
    guard: true,
    rain: true,
    spin: true,
    intro: 'I ALWAYS go back for seconds. Full kitchen brigade!',
    newFoe: 'Elite mixed kitchen squads',
  },
  {
    name: 'Midnight Buffet',
    hp: 2150,
    speed: 9.0,
    dmg: 2.15,
    hunger: 12.5,
    eatRate: 26,
    throwN: 5,
    volleys: 3,
    dash: true,
    bots: 5,
    maxBots: 7,
    waveCd: 12.5,
    roster: ['grill', 'spitter', 'skewer', 'tenderizer', 'bomber'],
    doubleSwipe: true,
    tele: 0.72,
    phases: 4,
    jars: 5,
    guard: true,
    rain: true,
    spin: true,
    intro: 'All-you-can-eat starts NOW. Leave not a single hog!',
    newFoe: 'All 5 enemy types · 5 sauce jars',
  },
  {
    name: 'The Grand Feast',
    hp: 2650,
    speed: 9.4,
    dmg: 2.35,
    hunger: 11.5,
    eatRate: 28,
    throwN: 7,
    volleys: 3,
    dash: true,
    bots: 5,
    maxBots: 8,
    waveCd: 11.5,
    roster: ['grill', 'spitter', 'skewer', 'tenderizer', 'bomber'],
    doubleSwipe: true,
    tele: 0.68,
    phases: 5,
    jars: 5,
    guard: true,
    rain: true,
    spin: true,
    intro: 'Sunrise banquet! Every pig, every pie, ON MY PLATE!',
    newFoe: '5 phases · relentless brigade',
  },
];

export const HOG_NAMES = [
  'Herb',
  'Eric',
  'Farsight',
  'Marin',
  'emulsifiedhorsemeat',
  'evilwitchwhoisachicken',
] as const;

export type HogName = (typeof HOG_NAMES)[number];
export type GameOverReason = 'kenji' | 'farm' | 'guppy';

export interface HudState {
  screen: Screen;
  mode: 'intermission' | 'combat';
  area: 'farm' | 'forest';
  course: number;
  courseName: string;
  courseCount: number;
  hp: number;
  maxHp: number;
  stam: number;
  maxStam: number;
  truffles: number;
  /** Hog Rank, XP into it, and XP needed for the next. */
  rank: number;
  xp: number;
  xpNext: number;
  /** The combo book: found combos show how; the rest just a hint. */
  combos: { id: ComboId; name: string; uses: number; tier: number; next: number | null; hint: string; how: string; what: string; ready: boolean }[];
  farm: number;
  chargeCd: number;
  zapCd: number;
  zapUnlocked: boolean;
  squealCd: number;
  squealUnlocked: boolean;
  whipCd: number;
  whipUnlocked: boolean;
  cycloneUnlocked: boolean;
  rushReady: boolean;
  combo: { count: number; move: string; bonusPct: number } | null;
  muddy: boolean;
  focus: boolean;
  hurtTick: number;
  foeCount: number;
  boss: {
    active: boolean;
    hp: number;
    maxHp: number;
    poise: number;
    tag: string;
    alert: boolean;
    enraged: boolean;
    phase: number;
    phases: number;
    shield: { left: number; total: number; time: number; dur: number } | null;
    guarding: boolean;
    exposed: boolean;
  };
  prompt: string | null;
  subtitle: { who: string; text: string } | null;
  opening: { step: number; total: number } | null;
  banner: { title: string; sub: string; key: number } | null;
  objective: string;
  shopNpc: NpcId | null;
  levels: Record<UpgradeId, number>;
  repairCount: number;
  locked: boolean;
  gamepad: { layout: PadLayout; active: boolean } | null;
  controllerDisconnected: boolean;
  muted: boolean;
  gfx: 'high' | 'medium' | 'low';
  overReason: GameOverReason | null;
  allies: number;
  alliesMax: number;
  fallen: number;
  /** Set when this browser plays Allen: his moves (cooldown 0 = ready, 1 = just used). */
  allen: { active: boolean; state: string; moves: { key: string; name: string; cd: number }[] } | null;
  /** Everyone in the herd when more than one pig is playing (null in single-player). */
  party: { id: number; name: string; hp: number; maxHp: number; tint: string; down: boolean; you: boolean }[] | null;
  /** The Hog Hunt: truffle caches dug up, and how far the next one (or, when done, the trailhead) is. */
  hunt: {
    found: number;
    total: number;
    done: boolean;
    hint: string;
    listenCd: number;
    distance: number;
    location: string;
  } | null;
  stats: { time: number; dealt: number; taken: number; earned: number; fallen: number; ko: number };
  /** Earwhen's health bar, while he's on the farm. */
  earwhen: { hp: number; maxHp: number; tag: string; alert: boolean } | null;
  /** A story moment is playing out (letterbox the screen, hide the HUD). */
  cinematic: boolean;
  /** Your six loadout slots: key, keyboard code, the ability in it (or null), cooldown (1 = just used). */
  actives: { slot: number; key: string; code: string; id: ActiveId | null; name: string; cd: number; icon: string }[];
  /** Active abilities you own (whether or not they're in a slot). */
  owned: ActiveId[];
}

export const emptyLevels = (): Record<UpgradeId, number> => ({
  slop: 0,
  tusks: 0,
  hide: 0,
  trotters: 0,
  repair: 0,
  rocket: 0,
  zap: 0,
  tesla: 0,
  squeal: 0,
  magnet: 0,
  cannon: 0,
  uppercut: 0,
  bellyflop: 0,
  cyclone: 0,
  tailwhip: 0,
  riverrush: 0,
  portal: 0,
  decoy: 0,
  rewind: 0,
  potion: 0,
  regen: 0,
  speedrun: 0,
  smash: 0,
  compost: 0,
});

/** Abilities you put in your loadout and fire with a slot key. */
export const ACTIVE_IDS = ['zap', 'squeal', 'tailwhip', 'portal', 'decoy', 'potion', 'smash'] as const;
export type ActiveId = (typeof ACTIVE_IDS)[number];
export const ACTIVE_INFO: Record<ActiveId, { name: string; icon: string }> = {
  zap: { name: 'Zap', icon: '⚡' },
  squeal: { name: 'Squeal', icon: '📢' },
  tailwhip: { name: 'Whip', icon: '〰' },
  portal: { name: 'Portal', icon: '🚪' },
  decoy: { name: 'Decoy', icon: '🐷' },
  potion: { name: 'Potion', icon: '🧪' },
  smash: { name: 'Smash', icon: '📱' },
};
export const LOADOUT_SLOTS = 6;
/** Keyboard key for each loadout slot (number keys 1-6 work too). */
export const SLOT_KEYS = ['Q', 'F', 'C', 'V', 'X', 'G'] as const;
export const SLOT_CODES = ['KeyQ', 'KeyF', 'KeyC', 'KeyV', 'KeyX', 'KeyG'] as const;

/** Beats in the opening story (Charig's prologue, then Kenji's). */
export const OPENING_BEATS = 10;

/**
 * The finale: after the Grand Feast, Allen calls for backup. Course index FINALE (one past the last regular
 * course) is the fight against Earwhen with a battered Allen at his side.
 */
export const FINALE = COURSES.length;
/** Earwhen's stages, from the first fight (with Allen) to the last; each one hits harder. */
export const EARWHEN_STAGES = [
  "Earwhen's Feast",
  'Second Helping of Cream',
  'Whipped Into Shape',
  'Robot Roast',
  'The Curdling',
  'Dairy Nightmare',
  'Cream of the Crop',
  'Ultra-Pasteurized',
  'The Last Dollop',
];
/** The very last course of the game. */
export const LAST_COURSE = FINALE + EARWHEN_STAGES.length - 1;
/** Earwhen stage (0-based) for a course index, or -1 before the finale. */
export const earwhenStage = (course: number) => (course >= FINALE ? Math.min(course - FINALE, EARWHEN_STAGES.length - 1) : -1);
export const EARWHEN = {
  name: "Earwhen's Feast",
  /** Earwhen's health, before the herd-size scaling. */
  hp: 3000,
  speed: 7.2,
  dmg: 1.95,
  /** Allen comes back with this share of his Grand Feast health. */
  allenHp: 0.55,
  /** Earwhen's attack cooldowns are multiplied by this. */
  cooldown: 0.7,
  /** Seconds between Earwhen's snack runs. */
  hunger: 16,
  eatRate: 24,
};

/* ───────────────────────── grinding: the garden, Hog Rank and combos ───────────────────────── */

/** Truffle spores cost this much to plant in a garden plot. */
export const PLANT_COST = 5;
/** Seconds for a planted plot to ripen with no compost and no water. */
export const GROW_TIME = 95;
/** Truffles from one ripe plot before compost. */
export const HARVEST_BASE = 16;

/** Herd XP needed to go from `rank` to the next one. */
export function xpForRank(rank: number): number {
  return Math.round(80 + 45 * rank + 4 * rank * rank);
}
/** Rank-ups stop giving stat bonuses past this (the grind keeps going for the truffles). */
export const RANK_BONUS_CAP = 25;
/** Per rank (up to the cap): extra damage, and extra max health. */
export const RANK_DMG = 0.02;
export const RANK_HP = 2;

export type ComboId = 'staticShriek' | 'thunderCharge' | 'pigsplosion' | 'popcorn' | 'adrenaline' | 'mudBomb' | 'portalPounce';

export interface ComboDef {
  id: ComboId;
  name: string;
  /** Upgrades you need before it can happen. */
  needs: UpgradeId[];
  /** Shown before you've found it. */
  hint: string;
  /** Shown once you have. */
  how: string;
  what: string;
}

/** Niche interactions between abilities. Each one levels up with use (see COMBO_TIERS). */
export const COMBOS: ComboDef[] = [
  {
    id: 'staticShriek',
    name: 'Static Shriek',
    needs: ['zap', 'squeal'],
    hint: 'Squeal while something is still crackling\u2026',
    how: 'Squeal while your Zap aura is still crackling',
    what: 'A bigger squeal that throws lightning into every bot it hits',
  },
  {
    id: 'thunderCharge',
    name: 'Thunder Charge',
    needs: ['zap'],
    hint: 'Charge in while you\u2019re still charged up.',
    how: 'Hog Charge while your Zap aura is still crackling',
    what: 'The charge hits much harder and arcs into everything nearby',
  },
  {
    id: 'pigsplosion',
    name: 'Pigsplosion',
    needs: ['decoy'],
    hint: 'What happens if you ram your own decoy?',
    how: 'Hog Charge into your own Wireframe Decoy',
    what: 'The decoy blows up: big damage all around it',
  },
  {
    id: 'popcorn',
    name: 'Popcorn Storm',
    needs: ['cannon', 'zap'],
    hint: 'Corn in the air, and something hot\u2026',
    how: 'Zap while the Corn Cannon has kernels in the air',
    what: 'Every kernel pops into an exploding cloud of popcorn',
  },
  {
    id: 'adrenaline',
    name: 'Adrenaline Gulp',
    needs: ['potion'],
    hint: 'Drink at the most dangerous moment.',
    how: 'Drink a Health Potion right after a Perfect Dodge',
    what: 'Full stamina, and you hit 30% harder for a few seconds',
  },
  {
    id: 'mudBomb',
    name: 'Mud Bomb',
    needs: ['bellyflop'],
    hint: 'Pigs love mud. Bots don\u2019t.',
    how: 'Belly Flop into the mud pit',
    what: 'A mud wave that knocks over and stuns every bot around',
  },
  {
    id: 'portalPounce',
    name: 'Portal Pounce',
    needs: ['portal'],
    hint: 'Be waiting when he comes back.',
    how: 'Hit Allen in the moment he drops out of the Backrooms',
    what: 'A guaranteed critical hit for double damage',
  },
];

/** Uses needed for each mastery tier of a combo; each tier makes it 25% stronger. */
export const COMBO_TIERS = [1, 6, 20, 50];

/** Mastery tier (0 = not found yet, 1..4) for a number of uses. */
export function comboTier(uses: number): number {
  let t = 0;
  for (const need of COMBO_TIERS) if (uses >= need) t++;
  return t;
}

export interface Plot {
  id: number;
  x: number;
  z: number;
  /** 0 empty; growing 0..1; ripe at 1. */
  g: number;
  planted: boolean;
  /** Seconds of watering left (grows twice as fast). */
  wet: number;
  /** Ripens into a Golden Truffle. */
  gold: boolean;
}
