import * as THREE from 'three';
import { grainTex } from './textures';

const PI = Math.PI;
const TAU = PI * 2;

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Per-colour surface overrides: metals reflect the sky, eyes are glossy, rubber is matte. */
const PBR: Record<number, { r?: number; m?: number }> = {
  0xd9dee6: { m: 1, r: 0.22 },
  0x8d949c: { m: 0.9, r: 0.36 },
  0xd3d8dc: { m: 0.8, r: 0.42 },
  0x9aa4ad: { m: 0.8, r: 0.46 },
  0xc9d3dc: { m: 0.7, r: 0.4 },
  0x9fb0bf: { m: 0.7, r: 0.4 },
  0x5f7384: { m: 0.55, r: 0.5 },
  0x54677a: { m: 0.55, r: 0.5 },
  0x2f3b46: { m: 0.5, r: 0.5 },
  0x1b1418: { r: 0.14 },
  0x15121a: { r: 0.32 },
  0x26262b: { r: 0.55 },
};

/** Smooth physically based surface with a fine grain so nothing reads as flat plastic. */
function surface(color: number): THREE.MeshStandardMaterial {
  const p = PBR[color];
  const grain = grainTex();
  const metal = p?.m ?? 0;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: p?.r ?? 0.9,
    metalness: metal,
    bumpMap: grain,
    bumpScale: metal > 0 ? 0.15 : 0.5,
    roughnessMap: metal > 0 || p?.r !== undefined ? null : grain,
  });
}

/** Shared material by colour. */
export function M(color: number): THREE.MeshStandardMaterial {
  const key = 'm' + color;
  let m = cache.get(key);
  if (!m) {
    m = surface(color);
    cache.set(key, m);
  }
  return m;
}

/** Shared self-lit material. */
export function glow(color: number, intensity = 1): THREE.MeshStandardMaterial {
  const key = 'g' + color + '_' + intensity;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: intensity * 2.6 });
    cache.set(key, m);
  }
  return m;
}

/** Un-shared material for things that flash or tint. */
export function unique(color: number): THREE.MeshStandardMaterial {
  return surface(color);
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
// primitives are tessellated well above the requested counts so curved shapes shade smoothly
export const sph = (r: number, ws = 10, hs = 8) => new THREE.SphereGeometry(r, Math.max(ws * 2, 18), Math.max(hs * 2, 12));
export const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, Math.max(seg * 2, 14));
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, Math.max(seg * 2, 14));
export const torus = (r: number, t: number, rs = 6, ts = 14, arc = TAU) => new THREE.TorusGeometry(r, t, Math.max(rs * 2, 10), Math.max(ts * 2, 24), arc);

export interface PartOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  shadow?: boolean;
}

export function part(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  o: PartOpts = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  const sh = o.shadow ?? true;
  m.castShadow = sh;
  m.receiveShadow = sh;
  parent.add(m);
  return m;
}

/* ───────────────────────── Kenji the pig ───────────────────────── */

export interface KenjiModel {
  root: THREE.Group;
  pivot: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  tail: THREE.Mesh;
  earL: THREE.Mesh;
  earR: THREE.Mesh;
  skin: THREE.MeshStandardMaterial;
}

export function makeKenji(tint = 0xf7a8b8, bandana = true): KenjiModel {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 0.75;
  root.add(pivot);
  const skin = unique(tint);
  skin.roughness = 0.75;
  const dark = M(0xe27d98);
  const hoof = M(0x5b3a36);

  part(pivot, sph(0.62, 12, 9), skin, 0, 0, 0, { sx: 1.04, sy: 0.95, sz: 1.3 });

  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.78);
  pivot.add(head);
  part(head, sph(0.47, 12, 9), skin);
  part(head, cyl(0.2, 0.23, 0.24, 10), dark, 0, -0.05, 0.44, { rx: PI / 2 });
  part(head, sph(0.045, 6, 4), M(0x8a3b52), -0.08, -0.04, 0.565, { shadow: false });
  part(head, sph(0.045, 6, 4), M(0x8a3b52), 0.08, -0.04, 0.565, { shadow: false });
  for (const s of [-1, 1]) {
    part(head, sph(0.075, 8, 6), M(0x1b1418), 0.2 * s, 0.13, 0.37, { shadow: false });
    part(head, sph(0.028, 5, 4), M(0xffffff), 0.185 * s, 0.16, 0.432, { shadow: false });
    // determined little eyebrow
    part(head, box(0.16, 0.035, 0.04), M(0x7a3b4c), 0.2 * s, 0.25, 0.39, { rz: 0.35 * s, shadow: false });
  }
  const earL = part(head, cone(0.17, 0.32, 4), dark, 0.3, 0.38, 0.04, { rz: -0.55, rx: 0.35 });
  const earR = part(head, cone(0.17, 0.32, 4), dark, -0.3, 0.38, 0.04, { rz: 0.55, rx: 0.35 });

  // hero bandana
  const red = M(0xc2392b);
  part(pivot, torus(0.5, 0.085, 6, 14), red, 0, 0.06, 0.5, { sy: 0.95 });
  part(pivot, cone(0.14, 0.42, 4), red, 0.42, 0.3, 0.42, { rz: -1.0, rx: -0.6 });
  part(pivot, cone(0.11, 0.34, 4), red, 0.5, 0.18, 0.36, { rz: -1.5, rx: -0.9 });

  const legs: THREE.Group[] = [];
  for (const [lx, lz] of [
    [0.3, 0.45],
    [-0.3, 0.45],
    [0.3, -0.45],
    [-0.3, -0.45],
  ]) {
    const g = new THREE.Group();
    g.position.set(lx, -0.3, lz);
    pivot.add(g);
    part(g, cyl(0.135, 0.115, 0.36, 7), skin, 0, -0.18, 0);
    part(g, cyl(0.125, 0.125, 0.1, 7), hoof, 0, -0.4, 0);
    legs.push(g);
  }

  const tail = part(pivot, torus(0.12, 0.04, 5, 10, PI * 1.6), dark, 0, 0.28, -0.82, { ry: PI / 2 });

  if (!bandana) {
    for (const c of [...pivot.children]) if (c instanceof THREE.Mesh && c.material === red) pivot.remove(c);
  }
  return { root, pivot, head, legs, tail, earL, earR, skin };
}

