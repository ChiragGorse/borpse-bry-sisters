/**
 * The browser client: renders the game simulation (./sim/Sim.ts) with THREE.js, plays its sounds and
 * effects, reads the keyboard, mouse, touch controls and gamepad, and feeds the React HUD.
 *
 * All game rules live in the simulation. This class only turns input into PlayerInput for the local pig,
 * keeps one 3D model per simulated entity (matched by id), animates them from simulation state, and replays
 * the simulation's one-shot events (VFX, sounds, floating text, camera shake).
 */
import * as THREE from 'three';
import { buildWorld, type World } from './world';
import {
  makeKenji,
  makeAllen,
  makeRickley,
  makeKingger,
  makeCharig,
  makeKioff,
  makeYoungAllen,
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
  makeCreamShot,
  makeFlameRobot,
  makeEarwhen,
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
  type EarwhenModel,
  type WorldHpBar,
  type TurretModel,
  type PotModel,
} from './models';
import { ACTIVE_IDS, ACTIVE_INFO, COURSES, EARWHEN_STAGES, FINALE, earwhenStage, LOADOUT_SLOTS, OPENING_BEATS, SLOT_CODES, UPGRADES, type ActiveId, type BotKind, type HudState, type Screen, type UpgradeId } from './data';
import { Sfx } from './audio';
import { Music } from './music';
import { Gfx, type Quality } from './gfx';
import { setGrassDensity, tickNature } from './nature';
import { CombatVfx } from './vfx';
import { SCARE_FACE_SVG } from '../ui/scareFace';
import { bindLabel, translate, type BindAction } from './keybinds';
import { onVolumeChange } from './volume';
import { buildForest, type ForestWorld } from './forest';
import { makePathGuppy, type GuppyModel } from './guppy';
import { COIL, FOREST_BOUND, FOREST_EXIT, GUPPY_SWING, SPOT, TRUFFLE_SPOTS, isOnLakeDock } from './layout';
import { GamepadInput, PAD_ACTIONS, PadMenuRepeat, padActionLabel, padDown, type PadFrame, type PadLayout, type PadMenuCommand } from './gamepad';
import { MAX_SQUAD, Sim, newPlayer, zapCooldown } from './sim/Sim';
import type { GameSim } from './sim/gameSim';
import { NetClient, defaultServerUrl, type NetStatus } from './net/NetClient';
import type { NetSim } from './net/NetSim';
import { BotBrain } from './sim/botBrain';
import { clearSave, loadSave, writeSave, type SaveData } from './save';
import { GAME_VERSION } from './changelog';
import { ALLEN_ID, BTN, type EarwhenBot, type Ally, type Area, type Bot, type Player, type PlayerInput, type SimEvent, type SimMaps } from './sim/types';

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > PI) d -= TAU;
  if (d < -PI) d += TAU;
  return d;
};
const angLerp = (a: number, b: number, t: number) => a + angDiff(a, b) * Math.min(1, t);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const CONTROLLER_ACTIONS = Object.values(PAD_ACTIONS);

/** The simulation button each loadout ability fires. */
const ACTIVE_BTN: Record<ActiveId, number> = {
  zap: BTN.zap,
  squeal: BTN.squeal,
  tailwhip: BTN.whip,
  portal: BTN.portal,
  decoy: BTN.decoy,
  potion: BTN.potion,
  smash: BTN.smash,
};
/** Where a newly bought ability goes if that slot is free (zap, squeal and whip keep their old keys). */
const PREFERRED_SLOT: Partial<Record<ActiveId, number>> = { zap: 0, squeal: 1, tailwhip: 2, portal: 3, smash: 4, potion: 5 };
const SLOT_PAD: (keyof typeof PAD_ACTIONS)[] = ['zap', 'squeal', 'whip', 'slot4', 'slot5', 'slot6'];

/**
 * The canonical key for each simulation button (Q/F/C are Allen's; pigs use loadout slots). Physical keys
 * reach these through the player's keybinds (./keybinds.ts); the gamepad and touch buttons press them directly.
 */
const BUTTON_KEYS: [number, string[]][] = [
  [BTN.attack, ['KeyJ']],
  [BTN.charge, ['KeyK']],
  [BTN.roll, ['ShiftLeft']],
  [BTN.jump, ['Space']],
  [BTN.zap, ['KeyQ']],
  [BTN.squeal, ['KeyF']],
  [BTN.whip, ['KeyC']],
  [BTN.interact, ['KeyE']],
  [BTN.listen, ['KeyR']],
];

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
/** Folk Valley after dark: a cold moon, thick black fog, and only lanterns to see by. */
const FOREST_TOD: Tod = { sun: 0x8fa3d6, sunI: 0.45, hemiSky: 0x24304a, hemiGround: 0x0c120c, hemiI: 0.22, fog: 0x04060a, fogD: 0.034, elev: 0.75, stars: 0.6, win: 0, turb: 1.4, ray: 0.7, mie: 0.003, mieG: 0.8, gain: 0.02, tint: 0x5a6890, expo: 1.0 };
const LIT_KEYS = ['sunI', 'hemiI', 'fogD', 'elev', 'win', 'turb', 'ray', 'mie', 'mieG', 'gain', 'expo'] as const;
type Lit = Record<(typeof LIT_KEYS)[number], number>;

/** Unlit gameplay telegraph: always drawn on top (so grass never hides it) and bright enough to glow. */
function fxMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false });
  m.color.multiplyScalar(1.7);
  return m;
}
const SUN_AZ = -0.9;
type AnomalyKind = 'watcher' | 'mimic' | 'blackout' | 'wisps' | 'whispers' | 'glitch' | 'silence';
const ANOMALIES: AnomalyKind[] = ['watcher', 'mimic', 'blackout', 'wisps', 'whispers', 'glitch', 'silence'];
const WILD_TINTS = [0x9c7b63, 0x92705b, 0xb08e6b];

const RING_GEO = new THREE.RingGeometry(0.88, 1, 56).rotateX(-PI / 2);
const DISC_GEO = new THREE.CircleGeometry(1, 40).rotateX(-PI / 2);
const HAZ_BALL_GEO = new THREE.IcosahedronGeometry(0.8, 0);
const HAZ_RING_MAT = fxMat(0xff5a1f, 0.9);
const HAZ_FILL_MAT = fxMat(0xff5a1f, 0.34);

/* ───────── one view object per simulated entity ───────── */
interface PlayerView { m: KenjiModel; walk: number; tag: HTMLDivElement }
interface BotView { m: EnemyModel | GuppyModel | EarwhenModel; ring: THREE.Group | null; ringFill: THREE.Mesh | null }
interface ProjView { mesh: THREE.Group; friendly: boolean }
interface MatMesh { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }
interface HazardView { g: THREE.Group; fill: THREE.Mesh; ball: THREE.Mesh }
interface AllyView { m: KenjiModel; hpBar: WorldHpBar }

export interface GameOptions {
  /** Extra bot-controlled pigs to fill out the herd for local testing (0-7). */
  bots?: number;
  /** Told about online-play changes (connecting, lobby, playing, disconnected); null when offline. */
  onNet?: (s: NetStatus | null) => void;
}

export class Game {
  portraits: Record<string, string> = {};

  private container: HTMLElement;
  private onHud: (s: HudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, 0.5, 800);
  private world: World;
  private forest: ForestWorld | null = null;
  private sfx = new Sfx();
  private music = new Music();
  private fx: HTMLDivElement;
  /** Name tags over other players' pigs (own layer: map changes clear the fx layer). */
  private tags: HTMLDivElement;
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
  private tmp = new THREE.Vector3();

  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mdx = 0;
  private mdy = 0;
  /** Analog stick from the on-screen touch joystick (x = right, y = forward), each in [-1, 1]. */
  private touchMoveX = 0;
  private touchMoveY = 0;
  private locked = false;
  private gamepad = new GamepadInput();
  private padMenuRepeat = new PadMenuRepeat();
  private padFrame: PadFrame | null = null;
  private padLayout: PadLayout | null = null;
  private padActive = false;
  private controllerDisconnected = false;
  private onPadMenu?: (command: PadMenuCommand) => boolean;

  private screen: Screen = 'title';
  private hudTimer = 0;
  private mapTimer = 0;

  /* simulation: the local one, or a mirror of a game server's while playing online */
  private sim: GameSim;
  private localSim: Sim;
  private localPid: number;
  private net: NetClient | null = null;
  private onNet?: (s: NetStatus | null) => void;
  /** Offline: whether this browser plays a pig (Kenji) or Allen against the bot pigs. */
  private role: 'pig' | 'allen' = 'pig';
  /** Placeholder pig while an online game hasn't sent ours yet. */
  private ghost = newPlayer(0, '', 0xf7a8b8);
  private ghostModel = makeKenji();
  /** Id of the pig this browser controls. */
  private localId: number;
  private brain: BotBrain | null = null;
  private botIds: number[] = [];
  private wasOpening = false;
  private wasAllenActive = false;

