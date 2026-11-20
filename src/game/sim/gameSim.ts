/**
 * What the browser client needs from a game: the state it renders and the commands it sends.
 * The local `Sim` satisfies it directly; `NetSim` (../net/NetSim.ts) satisfies it by mirroring a
 * server's simulation and forwarding commands over the network.
 */
import type { ComboId, GameOverReason, HogName, Plot, UpgradeId } from '../data';
import type { Collider } from '../layout';
import type { AllenState } from './Sim';
import type { Ally, Area, Bot, Decoy, Hazard, Kernel, Memorial, Pickup, Player, PlayerInput, Pot, Proj, Puddle, Shock, SimEvent, Wild } from './types';

export interface EdibleState {
  id: string;
  name: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
}

export interface GameSim {
  players: Player[];
  A: AllenState;
  bots: Bot[];
  projs: Proj[];
  puddles: Puddle[];
  memorials: Memorial[];
  shocks: Shock[];
  pickups: Pickup[];
  kernels: Kernel[];
  pots: Pot[];
  hazards: Hazard[];
  wild: Wild[];
  allies: Ally[];
  decoys: Decoy[];
  edibles: EdibleState[];

  time: number;
  area: Area;
  mode: 'intermission' | 'combat';
  course: number;
  tod: number;
  levels: Record<UpgradeId, number>;
  repairCount: number;
  truffles: number;
  plots: Plot[];
  rank: number;
  xp: number;
  comboUses: Record<ComboId, number>;
  stats: { time: number; dealt: number; taken: number; earned: number; fallen: number; ko: number };
  recruitedHogs: Set<HogName>;
  hunt: { total: number; found: number; tx: number; tz: number; done: boolean } | null;
  forestHint: string;
  sniffCd: number;
  sniffTime: number;
  sniffTargetId: number;
  overReason: GameOverReason | null;
  outcome: 'gameover' | 'victory' | null;
  subtitle: { who: string; text: string; t: number } | null;
  banner: { title: string; sub: string; key: number; t: number } | null;
  opening: { step: number; t: number } | null;
  kingCast: number;
  turretYaw: number;
  hitstop: number;
  dirty: boolean;
  allenPlayer: boolean;
  allenPrompt: string | null;
  allenBreak: number;

  player(id: number): Player | undefined;
  living(): Player[];
  colliders(): Collider[];
  flowBonusPct(p: Player): number;
  livingAlliesCount(): number;
  farmPct(): number;

  step(dt: number, inputs?: Map<number, PlayerInput>): void;
  drainEvents(): SimEvent[];
  start(opts?: { opening?: boolean }): void;
  finishOpening(): void;
  advanceOpening(): void;
  retryCourse(): void;
  returnToFarm(): void;
  closeShop(pid: number): void;
  buy(pid: number, id: UpgradeId): void;
}