/* ───────────────────────── Allen B. Hwang ───────────────────────── */

export interface AllenModel {
  root: THREE.Group;
  pivot: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  flashMats: THREE.MeshStandardMaterial[];
  stars: THREE.Group;
  wok: THREE.Group;
}

export function makeAllen(): AllenModel {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);
  const suit = unique(0xff7a1a);
  const skin = unique(0xf0c8a0);
  const bibM = unique(0xff7a1a);
  const pants = unique(0x8c9199);
  const flashMats = [suit, skin, bibM, pants];
  const black = M(0x15121a);

  const mkLeg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 1.3, 0);
    pivot.add(g);
    part(g, cyl(0.4, 0.32, 1.2, 8), pants, 0, -0.6, 0);
    part(g, box(0.62, 0.32, 1.0), black, 0, -1.14, 0.18);
    return g;
  };
  const legL = mkLeg(0.58);
  const legR = mkLeg(-0.58);

  // belly + bib with a little pig logo
  part(pivot, sph(1.45, 14, 10), suit, 0, 2.55, 0, { sx: 1.14, sy: 1.05 });
  part(pivot, sph(1.0, 12, 8), bibM, 0, 2.85, 0.98, { sx: 0.8, sy: 0.85, sz: 0.5 });
  part(pivot, cyl(0.26, 0.26, 0.06, 10), M(0xf7a8b8), 0, 2.8, 1.49, { rx: PI / 2, shadow: false });
  part(pivot, sph(0.05, 6, 4), M(0x8a3b52), -0.09, 2.8, 1.53, { shadow: false });
  part(pivot, sph(0.05, 6, 4), M(0x8a3b52), 0.09, 2.8, 1.53, { shadow: false });
  // bow tie
  part(pivot, cone(0.2, 0.36, 4), M(0xff7a1a), -0.2, 3.72, 1.02, { rz: -PI / 2 });
  part(pivot, cone(0.2, 0.36, 4), M(0xff7a1a), 0.2, 3.72, 1.02, { rz: PI / 2 });

  const head = new THREE.Group();
  head.position.set(0, 4.25, 0.1);
  pivot.add(head);
  part(head, sph(0.85, 12, 10), skin);
  part(head, new THREE.SphereGeometry(0.9, 12, 6, 0, TAU, 0, PI * 0.52), black, 0, 0.04, -0.06, { rx: -0.28 });
  part(head, cone(0.3, 0.5, 5), black, 0.15, 0.88, 0.3, { rz: -0.5, rx: 0.5 });
  for (const s of [-1, 1]) {
    part(head, sph(0.18, 8, 6), skin, 0.84 * s, 0, 0);
    part(head, sph(0.17, 8, 6), M(0xffffff), 0.3 * s, 0.12, 0.7, { shadow: false });
    part(head, sph(0.085, 6, 5), black, 0.3 * s, 0.1, 0.84, { shadow: false });
    part(head, box(0.42, 0.1, 0.12), black, 0.3 * s, 0.4, 0.76, { rz: 0.38 * s, shadow: false });
    part(head, sph(0.14, 6, 5), M(0xf2a0a0), 0.55 * s, -0.18, 0.6, { sz: 0.4, shadow: false });
  }
  part(head, sph(0.12, 6, 5), M(0xe0b088), 0, -0.05, 0.86, { shadow: false });
  const jaw = part(head, box(0.62, 0.22, 0.16), M(0x5a1020), 0, -0.42, 0.74, { shadow: false });
  part(head, box(0.5, 0.07, 0.06), M(0xffffff), 0, -0.33, 0.83, { shadow: false });

  // right arm: giant fork
  const silver = M(0xd9dee6);
  const armR = new THREE.Group();
  armR.position.set(-1.6, 3.35, 0);
  armR.rotation.z = -0.22;
  pivot.add(armR);
  part(armR, cyl(0.32, 0.27, 1.5, 8), suit, 0, -0.75, 0);
  part(armR, sph(0.36, 8, 6), skin, 0, -1.62, 0);
  part(armR, cyl(0.08, 0.08, 2.1, 6), silver, 0, -2.45, 0.1);
  part(armR, box(0.56, 0.1, 0.1), silver, 0, -3.5, 0.1);
  for (const x of [-0.22, 0, 0.22]) part(armR, cyl(0.045, 0.03, 0.7, 5), silver, x, -3.85, 0.1);

  // left arm: chopsticks
  const armL = new THREE.Group();
  armL.position.set(1.6, 3.35, 0);
  armL.rotation.z = 0.22;
  pivot.add(armL);
  part(armL, cyl(0.32, 0.27, 1.5, 8), suit, 0, -0.75, 0);
  part(armL, sph(0.36, 8, 6), skin, 0, -1.62, 0);
  part(armL, box(0.07, 1.7, 0.07), M(0xd9b27a), -0.08, -2.4, 0.1, { rz: 0.04 });
  part(armL, box(0.07, 1.7, 0.07), M(0xd9b27a), 0.08, -2.4, 0.1, { rz: -0.04 });

  // dizzy stars (shown when stunned)
  const stars = new THREE.Group();
  stars.position.set(0, 5.6, 0);
  stars.visible = false;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    part(stars, new THREE.OctahedronGeometry(0.22, 0), glow(0xffd23f, 1.2), Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0, { shadow: false });
  }
  pivot.add(stars);

  // giant wok he hides behind during Wok Guard (hidden until he raises it)
  const wok = new THREE.Group();
  wok.position.set(0, 2.7, 1.8);
  wok.visible = false;
  pivot.add(wok);
  const steel = new THREE.MeshStandardMaterial({ color: 0x7d8792, roughness: 0.55, metalness: 0.2, flatShading: false, side: THREE.DoubleSide });
  part(wok, new THREE.SphereGeometry(1.85, 14, 6, 0, TAU, 0, PI / 2.5), steel, 0, 0, -1.25, { rx: PI / 2 });
  part(wok, torus(1.75, 0.09, 6, 18), M(0x3a3f47), 0, 0, -0.68);
  part(wok, cyl(0.1, 0.1, 1.2, 6), M(0x6b4226), 2.3, 0, -0.6, { rz: PI / 2 });
  part(wok, sph(0.22, 8, 6), glow(0xffd23f, 0.9), 0, 0, 0.62, { shadow: false });

  return { root, pivot, head, jaw, armL, armR, legL, legR, flashMats, stars, wok };
}