  /* models */
  private players = new Map<number, PlayerView>();
  private openingPigs: KenjiModel[] = [];
  private camLook = new THREE.Vector3();
  /** The settings dialog is open over the pause menu (Esc closes it, not the pause). */
  settingsOpen = false;
  private skyArea: Area = 'farm';
  /** Kingger has left his lab for the backup-call scene. */
  private kingAway = false;
  private offVolume: (() => void) | null = null;
  /** Hog Hunt lighting: Herb's lantern and a faint glow round your own pig (off on the farm). */
  private herbLight = new THREE.PointLight(0xffb04a, 0, 22, 1.6);
  private pigLight = new THREE.PointLight(0xc8d4ff, 0, 11, 1.6);
  /** Pairs of eyes blinking in the dark, out past the lantern light. */
  private eyes: { g: THREE.Group; t: number; life: number }[] = [];
  /**
   * Folk Valley's anomalies: odd things this browser alone sees during a Hog Hunt (each player gets
   * their own, so nobody can quite agree on what happened).
   */
  private anomaly: { kind: AnomalyKind; t: number; dur: number; x: number; z: number; flag: boolean } | null = null;
  private anomalyT = 14;
  private lastAnomaly: AnomalyKind | null = null;
  private anomalyProps: { watcher: THREE.Group; mimic: KenjiModel; wisps: THREE.Mesh[] } | null = null;
  /** Lantern brightness multiplier (a blackout drops it to nothing). */
  private lightMul = 1;
  /** A line only this player hears ("…that wasn't me"), shown when the shared subtitle is free. */
  private localSubtitle: { who: string; text: string; t: number } | null = null;
  /** Cutscene-only Path Guppy (an AL kid in the war) and the "back in the lab" memory props. */
  private cutGuppy!: GuppyModel;
  /** Allen in the flashbacks, before he ate everything: kid-sized, not round. */
  private youngAllen!: NpcModel;
  private cutProps!: { group: THREE.Group; screen: THREE.Group; tripod: THREE.Group; lab: THREE.Group; flask: THREE.Mesh; screenMat: THREE.MeshBasicMaterial; brew: THREE.MeshStandardMaterial };
  /** Opening-story bookkeeping: which beat is playing, which one-shot effects fired, pigs eaten so far. */
  private cut: { step: number; fired: Set<string>; eaten: number } = { step: -1, fired: new Set(), eaten: 0 };
  private aModel: AllenModel;
  private rick: NpcModel;
  private king: NpcModel;
  private charig: NpcModel;
  private kioff: NpcModel;
  private trout: TroutModel;
  private troutLeap = 0;
  private troutLeapNext = 7;
  private dummyWobble = 0;
  private dummyDx = 0;
  private dummyDz = 1;
  private markers: THREE.Mesh[] = [];
  private turret: TurretModel;
  private parts = new CombatVfx();
  private slamRing = new THREE.Group();
  private slamFill: THREE.Mesh;
  private dashLine: THREE.Mesh;
  private bellSwing = 0;
  private shieldGroup = new THREE.Group();
  private shieldWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3.66, 1),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, wireframe: true, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  private botViews = new Map<number, BotView>();
  private projViews = new Map<number, ProjView>();
  private puddleViews = new Map<number, MatMesh>();
  private shockViews = new Map<number, MatMesh>();
  private pickupViews = new Map<number, THREE.Group>();
  private kernelViews = new Map<number, THREE.Mesh>();
  private potViews = new Map<number, PotModel>();
  private hazardViews = new Map<number, HazardView>();
  private memorialViews = new Map<number, THREE.Group>();
  private wildViews = new Map<number, KenjiModel>();
  private allyViews = new Map<number, AllyView>();
  private decoyViews = new Map<number, THREE.Group>();
  /** Which active ability sits in each of the six slots (this browser's choice). */
  private loadout: (ActiveId | null)[] = Array(LOADOUT_SLOTS).fill(null);
  private knownActives = new Set<ActiveId>();
  /** Seconds until the next autosave check. */
  private saveT = 2;

  constructor(container: HTMLElement, onHud: (s: HudState) => void, opts: GameOptions = {}) {
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
    this.tags = document.createElement('div');
    this.tags.className = 'fx-layer nametag-layer';
    container.appendChild(this.tags);

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
    this.scene.add(this.herbLight, this.pigLight);
    const eyeMat = glow(0xff3b2a, 2.2);
    const eyeGeo = new THREE.SphereGeometry(0.07, 6, 4);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      for (const sx of [-0.16, 0.16]) {
        const m = new THREE.Mesh(eyeGeo, eyeMat);
        m.position.x = sx;
        g.add(m);
      }
      g.visible = false;
      this.scene.add(g);
      this.eyes.push({ g, t: 0, life: 0 });
    }

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

    /* the simulation, with the local pig (and any stand-in bots) */
    this.onNet = opts.onNet;
    this.localSim = new Sim(this.maps());
    this.sim = this.localSim;
    this.localId = this.localPid = this.localSim.addPlayer('Kenji')!.id;
    this.setBots(opts.bots ?? 0);

    this.openingPigs = [0xf0b4a7, 0xe99b8f, 0xcfa58f, 0xf2c0a8, 0xd9a0a0].map((t) => makeKenji(t, true));
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
    this.charig = makeCharig();
    this.charig.root.position.set(SPOT.charig.x, 0, SPOT.charig.z);
    this.kioff = makeKioff();
    this.kioff.root.position.set(SPOT.kioff.x, 0, SPOT.kioff.z);
    this.scene.add(this.rick.root, this.king.root, this.trout.root, this.charig.root, this.kioff.root);
    this.youngAllen = makeYoungAllen();
    this.youngAllen.root.visible = false;
    this.scene.add(this.youngAllen.root);
    this.cutGuppy = makePathGuppy();
    this.cutGuppy.hp.group.visible = false;
    this.cutGuppy.root.visible = false;
    this.scene.add(this.cutGuppy.root);
    this.cutProps = this.makeCutProps();
    this.scene.add(this.cutProps.group);
    // characters stay evenly lit: no self-shadow speckle on the faceted bodies, and they read clearly in shade
    for (const o of [this.aModel.root, this.rick.root, this.king.root, this.trout.root, this.charig.root, this.kioff.root])
      o.traverse((c) => {
        c.receiveShadow = c.castShadow;
      });

    for (const [x, y, z] of [
      [SPOT.rickley.x, 4.3, SPOT.rickley.z],
      [SPOT.kingger.x, 4.1, SPOT.kingger.z],
      [SPOT.bell.x, 5.4, SPOT.bell.z],
      [SPOT.hunt.x, 7.6, SPOT.hunt.z],
      [SPOT.trout.x, 3.2, SPOT.trout.z],
      [SPOT.kioff.x, 4.1, SPOT.kioff.z],
      [SPOT.charig.x, 4.1, SPOT.charig.z],
    ]) {
      const m = part(this.scene, new THREE.OctahedronGeometry(0.42, 0), glow(0xffc93c, 1.4), x, y, z, { shadow: false });
      this.markers.push(m);
    }

    this.turret = makeTurret();
    this.turret.root.position.set(SPOT.turret.x, 0, SPOT.turret.z);
    this.turret.root.visible = false;
    this.scene.add(this.turret.root);

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

  /** The pig this browser controls. */
  private get me(): Player {
    // playing Allen there is no pig of ours; the placeholder keeps pig-only code quiet
    if (this.asAllen) return this.ghost;
    return this.sim.player(this.localId) ?? this.sim.players[0] ?? this.ghost;
  }

  private get kModel(): KenjiModel {
    return this.players.get(this.localId)?.m ?? this.ghostModel;
  }

  /** The map data a simulation needs; the forest's scenery is built the first time anyone goes there. */
  private maps(): SimMaps {
    return {
      farm: { colliders: this.world.colliders, edibles: this.world.edibles },
      loadForest: () => {
        if (!this.forest) {
          this.forest = buildForest();
          this.forest.group.visible = false;
          this.scene.add(this.forest.group);
          setGrassDensity(this.forest.grass, this.grassFactor());
        }
        return { colliders: this.forest.colliders };
      },
    };
  }

  /** This browser plays Allen (chosen offline, or picked by the host online). */
  private get asAllen(): boolean {
    if (this.online) return !!this.net && this.net.status.allen === this.localId && this.localId > 0;
    return this.role === 'allen';
  }

  /** Who the camera follows: your pig, or Allen (or, while he's away between courses, the herd). */
  private focus(): { x: number; y: number; z: number } {
    if (!this.asAllen) return this.me;
    const A = this.sim.A;
    if (A.active) return A;
    return this.sim.living()[0] ?? this.sim.players[0] ?? { x: 0, y: 0, z: 6 };
  }

  /** Offline: play as a pig, or as Allen against the bot pigs (Kenji's pig leaves the herd). */
  setRole(role: 'pig' | 'allen') {
    if (this.online || this.screen !== 'title' || role === this.role) return;
    this.role = role;
    if (role === 'allen') {
      this.localSim.removePlayer(this.localPid);
    } else {
      const p = this.localSim.addPlayer('Kenji', this.localPid);
      if (p) {
        // Kenji is always the first pig
        this.localSim.players = [p, ...this.localSim.players.filter((o) => o !== p)];
      }
    }
    this.syncPlayers(0);
    this.emit();
  }

  private get online(): boolean {
    return this.net !== null && this.sim !== this.localSim;
  }

  /* ───────────────────────── online play ───────────────────────── */

  /** Where this page can find a game server, or null (e.g. opened from a file or an artifact). */
  static serverUrl(): string | null {
    return defaultServerUrl();
  }

  /** Connects to a game server and joins (or creates, with an empty code) a room. */
  joinOnline(room: string, name: string, url = defaultServerUrl()) {
    if (!url || this.screen !== 'title') return;
    this.leaveOnline(false);
    this.net = new NetClient(
      url,
      room,
      name,
      this.maps(),
      (s) => this.onNetStatus(s),
      (sim) => this.useSim(sim, sim.localId),
    );
  }

  /** Host, in an online lobby: who plays Allen (a player id, or 0 for the AI). */
  chooseAllen(pid: number) {
    this.net?.send({ t: 'allen', pid });
  }

  /** Drops the connection and goes back to playing on this device. */
  leaveOnline(notify = true) {
    if (!this.net) return;
    this.net.close();
    this.net = null;
    this.useSim(this.localSim, this.localPid);
    if (this.screen !== 'title') {
      this.screen = 'title';
      this.unlock();
      this.placeTitle();
    }
    if (notify) this.onNet?.(null);
    this.emit();
  }

  private useSim(sim: GameSim, localId: number) {
    this.sim = sim;
    this.localId = localId;
    this.clearViews();
    this.wasAllenActive = false;
    this.syncPlayers(0);
    this.emit();
  }

  private onNetStatus(s: NetStatus) {
    this.onNet?.(s);
    if (s.state === 'playing' && this.screen === 'title') {
      // the host started (or we joined a game in progress)
      this.sfx.unlock();
      this.screen = 'play';
      this.aModel.root.visible = false;
      this.controllerDisconnected = false;
      this.lock();
      this.emit();
    } else if (s.state === 'lobby' && this.screen !== 'title') {
      // the host took the room back to the lobby
      this.goToTitle();
    } else if (s.state === 'closed') {
      // keep the error for the title screen, but play offline from here
      const err = s;
      this.net?.close();
      this.net = null;
      this.useSim(this.localSim, this.localPid);
      if (this.screen !== 'title') {
        this.screen = 'title';
        this.unlock();
        this.placeTitle();
      }
      this.onNet?.(err);
      this.emit();
    }
  }

  /** Removes every entity model so the next sync rebuilds them from the current simulation. */
  private clearViews() {
    for (const v of this.players.values()) {
      this.discard(v.m.root);
      v.tag.remove();
    }
    this.players.clear();
    for (const v of this.botViews.values()) {
      if (v.ring) this.scene.remove(v.ring);
      this.discard(v.m.root);
    }
    this.botViews.clear();
    for (const v of this.projViews.values()) this.discard(v.mesh);
    this.projViews.clear();
    for (const v of [...this.puddleViews.values(), ...this.shockViews.values()]) {
      this.scene.remove(v.mesh);
      v.mat.dispose();
    }
    this.puddleViews.clear();
    this.shockViews.clear();
    for (const v of this.pickupViews.values()) this.discard(v);
    this.pickupViews.clear();
    for (const v of this.kernelViews.values()) this.discard(v);
    this.kernelViews.clear();
    for (const v of this.potViews.values()) this.discard(v.root);
    this.potViews.clear();
    for (const v of this.hazardViews.values()) this.scene.remove(v.g);
    this.hazardViews.clear();
    for (const v of this.memorialViews.values()) this.discard(v);
    this.memorialViews.clear();
    for (const v of this.wildViews.values()) this.discard(v.root);
    this.wildViews.clear();
    for (const v of this.allyViews.values()) this.discard(v.m.root);
    this.allyViews.clear();
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
        ['charig', makeCharig().body, [0, 2.3, 0], [1.2, 2.5, 4.2]],
        ['kioff', makeKioff().body, [0, 2.3, 0], [1.2, 2.5, 4.2]],
        ['earwhen', makeEarwhen().root, [0, 3.9, 0.2], [2.3, 4.2, 6.6]],
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
    // the volume sliders apply straight away
    this.offVolume = onVolumeChange(() => this.sfx.applyVolume());
    // any click or key starts the music (browsers block sound until then)
    this.sfx.onUnlock = () => this.music.unlock();
    window.addEventListener('pointerdown', this.onAnyGesture);
    window.addEventListener('keydown', this.onAnyGesture);
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
    window.removeEventListener('pointerdown', this.onAnyGesture);
    window.removeEventListener('keydown', this.onAnyGesture);
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
    this.music.dispose();
    this.offVolume?.();
    this.gfx.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.fx.remove();
    this.tags.remove();
  }

  private resize = () => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.gfx.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /* ───────────────────────── input ───────────────────────── */

  private onAnyGesture = () => this.music.unlock();

  private onKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if ((this.padActive || this.controllerDisconnected) && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) this.switchToKeyboard();
    // what this key does under the player's keybinds
    const virt = translate(code);
    if (this.screen === 'play') {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code) || virt.includes('Space')) e.preventDefault();
      if (e.repeat) return;
      this.sfx.unlock();
      for (const v of virt) {
        this.keys.add(v);
        this.pressed.add(v);
      }
      if (this.sim.opening && (virt.includes('Space') || code === 'Enter' || virt.includes('KeyE'))) this.advanceOpening();
      if (virt.includes('KeyP') || code === 'Escape') this.pause();
      if (virt.includes('KeyM')) this.toggleMute();
    } else if (e.repeat) {
      return;
    } else if (this.screen === 'shop') {
      if (code === 'Escape' || virt.includes('KeyE')) {
        e.preventDefault();
        this.closeShop();
      } else if (/^Digit[1-9]$/.test(code)) {
        const list = UPGRADES.filter((u) => u.npc === this.me.shopNpc);
        const u = list[Number(code.slice(5)) - 1];
        if (u) this.buy(u.id);
      }
    } else if (this.screen === 'paused') {
      if (this.settingsOpen) return;
      if (virt.includes('KeyP') || code === 'Escape') this.resume();
      if (virt.includes('KeyM')) this.toggleMute();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    for (const v of translate(e.code)) this.keys.delete(v);
  };
  private onBlur = () => {
    this.keys.clear();
    this.pressed.clear();
    this.touchMoveX = this.touchMoveY = 0;
    this.padFrame = null;
    this.padMenuRepeat.reset();
    this.gamepad.suspend();
    if (this.padActive && this.screen === 'play' && !this.sim.overReason) this.pause();
  };
  private onVisibility = () => {
    if (document.hidden) this.onBlur();
  };
  private onMouseDown = (e: MouseEvent) => {
    if (this.screen !== 'play') return;
    if (this.sim.opening) {
      this.advanceOpening();
      return;
    }
    this.switchToKeyboard();
    this.sfx.unlock();
    if (!this.locked) this.lock();
    for (const v of translate('Mouse' + e.button)) {
      this.keys.add(v);
      this.pressed.add(v);
    }
  };
  private onMouseUp = (e: MouseEvent) => {
    for (const v of translate('Mouse' + e.button)) this.keys.delete(v);
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
    this.yaw = this.me.heading - PI;
    this.pitch = this.sim.area === 'forest' ? 0.46 : 0.36;
  }

  private updateGamepad(now: number, dt: number) {
    if (document.hidden) return;
    const pad = this.gamepad.poll();
    this.padFrame = pad;
    if (!pad) {
      if (this.padLayout === null) return;
      this.padLayout = null;
      this.padMenuRepeat.reset();
      const playingWithPad = this.padActive && this.screen === 'play' && !this.sim.overReason;
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
      if (start || this.sim.overReason) return;
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

  /** This frame's controls for the local pig, as the simulation expects them. */
  private localInput(): PlayerInput {
    const keys = this.keys;
    const pad = this.padActive ? this.padFrame : null;
    const kx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const kz = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const useTouch = !kx && !kz && (this.touchMoveX !== 0 || this.touchMoveY !== 0);
    const ix = pad ? pad.moveX : useTouch ? this.touchMoveX : kx;
    const iz = pad ? -pad.moveY : useTouch ? this.touchMoveY : kz;
    // camera-relative stick → world-space direction
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    let buttons = 0;
    for (const [bit, codes] of BUTTON_KEYS) if (codes.some((c) => this.pressed.has(c))) buttons |= bit;
    if (!this.asAllen) {
      // a pig's ability keys are loadout slots: each fires whatever ability sits in it
      buttons &= ~(BTN.zap | BTN.squeal | BTN.whip);
      for (let i = 0; i < LOADOUT_SLOTS; i++) {
        const id = this.loadout[i];
        if (id && this.pressed.has(SLOT_CODES[i])) buttons |= ACTIVE_BTN[id];
      }
    }
    return { mx: fx * iz + rx * ix, mz: fz * iz + rz * ix, buttons };
  }

  /* ───────────────────────── public API ───────────────────────── */

  /** Sets how many stand-in bot pigs join the herd (0-7). Takes effect from the title screen. */
  setBots(n: number) {
    if (this.online) {
      // the room's host chooses the server's bot pigs
      (this.sim as NetSim).setBots(n);
      return;
    }
    const want = clamp(Math.floor(n) || 0, 0, 7);
    for (const id of this.botIds) this.localSim.removePlayer(id);
    this.botIds = [];
    this.brain = want > 0 ? new BotBrain() : null;
    for (let i = 0; i < want; i++) {
      const p = this.localSim.addPlayer(`Bot ${i + 1}`);
      if (p) this.botIds.push(p.id);
    }
    this.syncPlayers(0);
  }

  setMinimap(c: HTMLCanvasElement | null) {
    this.minimap = c;
  }

  setGamepadMenu(handler: (command: PadMenuCommand) => boolean) {
    this.onPadMenu = handler;
  }

  useKeyboard() {
    this.switchToKeyboard();
  }

  /* ───────────── touch controls (driven by ui/MobileControls) ───────────── */

  /** Set the on-screen joystick vector: x = strafe right, y = forward, magnitude ≤ 1. */
  setTouchMove(x: number, y: number) {
    const m = Math.hypot(x, y);
    const s = m > 1 ? 1 / m : 1;
    this.touchMoveX = x * s;
    this.touchMoveY = y * s;
  }

  /** Camera drag from a touch, in screen pixels (same sign convention as mouse movement). */
  touchLook(dx: number, dy: number) {
    if (this.screen !== 'play' || this.sim.opening) return;
    this.mdx += dx;
    this.mdy += dy;
    if (Math.abs(dx) > 1.5) this.autoYaw = null;
  }

  /** Press an action as if its keyboard key went down (e.g. 'KeyJ' for headbutt). */
  touchPress(code: string) {
    if (this.screen !== 'play') return;
    this.sfx.unlock();
    if (this.sim.opening) {
      this.advanceOpening();
      return;
    }
    this.keys.add(code);
    this.pressed.add(code);
  }

  touchRelease(code: string) {
    this.keys.delete(code);
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

  /** A quick sound so the sound-effects slider can be judged by ear. */
  previewSfx() {
    this.sfx.unlock();
    this.sfx.play('oink');
  }

  toggleMute() {
    this.sfx.setMuted(!this.sfx.muted);
    this.music.setMuted(this.sfx.muted);
    this.emit();
  }

  /** Starts a run: a fresh one, or (solo) carrying on from progress saved in this browser. */
  start(save?: SaveData) {
    this.sfx.unlock();
    if (this.online) {
      // online, the server starts the run (host only) and every browser follows its lead
      if (this.screen === 'title') this.sim.start();
      else (this.sim as NetSim).restart();
      return;
    }
    // the opening story is Kenji's; a person playing Allen goes straight in
    if (save) this.role = 'pig';
    this.localSim.setAllenPlayer(this.role === 'allen');
    if (save) this.localSim.resume(save);
    else this.sim.start({ opening: this.role === 'pig' && this.localSim.players.length <= 1 });
    this.restoreCinematicActors();
    this.controllerDisconnected = false;
    this.screen = 'play';
    for (const pig of this.openingPigs) pig.root.visible = false;
    this.aModel.root.visible = false;
    this.wasOpening = !!this.sim.opening;
    this.cut = { step: -1, fired: new Set(), eaten: 0 };
    this.loadout = Array(LOADOUT_SLOTS).fill(null);
    this.knownActives.clear();
    if (save) {
      // put the saved ability slots back (only abilities the herd still owns)
      save.loadout.slice(0, LOADOUT_SLOTS).forEach((id, i) => {
        const a = ACTIVE_IDS.find((x) => x === id);
        if (a && this.sim.levels[a] > 0) {
          this.loadout[i] = a;
          this.knownActives.add(a);
        }
      });
    }
    this.saveT = 2;
    this.processEvents();
    this.lock();
    this.emit();
  }

  finishOpening() {
    this.sim.finishOpening();
    this.emit();
  }

  advanceOpening() {
    this.sim.advanceOpening();
    this.emit();
  }

  restart() {
    this.start();
  }

  retryCourse() {
    this.sim.retryCourse();
    if (this.online) return; // the game resumes when the server says so
    this.screen = 'play';
    this.processEvents();
    this.lock();
    this.emit();
  }

  /**
   * Back to the title screen. Solo, the run ends. Online, a host takes the whole room back to its lobby
   * (everyone stays connected); anyone else leaves the room.
   */
  toMenu() {
    if (this.online) {
      const net = this.net?.status;
      if (net?.host) (this.sim as NetSim).toLobby();
      else this.leaveOnline();
      return;
    }
    this.localSim.start({ opening: false });
    this.goToTitle();
  }

  /** Shows the title screen over a reset farm. */
  private goToTitle() {
    this.screen = 'title';
    this.keys.clear();
    this.pressed.clear();
    this.touchMoveX = this.touchMoveY = 0;
    this.controllerDisconnected = false;
    this.unlock();
    this.processEvents();
    this.clearViews();
    this.syncPlayers(0);
    for (const pig of this.openingPigs) pig.root.visible = false;
    this.restoreCinematicActors();
    this.placeTitle();
    this.emit();
  }

  pause() {
    if (this.screen !== 'play') return;
    this.screen = 'paused';
    this.keys.clear();
    this.pressed.clear();
    this.touchMoveX = this.touchMoveY = 0;
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

  /** Online the world keeps going behind the shop and pause menus; keep it on screen and in sync. */
  private updateOnlineBackground(dt: number) {
    this.sim.step(dt, new Map());
    this.processEvents();
    this.syncAll(dt);
    this.animateNpcs(dt);
    this.parts.update(dt, this.camera);
    if (this.screen === 'shop' && !this.me.shopNpc) {
      this.screen = 'play';
      this.lock();
      this.emit();
    }
    if (this.sim.dirty) this.emit();
  }

  returnToFarm() {
    if (this.sim.area !== 'forest' || !['play', 'paused'].includes(this.screen)) return;
    this.screen = 'play';
    this.sim.returnToFarm();
    this.processEvents();
    this.lock();
    this.emit();
  }

  closeShop() {
    if (this.screen !== 'shop') return;
    this.screen = 'play';
    this.sim.closeShop(this.localId);
    this.lock();
    this.emit();
  }

  buy(id: UpgradeId) {
    if (this.screen !== 'shop') return;
    this.sim.buy(this.localId, id);
    this.processEvents();
    this.emit();
  }

  /** The "back in the lab" memory set: a Roblox-ish game on a big monitor, a phone on a tripod, a chemistry bench. */
  private makeCutProps() {
    const group = new THREE.Group();
    group.visible = false;
    const std = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const dark = std(0x26262c);
    // monitor on a desk, screen drawn with blocky little avatars
    const screen = new THREE.Group();
    add(screen, new THREE.BoxGeometry(3.2, 0.12, 1.4), std(0x8a6a48), 0, 1.0, 0);
    for (const s of [-1, 1]) add(screen, new THREE.BoxGeometry(0.12, 1.0, 1.2), std(0x6e5238), 1.45 * s, 0.5, 0);
    add(screen, new THREE.BoxGeometry(2.6, 1.6, 0.12), dark, 0, 2.05, -0.3);
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 80;
    const g = cv.getContext('2d');
    if (g) {
      g.fillStyle = '#7ec8ff';
      g.fillRect(0, 0, 128, 80);
      g.fillStyle = '#4caf50';
      g.fillRect(0, 56, 128, 24);
      for (const [x, y, w, h, c] of [[12, 28, 16, 16, '#c0c0c0'], [70, 20, 26, 36, '#d35400'], [100, 40, 14, 16, '#f1c40f']] as const) {
        g.fillStyle = c;
        g.fillRect(x, y, w, h);
      }
      // two blocky avatars
      for (const [x, c] of [[40, '#2f6d4e'], [56, '#c0392b']] as const) {
        g.fillStyle = '#f5d76e';
        g.fillRect(x, 30, 8, 8);
        g.fillStyle = c;
        g.fillRect(x - 1, 38, 10, 10);
        g.fillStyle = '#2c3e80';
        g.fillRect(x, 48, 8, 8);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshBasicMaterial({ map: tex });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), screenMat);
    pane.position.set(0, 2.05, -0.23);
    screen.add(pane);
    screen.position.set(-7, 0, 45);
    // phone on a tripod, with a red "recording" light
    const tripod = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const leg = add(tripod, new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6), dark, 0, 0.9, 0);
      leg.rotation.set(0.28 * Math.cos((i * TAU) / 3), 0, 0.28 * Math.sin((i * TAU) / 3));
    }
    add(tripod, new THREE.BoxGeometry(0.5, 0.85, 0.08), std(0x1b1b1f), 0, 2.15, 0);
    add(tripod, new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }), 0.16, 2.48, 0.05);
    tripod.position.set(0, 0, 42);
    // lab bench, a rack of tubes and the flask
    const lab = new THREE.Group();
    add(lab, new THREE.BoxGeometry(3.4, 0.14, 1.4), std(0xdfe6ea), 0, 1.0, 0);
    for (const s of [-1, 1]) add(lab, new THREE.BoxGeometry(0.14, 1.0, 1.2), std(0x9aa5ad), 1.55 * s, 0.5, 0);
    const brew = new THREE.MeshStandardMaterial({ color: 0x5dff9d, emissive: 0x2bd46a, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
    const flask = add(lab, new THREE.SphereGeometry(0.34, 12, 10), brew, 0.4, 1.42, 0);
    add(lab, new THREE.CylinderGeometry(0.09, 0.11, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.5 }), 0.4, 1.86, 0);
    for (const [i, c] of [0xff5d8f, 0x5db8ff, 0xffd23f].entries())
      add(lab, new THREE.CylinderGeometry(0.07, 0.07, 0.46, 8), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4 }), -0.9 + i * 0.24, 1.3, 0);
    lab.position.set(7, 0, 45);
    group.add(screen, tripod, lab);
    return { group, screen, tripod, lab, flask, screenMat, brew };
  }

  /* ───────────────────────── cinematic actors ───────────────────────── */

  private restoreCinematicActors() {
    const me = this.me;
    this.kModel.root.position.set(me.x, 0, me.z);
    this.kModel.root.rotation.set(0, me.heading, 0);
    this.kModel.pivot.position.y = 0.75;
    this.kModel.pivot.rotation.set(0, 0, 0);
    this.kModel.head.rotation.set(0, 0, 0);
    this.kModel.skin.color.setHex(me.tint || 0xf7a8b8);

    this.rick.root.position.set(SPOT.rickley.x, 0, SPOT.rickley.z);
    this.rick.root.rotation.set(0, 0, 0);
    this.rick.root.position.y = 0;
    this.rick.armR.rotation.set(0, 0, 0);
    this.rick.armL.rotation.set(0, 0, 0);
    this.rick.head.rotation.set(0, 0, 0);
    this.rick.body.position.y = 0;

    this.king.root.position.set(SPOT.kingger.x, 0, SPOT.kingger.z);
    this.king.root.rotation.set(0, 0, 0);
    this.king.armR.rotation.set(0, 0, 0);
    this.king.armL.rotation.set(0, 0, 0);
    this.king.body.position.y = 0;

    this.trout.root.position.set(SPOT.trout.x, 0, SPOT.trout.z);
    this.trout.root.rotation.set(0, PI / 2, 0);
    for (const [n, spot] of [[this.charig, SPOT.charig], [this.kioff, SPOT.kioff]] as const) {
      n.root.position.set(spot.x, 0, spot.z);
      n.root.rotation.set(0, 0, 0);
      n.body.position.y = 0;
      n.head.rotation.set(0, 0, 0);
      n.armR.rotation.set(0, 0, 0);
      n.armL.rotation.set(0, 0, 0);
    }

    this.trout.root.position.y = 0;
    this.trout.body.rotation.set(0, 0, 0);
    this.cutGuppy.root.visible = false;
    this.cutGuppy.root.rotation.set(0, 0, 0);
    const Y = this.youngAllen;
    Y.root.visible = false;
    Y.root.rotation.set(0, 0, 0);
    Y.root.position.y = 0;
    Y.body.position.y = 0;
    Y.head.rotation.set(0, 0, 0);
    Y.armR.rotation.set(0, 0, 0);
    Y.armL.rotation.set(0, 0, 0);
    this.cutProps.group.visible = false;
    this.cutProps.screen.visible = this.cutProps.tripod.visible = this.cutProps.lab.visible = false;

    this.aModel.root.scale.setScalar(1);
    this.aModel.root.position.set(0, 0, 61);
    this.aModel.root.rotation.set(0, PI, 0);
    this.aModel.armR.rotation.set(-2.2, 0, 0);
    this.aModel.armL.rotation.set(-0.5, 0, 0);
    this.aModel.head.rotation.set(0, 0, 0);
    this.aModel.pivot.position.y = 0;
    this.aModel.pivot.scale.setScalar(1);
    this.aModel.jaw.scale.y = 1;
    this.aModel.legL.rotation.x = this.aModel.legR.rotation.x = 0;

    for (const pig of this.openingPigs) {
      pig.root.visible = false;
      pig.root.position.set(0, 0, 0);
      pig.root.rotation.set(0, PI, 0);
      pig.root.scale.setScalar(1);
      pig.pivot.position.y = 0.75;
      pig.pivot.rotation.set(0, 0, 0);
      pig.head.rotation.set(0, 0, 0);
    }
  }

  private placeTitle() {
    this.aModel.root.visible = true;
    this.aModel.root.position.set(0, 0, 61);
    this.aModel.root.rotation.y = PI;
    this.aModel.armR.rotation.x = -2.2;
    this.aModel.armL.rotation.x = -0.5;
    this.syncPlayers(0);
  }

  private discard(o: THREE.Object3D) {
    this.scene.remove(o);
    o.traverse((c) => {
      if (c instanceof THREE.Mesh && !c.userData.sharedGeometry) c.geometry.dispose();
    });
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

  /* ───────────────────────── simulation events ───────────────────────── */

  /** Presents everything the simulation did since the last call. */
  private processEvents() {
    for (const e of this.sim.drainEvents()) this.present(e);
  }

  private present(e: SimEvent) {
    switch (e.t) {
      case 'vfx':
        (this.parts[e.m] as (...a: unknown[]) => void)(...e.a);
        break;
      case 'sfx':
        if (e.only === undefined || e.only === (this.asAllen ? ALLEN_ID : this.localId)) this.sfx.play(e.n);
        break;
      case 'text':
        this.floatText(e.x, e.y, e.z, e.s, e.c);
        break;
      case 'shake':
        if (e.only === undefined || e.only === (this.asAllen ? ALLEN_ID : this.localId)) this.shake = Math.max(this.shake, e.a);
        break;
      case 'scare':
        if (e.only === this.localId && !this.asAllen) this.jumpScare();
        break;
      case 'troutLeap':
        if (this.troutLeap > 0) break;
        this.troutLeap = 0.001;
        this.troutLeapNext = rand(9, 15);
        if (this.screen === 'play' || this.screen === 'shop') this.sfx.play('splash');
        this.parts.emit(SPOT.trout.x, 0.22, SPOT.trout.z, 12, 0x8ae8ff, 6, 0.2, 0.5, 14, 0.9);
        break;
      case 'bell':
        this.bellSwing = 1;
        break;
      case 'dummyHit':
        this.dummyWobble = 1;
        this.dummyDx = e.dx;
        this.dummyDz = e.dz;
        break;
      case 'area':
        this.showArea(e.area, e.changed);
        break;
      case 'teleport': {
        const me = this.me;
        this.yaw = e.heading - PI;
        this.pitch = this.sim.area === 'forest' ? 0.46 : 0.36;
        this.camDist = 10.5;
        this.camClip = 20;
        this.autoYaw = null;
        this.mdx = this.mdy = 0;
        this.camTarget.set(me.x, 1.5, me.z);
        this.syncAll(0);
        this.updateCamera(1);
        this.drawMinimap();
        break;
      }
      case 'lookAt': {
        if (this.asAllen) {
          // playing Allen, the camera settles in behind him as he comes through the gate
          this.autoYaw = { to: this.sim.A.heading + PI, t: 1.3 };
          break;
        }
        const me = this.me;
        this.autoYaw = { to: Math.atan2(-(e.x - me.x), -(e.z - me.z)), t: 1.3 };
        break;
      }
    }
  }

  /** The herd arrived on a map: swap scenery and clear leftover effects. */
  private showArea(area: Area, changed: boolean) {
    const farm = area === 'farm';
    this.world.group.visible = farm;
    if (this.forest) this.forest.group.visible = !farm;
    this.rick.root.visible = farm;
    this.king.root.visible = farm;
    this.trout.root.visible = farm;
    this.charig.root.visible = farm;
    this.kioff.root.visible = farm;
    for (const marker of this.markers) marker.visible = farm && this.sim.mode === 'intermission';
    this.parts.clear();
    this.keys.clear();
    this.pressed.clear();
    this.shake = 0;
    for (const child of [...this.fx.children]) if (child !== this.arrow) child.remove();
    if (changed) {
      const fade = document.createElement('div');
      fade.className = 'map-transition';
      this.fx.appendChild(fade);
      window.setTimeout(() => fade.remove(), 850);
    }
    this.mapTimer = 0;
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
    else if (this.online && (this.screen === 'shop' || this.screen === 'paused')) this.updateOnlineBackground(dt);
    else this.updateIdle(dt);
    this.updateNametags();
    this.updateSky(dt);
    this.updateForestMood(dt);
    this.updateMusic();
    this.autosave(dt);
    this.gfx.render(dt, this.time);
    this.watchPerformance(raw);
  };

  /** Saves a solo run's progress in this browser every couple of seconds between courses; a won run clears it. */
  private autosave(dt: number) {
    if (this.online) return;
    this.saveT -= dt;
    if (this.saveT > 0) return;
    this.saveT = 2;
    if (this.screen !== 'play' && this.screen !== 'paused' && this.screen !== 'shop' && this.screen !== 'victory') return;
    if (this.sim.outcome === 'victory') {
      if (loadSave()) clearSave();
      return;
    }
    const p = this.localSim.progress();
    if (!p) return;
    writeSave({ ...p, at: Date.now(), version: GAME_VERSION, loadout: [...this.loadout], bots: this.botIds.length });
  }

  /** Farm songs normally, the forest song in the forest, and the fight song from the dinner bell until Allen is beaten (or the farm falls). */
  private updateMusic() {
    const sim = this.sim;
    const inGame = this.screen === 'play' || this.screen === 'paused' || this.screen === 'shop';
    const fight = inGame && sim.mode === 'combat' && !sim.opening && !sim.outcome;
    // Earwhen's theme from his leap over the gate, and through every one of his fights
    const earwhenHere = sim.bots.some((b) => b.kind === 'earwhen');
    const earwhen = inGame && !sim.outcome && ((sim.A.active && sim.A.state === 'calling' && earwhenHere) || (fight && sim.course >= FINALE));
    this.music.update(earwhen ? 'earwhen' : fight ? 'fight' : inGame && sim.area === 'forest' ? 'forest' : 'farm');
  }

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
      if (this.online) {
        // someone chose retry / play again: follow the server back into the game
        this.sim.step(dt, new Map());
        this.processEvents();
        this.syncAll(dt);
        if (!this.sim.outcome) {
          this.screen = 'play';
          this.lock();
          this.emit();
          return;
        }
      }
      this.yaw += dt * 0.15;
      this.world.update(this.time, dt, []);
      this.animateNpcs(dt);
      if (this.screen === 'victory') {
        // a happy little victory hop
        const v = this.players.get(this.localId);
        if (v) this.animatePlayer(this.me, v, dt, Math.abs(Math.sin(this.time * 6)) * 0.9);
      }
      this.updateCamera(dt);
      this.parts.update(dt, this.camera);
    }
    this.arrow.style.display = 'none';
  }

  /** Inputs for every pig this browser drives: the local player plus any stand-in bots. */
  private gatherInputs(dt: number): Map<number, PlayerInput> {
    const inputs = new Map<number, PlayerInput>();
    inputs.set(this.asAllen ? ALLEN_ID : this.localId, this.localInput());
    if (this.brain && !this.online) {
      for (const id of this.botIds) {
        const p = this.sim.player(id);
        if (p) inputs.set(id, this.brain.think(this.sim, p, dt));
      }
    }
    return inputs;
  }

  private updatePlay(dt: number) {
    const sim = this.sim;
    if (sim.opening) {
      this.pressed.clear();
      sim.step(dt);
      this.processEvents();
      if (sim.opening) {
        this.updateOpeningCutscene(dt);
        this.world.update(this.time, dt, []);
        this.parts.update(dt, this.camera);
        if (sim.dirty) this.emit();
        return;
      }
    }
    if (this.wasOpening && !sim.opening) {
      // story's over: put every actor back where gameplay expects them
      this.wasOpening = false;
      for (const pig of this.openingPigs) pig.root.visible = false;
      this.restoreCinematicActors();
      this.emit();
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

    /* simulate */
    const sdt = sim.hitstop > 0 ? dt * 0.05 : dt;
    sim.step(dt, this.gatherInputs(dt));
    this.pressed.clear();
    this.processEvents();

    /* present */
    this.syncAll(sdt);
    this.animateNpcs(dt);
    this.animateCallNpcs();
    const scare = sim.players.map((p) => ({ x: p.x, z: p.z }));
    if (sim.A.active) scare.push({ x: sim.A.x, z: sim.A.z });
    if (sim.area === 'forest') this.forest?.update(this.time);
    else this.world.update(this.time, dt, scare);
    this.emitAmbientCombatFx(sdt);
    this.updateCamera(dt);
    this.parts.update(sdt, this.camera);
    this.updateArrow();

    // bell swing + lakeside sparring dummy spring wobble
    this.bellSwing = Math.max(0, this.bellSwing - dt * 0.5);
    this.world.bellPivot.rotation.z = Math.sin(this.time * 12) * this.bellSwing * 0.6;
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

    /* screens driven by the simulation */
    if (sim.outcome) {
      this.screen = sim.outcome;
      this.keys.clear();
      this.unlock();
      this.emit();
      return;
    }
    if (this.me.shopNpc) {
      this.screen = 'shop';
      this.keys.clear();
      this.pressed.clear();
      this.unlock();
      this.emit();
      return;
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0 || sim.dirty) {
      this.hudTimer = 0.08;
      this.emit();
    }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.1;
      this.drawMinimap();
    }
  }

  /** Path Guppy just leapt out at you: a white-red flash, a jolt, and a hard shake. */
  private jumpScare() {
    this.shake = Math.max(this.shake, 1.4);
    this.sfx.play('scream');
    // his face, right in yours
    const face = document.createElement('div');
    face.className = 'scare-face';
    // landscape: fill the screen; portrait: show the whole face, black above and below
    face.innerHTML = window.innerHeight > window.innerWidth ? SCARE_FACE_SVG.replace('xMidYMid slice', 'xMidYMid meet') : SCARE_FACE_SVG;
    // over everything, HUD included
    document.body.appendChild(face);
    window.setTimeout(() => {
      face.remove();
      // then a red after-flash as he drops back into the dark
      const el = document.createElement('div');
      el.className = 'scare-flash';
      this.fx.appendChild(el);
      window.setTimeout(() => el.remove(), 900);
    }, 1050);
    navigator.vibrate?.([120, 40, 200, 40, 120]);
  }

  /** The Hog Hunt after dark: lantern light that follows Herb and your pig, and eyes watching from the trees. */
  private updateForestMood(dt: number) {
    const sim = this.sim;
    const forest = sim.area === 'forest' && (this.screen === 'play' || this.screen === 'paused' || this.screen === 'shop');
    const herb = forest ? sim.wild.find((w) => w.name === 'Herb') : undefined;
    const flicker = 1 + Math.sin(this.time * 13) * 0.06 + Math.sin(this.time * 31) * 0.04;
    this.updateAnomalies(dt, forest);
    this.herbLight.intensity = lerp(this.herbLight.intensity, herb ? 60 * flicker * this.lightMul : 0, 1 - Math.exp(-(this.lightMul < 1 ? 30 : 4) * dt));
    if (herb) this.herbLight.position.set(herb.x + Math.sin(herb.heading) * 0.9, 1.6, herb.z + Math.cos(herb.heading) * 0.9);
    const k = this.focus();
    this.pigLight.intensity = lerp(this.pigLight.intensity, forest ? 9 * this.lightMul : 0, 1 - Math.exp(-(this.lightMul < 1 ? 30 : 4) * dt));
    this.pigLight.position.set(k.x, 2.6, k.z);
    // gold glints where Herb is digging
    if (forest && herb?.spotted && sim.hunt && Math.random() < dt * 14)
      this.parts.motes(sim.hunt.tx + (Math.random() - 0.5) * 1.6, 0.4, sim.hunt.tz + (Math.random() - 0.5) * 1.6, 1, 0xffd23f, 1.2, 0.14, 0.9, -1.5, 0, 0.3, 3);
    for (const e of this.eyes) {
      if (!forest) {
        e.g.visible = false;
        e.life = 0;
        continue;
      }
      if (e.life <= 0) {
        e.g.visible = false;
        if (Math.random() < dt * 0.25) {
          // somewhere out past the lantern light, roughly where you're looking
          const look = this.camera.getWorldDirection(this.tmp);
          const a = Math.atan2(look.x, look.z) + (Math.random() - 0.5) * 2.2;
          const r = 16 + Math.random() * 10;
          e.g.position.set(k.x + Math.sin(a) * r, 0.6 + Math.random() * 1.6, k.z + Math.cos(a) * r);
          e.g.lookAt(k.x, 1, k.z);
          e.life = 2 + Math.random() * 3;
          e.t = 0;
        }
        continue;
      }
      e.life -= dt;
      e.t += dt;
      // blink now and then
      e.g.visible = Math.sin(e.t * 2.3) > -0.85;
    }
  }

  /** The things that lurk in Folk Valley, built the first time they're needed. */
  private makeAnomalyProps() {
    if (this.anomalyProps) return this.anomalyProps;
    // the Watcher: very tall, very thin, arms hanging past its knees
    const watcher = new THREE.Group();
    // pale and grey, so it shows as a faint shape in the fog
    const dark = new THREE.MeshStandardMaterial({ color: 0xa9aba2, emissive: 0x2a2c2a, roughness: 1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 3.6, 8), dark);
    body.position.y = 2.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), dark);
    head.position.y = 4.65;
    head.scale.set(0.85, 1.25, 0.85);
    watcher.add(body, head);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 3.3, 6), dark);
      arm.position.set(sx * 0.36, 2.6, 0);
      arm.rotation.z = sx * 0.07;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 1.2, 6), dark);
      leg.position.set(sx * 0.12, 0.6, 0);
      // black, glinting eyes that the fog can't hide
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
      glint.position.set(sx * 0.11 + 0.02, 4.75, 0.33);
      watcher.add(glint);
      eye.position.set(sx * 0.11, 4.72, 0.28);
      watcher.add(arm, leg, eye);
    }
    watcher.visible = false;
    // the Mimic: looks just like Herb, minus the lantern, and stands far too still
    const mimic = makeKenji(0xc89a74, true);
    mimic.root.scale.setScalar(0.95);
    // faintly lit from nowhere, so you can just make it out
    mimic.skin.emissive.setHex(0x3a2a1e);
    mimic.root.visible = false;
    // will-o'-wisps
    const wisps: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dfcd8).multiplyScalar(2.2), fog: false }));
      w.visible = false;
      wisps.push(w);
      this.scene.add(w);
    }
    this.scene.add(watcher, mimic.root);
    this.anomalyProps = { watcher, mimic, wisps };
    return this.anomalyProps;
  }

  private hideAnomalies() {
    const p = this.anomalyProps;
    if (p) {
      p.watcher.visible = false;
      p.mimic.root.visible = false;
      for (const w of p.wisps) w.visible = false;
    }
    this.renderer.domElement.style.filter = '';
    this.lightMul = 1;
  }

  /** Somewhere `dist` metres out, roughly where the camera is looking. */
  private aheadSpot(dist: number, spread: number) {
    const k = this.focus();
    const look = this.camera.getWorldDirection(this.tmp);
    const a = Math.atan2(look.x, look.z) + (Math.random() - 0.5) * spread;
    // (deliberately not tidied out of the trees: half-hidden among the trunks is worse)
    const lim = FOREST_BOUND - 4;
    return { x: clamp(k.x + Math.sin(a) * dist, -lim, lim), z: clamp(k.z + Math.cos(a) * dist, -lim, lim), a };
  }

  private anomalySay(who: string, text: string, t = 3) {
    this.localSubtitle = { who, text, t };
  }

  /** Every 12-25 s in Folk Valley, something happens that maybe didn't. */
  private updateAnomalies(dt: number, forest: boolean) {
    if (this.localSubtitle) {
      this.localSubtitle.t -= dt;
      if (this.localSubtitle.t <= 0) this.localSubtitle = null;
    }
    const sim = this.sim;
    const playing = forest && this.screen === 'play' && !!sim.hunt && !this.asAllen;
    if (!playing) {
      if (this.anomaly) {
        this.anomaly = null;
        this.hideAnomalies();
      }
      if (!forest) this.anomalyT = 14;
      return;
    }
    const k = this.focus();
    const a = this.anomaly;
    if (!a) {
      // not while Path Guppy is busy scaring someone
      if (sim.bots.some((b) => b.kind === 'guppy')) return;
      this.anomalyT -= dt;
      if (this.anomalyT > 0) return;
      this.anomalyT = 12 + Math.random() * 13;
      const kinds = ANOMALIES.filter((x) => x !== this.lastAnomaly);
      this.startAnomaly(kinds[Math.floor(Math.random() * kinds.length)]);
      return;
    }
    a.t += dt;
    const P = this.makeAnomalyProps();
    const dK = Math.hypot(a.x - k.x, a.z - k.z);
    let done = a.t >= a.dur;
    switch (a.kind) {
      case 'watcher': {
        // it just stands there, facing you; get close (or wait) and it's simply gone
        P.watcher.lookAt(k.x, 0, k.z);
        P.watcher.rotation.x = 0;
        P.watcher.rotation.z = 0;
        if (dK < 10) done = true;
        break;
      }
      case 'mimic': {
        const m = P.mimic;
        if (!a.flag && dK < 8.5) {
          // it notices you: the head turns all the way round
          a.flag = true;
          a.t = Math.min(a.t, a.dur - 0.7);
          this.sfx.play('whisper');
        }
        if (a.flag) m.head.rotation.y = lerp(m.head.rotation.y, PI, 1 - Math.exp(-6 * dt));
        if (done && a.flag) {
          this.parts.dust(a.x, 0.8, a.z, 12, 0x15181c, { spread: 0.8, speed: 2.5, rise: 2, size0: 0.8, size1: 2.4, life: 0.9 });
          this.anomalySay('Herb', '…That wasn’t me. Don’t follow the one without a lantern.', 3.6);
        }
        break;
      }
      case 'blackout': {
        // the lanterns gutter out, something walks past, and the eyes come in close
        const on = a.t > a.dur - 0.5 ? (a.t - (a.dur - 0.5)) / 0.5 : 0;
        this.lightMul = a.t < 0.4 ? (Math.sin(a.t * 70) > 0 ? 0.6 : 0.05) : on * (Math.sin(a.t * 60) > -0.3 ? 1 : 0.2);
        if (!a.flag && a.t > 0.6) {
          a.flag = true;
          this.sfx.play('footsteps');
          for (const e of this.eyes.slice(0, 3)) {
            const ang = Math.random() * TAU;
            e.g.position.set(k.x + Math.sin(ang) * 7, 0.9 + Math.random(), k.z + Math.cos(ang) * 7);
            e.g.lookAt(k.x, 1, k.z);
            e.life = a.dur - a.t;
            e.t = 0;
          }
        }
        if (done) this.anomalySay('Herb', this.pick(['Who turned off my lantern?!', 'Something just walked right past us.', 'I didn’t see anything. You didn’t either.']), 3);
        break;
      }
      case 'wisps': {
        // little lights drifting off into the trees, beckoning
        P.wisps.forEach((w, i) => {
          const f = a.t / a.dur;
          w.visible = Math.sin(a.t * 3 + i * 1.7) > -0.7;
          w.position.set(a.x + Math.sin(i * 2.1 + a.t * 0.4) * 3, 1.2 + Math.sin(a.t * 2 + i) * 0.4 + i * 0.15, a.z + Math.cos(i * 1.3 + a.t * 0.35) * 3);
          w.scale.setScalar(1 - f * 0.6);
        });
        // they keep their distance
        if (dK < 9) {
          const away = Math.atan2(a.x - k.x, a.z - k.z);
          a.x += Math.sin(away) * 6 * dt;
          a.z += Math.cos(away) * 6 * dt;
        }
        break;
      }
      case 'whispers':
      case 'silence':
      case 'glitch': {
        if (a.kind === 'glitch') {
          // the picture tears for a moment
          const on = (a.t < 0.12 || (a.t > 0.35 && a.t < 0.45)) && !this.reduceMotion;
          this.renderer.domElement.style.filter = on ? 'invert(1) hue-rotate(140deg) contrast(1.6) saturate(2)' : '';
          if (!a.flag && a.t > 0.35) {
            a.flag = true;
            this.sfx.play('static');
          }
        }
        if (a.kind === 'silence' && !a.flag && a.t > 3.5) {
          a.flag = true;
          this.sfx.play('footsteps');
        }
        break;
      }
    }
    if (done) {
      this.anomaly = null;
      this.hideAnomalies();
    }
  }

  private startAnomaly(kind: AnomalyKind) {
    const P = this.makeAnomalyProps();
    this.lastAnomaly = kind;
    const k = this.focus();
    let x = k.x;
    let z = k.z;
    let dur = 3;
    switch (kind) {
      case 'watcher': {
        const s = this.aheadSpot(17, 0.6);
        x = s.x;
        z = s.z;
        dur = 9;
        P.watcher.position.set(x, 0, z);
        P.watcher.visible = true;
        this.sfx.play('drone');
        break;
      }
      case 'mimic': {
        const s = this.aheadSpot(13, 0.7);
        x = s.x;
        z = s.z;
        dur = 14;
        const m = P.mimic;
        m.root.position.set(x, 0, z);
        // facing away from you
        m.root.rotation.set(0, Math.atan2(x - k.x, z - k.z), 0);
        m.head.rotation.set(0, 0, 0);
        m.root.visible = true;
        break;
      }
      case 'blackout':
        dur = 3.2;
        this.music.duck(3.2);
        break;
      case 'wisps': {
        const s = this.aheadSpot(12, 0.5);
        x = s.x;
        z = s.z;
        dur = 9;
        this.anomalySay('Herb', 'Don’t follow the lights. Never follow the lights.', 3.4);
        break;
      }
      case 'whispers':
        dur = 2.5;
        this.sfx.play('whisper');
        this.floatText(k.x + (Math.random() - 0.5) * 3, 2.2, k.z + (Math.random() - 0.5) * 3, this.pick(['turn around', 'it sees you', 'stay', 'not Herb']), 'info');
        break;
      case 'glitch':
        dur = 0.8;
        break;
      case 'silence':
        dur = 6;
        this.music.duck(6);
        break;
    }
    this.anomaly = { kind, t: 0, dur, x, z, flag: false };
  }

  private pick<T>(list: T[]): T {
    return list[Math.floor(Math.random() * list.length)];
  }

  private updateSky(dt: number) {
    const sim = this.sim;
    const t = sim.area === 'forest' ? FOREST_TOD : TODS[Math.min(sim.tod, TODS.length - 1)];
    // travelling between the farm and the forest cuts straight to the new light; time of day eases in
    const cut = sim.area !== this.skyArea;
    this.skyArea = sim.area;
    const s = cut ? 1 : 1 - Math.exp(-0.9 * dt);
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
    const fx = this.screen === 'title' ? 0 : this.focus().x;
    const fz = this.screen === 'title' ? 6 : this.focus().z;
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
    const sim = this.sim;
    const A = sim.A;
    for (const k of sim.players) {
      // Perfect-Dodge Focus aura: rising cyan glints
      if (k.focus > 0 && Math.random() < dt * 26) {
        this.parts.motes(k.x, k.y + 0.55, k.z, 1, 0x6ff7ff, 2.2, 0.14, 0.52, -2.5, 5, 0.75, 3.8);
      }
      // Lightning Zap static overcharge: crackling electric sparks around the tusks
      if (k.zapAura > 0 && Math.random() < dt * 28) {
        this.parts.sparks(k.x, k.y + 0.85, k.z, 1, 0x62f4ff, 6.5, 0.12, 0.22, { grav: 2, hdr: 4.4, stretch: 4.5, altColor: 0xffe87a });
      }
      // hot Combo Flow streak (4+ hits): orbiting golden/aqua sparks
      if (k.flowCount >= 4 && k.flowTimer > 0 && Math.random() < dt * 18) {
        const col = k.flowCount >= 7 ? 0x5ff2ff : 0xffd24d;
        this.parts.motes(k.x, k.y + 0.6, k.z, 1, col, 2.0, 0.13, 0.5, -2.0, 6, 0.85, 3.5);
      }
      // trot footstep dust puffs on dirt/grass when moving briskly
      if (k.grounded && k.action === 'none' && Math.hypot(k.vx, k.vz) > 8 && Math.random() < dt * 8) {
        this.parts.dust(k.x, k.y + 0.12, k.z, 1, k.muddy > 0 ? 0x6b4a33 : 0xe4d7be, { spread: 0.25, speed: 1.2, rise: 0.8, size0: 0.24, size1: 0.82, life: 0.36 });
      }
    }
    // Kingger's Tesla coil crackles brighter once Lightning Zap is unlocked
    if (sim.area === 'farm' && sim.levels.zap > 0 && Math.random() < dt * (4 + sim.levels.zap * 3)) {
      this.parts.sparks(COIL.x, COIL.y, COIL.z, 1, 0x62f4ff, 5.5, 0.13, 0.24, { grav: 1, hdr: 4.2, altColor: 0xffffff });
    }
    if (A.active && A.hp > 0) {
      // Allen Hangry aura: rising fiery embers & steam
      if (A.enraged && Math.random() < dt * 24) {
        this.parts.motes(A.x, A.y + 1.4 + Math.random() * 2.2, A.z, 1, Math.random() < 0.5 ? 0xff4a1f : 0xffb83d, 3.2, 0.18, 0.65, -3.5, 3, 1.5, 4.0);
      }
      // Tilted after Smash Battles: angry red steam
      if (A.tilt > 0 && Math.random() < dt * 26) {
        this.parts.motes(A.x, A.y + 1.6 + Math.random() * 2.4, A.z, 1, 0xff3b30, 3.4, 0.2, 0.6, -3.5, 4, 1.6, 4.2);
      }
      // Allen Exposed aura: cracked shimmering cyan sparks
      if (A.exposed > 0 && Math.random() < dt * 22) {
        this.parts.motes(A.x, A.y + 1.5 + Math.random() * 2.4, A.z, 1, 0x62f4ff, 2.8, 0.17, 0.55, -2.2, -4, 1.55, 3.8);
      }
      // Sauce Shield & bubbling sauce jars
      if (A.shielded && Math.random() < dt * 22) {
        this.parts.motes(A.x, A.y + 1.8, A.z, 1, 0xffaa38, 3.0, 0.17, 0.65, -3.0, 5, 3.2, 3.6);
      }
      for (const p of sim.pots) {
        if (Math.random() < dt * 12) {
          this.parts.motes(p.x, 1.9, p.z, 1, 0xff6a24, 1.8, 0.14, 0.6, -2.8, 2, 0.42, 3.8);
        }
      }
    }
    // Grillbot glowing charcoal embers
    for (const b of sim.bots) {
      if (b.kind !== 'earwhen' && Math.random() < dt * 10) {
        this.parts.motes(b.x, 1.0, b.z, 1, 0xff7a1a, 1.6, 0.11, 0.45, -2.5, 0, 0.35, 3.6);
      }
    }
  }

  /**
   * The opening story, played out on the real farm. Charig tells the backstory (beats 0-4), then the
   * farm's story follows (beats 5-9). Each beat lasts 4.8 s: the camera follows a
   * keyframed path while the cast acts out the caption, with effects and sounds fired at set moments.
   */
  private updateOpeningCutscene(dt: number) {
    const opening = this.sim.opening;
    if (!opening) return;
    const step = Math.min(opening.step, OPENING_BEATS - 1);
    const ct = clamp(4.8 - opening.t, 0, 4.8); // seconds into this beat
    const T = this.time;
    const cam = this.camera;
    const kModel = this.kModel;
    const A = this.aModel;
    const pigs = this.openingPigs;
    if (step !== this.cut.step) {
      // a new beat: reset everyone to a neutral pose
      this.cut = { step, fired: new Set(), eaten: 0 };
      this.restoreCinematicActors();
      kModel.root.visible = true;
      kModel.skin.color.setHex(0xf7a8b8);
    }
    /** Runs `fn` once, the first frame this beat passes `at` seconds. */
    const once = (key: string, at: number, fn: () => void) => {
      if (ct >= at && !this.cut.fired.has(key)) {
        this.cut.fired.add(key);
        fn();
      }
    };
    const ease = (x: number) => x * x * (3 - 2 * x);
    const span = (a: number, b: number) => ease(clamp((ct - a) / (b - a), 0, 1));
    /** Camera position and look-at point, blended along a list of [time, pos, look] keys. */
    const shot = (keys: [number, [number, number, number], [number, number, number]][]) => {
      let i = 0;
      while (i < keys.length - 2 && ct > keys[i + 1][0]) i++;
      const [t0, p0, l0] = keys[i];
      const [t1, p1, l1] = keys[Math.min(i + 1, keys.length - 1)];
      const f = t1 > t0 ? ease(clamp((ct - t0) / (t1 - t0), 0, 1)) : 1;
      const mix = (a: number[], b: number[]) => a.map((v, j) => v + (b[j] - v) * f);
      return { pos: mix(p0, p1), look: mix(l0, l1) };
    };
    /** A pig trotting along with legs swinging. */
    const trot = (m: KenjiModel, x: number, z: number, heading: number, speed: number, ph: number) => {
      m.root.visible = true;
      m.root.position.set(x, 0, z);
      m.root.rotation.y = heading;
      const sw = Math.sin(T * (6 + speed * 1.4) + ph) * Math.min(0.9, speed * 0.09);
      m.legs[0].rotation.x = sw;
      m.legs[1].rotation.x = -sw;
      m.legs[2].rotation.x = -sw;
      m.legs[3].rotation.x = sw;
      m.pivot.position.y = 0.75 + Math.abs(Math.sin(T * (6 + speed * 1.4) + ph)) * (speed > 1 ? 0.12 : 0.03);
      m.tail.rotation.z = Math.sin(T * 10 + ph) * 0.5;
    };
    /** Allen stomping along: legs, arms and a heavy bob. */
    const stomp = (x: number, z: number, heading: number, walk: number, armsUp = 0) => {
      A.root.visible = true;
      A.root.position.set(x, 0, z);
      A.root.rotation.y = heading;
      const s = Math.sin(walk);
      A.legL.rotation.x = s * 0.55;
      A.legR.rotation.x = -s * 0.55;
      A.pivot.position.y = Math.abs(s) * 0.14;
      A.armR.rotation.x = lerp(-0.95 + s * 0.3, -2.9, armsUp);
      A.armL.rotation.x = lerp(-0.35 - s * 0.3, -2.9, armsUp);
    };
    let view = shot([[0, [16, 11, -8], [0, 2, 6]]]);

    /** A kid (Charig, Kioff, Rickley, Kingger) walking or running, arms swinging. */
    const walkKid = (n: NpcModel, x: number, z: number, heading: number, speed: number, ph: number) => {
      n.root.visible = true;
      n.root.position.set(x, 0, z);
      n.root.rotation.y = heading;
      const sw = Math.sin(T * (5 + speed) + ph) * Math.min(0.9, speed * 0.12);
      n.armL.rotation.x = sw;
      n.armR.rotation.x = -sw;
      n.body.position.y = Math.abs(Math.sin(T * (5 + speed) + ph)) * Math.min(0.15, speed * 0.02);
    };
    const G = this.cutGuppy;
    const walkGuppy = (x: number, z: number, heading: number, speed: number, ph: number) => {
      G.root.visible = true;
      G.root.position.set(x, 0, z);
      G.root.rotation.y = heading;
      const sw = Math.sin(T * (5 + speed) + ph) * Math.min(0.8, speed * 0.1);
      G.arms[0].rotation.x = sw;
      G.arms[1].rotation.x = -sw;
      G.boots[0].rotation.x = -sw;
      G.boots[1].rotation.x = sw;
      G.tail.rotation.y = Math.sin(T * 8 + ph) * 0.4;
    };
    const flopTrout = (x: number, z: number, heading: number, hop: number) => {
      const F = this.trout;
      F.root.position.set(x, hop, z);
      F.root.rotation.y = heading;
      F.tail.rotation.y = Math.sin(T * 14) * 0.6;
    };
    const props = this.cutProps;
    const R = this.rick;
    const K = this.king;
    const C = this.charig;
    const X = this.kioff;
    // the battlefield: the open grass inside the gate
    /** Big Allen's size when he starts ballooning in the greed scene. */
    const YOUNG = 0.55;
    /** Allen before the greed got him: a normal kid. */
    const Y = this.youngAllen;
    if (step >= 1 && step <= 3) A.root.visible = false;
    const bx = 0;
    const bz = 45;

    if (step === 0) {
      // BEFORE ANY OF THIS: Charig on the porch, phone glowing, remembering
      const cx = SPOT.charig.x;
      const cz = SPOT.charig.z;
      C.root.visible = true;
      C.root.position.set(cx, 0, cz);
      C.root.rotation.y = lerp(0.6, 0, span(0.4, 1.8));
      C.head.rotation.x = lerp(0.35, -0.08, span(1.8, 2.6)) + Math.sin(T * 1.2) * 0.03;
      C.armR.rotation.x = lerp(-1.1, -0.2, span(2.0, 2.8));
      C.armL.rotation.x = span(3.0, 3.6) * -0.9 * (1 - span(4.1, 4.8));
      C.body.position.y = Math.sin(T * 1.5) * 0.02;
      once('sigh', 2.4, () => this.parts.motes(cx, 2.6, cz + 0.6, 6, 0xffffff, 0.8, 0.2, 1.4, 0, 0.6, 0.3, 1.4));
      view = shot([
        [0, [cx + 9, 6, cz + 14], [cx, 1.6, cz]],
        [2.4, [cx + 4, 3.0, cz + 8], [cx, 2.0, cz]],
        [4.8, [cx + 1.6, 2.5, cz + 4.4], [cx, 2.2, cz]],
      ]);
    } else if (step === 1) {
      // THE AL VS GEN ED WAR: two lines stare each other down, then charge
      const charge = span(1.6, 2.9);
      const clash = ct >= 2.9;
      const meet = (z0: number, z1: number) => lerp(z0, z1, charge) + (clash ? Math.sin(T * 16) * 0.25 : 0);
      const run = charge > 0 && charge < 1 ? 9 : clash ? 4 : 0.3;
      // AL kids, south line, facing north (+z)
      trot(kModel, bx - 5, meet(bz - 7, bz - 1.4), 0, run, 0);
      walkKid(Y, bx - 1.6, meet(bz - 7, bz - 1.2), 0, run, 6);
      if (clash) {
        Y.armR.rotation.x = -2.6 + Math.sin(T * 12) * 0.5;
        Y.armL.rotation.x = -2.6 - Math.sin(T * 12) * 0.5;
      }
      walkKid(C, bx + 1.6, meet(bz - 7, bz - 1.2), 0, run, 1);
      walkGuppy(bx + 4.2, meet(bz - 7, bz - 1.2), 0, run, 2);
      walkKid(R, bx + 6.6, meet(bz - 7, bz - 1.2), 0, run, 3);
      // Gen Eds, north line, facing south
      walkKid(X, bx - 3.2, meet(bz + 7, bz + 1.4), PI, run, 4);
      walkKid(K, bx + 0.6, meet(bz + 7, bz + 1.4), PI, run, 5);
      if (K.spin) K.spin.rotation.y += dt * 30;
      flopTrout(bx + 4.6, meet(bz + 7, bz + 1.6), -PI / 2, Math.abs(Math.sin(T * 7)) * (run > 1 ? 1.1 : 0.25));
      if (!clash) {
        // fists up in the standoff
        for (const n of [C, R, X, K, Y]) if (charge === 0) n.armR.rotation.x = -1.4 + Math.sin(T * 6) * 0.15;
      } else if (Math.floor(T * 7) !== Math.floor((T - dt) * 7)) {
        const x = bx + (Math.random() - 0.5) * 12;
        this.parts.sparks(x, 1.5 + Math.random(), bz, 8, 0xffd23f, 6, 0.14, 0.4, { up: 1, grav: 8, hdr: 3, altColor: 0xffffff });
        this.parts.dust(x, 0.2, bz, 4, 0xe2d3b8, { spread: 1, speed: 3, rise: 1, size0: 0.6, size1: 1.8, life: 0.5 });
        this.sfx.play(Math.random() < 0.5 ? 'hit' : 'slam');
        this.shake = Math.max(this.shake, 0.25);
      }
      if (charge > 0 && charge < 1 && Math.floor(T * 5) !== Math.floor((T - dt) * 5)) this.parts.dust(bx, 0.2, lerp(bz - 7, bz - 1, charge), 6, 0xe2d3b8, { spread: 7, speed: 2, rise: 1, size0: 0.5, size1: 1.6, life: 0.5 });
      once('warcry', 1.6, () => {
        this.sfx.play('roar');
        this.sfx.play('squeal');
      });
      once('clash', 2.9, () => {
        this.sfx.play('thunder');
        this.parts.shockWall(bx, 0.1, bz, 0xffc93c, 0.8, 9, 0.7, 2.6, 0.5, 6);
        this.parts.flash(bx, 2, bz, 0xfff1b8, 18, 0.25, 18);
        this.shake = Math.max(this.shake, 0.8);
      });
      view = shot([
        [0, [bx + 24, 6, bz], [bx, 2, bz]],
        [1.6, [bx + 19, 4.6, bz - 1], [bx, 2.2, bz]],
        [2.9, [bx + 9, 7, bz - 8], [bx, 1.8, bz]],
        [4.8, [bx + 6, 9, bz - 12], [bx, 1.6, bz + 1]],
      ]);
    } else if (step === 2) {
      // VICTORY… AND THEN A FARM: the Gen Eds flee, the AL kids cheer, forget why, and grab hoes
      const flee = span(0, 2.2);
      walkKid(X, bx - 3.2, bz + 1.4 + flee * 26, 0, flee < 1 ? 9 : 0, 4);
      walkKid(K, bx + 0.6, bz + 1.4 + flee * 28, 0, flee < 1 ? 10 : 0, 5);
      flopTrout(bx + 4.6, bz + 1.6 + flee * 24, 0, Math.abs(Math.sin(T * 9)) * 1.2);
      if (flee >= 1) X.root.visible = K.root.visible = this.trout.root.visible = false;
      const cheer = 1 - span(1.8, 2.3);
      const confused = span(2.0, 2.6) * (1 - span(3.6, 4.0));
      const leave = span(3.6, 4.8);
      const hop = (ph: number) => Math.max(0, Math.sin(T * 9 + ph)) * 0.6 * cheer;
      const crew: [NpcModel, number, number][] = [[C, bx + 1.6, 1], [R, bx + 6.6, 3], [Y, bx - 1.6, 6]];
      for (const [n, x, ph] of crew) {
        walkKid(n, x - leave * 3, bz - 1.2 - leave * 7, lerp(0, PI + 0.3, leave), leave > 0 ? 6 : 0, ph);
        n.root.position.y = hop(ph);
        n.armR.rotation.x = lerp(n.armR.rotation.x, -2.9, cheer);
        n.armL.rotation.x = lerp(n.armL.rotation.x, -2.9, cheer);
        n.head.rotation.z = confused * 0.35 * (ph === 1 ? 1 : -1);
      }
      trot(kModel, bx - 5 - leave * 2, bz - 1.4 - leave * 7, lerp(0, PI, leave), leave > 0 ? 7 : 0, 0);
      kModel.root.position.y = hop(0);
      kModel.head.rotation.z = confused * 0.3;
      walkGuppy(bx + 4.2 - leave * 2, bz - 1.2 - leave * 7, lerp(0, PI, leave), leave > 0 ? 6 : 0, 2);
      G.root.position.y = hop(2);
      G.root.rotation.z = confused * 0.25;
      once('win', 0.3, () => {
        this.sfx.play('bell');
        this.parts.sparks(bx, 3, bz - 2, 40, 0xffd23f, 10, 0.18, 0.9, { up: 1, grav: 10, hdr: 4, altColor: 0x7df9ff });
      });
      once('huh', 2.2, () => {
        this.sfx.play('oink');
        this.floatText(bx, 5.5, bz - 2, '???', 'crit');
      });
      view = shot([
        [0, [bx + 4, 3.4, bz - 11], [bx, 2.2, bz + 2]],
        [2.4, [bx + 2, 4, bz - 9], [bx, 2.4, bz - 1]],
        [4.8, [bx + 9, 9, bz - 10], [bx, 1, bz - 12]],
      ]);
    } else if (step === 3) {
      // BACK IN THE LAB: Roblox, funny videos, and chemistry that went exactly as planned (no)
      props.group.visible = true;
      const part = ct < 1.6 ? 0 : ct < 3.2 ? 1 : 2;
      props.screen.visible = part === 0;
      props.tripod.visible = part === 1;
      props.lab.visible = part === 2;
      if (part === 0) {
        const sx = props.screen.position.x;
        const sz = props.screen.position.z;
        // sat side by side, mashing keys
        walkKid(C, sx - 1.1, sz + 2.2, PI, 0, 0);
        C.armR.rotation.x = C.armL.rotation.x = -1.2 + Math.sin(T * 30) * 0.08;
        C.body.position.y = Math.abs(Math.sin(T * 5)) * 0.05;
        walkKid(Y, sx + 1.1, sz + 2.2, PI, 0, 2);
        Y.armR.rotation.x = -1.3 + Math.sin(T * 28 + 1) * 0.1;
        Y.armL.rotation.x = -1.3 + Math.sin(T * 26) * 0.1;
        Y.body.position.y = Math.abs(Math.sin(T * 7)) * 0.08; // laughing
        once('clicky', 0.2, () => this.sfx.play('truffle'));
        view = shot([
          [0, [sx - 0.8, 3.2, sz + 9], [sx, 2.2, sz]],
          [1.6, [sx - 0.2, 2.8, sz + 7.5], [sx + 0.4, 2.4, sz]],
        ]);
      } else if (part === 1) {
        const tx = props.tripod.position.x;
        const tz = props.tripod.position.z;
        // Charig films; Allen does the worst dance ever recorded
        walkKid(C, tx - 1.0, tz - 0.9, 0.4, 0, 0);
        C.armR.rotation.x = -1.5;
        C.body.position.y = Math.abs(Math.sin(T * 8)) * 0.1; // cracking up
        walkKid(Y, tx + 0.4, tz + 4.2, PI, 8, 0);
        Y.root.rotation.y = PI + Math.sin(T * 6) * 0.6;
        Y.root.position.y = Math.max(0, Math.sin(T * 10)) * 0.4;
        Y.armR.rotation.x = -2.6 + Math.sin(T * 10) * 0.6;
        Y.armL.rotation.x = -2.6 - Math.sin(T * 10) * 0.6;
        once('rec', 1.7, () => this.sfx.play('pop'));
        once('lol', 2.4, () => this.sfx.play('oink'));
        view = shot([
          [1.6, [tx - 6.5, 3.8, tz - 5], [tx + 0.2, 2.4, tz + 3]],
          [3.2, [tx - 5, 3.4, tz - 4], [tx + 0.2, 2.6, tz + 3.5]],
        ]);
      } else {
        const lx = props.lab.position.x;
        const lz = props.lab.position.z;
        const boom = ct >= 4.1;
        props.flask.scale.setScalar(boom ? 1 : 1 + Math.max(0, ct - 3.4) * 0.5 + Math.sin(T * 30) * 0.03);
        props.brew.color.setHSL((T * 0.8) % 1, 0.9, 0.6);
        props.brew.emissive.copy(props.brew.color).multiplyScalar(0.5);
        walkKid(C, lx - 1.4, lz + 1.6, PI - 0.3, 0, 0);
        walkKid(Y, lx + 1.5, lz + 1.6, PI + 0.3, 0, 0);
        Y.armR.rotation.x = -1.6; // pouring
        const flinch = boom ? span(4.1, 4.4) : 0;
        C.root.position.z += flinch * 0.8;
        C.armL.rotation.x = C.armR.rotation.x = -2.6 * flinch;
        Y.armL.rotation.x = -2.6 * flinch;
        Y.root.position.z += flinch * 0.8;
        if (!boom && Math.random() < dt * 14) this.parts.motes(lx + 0.4, 2.0, lz, 1, 0xd8f0c8, 0.6, 0.15, 0.7, -1, 0.6, 0.2, 1.6);
        once('boom', 4.1, () => {
          this.sfx.play('pop');
          this.sfx.play('slam');
          this.parts.hitBurst(lx + 0.4, 1.6, lz, 0x9dff6a, 1.6);
          this.parts.motes(lx + 0.4, 1.8, lz, 26, 0xb9ffd0, 3, 0.4, 1.4, -2, 2.4, 0.8, 2.4);
          this.shake = Math.max(this.shake, 0.4);
        });
        view = shot([
          [3.2, [lx - 1, 3.6, lz + 8.5], [lx + 0.5, 1.9, lz]],
          [4.8, [lx - 0.4, 3.2, lz + 7], [lx + 0.5, 2.1, lz]],
        ]);
      }
    } else if (step === 4) {
      // GREED AND HUNGER: Allen eats the whole harvest, and the others show him the gate
      const eat = 1 - span(2.4, 2.8);
      const kick = span(2.6, 4.6);
      const az = lerp(42, 62, kick);
      // first he's just a kid stuffing his face; then, with one gulp too many, he balloons
      const grown = ct >= 1.3;
      if (!grown) {
        A.root.visible = false;
        walkKid(Y, 0, az, PI + Math.sin(T * 2) * 0.5, 0, 0);
        Y.armR.rotation.x = -2.2 - Math.abs(Math.sin(T * 9)) * 0.6;
        Y.armL.rotation.x = -2.0 - Math.abs(Math.sin(T * 9 + 1)) * 0.6;
        if (Math.floor(T * 5) !== Math.floor((T - dt) * 5)) {
          this.sfx.play('chomp');
          this.parts.emit(0, 2.5, az - 0.6, 6, [0xffd23f, 0xff8a3d, 0x7bd35a][Math.floor(T * 5) % 3], 3, 0.16, 0.45);
        }
      }
      once('balloon', 1.3, () => {
        this.sfx.play('pop');
        this.sfx.play('roar');
        this.parts.dust(0, 1.5, az, 14, 0xe2d3b8, { spread: 1.4, speed: 4, rise: 2, size0: 0.8, size1: 2.4, life: 0.7 });
        this.shake = Math.max(this.shake, 0.35);
      });
      const belly = 1 + span(1.3, 2.4) * 0.35;
      A.pivot.scale.set(belly, 1 / Math.sqrt(belly), belly);
      if (grown) Y.root.visible = false;
      if (grown) stomp(0, az, kick > 0 ? PI : PI + Math.sin(T * 2) * 0.5, kick > 0 ? T * 6 : 0, 0);
      A.root.scale.setScalar(lerp(YOUNG, 1, span(1.3, 2.4))); // growing with every bite
      if (!grown) {
        /* the kid's still eating (above) */
      } else if (eat > 0) {
        A.armR.rotation.x = -1.6 - Math.abs(Math.sin(T * 7)) * 1.2;
        A.jaw.scale.y = 1 + Math.abs(Math.sin(T * 12)) * 1.5;
        if (Math.floor(T * 4) !== Math.floor((T - dt) * 4)) {
          this.sfx.play('chomp');
          this.parts.emit(0, 4.3, az - 1, 8, [0xffd23f, 0xff8a3d, 0x7bd35a][Math.floor(T * 4) % 3], 4, 0.2, 0.5);
        }
      } else {
        // backing out the gate, arms up, very sorry (not sorry)
        A.armR.rotation.x = A.armL.rotation.x = -2.6;
        A.jaw.scale.y = 1;
      }
      const march = span(1.8, 4.2);
      const fz = lerp(30, 48, march);
      walkKid(C, -2.4, fz, 0, march > 0 && march < 1 ? 6 : 0, 1);
      walkKid(R, 2.6, fz - 0.6, 0, march > 0 && march < 1 ? 6 : 0, 3);
      trot(kModel, -0.2, fz + 0.6, 0, march > 0 && march < 1 ? 8 : 0, 0);
      walkGuppy(5.2, fz - 1.4, -0.2, march > 0 && march < 1 ? 6 : 0, 2);
      // the pointing at the gate
      const point = span(4.0, 4.4);
      C.armR.rotation.x = lerp(C.armR.rotation.x, -1.6, point);
      R.armR.rotation.x = lerp(R.armR.rotation.x, -1.6, point);
      once('caught', 1.8, () => this.sfx.play('deny'));
      once('out', 4.3, () => {
        this.sfx.play('slam');
        this.parts.dustRing(0, 0.2, 56, 12, 1.2, 0xd9c29e, 7, 2, 0.7);
        this.shake = Math.max(this.shake, 0.3);
      });
      view = shot([
        [0, [9, 6, 34], [0, 3, 42]],
        [2.4, [7, 5, 30], [0, 2.6, 44]],
        [4.8, [4, 4, 34], [0, 2.4, 54]],
      ]);
    } else if (step === 5) {
      // THE EMPTY PEN: the herd grazes by the gate until Allen bursts through
      const home: [number, number][] = [[-5, 42], [-1.5, 45], [2.5, 41], [5.5, 44], [0.5, 38.5]];
      const allenIn = span(1.6, 3.4);
      const az = lerp(66, 49, allenIn);
      const roar = span(3.4, 3.8) * (1 - span(4.4, 4.8));
      stomp(0, az, PI, allenIn < 1 ? T * 7 : 0, roar);
      A.jaw.scale.y = 1 + roar * 1.6;
      const flee = span(3.5, 4.8);
      pigs.forEach((pig, i) => {
        const [hx, hz] = home[i];
        // scatter away from Allen, each a slightly different way
        const ang = Math.atan2(hx * 0.6 + (i - 2) * 0.4, -1);
        const run = flee * 9;
        const x = hx + Math.sin(ang) * run;
        const z = hz + Math.cos(ang) * run;
        trot(pig, x, z, flee > 0 ? ang : PI + Math.sin(T * 0.7 + i) * 0.6, flee > 0 ? 11 : 0.4, i * 1.7);
        // grazing: snout down to the grass, until the stomping starts
        pig.head.rotation.x = flee > 0 ? -0.15 : 0.35 + Math.sin(T * 2.2 + i) * 0.15;
      });
      if (allenIn > 0 && allenIn < 1 && Math.floor(T * 2.8) !== Math.floor((T - dt) * 2.8)) {
        this.parts.dust(0 + (Math.floor(T * 2.8) % 2 ? 1 : -1), 0.2, az - 0.5, 5, 0xe2d3b8, { spread: 0.6, speed: 2.5, rise: 1.2, size0: 0.6, size1: 2.0, life: 0.6 });
        this.shake = Math.max(this.shake, 0.12);
        this.sfx.play('slam');
      }
      once('crash', 1.6, () => {
        this.parts.dustRing(0, 0.2, 56, 14, 1.5, 0xd9c29e, 9, 2.4, 0.8);
        this.parts.chunks(0, 2, 56, 14, 0x8a6d4b, 10, 0.3, 0.8);
      });
      once('roar', 3.4, () => {
        this.sfx.play('roar');
        this.shake = Math.max(this.shake, 0.6);
        this.parts.shockWall(0, 0.1, az, 0xffb347, 0.8, 7, 0.8, 2.6, 0.5, 5);
      });
      once('oink', 3.6, () => this.sfx.play('oink'));
      view = shot([
        [0, [22, 13, 28], [0, 1, 43]],
        [2.0, [14, 6, 32], [0, 1.6, 46]],
        [4.8, [6, 2.6, 38], [0, 4, 50]],
      ]);
    } else if (step === 6) {
      // NO PIG LEFT BEHIND: Allen plucks the pigs up one by one and swallows them whole
      const cx = 0;
      const cz = 42;
      const eatEvery = 0.85;
      const belly = 1 + this.cut.eaten * 0.06;
      A.root.visible = true;
      A.root.position.set(cx, 0, cz);
      A.root.rotation.y = PI + Math.sin(T * 1.6) * 0.7;
      A.pivot.scale.set(belly, 1 / Math.sqrt(belly), belly);
      A.pivot.position.y = Math.abs(Math.sin(T * 4)) * 0.05;
      const grab = (ct % eatEvery) / eatEvery;
      A.armR.rotation.x = -1.2 - Math.sin(grab * PI) * 1.6;
      A.armL.rotation.x = -0.6 - Math.sin(grab * PI + 1) * 0.6;
      A.jaw.scale.y = 1 + Math.abs(Math.sin(T * 12)) * 1.4;
      pigs.forEach((pig, i) => {
        const at = 0.3 + i * eatEvery;
        const t = (ct - at) / 0.5;
        if (t >= 1) {
          pig.root.visible = false;
          return;
        }
        // running laps round him until it's this one's turn
        const lap = T * 0.9 + (i * TAU) / pigs.length;
        const rx = cx + Math.sin(lap) * 7;
        const rz = cz + Math.cos(lap) * 7;
        if (t < 0) {
          trot(pig, rx, rz, lap + PI / 2, 10, i);
          pig.root.scale.setScalar(1);
        } else {
          // up in an arc into his mouth, shrinking as it goes
          const mx = cx + Math.sin(A.root.rotation.y) * 1.2;
          const mz = cz + Math.cos(A.root.rotation.y) * 1.2;
          pig.root.visible = true;
          pig.root.position.set(lerp(rx, mx, t), Math.sin(t * PI) * 3 + t * 4.3, lerp(rz, mz, t));
          pig.root.rotation.set(t * 5, lap, t * 3);
          pig.root.scale.setScalar(1 - t * 0.7);
          for (const leg of pig.legs) leg.rotation.x = Math.sin(T * 30 + i) * 0.9;
        }
        once(`grab${i}`, at, () => this.sfx.play('oink'));
        once(`gulp${i}`, at + 0.5, () => {
          this.cut.eaten++;
          this.sfx.play('chomp');
          this.parts.emit(cx, 4.4, cz - 1, 10, 0xf7a8b8, 5, 0.22, 0.6);
          this.shake = Math.max(this.shake, 0.2);
        });
      });
      once('burp', 4.5, () => {
        this.sfx.play('pop');
        this.parts.motes(cx, 4.6, cz - 1.2, 14, 0xd8f0c8, 2.5, 0.3, 1.2, -2, 3, 0.6, 2.6);
      });
      const orbit = 0.4 + ct * 0.28;
      view = {
        pos: [cx + Math.sin(orbit) * -13, 6 + Math.sin(ct * 0.6) * 1.2, cz + Math.cos(orbit) * -13],
        look: [cx, 3.6, cz],
      };
    } else if (step === 7) {
      // BROKE, BUT NOT BEATEN: Rickley counts his last coins; Kenji trots up
      const R = this.rick;
      const rx = SPOT.rickley.x;
      const rz = SPOT.rickley.z;
      const meet = span(2.9, 3.6);
      R.root.rotation.y = lerp(0.9, -0.25, meet);
      R.head.rotation.x = lerp(0.45, -0.1, meet) + Math.sin(T * 1.4) * 0.04;
      R.body.position.y = -meet * 0.35 + Math.sin(T * 1.3) * 0.02;
      R.armL.rotation.x = lerp(-0.9, -0.2, meet);
      R.armR.rotation.x = meet > 0 ? -1.3 + Math.sin(T * 7) * 0.25 : -0.9 + Math.sin(T * 5) * 0.05;
      for (let i = 0; i < 4; i++) {
        once(`coin${i}`, 0.3 + i * 0.55, () => {
          this.sfx.play('truffle');
          this.parts.sparks(rx + 0.6, 1.6, rz + 0.9, 4, 0xffd23f, 2, 0.1, 0.5, { up: 1, grav: 6, hdr: 3 });
        });
      }
      const walk = span(0.6, 2.8);
      const kx = lerp(rx - 9, rx - 1.6, walk);
      const kz = lerp(rz + 7, rz + 2.6, walk);
      trot(kModel, kx, kz, walk < 1 ? Math.atan2(rx - 1.6 - (rx - 9), rz + 2.6 - (rz + 7)) : lerp(0.6, 2.4, meet), walk > 0 && walk < 1 ? 8 : 0, 0);
      kModel.head.rotation.x = -0.25 * meet;
      kModel.tail.rotation.z = Math.sin(T * (meet > 0 ? 18 : 9)) * 0.6;
      once('hello', 3.1, () => this.sfx.play('oink'));
      view = shot([
        [0, [rx - 11, 7, rz - 13], [rx, 2.2, rz]],
        [2.6, [rx - 8, 4.2, rz - 9], [rx - 0.6, 1.8, rz + 1]],
        [4.8, [rx - 5.4, 2.6, rz - 5.6], [rx - 0.8, 1.4, rz + 1.6]],
      ]);
    } else if (step === 8) {
      // A VERY QUESTIONABLE RECRUIT: Kingger's coil crackles, then gives Kenji a jolt
      const K = this.king;
      const kx = SPOT.kingger.x;
      const kz = SPOT.kingger.z;
      K.root.rotation.y = -0.55 + Math.sin(T * 3) * 0.25;
      K.body.position.y = Math.abs(Math.sin(T * 6)) * 0.18;
      K.armR.rotation.x = -2.7 + Math.sin(T * 8) * 0.4;
      K.armL.rotation.x = -2.7 - Math.sin(T * 8) * 0.4;
      if (K.spin) K.spin.rotation.y += dt * 40;
      this.sim.kingCast = 0;
      // Kenji stands off to Kingger's side, so the camera sees both of them
      const px = kx + 2.4;
      const pz = kz - 3.4;
      const zapped = ct >= 2.2;
      const hop = zapped ? Math.max(0, Math.sin(clamp((ct - 2.2) / 0.7, 0, 1) * PI)) * 1.8 : 0;
      trot(kModel, px, pz, -2.3 + (zapped ? Math.sin(T * 25) * 0.3 * (1 - span(2.2, 3.4)) : 0), 0, 0);
      kModel.root.position.y = hop;
      kModel.pivot.rotation.z = zapped ? Math.sin(T * 40) * 0.2 * (1 - span(2.4, 3.6)) : 0;
      const glowing = zapped ? 1 - span(2.3, 4.2) : 0;
      kModel.skin.color.setHex(0xf7a8b8).lerp(this.tmpC.setHex(0x9ff6ff), glowing);
      // ambient arcs off the coil, faster as it charges
      const rate = zapped ? 6 : 3 + ct * 3;
      if (Math.floor(T * rate) !== Math.floor((T - dt) * rate)) {
        const a = Math.random() * TAU;
        this.parts.lightning(COIL.x, COIL.y + 0.5, COIL.z, COIL.x + Math.cos(a) * 3, COIL.y + 2 + Math.random() * 3, COIL.z + Math.sin(a) * 3, 0x7df9ff, 0.05, 0.18);
        if (Math.random() < 0.5) this.sfx.play('zap');
      }
      once('bolt', 2.2, () => {
        this.sfx.play('thunder');
        this.parts.lightning(COIL.x, COIL.y + 0.5, COIL.z, px, 1.1, pz, 0x62f4ff, 0.12, 0.45);
        this.parts.lightning(px + 0.5, 14, pz, px, 1, pz, 0xc8feff, 0.1, 0.4);
        this.parts.hitBurst(px, 1.1, pz, 0x5ff2ff, 1.8);
        this.parts.flash(px, 1.6, pz, 0x5ff2ff, 14, 0.3, 14);
        this.shake = Math.max(this.shake, 0.7);
      });
      once('squee', 2.35, () => this.sfx.play('squeal'));
      if (glowing > 0 && Math.random() < dt * 30) this.parts.sparks(px, 1 + hop, pz, 1, 0x62f4ff, 5, 0.12, 0.22, { grav: 2, hdr: 4.2, altColor: 0xffffff });
      view = shot([
        [0, [kx - 14, 9, kz - 15], [kx + 0.5, 3.4, kz]],
        [2.0, [kx - 7, 4.5, kz - 11], [kx + 1, 2, kz - 1.5]],
        [2.6, [kx - 5, 3.2, kz - 10], [px - 0.4, 1.4, pz]],
        [4.8, [kx - 6.5, 3.8, kz - 12], [kx + 1.2, 1.8, kz - 1.5]],
      ]);
    } else {
      // PROTECT THE LAST PIG: the three of them line up; Allen watches from the gate
      const R = this.rick;
      const K = this.king;
      const lx = 0;
      const lz = 14;
      R.root.position.set(lx - 3, 0, lz + 1.6);
      R.root.rotation.y = PI + 0.25;
      K.root.position.set(lx + 3, 0, lz + 1.6);
      K.root.rotation.y = PI - 0.25;
      const pose = span(1.2, 1.8);
      R.armR.rotation.x = lerp(-0.3, -2.8, pose) + Math.sin(T * 3) * 0.05;
      K.armR.rotation.x = lerp(-0.3, -2.9, pose) + Math.sin(T * 3 + 1) * 0.05;
      R.body.position.y = K.body.position.y = Math.abs(Math.sin(T * 2.4)) * 0.04;
      if (K.spin) K.spin.rotation.y += dt * 25;
      trot(kModel, lx, lz, PI, 0, 0);
      kModel.root.position.y = Math.max(0, Math.sin(T * 7)) * 0.25 * pose;
      kModel.tail.rotation.z = Math.sin(T * 14) * 0.6;
      // Allen, small and far away, tying on his bib
      stomp(0, 52, PI, 0, 0);
      A.armR.rotation.x = -2.2 + Math.sin(T * 4) * 0.4;
      A.armL.rotation.x = -2.0 - Math.sin(T * 4) * 0.4;
      once('pose', 1.3, () => {
        this.sfx.play('bell');
        this.parts.sparks(lx, 2, lz, 30, 0xffd23f, 9, 0.18, 0.8, { up: 1, grav: 10, hdr: 4, altColor: 0xff8fb0 });
        this.parts.shockWall(lx, 0.1, lz, 0xffc93c, 0.6, 6, 0.6, 2.2, 0.5, 4);
      });
      once('oink', 1.5, () => this.sfx.play('oink'));
      view = shot([
        [0, [lx + 0.4, 1.3, lz - 2.6], [lx, 1.1, lz]],
        [1.6, [lx + 2.5, 2.4, lz - 7], [lx, 1.8, lz + 1]],
        // end low and close enough that the three of them sit above the caption, Allen framed at the gate
        [4.8, [lx + 2.5, 3.0, lz - 11], [0, 1.2, lz + 20]],
      ]);
    }

    // follow the shot closely (a light smoothing hides frame hitches); shake comes on top
    cam.position.lerp(this.tmp.set(view.pos[0], view.pos[1], view.pos[2]), 1 - Math.exp(-10 * dt));
    if (this.shake > 0 && !this.reduceMotion) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 2.4);
    }
    cam.lookAt(view.look[0], view.look[1], view.look[2]);
  }

  /** Where Kingger ends up during the backup call: right in front of Charig. */
  private callNpcSpots() {
    const end = { x: SPOT.charig.x + 1.9, z: SPOT.charig.z + 1.3 };
    const start = { x: SPOT.charig.x + 10, z: SPOT.charig.z + 7 };
    return { start, end };
  }

  /** In the backup call, Kingger dashes up to Charig in a panic; afterwards he goes back to his lab. */
  private animateCallNpcs() {
    const A = this.sim.A;
    const K = this.king;
    const C = this.charig;
    const t = A.active && A.state === 'calling' ? A.t : -1;
    if (t < 10.2) {
      if (this.kingAway) {
        this.kingAway = false;
        K.root.position.set(SPOT.kingger.x, 0, SPOT.kingger.z);
        K.root.visible = this.sim.area === 'farm';
      }
      return;
    }
    this.kingAway = true;
    const { start, end } = this.callNpcSpots();
    const run = clamp((t - 10.2) / 1.1, 0, 1);
    const T = this.time;
    K.root.visible = true;
    K.root.position.set(lerp(start.x, end.x, run), run < 1 ? Math.abs(Math.sin(T * 14)) * 0.25 : 0, lerp(start.z, end.z, run));
    const toC = Math.atan2(C.root.position.x - K.root.position.x, C.root.position.z - K.root.position.z);
    K.root.rotation.y = toC;
    C.root.rotation.y = Math.atan2(K.root.position.x - C.root.position.x, K.root.position.z - C.root.position.z);
    // arms flailing as he runs, then waving wildly as he warns him
    K.armR.rotation.x = -2.6 + Math.sin(T * 16) * 0.5;
    K.armL.rotation.x = -2.6 - Math.sin(T * 16) * 0.5;
    if (K.spin) K.spin.rotation.y += 0.8;
    // Charig takes a step back
    C.armR.rotation.x = run >= 1 ? -1.2 : 0;
    C.head.rotation.x = run >= 1 ? -0.15 : 0;
  }

  /** The backup call: the camera frames Allen on the phone, then Earwhen leaping in, then Kingger finding Charig. */
  private updateCallCamera(dt: number) {
    const A = this.sim.A;
    const W = this.sim.bots.find((b): b is EarwhenBot => b.kind === 'earwhen');
    const t = A.t;
    if (t >= 10.2) {
      const { end } = this.callNpcSpots();
      const mx = (end.x + SPOT.charig.x) / 2;
      const mz = (end.z + SPOT.charig.z) / 2;
      this.camera.position.lerp(this.tmp.set(mx + 3.5, 3.4, mz + 8.5), 1 - Math.exp(-(t < 10.5 ? 30 : 3) * dt));
      this.camLook.lerp(this.tmp.set(mx, 2.4, mz), 1 - Math.exp(-(t < 10.5 ? 30 : 4) * dt));
      this.camera.lookAt(this.camLook);
      return;
    }
    const fx = Math.sin(A.heading);
    const fz = Math.cos(A.heading);
    const sx = fz;
    const sz = -fx;
    let pos: [number, number, number];
    let look: [number, number, number];
    if (t < 2.4) {
      pos = [A.x + fx * 10 + sx * 2, 4.5, A.z + fz * 10 + sz * 2];
      look = [A.x, 3.6, A.z];
    } else if (t < 4.6 || !W) {
      pos = [A.x + fx * 9 - sx * 3, 5, A.z + fz * 9 - sz * 3];
      look = [A.x - sx * 0.6, 4.2, A.z - sz * 0.6];
    } else {
      const mx = (A.x + W.x) / 2;
      const mz = (A.z + W.z) / 2;
      const wide = W.act === 'arrive' ? 1 : 0;
      pos = [mx + fx * (15 + wide * 3) + sx * 3, 6 + wide * 3, mz + fz * (15 + wide * 3) + sz * 3];
      look = [mx, 3.2 + W.hop * 0.5, mz];
    }
    this.camera.position.lerp(this.tmp.set(pos[0], pos[1], pos[2]), 1 - Math.exp(-3 * dt));
    if (this.shake > 0 && !this.reduceMotion) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 2.4);
    }
    this.camLook.lerp(this.tmp.set(look[0], look[1], look[2]), 1 - Math.exp(-4 * dt));
    this.camera.lookAt(this.camLook);
  }

  private updateCamera(dt: number) {
    if (this.sim.A.active && this.sim.A.state === 'calling') {
      this.updateCallCamera(dt);
      return;
    }
    const k = this.focus();
    const A = this.sim.A;
    const big = this.asAllen && A.active;
    // Allen is three times a pig's size: look from higher up and further back
    this.camTarget.lerp(this.tmp.set(k.x, (big ? 3.2 : 1.5) + k.y * 0.6, k.z), 1 - Math.exp(-12 * dt));
    let want = big ? 16 : 10.5;
    if (A.active && !big && this.screen === 'play') want += clamp((Math.hypot(A.x - k.x, A.z - k.z) - 6) * 0.14, 0, 4);
    this.camDist = lerp(this.camDist, want, 1 - Math.exp(-3 * dt));
    const cp = Math.cos(this.pitch);
    const cam = this.camera;
    const vx = Math.sin(this.yaw) * cp;
    const vy = Math.sin(this.pitch);
    const vz = Math.cos(this.yaw) * cp;
    // pull the camera in when a building or post sits between it and the pig
    let clip = 20;
    const colliders = this.sim.colliders();
    scan: for (let d = 1.5; d <= this.camDist; d += 0.7) {
      const px = this.camTarget.x + vx * d;
      const py = this.camTarget.y + vy * d;
      const pz = this.camTarget.z + vz * d;
      for (const c of colliders) {
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
    const A = this.sim.A;
    const el = this.arrow;
    const forest = this.sim.area === 'forest';
    el.classList.toggle('trail-arrow', forest);
    if ((!A.active || A.state === 'backrooms') && !forest) {
      el.style.display = 'none';
      return;
    }
    const hunt = this.sim.hunt;
    const v = this.tmp.set(forest ? (hunt?.tx ?? FOREST_EXIT.x) : A.x, forest ? 3 : A.y + 3, forest ? (hunt?.tz ?? FOREST_EXIT.z) : A.z).project(this.camera);
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

  /* ───────────────────────── keeping models in step with the simulation ───────────────────────── */

  /**
   * Makes `views` hold exactly one view per entity in `list` (matched by id): creates views for new
   * entities, updates the rest, and disposes views whose entity is gone.
   */
  private syncList<T extends { id: number }, V>(list: readonly T[], views: Map<number, V>, make: (e: T) => V, update: (v: V, e: T) => void, drop: (v: V) => void) {
    const seen = new Set<number>();
    for (const e of list) {
      seen.add(e.id);
      let v = views.get(e.id);
      if (!v) {
        v = make(e);
        views.set(e.id, v);
      }
      update(v, e);
    }
    for (const [id, v] of views) {
      if (!seen.has(id)) {
        drop(v);
        views.delete(id);
      }
    }
  }

  /** Brings every model, telegraph and prop in line with the current simulation state. */
  private syncAll(dt: number) {
    const sim = this.sim;
    const farm = sim.area === 'farm';
    const camQ = this.camera.quaternion;
    this.syncPlayers(dt);
    this.syncAllen(dt);
    this.syncBots(camQ);
    this.syncList(
      sim.projs,
      this.projViews,
      (p) => {
        const mesh =
          p.kind === 'chopstick'
            ? makeChopsticks()
            : p.kind === 'cream' || p.kind === 'blob'
              ? makeCreamShot(p.kind === 'blob')
              : p.kind === 'robot'
                ? makeFlameRobot()
                : makeChiliGlob();
        mesh.rotation.y = Math.atan2(p.vx, p.vz);
        this.scene.add(mesh);
        return { mesh, friendly: false };
      },
      (v, p) => {
        v.mesh.position.set(p.x, p.y, p.z);
        if (p.kind === 'chopstick') v.mesh.rotation.z += dt * 16;
        else if (p.kind === 'cream') v.mesh.rotation.y = Math.atan2(p.vx, p.vz);
        else if (p.kind === 'robot') {
          // tumbling through the air, flames roaring, trailing embers
          v.mesh.rotation.x += dt * 7;
          v.mesh.rotation.z += dt * 3;
          const f = v.mesh.getObjectByName('flame');
          if (f) f.scale.set(1 + Math.sin(this.time * 31) * 0.15, 1 + Math.sin(this.time * 23 + 1) * 0.25, 1 + Math.sin(this.time * 27 + 2) * 0.15);
          if (Math.random() < dt * 40) this.parts.motes(p.x, p.y + 0.4, p.z, 1, Math.random() < 0.5 ? 0xff6a1a : 0xffd23f, 1.5, 0.22, 0.5, -3, 0, 0.3, 3.8);
        }
        else v.mesh.rotation.x += dt * (p.kind === 'blob' ? 4 : 10);
        if (p.friendly && !v.friendly) {
          // a Riptide Parry turned it around: it glows and flies back at Allen
          v.friendly = true;
          v.mesh.rotation.y = Math.atan2(p.vx, p.vz);
          v.mesh.traverse((c) => {
            if (c instanceof THREE.Mesh) c.material = glow(0x7df9ff, 1.4);
          });
        }
      },
      (v) => this.discard(v.mesh),
    );
    this.syncList(
      sim.puddles,
      this.puddleViews,
      (pd) => {
        const mat = new THREE.MeshBasicMaterial({
          color: pd.cream ? new THREE.Color(0xfbf6ec) : new THREE.Color(0xff3414).multiplyScalar(1.8),
          transparent: true,
          opacity: pd.cream ? 0.85 : 0.58,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -7,
          polygonOffsetUnits: -14,
        });
        const mesh = new THREE.Mesh(DISC_GEO, mat);
        mesh.position.set(pd.x, 0.09, pd.z);
        mesh.scale.setScalar(pd.r);
        mesh.userData.noAO = true;
        this.scene.add(mesh);
        return { mesh, mat };
      },
      (v, pd) => {
        const fade = Math.min(1, pd.life / 1.1);
        const pulse = 1 + Math.sin(this.time * 9 + pd.x) * 0.04;
        v.mesh.scale.setScalar(pd.r * pulse);
        v.mat.opacity = (pd.cream ? 0.85 : 0.56) * fade;
      },
      (v) => {
        this.scene.remove(v.mesh);
        v.mat.dispose();
      },
    );
    this.syncList(
      sim.shocks,
      this.shockViews,
      (s) => {
        const mat = fxMat(s.hostile ? 0xff5a3c : 0x5ff2ff, 0.9);
        const mesh = new THREE.Mesh(RING_GEO, mat);
        mesh.position.set(s.x, 0.12, s.z);
        this.scene.add(mesh);
        return { mesh, mat };
      },
      (v, s) => {
        v.mesh.scale.set(s.r, 1, s.r);
        v.mat.opacity = 0.9 * Math.max(0, 1 - s.r / s.maxR);
      },
      (v) => {
        this.scene.remove(v.mesh);
        v.mat.dispose();
      },
    );
    this.syncList(
      sim.pickups,
      this.pickupViews,
      () => {
        const mesh = makeTruffle();
        this.scene.add(mesh);
        return mesh;
      },
      (mesh, p) => {
        mesh.visible = p.area === sim.area;
        mesh.position.set(p.x, p.y + Math.sin(this.time * 3 + p.x) * 0.12, p.z);
        mesh.rotation.y += dt * 2.5;
      },
      (mesh) => this.discard(mesh),
    );
    this.syncList(
      sim.kernels,
      this.kernelViews,
      (n) => part(this.scene, sph(0.2, 6, 5), glow(0xffd23f, 1.2), n.x, n.y, n.z, { shadow: false }),
      (mesh, n) => mesh.position.set(n.x, n.y, n.z),
      (mesh) => this.discard(mesh),
    );
    const A = sim.A;
    const hurry = A.shieldT < 5;
    const T = this.time;
    this.syncList(
      sim.pots,
      this.potViews,
      (p) => {
        const m = makeSaucePot();
        m.root.position.set(p.x, 0, p.z);
        this.scene.add(m.root);
        return m;
      },
      (m, p) => {
        m.body.rotation.z = Math.sin(T * 30) * p.wob * 0.22;
        m.body.position.y = Math.abs(Math.sin(T * 3 + p.ph)) * 0.08;
        m.body.scale.setScalar(1 + p.wob * 0.08);
        m.sauce.emissiveIntensity = 1.1 + Math.sin(T * (hurry ? 16 : 6) + p.ph) * 0.6;
        // sauce tether feeding the shield
        const tx = A.x - p.x;
        const ty = A.y + 2.9 - 1.7;
        const tz = A.z - p.z;
        m.beam.position.set(tx / 2, 1.7 + ty / 2, tz / 2);
        m.beam.scale.set(1, 1, Math.hypot(tx, ty, tz));
        m.beam.lookAt(A.x, A.y + 2.9, A.z);
        (m.beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.abs(Math.sin(T * 9 + p.ph)) * 0.4;
      },
      (m) => this.discard(m.root),
    );
    this.syncList(
      sim.hazards,
      this.hazardViews,
      (h) => {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(RING_GEO, HAZ_RING_MAT);
        const fill = new THREE.Mesh(DISC_GEO, HAZ_FILL_MAT);
        const ball = new THREE.Mesh(HAZ_BALL_GEO, glow(0xff7a2e, 0.9));
        ring.scale.setScalar(h.r);
        fill.scale.setScalar(0.01);
        ball.position.y = 18;
        g.add(ring, fill, ball);
        g.position.set(h.x, 0.11, h.z);
        this.scene.add(g);
        return { g, fill, ball };
      },
      (v, h) => {
        const p = Math.min(1, h.t / h.dur);
        v.fill.scale.setScalar(Math.max(0.01, h.r * p));
        v.ball.position.y = 18 * (1 - p * p) + 0.6;
        v.ball.rotation.x += dt * 9;
      },
      (v) => this.scene.remove(v.g),
    );
    this.syncList(
      sim.memorials,
      this.memorialViews,
      (mm) => {
        const mesh = makeHogMemorial();
        mesh.position.set(mm.x, 0, mm.z);
        this.scene.add(mesh);
        return mesh;
      },
      (mesh, mm) => {
        if (mm.life < 1.2) mesh.scale.setScalar(Math.max(0.01, mm.life / 1.2));
      },
      (mesh) => this.discard(mesh),
    );
    this.syncList(
      sim.wild,
      this.wildViews,
      (w) => {
        const m = makeKenji(w.name === 'Herb' ? 0xc89a74 : WILD_TINTS[w.look], w.name === 'Herb');
        m.root.scale.setScalar(0.95);
        if (w.name === 'Herb') {
          // a lantern hanging from his neck
          const lantern = new THREE.Group();
          lantern.position.set(0, 0.55, 0.85);
          lantern.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.26), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6 })));
          const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow(0xffb04a, 3));
          flame.position.y = 0.01;
          lantern.add(flame);
          m.root.add(lantern);
        }
        m.root.traverse((c) => {
          c.receiveShadow = false;
        });
        this.scene.add(m.root);
        return m;
      },
      (m, w) => {
        m.root.position.set(w.x, 0, w.z);
        m.root.rotation.y = w.heading;
        this.animPig(m, w.ph, w.moving);
        m.head.rotation.x = !w.moving ? 0.13 + Math.sin(this.time * 2 + w.ph) * 0.1 : 0;
      },
      (m) => {
        m.skin.dispose();
        this.discard(m.root);
      },
    );
    this.syncList(
      sim.allies,
      this.allyViews,
      (a) => {
        const m = makeKenji(a.tint, true);
        m.root.position.set(a.x, 0, a.z);
        const hpBar = makeHpBar(1.15, 1.95, 0x62e06a);
        m.root.add(hpBar.group);
        this.scene.add(m.root);
        return { m, hpBar };
      },
      (v, a) => this.animateAlly(v, a, camQ),
      (v) => {
        v.hpBar.mat.dispose();
        this.discard(v.m.root);
      },
    );

    this.syncList(
      sim.decoys,
      this.decoyViews,
      (d) => {
        // a glowing low-poly pig: Kioff's wireframe render of Kenji
        const m = makeKenji(0x5ff2ff, false);
        const mat = new THREE.MeshBasicMaterial({ color: 0x5ff2ff, wireframe: true, transparent: true, opacity: 0.9 });
        m.root.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.material = mat;
            c.castShadow = false;
          }
        });
        m.root.position.set(d.x, 0, d.z);
        this.scene.add(m.root);
        return m.root;
      },
      (g, d) => {
        g.position.set(d.x, Math.abs(Math.sin(this.time * 5)) * 0.25, d.z);
        g.rotation.y += dt * 3;
        // flickers as it runs out
        g.visible = d.life > 1.2 || Math.floor(this.time * 12) % 2 === 0;
      },
      (g) => this.discard(g),
    );

    /* static props that depend on simulation state */
    this.world.group.visible = farm;
    if (this.forest) this.forest.group.visible = !farm;
    this.rick.root.visible = farm;
    this.king.root.visible = farm;
    this.trout.root.visible = farm;
    this.charig.root.visible = farm;
    this.kioff.root.visible = farm;
    this.turret.root.visible = farm && sim.levels.cannon > 0;
    this.turret.head.rotation.y = sim.turretYaw;
    // crops and pies disappear bite by bite as Allen eats them
    sim.edibles.forEach((se, i) => {
      const e = this.world.edibles[i];
      const shown = Math.ceil((se.hp / se.maxHp) * e.pieces.length - 0.001);
      if (shown !== e.shown) {
        e.shown = shown;
        e.pieces.forEach((p, j) => (p.visible = j < shown));
      }
    });
  }

  /** One pig model per player; the local pig stays player 1's classic Kenji. */
  private syncPlayers(dt: number) {
    this.syncList(
      this.sim.players,
      this.players,
      (p) => {
        const m = makeKenji(p.tint);
        m.root.position.set(p.x, p.y, p.z);
        m.root.traverse((c) => {
          c.receiveShadow = c.castShadow;
        });
        this.scene.add(m.root);
        const tag = document.createElement('div');
        tag.className = 'nametag';
        tag.style.display = 'none';
        this.tags.appendChild(tag);
        return { m, walk: 0, tag };
      },
      (v, p) => this.animatePlayer(p, v, dt),
      (v) => {
        this.discard(v.m.root);
        v.tag.remove();
      },
    );
  }

  /** Floats each other pig's name over its head, in its colour. Your own pig has no tag. */
  private updateNametags() {
    const show = this.screen === 'play' && this.sim.players.length > 1;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (const p of this.sim.players) {
      const v = this.players.get(p.id);
      if (!v) continue;
      const tag = v.tag;
      if (!show || p.id === this.localId || !p.name || !v.m.root.visible) {
        tag.style.display = 'none';
        continue;
      }
      const s = this.tmp.set(v.m.root.position.x, v.m.root.position.y + 1.85, v.m.root.position.z).project(this.camera);
      if (s.z > 1 || Math.abs(s.x) > 1.1 || Math.abs(s.y) > 1.1) {
        tag.style.display = 'none';
        continue;
      }
      if (tag.textContent !== p.name) tag.textContent = p.name;
      const color = '#' + p.tint.toString(16).padStart(6, '0');
      if (tag.dataset.color !== color) {
        tag.dataset.color = color;
        tag.style.setProperty('--tag', color);
      }
      tag.classList.toggle('down', p.action === 'dead');
      // far pigs get smaller, faded tags so a crowd doesn't turn into a wall of names
      const dist = this.camera.position.distanceTo(v.m.root.position);
      const k = Math.max(0.6, Math.min(1, 18 / Math.max(1, dist)));
      tag.style.display = 'block';
      tag.style.opacity = (0.45 + 0.55 * k).toFixed(2);
      tag.style.transform = `translate(${((s.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-s.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(2)})`;
    }
  }

  private syncBots(camQ: THREE.Quaternion) {
    const sim = this.sim;
    const c = COURSES[Math.min(sim.course, COURSES.length - 1)];
    const T = this.time;
    const makeRing = (radius: number) => {
      const ring = new THREE.Group();
      const rim = new THREE.Mesh(RING_GEO, HAZ_RING_MAT);
      const ringFill = new THREE.Mesh(DISC_GEO, HAZ_FILL_MAT);
      rim.scale.setScalar(radius);
      ringFill.scale.setScalar(0.01);
      ring.add(rim, ringFill);
      ring.visible = false;
      this.scene.add(ring);
      return { ring, ringFill };
    };
    this.syncList(
      sim.bots,
      this.botViews,
      (b) => {
        if (b.kind === 'guppy') {
          const m = makePathGuppy();
          m.root.position.set(b.x, 0, b.z);
          m.root.rotation.y = b.heading;
          this.scene.add(m.root);
          return { m, ...makeRing(GUPPY_SWING.radius) };
        }
        if (b.kind === 'earwhen') {
          const m = makeEarwhen();
          m.root.position.set(b.x, b.hop, b.z);
          m.root.rotation.y = b.heading;
          this.scene.add(m.root);
          return { m, ring: null, ringFill: null };
        }
        const m = this.makeBotModel(b.kind);
        m.root.position.set(b.x, 0, b.z);
        this.scene.add(m.root);
        const r = b.kind === 'tenderizer' || b.kind === 'bomber' ? makeRing(b.kind === 'bomber' ? 4.6 : 3.5) : { ring: null, ringFill: null };
        return { m, ...r };
      },
      (v, b) => this.animateBot(v, b, c, T, camQ),
      (v) => {
        if (v.ring) this.scene.remove(v.ring);
        v.m.hp.mat.dispose();
        if ('boots' in v.m) v.m.flash.dispose();
        if ('cannon' in v.m) for (const mat of v.m.flashMats) mat.dispose();
        this.discard(v.m.root);
      },
    );
  }

  /** Earwhen: waddles, swings his cream cannon round to aim, and winds up each attack where you can see it. */
  private animateEarwhen(m: EarwhenModel, b: EarwhenBot, T: number) {
    m.root.position.set(b.x, b.hop, b.z);
    m.root.rotation.y = b.heading;
    let aim = b.aim - b.heading;
    aim = Math.atan2(Math.sin(aim), Math.cos(aim));
    m.cannon.rotation.y = clamp(aim, -0.9, 0.9);
    const stride = b.moving ? Math.sin(b.ph) : 0;
    let lean = 0;
    let jaw = 1;
    let recoil = 0;
    let arms = -1.1;
    let squash = 1;
    let legs = stride * 0.5;
    m.charge.visible = false;
    switch (b.act) {
      case 'leapWind':
        squash = 0.8;
        lean = 0.2;
        arms = -0.6;
        jaw = 1.8;
        break;
      case 'leap':
      case 'arrive':
        arms = -2.6;
        legs = 0.7;
        lean = 0.2;
        jaw = 2;
        break;
      case 'sprayWind':
        lean = -0.12;
        recoil = Math.sin(T * 50) * 0.04;
        break;
      case 'spray':
        lean = -0.08;
        recoil = -0.1 + Math.sin(T * 60) * 0.06;
        jaw = 1.8;
        break;
      case 'streamWind':
        lean = -0.05;
        break;
      case 'stream':
        recoil = -Math.abs(Math.sin(T * 28)) * 0.18;
        jaw = 1.5;
        break;
      case 'blobWind': {
        const p = clamp(b.mt / 1.3, 0, 1);
        m.charge.visible = true;
        m.charge.scale.setScalar(0.25 + p * 1.1 + Math.sin(T * 30) * 0.04 * p);
        squash = 1 - p * 0.12;
        lean = -0.1 * p;
        break;
      }
      case 'robotWind':
        lean = -0.12;
        recoil = Math.sin(T * 40) * 0.05;
        jaw = 1.6;
        break;
      case 'robots':
        recoil = -Math.abs(Math.sin(T * 14)) * 0.3;
        lean = -0.15;
        jaw = 2;
        break;
      case 'blob':
        lean = -0.3 * Math.max(0, 1 - b.mt / 0.4);
        recoil = -0.35 * Math.max(0, 1 - b.mt / 0.3);
        break;
      case 'eating':
        lean = 0.45;
        jaw = 1 + Math.abs(Math.sin(T * 16)) * 2.2;
        arms = -1.4 + Math.sin(T * 8) * 0.4;
        break;
      case 'stagger':
        lean = -0.2 + Math.sin(T * 6) * 0.08;
        jaw = 2.2;
        arms = -0.4;
        break;
      default:
        break;
    }
    m.pivot.rotation.x = lean;
    m.pivot.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    m.pivot.position.y = b.moving ? Math.abs(stride) * 0.12 : 0;
    m.legL.rotation.x = legs;
    m.legR.rotation.x = -legs;
    m.armL.rotation.x = arms;
    m.armR.rotation.x = arms;
    m.cannon.position.z = 1.0 + recoil;
    m.jaw.scale.y = jaw;
    m.stars.visible = b.act === 'stagger' || b.stun > 0;
    if (m.stars.visible) m.stars.rotation.y = T * 5;
    const f = b.flash > 0 ? 0.75 : 0;
    const r = b.rage ? 0.18 + Math.sin(T * 8) * 0.08 : 0;
    for (const mat of m.flashMats) mat.emissive.setRGB(f + r, f, f);
  }

  private makeBotModel(kind: BotKind): EnemyModel {
    switch (kind) {
      case 'spitter':
        return makeSpitter();
      case 'skewer':
        return makeSkewerHound();
      case 'tenderizer':
        return makeTenderizer();
      case 'bomber':
        return makeBomber();
      default:
        return makeGrillbot();
    }
  }

  private animateBot(v: BotView, b: Bot, c: (typeof COURSES)[number], T: number, camQ: THREE.Quaternion) {
    if (b.kind === 'earwhen') {
      this.animateEarwhen(v.m as EarwhenModel, b, T);
      return;
    }
    if (b.kind === 'guppy') {
      const m = v.m as GuppyModel;
      const ring = v.ring!;
      const ringFill = v.ringFill!;
      // the swing telegraph grows under his paddle while he winds up
      ring.visible = b.behavior === 'windup' && b.stun <= 0 && this.sim.living().length > 0;
      if (ring.visible) {
        const progress = clamp(b.mt / GUPPY_SWING.windup, 0, 1);
        ring.position.set(b.x + Math.sin(b.heading) * GUPPY_SWING.offset, 0.13, b.z + Math.cos(b.heading) * GUPPY_SWING.offset);
        ringFill.scale.setScalar(Math.max(0.05, GUPPY_SWING.radius * progress));
      }
      const stride = b.moving ? Math.sin(b.ph) : 0;
      m.root.position.set(b.x, b.moving ? 0.08 * Math.abs(stride) : 0, b.z);
      m.root.rotation.y = b.heading;
      m.boots[0].rotation.x = -stride * 0.56;
      m.boots[1].rotation.x = stride * 0.56;
      m.arms[0].rotation.x = b.swing - stride * 0.42;
      m.arms[1].rotation.x = b.swing * 0.46 + stride * 0.42;
      m.anim.rotation.x = b.moving ? 0.14 : b.swing * 0.1;
      m.tail.rotation.y = Math.sin(T * (b.moving ? 10 : 3.5)) * 0.23;
      m.flash.emissive.setRGB(b.flash > 0 ? 0.26 : 0, b.flash > 0 ? 0.19 : 0, b.flash > 0 ? 0.1 : 0);
      updateHpBar(m.hp, b.hp, b.maxHp, camQ, b.mode !== 'lunge' && b.behavior !== 'waiting' && b.behavior !== 'returning');
      return;
    }
    const m = v.m;
    switch (b.kind) {
      case 'grill':
        m.anim.rotation.x = b.chomp > 0 ? -0.95 * Math.sin((b.chomp / 0.3) * PI) : -0.12 - Math.abs(Math.sin(b.ph * 0.5)) * 0.25;
        break;
      case 'spitter': {
        const sq = b.chomp > 0 ? 1 - 0.26 * Math.sin((b.chomp / 0.36) * PI) : 1;
        m.anim.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        break;
      }
      case 'skewer':
        m.anim.position.z = b.mode === 'wind' ? 0.22 : b.mode === 'lunge' ? 0.92 : 0.55;
        break;
      case 'tenderizer': {
        const slamDur = 0.68 * c.tele;
        if (v.ring && v.ringFill) {
          v.ring.visible = b.mode === 'wind' && b.stun <= 0;
          v.ring.position.set(b.lx, 0.11, b.lz);
          v.ringFill.scale.setScalar(Math.max(0.05, 3.5 * Math.min(1, b.mt / slamDur)));
        }
        m.anim.rotation.x = b.mode === 'wind' ? lerp(-0.85, -2.95, Math.min(1, b.mt / (slamDur * 0.65))) : b.chomp > 0 ? -0.25 : -0.85 + Math.sin(b.ph) * 0.15;
        break;
      }
      case 'bomber': {
        const fuseDur = Math.max(0.88, 1.12 * c.tele);
        if (v.ring && v.ringFill) {
          v.ring.visible = b.mode === 'fuse';
          v.ring.position.set(b.x, 0.11, b.z);
          v.ringFill.scale.setScalar(Math.max(0.05, 4.6 * Math.min(1, b.mt / fuseDur)));
        }
        if (b.mode === 'fuse') m.anim.scale.setScalar(1 + 0.22 * (b.mt / fuseDur) + Math.sin(T * 42) * 0.09);
        break;
      }
    }
    m.root.position.set(b.x, b.hop, b.z);
    m.root.rotation.y = b.heading;
    m.root.rotation.z = b.stun > 0 ? Math.sin(T * 30) * 0.14 : 0;
    const fuseGlow = b.kind === 'bomber' && b.mode === 'fuse' ? 0.6 + Math.sin(T * 38) * 0.4 : 0;
    const hitGlow = b.flash > 0 ? 0.85 : 0;
    m.flash.emissive.setRGB(Math.max(hitGlow, fuseGlow * 1.4), hitGlow, hitGlow);
    updateHpBar(m.hp, b.hp, b.maxHp, camQ, b.kind === 'tenderizer' && b.hp < b.maxHp, false);
  }

  /* ───────────────────────── animation ───────────────────────── */

  private animatePlayer(k: Player, v: PlayerView, dt: number, lift = 0) {
    const m = v.m;
    m.root.position.set(k.x, k.y + lift, k.z);
    m.root.rotation.y = k.heading;
    const sp = Math.hypot(k.vx, k.vz);
    const grounded = k.grounded && lift === 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let sy = 1;
    let bob = 0;
    let legAmp = 0;
    let drop = 0;
    if (grounded && sp > 0.5) {
      v.walk += dt * (6 + sp * 1.4);
      legAmp = Math.min(0.9, sp * 0.09);
      bob = Math.abs(Math.sin(v.walk)) * 0.08;
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
        v.walk += dt * (k.riverRush ? 38 : 30);
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
        if (!grounded && lift === 0) rx = clamp(-k.vy * 0.03, -0.4, 0.4);
        break;
    }
    m.pivot.rotation.set(rx, ry, rz);
    const sxz = 1 / Math.sqrt(sy);
    m.pivot.scale.set(sxz, sy, sxz);
    m.pivot.position.y = 0.75 + bob - drop;
    const sw = Math.sin(v.walk) * legAmp;
    const tuck = !k.grounded && k.action !== 'dead' ? 0.7 : 0;
    m.legs[0].rotation.x = tuck ? -tuck : sw;
    m.legs[1].rotation.x = tuck ? -tuck : -sw;
    m.legs[2].rotation.x = tuck ? tuck : -sw;
    m.legs[3].rotation.x = tuck ? tuck : sw;
    m.tail.rotation.z = Math.sin(this.time * 9) * 0.3;
    m.earL.rotation.x = 0.35 + bob * 3;
    m.earR.rotation.x = 0.35 + bob * 3;
    m.root.visible = k.blink > 0 ? Math.floor(this.time * 22) % 2 === 0 : true;
    m.skin.color.lerp(this.tmpC.setHex(k.muddy > 0 ? 0x9a6a4e : k.tint), 1 - Math.exp(-4 * Math.max(dt, 0.001)));
  }

  private syncAllen(dt: number) {
    const A = this.sim.A;
    if (A.active && !this.wasAllenActive) {
      // fresh entrance: undo any pose left over from the last course
      this.aModel.pivot.rotation.set(0, 0, 0);
      this.aModel.pivot.scale.setScalar(1);
    }
    this.wasAllenActive = A.active;
    // lost in the Backrooms: nowhere to be seen
    this.aModel.root.visible = A.active && A.state !== 'backrooms';
    if (!A.active) {
      this.slamRing.visible = false;
      this.dashLine.visible = false;
      this.shieldGroup.visible = false;
      this.aModel.wok.visible = false;
      return;
    }
    this.animateAllen(dt);
  }

  private animateAllen(dt: number) {
    const A = this.sim.A;
    const m = this.aModel;
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
      case 'calling':
        if (t < 2.4) {
          // furious: stomping, fists up
          aR = -2.7 + Math.sin(T * 14) * 0.25;
          aL = -2.7 - Math.sin(T * 14) * 0.25;
          leg = Math.sin(T * 12) * 0.35;
          jaw = 2.6;
          squash = 0.95;
        } else {
          // phone to his ear
          aL = -2.9;
          aR = -0.6 + Math.sin(T * 3) * 0.2;
          head = 0.18;
          jaw = 1 + Math.abs(Math.sin(T * 9)) * 1.2;
        }
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
    m.phone.visible = A.state === 'calling' && t >= 2.4;
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

  private animateAlly(v: AllyView, a: Ally, camQ: THREE.Quaternion) {
    const m = v.m;
    if (a.dying > 0) {
      // Permanent death tumble, then fade into spirit sparks
      const p = Math.min(1, a.dying / 0.9);
      v.hpBar.group.visible = false;
      m.root.position.set(a.x, 0, a.z);
      m.pivot.rotation.z = lerp(0, PI / 2, Math.min(1, p * 1.8));
      m.pivot.position.y = 0.75 - Math.min(1, p * 1.8) * 0.25;
      m.root.visible = true;
      if (p > 0.6) m.root.scale.setScalar(Math.max(0.01, (1 - p) / 0.4));
      return;
    }
    m.root.position.set(a.x, this.sim.area === 'farm' && isOnLakeDock(a.x, a.z) ? 0.23 : 0, a.z);
    m.root.rotation.y = a.heading;
    m.root.visible = a.inv > 0 ? Math.floor(this.time * 18) % 2 === 0 : true;
    this.animPig(m, a.ph, a.moving);
    m.pivot.rotation.x = a.atk > 0 ? -Math.sin((a.atk / 0.25) * PI) * 0.45 : 0;
    updateHpBar(v.hpBar, a.hp, a.maxHp, camQ, false, true);
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

  private animateNpcs(dt: number) {
    const sim = this.sim;
    const farm = sim.area === 'farm';
    const inter = this.screen !== 'title' && sim.mode === 'intermission';
    if (!farm) {
      for (const m of this.markers) m.visible = false;
      return;
    }
    const k = this.me;
    const T = this.time;
    const panic = sim.mode === 'combat' && sim.A.active;
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
    each(this.charig, SPOT.charig, 4);
    each(this.kioff, SPOT.kioff, 6);
    if (sim.kingCast > 0) {
      // Kingger thrusts his arm skyward & spins his propeller beanie at turbo speed while firing Lightning Zap!
      this.king.armR.rotation.x = -3.05;
      if (this.king.spin) this.king.spin.rotation.y += dt * 45;
    }
    this.animateTrout(dt, inter, panic);
    const markerY = [4.3, 4.1, 5.4, 7.6, 3.2, 4.1, 4.1];
    this.markers.forEach((m, i) => {
      m.visible = inter;
      m.rotation.y = T * 2 + i;
      m.position.y = (markerY[i] ?? 4.2) + Math.sin(T * 3 + i) * 0.2;
    });
  }

  private animateTrout(dt: number, inter: boolean, panic: boolean) {
    const tr = this.trout;
    const k = this.me;
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
    const talking = this.sim.subtitle?.who === 'Trout';
    tr.jaw.rotation.x = PI / 2 + 0.16 + (talking ? Math.abs(Math.sin(T * 15)) * 0.34 : Math.abs(Math.sin(T * 2.4)) * 0.08);
    tr.ripples.forEach((rp, i) => {
      const p = (((T * (panic ? 1.1 : 0.55) + i * 0.5) % 1) + 1) % 1;
      rp.mesh.scale.setScalar(0.55 + p * 1.65);
      rp.mat.opacity = this.troutLeap > 0.1 && this.troutLeap < 0.7 ? 0.12 : Math.sin(p * PI) * 0.52;
    });
  }

  /* ───────────────────────── HUD bridge ───────────────────────── */

  private emit() {
    const sim = this.sim;
    sim.dirty = false;
    const k = this.me;
    const A = sim.A;
    const ci = Math.min(sim.course, COURSES.length - 1);
    const herd = sim.players.length > 1;
    let tag = '';
    let alert = false;
    const target = A.target >= 0 ? sim.edibles[A.target] : null;
    if (A.active) {
      if (A.shielded) {
        tag = 'Invincible — smash the sauce jars!';
        alert = true;
      } else if (A.state === 'backrooms') tag = 'Lost in the Backrooms';
      else if (A.tilt > 0) tag = `TILTED — faster and angrier (${Math.ceil(A.tilt)}s)`;
      else if (A.state === 'guard') tag = 'Wok Guard — flank him or land a finisher';
      else if (A.state === 'spin' || A.state === 'spinWind') tag = 'Sizzle Spin — invincible, keep away!';
      else if (A.exposed > 0) tag = 'EXPOSED — +35% damage!';
      else if (A.state === 'eating' && target) {
        tag = `Eating the ${target.name}!`;
        alert = true;
      } else if (A.state === 'toEat' && target) {
        tag = `Heading for the ${target.name}`;
        alert = true;
      } else if (A.state === 'stunned') tag = 'Stunned — hit him now!';
      else if (A.state === 'calling') tag = 'Calling for backup';
      else if (A.state === 'defeated' || A.state === 'ko' || A.state === 'leaving') tag = 'Stuffed';
      else if (A.enraged) tag = 'Hangry';
      else tag = 'Pork belly enthusiast';
    }
    let objective = '';
    const allen = this.asAllen;
    const W = sim.area === 'farm' ? sim.bots.find((b): b is EarwhenBot => b.kind === 'earwhen') ?? null : null;
    if (allen) {
      const standing = sim.living().length;
      objective = A.active
        ? `Eat the farm or flatten every pig · ${standing}/${sim.players.length} pigs standing`
        : `Course ${sim.course + 1} starts in ${Math.max(0, Math.ceil(sim.allenBreak))}s, or sooner if a pig rings the bell`;
    } else if (herd && k.action === 'dead' && sim.living().length > 0) {
      objective = "You're knocked out — the herd fights on. You'll get back up when the course ends";
    } else if (sim.area === 'forest') {
      objective = sim.forestHint;
    } else if (sim.mode === 'intermission') {
      const left = sim.pickups.filter((p) => p.area === 'farm').length;
      objective =
        sim.course === 0
          ? 'Train combos with Trout at the lake, shop around, go on a Hog Hunt with Herb, then ring the bell'
          : `${left ? `${left} truffles on the farm · ` : ''}Shop, train with Trout, hunt truffles with Herb, then ring the Bell`;
    } else if (W && (!A.active || A.state === 'ko')) objective = 'Take down Earwhen: dodge the cream, punish his wind-ups';
    else if (A.active && A.shielded) objective = 'Allen is invincible! Smash every sauce jar before the timer runs out';
    else if (A.active && alert) objective = 'Hit Allen to interrupt his meal!';
    else objective = 'Dodge, punish his recoveries, protect the farm';

    const lv = sim.levels;
    const rushReady = lv.riverrush > 0 && k.rushWindow > 0 && k.chainHits >= 2 && (k.chargeCd <= 0 || (lv.riverrush >= 2 && k.chargeCd <= 2.5));

    this.onHud({
      screen: this.screen,
      mode: sim.mode,
      area: sim.area,
      // Earwhen's stages count up on their own: "Earwhen 3/9"
      course: sim.course >= FINALE ? earwhenStage(sim.course) : ci,
      courseName: sim.course >= FINALE ? `Earwhen: ${EARWHEN_STAGES[earwhenStage(sim.course)]}` : COURSES[ci].name,
      courseCount: sim.course >= FINALE ? EARWHEN_STAGES.length : COURSES.length,
      hp: Math.ceil(k.hp),
      maxHp: k.maxHp,
      stam: k.stam,
      maxStam: k.maxStam,
      truffles: sim.truffles,
      farm: sim.farmPct(),
      chargeCd: k.chargeCd / (6 * (1 - 0.175 * lv.rocket)),
      zapCd: k.zapCd / zapCooldown(lv.zap),
      zapUnlocked: lv.zap > 0,
      squealCd: k.squealCd / (lv.squeal >= 2 ? 11 : 14),
      squealUnlocked: lv.squeal > 0,
      whipCd: k.whipCd / (lv.tailwhip >= 2 ? 1.5 : 2.3),
      whipUnlocked: lv.tailwhip > 0,
      cycloneUnlocked: lv.cyclone > 0,
      rushReady,
      combo: k.flowCount >= 2 && k.flowTimer > 0 ? { count: k.flowCount, move: k.flowMove, bonusPct: sim.flowBonusPct(k) } : null,
      muddy: k.muddy > 0,
      focus: k.focus > 0,
      hurtTick: k.hurtTick,
      foeCount: sim.bots.length,
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
        shield: A.shielded ? { left: sim.pots.length, total: A.potTotal, time: Math.max(0, A.shieldT), dur: A.shieldDur } : null,
        guarding: A.state === 'guard',
        exposed: A.exposed > 0,
      },
      earwhen: W
        ? {
            hp: Math.max(0, W.hp),
            maxHp: W.maxHp,
            alert: W.act === 'eating' || W.act === 'toEat',
            tag:
              W.act === 'stagger'
                ? 'Staggered — pile on!'
                : W.act === 'eating' || W.act === 'toEat'
                  ? 'Snack break — stop him!'
                  : W.act === 'sprayWind' || W.act === 'spray'
                    ? 'Cream Spray — get out of the cone!'
                    : W.act === 'streamWind' || W.act === 'stream'
                      ? 'Cream Stream — keep moving!'
                      : W.act === 'blobWind' || W.act === 'blob'
                        ? 'Mega Dollop — watch the white ring!'
                        : W.act === 'robotWind' || W.act === 'robots'
                          ? 'Flaming Robots — get out of the orange rings!'
                          : W.act === 'leapWind' || W.act === 'leap'
                            ? 'Cream Quake — move off the white ring!'
                        : W.rage
                          ? 'ENRAGED'
                          : 'Cream enthusiast',
          }
        : null,
      cinematic: A.active && A.state === 'calling',
      prompt: this.asAllen ? sim.allenPrompt : k.prompt,
      subtitle: sim.subtitle ? { who: sim.subtitle.who, text: sim.subtitle.text } : this.localSubtitle ? { who: this.localSubtitle.who, text: this.localSubtitle.text } : null,
      opening: sim.opening ? { step: sim.opening.step, total: OPENING_BEATS } : null,
      banner: sim.banner ? { title: sim.banner.title, sub: sim.banner.sub, key: sim.banner.key } : null,
      objective,
      shopNpc: k.shopNpc,
      levels: { ...lv },
      repairCount: sim.repairCount,
      locked: this.locked,
      gamepad: this.padLayout ? { layout: this.padLayout, active: this.padActive } : null,
      controllerDisconnected: this.controllerDisconnected,
      muted: this.sfx.muted,
      gfx: this.gfx.quality,
      overReason: sim.overReason,
      allies: sim.livingAlliesCount(),
      alliesMax: MAX_SQUAD,
      fallen: sim.stats.fallen,
      allen: allen ? this.allenHud() : null,
      party: herd || allen
        ? sim.players.map((p) => ({ id: p.id, name: p.name, hp: Math.ceil(p.hp), maxHp: p.maxHp, tint: '#' + p.tint.toString(16).padStart(6, '0'), down: p.action === 'dead', you: p.id === this.localId }))
        : null,
      hunt: sim.hunt
        ? {
            found: sim.hunt.found,
            total: sim.hunt.total,
            done: sim.hunt.done,
            hint: sim.forestHint,
            listenCd: sim.sniffCd,
            distance: Math.round(Math.hypot(k.x - sim.hunt.tx, k.z - sim.hunt.tz)),
            location:
              Math.hypot(k.x - FOREST_EXIT.x, k.z - FOREST_EXIT.z) < 18
                ? 'South Trailhead'
                : TRUFFLE_SPOTS.find((h) => Math.hypot(k.x - h.x, k.z - h.z) < 14)?.name ?? 'Deep in the woods',
          }
        : null,
      stats: { ...sim.stats },
      ...this.loadoutHud(k),
    });
  }

  /* ───────────────────────── ability loadout ───────────────────────── */

  /** Keeps the loadout in line with what the herd owns: new abilities drop into a free slot, lost ones leave. */
  private syncLoadout() {
    const lv = this.sim.levels;
    for (const id of ACTIVE_IDS) {
      if (lv[id] <= 0) {
        this.knownActives.delete(id);
        const i = this.loadout.indexOf(id);
        if (i >= 0) this.loadout[i] = null;
        continue;
      }
      if (this.knownActives.has(id)) continue;
      this.knownActives.add(id);
      if (this.loadout.includes(id)) continue;
      const pref = PREFERRED_SLOT[id];
      const slot = pref !== undefined && this.loadout[pref] === null ? pref : this.loadout.indexOf(null);
      if (slot >= 0) this.loadout[slot] = id;
    }
  }

  /** Puts an ability in a slot (or empties it with null). An ability already in another slot swaps places. */
  setLoadoutSlot(slot: number, id: ActiveId | null) {
    if (slot < 0 || slot >= LOADOUT_SLOTS) return;
    if (id) {
      const was = this.loadout.indexOf(id);
      if (was >= 0) this.loadout[was] = this.loadout[slot];
    }
    this.loadout[slot] = id;
    this.emit();
  }

  /** Cooldown left, as a fraction, for one of this pig's active abilities. */
  private activeCd(k: Player, id: ActiveId): number {
    const lv = this.sim.levels;
    switch (id) {
      case 'zap':
        return k.zapCd / zapCooldown(lv.zap);
      case 'squeal':
        return k.squealCd / (lv.squeal >= 2 ? 11 : 14);
      case 'tailwhip':
        return k.whipCd / (lv.tailwhip >= 2 ? 1.5 : 2.3);
      case 'portal':
        return k.portalCd / (lv.portal >= 2 ? 15 : 18);
      case 'decoy':
        return k.decoyCd / 16;
      case 'potion':
        return k.potionCd / (lv.potion >= 2 ? 15 : 20);
      case 'smash':
        return k.smashCd / (lv.smash >= 2 ? 24 : 30);
    }
  }

  private loadoutHud(k: Player): Pick<HudState, 'actives' | 'owned'> {
    this.syncLoadout();
    const pad = this.padActive ? this.padLayout : null;
    return {
      actives: this.loadout.map((id, slot) => ({
        slot,
        key: pad ? padActionLabel(pad, SLOT_PAD[slot]) : bindLabel(`slot${slot + 1}` as BindAction),
        code: SLOT_CODES[slot],
        id,
        name: id ? ACTIVE_INFO[id].name : '',
        icon: id ? ACTIVE_INFO[id].icon : '',
        cd: id ? clamp(this.activeCd(k, id), 0, 1) : 0,
      })),
      owned: ACTIVE_IDS.filter((id) => this.sim.levels[id] > 0),
    };
  }

  /** Allen's moves and cooldowns for the HUD when a person plays him. */
  private allenHud(): NonNullable<HudState['allen']> {
    const A = this.sim.A;
    const c = COURSES[Math.min(this.sim.course, COURSES.length - 1)];
    const pad = this.padActive ? this.padLayout : null;
    const key = (k: string, action: keyof typeof PAD_ACTIONS) => (pad ? padActionLabel(pad, action) : k);
    const move = (k: string, action: keyof typeof PAD_ACTIONS, name: string, cd: number, full: number) => ({ key: key(k, action), name, cd: clamp(cd / full, 0, 1) });
    return {
      active: A.active,
      state: A.state,
      moves: [
        move(bindLabel('attack'), 'headbutt', 'Claw swipe', A.cdSwipe, 1.2),
        move(bindLabel('charge'), 'charge', 'Dash', A.cdDash, 9),
        move(bindLabel('jump'), 'jump', 'Body slam', A.cdSlam, 6.5),
        move(bindLabel('roll'), 'roll', 'Wok guard', A.cdGuard, 10),
        move(bindLabel('slot1'), 'zap', 'Chopsticks', A.cdThrow, 4.8),
        move(bindLabel('slot2'), 'squeal', 'Summon bots', A.cdSummon, c.waveCd),
        move(bindLabel('slot3'), 'whip', 'Hot pot rain', A.cdRain, 11),
        move(bindLabel('listen'), 'listen', 'Sizzle spin', A.cdSpin, 15),
      ],
    };
  }

  /** Draws one pig as an arrow on the minimap. */
  private mapArrow(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, u: number, fill: string, big: boolean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-heading + PI);
    ctx.scale(u, u);
    ctx.beginPath();
    if (big) {
      ctx.moveTo(0, -9);
      ctx.lineTo(6.5, 7);
      ctx.lineTo(0, 3.5);
      ctx.lineTo(-6.5, 7);
    } else {
      ctx.moveTo(0, -6.5);
      ctx.lineTo(4.8, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-4.8, 5);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = '#2a1a12';
    ctx.lineWidth = big ? 2.5 : 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawMinimap() {
    const cv = this.minimap;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const sim = this.sim;
    const S = cv.width;
    if (sim.area === 'forest') {
      this.drawForestMinimap(ctx, S);
      this.drawCompass(ctx, S);
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
    for (const e of sim.edibles) {
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
    for (const p of sim.pickups) if (p.area === 'farm') dot(p.x, p.z, 2.5, '#ffc93c', '#2a1a12');
    const inter = sim.mode === 'intermission';
    dot(SPOT.bell.x, SPOT.bell.z, 5, inter ? '#ffc93c' : '#bfa24a', '#2a1a12');
    dot(SPOT.rickley.x, SPOT.rickley.z, 5, '#c2392b', '#fbf3df');
    dot(SPOT.kingger.x, SPOT.kingger.z, 5, '#2bb3c0', '#fbf3df');
    dot(SPOT.trout.x, SPOT.trout.z, 5, '#f0758d', '#fbf3df');
    dot(SPOT.kioff.x, SPOT.kioff.z, 5, '#8a6ad1', '#fbf3df');
    dot(SPOT.charig.x, SPOT.charig.z, 5, '#2f9e6b', '#fbf3df');
    for (const pd of sim.puddles) dot(pd.x, pd.z, 4.5, 'rgba(235,52,24,0.45)');
    for (const b of sim.bots) {
      if (b.kind === 'earwhen') {
        dot(b.x, clamp(b.z, -60, 60), 7, '#6fb7e8', '#ffffff');
        continue;
      }
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
    for (const p of sim.pots) dot(p.x, p.z, 4.4 + Math.sin(this.time * 6) * 0.9, '#ffd23f', '#c2392b');
    const A = sim.A;
    if (A.active && A.state !== 'backrooms') {
      const pulse = A.state === 'eating' ? 3 + Math.abs(Math.sin(this.time * 8)) * 4 : 0;
      if (pulse) dot(A.x, clamp(A.z, -60, 60), 8 + pulse, 'rgba(255,59,48,0.35)');
      dot(A.x, clamp(A.z, -60, 60), 7.5, '#6b3a8c', '#ffffff');
    }
    dot(SPOT.hunt.x, SPOT.hunt.z, 5, '#344d36', '#ffc93c');
    ctx.fillStyle = '#2a1a12';
    ctx.font = `${S / 27}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('VALLEY', X(SPOT.hunt.x - 4), Z(SPOT.hunt.z - 4));
    for (const a of sim.allies) if (a.hp > 0) dot(a.x, a.z, 2.8, '#ffb3c7', '#2a1a12');
    // the rest of the herd, then this browser's pig on top
    for (const p of sim.players) {
      if (p.id === this.localId) continue;
      this.mapArrow(ctx, X(p.x), Z(p.z), p.heading, u, p.action === 'dead' ? '#7a6a66' : '#' + p.tint.toString(16).padStart(6, '0'), false);
    }
    const k = this.me;
    if (!this.asAllen) this.mapArrow(ctx, X(k.x), Z(k.z), k.heading, u, '#ff8fb0', true);
    this.drawCompass(ctx, S);
  }

  /**
   * Compass rose in the minimap's top-left corner. The map is always north-up (−z is north), the same
   * axes Herb uses when he says "to the northeast", so the letters tell you which way to head.
   */
  private drawCompass(ctx: CanvasRenderingContext2D, S: number) {
    const r = S * 0.085;
    const cx = r + S * 0.035;
    const cy = r + S * 0.035;
    ctx.save();
    ctx.translate(cx, cy);
    // backing disc so it reads over grass, paths and trees alike
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.18, 0, TAU);
    ctx.fillStyle = 'rgba(251,243,223,0.88)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, S / 150);
    ctx.strokeStyle = '#2a1a12';
    ctx.stroke();
    // four diamond points: north red, the rest ink
    const point = (ang: number, len: number, fill: string) => {
      const w = r * 0.24;
      ctx.save();
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(w, 0);
      ctx.lineTo(0, w * 0.6);
      ctx.lineTo(-w, 0);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    };
    point(PI / 2, r * 0.42, '#2a1a12');
    point(PI, r * 0.42, '#2a1a12');
    point(-PI / 2, r * 0.42, '#2a1a12');
    point(0, r * 0.62, '#d9251d');
    ctx.font = `bold ${Math.round(r * 0.52)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const at = r * 0.84;
    ctx.fillStyle = '#d9251d';
    ctx.fillText('N', 0, -at);
    ctx.fillStyle = '#2a1a12';
    ctx.fillText('S', 0, at);
    ctx.fillText('E', at, 0);
    ctx.fillText('W', -at, 0);
    ctx.restore();
  }

  private drawForestMinimap(ctx: CanvasRenderingContext2D, size: number) {
    const forest = this.forest;
    if (!forest) return;
    const sim = this.sim;
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
    // the next cache (pulsing gold), and Herb with his lantern
    if (sim.hunt && !sim.hunt.done) dot(sim.hunt.tx, sim.hunt.tz, 4 + Math.sin(this.time * 6), '#f0b429');
    for (const w of sim.wild) dot(w.x, w.z, 3.4, '#ffb04a');
    for (const a of sim.allies) if (a.hp > 0) dot(a.x, a.z, 2.5, '#ffb3c7');
    for (const p of sim.pickups) if (p.area === 'forest') dot(p.x, p.z, 2.3, '#f0b429');
    // the jump-scare Guppy stays off the map: you never see him coming
    const guard = sim.bots.find((b) => b.kind === 'guppy' && b.mode !== 'lunge');
    if (guard && guard.kind === 'guppy') {
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

    for (const p of sim.players) {
      if (p.id === this.localId) continue;
      this.mapArrow(ctx, X(p.x), Z(p.z), p.heading, unit * 0.9, p.action === 'dead' ? '#7a6a66' : '#' + p.tint.toString(16).padStart(6, '0'), false);
    }
    const k = this.me;
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
