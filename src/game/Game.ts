import * as THREE from 'three';
import { buildWorld, isOnLakeDock, BOUND, SPOT, type World, type Edible, type Collider } from './world';
import {
  makeKenji,
  makeAllen,
  makeRickley,
  makeKingger,
  makeTrout,
  makeGrillbot,
  makeSpitter,
  makeSkewerHound,
  makeTenderizer,
  makeBomber,
  makeChiliGlob,
  makeHogMemorial,
  makeHpBar,
  updateHpBar,
  makeTruffle,
  makeChopsticks,
  makeTurret,
  makeSaucePot,
  glow,
  part,
  sph,
  type KenjiModel,
  type AllenModel,
  type NpcModel,
  type TroutModel,
  type EnemyModel,
  type WorldHpBar,
  type TurretModel,
  type PotModel,
} from './models';
import { COURSES, HOG_NAMES, UPGRADES, costOf, maxLevel, emptyLevels, type BotKind, type GameOverReason, type HogName, type HudState, type NpcId, type Screen, type UpgradeId } from './data';
import { Sfx } from './audio';
import { Gfx, type Quality } from './gfx';
import { setGrassDensity, tickNature } from './nature';
import { CombatVfx } from './vfx';
import { buildForest, FOREST_BOUND, FOREST_EXIT, FOREST_START, FOREST_HOMES, type ForestWorld } from './forest';
import { GUPPY_END, GUPPY_HP, GUPPY_SWING, makePathGuppy, type GuppyModel } from './guppy';
import { GamepadInput, PAD_ACTIONS, PadMenuRepeat, padDown, type PadFrame, type PadLayout, type PadMenuCommand } from './gamepad';

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (a: number, b: number, step: number) => (a < b ? Math.min(a + step, b) : Math.max(a - step, b));
const angDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > PI) d -= TAU;
  if (d < -PI) d += TAU;
  return d;
};
const angLerp = (a: number, b: number, t: number) => a + angDiff(a, b) * Math.min(1, t);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const CONTROLLER_ACTIONS = Object.values(PAD_ACTIONS);

interface Tod {
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  fog: number;
  /** Exponential fog density. */
  fogD: number;
  elev: number;
  stars: number;
  win: number;
  /** Atmosphere: haze, blue scattering and the glow around the sun. */
  turb: number;
  ray: number;
  mie: number;
  mieG: number;
  /** Sky brightness and tint (the moonlit night reuses the same atmosphere, dimmed and tinted blue). */
  gain: number;
  tint: number;
  expo: number;
}
/** 8-course sky arc: afternoon → late sun → golden hour → sunset → dusk → moonlight → blood moon → grand dawn. */
const TODS: Tod[] = [
  { sun: 0xfff1dc, sunI: 4.6, hemiSky: 0xcfe8ff, hemiGround: 0x8a9a5b, hemiI: 0.3, fog: 0xb4cde4, fogD: 0.0017, elev: 0.95, stars: 0, win: 0.4, turb: 2.2, ray: 1.1, mie: 0.004, mieG: 0.8, gain: 1, tint: 0xffffff, expo: 0.52 },
  { sun: 0xffe8bf, sunI: 4.5, hemiSky: 0xd4e6ff, hemiGround: 0x94985a, hemiI: 0.32, fog: 0xd2d4c2, fogD: 0.0019, elev: 0.72, stars: 0, win: 0.6, turb: 2.9, ray: 1.45, mie: 0.005, mieG: 0.81, gain: 1, tint: 0xffffff, expo: 0.53 },
  { sun: 0xffda98, sunI: 4.6, hemiSky: 0xd8ddff, hemiGround: 0x9c8e56, hemiI: 0.36, fog: 0xe4caa2, fogD: 0.0021, elev: 0.46, stars: 0, win: 1.0, turb: 4.0, ray: 2.0, mie: 0.007, mieG: 0.84, gain: 1, tint: 0xffffff, expo: 0.58 },
  { sun: 0xff9a4d, sunI: 5.2, hemiSky: 0xd8c4e8, hemiGround: 0x9a7a55, hemiI: 0.5, fog: 0xd89a78, fogD: 0.0024, elev: 0.2, stars: 0.08, win: 1.8, turb: 6, ray: 3, mie: 0.012, mieG: 0.88, gain: 1, tint: 0xffffff, expo: 0.72 },
  { sun: 0xff6a3c, sunI: 4.6, hemiSky: 0x9a9ae8, hemiGround: 0x6a5a6a, hemiI: 0.75, fog: 0x8a6a8a, fogD: 0.003, elev: 0.09, stars: 0.5, win: 3, turb: 7, ray: 3.6, mie: 0.014, mieG: 0.9, gain: 1, tint: 0xffffff, expo: 0.95 },
  { sun: 0xf6f2ea, sunI: 2.0, hemiSky: 0xcfcfd8, hemiGround: 0x55555e, hemiI: 0.75, fog: 0x10162a, fogD: 0.003, elev: 0.9, stars: 1, win: 4.5, turb: 1.4, ray: 0.7, mie: 0.003, mieG: 0.8, gain: 0.02, tint: 0xb0b8d8, expo: 1.05 },
  { sun: 0xffb8a8, sunI: 2.2, hemiSky: 0xd89aa8, hemiGround: 0x5c3e48, hemiI: 0.82, fog: 0x26121e, fogD: 0.0036, elev: 0.68, stars: 0.95, win: 4.8, turb: 2.4, ray: 1.1, mie: 0.008, mieG: 0.86, gain: 0.028, tint: 0xff8c8c, expo: 1.04 },
  { sun: 0xffb36b, sunI: 5.0, hemiSky: 0xffc8d8, hemiGround: 0x8f6b58, hemiI: 0.62, fog: 0xd88c7e, fogD: 0.0028, elev: 0.16, stars: 0.22, win: 2.6, turb: 6.4, ray: 3.3, mie: 0.014, mieG: 0.9, gain: 1, tint: 0xffe4dc, expo: 0.82 },
];
const FOREST_TOD: Tod = { sun: 0xffe7b0, sunI: 4.2, hemiSky: 0xd8ead1, hemiGround: 0x57694c, hemiI: 0.4, fog: 0x93ad94, fogD: 0.008, elev: 0.85, stars: 0, win: 0.4, turb: 3.6, ray: 1.3, mie: 0.006, mieG: 0.8, gain: 1, tint: 0xf4ffe8, expo: 0.56 };
const LIT_KEYS = ['sunI', 'hemiI', 'fogD', 'elev', 'win', 'turb', 'ray', 'mie', 'mieG', 'gain', 'expo'] as const;
type Lit = Record<(typeof LIT_KEYS)[number], number>;

/** Unlit gameplay telegraph: always drawn on top (so grass never hides it) and bright enough to glow. */
function fxMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false });
  m.color.multiplyScalar(1.7);
  return m;
}
const SUN_AZ = -0.9;

type KAction = 'none' | 'attack' | 'roll' | 'charge' | 'zap' | 'squeal' | 'uppercut' | 'bellyflop' | 'tailwhip' | 'hurt' | 'dead';
type AState =
  | 'gone'
  | 'enter'
  | 'chase'
  | 'swipeWind'
  | 'swipe'
  | 'slamWind'
  | 'slamAir'
  | 'throwWind'
  | 'dashWind'
  | 'dash'
  | 'summon'
  | 'toEat'
  | 'eating'
  | 'recover'
  | 'stunned'
  | 'defeated'
  | 'leaving'
  | 'ko'
  | 'shielded'
  | 'guard'
  | 'rainCast'
  | 'spinWind'
  | 'spin';

interface BotBody {
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  rad: number;
  heading: number;
  bite: number;
  stun: number;
  kx: number;
  kz: number;
  chomp: number;
  flash: number;
  ph: number;
  /** Sub-state for special enemies: idle, wind (skewer/tenderizer windup), lunge (skewer dash), fuse (bomber countdown). */
  mode: 'idle' | 'wind' | 'lunge' | 'fuse';
  mt: number;
  lx: number;
  lz: number;
  strafe: number;
  ring: THREE.Group | null;
  ringFill: THREE.Mesh | null;
}
type GuppyState = 'waiting' | 'chasing' | 'windup' | 'recovering' | 'returning';
type PathGuppy = BotBody & { kind: 'guppy'; m: GuppyModel; behavior: GuppyState };
type Bot = (BotBody & { kind: BotKind; m: EnemyModel }) | PathGuppy;

interface Puddle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  r: number;
  life: number;
  maxLife: number;
  tick: number;
  dmg: number;
}
interface Memorial {
  mesh: THREE.Group;
  life: number;
}
interface Proj {
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  dmg: number;
  kind: 'chopstick' | 'chili';
  friendly?: boolean;
}
interface Shock {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  r: number;
  maxR: number;
  speed: number;
  hostile: boolean;
  hit: boolean;
  hitAllies: Set<Ally>;
  dmg: number;
}
interface Pickup {
  mesh: THREE.Group;
  area: HudState['area'];
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  value: number;
}
interface Kernel {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  bot: Bot | null;
  dmg: number;
}

interface Pot {
  m: PotModel;
  x: number;
  z: number;
  hp: number;
  wob: number;
  hitCd: number;
  ph: number;
}
interface Hazard {
  g: THREE.Group;
  fill: THREE.Mesh;
  ball: THREE.Mesh;
  x: number;
  z: number;
  r: number;
  t: number;
  dur: number;
  dmg: number;
}
interface Wild {
  m: KenjiModel;
  name: HogName;
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  wait: number;
  ph: number;
  home: { x: number; z: number; r: number };
  spotted: boolean;
  oinkT: number;
  calm: number;
}
interface Ally {
  m: KenjiModel;
  hpBar: WorldHpBar;
  name: HogName;
  tint: number;
  x: number;
  z: number;
  heading: number;
  hp: number;
  maxHp: number;
  cd: number;
  atk: number;
  inv: number;
  ph: number;
  /** >0 while playing permanent death tumble before removal. */
  dying: number;
}

const MAX_SQUAD = HOG_NAMES.length;
const HOG_TINTS = [0xf2b38a, 0xe8a0b4, 0xffc9a8, 0xd9a0a0, 0xf7d0b0, 0xe9b9d9];
const GUPPY_ALERT_RANGE = 9;
const GUPPY_TERRITORY = 26;
const GUPPY_DROPS = 5;

/* CombatVfx lives in ./vfx.ts */

const RING_GEO = new THREE.RingGeometry(0.88, 1, 56).rotateX(-PI / 2);
const DISC_GEO = new THREE.CircleGeometry(1, 40).rotateX(-PI / 2);
const HAZ_BALL_GEO = new THREE.IcosahedronGeometry(0.8, 0);
const HAZ_RING_MAT = fxMat(0xff5a1f, 0.9);
const HAZ_FILL_MAT = fxMat(0xff5a1f, 0.34);

export class Game {
  portraits: Record<string, string> = {};

  private container: HTMLElement;
  private onHud: (s: HudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, 0.5, 800);
  private world: World;
  private forest: ForestWorld | null = null;
  private area: 'farm' | 'forest' = 'farm';
  private sfx = new Sfx();
  private fx: HTMLDivElement;
  private arrow: HTMLDivElement;
  private minimap: HTMLCanvasElement | null = null;
  private raf = 0;
  private last = 0;
  private time = 0;
  private disposed = false;
  private reduceMotion = false;
  private ro: ResizeObserver | null = null;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private gfx: Gfx;
  private stars: THREE.Points;
  private tod = 0;
  private lit: Lit = { sunI: TODS[0].sunI, hemiI: TODS[0].hemiI, fogD: TODS[0].fogD, elev: TODS[0].elev, win: TODS[0].win, turb: TODS[0].turb, ray: TODS[0].ray, mie: TODS[0].mie, mieG: TODS[0].mieG, gain: TODS[0].gain, expo: TODS[0].expo };
  private skyTint = new THREE.Color(TODS[0].tint);
  private sunDir = new THREE.Vector3(0, 1, 0);
  private gfxAuto = true;
  private wallTime = 0;
  private frameMs = 16;
  private slowT = 0;
  private fogColor = new THREE.Color(TODS[0].fog);
  private tmpC = new THREE.Color();

  private yaw = 0;
  private pitch = 0.36;
  private camDist = 10.5;
  private camClip = 20;
  private camTarget = new THREE.Vector3(0, 1.5, 6);
  private shake = 0;
  private autoYaw: { to: number; t: number } | null = null;
  private hitstop = 0;
  private tmp = new THREE.Vector3();

  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mdx = 0;
  private mdy = 0;
  private locked = false;
  private gamepad = new GamepadInput();
  private padMenuRepeat = new PadMenuRepeat();
  private padFrame: PadFrame | null = null;
  private padLayout: PadLayout | null = null;
  private padActive = false;
  private controllerDisconnected = false;
  private onPadMenu?: (command: PadMenuCommand) => boolean;

  private screen: Screen = 'title';
  private mode: 'intermission' | 'combat' = 'intermission';
  private course = 0;
  private levels = emptyLevels();
  private repairCount = 0;
  private truffles = 0;
  private snapshot: {
    levels: Record<UpgradeId, number>;
    repairCount: number;
    truffles: number;
    edibleHp: number[];
    squad: { name: HogName; tint: number; hp: number; maxHp: number }[];
    fallen: number;
    ko: number;
  } | null = null;
  private stats = { time: 0, dealt: 0, taken: 0, earned: 0, fallen: 0, ko: 0 };
  private courseFallen = 0;
  private recruitedHogs = new Set<HogName>();
  private guppyDefeated = false;
  private waveT = 10;
  private overReason: GameOverReason | null = null;
  private overTimer = 0;
  private hurtTick = 0;
  private prompt: string | null = null;
  private subtitle: { who: string; text: string; t: number } | null = null;
  private opening: { step: number; t: number } | null = null;
  private banner: { title: string; sub: string; key: number; t: number } | null = null;
  private bannerKey = 0;
  private shopNpc: NpcId | null = null;
  private hudTimer = 0;
  private mapTimer = 0;
  private greeted = { rickley: false, kingger: false, trout: false };
  private barkT = 12;

  private k = {
    x: SPOT.start.x,
    y: 0,
    z: SPOT.start.z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: PI,
    hp: 100,
    maxHp: 100,
    stam: 100,
    maxStam: 100,
    stamDelay: 0,
    action: 'none' as KAction,
    t: 0,
    combo: 0,
    comboTimer: 0,
    buffered: false,
    hitDone: false,
    hitDone2: false,
    invuln: 0,
    blink: 0,
    chargeCd: 0,
    zapCd: 0,
    zapAura: 0,
    squealCd: 0,
    whipCd: 0,
    focus: 0,
    dodged: false,
    rollChain: 0,
    chainHits: 0,
    rushWindow: 0,
    riverRush: false,
    flowCount: 0,
    flowTimer: 0,
    flowMove: '',
    muddy: 0,
    rdx: 0,
    rdz: -1,
    grounded: true,
    walk: 0,
    chargeHit: new Set<Bot>(),
  };
  private kModel: KenjiModel;
  private openingPigs: KenjiModel[] = [];

  private A = {
    active: false,
    x: 0,
    y: 0,
    z: 66,
    heading: PI,
    hp: 1,
    maxHp: 1,
    state: 'gone' as AState,
    t: 0,
    poise: 0,
    poiseMax: 100,
    poiseDelay: 0,
    cdSwipe: 0,
    cdSlam: 0,
    cdThrow: 0,
    cdDash: 0,
    cdSummon: 0,
    globalCd: 0,
    decideT: 0,
    hunger: 20,
    target: null as Edible | null,
    eatX: 0,
    eatZ: 0,
    eatDmg: 0,
    chompT: 0,
    enraged: false,
    dropAcc: 0,
    stunDur: 0,
    stunImmune: 0,
    recoverDur: 0,
    sx: 0,
    sz: 0,
    tx: 0,
    tz: 0,
    airDur: 0.9,
    slamChain: 0,
    swipes: 0,
    volleys: 0,
    dashHit: false,
    summoned: false,
    avoidT: 0,
    avoidDir: 1,
    walk: 0,
    flash: 0,
    phase: 0,
    phases: 1,
    shielded: false,
    shieldT: 0,
    shieldDur: 1,
    potTotal: 0,
    exposed: 0,
    immuneCd: 0,
    cdGuard: 0,
    cdRain: 0,
    cdSpin: 0,
    rainT: 0,
    rainLeft: 0,
    spinHitT: 0,
  };
  private aModel: AllenModel;

