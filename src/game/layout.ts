/**
 * Map layout constants and collision shapes shared by the simulation and the renderer.
 * This module must stay free of THREE.js, the DOM and audio so the game simulation can run headless
 * (for example on a multiplayer server).
 */

export const BOUND = 54;

export const SPOT = {
  rickley: { x: -20, z: -22 },
  kingger: { x: 33, z: 21 },
  trout: { x: -38.7, z: 38.5 },
  troutDock: { x: -34.2, z: 38.5 },
  dummy: { x: -24.5, z: 31.2 },
  lake: { x: -41, z: 41, r: 11 },
  bell: { x: 0, z: -6 },
  mud: { x: 14, z: 8, r: 6 },
  gate: { x: 0, z: 56 },
  turret: { x: 4, z: 16 },
  start: { x: 0, z: 6 },
  hunt: { x: 48, z: 41, r: 5 },
  /** Kioff hangs around the chicken coop door. */
  kioff: { x: 40.2, z: -27.5 },
  /** Charig waits by the farmhouse porch. */
  charig: { x: 21, z: -27 },
};

/** Rickley's truffle garden: plots west of his stall. */
export const GARDEN = { x: -38, z: -20 };
export const GARDEN_PLOTS = [-3, 0, 3].flatMap((dx) => [-2, 2].map((dz) => ({ x: GARDEN.x + dx, z: GARDEN.z + dz })));

/** Kingger's Tesla coil on the lab roof. */
export const COIL = { x: 33.5, y: 3.35, z: 29.5 };

/** True when a point stands on the wooden pier jutting out into Trout Lake. */
export function isOnLakeDock(x: number, z: number): boolean {
  return x >= -35.9 && x <= -27.2 && z >= 36.7 && z <= 40.3;
}

export interface Collider {
  kind: 'c' | 'b';
  x: number;
  z: number;
  r: number;
  hx: number;
  hz: number;
  /** Height, used so the camera can see over low obstacles. */
  h: number;
  enabled: boolean;
  /** Water collider bypassed while standing on Trout Lake's dock. */
  lakeWater?: boolean;
}

export const FOREST_BOUND = 74;
export const FOREST_EXIT = { x: 0, z: 65 };
export const FOREST_START = { x: 0, z: 54 };
export const FOREST_HOMES = [
  { x: -11, z: 32, name: 'Fern Hollow', r: 10 },
  { x: -39, z: 13, name: 'The Old Camp', r: 11 },
  { x: 35, z: 22, name: 'Acorn Grove', r: 11 },
  { x: -41, z: -37, name: 'Boar Ridge', r: 12 },
  { x: 4, z: -51, name: 'Deepwood', r: 12 },
  { x: 45, z: -38, name: 'Mossy Hollow', r: 11 },
];

/** Where truffle caches can be buried for a Hog Hunt (a few are picked each time). */
export const TRUFFLE_SPOTS = [
  { x: -11, z: 32, name: 'Fern Hollow' },
  { x: -39, z: 13, name: 'The Old Camp' },
  { x: 35, z: 22, name: 'Acorn Grove' },
  { x: -41, z: -37, name: 'Boar Ridge' },
  { x: 4, z: -51, name: 'Deepwood' },
  { x: 45, z: -38, name: 'Mossy Hollow' },
  { x: -60, z: -4, name: "Guppy's End" },
  { x: -20, z: -14, name: 'the Hollow Stump' },
  { x: 22, z: -6, name: 'Crow Clearing' },
];
/** Truffle caches dug up per Hog Hunt. */
export const HUNT_CACHES = 5;

export const GUPPY_END = { x: -60, z: -4, r: 8.5, name: "Guppy's End" };
export const GUPPY_HP = 105;
export const GUPPY_SWING = { radius: 2.6, offset: 1.2, windup: 0.62 };