/* ───────────────────────── NPCs ───────────────────────── */

export interface NpcModel {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  spin: THREE.Object3D | null;
}

export function makeRickley(): NpcModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const denim = M(0x3d5f94);
  const plaid = M(0xb8402f);
  const skin = M(0xe8b68c);
  const boot = M(0x5a3a22);

  for (const s of [-1, 1]) {
    part(body, box(0.34, 0.9, 0.36), denim, 0.23 * s, 0.6, 0);
    part(body, box(0.38, 0.22, 0.56), boot, 0.23 * s, 0.11, 0.08);
  }
  part(body, box(1.0, 1.0, 0.62), plaid, 0, 1.5, 0);
  part(body, box(0.74, 0.7, 0.06), denim, 0, 1.35, 0.33);
  part(body, box(0.12, 0.5, 0.06), denim, -0.28, 1.86, 0.33);
  part(body, box(0.12, 0.5, 0.06), denim, 0.28, 1.86, 0.33);
  part(body, sph(0.05, 5, 4), M(0xf0b429), -0.28, 1.66, 0.37, { shadow: false });
  part(body, sph(0.05, 5, 4), M(0xf0b429), 0.28, 1.66, 0.37, { shadow: false });

  const mkArm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(0.63 * s, 1.92, 0);
    g.rotation.z = 0.1 * s;
    body.add(g);
    part(g, box(0.27, 0.85, 0.27), plaid, 0, -0.42, 0);
    part(g, sph(0.16, 6, 5), skin, 0, -0.94, 0);
    return g;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);

  const head = new THREE.Group();
  head.position.set(0, 2.42, 0);
  body.add(head);
  part(head, sph(0.42, 10, 8), skin);
  part(head, sph(0.44, 10, 6), M(0xe6dfd2), 0, -0.14, 0.02, { sy: 0.75, sz: 0.98 }); // beard
  part(head, sph(0.42, 10, 8), skin, 0, 0.06, 0.03, { sx: 0.98, sy: 0.92 });
  part(head, box(0.42, 0.1, 0.1), M(0xe6dfd2), 0, -0.12, 0.4, { shadow: false });
  part(head, sph(0.085, 6, 5), M(0xd99a78), 0, 0, 0.42, { shadow: false });
  for (const s of [-1, 1]) {
    part(head, sph(0.05, 6, 4), M(0x1b1418), 0.15 * s, 0.1, 0.39, { shadow: false });
    part(head, box(0.16, 0.04, 0.05), M(0xe6dfd2), 0.15 * s, 0.2, 0.4, { rz: -0.15 * s, shadow: false });
  }
  // wheat stalk
  part(head, cyl(0.012, 0.012, 0.5, 4), M(0xe3c067), 0.16, -0.2, 0.52, { rx: 1.2, rz: -0.5, shadow: false });
  // straw hat
  const straw = M(0xe6c468);
  part(head, cyl(0.8, 0.8, 0.06, 14), straw, 0, 0.3, 0);
  part(head, cyl(0.38, 0.44, 0.36, 12), straw, 0, 0.5, 0);
  part(head, cyl(0.45, 0.45, 0.1, 12), M(0xc2392b), 0, 0.37, 0);

  // pitchfork planted next to him
  const wood = M(0x8a5a3a);
  part(root, cyl(0.045, 0.045, 2.6, 5), wood, 1.05, 1.3, 0.1);
  part(root, box(0.5, 0.06, 0.06), M(0x8d949c), 1.05, 2.6, 0.1);
  for (const x of [-0.22, 0, 0.22]) part(root, cyl(0.025, 0.02, 0.5, 4), M(0x8d949c), 1.05 + x, 2.86, 0.1);

  return { root, body, head, armR, armL, spin: null };
}