  private rick: NpcModel;
  private king: NpcModel;
  private trout: TroutModel;
  private troutLeap = 0;
  private troutLeapNext = 7;
  private dummyWobble = 0;
  private dummyDx = 0;
  private dummyDz = 1;
  private dummyCoachCd = 0;
  private dummyChargeHit = false;
  private markers: THREE.Mesh[] = [];
  private turret: TurretModel;
  private turretT = 0;
  private kingZapT = 3.5;
  private kingCast = 0;
  private kingBarkCd = 0;
  private turretCollider: Collider;
  private bots: Bot[] = [];
  private projs: Proj[] = [];
  private puddles: Puddle[] = [];
  private memorials: Memorial[] = [];
  private shocks: Shock[] = [];
  private pickups: Pickup[] = [];
  private kernels: Kernel[] = [];
  private parts = new CombatVfx();
  private spinRibbonT = 0;
  private slamRing = new THREE.Group();
  private slamFill: THREE.Mesh;
  private dashLine: THREE.Mesh;
  private bellSwing = 0;
  private pots: Pot[] = [];
  private hazards: Hazard[] = [];
  private tips = new Set<string>();
  private shieldGroup = new THREE.Group();
  private shieldWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3.66, 1),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, wireframe: true, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  private wild: Wild[] = [];
  private allies: Ally[] = [];
  private hunt: { total: number; caught: number } | null = null;
  private sniffCd = 0;
  private sniffTime = 0;
  private sniffTarget: Wild | null = null;
  private forestHint = 'Follow the hoofprints into the trees.';

  constructor(container: HTMLElement, onHud: (s: HudState) => void) {
    this.container = container;
    this.onHud = onHud;
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Opaque canvas without stencil avoids expensive macOS CoreAnimation HiDPI alpha compositing
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none';
    this.renderer.domElement.setAttribute('aria-label', 'The Borpse Bry Sisters — 3D game view');
    container.appendChild(this.renderer.domElement);

    this.fx = document.createElement('div');
    this.fx.className = 'fx-layer';
    container.appendChild(this.fx);
    this.arrow = document.createElement('div');
    this.arrow.className = 'allen-arrow';
    this.arrow.style.display = 'none';
    this.fx.appendChild(this.arrow);

    // portraits first (uses the renderer before the real scene exists)
    this.portraits = this.makePortraits();
    // cinematic pipeline: atmospheric sky, sky lighting, ambient occlusion, bloom and filmic tone mapping
    this.gfx = new Gfx(this.renderer, this.scene, this.camera);

    /* lights + sky */
    this.scene.fog = new THREE.FogExp2(TODS[0].fog, TODS[0].fogD);
    this.hemi = new THREE.HemisphereLight(TODS[0].hemiSky, TODS[0].hemiGround, TODS[0].hemiI);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(TODS[0].sun, TODS[0].sunI);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -38;
    sc.right = 38;
    sc.top = 38;
    sc.bottom = -38;
    sc.near = 1;
    sc.far = 240;
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.09;
    this.scene.add(this.sun, this.sun.target);

    const sp = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i++) {
      const a = Math.random() * TAU;
      const e = Math.acos(Math.random() * 0.95);
      sp[i * 3] = Math.sin(e) * Math.cos(a) * 560;
      sp[i * 3 + 1] = Math.cos(e) * 560 + 10;
      sp[i * 3 + 2] = Math.sin(e) * Math.sin(a) * 560;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    /* world + cast */
    this.world = buildWorld();
    this.scene.add(this.world.group);

    this.kModel = makeKenji();
    this.scene.add(this.kModel.root);
    this.openingPigs = [
      makeKenji(0xf0b4a7, true),
      makeKenji(0xe99b8f, true),
      makeKenji(0xcfa58f, true),
    ];
    for (const pig of this.openingPigs) {
      pig.root.visible = false;
      this.scene.add(pig.root);
    }
    this.aModel = makeAllen();
    this.scene.add(this.aModel.root);
    this.rick = makeRickley();
    this.rick.root.position.set(SPOT.rickley.x, 0, SPOT.rickley.z);
    this.king = makeKingger();
    this.king.root.position.set(SPOT.kingger.x, 0, SPOT.kingger.z);
    this.trout = makeTrout();
    this.trout.root.position.set(SPOT.trout.x, 0, SPOT.trout.z);
    this.trout.root.scale.setScalar(1.32);
    this.trout.root.rotation.y = PI / 2;
    this.scene.add(this.rick.root, this.king.root, this.trout.root);
    // characters stay evenly lit: no self-shadow speckle on the faceted bodies, and they read clearly in shade
    for (const o of [this.kModel.root, this.aModel.root, this.rick.root, this.king.root, this.trout.root])
      o.traverse((c) => {
        c.receiveShadow = c.castShadow;
      });
    this.world.colliders.push({ kind: 'c', x: SPOT.rickley.x, z: SPOT.rickley.z, r: 0.9, hx: 0, hz: 0, h: 2.8, enabled: true });
    this.world.colliders.push({ kind: 'c', x: SPOT.kingger.x, z: SPOT.kingger.z, r: 0.8, hx: 0, hz: 0, h: 2.6, enabled: true });

    for (const [x, y, z] of [
      [SPOT.rickley.x, 4.3, SPOT.rickley.z],
      [SPOT.kingger.x, 4.1, SPOT.kingger.z],
      [SPOT.bell.x, 5.4, SPOT.bell.z],
      [SPOT.hunt.x, 7.6, SPOT.hunt.z],
      [SPOT.trout.x, 3.2, SPOT.trout.z],
    ]) {
      const m = part(this.scene, new THREE.OctahedronGeometry(0.42, 0), glow(0xffc93c, 1.4), x, y, z, { shadow: false });
      this.markers.push(m);
    }

    this.turret = makeTurret();
    this.turret.root.position.set(SPOT.turret.x, 0, SPOT.turret.z);
    this.turret.root.visible = false;
    this.scene.add(this.turret.root);
    this.turretCollider = { kind: 'c', x: SPOT.turret.x, z: SPOT.turret.z, r: 0.9, hx: 0, hz: 0, h: 3, enabled: false };
    this.world.colliders.push(this.turretCollider);

    this.scene.add(this.parts.group);

    /* telegraphs */
    const red = fxMat(0xff3b30, 0.85);
    const redFill = fxMat(0xff3b30, 0.3);
    const ring = new THREE.Mesh(RING_GEO, red);
    this.slamFill = new THREE.Mesh(DISC_GEO, redFill);
    this.slamRing.add(ring, this.slamFill);
    this.slamRing.scale.setScalar(4.2);
    this.slamRing.visible = false;
    this.scene.add(this.slamRing);
    const lg = new THREE.PlaneGeometry(3.6, 32).rotateX(-PI / 2).translate(0, 0, 16);
    this.dashLine = new THREE.Mesh(lg, fxMat(0xff3b30, 0.4));
    this.dashLine.visible = false;
    this.scene.add(this.dashLine);

    /* Sauce Shield bubble shown during Allen's invincibility stage */
    const bubble = new THREE.Mesh(
      new THREE.SphereGeometry(3.55, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.shieldGroup.add(bubble, this.shieldWire);
    this.shieldGroup.visible = false;
    this.scene.add(this.shieldGroup);

    this.applyQuality(this.detectQuality());
    this.placeTitle();
    this.resize();
    this.bind();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.emit();
  }

  /* ───────────────────────── setup helpers ───────────────────────── */

  private makePortraits(): Record<string, string> {
    const out: Record<string, string> = {};
    try {
      const r = this.renderer;
      const s = new THREE.Scene();
      s.add(new THREE.HemisphereLight(0xffffff, 0x9a8a76, 1.7));
      const d = new THREE.DirectionalLight(0xfff0d8, 2.4);
      d.position.set(2, 3, 4);
      s.add(d);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
      const S = 220;
      const rt = new THREE.WebGLRenderTarget(S, S, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      const buf = new Uint8Array(S * S * 4);
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const cx = cv.getContext('2d');
      const prevAlpha = r.getClearAlpha();
      r.setClearColor(0x000000, 0);
      const shots: [string, THREE.Object3D, [number, number, number], [number, number, number]][] = [
        ['kenji', makeKenji().root, [0, 0.85, 0.25], [2.2, 1.5, 4.2]],
        ['allen', makeAllen().root, [0, 3.75, 0.2], [2.6, 4.3, 7.2]],
        ['rickley', makeRickley().body, [0, 2.3, 0], [1.3, 2.6, 4.4]],
        ['kingger', makeKingger().body, [0, 2.25, 0], [1.3, 2.5, 4.0]],
        ['trout', makeTrout(false).root, [0, 0.56, 0.14], [2.75, 1.22, 2.65]],
      ];
      for (const [name, obj, tgt, pos] of shots) {
        s.add(obj);
        cam.position.set(pos[0], pos[1], pos[2]);
        cam.lookAt(tgt[0], tgt[1], tgt[2]);
        r.setRenderTarget(rt);
        r.clear(true, true, false);
        r.render(s, cam);
        r.readRenderTargetPixels(rt, 0, 0, S, S, buf);
        if (cx) {
          const img = cx.createImageData(S, S);
          // flip WebGL bottom-up rows to top-down canvas rows
          for (let y = 0; y < S; y++) {
            const srcRow = (S - 1 - y) * S * 4;
            img.data.set(buf.subarray(srcRow, srcRow + S * 4), y * S * 4);
          }
          cx.putImageData(img, 0, 0);
          out[name] = cv.toDataURL('image/png');
        }
        s.remove(obj);
      }
      r.setRenderTarget(null);
      r.setClearColor(0x1b120d, prevAlpha || 1);
      rt.dispose();
    } catch {
      /* portraits are optional */
    }
    return out;
  }

  private bind() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('resize', this.resize);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    const c = this.renderer.domElement;
    c.addEventListener('mousedown', this.onMouseDown);
    c.addEventListener('contextmenu', this.onContext);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.container);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.ro?.disconnect();
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.parts.dispose();
    this.sfx.dispose();
    this.gfx.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.fx.remove();
  }

  private resize = () => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.gfx.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /* ───────────────────────── input ───────────────────────── */

  private onKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if ((this.padActive || this.controllerDisconnected) && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) this.switchToKeyboard();
    if (this.screen === 'play') {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) e.preventDefault();
      if (e.repeat) return;
      this.sfx.unlock();
      this.keys.add(code);
      this.pressed.add(code);
      if (this.opening && (code === 'Space' || code === 'Enter' || code === 'KeyE')) this.advanceOpening();
      if (code === 'KeyP' || code === 'Escape') this.pause();
      if (code === 'KeyM') this.toggleMute();
    } else if (e.repeat) {
      return;
    } else if (this.screen === 'shop') {
      if (code === 'Escape' || code === 'KeyE') {
        e.preventDefault();
        this.closeShop();
      } else if (/^Digit[1-9]$/.test(code)) {
        const list = UPGRADES.filter((u) => u.npc === this.shopNpc);
        const u = list[Number(code.slice(5)) - 1];
        if (u) this.buy(u.id);
      }
    } else if (this.screen === 'paused') {
      if (code === 'KeyP' || code === 'Escape') this.resume();
      if (code === 'KeyM') this.toggleMute();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.pressed.clear();
    this.padFrame = null;
    this.padMenuRepeat.reset();
    this.gamepad.suspend();
    if (this.padActive && this.screen === 'play' && !this.overReason) this.pause();
  };
  private onVisibility = () => {
    if (document.hidden) this.onBlur();
  };
  private onMouseDown = (e: MouseEvent) => {
    if (this.screen !== 'play') return;
    if (this.opening) {
      this.advanceOpening();
      return;
    }
    this.switchToKeyboard();
    this.sfx.unlock();
    if (!this.locked) this.lock();
    this.keys.add('Mouse' + e.button);
    this.pressed.add('Mouse' + e.button);
  };
  private onMouseUp = (e: MouseEvent) => {
    this.keys.delete('Mouse' + e.button);
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.screen !== 'play') return;
    if (e.movementX || e.movementY) this.switchToKeyboard();
    this.mdx += e.movementX || 0;
    this.mdy += e.movementY || 0;
  };
  private onContext = (e: Event) => e.preventDefault();
  private onLockChange = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.renderer.domElement;
    if (was && !this.locked && this.screen === 'play' && !this.padActive) this.pause();
    this.emit();
  };
  private lock() {
    if (this.padActive) return;
    try {
      const p = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      /* pointer lock unavailable: arrow keys still turn the camera */
    }
  }
  private unlock() {
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }

  private switchToKeyboard() {
    if (!this.padActive && !this.controllerDisconnected) return;
    this.padActive = false;
    this.controllerDisconnected = false;
    this.padMenuRepeat.reset();
    this.emit();
  }

  private recenterCamera() {
    this.autoYaw = null;
    this.mdx = this.mdy = 0;
    this.yaw = this.k.heading - PI;
    this.pitch = this.area === 'forest' ? 0.46 : 0.36;
  }

  private updateGamepad(now: number, dt: number) {
    if (document.hidden) return;
    const pad = this.gamepad.poll();
    this.padFrame = pad;
    if (!pad) {
      if (this.padLayout === null) return;
      this.padLayout = null;
      this.padMenuRepeat.reset();
      const playingWithPad = this.padActive && this.screen === 'play' && !this.overReason;
      this.controllerDisconnected = this.padActive && (playingWithPad || this.screen === 'paused');
      this.padActive = false;
      if (playingWithPad) this.pause();
      else this.emit();
      return;
    }

    const newLayout = pad.layout !== this.padLayout;
    this.padLayout = pad.layout;
    if (pad.used) {
      const changed = !this.padActive || this.controllerDisconnected;
      this.controllerDisconnected = false;
      this.padActive = true;
      if (changed) {
        this.keys.clear();
        this.pressed.clear();
        this.mdx = this.mdy = 0;
        this.unlock();
      }
      if (changed || newLayout) this.emit();
      if (pad.pressed) this.sfx.unlock();
    } else if (newLayout) {
      this.emit();
    }
    if (!this.padActive) return;

    const start = padDown(pad.pressed, 'start');
    const confirm = padDown(pad.pressed, 'south');
    const back = padDown(pad.pressed, 'east');
    if (this.screen === 'play') {
      this.padMenuRepeat.reset();
      if (start) this.pause();
      if (start || this.overReason) return;
      if (padDown(pad.pressed, 'rightStick')) this.recenterCamera();
      for (const binding of CONTROLLER_ACTIONS) {
        if (padDown(pad.pressed, binding.button)) this.pressed.add(binding.key);
      }
      return;
    }
    if (this.screen === 'paused' && (start || back)) {
      this.resume();
    } else if (this.screen === 'shop' && (start || back)) {
      this.closeShop();
    } else if (start && this.screen === 'title') {
      this.start();
    } else {
      const direction = this.padMenuRepeat.step(pad, now, this.screen);
      if (direction) this.onPadMenu?.(direction);
      if (Math.abs(pad.lookY) > 0.14) this.onPadMenu?.({ scroll: pad.lookY * 650 * dt });
      if (confirm && !this.onPadMenu?.('confirm')) {
        if (this.screen === 'title' || this.screen === 'victory') this.start();
        else if (this.screen === 'gameover') this.retryCourse();
        else if (this.screen === 'paused') this.resume();
      }
    }
  }

  /* ───────────────────────── public API ───────────────────────── */

  setMinimap(c: HTMLCanvasElement | null) {
    this.minimap = c;
  }

  setGamepadMenu(handler: (command: PadMenuCommand) => boolean) {
    this.onPadMenu = handler;
  }

  useKeyboard() {
    this.switchToKeyboard();
  }

  /** Pause-menu graphics switch: Cinematic → Balanced → Fast. */
  cycleGraphics() {
    this.gfxAuto = false;
    const q = this.gfx.quality;
    this.applyQuality(q === 'high' ? 'medium' : q === 'medium' ? 'low' : 'high');
  }

  /**
   * Picks a starting graphics level from the GPU name + HiDPI display; the pause menu and real-time
   * frame-rate watchdog can adjust it anytime. Older mobile dGPUs (e.g. Radeon Pro 4xx/5xx/5300M/5500M,
   * Vega mobile, GeForce MX/9xxM) and Retina Intel Macs default to Balanced instead of Cinematic.
   */
  private detectQuality(): Quality {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const raw = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER) || '');
      if (/swiftshader|llvmpipe|software|microsoft basic/i.test(raw)) return 'low';
      const legacyMobileDgpu =
        /radeon\s*(pro\s*)?(4\d\d|5\d\d|wx|5[356]00m|vega\s*(8|1\d|20|mobile)|rx\s*[45]\d0|r[579]\b|m\d)|geforce\s*(mx|9\d0m|8\d0m|gtx\s*(8|9|105)\d*m?)|quadro\s*[kmpm][12]?\d00m/i.test(
          raw,
        );
      const igpu = /mali|adreno|powervr|intel(?!.*arc)|iris|hd\s*graphics|uhd\s*graphics/i.test(raw);
      const isRetina = (window.devicePixelRatio || 1) >= 1.75;
      const isMac = /mac/i.test(navigator.platform || navigator.userAgent || '');
      // Safari masks UNMASKED_RENDERER_WEBGL as "Apple GPU" even on Intel/Radeon MacBooks
      const maskedMac = isMac && /^apple gpu$/i.test(raw.trim());
      if (legacyMobileDgpu || (isMac && isRetina && (igpu || maskedMac))) {
        this.gfx.retinaClamp = true;
      }
      if (/hd\s*graphics\s*[345]\d\d|uhd\s*graphics\s*6[123]0|radeon\s*pro\s*(45\d|555)/i.test(raw) && isRetina) {
        return 'medium';
      }
      if (legacyMobileDgpu || igpu || maskedMac) return 'medium';
    } catch {
      /* unknown GPU: let the real-time watchdog step down quickly if needed */
    }
    return 'high';
  }

  private grassFactor() {
    const q = this.gfx.quality;
    return q === 'high' ? 1 : q === 'medium' ? 0.52 : 0.2;
  }

  private applyQuality(q: Quality) {
    this.gfx.setQuality(q);
    // 2048 (Cinematic) / 1024 (Balanced) / 768 (Fast): 4×–28× less shadow bandwidth than 4096 while staying crisp
    const size = q === 'high' ? 2048 : q === 'medium' ? 1024 : 768;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.parts.density = q === 'high' ? 1 : q === 'medium' ? 0.78 : 0.5;
    setGrassDensity(this.world.grass, this.grassFactor());
    if (this.forest) setGrassDensity(this.forest.grass, this.grassFactor());
    this.emit();
  }

  /**
   * Steps graphics down automatically if the device cannot hold ~30 fps.
   * Uses real wall-clock time (not clamped game `dt`) so a slow GPU recovers within ~1.5 seconds instead of 40s.
   */
  private watchPerformance(raw: number) {
    if (!this.gfxAuto || document.hidden || raw <= 0 || raw > 2000 || this.gfx.quality === 'low') return;
    const sec = Math.min(raw, 500) / 1000;
    this.wallTime += sec;
    if (this.wallTime < 1.8) return; // skip initial shader compile / first-frame warmup
    this.frameMs = this.frameMs * 0.8 + Math.min(raw, 300) * 0.2;
    if (this.frameMs > 62) {
      // severe slideshow (<16 fps): step down very quickly
      this.slowT += sec * 2.2;
    } else if (this.frameMs > 34) {
      this.slowT += sec;
    } else {
      this.slowT = Math.max(0, this.slowT - sec * 1.5);
    }
    if (this.slowT > 1.4) {
      this.slowT = 0;
      this.frameMs = 16;
      this.applyQuality(this.gfx.quality === 'high' ? 'medium' : 'low');
    }
  }

  toggleMute() {
    this.sfx.setMuted(!this.sfx.muted);
    this.emit();
  }

  start() {
    this.sfx.unlock();
    this.resetAll();
    this.restoreCinematicActors();
    this.controllerDisconnected = false;
    this.screen = 'play';
    this.mode = 'intermission';
    this.opening = { step: 0, t: 4.8 };
    for (const pig of this.openingPigs) pig.root.visible = false;
    this.scatterTruffles(8);
    this.showBanner('THE LAST HOG', 'An opening story · press Space, Enter, E, or click to skip');
    this.say('Rickley', 'It started with an empty pen, one broke farmer, and one pig Allen had not eaten yet.', 4.8);
    this.lock();
    this.emit();
  }

  finishOpening() {
    if (!this.opening) return;
    this.opening = null;
    for (const pig of this.openingPigs) pig.root.visible = false;
    this.restoreCinematicActors();
    this.subtitle = null;
    this.showBanner('SUPPERTIME IS COMING', 'Grab truffles · gear up · ring the Dinner Bell');
    this.say('Rickley', "Kenji! That Hwang fella's sniffin' round the gate again. Come see me 'fore you ring that bell.", 6.5);
    this.emit();
  }

  advanceOpening() {
    if (!this.opening) return;
    if (this.opening.step >= 4) {
      this.finishOpening();
    } else {
      this.opening = { step: this.opening.step + 1, t: 4.8 };
      this.emit();
    }
  }

  restart() {
    this.start();
  }

  retryCourse() {
    if (this.overReason === 'guppy') {
      this.recoverFromGuppy();
      return;
    }
    const s = this.snapshot;
    if (!s) {
      this.start();
      return;
    }
    this.clearEnemies();
    this.pickups = this.pickups.filter((p) => {
      if (p.area === 'forest') return true;
      this.discard(p.mesh);
      return false;
    });
    this.clearSquad();
    this.setArea('farm');
    for (let i = 0; i < s.squad.length; i++) {
      const sv = s.squad[i];
      this.spawnAllyPig(SPOT.start.x + (i - 2) * 1.4, SPOT.start.z + 2.4, PI, sv.tint, sv.name, sv.hp, sv.maxHp);
    }
    this.stats.fallen = s.fallen;
    this.stats.ko = s.ko;
    this.courseFallen = 0;
    this.levels = { ...s.levels };
    this.repairCount = s.repairCount;
    this.truffles = s.truffles;
    this.world.edibles.forEach((e, i) => {
      e.hp = s.edibleHp[i];
      this.refreshEdible(e);
    });
    this.applyStats(true);
    this.resetKenji();
    this.mode = 'intermission';
    this.overReason = null;
    this.overTimer = 0;
    this.screen = 'play';
    this.greeted = { rickley: false, kingger: false, trout: false };
    this.showBanner('ONE MORE TRY', `Ring the bell when you're ready for Course ${this.course + 1}`);
    this.lock();
    this.emit();
  }

  pause() {
    if (this.screen !== 'play') return;
    this.screen = 'paused';
    this.keys.clear();
    this.pressed.clear();
    this.unlock();
    this.emit();
  }

  resume() {
    if (this.screen !== 'paused') return;
    this.controllerDisconnected = false;
    this.screen = 'play';
    this.sfx.unlock();
    this.lock();
    this.emit();
  }

  returnToFarm() {
    if (this.area !== 'forest' || !['play', 'paused'].includes(this.screen)) return;
    if (this.overReason === 'guppy') {
      this.recoverFromGuppy();
      return;
    }
    this.screen = 'play';
    this.endHunt();
    this.lock();
  }

  closeShop() {
    if (this.screen !== 'shop') return;
    this.screen = 'play';
    this.shopNpc = null;
    this.lock();
    this.emit();
  }

  buy(id: UpgradeId) {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def || this.screen !== 'shop' || def.npc !== this.shopNpc) return;
    const lvl = this.levels[id];
    const cost = costOf(def, lvl, this.repairCount);
    const squadDamaged = this.allies.some((a) => a.dying <= 0 && a.hp < a.maxHp);
    if (lvl >= maxLevel(def) || this.truffles < cost || (id === 'repair' && this.farmPct() >= 99.5 && !squadDamaged)) {
      this.sfx.play('deny');
      return;
    }
    this.truffles -= cost;
    if (def.repeatable) {
      this.repairCount++;
      this.repairFarm(0.25);
      this.healSurvivors(20);
    } else {
      this.levels[id] = lvl + 1;
      if (id === 'slop') this.healSurvivors(999);
    }
    this.applyStats(id === 'slop');
    this.sfx.play('buy');
    if (def.npc === 'trout') this.leapTrout();
    if (id === 'zap') {
      this.sfx.play('thunder');
      this.kingCast = 0.8;
      // celebratory high-voltage arc between Kingger and his Tesla coil!
      this.parts.lightning(SPOT.kingger.x, 2.7, SPOT.kingger.z, 33.5, 3.3, 29.5, 0x62f4ff, 0.09, 0.45);
      this.parts.lightning(33.5, 16, 29.5, 33.5, 3.3, 29.5, 0xb8fcff, 0.12, 0.45);
      this.parts.hitBurst(33.5, 3.3, 29.5, 0x5ff2ff, 1.6);
    }
    this.emit();
  }

  /* ───────────────────────── state helpers ───────────────────────── */

  private restoreCinematicActors() {
    this.kModel.root.position.set(SPOT.start.x, 0, SPOT.start.z);
    this.kModel.root.rotation.set(0, PI, 0);
    this.kModel.pivot.position.y = 0.75;
    this.kModel.pivot.rotation.set(0, 0, 0);
    this.kModel.head.rotation.set(0, 0, 0);

    this.rick.root.position.set(SPOT.rickley.x, 0, SPOT.rickley.z);
    this.rick.root.rotation.set(0, 0, 0);
    this.rick.root.position.y = 0;
    this.rick.armR.rotation.set(0, 0, 0);
    this.rick.armL.rotation.set(0, 0, 0);

    this.king.root.position.set(SPOT.kingger.x, 0, SPOT.kingger.z);
    this.king.root.rotation.set(0, 0, 0);
    this.king.armR.rotation.set(0, 0, 0);
    this.king.armL.rotation.set(0, 0, 0);

    this.trout.root.position.set(SPOT.trout.x, 0, SPOT.trout.z);
    this.trout.root.rotation.set(0, PI / 2, 0);

    this.aModel.root.position.set(0, 0, 61);
    this.aModel.root.rotation.set(0, PI, 0);
    this.aModel.armR.rotation.set(-2.2, 0, 0);
    this.aModel.armL.rotation.set(-0.5, 0, 0);
    this.aModel.head.rotation.set(0, 0, 0);

    for (const pig of this.openingPigs) {
      pig.root.visible = false;
      pig.root.position.set(0, 0, 0);
      pig.root.rotation.set(0, PI, 0);
      pig.pivot.position.y = 0.75;
      pig.pivot.rotation.set(0, 0, 0);
    }
  }

  private placeTitle() {
    this.aModel.root.visible = true;
    this.aModel.root.position.set(0, 0, 61);
    this.aModel.root.rotation.y = PI;
    this.aModel.armR.rotation.x = -2.2;
    this.aModel.armL.rotation.x = -0.5;
    this.animateKenji(0);
  }

  private resetKenji() {
    const k = this.k;
    k.x = SPOT.start.x;
    k.z = SPOT.start.z;
    k.y = 0;
    k.vx = k.vy = k.vz = 0;
    k.heading = PI;
    k.hp = k.maxHp;
    k.stam = k.maxStam;
    k.action = 'none';
    k.t = 0;
    k.combo = 0;
    k.invuln = 0;
    k.blink = 0;
    k.chargeCd = 0;
    k.zapCd = 0;
    k.zapAura = 0;
    k.squealCd = 0;
    k.whipCd = 0;
    k.focus = 0;
    k.dodged = false;
    k.rollChain = 0;
    k.chainHits = 0;
    k.rushWindow = 0;
    k.riverRush = false;
    k.flowCount = 0;
    k.flowTimer = 0;
    k.flowMove = '';
    k.muddy = 0;
    k.grounded = true;
    this.hurtTick = 0;
    this.yaw = 0;
    this.pitch = 0.36;
    this.camTarget.set(k.x, 1.5, k.z);
    this.kModel.root.visible = true;
  }

  private resetAll() {
    this.clearEnemies();
    this.clearSquad();
    this.setArea('farm');
    this.restoreCinematicActors();
    for (const p of this.pickups) this.discard(p.mesh);
    this.pickups = [];
    this.levels = emptyLevels();
    this.repairCount = 0;
    this.truffles = 0;
    this.course = 0;
    this.tod = 0;
    this.snapshot = null;
    this.recruitedHogs.clear();
    this.guppyDefeated = false;
    this.courseFallen = 0;
    this.tips.clear();
    this.stats = { time: 0, dealt: 0, taken: 0, earned: 0, fallen: 0, ko: 0 };
    this.overReason = null;
    this.overTimer = 0;
    this.subtitle = null;
    this.opening = null;
    this.banner = null;
    this.greeted = { rickley: false, kingger: false, trout: false };
    for (const e of this.world.edibles) {
      e.hp = e.maxHp;
      this.refreshEdible(e);
    }
    this.applyStats(true);
    this.resetKenji();
  }

  private discardBot(b: Bot) {
    if (b.ring) this.scene.remove(b.ring);
    b.m.hp.mat.dispose();
    if (b.kind === 'guppy') b.m.flash.dispose();
    this.discard(b.m.root);
  }

  private clearEnemies() {
    for (const b of this.bots) this.discardBot(b);
    for (const p of this.projs) this.discard(p.mesh);
    for (const pd of this.puddles) {
      this.scene.remove(pd.mesh);
      pd.mat.dispose();
    }
    for (const mm of this.memorials) this.discard(mm.mesh);
    for (const s of this.shocks) {
      this.scene.remove(s.mesh);
      s.mat.dispose();
    }
    for (const k of this.kernels) this.discard(k.mesh);
    this.bots = [];
    this.projs = [];
    this.puddles = [];
    this.memorials = [];
    this.shocks = [];
    this.kernels = [];
    this.A.active = false;
    this.A.state = 'gone';
    this.aModel.root.visible = false;
    this.aModel.pivot.rotation.set(0, 0, 0);
    this.aModel.pivot.scale.setScalar(1);
    this.slamRing.visible = false;
    this.dashLine.visible = false;
    this.clearStageProps();
    this.A.shielded = false;
    this.A.exposed = 0;
    this.aModel.wok.visible = false;
  }

  private applyStats(heal: boolean) {
    const k = this.k;
    const lv = this.levels;
    k.maxHp = 100 + [0, 25, 50, 80, 115][Math.min(lv.slop, 4)];
    k.maxStam = 100 + [0, 30, 60, 95][Math.min(lv.trotters, 3)];
    if (heal) k.hp = k.maxHp;
    k.hp = Math.min(k.hp, k.maxHp);
    k.stam = Math.min(k.stam, k.maxStam);
    this.turret.root.visible = this.area === 'farm' && lv.cannon > 0;
    this.turretCollider.enabled = lv.cannon > 0;
  }

  private activeColliders() {
    return this.area === 'forest' && this.forest ? this.forest.colliders : this.world.colliders;
  }

  private mapBound() {
    return this.area === 'forest' ? FOREST_BOUND : BOUND;
  }

  private setArea(area: 'farm' | 'forest') {
    if (area === 'forest' && !this.forest) {
      this.forest = buildForest();
      this.scene.add(this.forest.group);
      setGrassDensity(this.forest.grass, this.grassFactor());
    }
    const changed = this.area !== area;
    this.area = area;
    const farm = area === 'farm';
    this.world.group.visible = farm;
    if (this.forest) this.forest.group.visible = !farm;
    this.rick.root.visible = farm;
    this.king.root.visible = farm;
    this.trout.root.visible = farm;
    this.k.flowCount = 0;
    this.k.flowTimer = 0;
    this.k.chainHits = 0;
    this.k.rushWindow = 0;
    this.turret.root.visible = farm && this.levels.cannon > 0;
    for (const marker of this.markers) marker.visible = farm && this.mode === 'intermission';
    for (const p of this.pickups) p.mesh.visible = p.area === area;
    for (const s of this.shocks) {
      this.scene.remove(s.mesh);
      s.mat.dispose();
    }
    this.shocks = [];
    this.parts.clear();
    this.prompt = null;
    this.keys.clear();
    this.pressed.clear();
    this.hitstop = 0;
    this.shake = 0;
    this.sniffCd = this.sniffTime = 0;
    this.sniffTarget = null;
    for (const child of [...this.fx.children]) if (child !== this.arrow) child.remove();
    if (changed) {
      const fade = document.createElement('div');
      fade.className = 'map-transition';
      this.fx.appendChild(fade);
      window.setTimeout(() => fade.remove(), 850);
    }
    this.mapTimer = 0;
  }

  private safePosition(x: number, z: number, rad = 0.7) {
    const bound = this.mapBound() - 1;
    for (let i = 0; i < 70; i++) {
      const a = i * 2.4;
      const r = i === 0 ? 0 : Math.sqrt(i) * 0.6;
      const px = clamp(x + Math.sin(a) * r, -bound, bound);
      const pz = clamp(z + Math.cos(a) * r, -bound, bound);
      if (!this.resolve(px, pz, rad).hit) return { x: px, z: pz };
    }
    return this.resolve(clamp(x, -bound, bound), clamp(z, -bound, bound), rad);
  }

  private travelTo(x: number, z: number, heading: number) {
    const k = this.k;
    const p = this.safePosition(x, z);
    k.x = p.x;
    k.z = p.z;
    k.y = k.vx = k.vy = k.vz = 0;
    k.action = 'none';
    k.t = k.comboTimer = 0;
    k.buffered = false;
    k.grounded = true;
    k.heading = heading;
    this.yaw = heading - PI;
    this.pitch = this.area === 'forest' ? 0.46 : 0.36;
    this.camDist = 10.5;
    this.camClip = 20;
    this.autoYaw = null;
    this.mdx = this.mdy = 0;
    this.camTarget.set(k.x, 1.5, k.z);
    this.allies.forEach((a, i) => {
      const ang = heading + PI + i * 1.1;
      const pos = this.safePosition(k.x + Math.sin(ang) * 3.5, k.z + Math.cos(ang) * 3.5);
      a.x = pos.x;
      a.z = pos.z;
      a.heading = heading;
      a.m.root.position.set(a.x, 0, a.z);
      a.m.root.visible = a.dying <= 0;
    });
    this.animateKenji(0);
    this.updateCamera(1);
    this.drawMinimap();
  }

  private discard(o: THREE.Object3D) {
    this.scene.remove(o);
    o.traverse((c) => {
      if (c instanceof THREE.Mesh && !c.userData.sharedGeometry) c.geometry.dispose();
    });
  }

  private farmPct() {
    let hp = 0;
    let max = 0;
    for (const e of this.world.edibles) {
      hp += e.hp;
      max += e.maxHp;
    }
    return (hp / max) * 100;
  }

  private repairFarm(frac: number) {
    let pool = frac * this.world.edibles.reduce((a, e) => a + e.maxHp, 0);
    const sorted = [...this.world.edibles].sort((a, b) => a.hp - b.hp);
    for (const e of sorted) {
      const add = Math.min(pool, e.maxHp - e.hp);
      e.hp += add;
      pool -= add;
      this.refreshEdible(e);
      if (pool <= 0) break;
    }
  }

  private refreshEdible(e: Edible) {
    const shown = Math.ceil((e.hp / e.maxHp) * e.pieces.length - 0.001);
    if (shown !== e.shown) {
      e.shown = shown;
      e.pieces.forEach((p, i) => (p.visible = i < shown));
    }
    if (e.collider) e.collider.enabled = e.hp > 0;
  }

  private resolve(x: number, z: number, rad: number) {
    let hit = false;
    let cx = 0;
    let cz = 0;
    const onDock = this.area === 'farm' && rad < 1.0 && isOnLakeDock(x, z);
    for (const c of this.activeColliders()) {
      if (!c.enabled) continue;
      if (onDock && c.lakeWater) continue;
      if (c.kind === 'c') {
        const dx = x - c.x;
        const dz = z - c.z;
        const min = rad + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.0001;
          x = c.x + (dx / d) * min;
          z = c.z + (dz / d) * min;
          hit = true;
          cx = c.x;
          cz = c.z;
        }
      } else {
        const px = clamp(x, c.x - c.hx, c.x + c.hx);
        const pz = clamp(z, c.z - c.hz, c.z + c.hz);
        const dx = x - px;
        const dz = z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < rad * rad) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = px + (dx / d) * rad;
            z = pz + (dz / d) * rad;
          } else {
            const ox = c.hx - Math.abs(x - c.x);
            const oz = c.hz - Math.abs(z - c.z);
            if (ox < oz) x = c.x + (x < c.x ? -1 : 1) * (c.hx + rad);
            else z = c.z + (z < c.z ? -1 : 1) * (c.hz + rad);
          }
          hit = true;
          cx = c.x;
          cz = c.z;
        }
      }
    }
    return { x, z, hit, cx, cz };
  }

  private say(who: string, text: string, dur = 3.4) {
    this.subtitle = { who, text, t: dur };
  }

  private showBanner(title: string, sub: string) {
    this.banner = { title, sub, key: ++this.bannerKey, t: 3.4 };
  }

  private floatText(x: number, y: number, z: number, text: string, cls: string) {
    if (this.screen !== 'play') return;
    const v = this.tmp.set(x, y, z).project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return;
    const el = document.createElement('div');
    el.className = 'fx-text ' + cls;
    el.textContent = text;
    el.style.left = ((v.x * 0.5 + 0.5) * 100).toFixed(2) + '%';
    el.style.top = ((-v.y * 0.5 + 0.5) * 100).toFixed(2) + '%';
    this.fx.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  }

  private addShake(a: number) {
    this.shake = Math.max(this.shake, a);
  }

  private spawnTruffle(x: number, z: number, burst: boolean) {
    const mesh = makeTruffle();
    const y = burst ? 2.6 : 0.5;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const a = Math.random() * TAU;
    const sp = burst ? 3 + Math.random() * 5 : 0;
    this.pickups.push({
      mesh,
      area: this.area,
      x,
      y,
      z,
      vx: Math.cos(a) * sp,
      vz: Math.sin(a) * sp,
      vy: burst ? 8 + Math.random() * 4 : 0,
      age: burst ? 0 : 1,
      value: 5 + (this.levels.magnet > 0 ? 1 : 0),
    });
  }

  private scatterTruffles(n: number) {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 12; tries++) {
        const x = rand(-46, 46);
        const z = rand(-46, 46);
        if (!this.resolve(x, z, 1.5).hit && Math.hypot(x - this.k.x, z - this.k.z) > 8) {
          this.spawnTruffle(x, z, false);
          break;
        }
      }
    }
  }

  private spawnShock(x: number, z: number, maxR: number, speed: number, hostile: boolean, dmg: number) {
    const mat = fxMat(hostile ? 0xff5a3c : 0x5ff2ff, 0.9);
    const mesh = new THREE.Mesh(RING_GEO, mat);
    mesh.position.set(x, 0.12, z);
    this.scene.add(mesh);
    this.shocks.push({ mesh, mat, x, z, r: hostile ? 3 : 1, maxR, speed, hostile, hit: false, hitAllies: new Set(), dmg });
  }

  /* ───────────────────────── course flow ───────────────────────── */

  private beginCourse() {
    if (this.area !== 'farm' || this.mode !== 'intermission' || this.hunt) return;
    const c = COURSES[this.course];
    const A = this.A;
    // Purge any still-animating fallen hogs before snapshotting survivors
    this.allies = this.allies.filter((a) => {
      if (a.dying > 0 || a.hp <= 0) {
        a.hpBar.mat.dispose();
        this.discard(a.m.root);
        return false;
      }
      return true;
    });
    this.snapshot = {
      levels: { ...this.levels },
      repairCount: this.repairCount,
      truffles: this.truffles,
      edibleHp: this.world.edibles.map((e) => e.hp),
      squad: this.allies.map((a) => ({ name: a.name, tint: a.tint, hp: a.hp, maxHp: a.maxHp })),
      fallen: this.stats.fallen,
      ko: this.stats.ko,
    };
    this.courseFallen = 0;
    this.mode = 'combat';
    A.active = true;
    A.x = 0;
    A.y = 0;
    A.z = 68;
    A.heading = PI;
    A.hp = A.maxHp = c.hp;
    A.state = 'enter';
    A.t = 0;
    A.poise = 0;
    A.poiseMax = 125 + 32 * this.course;
    A.poiseDelay = 0;
    A.cdSwipe = 0;
    A.cdSlam = 2.2;
    A.cdThrow = 2.8;
    A.cdDash = 4.5;
    A.cdSummon = 6.5;
    A.globalCd = 0.8;
    A.decideT = 0;
    A.hunger = c.hunger * 0.72;
    A.target = null;
    A.enraged = false;
    A.dropAcc = 0;
    A.stunImmune = 0;
    A.slamChain = 0;
    A.swipes = 0;
    A.volleys = 0;
    A.avoidT = 0;
    A.flash = 0;
    A.phase = 0;
    A.phases = c.phases;
    A.shielded = false;
    A.exposed = 0;
    A.immuneCd = 0;
    A.cdGuard = 4;
    A.cdRain = 5.5;
    A.cdSpin = 7;
    A.rainLeft = 0;
    this.waveT = 4.5; // first vanguard of kitchen enemies rushes through the gate early!
    this.kingZapT = 3.2;
    this.clearStageProps();
    this.aModel.root.visible = true;
    this.aModel.pivot.rotation.set(0, 0, 0);
    this.aModel.pivot.scale.setScalar(1);
    this.tod = Math.min(this.course, TODS.length - 1);
    this.bellSwing = 1;
    this.barkT = 10;
    this.sfx.play('bell');
    this.showBanner(
      `COURSE ${this.course + 1}/${COURSES.length} · ${c.name.toUpperCase()}`,
      c.newFoe ?? 'Allen B. Hwang is at the gate',
    );
    this.say('Allen', c.intro, 4.4);
    this.autoYaw = { to: Math.atan2(-(A.x - this.k.x), -(60 - this.k.z)), t: 1.3 };
  }

  private defeatAllen() {
    const A = this.A;
    A.hp = 0;
    A.shielded = false;
    A.exposed = 0;
    this.clearStageProps();
    this.setA('defeated');
    for (const b of this.bots) {
      this.parts.emit(b.x, 1, b.z, 12, 0xff7a1a, 8, 0.3, 0.6);
      this.discardBot(b);
    }
    this.bots = [];
    for (const p of this.projs) this.discard(p.mesh);
    this.projs = [];
    for (const pd of this.puddles) {
      this.scene.remove(pd.mesh);
      pd.mat.dispose();
    }
    this.puddles = [];
    const last = this.course >= COURSES.length - 1;
    const farm = this.farmPct();
    const bonus = 28 + 14 * this.course + Math.round(farm / 6);
    this.truffles += bonus;
    this.stats.earned += bonus;
    this.sfx.play('bighit');
    this.hitstop = 0.28;
    this.addShake(1);
    this.parts.hitBurst(A.x, 3.0, A.z, 0xffc93c, 2.4);
    this.parts.shockWall(A.x, 0.1, A.z, 0xffb347, 1.8, 12, 1.4, 4.4, 0.65, 5);
    this.parts.shockWall(A.x, 0.1, A.z, 0x7df9ff, 1.2, 8.5, 2.0, 5.2, 0.52, -7);
    this.parts.sparks(A.x, 3, A.z, 55, 0xffd23f, 18, 0.24, 0.9, { grav: 14, up: 1.0, hdr: 4.5, stretch: 5.2, altColor: 0xff7a1a });
    this.parts.dustRing(A.x, 0.1, A.z, 16, 1.6, 0xe8d9be, 10, 2.6, 0.95);
    this.say('Allen', last ? "Fine… FINE! I'll… I'll try the tofu." : pick(["I'll be back with hotter woks!", "This isn't over, bacon!", 'Next course is gonna HURT, Kenji!']), 4.5);
    const lossNote = this.courseFallen > 0 ? ` · ${this.courseFallen} hog${this.courseFallen > 1 ? 's' : ''} fallen` : '';
    this.showBanner(last ? 'THE GRAND FEAST IS OVER' : 'COURSE CLEARED', `+${bonus} truffles · farm ${Math.round(farm)}%${lossNote}`);
  }

  private endCourse() {
    this.A.active = false;
    this.A.state = 'gone';
    this.aModel.root.visible = false;
    this.mode = 'intermission';
    this.course++;
    this.tod = Math.min(this.course, TODS.length - 1);
    // modest breather heal — dead hogs stay dead, surviving hogs patch up +18 HP
    this.k.hp = Math.min(this.k.maxHp, this.k.hp + 20);
    this.healSurvivors(18);
    this.scatterTruffles(7);
    this.greeted = { rickley: false, kingger: false, trout: false };
    this.say(
      this.course === 1 ? 'Trout' : 'Kingger',
      this.course === 1
        ? "Psst! Over at the lake, porkchop! Come to the dock — I'll teach you combos that'll fold Hwang in half."
        : pick(['Data suggests he returns hungrier. Upgrades are advised.', 'I logged his attack patterns. Come by the lab.', "Technically that was only a tactical retreat. He'll be back."]),
      5.2,
    );
  }

  private gameOver(reason: GameOverReason) {
    if (this.overReason) return;
    this.overReason = reason;
    this.overTimer = reason === 'farm' ? 1.4 : 1.8;
    if (reason === 'farm') this.say('Allen', 'Mmm. Compliments to the farmer.', 4);
  }

  /* ───────────────────────── main loop ───────────────────────── */

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = now - this.last;
    const dt = Math.min(0.05, Math.max(0, raw / 1000));
    this.last = now;
    this.time += dt;
    this.updateGamepad(now, dt);
    if (this.screen === 'play') this.updatePlay(dt);
    else this.updateIdle(dt);
    this.updateSky(dt);
    this.gfx.render(dt, this.time);
    this.watchPerformance(raw);
  };

  private updateIdle(dt: number) {
    if (this.screen === 'title') {
      const a = this.time * 0.07 + 0.5;
      this.camera.position.set(Math.sin(a) * 44, 17 + Math.sin(this.time * 0.11) * 3, 8 + Math.cos(a) * 44);
      this.camera.lookAt(0, 3, 2);
      this.world.update(this.time, dt, []);
      this.animateNpcs(dt);
      this.kModel.tail.rotation.z = Math.sin(this.time * 9) * 0.3;
      this.aModel.pivot.position.y = Math.sin(this.time * 2) * 0.06;
    } else if (this.screen === 'gameover' || this.screen === 'victory') {
      this.yaw += dt * 0.15;
      this.world.update(this.time, dt, []);
      this.animateNpcs(dt);
      if (this.screen === 'victory') {
        this.k.y = Math.abs(Math.sin(this.time * 6)) * 0.9;
        this.animateKenji(dt);
      }
      this.updateCamera(dt);
      this.parts.update(dt, this.camera);
    }
    this.arrow.style.display = 'none';
  }

  private updatePlay(dt: number) {
    const k = this.k;
    if (this.opening) {
      this.opening.t -= dt;
      if (this.opening.t <= 0) {
        this.advanceOpening();
      }
      this.pressed.clear();
      this.updateOpeningCutscene(dt);
      this.world.update(this.time, dt, []);
      this.parts.update(dt, this.camera);
      return;
    }
    /* camera input */
    const sens = 0.0023;
    const pad = this.padActive ? this.padFrame : null;
    const turn = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    const tilt = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    const padYaw = pad ? Math.sign(pad.lookX) * Math.pow(Math.abs(pad.lookX), 1.28) : 0;
    const padPitch = pad ? Math.sign(pad.lookY) * Math.pow(Math.abs(pad.lookY), 1.28) : 0;
    if (this.autoYaw) {
      if (Math.abs(this.mdx) > 30 || turn || Math.abs(padYaw) > 0.07) this.autoYaw = null;
      else {
        this.yaw = angLerp(this.yaw, this.autoYaw.to, 4 * dt);
        this.autoYaw.t -= dt;
        if (this.autoYaw.t <= 0) this.autoYaw = null;
      }
    }
    this.yaw += (turn * 2.4 - padYaw * 3.15) * dt - this.mdx * sens;
    this.pitch = clamp(this.pitch + (tilt * 1.2 + padPitch * 1.8) * dt + this.mdy * sens, 0.05, 1.25);
    this.mdx = 0;
    this.mdy = 0;
    if (!this.locked && !pad) {
      const ix = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      this.yaw -= ix * 0.9 * dt;
    }

    let sdt = dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      sdt = dt * 0.05;
    }
    if (this.mode === 'combat' || this.bots.some((b) => b.kind === 'guppy' && b.behavior !== 'waiting' && b.behavior !== 'returning')) {
      this.stats.time += dt;
    }

    this.updateKenji(sdt);
    this.updateAllen(sdt);
    this.updateBots(sdt);
    this.updateProjectiles(sdt);
    this.sniffCd = Math.max(0, this.sniffCd - dt);
    this.sniffTime = Math.max(0, this.sniffTime - dt);
    if (this.area === 'forest' && this.pressed.has('KeyR')) this.listenForHogs();
    this.updateWild(sdt);
    this.updateAllies(sdt);
    this.updatePuddles(sdt);
    this.updateMemorials(sdt);
    this.updatePots(sdt);
    this.updateHazards(sdt);
    this.updateShocks(sdt);
    this.updateTurret(sdt);
    this.updatePickups(sdt);
    this.updateInteract();
    this.pressed.clear();

    this.animateKenji(sdt);
    this.animateAllen(sdt);
    this.animateNpcs(dt);
    const scare = [{ x: k.x, z: k.z }];
    if (this.A.active) scare.push({ x: this.A.x, z: this.A.z });
    if (this.area === 'forest') this.forest?.update(this.time);
    else this.world.update(this.time, dt, scare);
    this.emitAmbientCombatFx(sdt);
    this.updateCamera(dt);
    this.parts.update(sdt, this.camera);
    this.updateArrow();

    // bell swing + lakeside sparring dummy spring wobble
    this.bellSwing = Math.max(0, this.bellSwing - dt * 0.5);
    this.world.bellPivot.rotation.z = Math.sin(this.time * 12) * this.bellSwing * 0.6;
    this.dummyCoachCd = Math.max(0, this.dummyCoachCd - dt);
    if (this.dummyWobble > 0) {
      this.dummyWobble = Math.max(0, this.dummyWobble - dt * 1.6);
      const tilt = Math.sin((1 - this.dummyWobble) * 22) * this.dummyWobble * 0.52;
      // rotate dummy around world impulse mapped into dummy local frame (dummyPivot.rotation.y = -0.7)
      const cy = Math.cos(0.7);
      const sy = Math.sin(0.7);
      const lx = this.dummyDx * cy + this.dummyDz * sy;
      const lz = -this.dummyDx * sy + this.dummyDz * cy;
      this.world.dummyPivot.rotation.x = lz * tilt;
      this.world.dummyPivot.rotation.z = -lx * tilt;
    } else {
      this.world.dummyPivot.rotation.x = 0;
      this.world.dummyPivot.rotation.z = 0;
    }

    // timers
    if (this.subtitle) {
      this.subtitle.t -= dt;
      if (this.subtitle.t <= 0) this.subtitle = null;
    }
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    if (this.mode === 'combat' && this.A.active && !this.overReason) {
      this.barkT -= dt;
      if (this.barkT <= 0 && !this.subtitle) {
        this.barkT = rand(11, 18);
        const st = this.A.state;
        if (st === 'chase' || st === 'recover')
          this.say(
            'Allen',
            pick([
              'Come here, little samgyeopsal!',
              'Crispy outside, tender inside…',
              "You'd pair so well with kimchi.",
              'Just one bite. ONE!',
              'Stop running — you are tenderizing yourself!',
              'I can already hear the sizzle.',
            ]),
          );
      }
    }
    if (this.overTimer > 0) {
      this.overTimer -= dt;
      if (this.overTimer <= 0) {
        this.screen = 'gameover';
        this.sfx.play('lose');
        this.keys.clear();
        this.unlock();
        this.emit();
      }
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.08;
      this.emit();
    }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.1;
      this.drawMinimap();
    }
  }

  private updateSky(dt: number) {
    const t = this.area === 'forest' ? FOREST_TOD : TODS[this.tod];
    const s = 1 - Math.exp(-0.9 * dt);
    const L = this.lit;
    for (const key of LIT_KEYS) L[key] = lerp(L[key], t[key], s);
    this.sun.color.lerp(this.tmpC.setHex(t.sun), s);
    this.sun.intensity = L.sunI;
    this.hemi.color.lerp(this.tmpC.setHex(t.hemiSky), s);
    this.hemi.groundColor.lerp(this.tmpC.setHex(t.hemiGround), s);
    this.hemi.intensity = L.hemiI;
    this.fogColor.lerp(this.tmpC.setHex(t.fog), s);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.fogColor);
    fog.density = L.fogD;
    this.skyTint.lerp(this.tmpC.setHex(t.tint), s);
    const sm = this.stars.material as THREE.PointsMaterial;
    sm.opacity = lerp(sm.opacity, t.stars, s);
    this.world.windowMat.emissiveIntensity = L.win;
    // clouds are seen from below, so let them glow with the colour of the sun or moon
    this.world.cloudMat.emissive.copy(this.sun.color);
    this.world.cloudMat.emissiveIntensity = L.sunI * 0.2;
    const ce = Math.cos(L.elev);
    const dir = this.sunDir.set(ce * Math.sin(SUN_AZ), Math.sin(L.elev), ce * Math.cos(SUN_AZ));
    const fx = this.screen === 'title' ? 0 : this.k.x;
    const fz = this.screen === 'title' ? 6 : this.k.z;
    this.sun.position.set(fx + dir.x * 100, dir.y * 100, fz + dir.z * 100);
    this.sun.target.position.set(fx, 0, fz);
    const half = this.screen === 'title' ? 62 : 38;
    const sc = this.sun.shadow.camera;
    if (sc.right !== half) {
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
    this.gfx.setSky({ dir, turbidity: L.turb, rayleigh: L.ray, mie: L.mie, mieG: L.mieG, gain: L.gain, tint: this.skyTint, exposure: L.expo }, dt);
    tickNature(this.time, this.camera);
  }

  /** Subtle continuous auras and trails that sell combat states (Focus, high Combo Flow, Hangry, Exposed, Sauce Shield). */
  private emitAmbientCombatFx(dt: number) {
    if (dt <= 0) return;
    const k = this.k;
    const A = this.A;
    // Kenji Perfect-Dodge Focus aura: rising cyan glints
    if (k.focus > 0 && Math.random() < dt * 26) {
      this.parts.motes(k.x, k.y + 0.55, k.z, 1, 0x6ff7ff, 2.2, 0.14, 0.52, -2.5, 5, 0.75, 3.8);
    }
    // Kenji Lightning Zap static overcharge: crackling electric sparks around his tusks
    if (k.zapAura > 0 && Math.random() < dt * 28) {
      this.parts.sparks(k.x, k.y + 0.85, k.z, 1, 0x62f4ff, 6.5, 0.12, 0.22, { grav: 2, hdr: 4.4, stretch: 4.5, altColor: 0xffe87a });
    }
    // Kingger's Tesla coil crackles brighter once Lightning Zap is unlocked
    if (this.area === 'farm' && this.levels.zap > 0 && Math.random() < dt * (4 + this.levels.zap * 3)) {
      this.parts.sparks(33.5, 3.35, 29.5, 1, 0x62f4ff, 5.5, 0.13, 0.24, { grav: 1, hdr: 4.2, altColor: 0xffffff });
    }
    // Kenji hot Combo Flow streak (4+ hits): orbiting golden/aqua sparks
    if (k.flowCount >= 4 && k.flowTimer > 0 && Math.random() < dt * 18) {
      const col = k.flowCount >= 7 ? 0x5ff2ff : 0xffd24d;
      this.parts.motes(k.x, k.y + 0.6, k.z, 1, col, 2.0, 0.13, 0.5, -2.0, 6, 0.85, 3.5);
    }
    // Kenji trot footstep dust puffs on dirt/grass when moving briskly
    if (k.grounded && k.action === 'none' && Math.hypot(k.vx, k.vz) > 8 && Math.random() < dt * 8) {
      this.parts.dust(k.x, k.y + 0.12, k.z, 1, k.muddy > 0 ? 0x6b4a33 : 0xe4d7be, { spread: 0.25, speed: 1.2, rise: 0.8, size0: 0.24, size1: 0.82, life: 0.36 });
    }
    if (A.active && A.hp > 0) {
      // Allen Hangry aura: rising fiery embers & steam
      if (A.enraged && Math.random() < dt * 24) {
        this.parts.motes(A.x, A.y + 1.4 + Math.random() * 2.2, A.z, 1, Math.random() < 0.5 ? 0xff4a1f : 0xffb83d, 3.2, 0.18, 0.65, -3.5, 3, 1.5, 4.0);
      }
      // Allen Exposed aura: cracked shimmering cyan sparks
      if (A.exposed > 0 && Math.random() < dt * 22) {
        this.parts.motes(A.x, A.y + 1.5 + Math.random() * 2.4, A.z, 1, 0x62f4ff, 2.8, 0.17, 0.55, -2.2, -4, 1.55, 3.8);
      }
      // Sauce Shield & bubbling sauce jars
      if (A.shielded && Math.random() < dt * 22) {
        this.parts.motes(A.x, A.y + 1.8, A.z, 1, 0xffaa38, 3.0, 0.17, 0.65, -3.0, 5, 3.2, 3.6);
      }
      for (const p of this.pots) {
        if (Math.random() < dt * 12) {
          this.parts.motes(p.x, 1.9, p.z, 1, 0xff6a24, 1.8, 0.14, 0.6, -2.8, 2, 0.42, 3.8);
        }
      }
    }
    // Grillbot glowing charcoal embers
    for (const b of this.bots) {
      if (Math.random() < dt * 10) {
        this.parts.motes(b.x, 1.0, b.z, 1, 0xff7a1a, 1.6, 0.11, 0.45, -2.5, 0, 0.35, 3.6);
      }
    }
  }

  private updateOpeningCutscene(dt: number) {
    if (!this.opening) return;
    const step = this.opening.step;
    const p = clamp(1 - this.opening.t / 4.8, 0, 1);
    const cam = this.camera;
    let tx = 0, ty = 2, tz = 6, cx = 16, cy = 11, cz = -8;

    // Keep every permanent actor at its real world location. The cutscene only moves the camera.
    this.kModel.root.position.set(SPOT.start.x, 0, SPOT.start.z);
    this.kModel.root.rotation.y = PI;
    this.rick.root.position.set(SPOT.rickley.x, 0, SPOT.rickley.z);
    this.king.root.position.set(SPOT.kingger.x, 0, SPOT.kingger.z);
    this.trout.root.position.set(SPOT.trout.x, 0, SPOT.trout.z);

    this.kModel.pivot.position.y = 0.75 + Math.abs(Math.sin(this.time * 7)) * 0.12;
    this.kModel.tail.rotation.z = Math.sin(this.time * 9) * 0.45;

    if (step === 0) {
      tx = SPOT.gate.x;
      ty = 3;
      tz = SPOT.gate.z - 8;
      cx = 18;
      cy = 9;
      cz = 38;
      this.aModel.root.position.set(0, 0, 52 - p * 6);
      this.aModel.root.rotation.y = PI;
      this.aModel.armR.rotation.x = -1.1 - Math.sin(this.time * 6) * 0.32;
      this.aModel.armL.rotation.x = -0.7 + Math.sin(this.time * 6) * 0.24;
      const pigPositions = [[-4.5, 43], [2.2, 45], [5.2, 40]];
      this.openingPigs.forEach((pig, i) => {
        pig.root.visible = true;
        const [px, pz] = pigPositions[i];
        pig.root.position.set(px, 0, pz - p * 5);
        pig.root.rotation.y = PI + Math.sin(this.time * 3 + i) * 0.18;
        pig.pivot.position.y = 0.75 + Math.abs(Math.sin(this.time * 8 + i)) * 0.1;
        pig.tail.rotation.z = Math.sin(this.time * 10 + i) * 0.5;
      });
    } else if (step === 1) {
      tx = SPOT.rickley.x;
      ty = 2.4;
      tz = SPOT.rickley.z;
      cx = SPOT.rickley.x - 10;
      cy = 6;
      cz = SPOT.rickley.z - 13;
      this.aModel.root.position.set(SPOT.rickley.x + 5, 0, SPOT.rickley.z + 5);
      this.aModel.root.rotation.y = -0.7;
      this.aModel.armR.rotation.x = -1.2 - Math.sin(this.time * 5) * 0.3;
      this.aModel.armL.rotation.x = -0.8 + Math.sin(this.time * 5) * 0.24;
      this.rick.root.rotation.y = 0.8;
      this.rick.armR.rotation.z = -0.35 - Math.sin(this.time * 3) * 0.18;
      this.rick.armL.rotation.z = 0.35 + Math.sin(this.time * 3) * 0.18;
      this.openingPigs.forEach((pig, i) => {
        pig.root.visible = i === 0;
        pig.root.position.set(SPOT.rickley.x + 3.1, 0, SPOT.rickley.z + 1.2);
        pig.root.rotation.y = PI + Math.sin(this.time * 2) * 0.12;
        pig.pivot.position.y = 0.75 + Math.abs(Math.sin(this.time * 6)) * 0.09;
      });
    } else if (step === 2) {
      tx = SPOT.rickley.x;
      ty = 2.4;
      tz = SPOT.rickley.z;
      cx = SPOT.rickley.x - 9;
      cy = 6;
      cz = SPOT.rickley.z - 13;
      this.rick.root.rotation.y = 0.8;
      this.rick.armR.rotation.z = -0.35 - Math.sin(this.time * 3) * 0.18;
      this.rick.armL.rotation.z = 0.35 + Math.sin(this.time * 3) * 0.18;
      this.kModel.root.position.set(SPOT.rickley.x - 1.8, 0, SPOT.rickley.z + 3);
      this.kModel.root.rotation.y = 0.3;
      this.openingPigs.forEach((pig, i) => {
        pig.root.visible = i === 0;
        pig.root.position.set(SPOT.rickley.x + 3.1, 0, SPOT.rickley.z + 1.2);
        pig.root.rotation.y = PI;
      });
    } else if (step === 3) {
      tx = SPOT.kingger.x;
      ty = 3;
      tz = SPOT.kingger.z;
      cx = SPOT.kingger.x - 11;
      cy = 8;
      cz = SPOT.kingger.z - 12;
      this.king.root.rotation.y = -0.55;
      this.king.armR.rotation.z = -0.9 - Math.sin(this.time * 6) * 0.35;
      this.king.armL.rotation.z = 0.12;
      this.kModel.root.position.set(SPOT.kingger.x - 2.2, 0, SPOT.kingger.z - 4);
      this.kModel.root.rotation.y = -0.6;
      this.openingPigs.forEach((pig) => { pig.root.visible = false; });
      if (Math.random() < dt * 38) this.parts.sparks(SPOT.kingger.x - 0.5, 3.5, SPOT.kingger.z - 0.2, 1, 0x62f4ff, 6.5, 0.13, 0.24, { grav: 1, hdr: 4.2, altColor: 0xffffff });
    } else {
      tx = 0;
      ty = 2.2;
      tz = 0;
      cx = 24;
      cy = 14;
      cz = -28;
      this.kModel.root.position.set(SPOT.start.x, 0, SPOT.start.z);
      this.kModel.root.rotation.y = PI;
      this.rick.root.rotation.y = 0.2;
      this.king.root.rotation.y = -0.2;
      this.aModel.root.position.set(0, 0, 28);
      this.aModel.root.rotation.y = PI;
      this.openingPigs.forEach((pig) => { pig.root.visible = false; });
    }

    cam.position.lerp(this.tmp.set(cx, cy, cz), 1 - Math.exp(-3.5 * dt));
    cam.lookAt(tx, ty, tz);
  }

  private updateCamera(dt: number) {
    const k = this.k;
    const A = this.A;
    this.camTarget.lerp(this.tmp.set(k.x, 1.5 + k.y * 0.6, k.z), 1 - Math.exp(-12 * dt));
    let want = 10.5;
    if (A.active && this.screen === 'play') want += clamp((Math.hypot(A.x - k.x, A.z - k.z) - 6) * 0.14, 0, 4);
    this.camDist = lerp(this.camDist, want, 1 - Math.exp(-3 * dt));
    const cp = Math.cos(this.pitch);
    const cam = this.camera;
    const vx = Math.sin(this.yaw) * cp;
    const vy = Math.sin(this.pitch);
    const vz = Math.cos(this.yaw) * cp;
    // pull the camera in when a building or post sits between it and Kenji
    let clip = 20;
    scan: for (let d = 1.5; d <= this.camDist; d += 0.7) {
      const px = this.camTarget.x + vx * d;
      const py = this.camTarget.y + vy * d;
      const pz = this.camTarget.z + vz * d;
      for (const c of this.activeColliders()) {
        if (!c.enabled || py > c.h + 0.3) continue;
        const inside = c.kind === 'c' ? Math.hypot(px - c.x, pz - c.z) < c.r + 0.5 : Math.abs(px - c.x) < c.hx + 0.5 && Math.abs(pz - c.z) < c.hz + 0.5;
        if (inside) {
          clip = Math.max(2.4, d - 0.9);
          break scan;
        }
      }
    }
    this.camClip = lerp(this.camClip, clip, 1 - Math.exp(-(clip < this.camClip ? 24 : 4) * dt));
    const dist = Math.min(this.camDist, this.camClip);
    cam.position.set(this.camTarget.x + vx * dist, this.camTarget.y + vy * dist, this.camTarget.z + vz * dist);
    if (this.shake > 0) {
      const s = this.reduceMotion ? 0 : this.shake * 0.7;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.4);
    }
    cam.lookAt(this.camTarget.x, this.camTarget.y + 0.9, this.camTarget.z);
  }

  private updateArrow() {
    const A = this.A;
    const el = this.arrow;
    const forest = this.area === 'forest';
    el.classList.toggle('trail-arrow', forest);
    if (!A.active && !forest) {
      el.style.display = 'none';
      return;
    }
    const v = this.tmp.set(forest ? FOREST_EXIT.x : A.x, forest ? 3 : A.y + 3, forest ? FOREST_EXIT.z : A.z).project(this.camera);
    const behind = v.z > 1;
    if (!behind && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.9) {
      el.style.display = 'none';
      return;
    }
    let dx = v.x;
    let dy = v.y;
    if (behind) {
      dx = -dx;
      dy = -dy;
    }
    const ang = Math.atan2(dy, dx);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const x = w / 2 + Math.cos(ang) * (w / 2 - 80);
    const y = h / 2 - Math.sin(ang) * (h / 2 - 110);
    el.style.display = 'block';
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${(-ang).toFixed(3)}rad)`;
    el.classList.toggle('eating', !forest && (A.state === 'eating' || A.state === 'toEat'));
  }

  /* ───────────────────────── Kenji ───────────────────────── */

  private nearestEnemy(maxD: number): { x: number; z: number } | null {
    const k = this.k;
    let best: { x: number; z: number } | null = null;
    let bd = maxD;
    const A = this.A;
    for (const p of this.pots) {
      const d = Math.hypot(p.x - k.x, p.z - k.z) - 0.6;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (A.active && !A.shielded && A.state !== 'leaving' && A.state !== 'ko' && A.y < 3) {
      const d = Math.hypot(A.x - k.x, A.z - k.z) - 1.6;
      if (d < bd) {
        bd = d;
        best = A;
      }
    }
    for (const b of this.bots) {
      const d = Math.hypot(b.x - k.x, b.z - k.z) - (b.kind === 'guppy' ? 0.75 : 0);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (this.area === 'forest') {
      for (const w of this.wild) {
        const d = Math.hypot(w.x - k.x, w.z - k.z);
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
    } else if (this.mode === 'intermission') {
      const d = Math.hypot(SPOT.dummy.x - k.x, SPOT.dummy.z - k.z);
      if (d < Math.min(bd, 5.8)) best = SPOT.dummy;
    }
    return best;
  }

  private flowBonusPct(): number {
    const k = this.k;
    if (k.flowCount < 2 || k.flowTimer <= 0) return 0;
    const per = this.levels.riverrush >= 2 ? 7 : 4;
    const cap = this.levels.riverrush >= 2 ? 42 : 24;
    return Math.min(cap, (k.flowCount - 1) * per);
  }

  private attackMul(): number {
    const tuskBonus = [0, 0.22, 0.44, 0.66, 0.9][Math.min(this.levels.tusks, 4)];
    return (1 + tuskBonus) * (1 + this.flowBonusPct() / 100) * (this.k.focus > 0 ? 1.35 : 1);
  }

  private recordCombo(move: string, chainAdd = 1) {
    const k = this.k;
    k.flowCount++;
    k.flowTimer = 3.5;
    k.flowMove = move;
    if (chainAdd > 0) {
      k.chainHits += chainAdd;
      k.rushWindow = 0.9;
    } else {
      k.chainHits = 0;
      k.rushWindow = 0;
    }
  }

  private strikeDummy(dmg: number, move: string, radius: number, fx = 0, fz = 0, coneMin = -2, callout?: string): boolean {
    if (this.area !== 'farm' || this.mode !== 'intermission') return false;
    const k = this.k;
    const dx = SPOT.dummy.x - k.x;
    const dz = SPOT.dummy.z - k.z;
    const d = Math.hypot(dx, dz) || 0.001;
    if (d > radius) return false;
    if (coneMin > -1 && (dx * fx + dz * fz) / d <= coneMin) return false;
    const rounded = Math.max(1, Math.round(dmg));
    this.dummyWobble = 1;
    this.dummyDx = dx / d;
    this.dummyDz = dz / d;
    this.parts.hitBurst(SPOT.dummy.x, 1.85, SPOT.dummy.z, callout ? 0x5ff2ff : 0xffd23f, callout ? 1.15 : 0.85, this.dummyDx, this.dummyDz);
    this.parts.chunks(SPOT.dummy.x, 1.75, SPOT.dummy.z, 7, 0xe3bd55, 7.5, 0.18, 0.5);
    this.floatText(SPOT.dummy.x + rand(-0.4, 0.4), 3.1, SPOT.dummy.z, String(rounded), callout ? 'crit' : 'dmg');
    if (callout === 'TAIL-WHIP!') this.floatText(SPOT.dummy.x, 3.85, SPOT.dummy.z, callout, 'info');
    if (this.dummyCoachCd <= 0 && (callout || k.flowCount >= 2)) {
      this.dummyCoachCd = 8.5;
      this.leapTrout();
      this.say(
        'Trout',
        pick([
          'Clean form, pig! Right in the orange shirt!',
          "Felt that splash from the lake! Hwang's shins are cooked.",
          'Flow like river water, hit like a cast-iron skillet!',
          "Now THAT'S Trout-Fu! Keep chaining those hits!",
        ]),
        3.2,
      );
    }
    void move;
    return true;
  }

  private aimKenji(mx: number, mz: number, moving: boolean, range = 6.5, cone = 1.4) {
    const k = this.k;
    if (moving) k.heading = Math.atan2(mx, mz);
    const e = this.nearestEnemy(range);
    if (e) {
      const to = Math.atan2(e.x - k.x, e.z - k.z);
      if (!moving || Math.abs(angDiff(k.heading, to)) < cone) k.heading = to;
    }
  }

  private beginAttack(mx: number, mz: number, moving: boolean) {
    const k = this.k;
    k.action = 'attack';
    k.t = 0;
    k.hitDone = false;
    k.hitDone2 = false;
    k.buffered = false;
    this.aimKenji(mx, mz, moving, 6.5, 1.4);
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    if (k.combo === 3) {
      const cycR = this.levels.cyclone >= 2 ? 4.3 : 3.5;
      this.sfx.play('splash');
      this.sfx.play('oink');
      this.spawnShock(k.x, k.z, this.levels.cyclone >= 2 ? 5.6 : 4.6, 26, false, 0);
      this.parts.slash({ x: k.x, y: k.y + 0.85, z: k.z, heading: k.heading, color: 0x3ae8ff, radius: cycR, full: true, spin: 16, dur: 0.46, rise: 1.4, hdr: 3.8 });
      this.parts.slash({ x: k.x, y: k.y + 1.35, z: k.z, heading: k.heading + PI, color: 0xffd24d, radius: cycR * 0.84, full: true, tiltZ: 0.2, spin: 19, dur: 0.48, rise: 1.9, hdr: 3.5 });
      this.parts.shockWall(k.x, k.y + 0.1, k.z, 0x4be3ff, 1.1, cycR * 1.18, 0.7, 2.5, 0.42, 9);
      this.parts.waterBurst(k.x, k.y + 0.6, k.z, 1.15, 9);
      this.floatText(k.x, 2.55, k.z, 'TROUT CYCLONE!', 'info');
    } else if (k.combo === 2) {
      // 3rd-hit Tusk Smash: blazing crimson-gold heavy cleave + wind-up sparks
      this.sfx.play('oink');
      this.parts.slash({
        x: k.x + fx * 0.65,
        y: k.y + 1.05,
        z: k.z + fz * 0.65,
        heading: k.heading,
        color: this.k.focus > 0 ? 0x62f4ff : 0xff9d2e,
        radius: 2.95,
        wide: true,
        tiltZ: 0.42,
        tiltX: 0.18,
        spin: 9.5,
        dur: 0.3,
        hdr: 4.0,
      });
      this.parts.sparks(k.x + fx * 1.1, k.y + 1.0, k.z + fz * 1.1, 10, 0xffd24d, 10, 0.14, 0.28, { dirX: fx, dirZ: fz, focus: 0.65, hdr: 3.8 });
    } else {
      // crisp alternating left/right slash arcs on combo hits 1 & 2
      this.sfx.play('swing');
      const dir = k.combo === 0 ? 1 : -1;
      const col = this.k.focus > 0 ? 0x6ff7ff : this.k.flowCount >= 3 ? 0xffc84a : 0xfff0c4;
      this.parts.slash({
        x: k.x + fx * 0.55,
        y: k.y + 0.92,
        z: k.z + fz * 0.55,
        heading: k.heading - dir * 0.25,
        color: col,
        radius: 2.25,
        tiltZ: 0.24 * dir,
        spin: 8.5 * dir,
        dur: 0.21,
        hdr: 3.2,
      });
    }
  }

  private beginUppercut(mx: number, mz: number, moving: boolean) {
    const k = this.k;
    k.action = 'uppercut';
    k.t = 0;
    k.hitDone = false;
    k.rollChain = 0;
    this.aimKenji(mx, mz, moving, 7.5, 1.7);
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    k.vy = 11.6;
    k.grounded = false;
    k.invuln = Math.max(k.invuln, 0.26);
    this.sfx.play('splash');
    this.sfx.play('oink');
    // steeply tilted rising corkscrew water-blade + geyser ring
    this.parts.slash({
      x: k.x + fx * 0.7,
      y: k.y + 0.9,
      z: k.z + fz * 0.7,
      heading: k.heading,
      color: 0x3ae8ff,
      radius: 2.9,
      wide: true,
      tiltZ: 1.05,
      spin: 12,
      dur: 0.34,
      rise: 6.8,
      hdr: 4.2,
    });
    this.parts.slash({
      x: k.x,
      y: k.y + 0.45,
      z: k.z,
      heading: k.heading + PI * 0.5,
      color: 0xc2fbff,
      radius: 2.2,
      full: true,
      tiltZ: 0.35,
      spin: 15,
      dur: 0.32,
      rise: 5.2,
      hdr: 3.4,
    });
    this.parts.shockWall(k.x, k.y + 0.08, k.z, 0x4fd6e8, 0.7, 2.8, 0.5, 3.4, 0.32, 10);
    this.parts.waterBurst(k.x + fx * 0.4, k.y + 0.5, k.z + fz * 0.4, 1.15, 7);
    this.parts.flash(k.x + fx * 0.6, k.y + 1.4, k.z + fz * 0.6, 0x4be3ff, 9, 0.24, 10);
    this.floatText(k.x, 2.6, k.z, 'UPSTREAM UPPERCUT!', 'info');
  }

  private beginBellyFlop() {
    const k = this.k;
    k.action = 'bellyflop';
    k.t = 0;
    k.hitDone = false;
    k.vy = 3.2;
    this.sfx.play('swing');
    this.parts.slash({ x: k.x, y: k.y + 0.9, z: k.z, heading: k.heading, color: 0x7df9ff, radius: 2.0, full: true, spin: -14, dur: 0.24, hdr: 3.6 });
    this.parts.sparks(k.x, k.y + 0.8, k.z, 12, 0x7df9ff, 8, 0.16, 0.3, { grav: 4, hdr: 3.8, altColor: 0xffffff });
  }

  private beginTailWhip() {
    const k = this.k;
    const lv = this.levels.tailwhip;
    k.stam = Math.max(0, k.stam - 14);
    k.stamDelay = 0.45;
    k.action = 'tailwhip';
    k.t = 0;
    k.hitDone = false;
    k.whipCd = lv >= 2 ? 1.5 : 2.3;
    k.invuln = Math.max(k.invuln, 0.22);
    const R = lv >= 2 ? 5.6 : 4.4;
    this.sfx.play('splash');
    this.sfx.play('swing');
    this.spawnShock(k.x, k.z, R, 30, false, 0);
    this.parts.slash({ x: k.x, y: k.y + 0.9, z: k.z, heading: k.heading, color: 0x3ef0ff, radius: R * 0.78, full: true, spin: -20, dur: 0.28, hdr: 4.0 });
    this.parts.slash({ x: k.x, y: k.y + 1.15, z: k.z, heading: k.heading + PI, color: 0xd8feff, radius: R * 0.62, wide: true, tiltZ: -0.18, spin: -22, dur: 0.24, hdr: 3.6 });
    this.parts.waterBurst(k.x, k.y + 0.75, k.z, lv >= 2 ? 1.15 : 0.9, -10);
    this.parts.flash(k.x, k.y + 1.2, k.z, 0x4ef0ff, 8, 0.2, 10);
  }

  private kenjiStrike() {
    const k = this.k;
    const A = this.A;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const mul = this.attackMul();
    const dmg = [12, 13, 24][k.combo] * mul;
    const poise = [9, 9, 24][k.combo];
    const moveName = ['Headbutt', 'Snout Jab', 'Tusk Smash'][k.combo] ?? 'Headbutt';
    let hit = false;
    if (A.active && A.y < 3) {
      const dx = A.x - k.x;
      const dz = A.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 4.5 && (dx * fx + dz * fz) / d > 0.15) {
        if (this.damageAllen(dmg, poise, { heavy: k.combo === 2 })) {
          hit = true;
          const ix = k.x + fx * 1.55;
          const iy = 1.45 + k.y;
          const iz = k.z + fz * 1.55;
          this.parts.hitBurst(ix, iy, iz, k.combo === 2 ? 0xff9a2e : 0xffe14d, k.combo === 2 ? 1.55 : 0.95, fx, fz);
          if (k.combo === 2) this.parts.dustRing(ix, 0.08, iz, 8, 0.6, 0xe8d9be, 5.5, 1.5, 0.5);
        }
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 2.9 + b.rad * 0.35 && (dx * fx + dz * fz) / d > 0) {
        this.damageBot(b, dmg, fx * 10, fz * 10, k.combo === 2);
        hit = true;
      }
    }
    if (this.hunt) {
      for (const w of [...this.wild]) {
        const dx = w.x - k.x;
        const dz = w.z - k.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d < 2.9 && (dx * fx + dz * fz) / d > 0) this.recruit(w);
      }
    }
    if (this.strikeDummy(dmg, moveName, 3.1, fx, fz, 0.05)) hit = true;
    if (this.hitPots(k.x, k.z, 3.4, dmg, fx, fz, 0.05)) hit = true;
    if (hit) {
      this.recordCombo(moveName);
      this.sfx.play(k.combo === 2 ? 'bighit' : 'hit');
      this.hitstop = k.combo === 2 ? 0.1 : 0.05;
      this.addShake(k.combo === 2 ? 0.5 : 0.22);
    }
  }

  private cycloneStrike(second: boolean) {
    const k = this.k;
    const A = this.A;
    const lv = this.levels.cyclone;
    const mul = this.attackMul();
    const dmg = (lv >= 2 ? 27 : 19) * mul;
    const poise = lv >= 2 ? 24 : 17;
    const rAllen = lv >= 2 ? 5.6 : 4.7;
    const rSmall = lv >= 2 ? 4.4 : 3.6;
    let hit = false;
    if (second) {
      this.spawnShock(k.x, k.z, rAllen, 30, false, 0);
      this.parts.slash({ x: k.x, y: k.y + 1.1, z: k.z, heading: k.heading, color: 0xffcf40, radius: rSmall * 1.05, full: true, spin: 20, dur: 0.3, rise: 1.2, hdr: 4.2 });
      this.parts.shockWall(k.x, k.y + 0.1, k.z, 0x62f4ff, 1.4, rAllen, 0.9, 2.9, 0.36, 12);
      this.parts.waterBurst(k.x, k.y + 0.85, k.z, 1.3, 12);
    } else {
      this.parts.sparks(k.x, 1.0 + k.y, k.z, 16, 0x4fd6e8, 12, 0.18, 0.4, { grav: 8, up: 0.5, hdr: 3.8, altColor: 0xffffff });
    }
    if (A.active && A.y < 3.2 && Math.hypot(A.x - k.x, A.z - k.z) < rAllen) {
      if (this.damageAllen(dmg, poise)) {
        hit = true;
        this.parts.hitBurst((k.x + A.x) * 0.5, 2.0, (k.z + A.z) * 0.5, second ? 0xffd23f : 0x4be3ff, second ? 1.55 : 1.1);
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < rSmall + b.rad * 0.3) {
        this.damageBot(b, dmg, (dx / d) * 15, (dz / d) * 15, second);
        hit = true;
      }
    }
    if (this.hunt) {
      for (const w of [...this.wild]) if (Math.hypot(w.x - k.x, w.z - k.z) < rSmall) this.recruit(w);
    }
    if (this.strikeDummy(dmg, 'Trout Cyclone', rSmall, 0, 0, -2, second ? 'CYCLONE!' : undefined)) hit = true;
    if (this.hitPots(k.x, k.z, rSmall + 0.6, dmg)) hit = true;
    if (hit) {
      this.recordCombo('Trout Cyclone');
      if (second && lv >= 2) k.chargeCd = Math.max(0, k.chargeCd - 1.5);
      this.sfx.play(second ? 'bighit' : 'hit');
      this.hitstop = second ? 0.11 : 0.05;
      this.addShake(second ? 0.6 : 0.3);
    }
  }

  private uppercutStrike() {
    const k = this.k;
    const A = this.A;
    const lv = this.levels.uppercut;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const dmg = (lv >= 2 ? 38 : 26) * this.attackMul();
    const poise = lv >= 2 ? 40 : 28;
    const reach = lv >= 2 ? 5.5 : 4.8;
    let hit = false;
    if (A.active && A.y < 4.5) {
      const dx = A.x - k.x;
      const dz = A.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < reach && (dx * fx + dz * fz) / d > -0.15) {
        if (this.damageAllen(dmg, poise)) {
          hit = true;
          const ix = k.x + fx * 1.6;
          const iz = k.z + fz * 1.6;
          this.parts.hitBurst(ix, 2.3 + k.y, iz, 0x5ff4ff, 1.65, fx * 0.5, fz * 0.5);
          this.parts.waterBurst(ix, 2.0 + k.y, iz, 1.1, 6);
        }
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < reach - 1.0 && (dx * fx + dz * fz) / d > -0.2) {
        this.damageBot(b, dmg * 1.15, fx * 15, fz * 15, true);
        hit = true;
      }
    }
    if (this.hunt) {
      for (const w of [...this.wild]) if (Math.hypot(w.x - k.x, w.z - k.z) < 3.5) this.recruit(w);
    }
    if (this.strikeDummy(dmg, 'Upstream Uppercut', 3.8, fx, fz, -0.2, 'UPPERCUT!')) hit = true;
    if (this.hitPots(k.x, k.z, 4.2, dmg, fx, fz, -0.2)) hit = true;
    if (hit) {
      this.recordCombo('Upstream Uppercut');
      if (lv >= 2) k.stam = Math.min(k.maxStam, k.stam + 15);
      this.sfx.play('bighit');
      this.hitstop = 0.11;
      this.addShake(0.6);
    }
  }

  private bellyFlopLand() {
    const k = this.k;
    const A = this.A;
    const lv = this.levels.bellyflop;
    const R = lv >= 2 ? 6.4 : 4.8;
    const dmg = (lv >= 2 ? 44 : 30) * this.attackMul();
    const poise = lv >= 2 ? 42 : 30;
    this.sfx.play('splash');
    this.sfx.play('slam');
    this.addShake(0.7);
    this.spawnShock(k.x, k.z, R, 28, false, 0);
    this.parts.shockWall(k.x, k.y + 0.05, k.z, 0x3ae8ff, 0.9, R * 1.05, 0.9, lv >= 2 ? 3.6 : 2.7, 0.45, 7);
    this.parts.shockWall(k.x, k.y + 0.05, k.z, 0xd8feff, 0.6, R * 0.72, 1.3, 3.2, 0.34, -9);
    this.parts.groundMark(k.x, k.y, k.z, R * 0.92, 'splash', 0x62f4ff, 2.2);
    this.parts.waterBurst(k.x, k.y + 0.4, k.z, lv >= 2 ? 2.0 : 1.5, 5);
    this.parts.dustRing(k.x, k.y, k.z, 12, 0.9, 0xc7f7ff, 8.5, 1.9, 0.6);
    this.parts.flash(k.x, k.y + 1.4, k.z, 0x4be3ff, 14, 0.34, 15);
    this.floatText(k.x, 2.4, k.z, lv >= 2 ? 'TIDAL FLOP!' : 'BELLY FLOP!', 'info');
    let hit = false;
    if (A.active && A.y < 3.5 && Math.hypot(A.x - k.x, A.z - k.z) < R + 1.4) {
      if (this.damageAllen(dmg, poise, { heavy: true })) {
        hit = true;
        this.parts.hitBurst((k.x + A.x) * 0.5, 2.2, (k.z + A.z) * 0.5, 0x62f4ff, 1.7);
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < R + b.rad * 0.3) {
        this.damageBot(b, dmg * 1.2, (dx / d) * 18, (dz / d) * 18, true);
        hit = true;
      }
    }
    if (this.hunt) {
      for (const w of [...this.wild]) if (Math.hypot(w.x - k.x, w.z - k.z) < R) this.recruit(w);
    }
    if (lv >= 2) {
      this.projs = this.projs.filter((p) => {
        if (!p.friendly && Math.hypot(p.x - k.x, p.z - k.z) < R + 1.2) {
          this.parts.emit(p.x, 1, p.z, 6, 0x7df9ff, 6, 0.22, 0.4);
          this.discard(p.mesh);
          return false;
        }
        return true;
      });
      // Tidal wave douses burning Sriracha chili puddles!
      this.puddles = this.puddles.filter((pd) => {
        if (Math.hypot(pd.x - k.x, pd.z - k.z) < R + pd.r * 0.6) {
          this.parts.dust(pd.x, 0.3, pd.z, 6, 0xd8f8ff, { spread: pd.r * 0.5, speed: 3, rise: 2.4, size0: 0.5, size1: 1.9, life: 0.5, glow: true });
          this.scene.remove(pd.mesh);
          pd.mat.dispose();
          return false;
        }
        return true;
      });
    }
    if (this.strikeDummy(dmg, 'Belly Flop', R, 0, 0, -2, 'BELLY FLOP!')) hit = true;
    if (this.hitPots(k.x, k.z, R + 0.6, dmg)) hit = true;
    if (hit) {
      this.recordCombo('Belly Flop');
      this.hitstop = 0.1;
    }
  }

  private tailWhipStrike() {
    const k = this.k;
    const A = this.A;
    const lv = this.levels.tailwhip;
    const R = lv >= 2 ? 5.6 : 4.4;
    const mul = this.attackMul();
    const dmg = (lv >= 2 ? 34 : 22) * mul;
    const poise = lv >= 2 ? 32 : 22;
    let hit = false;
    if (A.active && A.y < 3.2 && Math.hypot(A.x - k.x, A.z - k.z) < R + 1.2) {
      if (this.damageAllen(dmg, poise)) {
        hit = true;
        this.parts.hitBurst((k.x + A.x) * 0.5, 1.9, (k.z + A.z) * 0.5, 0x5ff2ff, 1.25);
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < R + b.rad * 0.3) {
        // Extra knockback sends hissing Kettle Bombers flying across the yard!
        const push = b.kind === 'bomber' ? 24 : 16;
        this.damageBot(b, dmg * 1.15, (dx / d) * push, (dz / d) * push);
        hit = true;
      }
    }
    if (this.hunt) {
      for (const w of [...this.wild]) if (Math.hypot(w.x - k.x, w.z - k.z) < R) this.recruit(w);
    }
    // deflect or reflect flying chopsticks!
    let deflected = 0;
    this.projs = this.projs.filter((p) => {
      if (p.friendly || Math.hypot(p.x - k.x, p.z - k.z) > R + 1.6) return true;
      deflected++;
      if (lv >= 2 && A.active && A.hp > 0 && p.y < 3.2) {
        p.friendly = true;
        const dx = A.x - p.x;
        const dz = A.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        p.y = 1.25;
        p.vx = (dx / d) * 38;
        p.vy = 0;
        p.vz = (dz / d) * 38;
        p.life = 2.6;
        p.dmg = 36 * mul;
        p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
        p.mesh.traverse((c) => {
          if (c instanceof THREE.Mesh) c.material = glow(0x7df9ff, 1.4);
        });
        this.parts.hitBurst(p.x, 1.2, p.z, 0x7df9ff, 1.35, dx / d, dz / d);
        this.parts.lightning(k.x, k.y + 1.0, k.z, p.x, 1.2, p.z, 0x7df9ff, 0.06, 0.2);
        return true;
      }
      this.parts.hitBurst(p.x, 1.15, p.z, 0x7df9ff, 0.9);
      this.discard(p.mesh);
      return false;
    });
    if (deflected > 0) {
      this.sfx.play('zap');
      this.floatText(k.x, 2.75, k.z, lv >= 2 ? 'RIPTIDE PARRY!' : 'DEFLECTED!', 'crit');
      this.recordCombo(lv >= 2 ? 'Riptide Parry' : 'Tail-Whip');
    }
    if (this.strikeDummy(dmg, 'Tail-Whip', R, 0, 0, -2, 'TAIL-WHIP!')) hit = true;
    if (this.hitPots(k.x, k.z, R + 0.6, dmg)) hit = true;
    if (hit) {
      this.recordCombo('Tail-Whip');
      this.sfx.play('hit');
      this.hitstop = 0.07;
      this.addShake(0.4);
    }
  }

  private updateKenji(dt: number) {
    const k = this.k;
    const lv = this.levels;
    const A = this.A;
    const keys = this.keys;
    const pressed = this.pressed;
    k.invuln = Math.max(0, k.invuln - dt);
    k.blink = Math.max(0, k.blink - dt);
    k.chargeCd = Math.max(0, k.chargeCd - dt);
    k.zapCd = Math.max(0, k.zapCd - dt);
    k.zapAura = Math.max(0, k.zapAura - dt);
    k.squealCd = Math.max(0, k.squealCd - dt);
    k.whipCd = Math.max(0, k.whipCd - dt);
    k.focus = Math.max(0, k.focus - dt);
    k.rollChain = Math.max(0, k.rollChain - dt);
    k.rushWindow = Math.max(0, k.rushWindow - dt);
    if (k.rushWindow <= 0) k.chainHits = 0;
    if (k.flowTimer > 0) {
      k.flowTimer -= dt;
      if (k.flowTimer <= 0) {
        k.flowCount = 0;
        k.flowMove = '';
      }
    }
    k.muddy = Math.max(0, k.muddy - dt);
    k.comboTimer -= dt;
    if (k.stamDelay > 0) k.stamDelay -= dt;
    else k.stam = Math.min(k.maxStam, k.stam + (30 + 10 * lv.trotters) * dt);

    const floor = this.area === 'farm' && isOnLakeDock(k.x, k.z) ? 0.23 : 0;

    if (k.action !== 'dead') {
      const pad = this.padActive ? this.padFrame : null;
      const ix = pad ? pad.moveX : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const iz = pad ? -pad.moveY : (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      let mx = fx * iz + rx * ix;
      let mz = fz * iz + rz * ix;
      const ml = Math.hypot(mx, mz);
      const moving = ml > 0;
      if (moving) {
        mx /= ml;
        mz /= ml;
      }
      const mud = SPOT.mud;
      const inMud = this.area === 'farm' && Math.hypot(k.x - mud.x, k.z - mud.z) < mud.r && k.y < 0.3;
      if (inMud) {
        if (k.muddy <= 0) this.floatText(k.x, 2.2, k.z, 'MUDDY! −15% damage', 'info');
        k.muddy = 14;
        // only heals during peaceful intermissions — no free infinite healing while fighting Allen!
        if (this.mode === 'intermission' && k.hp < k.maxHp) k.hp = Math.min(k.maxHp, k.hp + 3.5 * dt);
        if (moving && Math.random() < dt * 14) this.parts.emit(k.x, 0.2, k.z, 2, 0x5c4030, 4, 0.22, 0.5);
      }
      const speed = (10.5 + 0.7 * lv.trotters) * Math.min(ml, 1) * (inMud ? 0.72 : 1);

      const wantAttack = pressed.has('Mouse0') || pressed.has('KeyJ');
      const wantCharge = pressed.has('Mouse2') || pressed.has('KeyK');
      const wantRoll = pressed.has('ShiftLeft') || pressed.has('ShiftRight') || pressed.has('KeyL');
      const wantJump = pressed.has('Space');
      const wantZap = pressed.has('KeyQ') || pressed.has('KeyZ');
      const wantSqueal = pressed.has('KeyF');
      const wantWhip = pressed.has('KeyC');
      const maxCombo = lv.cyclone > 0 ? 3 : 2;
      const free = k.action === 'none';
      const canCancel =
        free ||
        (k.action === 'attack' && k.t > 0.1) ||
        (k.action === 'tailwhip' && k.t > 0.16) ||
        (k.action === 'uppercut' && k.t > 0.22) ||
        (k.action === 'bellyflop' && k.hitDone && k.t > 0.1);
      const rushEligible = lv.riverrush > 0 && k.rushWindow > 0 && k.chainHits >= 2;
      const canFireCharge = k.chargeCd <= 0 || (rushEligible && lv.riverrush >= 2 && k.chargeCd <= 2.5);

      if (wantRoll && canCancel) {
        if (k.stam >= 25) {
          k.stam = Math.max(0, k.stam - 28);
          k.stamDelay = 0.7;
          k.action = 'roll';
          k.t = 0;
          k.dodged = false;
          k.buffered = false;
          if (moving) {
            k.rdx = mx;
            k.rdz = mz;
          } else {
            k.rdx = Math.sin(k.heading);
            k.rdz = Math.cos(k.heading);
          }
          k.heading = Math.atan2(k.rdx, k.rdz);
          k.invuln = Math.max(k.invuln, 0.36);
          this.sfx.play('roll');
          this.parts.dust(k.x - k.rdx * 0.4, floor + 0.25, k.z - k.rdz * 0.4, 7, 0xeadec6, { spread: 0.45, speed: 3.6, rise: 1.5, size0: 0.45, size1: 1.75, life: 0.48 });
          this.parts.sparks(k.x, floor + 0.5, k.z, 6, 0xfff5d6, 9, 0.11, 0.22, { dirX: -k.rdx, dirY: 0.12, dirZ: -k.rdz, focus: 0.85, hdr: 2.8, stretch: 4.5, grav: 2 });
        } else {
          this.sfx.play('deny');
        }
      } else if (wantWhip && lv.tailwhip > 0 && canCancel) {
        if (k.whipCd <= 0 && k.stam >= 14) this.beginTailWhip();
        else this.sfx.play('deny');
      } else if (wantCharge && canCancel) {
        if (canFireCharge) {
          k.action = 'charge';
          k.t = 0;
          k.riverRush = rushEligible;
          k.chainHits = 0;
          k.rushWindow = 0;
          k.chargeHit.clear();
          this.dummyChargeHit = false;
          this.aimKenji(mx, mz, moving, 16, 0.9);
          k.chargeCd = 6 * (1 - 0.175 * lv.rocket);
          this.sfx.play('oink');
          if (k.riverRush) {
            this.sfx.play('splash');
            this.spawnShock(k.x, k.z, 4.4, 28, false, 0);
            this.parts.shockWall(k.x, floor + 0.08, k.z, 0x3ef0ff, 0.8, 3.8, 0.8, 2.6, 0.34, 10);
            this.parts.waterBurst(k.x, floor + 0.6, k.z, 1.25, 6);
            this.parts.flash(k.x, floor + 1.1, k.z, 0x45e6ff, 11, 0.26, 12);
            this.floatText(k.x, 2.65, k.z, 'RIVER RUSH!', 'crit');
          } else {
            this.sfx.play('roll');
            const launchCol = lv.rocket > 0 ? 0xff7a1a : 0xffe49e;
            this.parts.dustRing(k.x, floor, k.z, 8, 0.55, 0xeadcc2, 5.5, 1.5, 0.48);
            this.parts.sparks(k.x, floor + 0.55, k.z, lv.rocket > 0 ? 14 : 8, launchCol, 11, 0.15, 0.3, {
              dirX: -Math.sin(k.heading),
              dirY: 0.2,
              dirZ: -Math.cos(k.heading),
              focus: 0.72,
              hdr: 4.0,
              altColor: 0xffffff,
            });
            if (lv.rocket > 0) this.parts.flash(k.x, floor + 0.9, k.z, 0xff7a1a, 8, 0.2, 9);
          }
        } else {
          this.sfx.play('deny');
        }
      } else if (wantZap && canCancel && lv.zap > 0) {
        if (k.zapCd <= 0) this.doLightningZap();
        else this.sfx.play('deny');
      } else if (wantSqueal && canCancel && lv.squeal > 0) {
        if (k.squealCd <= 0) this.doSqueal();
        else this.sfx.play('deny');
      } else if (wantAttack) {
        // Upstream Uppercut: roll → attack (buffers early presses so Shift+LMB always feels crisp)
        if (lv.uppercut > 0 && k.action === 'roll') {
          if (k.t >= 0.12) this.beginUppercut(mx, mz, moving);
          else k.buffered = true;
        } else if (lv.uppercut > 0 && free && k.rollChain > 0) {
          this.beginUppercut(mx, mz, moving);
        } else if (
          // Tidal Belly Flop: airborne → attack (also chains right out of Uppercut!)
          lv.bellyflop > 0 &&
          !k.grounded &&
          k.y > floor + 0.4 &&
          (free || (k.action === 'uppercut' && k.t >= 0.13) || (k.action === 'attack' && k.t >= 0.13))
        ) {
          this.beginBellyFlop();
        } else if (free || (k.action === 'tailwhip' && k.t > 0.18)) {
          k.combo = k.comboTimer > 0 && k.combo < maxCombo ? k.combo + 1 : 0;
          this.beginAttack(mx, mz, moving);
        } else if (k.action === 'attack') {
          k.buffered = true;
        }
      }
      if (wantJump && k.grounded && (k.action === 'none' || k.action === 'attack' || k.action === 'tailwhip')) {
        k.vy = 12.5;
        k.grounded = false;
        this.sfx.play('jump');
      }

      switch (k.action) {
        case 'none': {
          const acc = (k.grounded ? 75 : 45) * dt;
          k.vx = approach(k.vx, mx * speed, acc);
          k.vz = approach(k.vz, mz * speed, acc);
          if (moving) k.heading = angLerp(k.heading, Math.atan2(mx, mz), 14 * dt);
          break;
        }
        case 'attack': {
          k.t += dt;
          if (k.combo === 3) {
            // 4th-hit Trout Cyclone: controllable spinning vortex that strikes twice
            const sp = k.t < 0.4 ? 11 : 4;
            if (moving) k.heading = angLerp(k.heading, Math.atan2(mx, mz), 6 * dt);
            k.vx = Math.sin(k.heading) * sp;
            k.vz = Math.cos(k.heading) * sp;
            if (!k.hitDone && k.t >= 0.1) {
              k.hitDone = true;
              this.cycloneStrike(false);
            }
            if (!k.hitDone2 && k.t >= 0.3) {
              k.hitDone2 = true;
              this.cycloneStrike(true);
            }
            if (k.t >= 0.52) {
              k.action = 'none';
              k.comboTimer = 0;
            }
          } else {
            const dur = k.combo === 2 ? 0.42 : 0.27;
            const lunge = k.t < 0.14 ? (k.combo === 2 ? 15 : 10) : 2;
            k.vx = Math.sin(k.heading) * lunge;
            k.vz = Math.cos(k.heading) * lunge;
            if (!k.hitDone && k.t >= 0.09) {
              k.hitDone = true;
              this.kenjiStrike();
            }
            if (k.t >= dur) {
              if (k.buffered && k.combo < maxCombo) {
                k.combo++;
                this.beginAttack(mx, mz, moving);
              } else {
                k.action = 'none';
                k.comboTimer = k.combo < maxCombo ? 0.5 : 0;
              }
            }
          }
          break;
        }
        case 'uppercut': {
          k.t += dt;
          const lunge = k.t < 0.18 ? 17 : 5;
          k.vx = Math.sin(k.heading) * lunge;
          k.vz = Math.cos(k.heading) * lunge;
          if (k.t < 0.22 && Math.random() < dt * 45) {
            this.parts.emit(k.x, k.y + 0.6, k.z, 1, 0x4fd6e8, 4, 0.22, 0.35, 6);
          }
          if (!k.hitDone && k.t >= 0.08) {
            k.hitDone = true;
            this.uppercutStrike();
          }
          if (k.t >= 0.4) k.action = 'none';
          break;
        }
        case 'bellyflop': {
          k.t += dt;
          if (!k.hitDone) {
            if (k.t >= 0.07) k.vy = -34;
            k.vx = Math.sin(k.heading) * 7.5;
            k.vz = Math.cos(k.heading) * 7.5;
            if (Math.random() < dt * 50) this.parts.emit(k.x, k.y + 0.5, k.z, 1, 0x7df9ff, 3, 0.24, 0.32, 3);
          } else {
            k.vx *= Math.exp(-12 * dt);
            k.vz *= Math.exp(-12 * dt);
            if (k.t >= 0.22) k.action = 'none';
          }
          break;
        }
        case 'tailwhip': {
          k.t += dt;
          k.vx = moving ? mx * 6 : k.vx * Math.exp(-10 * dt);
          k.vz = moving ? mz * 6 : k.vz * Math.exp(-10 * dt);
          if (!k.hitDone && k.t >= 0.06) {
            k.hitDone = true;
            this.tailWhipStrike();
          }
          if (k.t >= 0.28) {
            k.action = 'none';
            k.comboTimer = 0.45;
          }
          break;
        }
        case 'roll': {
          k.t += dt;
          const sp = k.t < 0.3 ? 22 : 10;
          k.vx = k.rdx * sp;
          k.vz = k.rdz * sp;
          if (k.buffered && lv.uppercut > 0 && k.t >= 0.14) {
            k.buffered = false;
            this.beginUppercut(mx, mz, moving);
          } else if (k.t >= 0.42) {
            k.action = 'none';
            if (lv.uppercut > 0) k.rollChain = 0.38;
          }
          break;
        }
        case 'charge': {
          k.t += dt;
          if (moving) k.heading = angLerp(k.heading, Math.atan2(mx, mz), 2.4 * dt);
          const hx = Math.sin(k.heading);
          const hz = Math.cos(k.heading);
          const rush = k.riverRush;
          const rushSp = rush ? 35 : 30;
          k.vx = hx * rushSp;
          k.vz = hz * rushSp;
          if (Math.random() < dt * 55) {
            this.parts.chargeTrail(k.x, floor, k.z, hx, hz, rush ? 'river' : lv.rocket > 0 ? 'rocket' : 'dust');
          }
          const rushMul = rush ? (lv.riverrush >= 2 ? 1.75 : 1.45) : 1;
          const cd = (38 + 14 * lv.rocket) * rushMul;
          const mul = this.attackMul();
          for (const b of [...this.bots]) {
            if (!k.chargeHit.has(b) && Math.hypot(b.x - k.x, b.z - k.z) < (rush ? 2.7 : 2.1) + b.rad * 0.4) {
              k.chargeHit.add(b);
              this.damageBot(b, (52 + 12 * lv.rocket) * rushMul * mul * 0.75, hx * 20, hz * 20, true);
              this.recordCombo(rush ? 'River Rush' : 'Hog Charge', 0);
              this.sfx.play(rush ? 'splash' : 'hit');
            }
          }
          if (this.hunt) for (const w of [...this.wild]) if (Math.hypot(w.x - k.x, w.z - k.z) < 2.4) this.recruit(w);
          if (this.hitPots(k.x, k.z, 2.8, cd * mul)) {
            this.recordCombo(rush ? 'River Rush' : 'Hog Charge', 0);
            this.sfx.play('hit');
            this.addShake(0.4);
          }
          if (!this.dummyChargeHit && this.strikeDummy(cd * mul, rush ? 'River Rush' : 'Hog Charge', 2.4, hx, hz, -1, rush ? 'RIVER RUSH!' : 'HOG CHARGE!')) {
            this.dummyChargeHit = true;
            this.recordCombo(rush ? 'River Rush' : 'Hog Charge', 0);
            this.sfx.play('bighit');
            this.hitstop = 0.11;
            this.addShake(rush ? 0.85 : 0.6);
            k.action = 'none';
            k.riverRush = false;
            k.vx = -hx * 8;
            k.vz = -hz * 8;
            k.vy = 6.5;
            k.grounded = false;
          }
          if (A.active && A.y < 3 && Math.hypot(A.x - k.x, A.z - k.z) < (A.shielded ? 4.3 : rush ? 3.2 : 2.9)) {
            if (this.damageAllen(cd * mul, rush ? 70 : 45, { heavy: true })) {
              this.recordCombo(rush ? 'River Rush' : 'Hog Charge', 0);
              this.sfx.play('bighit');
              if (rush) this.sfx.play('splash');
              this.hitstop = rush ? 0.16 : 0.13;
              this.addShake(rush ? 0.95 : 0.8);
              const ix = k.x + hx * 1.5;
              const iz = k.z + hz * 1.5;
              const hitCol = rush ? 0x4ef0ff : lv.rocket > 0 ? 0xff8a24 : 0xffe14d;
              this.parts.hitBurst(ix, 1.75, iz, hitCol, rush ? 2.15 : 1.75, hx, hz);
              this.parts.shockWall(ix, floor + 0.06, iz, hitCol, 0.9, rush ? 6.2 : 4.6, 0.9, rush ? 3.4 : 2.5, 0.38, rush ? 9 : 6);
              if (rush) {
                this.parts.waterBurst(ix, 1.5, iz, 1.65, 8);
                this.parts.groundMark(ix, floor, iz, 4.2, 'splash', 0x5ff2ff, 2.0);
              } else {
                this.parts.dustRing(ix, floor, iz, 10, 0.8, 0xeadcc2, 7.5, 1.8, 0.58);
              }
              this.floatText(A.x, 5.4, A.z, rush ? 'RIVER RUSH!' : 'HOG CHARGE!', rush ? 'crit' : 'info');
              if (lv.tesla > 0) this.teslaZap();
              k.action = 'none';
              k.riverRush = false;
              k.vx = -hx * 9;
              k.vz = -hz * 9;
              k.vy = 7;
              k.grounded = false;
              k.invuln = Math.max(k.invuln, 0.35);
            } else if (A.shielded || A.state === 'spin') {
              // bounce off his invincibility stage
              k.action = 'none';
              k.riverRush = false;
              k.vx = -hx * 11;
              k.vz = -hz * 11;
              k.vy = 6.5;
              k.grounded = false;
              this.addShake(0.4);
            }
          }
          if (k.action === 'charge' && k.t >= (rush ? 0.56 : 0.5)) {
            k.action = 'none';
            k.riverRush = false;
          }
          break;
        }
        case 'zap': {
          k.t += dt;
          k.vx *= Math.exp(-9 * dt);
          k.vz *= Math.exp(-9 * dt);
          if (k.t >= 0.28) {
            k.action = 'none';
            k.comboTimer = 0.48;
          }
          break;
        }
        case 'squeal': {
          k.t += dt;
          k.vx *= Math.exp(-10 * dt);
          k.vz *= Math.exp(-10 * dt);
          if (k.t >= 0.35) k.action = 'none';
          break;
        }
        case 'hurt': {
          k.t += dt;
          k.vx *= Math.exp(-5 * dt);
          k.vz *= Math.exp(-5 * dt);
          if (k.t >= 0.28) k.action = 'none';
          break;
        }
        default:
          break;
      }
    } else {
      k.t += dt;
      k.vx *= Math.exp(-6 * dt);
      k.vz *= Math.exp(-6 * dt);
    }

    // physics
    k.vy -= 34 * dt;
    k.y += k.vy * dt;
    if (k.y <= floor) {
      if (k.action === 'bellyflop' && !k.hitDone) {
        k.y = floor;
        k.vy = 0;
        k.grounded = true;
        k.hitDone = true;
        k.t = 0;
        this.bellyFlopLand();
      } else {
        if (!k.grounded && k.vy < -8) this.parts.emit(k.x, floor + 0.2, k.z, 5, 0xe9dfc8, 3, 0.22, 0.35, 3);
        k.y = floor;
        k.vy = 0;
        k.grounded = true;
      }
    }
    k.x += k.vx * dt;
    k.z += k.vz * dt;
    const r = this.resolve(k.x, k.z, 0.7);
    if (r.hit && k.action === 'charge' && k.t > 0.05) {
      k.action = 'none';
      this.sfx.play('hit');
      this.addShake(0.3);
    }
    const bound = this.mapBound();
    k.x = clamp(r.x, -bound, bound);
    k.z = clamp(r.z, -bound, bound);
    if (A.active && A.y < 2 && A.state !== 'leaving') {
      const dx = k.x - A.x;
      const dz = k.z - A.z;
      const d = Math.hypot(dx, dz);
      const pr = A.shielded ? 3.6 : 2.1;
      if (d < pr && d > 0.001) {
        k.x = A.x + (dx / d) * pr;
        k.z = A.z + (dz / d) * pr;
      }
    }
  }

  private zapCooldown(lv = this.levels.zap): number {
    return lv >= 3 ? 6.0 : lv >= 2 ? 7.5 : 9.5;
  }

  /**
   * Kingger's Lightning Zap [Q]: calls down a roaring sky & lab-coil thunderbolt onto the nearest target
   * (up to 24m away) and chains jagged lightning across up to 3/5/7 foes, sauce jars, or projectiles!
   */
  private doLightningZap() {
    const k = this.k;
    const lv = this.levels.zap;
    const A = this.A;
    k.action = 'zap';
    k.t = 0;
    k.zapCd = this.zapCooldown(lv);
    k.zapAura = 2.8 + lv * 0.6;
    k.invuln = Math.max(k.invuln, 0.2);

    const maxTargets = lv >= 3 ? 7 : lv >= 2 ? 5 : 3;
    const range = lv >= 3 ? 26 : lv >= 2 ? 23 : 20;
    const chainR = lv >= 3 ? 16 : 13;
    const mul = this.attackMul();
    const baseDmg = [0, 36, 52, 72][Math.min(lv, 3)] * mul;
    const basePoise = [0, 32, 46, 62][Math.min(lv, 3)];

    type ZapTarget = {
      kind: 'allen' | 'bot' | 'pot' | 'dummy' | 'wild';
      x: number;
      y: number;
      z: number;
      bot?: Bot;
      pot?: Pot;
      wild?: Wild;
    };
    const pool: ZapTarget[] = [];
    // Prioritize active Sauce Jars when Allen is shielded
    for (const p of this.pots) {
      if (p.hp > 0) pool.push({ kind: 'pot', x: p.x, y: 1.5, z: p.z, pot: p });
    }
    for (const b of this.bots) {
      if (b.hp > 0) pool.push({ kind: 'bot', x: b.x, y: b.kind === 'tenderizer' ? 1.8 : 1.15, z: b.z, bot: b });
    }
    if (A.active && A.hp > 0 && !A.shielded && A.state !== 'spin' && !['gone', 'defeated', 'leaving', 'ko'].includes(A.state)) {
      pool.push({ kind: 'allen', x: A.x, y: A.y + 2.8, z: A.z });
    }
    if (this.area === 'farm' && this.mode === 'intermission') {
      pool.push({ kind: 'dummy', x: SPOT.dummy.x, y: 1.9, z: SPOT.dummy.z });
    }
    if (this.hunt && this.area === 'forest') {
      for (const w of this.wild) pool.push({ kind: 'wild', x: w.x, y: 1.0, z: w.z, wild: w });
    }

    // Build sequential chain: pick closest target to Kenji within range, then hop across neighbors!
    const chain: ZapTarget[] = [];
    let curX = k.x;
    let curZ = k.z;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    while (chain.length < maxTargets && pool.length > 0) {
      const limit = chain.length === 0 ? range : chainR;
      let bestIdx = -1;
      let bestScore = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const t = pool[i];
        const dx = t.x - curX;
        const dz = t.z - curZ;
        const d = Math.hypot(dx, dz);
        if (d > limit) continue;
        // slightly prefer targets Kenji is facing & dangerous hissing bombers / sauce jars
        const align = chain.length === 0 && d > 0.1 ? (dx * fx + dz * fz) / d : 0;
        const prio =
          t.kind === 'pot' ? 0.72 : t.bot?.kind === 'bomber' && t.bot.mode === 'fuse' ? 0.65 : t.kind === 'allen' ? 0.88 : 1;
        const score = d * prio * (1 - align * 0.25);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      const chosen = pool.splice(bestIdx, 1)[0];
      chain.push(chosen);
      curX = chosen.x;
      curZ = chosen.z;
    }

    this.sfx.play('thunder');
    this.sfx.play('zap');
    this.addShake(lv >= 3 ? 0.8 : 0.58);

    // Relay arc from Kingger's Tesla Coil into Kenji when fighting on the farm!
    if (this.area === 'farm') {
      this.kingCast = 0.65;
      this.parts.lightning(SPOT.kingger.x, 2.5, SPOT.kingger.z, 33.5, 3.3, 29.5, 0x7df9ff, 0.075, 0.3);
      if (Math.hypot(k.x - 33.5, k.z - 29.5) < 42) {
        this.parts.lightning(33.5, 3.3, 29.5, k.x, k.y + 1.25, k.z, 0x62f4ff, 0.07, 0.26);
      }
    }
    this.parts.shockWall(k.x, k.y + 0.08, k.z, 0x5ff2ff, 0.7, 3.8 + lv * 0.6, 0.6, 2.4, 0.32, 14);
    this.parts.flash(k.x, k.y + 1.6, k.z, 0x5ff2ff, 11, 0.26, 13);
    this.floatText(k.x, k.y + 2.75, k.z, lv >= 3 ? '⚡ MEGA-ZAP!' : '⚡ LIGHTNING ZAP!', 'crit');

    if (chain.length > 0) {
      // Face the primary target
      k.heading = Math.atan2(chain[0].x - k.x, chain[0].z - k.z);
      let prevX = k.x;
      let prevY = k.y + 1.15;
      let prevZ = k.z;
      let hits = 0;

      chain.forEach((t, idx) => {
        const falloff = idx === 0 ? 1 : Math.max(0.62, 1 - idx * 0.1);
        const dmg = baseDmg * falloff;
        const boltCol = lv >= 3 && idx % 2 === 1 ? 0xffe46b : 0x5ff2ff;
        // Arc from previous link to this target
        this.parts.lightning(prevX, prevY, prevZ, t.x, t.y, t.z, boltCol, idx === 0 ? 0.11 : 0.085, 0.34);
        // Dramatic sky thunderbolt on the primary target (and on extra targets at Lv 3 Mega-Storm!)
        if (idx === 0 || (lv >= 3 && idx <= 2)) {
          this.parts.lightning(t.x + rand(-1.5, 1.5), t.y + 16, t.z + rand(-1.5, 1.5), t.x, t.y, t.z, 0xc8feff, idx === 0 ? 0.13 : 0.095, 0.38);
          this.parts.groundMark(t.x, 0, t.z, idx === 0 ? 3.8 : 2.6, 'crater', 0x62f4ff, 2.2);
          this.parts.shockWall(t.x, 0.08, t.z, boltCol, 0.7, idx === 0 ? 5.2 : 3.6, 0.7, 3.0, 0.36, 13);
        }
        this.parts.hitBurst(t.x, t.y, t.z, boltCol, idx === 0 ? 1.65 : 1.15);

        if (t.kind === 'allen') {
          if (this.damageAllen(dmg, basePoise * falloff, { heavy: lv >= 2, fx: prevX, fz: prevZ })) {
            hits++;
            if (lv >= 2) this.stunAllen(lv >= 3 ? 1.9 : 1.3, false);
          }
        } else if (t.kind === 'bot' && t.bot && t.bot.hp > 0) {
          t.bot.stun = Math.max(t.bot.stun, 1.4 + lv * 0.45);
          this.damageBot(t.bot, dmg * 1.25, 0, 0, true);
          hits++;
        } else if (t.kind === 'pot' && t.pot && t.pot.hp > 0) {
          t.pot.hitCd = 0;
          if (this.damagePot(t.pot, dmg * 1.1)) hits++;
        } else if (t.kind === 'dummy') {
          if (this.strikeDummy(dmg, 'Lightning Zap', 99, 0, 0, -2, 'LIGHTNING ZAP!')) hits++;
        } else if (t.kind === 'wild' && t.wild) {
          this.recruit(t.wild);
        }
        prevX = t.x;
        prevY = t.y;
        prevZ = t.z;
      });

      if (hits > 0) {
        this.recordCombo(lv >= 3 ? 'Mega-Zap' : 'Lightning Zap', Math.min(2, hits));
        this.hitstop = Math.max(this.hitstop, 0.09);
      }
    } else {
      // No target in range: strike the ground ahead of Kenji with a dramatic lightning blast!
      const sx = clamp(k.x + fx * 6.5, -this.mapBound() + 1, this.mapBound() - 1);
      const sz = clamp(k.z + fz * 6.5, -this.mapBound() + 1, this.mapBound() - 1);
      this.parts.lightning(sx + rand(-1, 1), 17, sz + rand(-1, 1), sx, 0.3, sz, 0xc8feff, 0.13, 0.36);
      this.parts.lightning(k.x, k.y + 1.1, k.z, sx, 0.6, sz, 0x5ff2ff, 0.095, 0.32);
      this.parts.hitBurst(sx, 0.8, sz, 0x5ff2ff, 1.6);
      this.parts.shockWall(sx, 0.08, sz, 0x5ff2ff, 0.8, 4.8, 0.7, 2.8, 0.35, 12);
      this.parts.groundMark(sx, 0, sz, 3.4, 'crater', 0x62f4ff, 2.0);
    }

    // Level 2+ vaporizes nearby hostile chopsticks & chili globs with point-defense arcs!
    if (lv >= 2) {
      const zapProjR = lv >= 3 ? 13 : 9.5;
      this.projs = this.projs.filter((p) => {
        if (!p.friendly && Math.hypot(p.x - k.x, p.z - k.z) < zapProjR) {
          this.parts.lightning(k.x, k.y + 1.1, k.z, p.x, p.y, p.z, 0x7df9ff, 0.05, 0.2);
          this.parts.hitBurst(p.x, p.y, p.z, 0x7df9ff, 0.75);
          this.discard(p.mesh);
          return false;
        }
        return true;
      });
    }
    this.emit();
  }

  private doSqueal() {
    const k = this.k;
    const lv = this.levels.squeal;
    const R = lv >= 2 ? 13 : 9;
    k.action = 'squeal';
    k.t = 0;
    k.squealCd = lv >= 2 ? 11 : 14;
    this.sfx.play('squeal');
    this.addShake(0.5);
    this.spawnShock(k.x, k.z, R, 34, false, 0);
    this.parts.shockWall(k.x, k.y + 0.1, k.z, 0x5ff2ff, 0.9, R * 0.95, 1.0, 3.8, 0.46, 8);
    this.parts.shockWall(k.x, k.y + 0.2, k.z, 0xff9ec4, 0.6, R * 0.7, 1.4, 3.2, 0.36, -11);
    this.parts.hitBurst(k.x, k.y + 1.35, k.z, 0x7df9ff, lv >= 2 ? 1.85 : 1.45);
    this.parts.dustRing(k.x, k.y, k.z, 14, 1.1, 0xd8f8ff, 11, 2.0, 0.55);
    this.floatText(k.x, 2.6, k.z, 'SQUEEEEE!', 'info');
    const A = this.A;
    if (A.active && Math.hypot(A.x - k.x, A.z - k.z) < R + 1.5) {
      if (this.damageAllen(lv >= 2 ? 28 : 12, 20)) this.stunAllen(lv >= 2 ? 2.6 : 1.8, false);
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < R) {
        b.stun = 2.5;
        this.damageBot(b, 34, (dx / d) * 18, (dz / d) * 18, true);
      }
    }
    this.hitPots(k.x, k.z, R, 30);
    this.projs = this.projs.filter((p) => {
      if (Math.hypot(p.x - k.x, p.z - k.z) < R) {
        this.parts.emit(p.x, 1, p.z, 5, 0xffb057, 5, 0.2, 0.4);
        this.discard(p.mesh);
        return false;
      }
      return true;
    });
  }

  private teslaZap() {
    const lv = this.levels.tesla;
    const A = this.A;
    const k = this.k;
    this.sfx.play('zap');
    this.spawnShock(A.x, A.z, 7, 30, false, 0);
    // primary bolt from Kenji's tusks to Allen + sky/crown arcs around Allen
    this.parts.lightning(k.x, k.y + 1.1, k.z, A.x, A.y + 2.8, A.z, 0x5ff2ff, 0.1, 0.28);
    this.parts.lightning(A.x - 1.4, A.y + 4.4, A.z + 0.8, A.x + 1.4, A.y + 1.5, A.z - 0.8, 0xb8fcff, 0.075, 0.24);
    if (lv >= 2) this.parts.lightning(A.x + 0.4, A.y + 8.5, A.z - 0.3, A.x, A.y + 2.6, A.z, 0x7df9ff, 0.11, 0.3);
    this.parts.hitBurst(A.x, A.y + 2.9, A.z, 0x5ff2ff, lv >= 2 ? 1.9 : 1.45);
    this.parts.shockWall(A.x, 0.1, A.z, 0x5ff2ff, 1.2, lv >= 2 ? 7.5 : 5.6, 0.8, 3.0, 0.34, 14);
    if (this.damageAllen(lv >= 2 ? 25 : 10, 10)) this.stunAllen(lv >= 2 ? 2.2 : 1.4, false);
    for (const b of [...this.bots]) {
      if (Math.hypot(b.x - A.x, b.z - A.z) < 9) {
        this.parts.lightning(A.x, A.y + 2.5, A.z, b.x, 1.0, b.z, 0x6ff7ff, 0.075, 0.26);
        this.damageBot(b, lv >= 2 ? 60 : 25, 0, 0);
      }
    }
  }

  private hurtKenji(dmg: number, fx: number, fz: number, knock: number): boolean {
    const k = this.k;
    // rolling through a hit at the last moment rewards a Perfect Dodge
    if (k.action === 'roll' && k.invuln > 0 && !k.dodged && !this.overReason) {
      k.dodged = true;
      k.focus = 3.2;
      k.stam = Math.min(k.maxStam, k.stam + 24);
      this.hitstop = Math.max(this.hitstop, 0.1);
      this.sfx.play('truffle');
      this.floatText(k.x, 2.9 + k.y, k.z, 'PERFECT DODGE!', 'crit');
      this.parts.hitBurst(k.x, 1.05 + k.y, k.z, 0x62f4ff, 1.45);
      this.parts.slash({ x: k.x, y: 0.95 + k.y, z: k.z, heading: k.heading, color: 0x7df9ff, radius: 2.9, full: true, spin: 18, dur: 0.34, rise: 1.4, hdr: 4.2 });
      this.parts.motes(k.x, 0.9 + k.y, k.z, 16, 0x7df9ff, 6, 0.2, 0.7, -3, 8, 0.8, 3.8);
    }
    if (k.invuln > 0 || k.action === 'dead' || this.overReason) return false;
    const def = (1 - 0.1 * this.levels.hide) * (k.muddy > 0 ? 0.85 : 1);
    const d = Math.max(1, Math.round(dmg * def));
    k.hp -= d;
    this.stats.taken += d;
    this.hurtTick++;
    let dx = k.x - fx;
    let dz = k.z - fz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    k.vx = dx * knock;
    k.vz = dz * knock;
    k.vy = 6;
    k.grounded = false;
    k.action = 'hurt';
    k.t = 0;
    k.flowCount = 0;
    k.flowTimer = 0;
    k.chainHits = 0;
    k.rushWindow = 0;
    k.riverRush = false;
    k.invuln = 0.9;
    k.blink = 0.9;
    this.addShake(0.6);
    this.sfx.play('hurt');
    this.floatText(k.x, 2.4 + k.y, k.z, `-${d}`, 'hurt');
    this.parts.hitBurst(k.x, 1.1 + k.y, k.z, 0xff5a4a, 1.15, dx, dz);
    if (k.hp <= 0) {
      k.hp = 0;
      k.action = 'dead';
      k.t = 0;
      if (this.area === 'forest') {
        this.say('Path Guppy', 'And stay off my path!', 4);
        this.gameOver('guppy');
      } else {
        this.say('Allen', pick(['Dinner… is served.', 'Finally. Someone get the grill.']), 4);
        this.gameOver('kenji');
      }
    }
    this.emit();
    return true;
  }

  /* ───────────────────────── Allen ───────────────────────── */

  private setA(s: AState) {
    this.A.state = s;
    this.A.t = 0;
  }

  private recover(dur: number) {
    this.setA('recover');
    this.A.recoverDur = dur;
  }

  private stunAllen(dur: number, force: boolean) {
    const A = this.A;
    if (!A.active || A.hp <= 0) return;
    if (['defeated', 'leaving', 'ko', 'gone', 'slamAir', 'spin'].includes(A.state) || A.shielded) return;
    if (!force && A.stunImmune > 0) {
      this.floatText(A.x, 5.2, A.z, 'RESISTED', 'info');
      return;
    }
    this.setA('stunned');
    A.stunDur = dur;
    A.poise = 0;
    A.slamChain = 0;
    A.swipes = 0;
    A.volleys = 0;
    this.sfx.play('stun');
  }

  /* ───────── invincibility stages: Sauce Shield, Wok Guard, Sizzle Spin ───────── */

  private immuneFx(text: string) {
    const A = this.A;
    if (A.immuneCd > 0) return;
    A.immuneCd = 0.3;
    this.sfx.play('clang');
    const dx = this.k.x - A.x;
    const dz = this.k.z - A.z;
    const d = Math.hypot(dx, dz) || 1;
    const ix = A.x + (dx / d) * (A.shielded ? 3.2 : 1.9);
    const iz = A.z + (dz / d) * (A.shielded ? 3.2 : 1.9);
    this.floatText(A.x + rand(-0.6, 0.6), A.y + 4.7, A.z, text, 'info');
    this.parts.hitBurst(ix, A.y + 2.3, iz, 0xffd24d, 0.9, dx / d, dz / d);
  }

  private clearStageProps() {
    for (const p of this.pots) this.discard(p.m.root);
    this.pots = [];
    for (const h of this.hazards) this.scene.remove(h.g);
    this.hazards = [];
    this.shieldGroup.visible = false;
  }

  /**
   * Returns true when damage actually landed. Allen shrugs hits off entirely while his Sauce Shield is up
   * or while he is spinning, and blocks frontal light attacks during Wok Guard.
   */
  private damageAllen(dmg: number, poise: number, o: { heavy?: boolean; minor?: boolean; fx?: number; fz?: number } = {}): boolean {
    const A = this.A;
    if (!A.active || ['gone', 'defeated', 'leaving', 'ko'].includes(A.state)) return false;
    if (A.shielded) {
      this.immuneFx('IMMUNE');
      return false;
    }
    if (A.state === 'spin') {
      this.immuneFx('SPINNING!');
      return false;
    }
    let guardBroken = false;
    if (A.state === 'guard') {
      const sx = (o.fx ?? this.k.x) - A.x;
      const sz = (o.fz ?? this.k.z) - A.z;
      const sd = Math.hypot(sx, sz) || 1;
      const front = (sx * Math.sin(A.heading) + sz * Math.cos(A.heading)) / sd > -0.2;
      if (front && !o.heavy) {
        this.immuneFx('BLOCKED');
        return false;
      }
      if (!o.minor) {
        guardBroken = true;
        dmg *= front ? 0.7 : 1.35;
        this.floatText(A.x, A.y + 5.9, A.z, front ? 'GUARD BREAK!' : 'BACKSTAB!', 'crit');
        this.parts.hitBurst(A.x + Math.sin(A.heading) * (front ? 1.6 : -1.2), A.y + 2.7, A.z + Math.cos(A.heading) * (front ? 1.6 : -1.2), 0xffc83d, 1.85);
        this.parts.shockWall(A.x, 0.1, A.z, 0xffd24d, 1.0, 5.5, 0.9, 3.0, 0.36, 9);
        this.sfx.play('shatter');
        this.addShake(0.5);
      }
    }
    const crit = A.state === 'stunned';
    const mult = A.exposed > 0 ? 1.35 : crit ? 1.25 : 1;
    let d = Math.min(Math.ceil(A.hp), Math.max(1, Math.round(dmg * mult)));
    // phase gates: Allen cannot be pushed past a phase line until that phase's shield stage is cleared
    const gate = A.phase < A.phases - 1 ? Math.ceil(A.maxHp * (1 - (A.phase + 1) / A.phases)) : 0;
    const gated = gate > 0 && A.hp - d <= gate;
    if (gated) d = Math.max(1, Math.ceil(A.hp - gate));
    A.hp -= d;
    this.stats.dealt += d;
    A.flash = 0.12;
    this.floatText(A.x + rand(-0.8, 0.8), A.y + 4.2 + rand(0, 1), A.z, String(d), crit || A.exposed > 0 ? 'crit' : 'dmg');
    A.dropAcc += d;
    const chunk = A.maxHp * 0.1;
    while (A.dropAcc >= chunk) {
      A.dropAcc -= chunk;
      this.spawnTruffle(A.x, A.z, true);
      this.spawnTruffle(A.x, A.z, true);
    }
    if (A.hp <= 0) {
      this.defeatAllen();
      return true;
    }
    if (gated) {
      this.beginShield();
      return true;
    }
    if (guardBroken) {
      A.cdGuard = 10;
      this.stunAllen(1.7, true);
      return true;
    }
    if (A.state === 'eating' || A.state === 'toEat') {
      A.eatDmg += d;
      if (A.eatDmg >= 30 + 9 * this.course) {
        A.hunger = COURSES[this.course].hunger;
        A.target = null;
        this.say('Allen', pick(['Hey! I was EATING that!', 'Do you MIND?', 'Rude. So rude.']), 2.6);
        this.floatText(A.x, 5.4, A.z, 'INTERRUPTED!', 'info');
        this.recover(0.5);
      }
    }
    if (A.state !== 'stunned' && A.state !== 'slamAir' && A.state !== 'dash') {
      A.poise += poise;
      A.poiseDelay = 1.6;
      if (A.poise >= A.poiseMax) {
        this.floatText(A.x, 5.6, A.z, 'STAGGERED!', 'crit');
        this.parts.hitBurst(A.x, A.y + 3.2, A.z, 0xffe14d, 1.9);
        this.parts.shockWall(A.x, 0.1, A.z, 0xffe14d, 1.2, 6.4, 0.8, 3.2, 0.4, 8);
        this.stunAllen(1.8, true);
      }
    }
    return true;
  }

  /** Phase line reached: Allen turns invincible until every sauce jar is smashed (or the marinade timer runs out). */
  private beginShield() {
    const A = this.A;
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    A.phase++;
    A.shielded = true;
    A.shieldDur = Math.max(12.5, 19.5 - this.course * 0.9);
    A.shieldT = A.shieldDur;
    A.rainT = 1.9;
    A.y = 0;
    A.target = null;
    A.poise = 0;
    A.exposed = 0;
    A.slamChain = 0;
    A.swipes = 0;
    A.volleys = 0;
    this.setA('shielded');
    this.slamRing.visible = false;
    this.dashLine.visible = false;
    this.spawnPots(c.jars);
    // From Course 2 onward, Allen calls kitchen guards to defend his sauce jars!
    if (this.course >= 1) this.spawnBots(Math.min(3, 1 + Math.floor(this.course / 3)), true);
    this.sfx.play('shield');
    this.sfx.play('roar');
    this.addShake(0.7);
    this.spawnShock(A.x, A.z, 9, 22, false, 0);
    this.parts.shockWall(A.x, 0.1, A.z, 0xff9a2e, 1.4, 9.2, 1.2, 4.6, 0.52, 7);
    this.parts.hitBurst(A.x, 3.1, A.z, 0xffaa38, 2.0);
    this.parts.dustRing(A.x, 0.1, A.z, 14, 1.5, 0xffcf88, 9, 2.2, 0.7);
    this.showBanner('SAUCE SHIELD!', `Allen is invincible · smash all ${c.jars} sauce jars`);
    if (!this.tips.has('shield')) {
      this.tips.add('shield');
      this.say('Kingger', 'His shield is powered by those glowing sauce jars! Smash every one before he finishes marinating!', 5.5);
    } else {
      this.say('Allen', pick(["You can't tenderize what's still marinating!", 'Sauce shield! Good luck, bacon.', 'I am UNTOUCHABLE. And delicious.']), 3.6);
    }
    this.emit();
  }

  private spawnPots(n: number) {
    const A = this.A;
    const cx = clamp(A.x, -34, 34);
    const cz = clamp(A.z, -34, 34);
    const start = Math.random() * TAU;
    const hp = 44 + 13 * this.course;
    for (let i = 0; i < n; i++) {
      const a = start + (i / n) * TAU + rand(-0.25, 0.25);
      const r = rand(9.5, 13.5);
      const pos = this.safePosition(clamp(cx + Math.sin(a) * r, -48, 48), clamp(cz + Math.cos(a) * r, -48, 48), 0.95);
      const m = makeSaucePot();
      m.root.position.set(pos.x, 0, pos.z);
      this.scene.add(m.root);
      this.pots.push({ m, x: pos.x, z: pos.z, hp, wob: 0, hitCd: 0, ph: Math.random() * 6 });
      this.parts.emit(pos.x, 1, pos.z, 12, 0xff7a1a, 7, 0.28, 0.6);
    }
    A.potTotal = n;
  }

  private damagePot(p: Pot, dmg: number): boolean {
    if (p.hp <= 0 || p.hitCd > 0) return false;
    const d = Math.max(1, Math.round(dmg));
    p.hp -= d;
    p.hitCd = 0.22;
    p.wob = 1;
    this.floatText(p.x + rand(-0.3, 0.3), 2.7, p.z, String(d), 'dmg');
    this.parts.emit(p.x, 1.2, p.z, 7, 0xe5392b, 7, 0.22, 0.45);
    if (p.hp <= 0) {
      this.pots = this.pots.filter((o) => o !== p);
      this.discard(p.m.root);
      const left = this.pots.length;
      this.parts.hitBurst(p.x, 1.4, p.z, 0xff7a24, 1.65);
      this.parts.shockWall(p.x, 0.08, p.z, 0xff5a24, 0.7, 4.4, 0.6, 2.4, 0.36, 8);
      this.parts.chunks(p.x, 1.2, p.z, 16, 0x8a5231, 11, 0.28, 0.7);
      this.parts.sparks(p.x, 1.3, p.z, 24, 0xff4a1f, 14, 0.2, 0.58, { hdr: 4.2, altColor: 0xffd24d });
      // backlash bolt racing down the severed tether into Allen's shield!
      this.parts.lightning(p.x, 1.6, p.z, this.A.x, this.A.y + 2.9, this.A.z, 0xffb347, 0.09, 0.28);
      this.sfx.play('shatter');
      this.addShake(0.35);
      this.spawnTruffle(p.x, p.z, true);
      this.floatText(p.x, 3.5, p.z, left ? `JAR SMASHED · ${left} LEFT` : 'LAST JAR!', 'crit');
    }
    return true;
  }

  private hitPots(x: number, z: number, radius: number, dmg: number, fx = 0, fz = 0, coneMin = -2): boolean {
    let hit = false;
    for (const p of [...this.pots]) {
      const dx = p.x - x;
      const dz = p.z - z;
      const d = Math.hypot(dx, dz) || 0.001;
      if (d > radius) continue;
      if (coneMin > -1 && (dx * fx + dz * fz) / d <= coneMin) continue;
      if (this.damagePot(p, dmg)) hit = true;
    }
    return hit;
  }

  private updatePots(dt: number) {
    if (!this.pots.length) return;
    const A = this.A;
    const k = this.k;
    const T = this.time;
    const hurry = A.shieldT < 5;
    for (const p of this.pots) {
      p.hitCd = Math.max(0, p.hitCd - dt);
      p.wob = Math.max(0, p.wob - dt * 3);
      p.m.body.rotation.z = Math.sin(T * 30) * p.wob * 0.22;
      p.m.body.position.y = Math.abs(Math.sin(T * 3 + p.ph)) * 0.08;
      p.m.body.scale.setScalar(1 + p.wob * 0.08);
      p.m.sauce.emissiveIntensity = 1.1 + Math.sin(T * (hurry ? 16 : 6) + p.ph) * 0.6;
      // sauce tether feeding the shield
      const tx = A.x - p.x;
      const ty = A.y + 2.9 - 1.7;
      const tz = A.z - p.z;
      p.m.beam.position.set(tx / 2, 1.7 + ty / 2, tz / 2);
      p.m.beam.scale.set(1, 1, Math.hypot(tx, ty, tz));
      p.m.beam.lookAt(A.x, A.y + 2.9, A.z);
      (p.m.beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.abs(Math.sin(T * 9 + p.ph)) * 0.4;
      // solid enough to bump into
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.35 && d > 0.001 && k.y < 1.4) {
        k.x = p.x + (dx / d) * 1.35;
        k.z = p.z + (dz / d) * 1.35;
      }
    }
  }

  private breakShield(success: boolean) {
    const A = this.A;
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    A.shielded = false;
    A.y = 0;
    for (const p of this.pots) {
      this.parts.emit(p.x, 1.2, p.z, 10, 0x8a5231, 7, 0.28, 0.5);
      this.discard(p.m.root);
    }
    this.pots = [];
    A.hunger = Math.max(A.hunger, 7);
    A.cdGuard = Math.max(A.cdGuard, 4);
    if (success) {
      A.exposed = 4.8;
      this.stunAllen(2.9, true);
      this.sfx.play('shatter');
      this.sfx.play('bighit');
      this.addShake(0.9);
      this.hitstop = 0.14;
      this.parts.hitBurst(A.x, 3.2, A.z, 0xffc84a, 2.5);
      this.parts.shockWall(A.x, 0.1, A.z, 0xffb347, 2.2, 11.5, 1.8, 5.2, 0.56, 8);
      this.parts.shockWall(A.x, 0.1, A.z, 0x5ff2ff, 1.5, 8.8, 2.2, 4.6, 0.44, -10);
      this.parts.sparks(A.x, 3.1, A.z, 52, 0xffd24d, 18, 0.22, 0.82, { grav: 12, up: 0.95, hdr: 4.5, stretch: 5.0, altColor: 0x7df9ff });
      this.parts.groundMark(A.x, 0, A.z, 5.2, 'crater', 0xffb255, 3.0);
      this.spawnShock(A.x, A.z, 10, 26, false, 0);
      this.showBanner('SHIELD SHATTERED!', 'Allen is EXPOSED · +35% damage — unload your combos!');
      this.say('Allen', pick(['My marinade! That took HOURS!', 'Not the gochujang!', 'You broke my sauce… you MONSTER.']), 3.6);
    } else {
      const heal = Math.round(A.maxHp * 0.12);
      A.hp = Math.min(A.maxHp, A.hp + heal);
      this.floatText(A.x, 6, A.z, `+${heal} WELL FED`, 'hurt');
      this.sfx.play('roar');
      this.sfx.play('slam');
      this.addShake(0.9);
      this.spawnShock(A.x, A.z, 22, 21, true, 18 * c.dmg);
      this.showBanner('FULLY MARINATED', `Allen healed ${heal} HP · jump the shockwave and break the jars faster!`);
      this.say('Allen', pick(['Mmm. Perfectly marinated.', 'Sauce absorbed. I feel DELICIOUS.']), 3.4);
      this.recover(0.9);
    }
    const hangryPhase = this.course >= 6 ? Math.max(1, A.phases - 2) : A.phases - 1;
    if (A.phase >= hangryPhase && this.course >= 2 && !A.enraged) {
      A.enraged = true;
      this.sfx.play('roar');
      this.floatText(A.x, 6.8, A.z, 'HANGRY!', 'hurt');
    }
    this.emit();
  }

  /** Telegraphed falling dumpling: step out of the circle before it lands. */
  private spawnRain(x: number, z: number, dmg: number, tele: number) {
    const b = BOUND - 1;
    x = clamp(x, -b, b);
    z = clamp(z, -b, b);
    const g = new THREE.Group();
    const ring = new THREE.Mesh(RING_GEO, HAZ_RING_MAT);
    const fill = new THREE.Mesh(DISC_GEO, HAZ_FILL_MAT);
    const ball = new THREE.Mesh(HAZ_BALL_GEO, glow(0xff7a2e, 0.9));
    ring.scale.setScalar(2.7);
    fill.scale.setScalar(0.01);
    ball.position.y = 18;
    g.add(ring, fill, ball);
    g.position.set(x, 0.11, z);
    this.scene.add(g);
    this.hazards.push({ g, fill, ball, x, z, r: 2.7, t: 0, dur: 1.05 * tele, dmg });
  }

  private updateHazards(dt: number) {
    if (!this.hazards.length) return;
    const k = this.k;
    this.hazards = this.hazards.filter((h) => {
      h.t += dt;
      const p = Math.min(1, h.t / h.dur);
      h.fill.scale.setScalar(Math.max(0.01, h.r * p));
      h.ball.position.y = 18 * (1 - p * p) + 0.6;
      h.ball.rotation.x += dt * 9;
      if (p > 0.2 && Math.random() < dt * 28) {
        this.parts.sparks(h.x, h.ball.position.y + 0.5, h.z, 1, 0xff8a2e, 5, 0.14, 0.24, { dirY: 1, focus: 0.7, grav: 2, hdr: 3.8, altColor: 0xffe14d });
      }
      if (p < 1) return true;
      this.scene.remove(h.g);
      this.parts.hitBurst(h.x, 0.85, h.z, 0xff6a24, 1.35);
      this.parts.shockWall(h.x, 0.06, h.z, 0xff7a2e, 0.6, h.r * 1.15, 0.5, 2.2, 0.32, 6);
      this.parts.groundMark(h.x, 0, h.z, h.r * 0.9, 'crater', 0xff8a3c, 2.0);
      this.parts.dustRing(h.x, 0.05, h.z, 8, 0.6, 0xd8bda0, 6.5, 1.7, 0.55);
      this.sfx.play('pop');
      this.addShake(0.25);
      if (Math.hypot(k.x - h.x, k.z - h.z) < h.r + 0.35 && k.y < 3) this.hurtKenji(h.dmg, h.x, h.z, 11);
      this.hitAlliesNear(h.x, h.z, h.r, h.dmg * 0.6);
      return false;
    });
  }

  private pickEdible(): Edible | null {
    const A = this.A;
    const alive = this.world.edibles.filter((e) => e.hp > 0);
    if (!alive.length) return null;
    alive.sort((a, b) => Math.hypot(a.x - A.x, a.z - A.z) - Math.hypot(b.x - A.x, b.z - A.z));
    return alive[Math.min(alive.length - 1, Math.random() < 0.65 ? 0 : 1)];
  }

  private moveAllen(tx: number, tz: number, speed: number, dt: number, bounded: boolean) {
    const A = this.A;
    const dx = tx - A.x;
    const dz = tz - A.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const base = Math.atan2(dx, dz);
    let ang = base;
    if (A.avoidT > 0) {
      A.avoidT -= dt;
      ang += A.avoidDir * 1.25;
    }
    A.heading = angLerp(A.heading, ang, 8 * dt);
    const step = Math.min(d, speed * dt);
    A.x += Math.sin(ang) * step;
    A.z += Math.cos(ang) * step;
    if (bounded) {
      const r = this.resolve(A.x, A.z, 1.5);
      A.x = clamp(r.x, -BOUND, BOUND);
      A.z = clamp(r.z, -BOUND, BOUND);
      if (r.hit && A.avoidT <= 0) {
        A.avoidT = 0.7;
        A.avoidDir = angDiff(base, Math.atan2(r.cx - A.x, r.cz - A.z)) > 0 ? -1 : 1;
      }
    }
    A.walk += dt * speed * 0.9;
  }

  private makeBotModel(kind: BotKind): { m: EnemyModel; hp: number; rad: number } {
    const ci = this.course;
    switch (kind) {
      case 'spitter':
        return { m: makeSpitter(), hp: 42 + ci * 9, rad: 0.62 };
      case 'skewer':
        return { m: makeSkewerHound(), hp: 46 + ci * 10, rad: 0.68 };
      case 'tenderizer':
        return { m: makeTenderizer(), hp: 105 + ci * 24, rad: 0.95 };
      case 'bomber':
        return { m: makeBomber(), hp: 36 + ci * 7, rad: 0.62 };
      default:
        return { m: makeGrillbot(), hp: 38 + ci * 9, rad: 0.6 };
    }
  }

  /** Spawns a mixed squad from the current course's kitchen roster (either beside Allen or marching in from the gate). */
  private spawnBots(n: number, fromGate = false) {
    const A = this.A;
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    const roster = c.roster;
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      if (this.bots.length >= c.maxBots) break;
      // pick varied types: cap active Tenderizers at 2 and Bombers at 2 so fights stay thrilling & readable
      let kind = roster[(i + Math.floor(Math.random() * roster.length)) % roster.length];
      if (kind === 'tenderizer' && this.bots.filter((o) => o.kind === 'tenderizer').length >= 2) kind = 'grill';
      if (kind === 'bomber' && this.bots.filter((o) => o.kind === 'bomber').length >= 2) kind = pick(['grill', 'skewer'] as BotKind[]);
      // ensure the signature newest enemy of this course shows up on the first slot when available
      if (i === 0 && roster.length > 1) {
        const sig = roster[roster.length - 1];
        if (!this.bots.some((o) => o.kind === sig)) kind = sig;
      }

      let sx: number;
      let sz: number;
      if (fromGate) {
        sx = (i - (n - 1) / 2) * 3.2 + rand(-1.2, 1.2);
        sz = BOUND - 1.5 - rand(0, 2);
      } else {
        const a = A.heading + (i - (n - 1) / 2) * 1.05 + PI * 0.5;
        sx = A.x + Math.sin(a) * 4.5;
        sz = A.z + Math.cos(a) * 4.5;
      }
      const { m, hp, rad } = this.makeBotModel(kind);
      const r = this.safePosition(clamp(sx, -BOUND + 2, BOUND - 2), clamp(sz, -BOUND + 2, BOUND - 2), rad);
      m.root.position.set(r.x, 0, r.z);
      this.scene.add(m.root);

      let ring: THREE.Group | null = null;
      let ringFill: THREE.Mesh | null = null;
      if (kind === 'tenderizer' || kind === 'bomber') {
        ring = new THREE.Group();
        const radius = kind === 'bomber' ? 4.6 : 3.5;
        const rim = new THREE.Mesh(RING_GEO, HAZ_RING_MAT);
        ringFill = new THREE.Mesh(DISC_GEO, HAZ_FILL_MAT);
        rim.scale.setScalar(radius);
        ringFill.scale.setScalar(0.01);
        ring.add(rim, ringFill);
        ring.visible = false;
        this.scene.add(ring);
      }

      this.bots.push({
        kind,
        m,
        x: r.x,
        z: r.z,
        hp,
        maxHp: hp,
        rad,
        heading: PI,
        bite: rand(0.6, 1.3),
        stun: 0.35,
        kx: 0,
        kz: 0,
        chomp: 0,
        flash: 0,
        ph: Math.random() * 6,
        mode: 'idle',
        mt: 0,
        lx: 0,
        lz: -1,
        strafe: Math.random() < 0.5 ? 1 : -1,
        ring,
        ringFill,
      });
      this.parts.emit(r.x, 1, r.z, 10, kind === 'spitter' ? 0xff3b24 : kind === 'bomber' ? 0xff8a24 : 0x26262b, 6, 0.28, 0.5, 4);
      spawned++;
    }
    if (spawned > 0) this.sfx.play('pop');
  }

  private updateAllen(dt: number) {
    const A = this.A;
    if (!A.active) return;
    const k = this.k;
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    A.t += dt;
    A.flash = Math.max(0, A.flash - dt);
    A.stunImmune = Math.max(0, A.stunImmune - dt);
    A.cdSwipe -= dt;
    A.cdSlam -= dt;
    A.cdThrow -= dt;
    A.cdDash -= dt;
    A.cdSummon -= dt;
    A.cdGuard -= dt;
    A.cdRain -= dt;
    A.cdSpin -= dt;
    A.exposed = Math.max(0, A.exposed - dt);
    A.immuneCd = Math.max(0, A.immuneCd - dt);
    A.globalCd -= dt;
    if (A.poiseDelay > 0) A.poiseDelay -= dt;
    else A.poise = Math.max(0, A.poise - 22 * dt);

    // Kitchen reinforcement stream keeps pressure high across every stage!
    if (k.action !== 'dead' && A.hp > 0 && !['enter', 'defeated', 'leaving', 'ko'].includes(A.state)) {
      this.waveT -= dt;
      if (this.waveT <= 0) {
        this.waveT = c.waveCd * (A.enraged ? 0.8 : 1);
        if (this.bots.length < c.maxBots - 1) {
          const count = Math.min(c.bots, c.maxBots - this.bots.length, 2 + Math.floor(this.course / 3));
          this.spawnBots(count, true);
        }
      }
    }

    const dx = k.x - A.x;
    const dz = k.z - A.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const toK = Math.atan2(dx, dz);
    const tele = c.tele * (A.enraged ? 0.82 : 1);
    const spd = c.speed * (A.enraged ? 1.2 : 1) * (1 + 0.05 * A.phase);
    const kDead = k.action === 'dead';

    switch (A.state) {
      case 'enter': {
        this.moveAllen(0, 42, spd * 1.3, dt, false);
        if (A.z <= 44 || A.t > 5) this.setA('chase');
        break;
      }
      case 'chase': {
        if (kDead) break;
        A.heading = angLerp(A.heading, toK, 5 * dt);
        if (dist > 3.6) this.moveAllen(k.x, k.z, spd, dt, true);
        A.hunger -= dt;
        if (A.hunger <= 0) {
          const e = this.pickEdible();
          if (e) {
            A.target = e;
            A.eatDmg = 0;
            const ex = A.x - e.x;
            const ez = A.z - e.z;
            const el = Math.hypot(ex, ez) || 1;
            A.eatX = e.x + (ex / el) * e.r;
            A.eatZ = e.z + (ez / el) * e.r;
            this.setA('toEat');
            this.say('Allen', pick([`Ooh — the ${e.name.toLowerCase()}! Don't mind if I do.`, `Snack break. ${e.name}, come to papa.`, 'Fighting on an empty stomach? Never.']), 3);
            break;
          }
          A.hunger = 6;
        }
        A.decideT -= dt;
        if (A.decideT <= 0) {
          A.decideT = 0.3;
          // Wok Guard: he turtles up when pressured — flank him or crack it with a finisher
          if ((c.guard || A.phase >= 1) && A.cdGuard <= 0 && dist < 7.5 && (A.poise > A.poiseMax * 0.35 || Math.random() < 0.22)) {
            this.setA('guard');
            this.sfx.play('clang');
            this.floatText(A.x, 5.7, A.z, 'WOK GUARD!', 'info');
            if (!this.tips.has('guard')) {
              this.tips.add('guard');
              this.say('Rickley', "He's hidin' behind that wok! Roll round behind him — or crack it with a finisher or a Hog Charge!", 5.2);
            }
            break;
          }
          if (dist < 5.6 && A.cdSwipe <= 0) {
            A.swipes = 0;
            this.setA('swipeWind');
            break;
          }
          if (A.globalCd <= 0) {
            const opts: AState[] = [];
            if (dist > 5.2 && dist < 30 && A.cdSlam <= 0) opts.push('slamWind');
            if (c.throwN > 0 && dist > 6.5 && A.cdThrow <= 0) opts.push('throwWind');
            if (c.dash && dist > 8.5 && dist < 32 && A.cdDash <= 0) opts.push('dashWind');
            if (c.bots > 0 && A.cdSummon <= 0 && this.bots.length <= Math.floor(c.maxBots * 0.45)) opts.push('summon');
            if (c.rain && dist > 4.5 && A.cdRain <= 0) opts.push('rainCast');
            if (c.spin && (A.phase >= 1 || this.course >= 6) && dist < 15 && A.cdSpin <= 0) opts.push('spinWind');
            if (opts.length) {
              const s = pick(opts);
              A.globalCd = A.enraged ? 0.72 : 1.25;
              A.summoned = false;
              A.volleys = 0;
              this.setA(s);
              if (s === 'dashWind' || s === 'summon') this.sfx.play('roar');
              if (s === 'rainCast') {
                A.rainLeft = 3 + A.phase;
                A.rainT = 0.5;
                this.sfx.play('roar');
                this.floatText(A.x, 6, A.z, 'HOT POT RAIN!', 'hurt');
              }
              if (s === 'spinWind') {
                this.sfx.play('roar');
                this.floatText(A.x, 6, A.z, 'SIZZLE SPIN!', 'hurt');
                if (!this.tips.has('spin')) {
                  this.tips.add('spin');
                  this.say('Kingger', "Do NOT touch him while he spins — he's invincible! Keep your distance and he'll get dizzy.", 5);
                }
              }
            }
          }
        }
        break;
      }
      case 'swipeWind': {
        if (A.t < 0.32 * tele) A.heading = angLerp(A.heading, toK, 7 * dt);
        if (A.t >= 0.55 * tele) {
          this.setA('swipe');
          this.sfx.play('swing');
          const fx = Math.sin(A.heading);
          const fz = Math.cos(A.heading);
          const flip = A.swipes % 2 === 0 ? 1 : -1;
          this.parts.slash({
            x: A.x + fx * 1.1,
            y: A.y + 1.5,
            z: A.z + fz * 1.1,
            heading: A.heading,
            color: A.enraged ? 0xff4a24 : 0xff9a38,
            radius: 4.5,
            wide: true,
            tiltZ: 0.45 * flip,
            tiltX: 0.22,
            spin: 9 * flip,
            dur: 0.28,
            hdr: 3.8,
          });
          this.parts.sparks(A.x + fx * 3.6, 0.7, A.z + fz * 3.6, 14, 0xffb84d, 12, 0.16, 0.36, { dirX: fx, dirZ: fz, focus: 0.5, hdr: 3.8, altColor: 0xffffff });
          this.parts.dust(A.x + fx * 3.5, 0.25, A.z + fz * 3.5, 6, 0xe2d3b8, { spread: 0.9, speed: 5, rise: 1.8, size0: 0.65, size1: 2.3, life: 0.55 });
          if (dist < 5.6 && (dx * fx + dz * fz) / dist > 0.25 && k.y < 2.4) this.hurtKenji(14 * c.dmg, A.x, A.z, 15);
          this.hitAlliesNear(A.x + fx * 2.8, A.z + fz * 2.8, 2.6, 10 * c.dmg);
        }
        break;
      }
      case 'swipe': {
        if (A.t >= 0.24) {
          if (c.doubleSwipe && A.swipes < 1 && dist < 8) {
            A.swipes++;
            this.setA('swipeWind');
            A.t = 0.22 * tele;
          } else {
            A.cdSwipe = 1.2;
            this.recover(0.75 * tele);
          }
        }
        break;
      }
      case 'slamWind': {
        A.heading = angLerp(A.heading, toK, 6 * dt);
        if (A.t >= 0.5 * tele) {
          A.sx = A.x;
          A.sz = A.z;
          let tx = k.x + k.vx * 0.25 - A.x;
          let tz = k.z + k.vz * 0.25 - A.z;
          const tl = Math.hypot(tx, tz) || 1;
          const m = Math.min(tl, 26);
          tx = A.x + (tx / tl) * m;
          tz = A.z + (tz / tl) * m;
          const r = this.resolve(tx, tz, 1.5);
          A.tx = clamp(r.x, -BOUND, BOUND);
          A.tz = clamp(r.z, -BOUND, BOUND);
          A.airDur = 0.9 * tele;
          this.setA('slamAir');
          this.sfx.play('jump');
        }
        break;
      }
      case 'slamAir': {
        const p = Math.min(1, A.t / A.airDur);
        A.x = lerp(A.sx, A.tx, p);
        A.z = lerp(A.sz, A.tz, p);
        A.y = Math.sin(p * PI) * 7.5;
        if (p >= 1) {
          A.y = 0;
          this.addShake(0.9);
          this.sfx.play('slam');
          this.parts.groundMark(A.x, 0, A.z, 5.4, 'crater', 0xff9442, 3.2);
          this.parts.shockWall(A.x, 0.08, A.z, A.enraged ? 0xff4a24 : 0xff822e, 1.8, 9.5, 1.0, 3.4, 0.48, 5);
          this.parts.dustRing(A.x, 0.08, A.z, 18, 2.0, 0xd9c29e, 12, 2.8, 0.88);
          this.parts.chunks(A.x, 0.35, A.z, 18, 0x8a6d4b, 14, 0.32, 0.78, 26, 0.85);
          this.parts.sparks(A.x, 0.6, A.z, 32, 0xff7a24, 16, 0.2, 0.55, { grav: 16, up: 0.75, hdr: 4.2, stretch: 4.8, altColor: 0xffe169 });
          this.parts.flash(A.x, 1.8, A.z, 0xff7a24, 16, 0.36, 17);
          const d2 = Math.hypot(k.x - A.x, k.z - A.z);
          if (d2 < 3.8 && k.y < 2) this.hurtKenji(24 * c.dmg, A.x, A.z, 18);
          this.hitAlliesNear(A.x, A.z, 3.8, 16 * c.dmg);
          this.spawnShock(A.x, A.z, 15 + this.course, 19, true, 15 * c.dmg);
          A.cdSlam = 6.5;
          if (A.enraged && A.slamChain < 2) {
            A.slamChain++;
            this.setA('slamWind');
            A.t = 0.2 * tele;
          } else {
            A.slamChain = 0;
            this.recover(1.15 * tele);
          }
        }
        break;
      }
      case 'throwWind': {
        A.heading = angLerp(A.heading, toK, 8 * dt);
        if (A.t >= 0.6 * tele) {
          const n = c.throwN;
          const base = Math.atan2(k.x + k.vx * 0.35 - A.x, k.z + k.vz * 0.35 - A.z);
          const speed = 26 + this.course * 1.8;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.19;
            const mesh = makeChopsticks();
            mesh.position.set(A.x + Math.sin(a) * 2, 1.1, A.z + Math.cos(a) * 2);
            mesh.rotation.y = a;
            this.scene.add(mesh);
            this.projs.push({
              mesh,
              x: mesh.position.x,
              y: 1.1,
              z: mesh.position.z,
              vx: Math.sin(a) * speed,
              vy: 0,
              vz: Math.cos(a) * speed,
              life: 3.1,
              dmg: 11 * c.dmg,
              kind: 'chopstick',
            });
          }
          this.sfx.play('throw');
          A.volleys++;
          if (A.volleys < c.volleys) A.t = 0.24 * tele;
          else {
            A.cdThrow = Math.max(3.4, 4.8 - this.course * 0.16);
            this.recover(0.44);
          }
        }
        break;
      }
      case 'dashWind': {
        if (A.t < 0.68 * tele) A.heading = angLerp(A.heading, toK, 8 * dt);
        if (A.t >= 0.95 * tele) {
          A.dashHit = false;
          this.setA('dash');
        }
        break;
      }
      case 'dash': {
        const hx = Math.sin(A.heading);
        const hz = Math.cos(A.heading);
        A.x += hx * 38 * dt;
        A.z += hz * 38 * dt;
        const r = this.resolve(A.x, A.z, 1.5);
        const cx = clamp(r.x, -BOUND, BOUND);
        const cz = clamp(r.z, -BOUND, BOUND);
        const blocked = r.hit || cx !== r.x || cz !== r.z;
        A.x = cx;
        A.z = cz;
        A.walk += dt * 40;
        if (Math.random() < dt * 48) this.parts.chargeTrail(A.x, 0, A.z, hx, hz, 'boss');
        if (!A.dashHit && Math.hypot(k.x - A.x, k.z - A.z) < 2.9 && k.y < 2.2) {
          if (this.hurtKenji(22 * c.dmg, A.x - hx, A.z - hz, 20)) A.dashHit = true;
        }
        this.hitAlliesNear(A.x + hx * 1.2, A.z + hz * 1.2, 2.6, 12 * c.dmg);
        if (blocked && A.t > 0.08) {
          A.cdDash = 9;
          this.addShake(1);
          this.sfx.play('slam');
          const cx2 = A.x + hx * 1.4;
          const cz2 = A.z + hz * 1.4;
          this.parts.hitBurst(cx2, 2.2, cz2, 0xffd23f, 2.1, -hx, -hz);
          this.parts.shockWall(A.x, 0.08, A.z, 0xffb347, 1.2, 7.2, 1.0, 3.2, 0.42, 7);
          this.parts.groundMark(A.x, 0, A.z, 4.4, 'crater', 0xffaa4d, 2.6);
          this.parts.dustRing(A.x, 0.1, A.z, 14, 1.2, 0xdfd0b5, 9.5, 2.4, 0.78);
          this.floatText(A.x, 5.8, A.z, 'CRASH!', 'crit');
          this.damageAllen(18 + 5 * this.course, 0);
          if (A.hp > 0) this.stunAllen(2.5, true);
        } else if (A.t >= 0.8) {
          A.cdDash = 9;
          this.recover(0.9 * tele);
        }
        break;
      }
      case 'summon': {
        if (!A.summoned && A.t >= 0.45) {
          A.summoned = true;
          this.spawnBots(c.bots);
          this.say(
            'Allen',
            pick([
              'Kitchen brigade — ORDER UP!',
              'Sous-chefs, tenderize that pork!',
              'Turn up the heat! Not a single hog leaves!',
              'Bring the skewers, the sauce, AND the mallet!',
            ]),
            2.8,
          );
        }
        if (A.t >= 0.88) {
          A.cdSummon = c.waveCd;
          this.setA('chase');
        }
        break;
      }
      case 'toEat': {
        const e = A.target;
        if (!e || e.hp <= 0) {
          A.hunger = 4;
          this.setA('chase');
          break;
        }
        this.moveAllen(A.eatX, A.eatZ, spd * 1.2, dt, true);
        const de = Math.hypot(A.eatX - A.x, A.eatZ - A.z);
        if (de < 1.6 || Math.hypot(e.x - A.x, e.z - A.z) < e.r + 0.8) {
          A.chompT = 0;
          this.setA('eating');
          this.say('Rickley', pick([`He's in the ${e.name.toLowerCase()}! Stop 'im, Kenji!`, `Not my ${e.name.toLowerCase()}!`, `Kenji! The ${e.name.toLowerCase()}!`]), 3);
        } else if (A.t > 9) {
          A.hunger = 5;
          this.setA('chase');
        }
        break;
      }
      case 'eating': {
        const e = A.target;
        if (!e) {
          this.setA('chase');
          break;
        }
        A.heading = angLerp(A.heading, Math.atan2(e.x - A.x, e.z - A.z), 6 * dt);
        e.hp = Math.max(0, e.hp - c.eatRate * dt);
        this.refreshEdible(e);
        A.chompT -= dt;
        if (A.chompT <= 0) {
          A.chompT = 0.26;
          this.sfx.play('chomp');
          const fx = Math.sin(A.heading);
          const fz = Math.cos(A.heading);
          this.parts.emit(A.x + fx * 1.8, 3.2, A.z + fz * 1.8, 4, e.crumb, 5, 0.22, 0.6);
        }
        if (this.farmPct() <= 0.01) this.gameOver('farm');
        if (e.hp <= 0) {
          A.hunger = c.hunger;
          A.target = null;
          this.floatText(e.x, 3, e.z, `${e.name.toUpperCase()} EATEN!`, 'hurt');
          this.say('Allen', pick(['*BURP* …needs salt.', 'Delicious. Now for the protein.', 'A fine side dish. Where is my main?']), 3);
          this.recover(0.9);
        } else if (A.t > 6) {
          A.hunger = c.hunger * 0.8;
          A.target = null;
          this.setA('chase');
        }
        break;
      }
      case 'shielded': {
        // invincible: hovers inside the Sauce Shield and rains dumplings until the jars are smashed
        A.heading = angLerp(A.heading, toK, 4 * dt);
        A.y = lerp(A.y, 1.3 + Math.sin(this.time * 2.4) * 0.22, 1 - Math.exp(-4 * dt));
        A.shieldT -= dt;
        A.rainT -= dt;
        if (A.rainT <= 0 && !kDead) {
          A.rainT = Math.max(0.9, 1.75 - this.course * 0.17);
          this.spawnRain(k.x + k.vx * 0.45, k.z + k.vz * 0.45, 14 * c.dmg, tele);
          if (this.course >= 2 && Math.random() < 0.55) {
            const a = Math.random() * TAU;
            this.spawnRain(k.x + Math.cos(a) * 5.5, k.z + Math.sin(a) * 5.5, 14 * c.dmg, tele);
          }
        }
        if (this.pots.length === 0) this.breakShield(true);
        else if (A.shieldT <= 0) this.breakShield(false);
        break;
      }
      case 'guard': {
        // he can only turn slowly behind the wok, so a quick roll gets behind him
        A.heading += clamp(angDiff(A.heading, toK), -1.5 * dt, 1.5 * dt);
        if (A.t >= 2.5) {
          A.cdGuard = Math.max(5, 9 - A.phase);
          A.swipes = 0;
          this.setA('swipeWind');
          A.t = 0.3 * tele;
        }
        break;
      }
      case 'rainCast': {
        A.heading = angLerp(A.heading, toK, 5 * dt);
        A.rainT -= dt;
        if (A.rainLeft > 0 && A.rainT <= 0 && !kDead) {
          A.rainLeft--;
          A.rainT = 0.34;
          const j = A.rainLeft % 2 ? 3 : 0;
          const a = Math.random() * TAU;
          this.spawnRain(k.x + k.vx * 0.5 + Math.cos(a) * j, k.z + k.vz * 0.5 + Math.sin(a) * j, 14 * c.dmg, tele);
        }
        if ((A.rainLeft <= 0 && A.t >= 1.2) || A.t > 5) {
          A.cdRain = 11;
          this.recover(0.7 * tele);
        }
        break;
      }
      case 'spinWind': {
        A.heading = angLerp(A.heading, toK, 6 * dt);
        if (A.t >= 0.85 * tele) {
          A.spinHitT = 0;
          this.setA('spin');
          this.sfx.play('swing');
        }
        break;
      }
      case 'spin': {
        // invincible whirl that chases Kenji, then leaves Allen dizzy
        A.heading = angLerp(A.heading, toK, 2.2 * dt);
        const sp = 8.4 + this.course * 0.3;
        A.x += Math.sin(A.heading) * sp * dt;
        A.z += Math.cos(A.heading) * sp * dt;
        const r = this.resolve(A.x, A.z, 1.5);
        A.x = clamp(r.x, -BOUND, BOUND);
        A.z = clamp(r.z, -BOUND, BOUND);
        A.walk += dt * 30;
        A.spinHitT -= dt;
        this.spinRibbonT -= dt;
        if (this.spinRibbonT <= 0) {
          this.spinRibbonT = 0.12;
          this.parts.slash({ x: A.x, y: 1.3 + rand(0, 1.5), z: A.z, heading: Math.random() * TAU, color: 0xff7a24, radius: 4.1, full: true, tiltZ: rand(-0.22, 0.22), spin: 22, dur: 0.22, rise: 1.5, hdr: 3.6 });
        }
        if (Math.random() < dt * 36) {
          this.parts.sparks(A.x, 1.2 + Math.random() * 2, A.z, 2, 0xff9a2e, 11, 0.16, 0.32, { grav: 6, hdr: 3.8, altColor: 0xffe169 });
          this.parts.dust(A.x, 0.25, A.z, 1, 0xdcc9ab, { spread: 1.6, speed: 5.5, rise: 1.6, size0: 0.65, size1: 2.2, life: 0.48 });
        }
        if (dist < 3.9 && k.y < 2.6 && A.spinHitT <= 0 && this.hurtKenji(16 * c.dmg, A.x, A.z, 19)) A.spinHitT = 0.5;
        this.hitAlliesNear(A.x, A.z, 3.6, 8 * c.dmg);
        if (A.t >= 2.6) {
          A.cdSpin = 15;
          A.poise = 0;
          this.setA('stunned');
          A.stunDur = 2.4;
          this.sfx.play('stun');
          this.floatText(A.x, 5.8, A.z, 'DIZZY!', 'crit');
        }
        break;
      }
      case 'recover': {
        if (A.t >= A.recoverDur) this.setA('chase');
        break;
      }
      case 'stunned': {
        if (A.t >= A.stunDur) {
          A.stunImmune = 6.5;
          A.globalCd = 0.45;
          this.setA('chase');
        }
        break;
      }
      case 'defeated': {
        if (A.t >= 1.6) {
          if (this.course >= COURSES.length - 1) this.setA('ko');
          else {
            A.sx = A.x;
            A.sz = A.z;
            this.setA('leaving');
            this.sfx.play('jump');
          }
        }
        break;
      }
      case 'leaving': {
        const p = Math.min(1, A.t / 1.7);
        A.x = lerp(A.sx, 0, p);
        A.z = lerp(A.sz, 74, p);
        A.y = Math.sin(p * PI) * 16;
        A.heading += dt * 14;
        if (p >= 1) this.endCourse();
        break;
      }
      case 'ko': {
        if (A.t >= 3.4 && this.screen === 'play') {
          this.screen = 'victory';
          this.sfx.play('win');
          this.keys.clear();
          this.unlock();
          this.emit();
        }
        break;
      }
      default:
        break;
    }
  }

  /* ───────────────────────── minions + projectiles ───────────────────────── */

  private spawnPathGuppy() {
    const m = makePathGuppy();
    const p = this.safePosition(GUPPY_END.x, GUPPY_END.z, 0.9);
    m.root.position.set(p.x, 0, p.z);
    m.root.rotation.y = 0.22;

    const ring = new THREE.Group();
    const rim = new THREE.Mesh(RING_GEO, HAZ_RING_MAT);
    const ringFill = new THREE.Mesh(DISC_GEO, HAZ_FILL_MAT);
    rim.scale.setScalar(GUPPY_SWING.radius);
    ring.add(rim, ringFill);
    ring.visible = false;
    this.scene.add(m.root, ring);

    this.bots.push({
      kind: 'guppy', behavior: 'waiting', m, x: p.x, z: p.z,
      hp: GUPPY_HP, maxHp: GUPPY_HP, rad: 0.85, heading: 0.22,
      bite: 0, stun: 0, kx: 0, kz: 0, chomp: 0, flash: 0, ph: 0,
      mode: 'idle', mt: 0, lx: 0, lz: 0, strafe: 1, ring, ringFill,
    });
  }

  private alertPathGuppy(b: PathGuppy) {
    b.behavior = 'chasing';
    b.mt = 0;
    b.bite = 0.35;
    this.sfx.play('hiss');
    this.say('Path Guppy', 'My path. My truffles!', 2.6);
  }

  private movePathGuppy(b: PathGuppy, x: number, z: number, speed: number, dt: number) {
    const heading = Math.atan2(x - b.x, z - b.z);
    const step = speed * dt;
    for (const offset of [0, 0.55 * b.strafe, -0.55 * b.strafe, 1.2 * b.strafe, -1.2 * b.strafe, 1.8 * b.strafe, -1.8 * b.strafe]) {
      const a = heading + offset;
      const vx = Math.sin(a) * step;
      const vz = Math.cos(a) * step;
      if (this.resolve(b.x + vx * 2, b.z + vz * 2, b.rad).hit) continue;
      b.x += vx;
      b.z += vz;
      b.heading = angLerp(b.heading, a, dt * 11);
      if (offset !== 0) b.strafe = Math.sign(offset);
      return true;
    }
    b.strafe *= -1;
    return false;
  }

  private updatePathGuppy(b: PathGuppy, dt: number) {
    const k = this.k;
    const toKenji = Math.hypot(k.x - b.x, k.z - b.z);
    const outOfTerritory = Math.hypot(k.x - GUPPY_END.x, k.z - GUPPY_END.z) > GUPPY_TERRITORY;
    const playable = k.action !== 'dead' && !this.overReason;
    let moving = false;
    let swing = 0;
    b.mt += dt;
    if (b.ring) b.ring.visible = false;

    if (playable) {
      if (b.behavior === 'waiting' && toKenji <= GUPPY_ALERT_RANGE) this.alertPathGuppy(b);
      if (b.behavior !== 'waiting' && b.behavior !== 'returning' && outOfTerritory) {
        b.behavior = 'returning';
        b.mt = 0;
      }

      if (b.stun <= 0) {
        if (b.behavior === 'returning') {
          if (toKenji < GUPPY_ALERT_RANGE && !outOfTerritory) {
            b.behavior = 'chasing';
          } else if (Math.hypot(b.x - GUPPY_END.x, b.z - GUPPY_END.z) < 0.55 || (b.mt > 8 && outOfTerritory && toKenji > 16)) {
            b.x = GUPPY_END.x;
            b.z = GUPPY_END.z;
            b.heading = 0.22;
            b.behavior = 'waiting';
          } else {
            moving = this.movePathGuppy(b, GUPPY_END.x, GUPPY_END.z, 6.8, dt);
          }
        } else if (b.behavior === 'chasing') {
          const a = Math.atan2(k.x - b.x, k.z - b.z);
          b.heading = angLerp(b.heading, a, dt * 12);
          if (toKenji <= 2.75 && b.bite <= 0) {
            b.behavior = 'windup';
            b.mt = 0;
            b.heading = a;
            this.sfx.play('roll');
          } else if (toKenji > 1.75) {
            moving = this.movePathGuppy(b, k.x, k.z, 8.5, dt);
          }
        } else if (b.behavior === 'windup') {
          const fx = Math.sin(b.heading);
          const fz = Math.cos(b.heading);
          const x = b.x + fx * GUPPY_SWING.offset;
          const z = b.z + fz * GUPPY_SWING.offset;
          const progress = clamp(b.mt / GUPPY_SWING.windup, 0, 1);
          swing = -2.2 * Math.pow(progress, 0.7);
          if (progress >= 1) {
            b.behavior = 'recovering';
            b.mt = 0;
            b.bite = 0.95;
            this.sfx.play('swing');
            this.parts.slash({ x: b.x, y: 1.07, z: b.z, heading: b.heading, color: 0xf4b962, radius: 2.95, wide: true, tiltZ: -0.32, spin: 8, dur: 0.26, hdr: 2.5 });
            if (k.y < 1.4 && Math.hypot(k.x - x, k.z - z) < GUPPY_SWING.radius) {
              this.hurtKenji(18, b.x, b.z, 11);
            }
          } else if (b.ring && b.ringFill) {
            b.ring.visible = true;
            b.ring.position.set(x, 0.13, z);
            b.ringFill.scale.setScalar(Math.max(0.05, GUPPY_SWING.radius * progress));
          }
        } else if (b.behavior === 'recovering') {
          swing = 0.8 * (1 - clamp(b.mt / 0.57, 0, 1));
          if (b.mt >= 0.57) b.behavior = 'chasing';
        }
      }
    }

    const r = this.resolve(b.x, b.z, b.rad);
    b.x = clamp(r.x, -FOREST_BOUND + b.rad, FOREST_BOUND - b.rad);
    b.z = clamp(r.z, -FOREST_BOUND + b.rad, FOREST_BOUND - b.rad);
    b.ph += moving ? dt * 13 : 0;
    const stride = moving ? Math.sin(b.ph) : 0;
    b.m.root.position.set(b.x, moving ? 0.08 * Math.abs(stride) : 0, b.z);
    b.m.root.rotation.y = b.heading;
    b.m.boots[0].rotation.x = -stride * 0.56;
    b.m.boots[1].rotation.x = stride * 0.56;
    b.m.arms[0].rotation.x = swing - stride * 0.42;
    b.m.arms[1].rotation.x = swing * 0.46 + stride * 0.42;
    b.m.anim.rotation.x = moving ? 0.14 : swing * 0.10;
    b.m.tail.rotation.y = Math.sin(this.time * (moving ? 10 : 3.5)) * 0.23;
    b.m.flash.emissive.setRGB(b.flash > 0 ? 0.26 : 0, b.flash > 0 ? 0.19 : 0, b.flash > 0 ? 0.10 : 0);
    updateHpBar(b.m.hp, b.hp, b.maxHp, this.camera.quaternion, b.behavior !== 'waiting' && b.behavior !== 'returning');
  }

  private dropGuppyTruffles(b: PathGuppy) {
    this.guppyDefeated = true;
    for (let i = 0; i < GUPPY_DROPS; i++) {
      const turn = i * TAU / GUPPY_DROPS;
      const p = this.safePosition(b.x + 1.4 * Math.sin(turn), b.z + 1.4 * Math.cos(turn), 0.4);
      this.spawnTruffle(p.x, p.z, true);
    }
    this.parts.sparks(b.x, 1.4, b.z, 24, 0xf3bd59, 9, 0.18, 0.65, { altColor: 0xd1ebad });
    this.parts.dust(b.x, 0.4, b.z, 7, 0xbfa679);
    this.sfx.play('pop');
    this.sfx.play('truffle');
    this.forestHint = 'Path Guppy is defeated. Pick up the truffles marked in gold.';
    this.say('Kenji', `Path Guppy dropped ${GUPPY_DROPS} truffles. Better pick them up!`, 4);
  }

  private damageBot(b: Bot, dmg: number, kx: number, kz: number, heavy = false) {
    if (b.hp <= 0) return;
    const d = Math.max(1, Math.round(dmg));
    b.hp -= d;
    b.flash = 0.12;
    this.stats.dealt += Math.min(d, Math.max(0, Math.ceil(b.hp + d)));
    if (b.kind === 'guppy') {
      if (b.hp <= 0) {
        this.stats.ko++;
        this.bots = this.bots.filter((o) => o !== b);
        this.dropGuppyTruffles(b);
        this.discardBot(b);
      } else {
        if (b.behavior === 'waiting' || b.behavior === 'returning') this.alertPathGuppy(b);
        b.kx = kx * 0.56;
        b.kz = kz * 0.56;
        if (heavy || b.behavior !== 'windup') b.stun = Math.max(b.stun, heavy ? 0.34 : 0.16);
        if (heavy && b.behavior === 'windup') {
          b.behavior = 'recovering';
          b.mt = 0;
          b.bite = 1.0;
          if (b.ring) b.ring.visible = false;
        }
        this.floatText(b.x, 3.4, b.z, String(d), heavy ? 'crit' : 'dmg');
        this.parts.hitBurst(b.x, 1.72, b.z, 0xf4b962, 0.78);
      }
      return;
    }
    // Tenderizer Brutes have heavy butcher-block armor that shrugs off light knockback & flinch
    const kbMul = b.kind === 'tenderizer' ? 0.32 : b.kind === 'bomber' && b.mode === 'fuse' ? 1.45 : 1;
    b.kx = kx * kbMul;
    b.kz = kz * kbMul;
    if (b.kind !== 'tenderizer' || heavy) {
      if (b.mode !== 'fuse') b.stun = Math.max(b.stun, b.kind === 'tenderizer' ? 0.25 : 0.35);
      if (b.kind === 'tenderizer' && heavy && b.mode === 'wind') {
        b.mode = 'idle';
        b.bite = 1.4;
        if (b.ring) b.ring.visible = false;
      }
    }
    this.floatText(b.x + rand(-0.35, 0.35), (b.kind === 'tenderizer' ? 3.2 : 2.1), b.z, String(d), heavy ? 'crit' : 'dmg');
    this.parts.hitBurst(b.x, b.kind === 'tenderizer' ? 1.6 : 1.05, b.z, 0xff9a2e, 0.8);
    if (b.hp <= 0) {
      this.stats.ko++;
      this.bots = this.bots.filter((o) => o !== b);
      // Killing a lit Kettle Bomber still pops a smaller blast that damages nearby enemies (not Kenji if sniped!)
      if (b.kind === 'bomber' && b.mode === 'fuse') {
        this.parts.hitBurst(b.x, 1.2, b.z, 0xff4a1f, 1.9);
        this.parts.shockWall(b.x, 0.08, b.z, 0xff6a1f, 0.8, 4.6, 0.8, 2.8, 0.38, 10);
        this.parts.groundMark(b.x, 0, b.z, 3.6, 'crater', 0xff7a2e, 2.2);
        this.sfx.play('slam');
        for (const o of [...this.bots]) {
          if (Math.hypot(o.x - b.x, o.z - b.z) < 4.4) this.damageBot(o, 45, (o.x - b.x) * 4, (o.z - b.z) * 4, true);
        }
        this.hitPots(b.x, b.z, 4.4, 42);
      } else {
        const col = b.kind === 'spitter' ? 0xff3b1f : 0xff6a1a;
        this.parts.hitBurst(b.x, 1.15, b.z, col, b.kind === 'tenderizer' ? 1.9 : 1.45);
        this.parts.shockWall(b.x, 0.08, b.z, col, 0.6, b.kind === 'tenderizer' ? 4.8 : 3.6, 0.5, 2.2, 0.32, 9);
        this.parts.chunks(b.x, 1.0, b.z, 14, b.kind === 'spitter' ? 0xd9251d : b.kind === 'tenderizer' ? 0xc6935a : 0x2f3138, 10, 0.28, 0.7);
        this.parts.dust(b.x, 0.6, b.z, 7, 0x5c524a, { spread: 0.5, speed: 4.5, rise: 2.8, size0: 0.6, size1: 2.3, life: 0.68 });
        this.sfx.play('pop');
      }
      this.spawnTruffle(b.x, b.z, true);
      if (b.kind === 'tenderizer') this.spawnTruffle(b.x, b.z, true);
      this.discardBot(b);
    }
  }

  /** Kettle Bomber fuse reaches zero: huge fiery steam blast hurting Kenji, hogs, and even nearby bots/jars! */
  private detonateBomber(b: Bot, dmgMul: number) {
    if (b.hp <= 0) return;
    b.hp = 0;
    this.bots = this.bots.filter((o) => o !== b);
    const R = 4.6;
    this.sfx.play('slam');
    this.sfx.play('pop');
    this.addShake(0.75);
    this.parts.hitBurst(b.x, 1.2, b.z, 0xff4a1a, 2.2);
    this.parts.shockWall(b.x, 0.08, b.z, 0xff5a1f, 0.9, R * 1.15, 1.0, 3.6, 0.44, 10);
    this.parts.groundMark(b.x, 0, b.z, R * 0.88, 'crater', 0xff7a2e, 2.8);
    this.parts.dustRing(b.x, 0.1, b.z, 14, 1.0, 0xd8c2a6, 10, 2.4, 0.75);
    this.parts.chunks(b.x, 1.0, b.z, 16, 0xd46b34, 13, 0.28, 0.72);
    const k = this.k;
    if (Math.hypot(k.x - b.x, k.z - b.z) < R && k.y < 2.6) this.hurtKenji(21 * dmgMul, b.x, b.z, 19);
    // Devastating to rebel hogs if you don't knock the bomber away or kill it!
    this.hitAlliesNear(b.x, b.z, R, 24 * dmgMul);
    for (const o of [...this.bots]) {
      if (Math.hypot(o.x - b.x, o.z - b.z) < R) this.damageBot(o, 42, (o.x - b.x) * 4, (o.z - b.z) * 4, true);
    }
    this.hitPots(b.x, b.z, R, 45);
    this.discardBot(b);
  }

  /** Picks a target for an enemy bot: Kenji or a nearby rebel hog (so hogs are genuinely threatened!). */
  private pickBotTarget(b: Bot, hogBias = 0.75): { x: number; z: number; ally: Ally | null } {
    const k = this.k;
    let bestX = k.x;
    let bestZ = k.z;
    let bestAlly: Ally | null = null;
    let bestScore = Math.hypot(k.x - b.x, k.z - b.z);
    for (const a of this.allies) {
      if (a.dying > 0 || a.hp <= 0) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z) * hogBias;
      if (d < bestScore && d < 9) {
        bestScore = d;
        bestX = a.x;
        bestZ = a.z;
        bestAlly = a;
      }
    }
    return { x: bestX, z: bestZ, ally: bestAlly };
  }

  private spawnPuddle(x: number, z: number, dmg: number) {
    // cap active chili puddles for crisp readability & performance
    while (this.puddles.length >= 6) {
      const old = this.puddles.shift()!;
      this.scene.remove(old.mesh);
      old.mat.dispose();
    }
    const r = 2.75;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff3414).multiplyScalar(1.8),
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -7,
      polygonOffsetUnits: -14,
    });
    const mesh = new THREE.Mesh(DISC_GEO, mat);
    mesh.position.set(x, 0.09, z);
    mesh.scale.setScalar(r);
    mesh.userData.noAO = true;
    this.scene.add(mesh);
    this.puddles.push({ mesh, mat, x, z, r, life: 5.2, maxLife: 5.2, tick: 0.25, dmg });
    this.sfx.play('sizzle');
    this.parts.sparks(x, 0.35, z, 14, 0xff4a1a, 8, 0.16, 0.4, { grav: 16, up: 0.85, hdr: 3.8, altColor: 0xffc83d });
  }

  private updatePuddles(dt: number) {
    if (!this.puddles.length) return;
    const k = this.k;
    this.puddles = this.puddles.filter((pd) => {
      pd.life -= dt;
      if (pd.life <= 0) {
        this.scene.remove(pd.mesh);
        pd.mat.dispose();
        return false;
      }
      const fade = Math.min(1, pd.life / 1.1);
      const pulse = 1 + Math.sin(this.time * 9 + pd.x) * 0.04;
      pd.mesh.scale.setScalar(pd.r * pulse);
      pd.mat.opacity = 0.56 * fade;
      if (Math.random() < dt * 10) {
        const a = Math.random() * TAU;
        const rr = Math.sqrt(Math.random()) * pd.r * 0.85;
        this.parts.motes(pd.x + Math.cos(a) * rr, 0.18, pd.z + Math.sin(a) * rr, 1, 0xff5a1a, 1.4, 0.13, 0.42, -2.5, 0, 0.1, 3.6);
      }
      pd.tick -= dt;
      if (pd.tick <= 0) {
        pd.tick = 0.45;
        if (k.y < 0.55 && Math.hypot(k.x - pd.x, k.z - pd.z) < pd.r) {
          this.hurtKenji(pd.dmg, pd.x, pd.z, 6);
        }
        // Sizzling chili burns rebel hogs who step in it!
        this.hitAlliesNear(pd.x, pd.z, pd.r, pd.dmg * 0.85);
      }
      return true;
    });
  }

  private updateMemorials(dt: number) {
    if (!this.memorials.length) return;
    this.memorials = this.memorials.filter((mm) => {
      mm.life -= dt;
      if (mm.life <= 0) {
        this.discard(mm.mesh);
        return false;
      }
      if (mm.life < 1.2) mm.mesh.scale.setScalar(Math.max(0.01, mm.life / 1.2));
      return true;
    });
  }

  private updateBots(dt: number) {
    const k = this.k;
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    const camQ = this.camera.quaternion;

    for (const b of [...this.bots]) {
      if (b.hp <= 0) continue;
      b.bite -= dt;
      b.stun = Math.max(0, b.stun - dt);
      b.chomp = Math.max(0, b.chomp - dt);
      b.flash = Math.max(0, b.flash - dt);
      b.x += b.kx * dt;
      b.z += b.kz * dt;
      const damp = Math.exp(-6 * dt);
      b.kx *= damp;
      b.kz *= damp;

      if (b.kind === 'guppy') {
        this.updatePathGuppy(b, dt);
        continue;
      }

      const tgt = this.pickBotTarget(b, b.kind === 'skewer' || b.kind === 'grill' ? 0.82 : 0.92);
      const dx = tgt.x - b.x;
      const dz = tgt.z - b.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const toT = Math.atan2(dx, dz);
      const active = b.stun <= 0 && k.action !== 'dead' && !this.overReason;
      let hop = 0;

      switch (b.kind) {
        case 'grill': {
          if (active) {
            b.heading = angLerp(b.heading, toT, 9 * dt);
            const sp = 8.0 + this.course * 0.22;
            if (d > 1.35) {
              b.x += (dx / d) * sp * dt;
              b.z += (dz / d) * sp * dt;
            }
            if (b.bite <= 0) {
              const dk = Math.hypot(k.x - b.x, k.z - b.z);
              if (dk < 1.95 && k.y < 1.5) {
                b.bite = 0.95;
                b.chomp = 0.3;
                this.sfx.play('chomp');
                this.hurtKenji(7.5 * c.dmg, b.x, b.z, 9);
              } else if (tgt.ally && d < 1.85) {
                b.bite = 1.0;
                b.chomp = 0.3;
                this.sfx.play('chomp');
                this.hurtAlly(tgt.ally, 8 * c.dmg);
              }
            }
          }
          b.ph += dt * 12;
          hop = b.stun > 0 ? 0 : Math.abs(Math.sin(b.ph)) * 0.26;
          b.m.anim.rotation.x = b.chomp > 0 ? -0.95 * Math.sin((b.chomp / 0.3) * PI) : -0.12 - Math.abs(Math.sin(b.ph * 0.5)) * 0.25;
          break;
        }

        case 'spitter': {
          // Ranged Sriracha bottle: maintains mid-range, strafes, and lobs sizzling chili bombs!
          if (active) {
            b.heading = angLerp(b.heading, toT, 8 * dt);
            const sp = 6.2 + this.course * 0.15;
            let mx = 0;
            let mz = 0;
            if (d > 14.5) {
              mx = dx / d;
              mz = dz / d;
            } else if (d < 7.5) {
              mx = (-dx / d) * 0.85;
              mz = (-dz / d) * 0.85;
            } else {
              mx = (-dz / d) * b.strafe * 0.7;
              mz = (dx / d) * b.strafe * 0.7;
            }
            b.x += mx * sp * dt;
            b.z += mz * sp * dt;
            if (b.bite <= 0 && d < 22) {
              b.bite = Math.max(2.3, 3.4 - this.course * 0.14);
              b.chomp = 0.36;
              // lead Kenji slightly if targeting Kenji
              const aimX = tgt.ally ? tgt.x : clamp(k.x + k.vx * 0.32, -BOUND + 2, BOUND - 2);
              const aimZ = tgt.ally ? tgt.z : clamp(k.z + k.vz * 0.32, -BOUND + 2, BOUND - 2);
              const adx = aimX - b.x;
              const adz = aimZ - b.z;
              const flight = clamp(Math.hypot(adx, adz) / 18, 0.45, 1.15);
              const glob = makeChiliGlob();
              glob.position.set(b.x, 2.6, b.z);
              glob.rotation.y = Math.atan2(adx, adz);
              this.scene.add(glob);
              this.projs.push({
                mesh: glob,
                x: b.x,
                y: 2.6,
                z: b.z,
                vx: adx / flight,
                vy: (0.2 - 2.6 + 0.5 * 22 * flight * flight) / flight,
                vz: adz / flight,
                life: flight + 0.3,
                dmg: 8.5 * c.dmg,
                kind: 'chili',
              });
              this.sfx.play('throw');
              this.parts.sparks(b.x, 2.7, b.z, 6, 0xff4a1a, 6, 0.13, 0.25, { hdr: 3.6 });
            }
          }
          b.ph += dt * 9;
          hop = b.stun > 0 ? 0 : Math.abs(Math.sin(b.ph)) * 0.14;
          const sq = b.chomp > 0 ? 1 - 0.26 * Math.sin((b.chomp / 0.36) * PI) : 1;
          b.m.anim.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
          break;
        }

        case 'skewer': {
          // Skewer Hound: stalks, crouches with a red aim flash, then lunges at 27 m/s piercing everything!
          if (!active) {
            b.mode = 'idle';
          } else if (b.mode === 'idle') {
            b.heading = angLerp(b.heading, toT, 9 * dt);
            const sp = 7.6 + this.course * 0.2;
            if (d > 6.5) {
              b.x += (dx / d) * sp * dt;
              b.z += (dz / d) * sp * dt;
            } else {
              b.x += (-dz / d) * b.strafe * sp * 0.75 * dt;
              b.z += (dx / d) * b.strafe * sp * 0.75 * dt;
            }
            if (b.bite <= 0 && d < 12.5 && d > 2.4) {
              b.mode = 'wind';
              b.mt = 0;
              b.heading = toT;
              this.parts.sparks(b.x + Math.sin(toT) * 1.4, 0.7, b.z + Math.cos(toT) * 1.4, 8, 0xff3b24, 7, 0.14, 0.28, { hdr: 4.2, altColor: 0xffe14d });
            }
          } else if (b.mode === 'wind') {
            b.mt += dt;
            if (b.mt < 0.36) b.heading = angLerp(b.heading, toT, 10 * dt);
            if (b.mt >= 0.54 * c.tele) {
              b.mode = 'lunge';
              b.mt = 0;
              b.lx = Math.sin(b.heading);
              b.lz = Math.cos(b.heading);
              b.chomp = 1; // tracks whether Kenji was pierced this lunge
              this.sfx.play('swing');
              this.parts.slash({ x: b.x + b.lx * 1.2, y: 0.75, z: b.z + b.lz * 1.2, heading: b.heading, color: 0xff5a24, radius: 1.9, dur: 0.22, spin: 0, hdr: 3.8 });
            }
          } else if (b.mode === 'lunge') {
            b.mt += dt;
            const lsp = 27 + this.course * 0.6;
            b.x += b.lx * lsp * dt;
            b.z += b.lz * lsp * dt;
            if (Math.random() < dt * 40) {
              this.parts.sparks(b.x - b.lx * 0.6, 0.65, b.z - b.lz * 0.6, 2, 0xff7a24, 7, 0.12, 0.2, { dirX: -b.lx, dirZ: -b.lz, focus: 0.8, hdr: 3.8 });
            }
            if (b.chomp > 0 && Math.hypot(k.x - b.x, k.z - b.z) < 1.85 && k.y < 1.7) {
              if (this.hurtKenji(12 * c.dmg, b.x - b.lx, b.z - b.lz, 14)) b.chomp = 0;
            }
            this.hitAlliesNear(b.x + b.lx * 0.6, b.z + b.lz * 0.6, 1.7, 13 * c.dmg);
            if (b.mt >= 0.36) {
              b.mode = 'idle';
              b.bite = Math.max(1.8, 2.7 - this.course * 0.1);
              b.strafe = -b.strafe;
            }
          }
          b.ph += dt * 13;
          b.m.anim.position.z = b.mode === 'wind' ? 0.22 : b.mode === 'lunge' ? 0.92 : 0.55;
          break;
        }

        case 'tenderizer': {
          // Armored Tenderizer Brute: relentless march + telegraphed AoE meat-mallet slam!
          const slamDur = 0.68 * c.tele;
          if (!active) {
            if (b.ring) b.ring.visible = false;
          } else if (b.mode === 'idle') {
            b.heading = angLerp(b.heading, toT, 6.5 * dt);
            const sp = 5.4 + this.course * 0.18;
            if (d > 2.4) {
              b.x += (dx / d) * sp * dt;
              b.z += (dz / d) * sp * dt;
            }
            if (b.bite <= 0 && d < 3.6) {
              b.mode = 'wind';
              b.mt = 0;
              b.lx = b.x + Math.sin(b.heading) * 1.5;
              b.lz = b.z + Math.cos(b.heading) * 1.5;
              this.sfx.play('roar');
            }
          } else if (b.mode === 'wind') {
            b.mt += dt;
            if (b.ring && b.ringFill) {
              b.ring.visible = true;
              b.ring.position.set(b.lx, 0.11, b.lz);
              b.ringFill.scale.setScalar(Math.max(0.05, 3.5 * Math.min(1, b.mt / slamDur)));
            }
            if (b.mt >= slamDur) {
              b.mode = 'idle';
              b.bite = Math.max(1.7, 2.5 - this.course * 0.08);
              b.chomp = 0.28;
              if (b.ring) b.ring.visible = false;
              this.sfx.play('slam');
              this.addShake(0.5);
              this.parts.hitBurst(b.lx, 0.7, b.lz, 0xff7a24, 1.45);
              this.parts.shockWall(b.lx, 0.08, b.lz, 0xff822e, 0.7, 3.8, 0.6, 2.2, 0.34, 6);
              this.parts.groundMark(b.lx, 0, b.lz, 3.2, 'crater', 0xff9a44, 2.2);
              this.parts.dustRing(b.lx, 0.08, b.lz, 10, 0.8, 0xdac4a2, 7.5, 1.9, 0.62);
              if (Math.hypot(k.x - b.lx, k.z - b.lz) < 3.5 && k.y < 2.1) {
                this.hurtKenji(16 * c.dmg, b.lx, b.lz, 16);
              }
              this.hitAlliesNear(b.lx, b.lz, 3.5, 17 * c.dmg);
            }
          }
          b.ph += dt * 7;
          hop = b.mode === 'idle' && b.stun <= 0 ? Math.abs(Math.sin(b.ph)) * 0.1 : 0;
          b.m.anim.rotation.x =
            b.mode === 'wind' ? lerp(-0.85, -2.95, Math.min(1, b.mt / (slamDur * 0.65))) : b.chomp > 0 ? -0.25 : -0.85 + Math.sin(b.ph) * 0.15;
          break;
        }

        case 'bomber': {
          // Kettle Bomber: sprints in, triggers screaming 1.05s fuse with blast circle, then BOOM!
          const fuseDur = Math.max(0.88, 1.12 * c.tele);
          if (b.mode === 'fuse') {
            b.mt += dt;
            if (b.ring && b.ringFill) {
              b.ring.visible = true;
              b.ring.position.set(b.x, 0.11, b.z);
              b.ringFill.scale.setScalar(Math.max(0.05, 4.6 * Math.min(1, b.mt / fuseDur)));
            }
            if (Math.random() < dt * 30) {
              this.parts.sparks(b.x, 1.95, b.z, 2, 0xff3b1f, 8, 0.14, 0.25, { dirY: 1, focus: 0.7, hdr: 4.2, altColor: 0xffe14d });
            }
            const swell = 1 + 0.22 * (b.mt / fuseDur) + Math.sin(this.time * 42) * 0.09;
            b.m.anim.scale.setScalar(swell);
            if (b.mt >= fuseDur) {
              this.detonateBomber(b, c.dmg);
              continue;
            }
          } else if (active) {
            b.heading = angLerp(b.heading, toT, 10 * dt);
            const sp = 9.6 + this.course * 0.22;
            b.x += (dx / d) * sp * dt;
            b.z += (dz / d) * sp * dt;
            if (d < 3.3) {
              b.mode = 'fuse';
              b.mt = 0;
              this.sfx.play('hiss');
              this.floatText(b.x, 2.6, b.z, 'HISS!!', 'hurt');
            }
          }
          b.ph += dt * 16;
          hop = b.mode === 'fuse' ? Math.abs(Math.sin(this.time * 36)) * 0.12 : Math.abs(Math.sin(b.ph)) * 0.24;
          break;
        }
      }

      // bot-bot separation & world collision
      for (const o of this.bots) {
        if (o === b || o.hp <= 0) continue;
        const ox = b.x - o.x;
        const oz = b.z - o.z;
        const minD = b.rad + o.rad + 0.35;
        const od = Math.hypot(ox, oz);
        if (od < minD && od > 0.001) {
          b.x += (ox / od) * (minD - od) * 0.5;
          b.z += (oz / od) * (minD - od) * 0.5;
        }
      }
      const r = this.resolve(b.x, b.z, b.rad);
      b.x = clamp(r.x, -BOUND, BOUND);
      b.z = clamp(r.z, -BOUND, BOUND);
      b.m.root.position.set(b.x, hop, b.z);
      b.m.root.rotation.y = b.heading;
      b.m.root.rotation.z = b.stun > 0 ? Math.sin(this.time * 30) * 0.14 : 0;
      const fuseGlow = b.kind === 'bomber' && b.mode === 'fuse' ? 0.6 + Math.sin(this.time * 38) * 0.4 : 0;
      const hitGlow = b.flash > 0 ? 0.85 : 0;
      b.m.flash.emissive.setRGB(Math.max(hitGlow, fuseGlow * 1.4), hitGlow, hitGlow);
      updateHpBar(b.m.hp, b.hp, b.maxHp, camQ, b.kind === 'tenderizer' && b.hp < b.maxHp, false);
    }
  }

  private updateProjectiles(dt: number) {
    const k = this.k;
    this.projs = this.projs.filter((p) => {
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if (p.kind === 'chili' && !p.friendly) {
        p.vy -= 22 * dt;
        p.y += p.vy * dt;
      }
      p.life -= dt;
      p.mesh.position.set(p.x, p.y, p.z);
      if (p.kind === 'chopstick') p.mesh.rotation.z += dt * 16;
      else p.mesh.rotation.x += dt * 10;

      if (Math.random() < dt * (p.friendly ? 45 : 24)) {
        const col = p.friendly ? 0x62f4ff : p.kind === 'chili' ? 0xff3b18 : 0xffaa44;
        this.parts.sparks(p.x, p.y, p.z, 1, col, 3, 0.11, 0.2, { grav: 1, hdr: p.friendly ? 4.0 : 3.2 });
      }
      let dead = p.life <= 0 || Math.abs(p.x) > 60 || Math.abs(p.z) > 60;
      // Arcing Sriracha chili glob splashes onto the ground into a burning chili puddle!
      if (!dead && p.kind === 'chili' && !p.friendly && p.y <= 0.22) {
        this.spawnPuddle(clamp(p.x, -BOUND + 1, BOUND - 1), clamp(p.z, -BOUND + 1, BOUND - 1), p.dmg * 0.72);
        if (Math.hypot(p.x - k.x, p.z - k.z) < 2.2 && k.y < 1.8) this.hurtKenji(p.dmg, p.x, p.z, 9);
        this.hitAlliesNear(p.x, p.z, 2.3, p.dmg);
        dead = true;
      }
      if (!dead && p.y < 2.2 && this.resolve(p.x, p.z, 0.25).hit) {
        if (p.kind === 'chili' && !p.friendly) this.spawnPuddle(p.x, p.z, p.dmg * 0.7);
        else this.parts.emit(p.x, p.y, p.z, 5, 0xffb057, 5, 0.2, 0.4);
        dead = true;
      }
      if (!dead && p.friendly) {
        const A = this.A;
        if (A.active && A.hp > 0 && Math.hypot(p.x - A.x, p.z - A.z) < 2.6) {
          if (this.damageAllen(p.dmg, 32)) {
            this.sfx.play('bighit');
            this.floatText(A.x, 5.6, A.z, 'PARRY HIT!', 'crit');
            this.parts.hitBurst(p.x, 2.2, p.z, 0x62f4ff, 1.75);
          }
          dead = true;
        }
        for (const b of [...this.bots]) {
          if (!dead && Math.hypot(p.x - b.x, p.z - b.z) < 1.5 + b.rad * 0.4) {
            this.damageBot(b, p.dmg * 1.4, p.vx * 0.3, p.vz * 0.3, true);
            dead = true;
          }
        }
      } else if (!dead) {
        if (p.y < 2.2 && Math.hypot(p.x - k.x, p.z - k.z) < 1.28 && k.y < 2) {
          if (this.hurtKenji(p.dmg, p.x - p.vx * 0.1, p.z - p.vz * 0.1, 10)) {
            if (p.kind === 'chili') this.spawnPuddle(p.x, p.z, p.dmg * 0.65);
            dead = true;
          }
        }
        // Enemy chopsticks can skewer rebel hogs in their flight path!
        if (!dead && p.kind === 'chopstick') {
          for (const a of this.allies) {
            if (a.dying <= 0 && a.hp > 0 && a.inv <= 0 && Math.hypot(p.x - a.x, p.z - a.z) < 1.05) {
              this.hurtAlly(a, p.dmg * 0.85);
              dead = true;
              break;
            }
          }
        }
      }
      if (dead) this.discard(p.mesh);
      return !dead;
    });

    this.kernels = this.kernels.filter((n) => {
      const A = this.A;
      const bot = n.bot;
      if (bot ? bot.hp <= 0 : !A.active || A.hp <= 0) {
        this.discard(n.mesh);
        return false;
      }
      const tx = bot ? bot.x : A.x;
      const ty = bot ? 1.1 : A.y + 2.6;
      const tz = bot ? bot.z : A.z;
      const dx = tx - n.x;
      const dy = ty - n.y;
      const dz = tz - n.z;
      const d = Math.hypot(dx, dy, dz) || 0.001;
      const step = 46 * dt;
      if (d < step + 1.2) {
        if (bot) this.damageBot(bot, n.dmg * 2, 0, 0);
        else this.damageAllen(n.dmg, 2, { minor: true, fx: n.x, fz: n.z });
        this.parts.emit(tx, ty, tz, 4, 0xf2c230, 5, 0.2, 0.35);
        this.discard(n.mesh);
        return false;
      }
      n.x += (dx / d) * step;
      n.y += (dy / d) * step;
      n.z += (dz / d) * step;
      n.mesh.position.set(n.x, n.y, n.z);
      return true;
    });
  }

  private updateShocks(dt: number) {
    const k = this.k;
    this.shocks = this.shocks.filter((s) => {
      s.r += s.speed * dt;
      s.mesh.scale.set(s.r, 1, s.r);
      s.mat.opacity = 0.9 * Math.max(0, 1 - s.r / s.maxR);
      if (s.hostile) {
        if (!s.hit && k.y < 0.8) {
          const d = Math.hypot(k.x - s.x, k.z - s.z);
          if (Math.abs(d - s.r) < 1.1) {
            if (this.hurtKenji(s.dmg, s.x, s.z, 12)) s.hit = true;
          }
        }
        // Hostile shockwaves also batter rebel hogs caught in the ring!
        for (const a of this.allies) {
          if (a.dying > 0 || a.hp <= 0 || s.hitAllies.has(a)) continue;
          if (Math.abs(Math.hypot(a.x - s.x, a.z - s.z) - s.r) < 1.0) {
            s.hitAllies.add(a);
            this.hurtAlly(a, s.dmg * 0.55);
          }
        }
      }
      if (s.r >= s.maxR) {
        this.scene.remove(s.mesh);
        s.mat.dispose();
        return false;
      }
      return true;
    });
  }

  /** Kingger personally backs Kenji up from Kingger Labs by firing Tesla-coil lightning arcs across the farm! */
  private updateKinggerZap(dt: number) {
    this.kingCast = Math.max(0, this.kingCast - dt);
    this.kingBarkCd = Math.max(0, this.kingBarkCd - dt);
    const lv = this.levels.zap;
    if (lv <= 0 || this.area !== 'farm' || this.mode !== 'combat' || this.overReason) return;
    this.kingZapT -= dt;
    if (this.kingZapT > 0) return;

    const coilX = 33.5;
    const coilY = 3.35;
    const coilZ = 29.5;
    const A = this.A;

    // Pick highest-priority target on the farm: lit Bombers -> Sauce Jars -> Kitchen Bots -> Allen
    type KTarget = { kind: 'bot' | 'pot' | 'allen'; x: number; y: number; z: number; bot?: Bot; pot?: Pot; score: number };
    const cands: KTarget[] = [];
    for (const b of this.bots) {
      if (b.hp <= 0) continue;
      const d = Math.hypot(b.x - this.k.x, b.z - this.k.z);
      const prio = b.kind === 'bomber' && b.mode === 'fuse' ? 0.25 : b.kind === 'spitter' ? 0.7 : 0.85;
      cands.push({ kind: 'bot', x: b.x, y: b.kind === 'tenderizer' ? 1.8 : 1.1, z: b.z, bot: b, score: d * prio });
    }
    for (const p of this.pots) {
      if (p.hp > 0) cands.push({ kind: 'pot', x: p.x, y: 1.5, z: p.z, pot: p, score: 8 });
    }
    if (A.active && A.hp > 0 && !A.shielded && A.state !== 'spin' && A.z < 56 && !['gone', 'defeated', 'leaving', 'ko'].includes(A.state)) {
      cands.push({ kind: 'allen', x: A.x, y: A.y + 2.8, z: A.z, score: 18 });
    }
    if (!cands.length) {
      this.kingZapT = 1.0;
      return;
    }
    cands.sort((a, b) => a.score - b.score);
    const hitCount = lv >= 3 ? Math.min(2, cands.length) : 1;
    const dmg = [0, 20, 30, 42][Math.min(lv, 3)];

    this.kingZapT = [0, 8.5, 6.0, 4.2][Math.min(lv, 3)];
    this.kingCast = 0.75;
    this.sfx.play('zap');

    // Bolt jumps from Kingger's hand -> Lab Tesla Coil -> Target (and chains at Lv 3!)
    this.parts.lightning(SPOT.kingger.x, 2.6, SPOT.kingger.z, coilX, coilY, coilZ, 0x7df9ff, 0.08, 0.34);
    this.parts.hitBurst(coilX, coilY, coilZ, 0x5ff2ff, 1.05);
    let px = coilX;
    let py = coilY;
    let pz = coilZ;
    for (let i = 0; i < hitCount; i++) {
      const t = cands[i];
      this.parts.lightning(px, py, pz, t.x, t.y, t.z, i === 0 ? 0x5ff2ff : 0xffe46b, 0.095, 0.34);
      this.parts.hitBurst(t.x, t.y, t.z, 0x5ff2ff, 1.25);
      if (t.kind === 'bot' && t.bot && t.bot.hp > 0) {
        t.bot.stun = Math.max(t.bot.stun, 1.2);
        this.damageBot(t.bot, dmg, 0, 0, true);
      } else if (t.kind === 'pot' && t.pot && t.pot.hp > 0) {
        this.damagePot(t.pot, dmg * 0.85);
      } else if (t.kind === 'allen') {
        this.damageAllen(dmg * 0.75, 14, { minor: true, fx: coilX, fz: coilZ });
      }
      px = t.x;
      py = t.y;
      pz = t.z;
    }
    if (this.kingBarkCd <= 0 && !this.subtitle && Math.random() < 0.42) {
      this.kingBarkCd = 20;
      this.say(
        'Kingger',
        pick([
          '1.21 JIGGAWATTS! Eat science, Hwang!',
          'Tesla coil at full capacitance — ZAP!',
          "Taste Ohm's Law, kitchen appliances!",
          'Covering fire from Kingger Labs!',
        ]),
        2.8,
      );
    }
  }

  private updateTurret(dt: number) {
    this.updateKinggerZap(dt);
    const lv = this.levels.cannon;
    if (lv <= 0 || this.mode !== 'combat') return;
    const A = this.A;
    let tx = 0;
    let tz = 0;
    let bot: Bot | null = null;
    let best = 48;
    let found = false;
    if (A.active && A.hp > 0 && !A.shielded && A.state !== 'spin' && A.state !== 'leaving' && A.z < 58) {
      const d = Math.hypot(A.x - SPOT.turret.x, A.z - SPOT.turret.z);
      if (d < best) {
        best = d;
        tx = A.x;
        tz = A.z;
        found = true;
      }
    }
    for (const b of this.bots) {
      const d = Math.hypot(b.x - SPOT.turret.x, b.z - SPOT.turret.z);
      if (d < best * 0.6) {
        best = d / 0.6;
        tx = b.x;
        tz = b.z;
        bot = b;
        found = true;
      }
    }
    if (!found) return;
    const h = this.turret.head;
    h.rotation.y = angLerp(h.rotation.y, Math.atan2(tx - SPOT.turret.x, tz - SPOT.turret.z), 8 * dt);
    this.turretT -= dt;
    if (this.turretT <= 0) {
      this.turretT = [1.5, 1.1, 0.8][lv - 1];
      const mesh = part(this.scene, sph(0.2, 6, 5), glow(0xffd23f, 1.2), SPOT.turret.x, 2.3, SPOT.turret.z, { shadow: false });
      this.kernels.push({ mesh, x: SPOT.turret.x, y: 2.3, z: SPOT.turret.z, bot, dmg: [5, 7, 10][lv - 1] });
      this.parts.emit(SPOT.turret.x, 2.3, SPOT.turret.z, 3, 0xf2c230, 4, 0.18, 0.3);
    }
  }

  private updatePickups(dt: number) {
    const k = this.k;
    const bound = this.mapBound();
    const magnet = this.levels.magnet > 0 ? 10 : 3;
    this.pickups = this.pickups.filter((p) => {
      if (p.area !== this.area) return true;
      p.age += dt;
      p.vy -= 30 * dt;
      p.y += p.vy * dt;
      if (p.y < 0.5) {
        p.y = 0.5;
        p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.4 : 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      const nx = clamp(p.x + p.vx * dt, -bound, bound);
      const nz = clamp(p.z + p.vz * dt, -bound, bound);
      if (p.area === 'forest') {
        const resolved = this.resolve(nx, nz, 0.35);
        p.x = resolved.x;
        p.z = resolved.z;
        if (resolved.hit) {
          p.vx *= -0.35;
          p.vz *= -0.35;
        }
      } else {
        p.x = nx;
        p.z = nz;
      }
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      const d = Math.hypot(dx, dz) || 0.001;
      if (p.age > 0.5 && k.action !== 'dead') {
        if (d < 1.5 && k.y < 2.5) {
          this.truffles += p.value;
          this.stats.earned += p.value;
          this.sfx.play('truffle');
          this.floatText(p.x, 1.8, p.z, `+${p.value}`, 'gold');
          this.parts.emit(p.x, 0.8, p.z, 6, 0xffc93c, 5, 0.18, 0.4, 6);
          this.discard(p.mesh);
          return false;
        }
        if (d < magnet) {
          const pull = (this.levels.magnet > 0 ? 20 : 12) * dt;
          p.x += (dx / d) * pull;
          p.z += (dz / d) * pull;
        }
      }
      p.mesh.position.set(p.x, p.y + Math.sin(this.time * 3 + p.x) * 0.12, p.z);
      p.mesh.rotation.y += dt * 2.5;
      return true;
    });
  }

  /* ───────────────────────── interaction ───────────────────────── */

  private updateInteract() {
    const k = this.k;
    this.prompt = null;
    if (k.action === 'dead' || this.overReason) return;
    const near = (p: { x: number; z: number }, r: number) => Math.hypot(k.x - p.x, k.z - p.z) < r;
    const e = this.pressed.has('KeyE');
    if (this.area === 'forest') {
      if (near(FOREST_EXIT, 6.5)) {
        this.prompt = `E|Return to the farm with ${this.hunt?.caught ?? 0} new recruits`;
        if (e) this.endHunt();
      }
      return;
    }
    if (this.mode === 'intermission') {
      if (!this.greeted.rickley && near(SPOT.rickley, 10)) {
        this.greeted.rickley = true;
        this.say('Rickley', pick(["Truffles for grit, Kenji. Fair trade.", "Eat up, son. Can't fight on an empty trough.", "Farm's countin' on ya. Let's toughen you up."]), 3.5);
      }
      if (!this.greeted.kingger && near(SPOT.kingger, 10)) {
        this.greeted.kingger = true;
        this.say('Kingger', pick(['Ah, test subject K! I have prototypes.', 'My models say rocket trotters raise survival odds 34%.', 'Technically it is "samgyeopsal", but yes — he wants to eat you.']), 3.5);
      }
      if (!this.greeted.trout && (near(SPOT.troutDock, 8.5) || near(SPOT.trout, 9.5))) {
        this.greeted.trout = true;
        this.leapTrout();
        this.say(
          'Trout',
          pick([
            "Name's Trout. I'm a trout. Step onto my dock and I'll teach you combos that slap.",
            "Blub! Your footwork's sloppy, pig. Come learn the Way of the Wet Fin!",
            "Float like a lily pad, crack ribs like a river rock. Bring truffles to the dock!",
          ]),
          4.4,
        );
      }
      if (near(SPOT.rickley, 5.5)) {
        this.prompt = 'E|Trade with Rickley';
        if (e) this.openShop('rickley');
      } else if (near(SPOT.kingger, 5.5)) {
        this.prompt = 'E|Browse Kingger Labs';
        if (e) this.openShop('kingger');
      } else if (near(SPOT.troutDock, 5.2) || near(SPOT.trout, 6.2)) {
        this.prompt = "E|Train with Trout — learn combat moves & combos";
        if (e) {
          this.leapTrout();
          this.openShop('trout');
        }
      } else if (near(SPOT.hunt, 7)) {
        this.prompt = 'E|Travel to Slopwood Forest';
        if (e) this.startHunt();
      } else if (near(SPOT.bell, 5)) {
        this.prompt = `E|Ring the Dinner Bell — start Course ${this.course + 1}`;
        if (e) this.beginCourse();
      }
    } else if (near(SPOT.rickley, 5.5)) {
      this.prompt = 'E|Rickley (shop closed while Allen is here)';
      if (e) this.say('Rickley', pick(["Not now, Kenji — he's right behind ya!", 'Shop\'s closed till that glutton leaves!']), 2.5);
    } else if (near(SPOT.kingger, 5.5)) {
      this.prompt = 'E|Kingger (lab closed while Allen is here)';
      if (e) this.say('Kingger', pick(['Lab is in lockdown! Lead him into a wall when he dashes!', 'Jump the shockwaves! JUMP them!']), 2.8);
    } else if (near(SPOT.troutDock, 5.2) || near(SPOT.trout, 6.2)) {
      this.prompt = 'E|Trout (no lessons mid-brawl!)';
      if (e) {
        this.leapTrout();
        this.say('Trout', pick(['Class is OUT — use your combos on him, kid!', 'Roll in, uppercut, belly flop! Remember your kata!']), 2.8);
      }
    } else if (near(SPOT.hunt, 7)) {
      this.prompt = 'E|Forest trail closed - drive Allen off first';
      if (e) this.say('Rickley', 'Not now, Kenji! The farm needs you here.', 3);
    }
  }

  private openShop(npc: NpcId) {
    this.screen = 'shop';
    this.shopNpc = npc;
    this.keys.clear();
    this.pressed.clear();
    this.unlock();
    this.sfx.play('truffle');
    this.emit();
  }

  /* ───────────────────────── animation ───────────────────────── */

  private animateKenji(dt: number) {
    const k = this.k;
    const m = this.kModel;
    m.root.position.set(k.x, k.y, k.z);
    m.root.rotation.y = k.heading;
    const sp = Math.hypot(k.vx, k.vz);
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let sy = 1;
    let bob = 0;
    let legAmp = 0;
    let drop = 0;
    if (k.grounded && sp > 0.5) {
      k.walk += dt * (6 + sp * 1.4);
      legAmp = Math.min(0.9, sp * 0.09);
      bob = Math.abs(Math.sin(k.walk)) * 0.08;
    }
    switch (k.action) {
      case 'attack': {
        if (k.combo === 3) {
          const p = Math.min(1, k.t / 0.52);
          ry = p * TAU * 2;
          rx = 0.18;
          bob += Math.sin(p * PI) * 0.48;
          sy = 0.92;
        } else {
          const p = Math.min(1, k.t / (k.combo === 2 ? 0.42 : 0.27));
          const s = Math.sin(p * PI);
          rx = s * (k.combo === 2 ? 0.75 : 0.45);
          if (k.combo === 1) rz = s * 0.4;
          bob += s * (k.combo === 2 ? 0.55 : 0.1);
        }
        break;
      }
      case 'uppercut': {
        const p = Math.min(1, k.t / 0.4);
        rx = -Math.sin(p * PI) * 0.95;
        ry = p * TAU;
        sy = 1.18;
        break;
      }
      case 'bellyflop': {
        if (!k.hitDone) {
          rx = 0.35;
          sy = 0.68;
        } else {
          const p = Math.min(1, k.t / 0.22);
          sy = lerp(0.55, 1.0, p);
        }
        break;
      }
      case 'tailwhip': {
        const p = Math.min(1, k.t / 0.28);
        ry = -p * TAU;
        rz = Math.sin(p * PI) * 0.25;
        bob += Math.sin(p * PI) * 0.22;
        break;
      }
      case 'roll':
        rx = (k.t / 0.42) * TAU;
        sy = 0.85;
        break;
      case 'charge':
        rx = k.riverRush ? 0.4 : 0.3;
        sy = k.riverRush ? 0.9 : 1;
        legAmp = 1.1;
        k.walk += dt * (k.riverRush ? 38 : 30);
        break;
      case 'zap': {
        const p = Math.min(1, k.t / 0.28);
        rx = -Math.sin(p * PI) * 0.55;
        sy = 1 + Math.sin(p * PI) * 0.24;
        bob += Math.sin(p * PI) * 0.32;
        break;
      }
      case 'squeal':
        rx = -0.5;
        sy = 1 + Math.sin(Math.min(1, k.t / 0.35) * PI) * 0.3;
        break;
      case 'hurt':
        rx = -0.6;
        break;
      case 'dead': {
        const p = Math.min(1, k.t * 3);
        rz = (p * PI) / 2;
        drop = p * 0.2;
        break;
      }
      default:
        if (!k.grounded) rx = clamp(-k.vy * 0.03, -0.4, 0.4);
        break;
    }
    m.pivot.rotation.set(rx, ry, rz);
    const sxz = 1 / Math.sqrt(sy);
    m.pivot.scale.set(sxz, sy, sxz);
    m.pivot.position.y = 0.75 + bob - drop;
    const sw = Math.sin(k.walk) * legAmp;
    const tuck = !k.grounded && k.action !== 'dead' ? 0.7 : 0;
    m.legs[0].rotation.x = tuck ? -tuck : sw;
    m.legs[1].rotation.x = tuck ? -tuck : -sw;
    m.legs[2].rotation.x = tuck ? tuck : -sw;
    m.legs[3].rotation.x = tuck ? tuck : sw;
    m.tail.rotation.z = Math.sin(this.time * 9) * 0.3;
    m.earL.rotation.x = 0.35 + bob * 3;
    m.earR.rotation.x = 0.35 + bob * 3;
    m.root.visible = k.blink > 0 ? Math.floor(this.time * 22) % 2 === 0 : true;
    m.skin.color.lerp(this.tmpC.setHex(k.muddy > 0 ? 0x9a6a4e : 0xf7a8b8), 1 - Math.exp(-4 * Math.max(dt, 0.001)));
  }

  private animateAllen(dt: number) {
    const A = this.A;
    const m = this.aModel;
    if (!A.active) return;
    m.root.position.set(A.x, A.y, A.z);
    m.root.rotation.y = A.heading + (A.state === 'spin' ? this.time * 17 : 0);
    let aR = -0.95;
    let aL = -0.35;
    let lean = 0;
    let squash = 1;
    let jaw = 1;
    let leg = 0;
    let head = 0;
    let fall = 0;
    const t = A.t;
    const T = this.time;
    switch (A.state) {
      case 'enter':
      case 'chase':
      case 'toEat':
        leg = Math.sin(A.walk) * 0.55;
        aL = -0.35 + Math.sin(A.walk) * 0.3;
        break;
      case 'swipeWind':
        aR = lerp(-0.95, -3.05, Math.min(1, t / 0.22));
        lean = -0.16;
        break;
      case 'swipe':
        aR = lerp(-3.05, -0.72, Math.min(1, t / 0.1));
        lean = 0.3;
        break;
      case 'slamWind':
        squash = 0.78;
        aR = -2.6;
        aL = -2.6;
        break;
      case 'slamAir':
        aR = -2.95;
        aL = -2.95;
        lean = 0.2;
        squash = 1.08;
        break;
      case 'throwWind':
        aL = lerp(-0.35, -3.0, Math.min(1, t / 0.3));
        lean = -0.1;
        break;
      case 'dashWind':
        lean = 0.42;
        squash = 0.9;
        aR = -1.55;
        leg = Math.sin(T * 30) * 0.3;
        break;
      case 'dash':
        lean = 0.6;
        aR = -1.6;
        aL = 0.8;
        leg = Math.sin(T * 40) * 0.8;
        break;
      case 'summon':
        aR = -2.95;
        aL = -2.95;
        jaw = 2.6;
        break;
      case 'eating':
        lean = 0.5;
        jaw = 1 + Math.abs(Math.sin(T * 16)) * 2.4;
        aR = -1.3 + Math.sin(T * 8) * 0.45;
        aL = -1.3 - Math.sin(T * 8) * 0.45;
        break;
      case 'shielded':
        aR = -2.95;
        aL = -2.95;
        lean = -0.1;
        jaw = 1 + Math.abs(Math.sin(T * 9)) * 1.8;
        break;
      case 'guard':
        aL = -1.5;
        aR = -0.5;
        lean = 0.12;
        squash = 0.94;
        break;
      case 'rainCast':
        aR = -3.0;
        aL = -3.0;
        lean = -0.22;
        jaw = 2.4;
        break;
      case 'spinWind':
        squash = 0.8;
        aR = -1.6;
        aL = -1.6;
        lean = 0.1;
        break;
      case 'spin':
        aR = -1.6;
        aL = -1.6;
        lean = 0.16;
        leg = Math.sin(T * 30) * 0.4;
        break;
      case 'stunned':
        lean = -0.12;
        aR = -0.2;
        aL = -0.1;
        head = Math.sin(T * 7) * 0.3;
        jaw = 2.2;
        break;
      case 'recover':
        lean = 0.16;
        break;
      case 'defeated':
        lean = -0.25;
        head = Math.sin(T * 12) * 0.35;
        aR = -0.1;
        aL = -0.1;
        jaw = 2.6;
        break;
      case 'leaving':
        aR = -2.95;
        aL = -2.95;
        jaw = 2.6;
        break;
      case 'ko':
        fall = Math.min(1, t * 1.8);
        aR = -0.4;
        aL = -0.4;
        jaw = 2.4;
        head = Math.sin(T * 3) * 0.1;
        break;
      default:
        break;
    }
    const s = 1 - Math.exp(-20 * Math.max(dt, 0.0005));
    m.armR.rotation.x = lerp(m.armR.rotation.x, aR, s);
    m.armL.rotation.x = lerp(m.armL.rotation.x, aL, s);
    m.pivot.rotation.x = lerp(m.pivot.rotation.x, lean - (fall * PI) / 2, s);
    const sq = lerp(m.pivot.scale.y, squash, s);
    m.pivot.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    m.pivot.position.y = Math.abs(Math.sin(A.walk)) * (leg !== 0 ? 0.12 : 0) + fall * 1.3;
    m.legL.rotation.x = leg;
    m.legR.rotation.x = -leg;
    m.jaw.scale.y = jaw;
    m.head.rotation.z = head;
    const f = A.flash > 0 ? 0.75 : 0;
    const e = A.enraged ? 0.2 + Math.sin(T * 8) * 0.08 : 0;
    const x = A.exposed > 0 ? 0.24 + Math.sin(T * 14) * 0.12 : 0;
    for (const mat of m.flashMats) mat.emissive.setRGB(f + e, f + x, f + x * 1.5);
    const dizzy = A.state === 'stunned' || A.state === 'defeated' || A.state === 'ko';
    m.stars.visible = dizzy;
    if (dizzy) m.stars.rotation.y = T * 5;

    const spinTele = A.state === 'spinWind';
    this.slamRing.visible = A.state === 'slamAir' || spinTele;
    this.slamRing.scale.setScalar(spinTele ? 4.1 : 4.2);
    if (spinTele) {
      this.slamRing.position.set(A.x, 0.1, A.z);
      this.slamFill.scale.setScalar(Math.min(1, t / 0.8));
    } else if (this.slamRing.visible) {
      this.slamRing.position.set(A.tx, 0.1, A.tz);
      this.slamFill.scale.setScalar(Math.min(1, t / A.airDur));
    }
    m.wok.visible = A.state === 'guard';
    this.shieldGroup.visible = A.shielded;
    if (A.shielded) {
      const hurry = A.shieldT < 5;
      this.shieldGroup.position.set(A.x, A.y + 2.9, A.z);
      this.shieldGroup.scale.setScalar(1 + Math.sin(T * (hurry ? 15 : 5)) * 0.035);
      this.shieldWire.rotation.y = T * 0.9;
      this.shieldWire.rotation.x = T * 0.5;
    }
    this.dashLine.visible = A.state === 'dashWind';
    if (this.dashLine.visible) {
      this.dashLine.position.set(A.x, 0.1, A.z);
      this.dashLine.rotation.y = A.heading;
      (this.dashLine.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.abs(Math.sin(T * 14)) * 0.3;
    }
  }

  private animateNpcs(dt: number) {
    if (this.area !== 'farm') return;
    const k = this.k;
    const T = this.time;
    const inter = this.screen !== 'title' && this.mode === 'intermission';
    const panic = this.mode === 'combat' && this.A.active;
    const each = (n: NpcModel, spot: { x: number; z: number }, ph: number) => {
      const dx = k.x - spot.x;
      const dz = k.z - spot.z;
      const d = Math.hypot(dx, dz);
      const face = this.screen === 'title' ? 0.3 : d < 22 ? Math.atan2(dx, dz) : Math.atan2(-spot.x, 8 - spot.z);
      n.root.rotation.y = angLerp(n.root.rotation.y, face, 5 * dt);
      n.body.position.y = Math.sin(T * 2 + ph) * 0.03 + (panic ? Math.abs(Math.sin(T * 9 + ph)) * 0.12 : 0);
      const wave = inter && d < 12 && d > 4;
      const target = panic ? -2.7 + Math.sin(T * 12 + ph) * 0.3 : wave ? -2.7 + Math.sin(T * 8) * 0.35 : 0;
      n.armR.rotation.x = lerp(n.armR.rotation.x, target, 1 - Math.exp(-10 * dt));
      n.head.rotation.z = Math.sin(T * 1.3 + ph) * 0.05;
      if (n.spin) n.spin.rotation.y += dt * (panic ? 30 : 9);
    };
    each(this.rick, SPOT.rickley, 0);
    each(this.king, SPOT.kingger, 2);
    if (this.kingCast > 0) {
      // Kingger thrusts his arm skyward & spins his propeller beanie at turbo speed while firing Lightning Zap!
      this.king.armR.rotation.x = -3.05;
      if (this.king.spin) this.king.spin.rotation.y += dt * 45;
    }
    this.animateTrout(dt, inter, panic);
    const markerY = [4.3, 4.1, 5.4, 7.6, 3.2];
    this.markers.forEach((m, i) => {
      m.visible = inter;
      m.rotation.y = T * 2 + i;
      m.position.y = (markerY[i] ?? 4.2) + Math.sin(T * 3 + i) * 0.2;
    });
  }

  private leapTrout() {
    if (this.area !== 'farm' || this.troutLeap > 0) return;
    this.troutLeap = 0.001;
    this.troutLeapNext = rand(9, 15);
    if (this.screen === 'play' || this.screen === 'shop') this.sfx.play('splash');
    this.parts.emit(SPOT.trout.x, 0.22, SPOT.trout.z, 12, 0x8ae8ff, 6, 0.2, 0.5, 14, 0.9);
  }

  private animateTrout(dt: number, inter: boolean, panic: boolean) {
    const tr = this.trout;
    const k = this.k;
    const T = this.time;
    const dx = k.x - SPOT.trout.x;
    const dz = k.z - SPOT.trout.z;
    const d = Math.hypot(dx, dz);
    const face = d < 20 && this.screen !== 'title' ? Math.atan2(dx, dz) : PI / 2;
    tr.root.rotation.y = angLerp(tr.root.rotation.y, face, 5 * dt);

    // occasional playful rainbow-trout breach
    if (this.troutLeap > 0) {
      this.troutLeap += dt;
      if (this.troutLeap >= 0.82) {
        this.troutLeap = 0;
        this.parts.emit(SPOT.trout.x, 0.2, SPOT.trout.z, 10, 0x8ae8ff, 5, 0.18, 0.45, 14, 0.7);
      }
    } else if (inter) {
      this.troutLeapNext -= dt;
      if (this.troutLeapNext <= 0) {
        this.troutLeap = 0.001;
        this.troutLeapNext = rand(9, 15);
        if (d < 22 && this.screen === 'play') this.sfx.play('splash');
        this.parts.emit(SPOT.trout.x, 0.2, SPOT.trout.z, 8, 0x8ae8ff, 5, 0.18, 0.45, 14, 0.75);
      }
    }

    const spd = panic ? 14 : this.troutLeap > 0 ? 18 : 5.5;
    if (this.troutLeap > 0) {
      const p = Math.min(1, this.troutLeap / 0.82);
      tr.swim.position.y = 0.55 + Math.sin(p * PI) * 2.05;
      tr.swim.rotation.x = lerp(-1.05, 0.85, p);
      tr.swim.rotation.z = Math.sin(p * TAU) * 0.25;
    } else {
      tr.swim.position.y = 0.54 + Math.sin(T * (panic ? 8 : 2.8)) * (panic ? 0.14 : 0.08);
      tr.swim.rotation.x = -0.36 + Math.sin(T * 2.1) * 0.06;
      tr.swim.rotation.z = 0;
    }
    tr.body.rotation.y = Math.sin(T * spd) * 0.1;
    tr.tail.rotation.y = Math.sin(T * spd - 1.1) * 0.42;
    const waveFin = inter && d < 12 ? 0.35 : 0.16;
    tr.finL.rotation.z = -1.1 + Math.sin(T * (spd * 0.8)) * waveFin;
    tr.finR.rotation.z = 1.1 - Math.sin(T * (spd * 0.8)) * waveFin;
    tr.bandL.rotation.x = 0.18 + Math.sin(T * 7) * 0.22;
    tr.bandR.rotation.x = -0.14 + Math.cos(T * 6.5) * 0.22;
    const talking = this.subtitle?.who === 'Trout';
    tr.jaw.rotation.x = PI / 2 + 0.16 + (talking ? Math.abs(Math.sin(T * 15)) * 0.34 : Math.abs(Math.sin(T * 2.4)) * 0.08);
    tr.ripples.forEach((rp, i) => {
      const p = ((T * (panic ? 1.1 : 0.55) + i * 0.5) % 1 + 1) % 1;
      rp.mesh.scale.setScalar(0.55 + p * 1.65);
      rp.mat.opacity = this.troutLeap > 0.1 && this.troutLeap < 0.7 ? 0.12 : Math.sin(p * PI) * 0.52;
    });
  }

  /* ───────────────────────── HUD bridge ───────────────────────── */

  /* ───────────────────────── hog hunt + squad ───────────────────────── */

  private livingAlliesCount() {
    return this.allies.filter((a) => a.dying <= 0 && a.hp > 0).length;
  }

  private squadFull() {
    return this.livingAlliesCount() >= MAX_SQUAD;
  }

  private clearWild() {
    for (const w of this.wild) {
      w.m.skin.dispose();
      this.discard(w.m.root);
    }
    this.wild = [];
    this.hunt = null;
  }

  private clearSquad() {
    this.clearWild();
    for (const a of this.allies) {
      a.hpBar.mat.dispose();
      this.discard(a.m.root);
    }
    this.allies = [];
  }

  /** Fallen hogs never return to the wild roster. */
  private healSurvivors(amount: number) {
    for (const a of this.allies) {
      if (a.dying <= 0 && a.hp > 0) {
        a.hp = Math.min(a.maxHp, a.hp + amount);
        a.inv = 0;
      }
    }
  }

  private spawnAllyPig(x: number, z: number, heading: number, tint: number, name: HogName, hp = 55, maxHp = 55): Ally {
    const m = makeKenji(tint, true);
    m.root.position.set(x, 0, z);
    const hpBar = makeHpBar(1.15, 1.95, 0x62e06a);
    m.root.add(hpBar.group);
    this.scene.add(m.root);
    const ally: Ally = { m, hpBar, name, tint, x, z, heading, hp, maxHp, cd: 0.6, atk: 0, inv: 0, ph: 0, dying: 0 };
    this.allies.push(ally);
    return ally;
  }

  private startHunt() {
    if (this.area !== 'farm' || this.hunt || this.mode !== 'intermission' || this.overReason) return;
    this.clearEnemies();
    this.setArea('forest');
    this.travelTo(FOREST_START.x, FOREST_START.z, PI);
    HOG_NAMES.forEach((name, i) => {
      if (!this.recruitedHogs.has(name)) this.spawnWild(name, i);
    });
    this.hunt = { total: this.wild.length, caught: 0 };
    this.forestHint = this.wild.length
      ? 'Follow the hoofprints or press R to listen. The west trail leads past the Old Camp.'
      : 'There are no wild recruits left. Explore the trails or return to the farm.';
    if (!this.guppyDefeated) this.spawnPathGuppy();
    this.sfx.play('oink');
    this.showBanner('SLOPWOOD FOREST', "West trail: the Old Camp and Guppy's End");
    if (!this.tips.has('guppyTrail')) {
      this.tips.add('guppyTrail');
      this.say('Kingger', 'Follow the west trail past the Old Camp to find Path Guppy. He guards a stash of truffles.', 5.5);
    }
    this.emit();
  }

  private spawnWild(name: HogName, index: number) {
    const home = FOREST_HOMES[index];
    const a = Math.random() * TAU;
    const r = rand(0, home.r * 0.45);
    const { x, z } = this.safePosition(home.x + Math.cos(a) * r, home.z + Math.sin(a) * r);
    const m = makeKenji([0x9c7b63, 0x92705b, 0xb08e6b][index % 3], false);
    m.root.scale.setScalar(0.95);
    m.root.position.set(x, 0, z);
    m.root.traverse((c) => { c.receiveShadow = false; });
    this.scene.add(m.root);
    this.wild.push({ m, name, x, z, heading: a, tx: x, tz: z, wait: rand(0.2, 1.5), ph: Math.random() * 6, home, spotted: false, oinkT: rand(3, 8), calm: 0 });
  }

  private endHunt(knockedOut = false) {
    const h = this.hunt;
    if (!h || this.area !== 'forest') return;
    this.clearWild();
    this.clearEnemies();
    this.setArea('farm');
    this.travelTo(SPOT.hunt.x - 3, SPOT.hunt.z - 2, -PI / 2);
    const bonus = h.caught * 8;
    this.truffles += bonus;
    this.stats.earned += bonus;
    this.showBanner('BACK ON THE FARM', `${h.caught} new recruits - +${bonus} truffles - squad ${this.livingAlliesCount()}/${MAX_SQUAD}`);
    this.say(
      'Rickley',
      knockedOut ? 'Rest up, Kenji. That trail guard is no joke. Your recruits and truffles are safe.' : h.caught ? 'You brought the forest hogs home! That glutton had better watch his back.' : 'The woods will still be there when you need them.',
      4,
    );
    this.sfx.play(h.caught ? 'buy' : 'truffle');
    this.emit();
  }

  private recoverFromGuppy() {
    if (this.area !== 'forest' || !this.hunt) return;
    this.resetKenji();
    this.k.hp = Math.ceil(this.k.maxHp * 0.5);
    this.overReason = null;
    this.overTimer = 0;
    this.screen = 'play';
    this.endHunt(true);
    this.lock();
  }

  private listenForHogs() {
    if (!this.hunt || this.area !== 'forest' || this.sniffCd > 0) return;
    this.sniffCd = 8;
    this.sniffTime = 6;
    const k = this.k;
    const nearest = [...this.wild].sort((a, b) => Math.hypot(a.x - k.x, a.z - k.z) - Math.hypot(b.x - k.x, b.z - k.z))[0];
    this.sniffTarget = nearest ?? null;
    this.spawnShock(k.x, k.z, 15, 14, false, 0);
    this.sfx.play('oink');
    if (!nearest) {
      this.forestHint = 'No wild hogs remain. Follow the golden marker when you want to head home.';
      this.emit();
      return;
    }
    const dx = nearest.x - k.x;
    const dz = nearest.z - k.z;
    const dist = Math.hypot(dx, dz);
    const ns = Math.abs(dz) > dist * 0.35 ? (dz < 0 ? 'north' : 'south') : '';
    const ew = Math.abs(dx) > dist * 0.35 ? (dx < 0 ? 'west' : 'east') : '';
    const direction = `${ns}${ew}`;
    this.forestHint = `${nearest.name} is ${direction ? `to the ${direction}` : 'close by'}, about ${Math.round(dist)}m away.`;
    this.say('Kenji', this.forestHint, 4.5);
    if (dist < 18) nearest.calm = 2.5;
    this.emit();
  }

  private recruit(w: Wild) {
    if (!this.hunt || this.squadFull() || this.recruitedHogs.has(w.name) || !this.wild.includes(w)) return;
    this.wild = this.wild.filter((o) => o !== w);
    w.m.skin.dispose();
    this.discard(w.m.root);
    this.recruitedHogs.add(w.name);
    const maxHp = 55 + this.levels.slop * 8;
    this.spawnAllyPig(w.x, w.z, w.heading, HOG_TINTS[HOG_NAMES.indexOf(w.name)], w.name, maxHp, maxHp);
    this.hunt.caught++;
    this.parts.hitBurst(w.x, 1.15, w.z, 0xffe14d, 1.1);
    this.sfx.play('oink');
    this.sfx.play('buy');
    this.floatText(w.x, 2.5, w.z, `${w.name} joined!`, 'gold hog-callout');
    this.say('Kenji', `${w.name} joined the rebellion.`, 3);
    if (this.hunt.caught >= this.hunt.total) {
      this.forestHint = 'All hogs recruited! Follow the golden marker back to the farm.';
      this.showBanner('THE HERD IS WITH YOU', 'Return to the trailhead - your farm needs its rebellion');
    } else {
      this.forestHint = 'A new comrade! Keep exploring, or bring your recruits back to the trailhead.';
    }
    this.emit();
  }

  private animPig(m: KenjiModel, ph: number, moving: boolean) {
    const sw = Math.sin(ph) * (moving ? 0.7 : 0);
    m.legs[0].rotation.x = sw;
    m.legs[1].rotation.x = -sw;
    m.legs[2].rotation.x = -sw;
    m.legs[3].rotation.x = sw;
    m.pivot.position.y = 0.75 + (moving ? Math.abs(Math.sin(ph)) * 0.08 : 0);
    m.tail.rotation.z = Math.sin(this.time * 9) * 0.3;
  }

  private updateWild(dt: number) {
    if (!this.hunt || this.area !== 'forest') return;
    const k = this.k;
    for (const w of this.wild) {
      w.wait -= dt;
      w.oinkT -= dt;
      w.calm = Math.max(0, w.calm - dt);
      const dx = w.x - k.x;
      const dz = w.z - k.z;
      const d = Math.hypot(dx, dz) || 0.001;
      let dirX = 0;
      let dirZ = 0;
      let sp = 0;
      if (d < 24 && !w.spotted) {
        w.spotted = true;
        this.forestHint = `${w.name} spotted! Close in, then headbutt or Hog Charge to recruit.`;
        this.floatText(w.x, 2.8, w.z, w.name, 'gold hog-callout');
        this.sfx.play('oink');
      }
      if (w.oinkT <= 0) {
        w.oinkT = rand(9, 17);
        if (d < 26) this.sfx.play('oink');
      }
      if (d < 7 && k.action !== 'dead' && w.calm <= 0) {
        dirX = dx / d;
        dirZ = dz / d;
        sp = 6.4;
      } else if (w.wait <= 0) {
        const tdx = w.tx - w.x;
        const tdz = w.tz - w.z;
        const td = Math.hypot(tdx, tdz);
        if (td < 0.6) {
          w.wait = rand(0.8, 2.2);
          const a = Math.random() * TAU;
          const r = Math.sqrt(Math.random()) * w.home.r;
          const target = this.safePosition(w.home.x + Math.cos(a) * r, w.home.z + Math.sin(a) * r);
          w.tx = target.x;
          w.tz = target.z;
        } else {
          dirX = tdx / td;
          dirZ = tdz / td;
          sp = 2.4;
        }
      }
      if (sp > 0) {
        // Hogs roam their own woodland territory, steering around trunks and rocks.
        const cx = w.home.x - w.x;
        const cz = w.home.z - w.z;
        const cd = Math.hypot(cx, cz) || 0.001;
        if (cd > w.home.r + 6) {
          dirX += (cx / cd) * 1.4;
          dirZ += (cz / cd) * 1.4;
          const l = Math.hypot(dirX, dirZ) || 1;
          dirX /= l;
          dirZ /= l;
        }
        let angle = Math.atan2(dirX, dirZ);
        let next = this.resolve(w.x + Math.sin(angle) * sp * dt, w.z + Math.cos(angle) * sp * dt, 0.65);
        if (next.hit) {
          for (const turn of [0.9, -0.9, 1.7, -1.7, PI]) {
            const test = this.resolve(w.x + Math.sin(angle + turn) * sp * dt, w.z + Math.cos(angle + turn) * sp * dt, 0.65);
            if (!test.hit) {
              angle += turn;
              next = test;
              break;
            }
          }
        }
        w.heading = angLerp(w.heading, angle, 8 * dt);
        w.x = clamp(next.x, -FOREST_BOUND + 2, FOREST_BOUND - 2);
        w.z = clamp(next.z, -FOREST_BOUND + 2, FOREST_BOUND - 2);
      }
      w.ph += dt * (sp > 0 ? 10 : 0);
      w.m.root.position.set(w.x, 0, w.z);
      w.m.root.rotation.y = w.heading;
      this.animPig(w.m, w.ph, sp > 0);
      w.m.head.rotation.x = sp === 0 ? 0.13 + Math.sin(this.time * 2 + w.ph) * 0.1 : 0;
    }
  }

  private hitAlliesNear(x: number, z: number, r: number, dmg: number) {
    for (const a of [...this.allies]) {
      if (a.dying <= 0 && a.hp > 0 && a.inv <= 0 && Math.hypot(a.x - x, a.z - z) < r) this.hurtAlly(a, dmg);
    }
  }

  /** Rebel hogs take real damage and permanently die when their HP hits 0! */
  private hurtAlly(a: Ally, dmg: number) {
    if (a.dying > 0 || a.hp <= 0 || a.inv > 0 || this.overReason) return;
    const armor = 1 - 0.12 * this.levels.hide;
    const d = Math.max(1, Math.round(dmg * armor));
    a.hp = Math.max(0, a.hp - d);
    a.inv = 0.75;
    this.floatText(a.x, 2.15, a.z, `-${d}`, 'hurt');
    this.parts.sparks(a.x, 0.95, a.z, 8, 0xff6a5a, 8, 0.14, 0.3, { hdr: 3.4 });
    if (a.hp <= 0) {
      // Permanent death! Start tumble animation, spawn bandana memorial & rising soul motes
      a.dying = 0.001;
      a.inv = 0;
      a.hpBar.group.visible = false;
      this.stats.fallen++;
      this.courseFallen++;
      this.sfx.play('hogdie');
      this.addShake(0.45);
      this.parts.hitBurst(a.x, 1.0, a.z, 0xff4a3c, 1.35);
      this.parts.motes(a.x, 0.9, a.z, 18, 0xfff0b8, 3.2, 0.22, 1.2, -4.5, 4, 0.55, 4.0);
      this.parts.chunks(a.x, 0.9, a.z, 8, 0xc2392b, 7, 0.2, 0.65);
      this.floatText(a.x, 3.1, a.z, `${a.name} fell`, 'hurt hog-callout');
      if (this.area === 'farm') {
        const mem = makeHogMemorial();
        mem.position.set(a.x, 0, a.z);
        this.scene.add(mem);
        this.memorials.push({ mesh: mem, life: 14 });
      }
      this.say(
        Math.random() < 0.6 ? 'Kenji' : 'Rickley',
        pick([
          `NOOO! ${a.name}!! You'll pay for that, Hwang!`,
          `${a.name} fell! Rest easy, brave hog…`,
          `We lost ${a.name}! Watch out for his kitchen bots!`,
          `${a.name} is gone… protect the rest of the herd!`,
        ]),
        3.4,
      );
      this.emit();
    }
  }

  private updateAllies(dt: number) {
    if (!this.allies.length) return;
    const k = this.k;
    const A = this.A;
    const camQ = this.camera.quaternion;
    const combat = this.mode === 'combat' && A.active && A.hp > 0 && A.state !== 'leaving' && A.state !== 'ko' && A.state !== 'defeated';
    const living = this.allies.filter((a) => a.dying <= 0);
    const n = Math.max(1, living.length);
    const base = k.heading + PI;
    let slot = 0;

    this.allies = this.allies.filter((a) => {
      // Permanent death tumble -> fade into spirit sparks and remove forever
      if (a.dying > 0) {
        a.dying += dt;
        const p = Math.min(1, a.dying / 0.9);
        a.m.pivot.rotation.z = lerp(0, PI / 2, Math.min(1, p * 1.8));
        a.m.pivot.position.y = 0.75 - Math.min(1, p * 1.8) * 0.25;
        a.m.root.visible = true;
        if (p > 0.6) a.m.root.scale.setScalar(Math.max(0.01, (1 - p) / 0.4));
        if (a.dying >= 0.9) {
          this.parts.motes(a.x, 0.7, a.z, 10, 0xffe8a3, 2.6, 0.18, 0.9, -4, 3, 0.4, 3.8);
          a.hpBar.mat.dispose();
          this.discard(a.m.root);
          return false;
        }
        return true;
      }

      const mySlot = slot++;
      a.inv = Math.max(0, a.inv - dt);
      a.cd -= dt;
      a.atk = Math.max(0, a.atk - dt);

      // Instinctively back away from a lit Kettle Bomber if close!
      let fleeBomber: Bot | null = null;
      if (combat) {
        for (const b of this.bots) {
          if (b.kind === 'bomber' && b.mode === 'fuse' && Math.hypot(b.x - a.x, b.z - a.z) < 4.2) {
            fleeBomber = b;
            break;
          }
        }
      }

      let foe: { x: number; z: number; bot: Bot | null; pot: Pot | null } | null = null;
      if (combat && !fleeBomber) {
        let bd = 8.5;
        for (const b of this.bots) {
          if (b.kind === 'bomber' && b.mode === 'fuse') continue;
          const d = Math.hypot(b.x - a.x, b.z - a.z);
          if (d < bd) {
            bd = d;
            foe = { x: b.x, z: b.z, bot: b, pot: null };
          }
        }
        if (!foe && A.shielded) {
          let pd = 40;
          for (const p of this.pots) {
            const d = Math.hypot(p.x - a.x, p.z - a.z);
            if (d < pd) {
              pd = d;
              foe = { x: p.x, z: p.z, bot: null, pot: p };
            }
          }
        } else if (!foe && A.state !== 'spin' && Math.hypot(A.x - a.x, A.z - a.z) < 14) {
          foe = { x: A.x, z: A.z, bot: null, pot: null };
        }
      }

      let tx: number;
      let tz: number;
      let speed: number;
      let stop: number;
      if (fleeBomber) {
        // slightly slower panic trot so bombers are still lethal if Kenji doesn't swat them away!
        const fx = a.x - fleeBomber.x;
        const fz = a.z - fleeBomber.z;
        const fl = Math.hypot(fx, fz) || 1;
        tx = a.x + (fx / fl) * 4;
        tz = a.z + (fz / fl) * 4;
        speed = 5.2;
        stop = 0.2;
      } else if (foe) {
        tx = foe.x;
        tz = foe.z;
        speed = 9.2;
        stop = foe.bot ? 1.85 + foe.bot.rad * 0.3 : foe.pot ? 1.5 : 2.65;
      } else {
        const ang = base + (mySlot - (n - 1) / 2) * 0.75;
        tx = k.x + Math.sin(ang) * 2.4;
        tz = k.z + Math.cos(ang) * 2.4;
        speed = Math.hypot(tx - a.x, tz - a.z) > 6 ? 13 : 8.5;
        stop = 0.6;
      }
      const dx = tx - a.x;
      const dz = tz - a.z;
      const d = Math.hypot(dx, dz);
      let moving = false;
      if (!foe && !fleeBomber && this.area === 'forest' && d > 25) {
        const pos = this.safePosition(tx, tz, 0.6);
        a.x = pos.x;
        a.z = pos.z;
      }
      if (d > stop) {
        const s = Math.min(d - stop, speed * dt);
        a.x += (dx / d) * s;
        a.z += (dz / d) * s;
        a.heading = angLerp(a.heading, Math.atan2(dx, dz), 10 * dt);
        moving = true;
      }
      if (foe && d < (foe.bot ? 2.4 + foe.bot.rad * 0.35 : foe.pot ? 2.3 : 3.2) && a.cd <= 0) {
        if (foe.bot) {
          if (foe.bot.hp > 0) this.damageBot(foe.bot, 11 + 2 * this.course, (dx / (d || 1)) * 5, (dz / (d || 1)) * 5);
        } else if (foe.pot) {
          this.damagePot(foe.pot, 8 + 2 * this.course);
        } else {
          this.damageAllen(6 + 1.5 * this.course, 7, { minor: true, fx: a.x, fz: a.z });
        }
        a.cd = 1.75;
        a.atk = 0.25;
        a.heading = Math.atan2(dx, dz);
        this.sfx.play('hit');
      }
      // keep the squad from stacking on top of each other, Kenji and Allen
      for (const o of this.allies) {
        if (o === a || o.dying > 0 || o.hp <= 0) continue;
        const ox = a.x - o.x;
        const oz = a.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od < 1.25 && od > 0.001) {
          a.x += (ox / od) * (1.25 - od) * 0.5;
          a.z += (oz / od) * (1.25 - od) * 0.5;
        }
      }
      const kx = a.x - k.x;
      const kz = a.z - k.z;
      const kd = Math.hypot(kx, kz);
      if (kd < 1.5 && kd > 0.001) {
        a.x += (kx / kd) * (1.5 - kd);
        a.z += (kz / kd) * (1.5 - kd);
      }
      if (A.active && A.hp > 0) {
        const ax = a.x - A.x;
        const az = a.z - A.z;
        const ad = Math.hypot(ax, az);
        if (ad < 2.3 && ad > 0.001) {
          a.x += (ax / ad) * (2.3 - ad);
          a.z += (az / ad) * (2.3 - ad);
        }
      }
      const r = this.resolve(a.x, a.z, 0.55);
      const bound = this.mapBound();
      a.x = clamp(r.x, -bound, bound);
      a.z = clamp(r.z, -bound, bound);

      a.ph += dt * (moving ? 10 : 0);
      a.m.root.position.set(a.x, this.area === 'farm' && isOnLakeDock(a.x, a.z) ? 0.23 : 0, a.z);
      a.m.root.rotation.y = a.heading;
      a.m.root.visible = a.inv > 0 ? Math.floor(this.time * 18) % 2 === 0 : true;
      this.animPig(a.m, a.ph, moving);
      a.m.pivot.rotation.x = a.atk > 0 ? -Math.sin((a.atk / 0.25) * PI) * 0.45 : 0;
      updateHpBar(a.hpBar, a.hp, a.maxHp, camQ, false, true);
      return true;
    });
  }

  private emit() {
    const k = this.k;
    const A = this.A;
    const guppy = this.bots.find((b) => b.kind === 'guppy');
    const ci = Math.min(this.course, COURSES.length - 1);
    let tag = '';
    let alert = false;
    if (A.active) {
      if (A.shielded) {
        tag = 'Invincible — smash the sauce jars!';
        alert = true;
      } else if (A.state === 'guard') tag = 'Wok Guard — flank him or land a finisher';
      else if (A.state === 'spin' || A.state === 'spinWind') tag = 'Sizzle Spin — invincible, keep away!';
      else if (A.exposed > 0) tag = 'EXPOSED — +35% damage!';
      else if (A.state === 'eating' && A.target) {
        tag = `Eating the ${A.target.name}!`;
        alert = true;
      } else if (A.state === 'toEat' && A.target) {
        tag = `Heading for the ${A.target.name}`;
        alert = true;
      } else if (A.state === 'stunned') tag = 'Stunned — hit him now!';
      else if (A.state === 'defeated' || A.state === 'ko' || A.state === 'leaving') tag = 'Stuffed';
      else if (A.enraged) tag = 'Hangry';
      else tag = 'Pork belly enthusiast';
    }
    let objective = '';
    if (this.area === 'forest') {
      objective = this.forestHint;
    } else if (this.mode === 'intermission') {
      const left = this.pickups.filter((p) => p.area === 'farm').length;
      objective =
        this.recruitedHogs.size < MAX_SQUAD
          ? 'Train combos with Trout at the lake, visit Rickley & Kingger, hunt hogs, then ring the bell'
          : `${left ? `${left} truffles on the farm · ` : ''}Train with Trout, visit Rickley & Kingger, then ring the Bell`;
    } else if (A.active && A.shielded) objective = 'Allen is invincible! Smash every sauce jar before the timer runs out';
    else if (A.active && alert) objective = 'Hit Allen to interrupt his meal!';
    else objective = 'Dodge, punish his recoveries, protect the farm';

    const lv = this.levels;
    const rushReady =
      lv.riverrush > 0 &&
      k.rushWindow > 0 &&
      k.chainHits >= 2 &&
      (k.chargeCd <= 0 || (lv.riverrush >= 2 && k.chargeCd <= 2.5));

    this.onHud({
      screen: this.screen,
      mode: this.mode,
      area: this.area,
      course: ci,
      courseName: COURSES[ci].name,
      courseCount: COURSES.length,
      hp: Math.ceil(k.hp),
      maxHp: k.maxHp,
      stam: k.stam,
      maxStam: k.maxStam,
      truffles: this.truffles,
      farm: this.farmPct(),
      chargeCd: k.chargeCd / (6 * (1 - 0.175 * lv.rocket)),
      zapCd: k.zapCd / this.zapCooldown(lv.zap),
      zapUnlocked: lv.zap > 0,
      squealCd: k.squealCd / (lv.squeal >= 2 ? 11 : 14),
      squealUnlocked: lv.squeal > 0,
      whipCd: k.whipCd / (lv.tailwhip >= 2 ? 1.5 : 2.3),
      whipUnlocked: lv.tailwhip > 0,
      cycloneUnlocked: lv.cyclone > 0,
      rushReady,
      combo: k.flowCount >= 2 && k.flowTimer > 0 ? { count: k.flowCount, move: k.flowMove, bonusPct: this.flowBonusPct() } : null,
      muddy: k.muddy > 0,
      focus: k.focus > 0,
      hurtTick: this.hurtTick,
      foeCount: this.bots.length,
      boss: {
        active: A.active,
        hp: Math.max(0, A.hp),
        maxHp: A.maxHp,
        poise: clamp(A.poise / A.poiseMax, 0, 1),
        tag,
        alert,
        enraged: A.enraged,
        phase: A.phase,
        phases: A.phases,
        shield: A.shielded ? { left: this.pots.length, total: A.potTotal, time: Math.max(0, A.shieldT), dur: A.shieldDur } : null,
        guarding: A.state === 'guard',
        exposed: A.exposed > 0,
      },
      prompt: this.prompt,
      subtitle: this.subtitle ? { who: this.subtitle.who, text: this.subtitle.text } : null,
      opening: this.opening ? { step: this.opening.step, total: 5 } : null,
      banner: this.banner ? { title: this.banner.title, sub: this.banner.sub, key: this.banner.key } : null,
      objective,
      shopNpc: this.shopNpc,
      levels: { ...this.levels },
      repairCount: this.repairCount,
      locked: this.locked,
      gamepad: this.padLayout ? { layout: this.padLayout, active: this.padActive } : null,
      controllerDisconnected: this.controllerDisconnected,
      muted: this.sfx.muted,
      gfx: this.gfx.quality,
      overReason: this.overReason,
      allies: this.livingAlliesCount(),
      alliesMax: MAX_SQUAD,
      fallen: this.stats.fallen,
      hunt: this.hunt ? {
        caught: this.hunt.caught,
        total: this.hunt.total,
        spotted: this.hunt.caught + this.wild.filter((w) => w.spotted).length,
        hint: this.forestHint,
        listenCd: this.sniffCd,
        returnDistance: Math.round(Math.hypot(k.x - FOREST_EXIT.x, k.z - FOREST_EXIT.z)),
        location: Math.hypot(k.x - GUPPY_END.x, k.z - GUPPY_END.z) < GUPPY_END.r + 4
          ? GUPPY_END.name
          : Math.hypot(k.x - FOREST_EXIT.x, k.z - FOREST_EXIT.z) < 18
            ? 'South Trailhead'
            : FOREST_HOMES.find((h) => Math.hypot(k.x - h.x, k.z - h.z) < h.r + 5)?.name ?? 'Forest Trail',
        roster: HOG_NAMES.map((name) => ({
          name,
          status: this.allies.some((a) => a.name === name && a.hp > 0)
            ? 'joined'
            : this.recruitedHogs.has(name) ? 'fallen' : 'wild',
        })),
        guppy: guppy && guppy.behavior !== 'waiting' && guppy.behavior !== 'returning'
          ? { hp: guppy.hp, maxHp: guppy.maxHp, status: guppy.behavior }
          : null,
      } : null,
      stats: { ...this.stats },
    });
  }

  private drawMinimap() {
    const cv = this.minimap;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const S = cv.width;
    if (this.area === 'forest') {
      this.drawForestMinimap(ctx, S);
      return;
    }
    const sc = S / 120;
    const X = (x: number) => S / 2 + x * sc;
    const Z = (z: number) => S / 2 + z * sc;
    ctx.fillStyle = '#8cc05a';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#d7b684';
    ctx.fillRect(X(-2.5), Z(-27), 5 * sc, 87 * sc);
    ctx.fillRect(X(-32), Z(-29.2), 62 * sc, 4.5 * sc);
    ctx.fillRect(X(0), Z(19.3), 34 * sc, 3.5 * sc);
    ctx.fillRect(X(-27.8), Z(29.6), 28 * sc, 3.2 * sc);
    ctx.fillRect(X(-28.8), Z(31.0), 3.2 * sc, 8 * sc);
    for (const f of this.world.features) {
      ctx.fillStyle = f.color;
      if (f.kind === 'c') {
        ctx.beginPath();
        ctx.arc(X(f.x), Z(f.z), f.r * sc, 0, TAU);
        ctx.fill();
      } else ctx.fillRect(X(f.x - f.hx), Z(f.z - f.hz), f.hx * 2 * sc, f.hz * 2 * sc);
    }
    // eaten plots get greyed out
    for (const e of this.world.edibles) {
      if (e.hp <= 0) {
        ctx.fillStyle = 'rgba(42,26,18,0.6)';
        ctx.beginPath();
        ctx.arc(X(e.x), Z(e.z), 5 * sc, 0, TAU);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#fbf3df';
    ctx.lineWidth = 3;
    ctx.strokeRect(X(-56), Z(-56), 112 * sc, 112 * sc);
    const u = S / 170;
    const dot = (x: number, z: number, r: number, fill: string, stroke?: string) => {
      ctx.beginPath();
      ctx.arc(X(x), Z(z), r * u, 0, TAU);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
      }
    };
    for (const p of this.pickups) if (p.area === 'farm') dot(p.x, p.z, 2.5, '#ffc93c', '#2a1a12');
    const inter = this.mode === 'intermission';
    dot(SPOT.bell.x, SPOT.bell.z, 5, inter ? '#ffc93c' : '#bfa24a', '#2a1a12');
    dot(SPOT.rickley.x, SPOT.rickley.z, 5, '#c2392b', '#fbf3df');
    dot(SPOT.kingger.x, SPOT.kingger.z, 5, '#2bb3c0', '#fbf3df');
    dot(SPOT.trout.x, SPOT.trout.z, 5, '#f0758d', '#fbf3df');
    for (const pd of this.puddles) dot(pd.x, pd.z, 4.5, 'rgba(235,52,24,0.45)');
    for (const b of this.bots) {
      const col =
        b.kind === 'tenderizer'
          ? '#f8f6f0'
          : b.kind === 'spitter'
            ? '#d9251d'
            : b.kind === 'bomber'
              ? b.mode === 'fuse'
                ? '#ff1e1e'
                : '#e88b3a'
              : b.kind === 'skewer'
                ? '#6c7a8c'
                : '#ff7a1a';
      dot(b.x, b.z, b.kind === 'tenderizer' ? 4.8 : 3.5, col, '#2a1a12');
    }
    for (const p of this.pots) dot(p.x, p.z, 4.4 + Math.sin(this.time * 6) * 0.9, '#ffd23f', '#c2392b');
    const A = this.A;
    if (A.active) {
      const pulse = A.state === 'eating' ? 3 + Math.abs(Math.sin(this.time * 8)) * 4 : 0;
      if (pulse) dot(A.x, clamp(A.z, -60, 60), 8 + pulse, 'rgba(255,59,48,0.35)');
      dot(A.x, clamp(A.z, -60, 60), 7.5, '#6b3a8c', '#ffffff');
    }
    dot(SPOT.hunt.x, SPOT.hunt.z, 5, '#344d36', '#ffc93c');
    ctx.fillStyle = '#2a1a12';
    ctx.font = `${S / 27}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('FOREST', X(SPOT.hunt.x - 4), Z(SPOT.hunt.z - 4));
    for (const a of this.allies) if (a.hp > 0) dot(a.x, a.z, 2.8, '#ffb3c7', '#2a1a12');
    // Kenji arrow
    const k = this.k;
    ctx.save();
    ctx.translate(X(k.x), Z(k.z));
    ctx.rotate(-k.heading + PI);
    ctx.scale(u, u);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#ff8fb0';
    ctx.strokeStyle = '#2a1a12';
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawForestMinimap(ctx: CanvasRenderingContext2D, size: number) {
    const forest = this.forest;
    if (!forest) return;
    const scale = size / 166;
    const unit = size / 180;
    const X = (x: number) => size / 2 + x * scale;
    const Z = (z: number) => size / 2 + z * scale;
    ctx.fillStyle = '#4c6747';
    ctx.fillRect(0, 0, size, size);
    for (const f of forest.features) {
      ctx.beginPath();
      ctx.fillStyle = f.color;
      ctx.arc(X(f.x), Z(f.z), f.r * scale, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#76a9a2';
    ctx.lineWidth = 3.6 * scale;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const x = -82 + (i / 60) * 164;
      const z = -17 + Math.sin(x * 0.055) * 6;
      if (i === 0) ctx.moveTo(X(x), Z(z));
      else ctx.lineTo(X(x), Z(z));
    }
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#c6ae83';
    ctx.lineWidth = 3.1 * scale;
    for (const path of forest.paths) {
      ctx.beginPath();
      path.forEach((p, i) => {
        if (i === 0) ctx.moveTo(X(p.x), Z(p.z));
        else ctx.lineTo(X(p.x), Z(p.z));
      });
      ctx.stroke();
    }
    const dot = (x: number, z: number, r: number, fill: string) => {
      ctx.beginPath();
      ctx.arc(X(x), Z(z), r * unit, 0, TAU);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = '#fbf3df';
      ctx.lineWidth = unit;
      ctx.stroke();
    };
    for (const w of this.wild) {
      if (w.spotted) dot(w.x, w.z, 3.6, '#b18c69');
      else if (w === this.sniffTarget && this.sniffTime > 0) {
        dot(w.x, w.z, 4 + Math.sin(this.time * 6), '#f0b429');
      }
    }
    for (const a of this.allies) if (a.hp > 0) dot(a.x, a.z, 2.5, '#ffb3c7');
    for (const p of this.pickups) if (p.area === 'forest') dot(p.x, p.z, 2.3, '#f0b429');
    const guard = this.bots.find((b) => b.kind === 'guppy');
    if (guard) {
      ctx.save();
      ctx.translate(X(guard.x), Z(guard.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = guard.behavior === 'waiting' ? '#cd7540' : '#f06141';
      ctx.strokeStyle = '#fbf3df';
      ctx.lineWidth = unit;
      ctx.fillRect(-4 * unit, -4 * unit, 8 * unit, 8 * unit);
      ctx.strokeRect(-4 * unit, -4 * unit, 8 * unit, 8 * unit);
      ctx.restore();
    }
    dot(FOREST_EXIT.x, FOREST_EXIT.z, 5, '#f0b429');
    ctx.fillStyle = '#fbf3df';
    ctx.font = `bold ${13 * unit}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('HOME', X(5), Z(66));
    ctx.font = `${10 * unit}px monospace`;
    ctx.fillText("GUPPY'S END", X(-78), Z(-13));
    ctx.textAlign = 'center';
    ctx.fillText('OLD CAMP', X(-41), Z(1));
    ctx.fillText('DEEPWOOD', X(4), Z(-64));
    ctx.fillText('N', X(0), Z(-76));

    const k = this.k;
    ctx.save();
    ctx.translate(X(k.x), Z(k.z));
    ctx.rotate(-k.heading + PI);
    ctx.scale(unit, unit);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fillStyle = '#ffb3c7';
    ctx.strokeStyle = '#2a1a12';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