export function makeKingger(): NpcModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const coat = M(0xf1f4f8);
  const khaki = M(0x8f7d5c);
  const skin = M(0xd9a877);
  const black = M(0x1b1418);

  for (const s of [-1, 1]) {
    part(body, box(0.25, 0.85, 0.27), khaki, 0.17 * s, 0.58, 0);
    part(body, box(0.3, 0.2, 0.5), M(0xffffff), 0.17 * s, 0.1, 0.07);
    part(body, box(0.31, 0.07, 0.51), M(0xc2392b), 0.17 * s, 0.06, 0.07);
  }
  part(body, box(0.78, 0.98, 0.46), coat, 0, 1.45, 0);
  part(body, box(0.82, 0.5, 0.2), coat, 0, 0.82, -0.16);
  part(body, box(0.22, 0.8, 0.05), M(0x3fa66b), 0, 1.5, 0.24);
  part(body, box(0.07, 0.5, 0.06), M(0x243b63), 0, 1.5, 0.27);
  // pocket protector
  part(body, box(0.2, 0.18, 0.05), M(0xdfe5ec), 0.24, 1.62, 0.25);
  part(body, box(0.035, 0.14, 0.035), M(0xc2392b), 0.19, 1.74, 0.27, { shadow: false });
  part(body, box(0.035, 0.14, 0.035), M(0x2b6fd6), 0.25, 1.74, 0.27, { shadow: false });
  part(body, box(0.035, 0.14, 0.035), M(0x1b1418), 0.31, 1.74, 0.27, { shadow: false });

  const mkArm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(0.5 * s, 1.86, 0);
    g.rotation.z = 0.08 * s;
    body.add(g);
    part(g, box(0.2, 0.8, 0.22), coat, 0, -0.4, 0);
    part(g, sph(0.13, 6, 5), skin, 0, -0.88, 0);
    return g;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);
  // tablet in left hand
  armL.rotation.x = -1.1;
  part(armL, box(0.5, 0.05, 0.36), black, -0.12, -0.98, 0.12);
  part(armL, box(0.44, 0.02, 0.3), glow(0x39d0d8, 0.9), -0.12, -0.95, 0.12, { shadow: false });

  const head = new THREE.Group();
  head.position.set(0, 2.32, 0);
  body.add(head);
  part(head, sph(0.42, 10, 8), skin);
  // bowl-cut fringe
  part(head, new THREE.SphereGeometry(0.45, 10, 6, 0, TAU, 0, PI * 0.5), M(0x2b1d14), 0, 0.0, -0.02, { rx: -0.2 });
  // big glasses
  for (const s of [-1, 1]) {
    part(head, torus(0.15, 0.03, 5, 12), black, 0.18 * s, 0.04, 0.38, { shadow: false });
    part(head, cyl(0.13, 0.13, 0.02, 12), glow(0xd8f3ff, 0.35), 0.18 * s, 0.04, 0.375, { rx: PI / 2, shadow: false });
    part(head, sph(0.04, 5, 4), black, 0.18 * s, 0.04, 0.395, { shadow: false });
  }
  part(head, box(0.1, 0.03, 0.03), black, 0, 0.05, 0.4, { shadow: false });
  part(head, box(0.16, 0.035, 0.04), M(0x8a3b2c), 0, -0.2, 0.39, { shadow: false });
  part(head, box(0.1, 0.05, 0.04), M(0xffffff), 0, -0.165, 0.395, { shadow: false }); // buck teeth
  // propeller beanie
  part(head, new THREE.SphereGeometry(0.4, 10, 5, 0, PI, 0, PI * 0.42), M(0xc2392b), 0, 0.12, 0);
  part(head, new THREE.SphereGeometry(0.4, 10, 5, PI, PI, 0, PI * 0.42), M(0x2b6fd6), 0, 0.12, 0);
  part(head, cyl(0.03, 0.03, 0.16, 5), M(0xf0b429), 0, 0.58, 0);
  const spin = new THREE.Group();
  spin.position.set(0, 0.67, 0);
  head.add(spin);
  part(spin, box(0.66, 0.03, 0.11), M(0xf0b429), 0, 0, 0);
  part(spin, sph(0.05, 5, 4), M(0xc2392b), 0, 0.02, 0);

  return { root, body, head, armR, armL, spin };
}

/* ───────────────────────── Trout the trout (combat sensei) ───────────────────────── */

export interface TroutModel {
  root: THREE.Group;
  swim: THREE.Group;
  body: THREE.Group;
  tail: THREE.Group;
  finL: THREE.Mesh;
  finR: THREE.Mesh;
  jaw: THREE.Mesh;
  bandL: THREE.Mesh;
  bandR: THREE.Mesh;
  ripples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[];
}

export function makeTrout(withRipples = true): TroutModel {
  const root = new THREE.Group();
  const swim = new THREE.Group();
  swim.position.y = 0.55;
  swim.rotation.x = -0.34;
  root.add(swim);

  const body = new THREE.Group();
  swim.add(body);

  const olive = M(0x2f7d69);
  const silver = M(0xeaf2ee);
  const rose = M(0xf0758d);
  const spot = M(0x183832);
  const fin = M(0xd97b54);
  const cloth = M(0xfbf3df);
  const red = M(0xc2392b);
  const black = M(0x15121a);

  // sleek rainbow-trout fuselage: olive back, silver belly, rosy lateral stripe, dark speckles
  part(body, sph(0.56, 12, 9), silver, 0, -0.04, 0.05, { sx: 0.72, sy: 0.94, sz: 1.95 });
  part(body, sph(0.54, 12, 8), olive, 0, 0.14, 0.04, { sx: 0.7, sy: 0.72, sz: 1.9 });
  for (const s of [-1, 1]) {
    part(body, box(0.08, 0.18, 1.55), rose, 0.37 * s, 0.02, 0.02, { ry: -0.05 * s, shadow: false });
    // classic trout spots
    for (const [sy, sz] of [
      [0.24, 0.42],
      [0.32, 0.18],
      [0.2, -0.06],
      [0.3, -0.3],
      [0.18, -0.52],
      [0.05, 0.28],
      [0.06, -0.18],
    ]) {
      part(body, sph(0.042, 5, 4), spot, 0.36 * s, sy, sz, { sx: 0.5, shadow: false });
    }
    // silvery gill cover
    part(body, sph(0.2, 7, 5), M(0xcfdcd6), 0.35 * s, -0.02, 0.58, { sx: 0.25, sy: 1.15, sz: 0.85, shadow: false });
    // expressive trout eyes + stern sensei eyebrows
    part(body, sph(0.115, 8, 6), M(0xffffff), 0.27 * s, 0.14, 0.84, { shadow: false });
    part(body, sph(0.062, 6, 5), black, 0.32 * s, 0.14, 0.9, { shadow: false });
    part(body, sph(0.025, 5, 4), M(0xffffff), 0.33 * s, 0.17, 0.94, { shadow: false });
    part(body, box(0.2, 0.055, 0.08), cloth, 0.28 * s, 0.28, 0.84, { rz: 0.32 * s, ry: 0.45 * s, shadow: false });
  }

  // upper snout + animated hooked trout lower jaw
  part(body, cone(0.32, 0.52, 8), olive, 0, 0.06, 1.08, { rx: PI / 2, sx: 0.78, sy: 1, sz: 0.8 });
  part(body, box(0.32, 0.07, 0.18), M(0x7a2b38), 0, -0.05, 1.06, { shadow: false });
  const jaw = part(body, cone(0.26, 0.44, 7), silver, 0, -0.13, 1.04, { rx: PI / 2 + 0.18, sx: 0.76, sz: 0.65 });

  // martial-arts sensei hachimaki headband around forehead
  part(body, torus(0.39, 0.058, 6, 14), cloth, 0, 0.27, 0.62, { rx: PI / 2 - 0.35, sx: 0.82, sy: 1.18 });
  part(body, cyl(0.095, 0.095, 0.05, 10), red, 0, 0.35, 1.02, { rx: PI / 2 - 0.2, shadow: false });
  const bandL = part(body, box(0.09, 0.04, 0.52), cloth, 0.34, 0.34, 0.24, { ry: 0.35, rx: 0.18 });
  const bandR = part(body, box(0.09, 0.04, 0.44), cloth, 0.4, 0.26, 0.28, { ry: 0.52, rx: -0.14 });

  // dorsal fin + small adipose fin
  part(body, cone(0.28, 0.48, 4), fin, 0, 0.62, -0.02, { sx: 0.22, sz: 1.5, rx: -0.35 });
  part(body, cone(0.11, 0.22, 4), olive, 0, 0.42, -0.62, { sx: 0.25, rx: -0.5 });

  // pectoral fins (double as expressive sensei flippers)
  const finL = part(body, cone(0.22, 0.56, 4), fin, 0.38, -0.2, 0.44, { rz: -1.15, rx: -0.35, sz: 0.32 });
  const finR = part(body, cone(0.22, 0.56, 4), fin, -0.38, -0.2, 0.44, { rz: 1.15, rx: -0.35, sz: 0.32 });
  // pelvic fins
  part(body, cone(0.14, 0.32, 4), fin, 0.18, -0.44, -0.18, { rz: -0.5, rx: -0.5, sz: 0.3 });
  part(body, cone(0.14, 0.32, 4), fin, -0.18, -0.44, -0.18, { rz: 0.5, rx: -0.5, sz: 0.3 });

  // hinged tail peduncle + forked caudal fin
  const tail = new THREE.Group();
  tail.position.set(0, 0.0, -0.88);
  body.add(tail);
  part(tail, cyl(0.15, 0.28, 0.52, 8), olive, 0, 0.02, -0.22, { rx: PI / 2, sx: 0.68 });
  part(tail, cone(0.26, 0.62, 4), fin, 0, 0.24, -0.66, { rx: -1.15, sx: 0.2 });
  part(tail, cone(0.26, 0.62, 4), fin, 0, -0.22, -0.66, { rx: -1.98, sx: 0.2 });

  const ripples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  if (withRipples) {
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.5, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 28).rotateX(-PI / 2), mat);
      mesh.position.y = 0.11;
      root.add(mesh);
      ripples.push({ mesh, mat });
    }
  }

  return { root, swim, body, tail, finL, finR, jaw, bandL, bandR, ripples };
}

/* ───────────────────────── Floating mini health bar (hogs & enemies) ───────────────────────── */

const HP_BG_GEO = new THREE.PlaneGeometry(1, 0.16);
const HP_FG_GEO = new THREE.PlaneGeometry(0.92, 0.1);
HP_FG_GEO.translate(0.46, 0, 0);
const HP_BG_MAT = new THREE.MeshBasicMaterial({ color: 0x1e1310, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const HP_PARENT_Q = new THREE.Quaternion();

export interface WorldHpBar {
  group: THREE.Group;
  fill: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

export function makeHpBar(width: number, y: number, color = 0x5ad669): WorldHpBar {
  const group = new THREE.Group();
  group.position.y = y;
  group.visible = false;
  group.userData.noAO = true;
  group.renderOrder = 12;
  const bg = new THREE.Mesh(HP_BG_GEO, HP_BG_MAT);
  bg.scale.x = width;
  bg.userData.noAO = true;
  bg.userData.sharedGeometry = true;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const fill = new THREE.Mesh(HP_FG_GEO, mat);
  fill.position.set(-width * 0.46, 0, 0.005);
  fill.scale.x = width;
  fill.userData.noAO = true;
  fill.userData.sharedGeometry = true;
  fill.renderOrder = 1;
  group.add(bg, fill);
  return { group, fill, mat };
}

export function updateHpBar(bar: WorldHpBar, hp: number, maxHp: number, camQ: THREE.Quaternion, alwaysShow = false, friendly = false) {
  const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  const show = hp > 0 && (alwaysShow || ratio < 0.995);
  bar.group.visible = show;
  if (!show) return;
  if (bar.group.parent) {
    HP_PARENT_Q.copy(bar.group.parent.quaternion).invert();
    bar.group.quaternion.copy(HP_PARENT_Q).multiply(camQ);
  } else {
    bar.group.quaternion.copy(camQ);
  }
  bar.fill.scale.x = Math.max(0.001, (bar.group.children[0] as THREE.Mesh).scale.x * ratio);
  if (friendly) {
    bar.mat.color.setHex(ratio > 0.55 ? 0x62e06a : ratio > 0.28 ? 0xf5bd2e : 0xef4438);
  } else {
    bar.mat.color.setHex(ratio > 0.45 ? 0xff7a24 : 0xff3b30);
  }
}

/* ───────────────────────── Kitchen enemy brigade (5 types) ───────────────────────── */

export interface EnemyModel {
  root: THREE.Group;
  /** Primary animated sub-part: lid (grill), bottle (spitter), lance (skewer), mallet arm (tenderizer), kettle body (bomber). */
  anim: THREE.Group;
  flash: THREE.MeshStandardMaterial;
  hp: WorldHpBar;
}

/** 1. Grillbot — fast snapping charcoal kettle rusher. */
export function makeGrillbot(): EnemyModel {
  const root = new THREE.Group();
  const blackM = M(0x26262b);
  const lidMat = unique(0xc8362b);
  part(root, new THREE.SphereGeometry(0.58, 16, 8, 0, TAU, PI / 2, PI / 2), blackM, 0, 0.95, 0);
  part(root, cyl(0.56, 0.56, 0.04, 10), glow(0xff7a1a, 1.4), 0, 0.93, 0, { shadow: false });
  const lid = new THREE.Group();
  lid.position.set(0, 0.96, -0.55);
  root.add(lid);
  part(lid, new THREE.SphereGeometry(0.6, 16, 8, 0, TAU, 0, PI / 2), lidMat, 0, 0, 0.55);
  part(lid, box(0.3, 0.08, 0.1), blackM, 0, 0.62, 0.55);
  part(lid, sph(0.09, 6, 5), glow(0xffe14d, 1.5), -0.2, 0.28, 1.06, { shadow: false });
  part(lid, sph(0.09, 6, 5), glow(0xffe14d, 1.5), 0.2, 0.28, 1.06, { shadow: false });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + PI / 6;
    part(root, cyl(0.04, 0.04, 0.8, 4), M(0x8d949c), Math.cos(a) * 0.4, 0.36, Math.sin(a) * 0.4, {
      rz: -Math.cos(a) * 0.3,
      rx: Math.sin(a) * 0.3,
    });
  }
  const hp = makeHpBar(1.15, 2.05, 0xff7a24);
  root.add(hp.group);
  return { root, anim: lid, flash: lidMat, hp };
}

/** 2. Sriracha Spitter — ranged hot-sauce bottle that squeezes out burning chili bombs. */
export function makeSpitter(): EnemyModel {
  const root = new THREE.Group();
  const bottleMat = unique(0xd9251d);
  bottleMat.roughness = 0.32;
  const greenCap = M(0x2ea844);
  const cream = M(0xfbf3df);
  const dark = M(0x231d1b);

  // stubby waddling feet
  part(root, box(0.28, 0.2, 0.46), dark, -0.24, 0.1, 0.06);
  part(root, box(0.28, 0.2, 0.46), dark, 0.24, 0.1, 0.06);
  part(root, cyl(0.07, 0.07, 0.38, 6), M(0x8d949c), -0.24, 0.32, 0);
  part(root, cyl(0.07, 0.07, 0.38, 6), M(0x8d949c), 0.24, 0.32, 0);

  const anim = new THREE.Group();
  anim.position.y = 0.46;
  root.add(anim);
  // bottle torso + cream chili label + neck + signature green sriracha nozzle
  part(anim, cyl(0.48, 0.52, 1.25, 12), bottleMat, 0, 0.62, 0);
  part(anim, cyl(0.5, 0.5, 0.48, 12), cream, 0, 0.56, 0);
  part(anim, cone(0.14, 0.34, 6), M(0xd9251d), 0, 0.54, 0.5, { rz: 0.55, shadow: false });
  part(anim, new THREE.SphereGeometry(0.48, 14, 8, 0, TAU, 0, PI / 2), bottleMat, 0, 1.24, 0);
  // iconic bright-green rooster-sauce twist nozzle tilted slightly forward
  part(anim, cyl(0.2, 0.24, 0.2, 10), greenCap, 0, 1.72, 0.04);
  part(anim, cone(0.17, 0.55, 10), greenCap, 0, 2.08, 0.16, { rx: 0.34 });
  part(anim, sph(0.08, 6, 5), glow(0xff4a1a, 1.5), 0, 2.34, 0.25, { shadow: false });
  // fierce slanted eyes
  for (const s of [-1, 1]) {
    part(anim, sph(0.1, 7, 5), glow(0xffe14d, 1.4), 0.2 * s, 1.04, 0.44, { shadow: false });
    part(anim, box(0.22, 0.055, 0.06), dark, 0.2 * s, 1.15, 0.46, { rz: 0.38 * s, shadow: false });
  }
  const hp = makeHpBar(1.2, 3.15, 0xff5a24);
  root.add(hp.group);
  return { root, anim, flash: bottleMat, hp };
}

/** 3. Skewer Hound — sleek low yakitori charger that locks on and lunges with glowing skewers. */
export function makeSkewerHound(): EnemyModel {
  const root = new THREE.Group();
  const bodyMat = unique(0x464e59);
  bodyMat.metalness = 0.65;
  bodyMat.roughness = 0.36;
  const trim = M(0xc8362b);
  const dark = M(0x1f2026);

  // sleek crouched chassis
  part(root, box(0.86, 0.46, 1.28), bodyMat, 0, 0.66, -0.05);
  part(root, box(0.92, 0.12, 0.9), trim, 0, 0.9, -0.1);
  // glowing crimson visor eyes
  part(root, box(0.66, 0.13, 0.1), glow(0xff2e2e, 1.7), 0, 0.74, 0.58, { shadow: false });
  // exhaust tail fin
  part(root, cone(0.2, 0.45, 5), glow(0xff8a24, 1.3), 0, 0.72, -0.82, { rx: -PI / 2, shadow: false });
  // 4 angled blade legs
  for (const [lx, lz] of [
    [0.44, 0.4],
    [-0.44, 0.4],
    [0.44, -0.45],
    [-0.44, -0.45],
  ]) {
    part(root, box(0.12, 0.56, 0.18), dark, lx, 0.3, lz, { rz: lx > 0 ? -0.2 : 0.2 });
  }

  // retractable twin yakitori skewer lance
  const anim = new THREE.Group();
  anim.position.set(0, 0.6, 0.55);
  root.add(anim);
  for (const s of [-1, 1]) {
    part(anim, cyl(0.022, 0.045, 1.45, 6), M(0xd9dee6), 0.18 * s, 0, 0.68, { rx: PI / 2 });
    part(anim, sph(0.11, 6, 5), M(0x8a4224), 0.18 * s, 0, 0.42, { sz: 1.2 });
    part(anim, sph(0.1, 6, 5), M(0x4f9a3d), 0.18 * s, 0, 0.68, { sz: 0.8 });
    part(anim, cone(0.06, 0.26, 6), glow(0xffb84d, 1.5), 0.18 * s, 0, 1.42, { rx: PI / 2, shadow: false });
  }
  const hp = makeHpBar(1.25, 1.65, 0xff7a24);
  root.add(hp.group);
  return { root, anim, flash: bodyMat, hp };
}

/** 4. Tenderizer Brute — heavy armored butcher-block sous-chef with a giant meat mallet. */
export function makeTenderizer(): EnemyModel {
  const root = new THREE.Group();
  const blockMat = unique(0xc6935a);
  const steel = M(0xd9dee6);
  const dark = M(0x26262b);
  const white = M(0xf8f6f0);
  const red = M(0xc2392b);

  // heavy boots + armored apron torso
  for (const s of [-1, 1]) {
    part(root, cyl(0.24, 0.22, 0.72, 8), dark, 0.36 * s, 0.42, 0);
    part(root, box(0.4, 0.22, 0.62), dark, 0.36 * s, 0.11, 0.1);
  }
  part(root, box(1.36, 1.38, 0.92), blockMat, 0, 1.38, 0);
  // steel bands + butcher apron + red chef scarf
  part(root, box(1.42, 0.14, 0.98), steel, 0, 0.88, 0);
  part(root, box(1.42, 0.14, 0.98), steel, 0, 1.92, 0);
  part(root, box(1.02, 1.05, 0.08), white, 0, 1.26, 0.47);
  part(root, torus(0.46, 0.09, 6, 12), red, 0, 2.08, 0.08, { rx: PI / 2 });
  // stern glowing eyes + tall chef toque hat
  for (const s of [-1, 1]) {
    part(root, sph(0.11, 7, 5), glow(0xffb830, 1.6), 0.26 * s, 1.72, 0.47, { shadow: false });
    part(root, box(0.28, 0.07, 0.08), dark, 0.26 * s, 1.84, 0.49, { rz: 0.3 * s, shadow: false });
  }
  part(root, cyl(0.48, 0.46, 0.55, 12), white, 0, 2.36, 0);
  part(root, sph(0.58, 12, 8), white, 0, 2.78, 0, { sy: 0.68 });
  // left shield pauldron arm
  part(root, cyl(0.2, 0.18, 0.95, 8), steel, 0.86, 1.45, 0.05, { rz: 0.2 });

  // right mallet arm (animated windup + slam)
  const anim = new THREE.Group();
  anim.position.set(-0.88, 1.88, 0);
  anim.rotation.x = -0.85;
  root.add(anim);
  part(anim, cyl(0.22, 0.19, 0.95, 8), steel, 0, -0.45, 0);
  part(anim, cyl(0.075, 0.075, 1.85, 7), M(0x7a4e2d), 0, -1.55, 0.1);
  // giant meat-tenderizer hammer head with glowing hot face
  part(anim, cyl(0.38, 0.38, 0.92, 10), steel, 0, -2.42, 0.1, { rx: PI / 2 });
  part(anim, cyl(0.34, 0.34, 0.06, 10), glow(0xff6a1a, 1.2), 0, -2.42, 0.58, { rx: PI / 2, shadow: false });

  const hp = makeHpBar(1.65, 3.55, 0xff5a24);
  root.add(hp.group);
  return { root, anim, flash: blockMat, hp };
}

/** 5. Kettle Bomber — frantic copper pressure-cooker that sprints in, hisses red, and explodes! */
export function makeBomber(): EnemyModel {
  const root = new THREE.Group();
  const copper = unique(0xd46b34);
  copper.metalness = 0.6;
  copper.roughness = 0.34;
  const dark = M(0x232328);
  const steel = M(0xd9dee6);

  // fast little wind-up legs
  part(root, box(0.24, 0.36, 0.32), dark, -0.26, 0.2, 0);
  part(root, box(0.24, 0.36, 0.32), dark, 0.26, 0.2, 0);

  const anim = new THREE.Group();
  anim.position.y = 0.42;
  root.add(anim);
  // round copper pressure pot + locking lid + handles + pressure gauge + glowing red fuse valve
  part(anim, cyl(0.56, 0.5, 0.92, 12), copper, 0, 0.48, 0);
  part(anim, torus(0.57, 0.06, 6, 14), dark, 0, 0.92, 0, { rx: PI / 2 });
  part(anim, new THREE.SphereGeometry(0.56, 12, 7, 0, TAU, 0, PI * 0.42), steel, 0, 0.9, 0);
  part(anim, box(0.24, 0.1, 0.14), dark, -0.66, 0.72, 0);
  part(anim, box(0.24, 0.1, 0.14), dark, 0.66, 0.72, 0);
  // front pressure gauge + manic glowing eyes
  part(anim, cyl(0.18, 0.18, 0.08, 10), M(0xfbf3df), 0, 0.42, 0.53, { rx: PI / 2, shadow: false });
  part(anim, box(0.03, 0.13, 0.03), M(0xd9251d), 0.03, 0.45, 0.58, { rz: -0.6, shadow: false });
  part(anim, sph(0.085, 6, 5), glow(0xff2e1f, 1.8), -0.22, 0.72, 0.52, { shadow: false });
  part(anim, sph(0.085, 6, 5), glow(0xff2e1f, 1.8), 0.22, 0.72, 0.52, { shadow: false });
  // whistling red steam valve on top
  part(anim, cyl(0.08, 0.1, 0.24, 8), dark, 0, 1.24, 0);
  part(anim, sph(0.19, 8, 6), glow(0xff2e1f, 2.0), 0, 1.44, 0, { shadow: false });

  const hp = makeHpBar(1.2, 2.35, 0xff3b30);
  root.add(hp.group);
  return { root, anim, flash: copper, hp };
}

/** Sizzling red chili-sauce glob lobbed by Sriracha Spitters. */
export function makeChiliGlob(): THREE.Group {
  const g = new THREE.Group();
  part(g, sph(0.32, 8, 6), glow(0xff3818, 1.5), 0, 0, 0, { shadow: false });
  part(g, cone(0.22, 0.5, 6), glow(0xff9a24, 1.2), 0, 0, -0.32, { rx: -PI / 2, shadow: false });
  return g;
}

/** Small red bandana & wildflower tribute left briefly where a rebel hog falls in battle. */
export function makeHogMemorial(): THREE.Group {
  const g = new THREE.Group();
  const wood = M(0x7a5234);
  part(g, cyl(0.04, 0.05, 1.15, 6), wood, 0, 0.56, 0, { rz: 0.08 });
  part(g, torus(0.1, 0.045, 5, 10), M(0xc2392b), 0, 0.88, 0, { rx: PI / 2 });
  part(g, cone(0.13, 0.45, 4), M(0xc2392b), 0.22, 0.82, 0.04, { rz: -1.25 });
  part(g, cone(0.1, 0.36, 4), M(0xc2392b), 0.18, 0.7, 0.08, { rz: -1.45 });
  part(g, sph(0.1, 6, 5), glow(0xffe169, 0.8), 0.18, 0.14, 0.16, { shadow: false });
  return g;
}

/* ───────────────────────── Pickups, projectiles, turret ───────────────────────── */

export interface PotModel {
  root: THREE.Group;
  body: THREE.Group;
  beam: THREE.Mesh;
  sauce: THREE.MeshStandardMaterial;
}

/** Onggi-style sauce jar that powers Allen's Sauce Shield. */
export function makeSaucePot(): PotModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const clay = M(0x8a5231);
  const dark = M(0x5a3220);
  const sauce = new THREE.MeshStandardMaterial({ color: 0xe5392b, emissive: 0xff4a1a, emissiveIntensity: 1.2, roughness: 0.5, flatShading: false });
  part(body, cyl(0.5, 0.62, 0.18, 10), dark, 0, 0.09, 0);
  part(body, sph(0.9, 10, 8), clay, 0, 0.86, 0, { sy: 0.92 });
  part(body, torus(0.9, 0.05, 5, 14), dark, 0, 0.86, 0, { rx: PI / 2 });
  part(body, cyl(0.56, 0.68, 0.3, 10), dark, 0, 1.62, 0);
  part(body, cyl(0.52, 0.52, 0.08, 10), sauce, 0, 1.78, 0, { shadow: false });
  for (const [bx, bz, br] of [
    [0.18, 0.1, 0.14],
    [-0.2, -0.08, 0.11],
    [0.02, -0.24, 0.09],
  ]) {
    part(body, sph(br, 6, 5), sauce, bx, 1.86, bz, { shadow: false });
  }
  // painted chili emblem
  part(body, cone(0.15, 0.5, 5), M(0xd9352b), 0, 0.92, 0.9, { rz: 0.5, shadow: false });
  part(body, cyl(0.03, 0.03, 0.16, 4), M(0x4f9a3d), -0.13, 1.16, 0.9, { rz: 0.5, shadow: false });
  // beacon so jars can be spotted from across the farm
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.34, 24, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
  );
  pillar.position.y = 13.8;
  root.add(pillar);
  // sauce tether that feeds the shield (stretched toward Allen every frame)
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 1),
    new THREE.MeshBasicMaterial({ color: 0xff8a2e, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  root.add(beam);
  return { root, body, beam, sauce };
}

export function makeTruffle(): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.IcosahedronGeometry(0.3, 0), M(0x6b4a2e), 0, 0, 0, { sy: 0.85 });
  part(g, torus(0.44, 0.035, 4, 16), glow(0xffc93c, 1.3), 0, 0, 0, { rx: PI / 2, shadow: false });
  return g;
}

export function makeChopsticks(): THREE.Group {
  const g = new THREE.Group();
  const m = glow(0xffb057, 0.55);
  part(g, box(0.12, 0.12, 2.0), m, -0.14, 0, 0, { ry: 0.05 });
  part(g, box(0.12, 0.12, 2.0), m, 0.14, 0, 0, { ry: -0.05 });
  return g;
}

export interface TurretModel {
  root: THREE.Group;
  head: THREE.Group;
}

export function makeTurret(): TurretModel {
  const root = new THREE.Group();
  const wood = M(0x8a5a3a);
  const metal = M(0x8d949c);
  part(root, cyl(0.5, 0.65, 0.3, 8), metal, 0, 0.15, 0);
  part(root, cyl(0.12, 0.12, 1.8, 6), wood, 0, 1.1, 0);
  part(root, box(1.7, 0.12, 0.12), wood, 0, 1.6, 0);
  part(root, box(0.9, 0.7, 0.4), M(0x3d5f94), 0, 1.5, 0);
  const head = new THREE.Group();
  head.position.set(0, 2.25, 0);
  root.add(head);
  part(head, box(0.7, 0.55, 0.6), metal, 0, 0, 0);
  part(head, cyl(0.16, 0.2, 1.1, 8), M(0xf2c230), 0, 0, 0.75, { rx: PI / 2 });
  part(head, cyl(0.22, 0.22, 0.12, 8), M(0x5c9a3a), 0, 0, 0.3, { rx: PI / 2 });
  part(head, sph(0.07, 6, 4), glow(0x39d0d8, 1.4), -0.18, 0.1, 0.31, { shadow: false });
  part(head, sph(0.07, 6, 4), glow(0x39d0d8, 1.4), 0.18, 0.1, 0.31, { shadow: false });
  part(head, cyl(0.6, 0.6, 0.05, 12), M(0xe6c468), 0, 0.3, 0);
  part(head, cyl(0.3, 0.34, 0.26, 10), M(0xe6c468), 0, 0.45, 0);
  return { root, head };
}
