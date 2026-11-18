import * as THREE from 'three';
import { M, glow, box, sph, cyl, cone, torus, part } from './models';
import { blobGeo, buildGrass, groundMaterial, pineGeo, planked, rockGeo, shingled, waterMaterial, worldCircle, worldUV } from './nature';

const PI = Math.PI;
const TAU = PI * 2;

export { BOUND, SPOT, isOnLakeDock, type Collider } from './layout';
import { SPOT, isOnLakeDock, type Collider } from './layout';

export interface Edible {
  id: string;
  name: string;
  x: number;
  z: number;
  /** How far from the centre Allen stands while eating. */
  r: number;
  hp: number;
  maxHp: number;
  pieces: THREE.Object3D[];
  collider?: Collider;
  shown: number;
  crumb: number;
}

export interface MapFeature {
  kind: 'c' | 'b';
  x: number;
  z: number;
  r: number;
  hx: number;
  hz: number;
  color: string;
}

export interface World {
  group: THREE.Group;
  colliders: Collider[];
  edibles: Edible[];
  features: MapFeature[];
  bellPivot: THREE.Group;
  dummyPivot: THREE.Group;
  windowMat: THREE.MeshStandardMaterial;
  cloudMat: THREE.MeshStandardMaterial;
  grass: THREE.InstancedMesh;
  update(time: number, dt: number, scare: { x: number; z: number }[]): void;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function signTexture(text: string, aspect: number, fg: string, bg: string | null, sub?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.max(64, Math.round(1024 / aspect));
  const x = c.getContext('2d');
  if (x) {
    if (bg) {
      x.fillStyle = bg;
      x.fillRect(0, 0, c.width, c.height);
      x.strokeStyle = fg;
      x.lineWidth = c.height * 0.05;
      x.strokeRect(c.height * 0.06, c.height * 0.06, c.width - c.height * 0.12, c.height * 0.88);
    }
    x.fillStyle = fg;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const family = '"Bowlby One", "Arial Black", Impact, sans-serif';
    let size = c.height * (sub ? 0.46 : 0.58);
    x.font = `${size}px ${family}`;
    while (x.measureText(text).width > c.width * 0.86 && size > 10) {
      size *= 0.94;
      x.font = `${size}px ${family}`;
    }
    x.fillText(text, c.width / 2, c.height * (sub ? 0.4 : 0.53));
    if (sub) {
      x.font = `${c.height * 0.2}px ${family}`;
      x.fillText(sub, c.width / 2, c.height * 0.77);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildWorld(): World {
  const g = new THREE.Group();
  const colliders: Collider[] = [];
  const features: MapFeature[] = [];
  const edibles: Edible[] = [];
  const rnd = mulberry32(1987);
  const rr = (a: number, b: number) => a + rnd() * (b - a);

  const circ = (x: number, z: number, r: number, color?: string, h = 3): Collider => {
    const c: Collider = { kind: 'c', x, z, r, hx: 0, hz: 0, h, enabled: true };
    colliders.push(c);
    if (color) features.push({ kind: 'c', x, z, r, hx: 0, hz: 0, color });
    return c;
  };
  const rect = (x: number, z: number, hx: number, hz: number, color?: string, h = 3): Collider => {
    const c: Collider = { kind: 'b', x, z, r: 0, hx, hz, h, enabled: true };
    colliders.push(c);
    if (color) features.push({ kind: 'b', x, z, r: 0, hx, hz, color });
    return c;
  };
  const feat = (kind: 'c' | 'b', x: number, z: number, a: number, b: number, color: string) =>
    features.push({ kind, x, z, r: a, hx: a, hz: b, color });

  /* ── ground decals ── */
  /** Paths, plots, sand and anything else that grass should not grow through. */
  const noGrass: { c: boolean; x: number; z: number; a: number; b: number }[] = [];
  const decalMats = new Map<string, THREE.MeshStandardMaterial>();
  const decalMat = (color: number, layer: number) => {
    const key = color + ':' + layer;
    let m = decalMats.get(key);
    if (!m) {
      m = groundMaterial(color, layer);
      decalMats.set(key, m);
    }
    return m;
  };
  const decalRect = (x: number, z: number, w: number, d: number, color: number, layer = 1, rot = 0) => {
    const geo = new THREE.PlaneGeometry(w, d);
    worldUV(geo, x, z, 9, rot);
    if (layer >= 3) noGrass.push({ c: false, x, z, a: w / 2 + 0.25, b: d / 2 + 0.25 });
    const m = new THREE.Mesh(geo, decalMat(color, layer));
    m.rotation.set(-PI / 2, 0, rot);
    m.position.set(x, 0.015 * layer, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const decalCircle = (x: number, z: number, r: number, color: number, layer = 1, seg = 28) => {
    const geo = new THREE.CircleGeometry(r, Math.max(seg, 40));
    worldUV(geo, x, z, 9);
    if (layer >= 3) noGrass.push({ c: true, x, z, a: r + 0.2, b: 0 });
    const m = new THREE.Mesh(geo, decalMat(color, layer));
    m.rotation.x = -PI / 2;
    m.position.set(x, 0.015 * layer, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const groundGeo = new THREE.PlaneGeometry(700, 700);
  worldUV(groundGeo, 0, 0, 9);
  const ground = new THREE.Mesh(groundGeo, groundMaterial(0x79ab4b, 0));
  ground.rotation.x = -PI / 2;
  ground.receiveShadow = true;
  g.add(ground);
  decalRect(0, 0, 112, 112, 0x8cc05a, 1);
  // mown patches for a bit of texture
  for (let i = 0; i < 26; i++) decalCircle(rr(-52, 52), rr(-52, 52), rr(3, 8), i % 2 ? 0x97c965 : 0x82b653, 2, 9);

  // dirt paths
  const DIRT = 0xd7b684;
  decalRect(0, 14.5, 5, 83, DIRT, 3);
  decalRect(0, 90, 6, 70, DIRT, 3);
  decalRect(-1, -27, 62, 4.5, DIRT, 3);
  decalRect(17, 21, 34, 3.5, DIRT, 3);
  decalRect(-13.8, 31.2, 28, 3.3, DIRT, 3);
  decalRect(-27.2, 34.9, 3.3, 8.2, DIRT, 3);
  decalCircle(-27.2, 38.5, 3.6, DIRT, 3, 14);
  decalCircle(0, -6, 5, DIRT, 3, 16);
  decalCircle(-30, -27, 6, DIRT, 3, 12);
  decalCircle(28, -28, 5, DIRT, 3, 12);

  /* ── instanced grass + flowers ── */
  {
    const n = 420;
    const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.55, 4), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: false }), n);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    const greens = [0x6fa843, 0x7fb84d, 0x5f9a3c, 0x9acb62];
    const inWetSpot = (x: number, z: number) =>
      Math.hypot(x + 41, z - 41) < 12.6 ||
      Math.hypot(x + 47.2, z - 34.4) < 7.1 ||
      Math.hypot(x + 35.2, z - 47.4) < 7.1 ||
      isOnLakeDock(x, z) ||
      Math.hypot(x - SPOT.mud.x, z - SPOT.mud.z) < SPOT.mud.r + 1.0 ||
      Math.hypot(x - SPOT.dummy.x, z - SPOT.dummy.z) < 3.1;
    for (let i = 0; i < n; i++) {
      let x = rr(-54, 54);
      let z = rr(-54, 54);
      if (Math.abs(x) < 3.2) x += x < 0 ? -4 : 4;
      if (inWetSpot(x, z)) {
        x = -x;
        z = -z;
      }
      d.position.set(x, 0.25, z);
      d.rotation.set(rr(-0.2, 0.2), rr(0, TAU), rr(-0.2, 0.2));
      const s = rr(0.6, 1.15);
      d.scale.set(s, s * rr(0.8, 1.3), s);
      d.updateMatrix();
      tuft.setMatrixAt(i, d.matrix);
      tuft.setColorAt(i, col.setHex(greens[i % greens.length]));
    }
    tuft.receiveShadow = true;
    tuft.visible = false; // replaced by the wind-swept grass built at the end

    const fn = 150;
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: false }), fn);
    const cols = [0xffffff, 0xffd84d, 0xff9ec4, 0xb59cff, 0xff7a59];
    for (let i = 0; i < fn; i++) {
      let x = rr(-54, 54);
      let z = rr(-54, 54);
      if (Math.abs(x) < 3.2) x += x < 0 ? -4 : 4;
      if (inWetSpot(x, z)) {
        x = -x;
        z = -z;
      }
      d.position.set(x, 0.44, z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(rr(0.8, 1.4));
      d.updateMatrix();
      fl.setMatrixAt(i, d.matrix);
      fl.setColorAt(i, col.setHex(cols[i % cols.length]));
    }
    g.add(fl);
  }

  /* ── perimeter fence + gate ── */
  {
    const F = 56;
    const posts: [number, number][] = [];
    for (let i = -F; i <= F; i += 4) {
      posts.push([i, -F], [-F, i]);
      if (i < 35 || i > 47) posts.push([F, i]);
      if (Math.abs(i) > 7) posts.push([i, F]);
    }
    const pm = new THREE.InstancedMesh(box(0.34, 1.6, 0.34), M(0xefe6d2), posts.length);
    const d = new THREE.Object3D();
    posts.forEach(([x, z], i) => {
      d.position.set(x, 0.8, z);
      d.updateMatrix();
      pm.setMatrixAt(i, d.matrix);
    });
    pm.castShadow = true;
    pm.receiveShadow = true;
    g.add(pm);
    const rail = M(0xe6dcc6);
    for (const y of [0.55, 1.15]) {
      part(g, box(112, 0.16, 0.1), rail, 0, y, -F);
      part(g, box(0.1, 0.16, 112), rail, -F, y, 0);
      part(g, box(0.1, 0.16, 91), rail, F, y, -10.5);
      part(g, box(0.1, 0.16, 9), rail, F, y, 51.5);
      part(g, box(49, 0.16, 0.1), rail, -31.5, y, F);
      part(g, box(49, 0.16, 0.1), rail, 31.5, y, F);
    }
    // gate arch
    const wood = M(0x6b4226);
    part(g, box(0.8, 8, 0.8), wood, -6.8, 4, F);
    part(g, box(0.8, 8, 0.8), wood, 6.8, 4, F);
    part(g, box(15.6, 0.7, 0.8), wood, 0, 7.8, F);
    circ(-6.8, F, 0.8, undefined, 8);
    circ(6.8, F, 0.8, undefined, 8);
    const tex = signTexture('BORPSE BRY SISTERS', 5.2, '#2a1a12', '#fbf3df', '· FAMILY FARM ·');
    const sm = new THREE.MeshStandardMaterial({ roughness: 0.85, map: tex });
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.1), sm);
    s1.position.set(0, 6.3, F + 0.1);
    g.add(s1);
    const s2 = s1.clone();
    s2.rotation.y = PI;
    s2.position.z = F - 0.1;
    g.add(s2);
    part(g, box(11.3, 2.4, 0.12), wood, 0, 6.3, F);
    // lanterns
    part(g, sph(0.32, 8, 6), glow(0xffd98a, 1.6), -6.8, 8.35, F, { shadow: false });
    part(g, sph(0.32, 8, 6), glow(0xffd98a, 1.6), 6.8, 8.35, F, { shadow: false });
  }

  /* ── helpers for buildings ── */
  const extrudeWall = (pts: [number, number][], depth: number, material: THREE.Material) => {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    const m = new THREE.Mesh(geo, planked(material));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const roofSlabs = (parent: THREE.Object3D, pts: [number, number][], depth: number, material: THREE.Material, thick = 0.4) => {
    const roofMat = shingled(material);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      part(parent, box(len + 0.3, thick, depth), roofMat, (ax + bx) / 2, (ay + by) / 2 + thick / 2, 0, { rz: Math.atan2(by - ay, bx - ax) });
    }
  };

  const windowMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc24d, emissiveIntensity: 0.25, roughness: 0.6 });
  const white = M(0xf7f1e3);

  /* ── barn ── */
  {
    const b = new THREE.Group();
    b.position.set(-30, 0, -36);
    g.add(b);
    const red = M(0xa83a2e);
    b.add(extrudeWall([[-9, 0], [-9, 8], [-6, 11], [0, 13], [6, 11], [9, 8], [9, 0]], 14, red));
    roofSlabs(b, [[-9.9, 7.1], [-6, 11], [0, 13], [6, 11], [9.9, 7.1]], 15.4, M(0x4a3f3a));
    // big doors
    part(b, box(6.6, 6, 0.2), white, 0, 3, 7.02);
    part(b, box(2.9, 5.4, 0.24), M(0x7d261d), -1.55, 2.8, 7.06);
    part(b, box(2.9, 5.4, 0.24), M(0x7d261d), 1.55, 2.8, 7.06);
    for (const s of [-1, 1]) {
      part(b, box(0.22, 5.9, 0.08), white, 1.55 * s, 2.8, 7.2, { rz: 0.5 * s });
      part(b, box(0.22, 5.9, 0.08), white, 1.55 * s, 2.8, 7.2, { rz: -0.5 * s });
    }
    // hayloft window + trim
    part(b, box(2.4, 2.0, 0.2), white, 0, 9.6, 7.02);
    part(b, box(1.9, 1.5, 0.24), M(0x2a1a12), 0, 9.6, 7.05);
    part(b, box(0.3, 8, 0.3), white, -9, 4, 7);
    part(b, box(0.3, 8, 0.3), white, 9, 4, 7);
    const tex = signTexture("RICKLEY'S BARN", 6, '#fbf3df', null);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 1.3), new THREE.MeshStandardMaterial({ roughness: 0.85, map: tex, transparent: true }));
    sm.position.set(0, 7.1, 7.14);
    b.add(sm);
    rect(-30, -36, 9, 7, '#a83a2e', 13);
    // silo
    part(g, cyl(3.4, 3.4, 13, 12), M(0xd3d8dc), -45, 6.5, -37);
    part(g, new THREE.SphereGeometry(3.45, 12, 6, 0, TAU, 0, PI / 2), M(0x9aa4ad), -45, 13, -37);
    for (const y of [3, 7, 11]) part(g, cyl(3.48, 3.48, 0.25, 12), M(0x9aa4ad), -45, y, -37);
    circ(-45, -37, 3.6, '#c9ced2', 15);
  }

  /* ── farmhouse ── */
  {
    const h = new THREE.Group();
    h.position.set(28, 0, -38);
    g.add(h);
    h.add(extrudeWall([[-7, 0], [-7, 6], [0, 10], [7, 6], [7, 0]], 11, M(0xf2e3c6)));
    roofSlabs(h, [[-8, 5.43], [0, 10], [8, 5.43]], 12.4, M(0x3f6b7a));
    part(h, box(1.3, 3.2, 1.3), M(0x9c4a3a), 4, 8.8, -2);
    part(h, box(1.8, 3.2, 0.2), M(0x8a3b2c), 0, 1.6, 5.55);
    part(h, sph(0.1, 6, 4), M(0xf0b429), 0.6, 1.6, 5.7, { shadow: false });
    for (const s of [-1, 1]) {
      part(h, box(2.3, 2.1, 0.16), white, 4.2 * s, 3.4, 5.52);
      part(h, box(1.9, 1.7, 0.2), windowMat, 4.2 * s, 3.4, 5.54, { shadow: false });
      part(h, box(0.16, 2.1, 2.3), white, 7.02 * s, 3.4, -1);
      part(h, box(0.2, 1.7, 1.9), windowMat, 7.04 * s, 3.4, -1, { shadow: false });
      part(h, box(0.3, 3.5, 0.3), white, 3.9 * s, 1.75, 8);
      // flower boxes
      part(h, box(2.3, 0.4, 0.5), M(0x8a5a3a), 4.2 * s, 2.2, 5.8);
      for (let i = 0; i < 4; i++) part(h, sph(0.2, 5, 4), M([0xff9ec4, 0xffd84d, 0xff7a59][i % 3]), 4.2 * s - 0.8 + i * 0.52, 2.55, 5.8, { shadow: false });
    }
    part(h, cyl(0.8, 0.8, 0.16, 12), white, 0, 7.6, 5.52, { rx: PI / 2 });
    part(h, cyl(0.62, 0.62, 0.2, 12), windowMat, 0, 7.6, 5.54, { rx: PI / 2, shadow: false });
    part(h, box(9, 0.3, 3), M(0xbfa37a), 0, 0.15, 7);
    part(h, box(9.6, 0.25, 3.4), M(0x3f6b7a), 0, 3.7, 7.1, { rx: 0.14 });
    rect(28, -38, 7, 5.5, '#e9d7b3', 10);
    rect(28, -31, 4.5, 1.5, undefined, 4);
  }

  /* ── windmill ── */
  const windHub = new THREE.Group();
  {
    const w = new THREE.Group();
    w.position.set(46, 0, -12);
    w.rotation.y = -PI / 2;
    g.add(w);
    part(w, cyl(1.5, 3.0, 12, 8), M(0xe9dcc0), 0, 6, 0);
    part(w, cone(2.2, 2.6, 8), M(0x8c4a3a), 0, 13.3, 0);
    part(w, box(1.2, 2.4, 0.2), M(0x6b4226), 0, 1.2, 2.86);
    part(w, box(0.9, 0.9, 0.2), windowMat, 0, 6.5, 2.2, { shadow: false });
    windHub.position.set(0, 11.2, 2.3);
    w.add(windHub);
    part(windHub, cyl(0.35, 0.35, 0.8, 8), M(0x6b4226), 0, 0, 0, { rx: PI / 2 });
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Group();
      blade.rotation.z = (i * PI) / 2;
      windHub.add(blade);
      part(blade, box(0.18, 6.6, 0.12), M(0x6b4226), 0, 3.4, 0.3);
      part(blade, box(1.3, 5.2, 0.06), M(0xf7f1e3), 0.7, 4, 0.3);
    }
    circ(46, -12, 3.3, '#d9ccb0', 14);
  }

  /* ── Kingger Labs ── */
  const dish = new THREE.Group();
  const beacon = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 1 });
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x39d0d8, emissive: 0x39d0d8, emissiveIntensity: 1 });
  {
    const l = new THREE.Group();
    l.position.set(41, 0, 24);
    g.add(l);
    part(l, box(10, 5, 8), M(0x5f7384), 0, 2.5, 0);
    for (let i = -4; i <= 4; i += 1) part(l, box(0.08, 5, 8.04), M(0x54677a), i, 2.5, 0, { shadow: false });
    part(l, box(11, 0.4, 9), M(0x2f3b46), 0, 5.3, 0, { rz: 0.06 });
    // roll-up door facing the farm
    part(l, box(0.2, 3.8, 5), M(0xc9d3dc), -5.04, 1.9, 0);
    for (let y = 0.5; y < 3.8; y += 0.55) part(l, box(0.24, 0.06, 5), M(0x9fb0bf), -5.05, y, 0, { shadow: false });
    const tex = signTexture('KINGGER LABS', 5.5, '#7df9ff', '#0e1a2b');
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.0), new THREE.MeshStandardMaterial({ roughness: 0.85, map: tex }));
    sm.rotation.y = -PI / 2;
    sm.position.set(-5.08, 4.4, 0);
    l.add(sm);
    // dish
    dish.position.set(2.5, 5.6, -1.5);
    l.add(dish);
    part(dish, cyl(0.1, 0.1, 1.2, 5), M(0x8d949c), 0, 0.6, 0);
    part(dish, new THREE.SphereGeometry(1.2, 10, 5, 0, TAU, 0, PI / 2.6), M(0xf1f4f8), 0, 1.5, 0.5, { rx: PI + 0.9 });
    // antenna + beacon
    part(l, cyl(0.06, 0.06, 4, 4), M(0x8d949c), -3, 7.4, 2.5);
    part(l, sph(0.2, 6, 5), beacon, -3, 9.5, 2.5, { shadow: false });
    // tesla coil out front
    part(l, cyl(0.5, 0.7, 0.5, 8), M(0x2f3b46), -7.5, 0.25, 5.5);
    part(l, cyl(0.16, 0.16, 2.6, 6), M(0xb87333), -7.5, 1.8, 5.5);
    part(l, torus(0.55, 0.2, 6, 12), coilMat, -7.5, 3.2, 5.5, { rx: PI / 2, shadow: false });
    // solar panel + crates
    part(l, box(3.2, 0.12, 2), M(0x243b63), -1, 1.3, -5.6, { rx: -0.7 });
    part(l, box(0.15, 1.2, 0.15), M(0x8d949c), -1, 0.6, -5.3);
    part(l, box(1.2, 1.2, 1.2), M(0xb8925a), -6.6, 0.6, -4.6, { ry: 0.3 });
    part(l, box(0.9, 0.9, 0.9), M(0xa27d48), -6.4, 1.65, -4.5, { ry: -0.2 });
    rect(41, 24, 5, 4, '#5f7384', 6);
    circ(33.5, 29.5, 0.9);
    circ(34.5, 19.4, 0.9);
  }

  /* ── dinner bell ── */
  const bellPivot = new THREE.Group();
  {
    const bx = SPOT.bell.x;
    const bz = SPOT.bell.z;
    const wood = M(0x6b4226);
    part(g, cyl(1.7, 1.9, 0.3, 10), M(0xb9b2a5), bx, 0.15, bz);
    part(g, box(0.3, 3.8, 0.3), wood, bx - 1.1, 1.9, bz);
    part(g, box(0.3, 3.8, 0.3), wood, bx + 1.1, 1.9, bz);
    part(g, box(3.0, 0.3, 0.4), wood, bx, 3.8, bz);
    bellPivot.position.set(bx, 3.65, bz);
    g.add(bellPivot);
    const brass = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.35, metalness: 0.6, flatShading: false });
    part(bellPivot, cyl(0.22, 0.68, 0.9, 10), brass, 0, -0.6, 0);
    part(bellPivot, sph(0.24, 8, 6), brass, 0, -0.15, 0);
    part(bellPivot, sph(0.14, 6, 5), M(0x3a2a1a), 0, -1.1, 0);
    circ(bx, bz, 1.5, undefined, 4.3);
  }

  /* ── mud pit + pond ── */
  {
    const m = SPOT.mud;
    decalCircle(m.x, m.z, m.r + 0.8, 0x7a5a3f, 3, 14);
    decalCircle(m.x, m.z, m.r, 0x5c4030, 4, 16);
    decalCircle(m.x - 1, m.z + 0.6, m.r * 0.6, 0x4b3325, 5, 12);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3;
      part(g, sph(rr(0.4, 0.75), 6, 4), M(0x9b948a), m.x + Math.cos(a) * (m.r + 0.7), 0.15, m.z + Math.sin(a) * (m.r + 0.7), { sy: 0.6 });
    }
    feat('c', m.x, m.z, m.r, 0, '#6b4a33');
    // water trough
    part(g, box(3.4, 0.9, 1.2), M(0x8a5a3a), 23.5, 0.45, 13);
    part(g, box(3.0, 0.1, 0.8), M(0x5ab7d6), 23.5, 0.88, 13, { shadow: false });
    rect(23.5, 13, 1.8, 0.7, undefined, 1);

  }

  /* ── Trout Lake, Dojo Dock & Sparring Dummy ── */
  const dummyPivot = new THREE.Group();
  const lakeRipples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; ph: number; cx: number; cz: number; maxR: number }[] = [];
  const minnows: { obj: THREE.Group; cx: number; cz: number; r: number; sp: number; ph: number }[] = [];
  {
    const lobes: [number, number, number][] = [
      [-41, 41, 11.0],
      [-47.2, 34.4, 5.6],
      [-35.2, 47.4, 5.6],
    ];
    const shallowMat = waterMaterial(0x3fa7c4, 0.74, -4);
    const deepMat = waterMaterial(0x135b78, 1, -5);
    for (const [lx, lz, lr] of lobes) {
      decalCircle(lx, lz, lr + 1.5, 0xdac89b, 3, 24);
      const shallow = new THREE.Mesh(worldCircle(lr, 44, lx, lz, 7), shallowMat);
      shallow.rotation.x = -PI / 2;
      shallow.position.set(lx, 0.07, lz);
      shallow.receiveShadow = true;
      g.add(shallow);
      const deep = new THREE.Mesh(worldCircle(lr * 0.76, 40, lx - 0.3, lz + 0.2, 7), deepMat);
      deep.rotation.x = -PI / 2;
      deep.position.set(lx - 0.3, 0.082, lz + 0.2);
      deep.receiveShadow = true;
      g.add(deep);
      const wc = circ(lx, lz, lr - 0.45, '#2f9bc4', 0);
      wc.lakeWater = true;
    }

    // lily pads & pink lotus blossoms (kept clear of Trout and the dock)
    const lilySpots: [number, number, boolean][] = [
      [-45.5, 44.5, true],
      [-47.8, 36.2, false],
      [-43.5, 47.2, true],
      [-35.8, 49.0, false],
      [-33.2, 45.8, true],
      [-48.2, 41.2, false],
      [-43.2, 33.4, true],
      [-39.8, 45.0, false],
    ];
    for (const [lx, lz, flower] of lilySpots) {
      part(g, cyl(0.76, 0.76, 0.06, 10), M(0x47963d), lx, 0.2, lz, { shadow: false });
      if (flower) {
        part(g, cone(0.26, 0.26, 6), M(0xff9ec4), lx + 0.08, 0.34, lz - 0.05, { shadow: false });
        part(g, sph(0.09, 5, 4), M(0xffd84d), lx + 0.08, 0.38, lz - 0.05, { shadow: false });
      }
    }

    // cattails & shoreline stones
    const reedAngles = [0.55, 0.72, 0.9, 2.25, 2.5, 2.75, 3.4, 3.65, 4.35, 4.55, 5.2, 5.4];
    for (const a of reedAngles) {
      for (let k = 0; k < 2; k++) {
        const rx = -41 + Math.cos(a + k * 0.05) * 11.1 + rr(-0.3, 0.3);
        const rz = 41 + Math.sin(a + k * 0.05) * 11.1 + rr(-0.3, 0.3);
        if (isOnLakeDock(rx, rz)) continue;
        const hgt = rr(1.7, 2.7);
        part(g, cyl(0.045, 0.065, hgt, 4), M(0x558c38), rx, hgt * 0.5, rz);
        if (k === 0) part(g, cyl(0.095, 0.095, 0.42, 5), M(0x6b4226), rx, hgt * 0.84, rz, { shadow: false });
      }
    }
    for (const [bx, bz, bs] of [
      [-31.2, 33.4, 0.95],
      [-30.0, 44.2, 1.1],
      [-51.8, 39.2, 1.25],
      [-45.0, 29.8, 0.9],
      [-39.5, 52.0, 1.05],
    ]) {
      part(g, rockGeo(bs, 0), M(0x8e958e), bx, bs * 0.38, bz, { sy: 0.62, ry: bx });
    }

    // lakeside willow tree shading the northern bank
    {
      const wx = -35.2;
      const wz = 28.8;
      part(g, cyl(0.42, 0.68, 3.8, 7), M(0x6e4e35), wx, 1.9, wz, { rz: 0.08 });
      part(g, blobGeo(2.7, 1), M(0x5da34f), wx - 0.3, 4.9, wz + 0.2);
      part(g, blobGeo(1.9, 1), M(0x74b85e), wx - 1.5, 4.2, wz + 1.1);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        part(g, cyl(0.06, 0.03, 2.4, 4), M(0x7ac062), wx - 0.4 + Math.cos(a) * 2.1, 2.9, wz + 0.3 + Math.sin(a) * 2.1, { shadow: false });
      }
      circ(wx, wz, 0.85, '#4b8f42', 7);
    }

    // animated lake shimmer rings + ambient darting minnows
    for (const [cx, cz, maxR, ph] of [
      [-43.5, 42.0, 2.4, 0],
      [-36.5, 46.8, 1.9, 2.1],
      [-46.8, 35.2, 1.8, 4.2],
    ]) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.35, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 24).rotateX(-PI / 2), mat);
      mesh.position.set(cx, 0.095, cz);
      g.add(mesh);
      lakeRipples.push({ mesh, mat, ph, cx, cz, maxR });
    }
    for (const [cx, cz, r, sp, ph] of [
      [-43.5, 41.5, 3.2, 1.1, 0.4],
      [-36.2, 46.2, 2.1, -1.35, 2.6],
    ]) {
      const obj = new THREE.Group();
      part(obj, cone(0.12, 0.55, 5), M(0x9be2f0), 0, 0.09, 0, { rx: PI / 2, sy: 0.45, shadow: false });
      g.add(obj);
      minnows.push({ obj, cx, cz, r, sp, ph });
    }

    // wooden Dojo Dock jutting out over the east bank (x: -27.8 .. -35.8, z: 38.5)
    const dockWood = M(0x9b6b43);
    const darkWood = M(0x6b4428);
    for (let i = 0; i < 12; i++) {
      const px = -28.0 - i * 0.68;
      part(g, box(0.58, 0.14, 3.4), i % 2 ? dockWood : M(0xa8764c), px, 0.16, 38.5);
    }
    part(g, box(8.2, 0.12, 0.2), darkWood, -31.8, 0.12, 36.95);
    part(g, box(8.2, 0.12, 0.2), darkWood, -31.8, 0.12, 40.05);
    // gentle entry ramp from dirt path
    part(g, box(1.1, 0.1, 3.3), dockWood, -27.3, 0.08, 38.5, { rz: -0.14 });
    // pilings & warm dojo lanterns
    for (const px of [-29.2, -32.4, -35.5]) {
      for (const s of [-1, 1]) {
        const pz = 38.5 + s * 1.72;
        const tall = px === -35.5 && s === -1;
        part(g, cyl(0.18, 0.2, tall ? 2.6 : 1.15, 7), darkWood, px, tall ? 1.2 : 0.52, pz);
        if (tall) {
          part(g, box(0.7, 0.12, 0.12), darkWood, px - 0.25, 2.45, pz);
          part(g, cyl(0.22, 0.2, 0.45, 8), glow(0xffcf70, 1.5), px - 0.5, 2.12, pz, { shadow: false });
          part(g, cone(0.3, 0.2, 8), M(0xc2392b), px - 0.5, 2.42, pz, { shadow: false });
        }
      }
    }
    // rope rails along dock sides + subtle guard colliders so Kenji stays cleanly on the planks
    for (const s of [-1, 1]) {
      part(g, box(6.3, 0.07, 0.07), M(0xd9c294), -32.35, 0.88, 38.5 + s * 1.72, { shadow: false });
      rect(-32.35, 38.5 + s * 1.88, 3.25, 0.16, undefined, 1.1);
    }
    rect(-36.05, 38.5, 0.16, 1.75, undefined, 0.5);
    feat('b', -31.8, 38.5, 4.1, 1.7, '#9b6b43');

    // lakeside "TROUT LAKE · COMBAT DOJO" signboard at dock entrance
    const signG = new THREE.Group();
    signG.position.set(-28.4, 0, 35.1);
    signG.rotation.y = 0.52;
    g.add(signG);
    part(signG, box(0.2, 2.2, 0.16), darkWood, -1.65, 1.1, 0);
    part(signG, box(0.2, 2.2, 0.16), darkWood, 1.65, 1.1, 0);
    part(signG, box(4.5, 1.5, 0.18), M(0x184b59), 0, 2.6, 0);
    const lTex = signTexture('TROUT LAKE', 3.4, '#fbf3df', '#184b59', "TROUT'S COMBAT DOJO · E");
    const lFace = new THREE.Mesh(new THREE.PlaneGeometry(4.25, 1.25), new THREE.MeshStandardMaterial({ roughness: 0.85, map: lTex }));
    lFace.position.set(0, 2.6, 0.11);
    signG.add(lFace);
    const lBack = lFace.clone();
    lBack.rotation.y = PI;
    lBack.position.z = -0.11;
    signG.add(lBack);
    circ(-28.4, 35.1, 0.65, undefined, 3.2);

    // lakeside Sparring Dummy (wearing a painted orange tee just like Allen!) for testing combos
    const dm = SPOT.dummy;
    decalCircle(dm.x, dm.z, 2.9, 0xd8c38c, 4, 18);
    decalCircle(dm.x, dm.z, 2.3, 0xe8d7a6, 5, 18);
    part(g, cyl(0.65, 0.8, 0.24, 10), M(0x7d7a72), dm.x, 0.12, dm.z);
    dummyPivot.position.set(dm.x, 0.24, dm.z);
    dummyPivot.rotation.y = -0.7;
    g.add(dummyPivot);
    part(dummyPivot, cyl(0.14, 0.16, 2.3, 7), darkWood, 0, 1.15, 0);
    part(dummyPivot, box(2.1, 0.16, 0.16), dockWood, 0, 1.65, 0);
    // orange shirt dummy belly + bullseye
    part(dummyPivot, cyl(0.54, 0.5, 1.15, 10), M(0xff7a1a), 0, 1.48, 0);
    part(dummyPivot, cyl(0.28, 0.28, 0.05, 10), M(0xfbf3df), 0, 1.48, 0.53, { rx: PI / 2, shadow: false });
    part(dummyPivot, cyl(0.14, 0.14, 0.06, 10), M(0xc2392b), 0, 1.48, 0.54, { rx: PI / 2, shadow: false });
    // burlap dummy head + headband
    part(dummyPivot, sph(0.42, 9, 7), M(0xd9b882), 0, 2.42, 0);
    part(dummyPivot, box(0.14, 0.04, 0.04), M(0x2a1a12), -0.14, 2.48, 0.39, { rz: 0.7, shadow: false });
    part(dummyPivot, box(0.14, 0.04, 0.04), M(0x2a1a12), -0.14, 2.48, 0.39, { rz: -0.7, shadow: false });
    part(dummyPivot, box(0.14, 0.04, 0.04), M(0x2a1a12), 0.14, 2.48, 0.39, { rz: 0.7, shadow: false });
    part(dummyPivot, box(0.14, 0.04, 0.04), M(0x2a1a12), 0.14, 2.48, 0.39, { rz: -0.7, shadow: false });
    part(dummyPivot, box(0.24, 0.05, 0.04), M(0x2a1a12), 0, 2.26, 0.39, { shadow: false });
    circ(dm.x, dm.z, 0.72, '#ff7a1a', 2.8);
  }

  /* ── edibles (the farm Allen wants to eat) ── */
  const SOIL = 0x6b4a33;
  const addEdible = (id: string, name: string, x: number, z: number, r: number, pieces: THREE.Object3D[], crumb: number, collider?: Collider) => {
    edibles.push({ id, name, x, z, r, hp: 60, maxHp: 60, pieces, collider, shown: pieces.length, crumb });
  };
  const plot = (x: number, z: number, w: number, d: number, rows: number, color: string) => {
    decalRect(x, z, w, d, SOIL, 4);
    for (let i = 0; i < rows; i++) decalRect(x, z - d / 2 + (d / rows) * (i + 0.5), w - 0.6, (d / rows) * 0.45, 0x5a3d2a, 5);
    feat('b', x, z, w / 2, d / 2, color);
  };

  // corn field
  {
    plot(-30, 16, 16, 12, 4, '#c9a52e');
    const pieces: THREE.Object3D[] = [];
    const stem = M(0x5c9a3a);
    const leaf = M(0x6fae44);
    const cob = M(0xf2c230);
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Group();
        s.position.set(-36 + i * 3 + rr(-0.3, 0.3), 0, 11.5 + j * 3);
        s.rotation.y = rr(0, TAU);
        const hgt = rr(2.3, 3.0);
        part(s, cyl(0.07, 0.1, hgt, 5), stem, 0, hgt / 2, 0);
        part(s, cone(0.2, 1.3, 4), leaf, 0.3, hgt * 0.5, 0, { rz: -0.9, sz: 0.35, shadow: false });
        part(s, cone(0.2, 1.3, 4), leaf, -0.3, hgt * 0.7, 0, { rz: 0.9, sz: 0.35, shadow: false });
        part(s, cyl(0.15, 0.1, 0.55, 6), cob, 0.14, hgt * 0.62, 0.08, { rz: -0.35 });
        part(s, cone(0.12, 0.5, 4), M(0xe6d48a), 0, hgt + 0.2, 0, { shadow: false });
        g.add(s);
        pieces.push(s);
      }
    addEdible('corn', 'Corn Field', -30, 16, 9.5, pieces, 0xf2c230);
    // decorative scarecrow
    const sc = new THREE.Group();
    sc.position.set(-20.5, 0, 23.2);
    sc.rotation.y = 0.5;
    g.add(sc);
    part(sc, cyl(0.08, 0.08, 3, 5), M(0x8a5a3a), 0, 1.5, 0);
    part(sc, box(2.2, 0.12, 0.12), M(0x8a5a3a), 0, 2.2, 0);
    part(sc, box(0.9, 1.0, 0.4), M(0x7a5fa8), 0, 1.9, 0);
    part(sc, sph(0.38, 8, 6), M(0xe8822a), 0, 2.85, 0);
    part(sc, cone(0.6, 0.5, 8), M(0x6b4226), 0, 3.3, 0);
    circ(-20.5, 23.2, 0.5);
  }

  // pumpkin patch
  {
    plot(-14, 40, 12, 9, 3, '#e8822a');
    const pieces: THREE.Object3D[] = [];
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Group();
      p.position.set(-19 + (i % 5) * 2.5 + rr(-0.5, 0.5), 0, 37.5 + Math.floor(i / 5) * 4.2 + rr(-0.8, 0.8));
      const s = rr(0.75, 1.25);
      p.scale.setScalar(s);
      part(p, sph(0.62, 8, 6), M(i % 3 === 0 ? 0xf09a3a : 0xe8822a), 0, 0.46, 0, { sy: 0.76 });
      part(p, cyl(0.06, 0.09, 0.26, 5), M(0x4f7a2c), 0, 0.98, 0);
      g.add(p);
      pieces.push(p);
    }
    for (let i = 0; i < 9; i++) part(g, cyl(0.5, 0.5, 0.04, 6), M(0x4f8f3a), rr(-19.5, -8.5), 0.12, rr(36.2, 43.8), { shadow: false });
    addEdible('pumpkins', 'Pumpkin Patch', -14, 40, 7.5, pieces, 0xe8822a);
  }

  // cabbage patch
  {
    plot(16, 40, 12, 8, 3, '#9fd07a');
    const pieces: THREE.Object3D[] = [];
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Group();
        p.position.set(11.5 + i * 3, 0, 37.4 + j * 2.6);
        p.rotation.y = rr(0, TAU);
        part(p, sph(0.62, 7, 4), M(0x6fae54), 0, 0.2, 0, { sy: 0.4 });
        part(p, sph(0.42, 7, 5), M(0xa9d884), 0, 0.42, 0, { sy: 0.85 });
        g.add(p);
        pieces.push(p);
      }
    addEdible('cabbages', 'Cabbage Patch', 16, 40, 7, pieces, 0xa9d884);
  }

  // carrot patch
  {
    plot(-16, -6, 10, 8, 3, '#f07d2e');
    const pieces: THREE.Object3D[] = [];
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Group();
        p.position.set(-20 + i * 2, 0, -8.6 + j * 2.6);
        part(p, cone(0.17, 0.4, 6), M(0xf07d2e), 0, 0.14, 0, { rx: PI });
        for (let k = 0; k < 3; k++) part(p, cone(0.09, 0.7, 4), M(0x4f9a3d), Math.cos(k * 2.1) * 0.1, 0.62, Math.sin(k * 2.1) * 0.1, { rz: Math.cos(k * 2.1) * -0.35, rx: Math.sin(k * 2.1) * 0.35, shadow: false });
        g.add(p);
        pieces.push(p);
      }
    addEdible('carrots', 'Carrot Patch', -16, -6, 6.5, pieces, 0xf07d2e);
  }

  // apple orchard
  {
    const pieces: THREE.Object3D[] = [];
    const trees: [number, number][] = [
      [-47, -18],
      [-47, -8],
      [-47, 2],
    ];
    for (const [tx, tz] of trees) {
      part(g, cyl(0.45, 0.65, 3.2, 7), M(0x7a5236), tx, 1.6, tz);
      part(g, blobGeo(2.5, 1), M(0x4f8f3a), tx, 4.6, tz);
      part(g, blobGeo(1.6, 1), M(0x5fa246), tx + 1.2, 5.6, tz - 0.8);
      decalCircle(tx, tz, 2.6, 0x7aae4c, 3, 10);
      circ(tx, tz, 0.9, '#3f7a30', 7);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + rr(0, 0.8);
        const y = rr(-1.5, 0.3);
        const hr = Math.sqrt(Math.max(0.2, 2.55 * 2.55 - y * y));
        pieces.push(part(g, sph(0.27, 7, 5), M(0xd9352b), tx + Math.cos(a) * hr, 4.6 + y, tz + Math.sin(a) * hr));
      }
    }
    // shuffle so apples vanish evenly across trees
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    feat('b', -47, -8, 3.5, 13, '#5c9a3a');
    addEdible('apples', 'Apple Orchard', -47, -8, 6.5, pieces, 0xd9352b);
  }

  // hay stack
  {
    const pieces: THREE.Object3D[] = [];
    const hay = M(0xe3bd55);
    const hx = -6;
    const hz = -38;
    const spots: [number, number, number][] = [
      [-2.3, 0.65, 0],
      [0, 0.65, 0],
      [2.3, 0.65, 0],
      [-1.15, 1.95, 0],
      [1.15, 1.95, 0],
      [0, 3.25, 0],
    ];
    for (const [x, y, z] of spots) {
      const b = part(g, box(2.2, 1.26, 1.5), hay, hx + x, y, hz + z, { ry: rr(-0.06, 0.06) });
      part(b, box(2.24, 0.08, 1.54), M(0xb8925a), 0, 0.3, 0, { shadow: false });
      part(b, box(2.24, 0.08, 1.54), M(0xb8925a), 0, -0.3, 0, { shadow: false });
      pieces.push(b);
    }
    const col = rect(hx, hz, 3.5, 0.9, '#e3bd55', 3.9);
    addEdible('hay', 'Hay Stack', hx, hz, 5.5, pieces, 0xe3bd55, col);
    // round bales (just scenery)
    for (const [x, z, ry] of [
      [8, -40, 0.3],
      [11.5, -38.6, 1.2],
    ]) {
      part(g, cyl(1.3, 1.3, 1.6, 12), hay, x, 1.3, z, { rz: PI / 2, ry });
      circ(x, z, 1.4);
    }
  }

  // pie stand
  {
    const px = 14;
    const pz = -17;
    const wood = M(0x9b6a43);
    const st = new THREE.Group();
    st.position.set(px, 0, pz);
    g.add(st);
    part(st, box(5.2, 0.2, 2.2), wood, 0, 1.15, 0);
    for (const [x, z] of [
      [-2.4, -0.9],
      [2.4, -0.9],
      [-2.4, 0.9],
      [2.4, 0.9],
    ])
      part(st, box(0.2, 1.1, 0.2), wood, x, 0.55, z);
    // gingham cloth
    part(st, box(5.3, 0.04, 1.4), M(0xc2392b), 0, 1.27, 0, { shadow: false });
    for (let i = 0; i < 6; i++) part(st, box(0.44, 0.05, 1.42), M(0xfbf3df), -2.2 + i * 0.88, 1.275, 0, { shadow: false });
    part(st, box(0.16, 3.6, 0.16), wood, -2.5, 1.8, -1);
    part(st, box(0.16, 3.6, 0.16), wood, 2.5, 1.8, -1);
    part(st, box(5.8, 0.14, 2.8), M(0xc2392b), 0, 3.5, -0.1, { rx: 0.2 });
    for (let i = 0; i < 4; i++) part(st, box(0.72, 0.16, 2.82), M(0xfbf3df), -2.17 + i * 1.45, 3.5, -0.1, { rx: 0.2, shadow: false });
    const tex = signTexture('PIES', 3, '#2a1a12', '#fbf3df');
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.7), new THREE.MeshStandardMaterial({ roughness: 0.85, map: tex }));
    sm.position.set(0, 2.75, 1.15);
    st.add(sm);
    const pieces: THREE.Object3D[] = [];
    const fills = [0xb3202e, 0x4b3fa8, 0xe8822a, 0xb3202e, 0xf2d16b, 0x4b3fa8];
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Group();
      p.position.set(-2.1 + i * 0.84, 1.3, i % 2 ? 0.3 : -0.3);
      part(p, cyl(0.4, 0.3, 0.16, 10), M(0xd9a05b), 0, 0.08, 0);
      part(p, cyl(0.33, 0.33, 0.05, 10), M(fills[i]), 0, 0.17, 0, { shadow: false });
      st.add(p);
      pieces.push(p);
    }
    rect(px, pz, 2.7, 1.2, '#c2392b', 3.8);
    addEdible('pies', 'Pie Stand', px, pz, 4.6, pieces, 0xd9a05b);
  }

  // sunflowers
  {
    plot(33, 3, 11, 5, 2, '#f2c230');
    const pieces: THREE.Object3D[] = [];
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Group();
        s.position.set(29 + i * 2.7 + rr(-0.3, 0.3), 0, 1.8 + j * 2.5);
        s.rotation.y = PI + rr(-0.4, 0.4) + 0.6;
        const hgt = rr(2.6, 3.4);
        part(s, cyl(0.06, 0.08, hgt, 5), M(0x5c9a3a), 0, hgt / 2, 0);
        part(s, cone(0.22, 0.8, 4), M(0x6fae44), 0.3, hgt * 0.45, 0, { rz: -1.1, sz: 0.4, shadow: false });
        part(s, cyl(0.62, 0.62, 0.08, 9), M(0xf7c82e), 0, hgt, 0.12, { rx: PI / 2 - 0.3 });
        part(s, cyl(0.3, 0.3, 0.12, 8), M(0x6b4226), 0, hgt + 0.02, 0.18, { rx: PI / 2 - 0.3, shadow: false });
        g.add(s);
        pieces.push(s);
      }
    addEdible('sunflowers', 'Sunflowers', 33, 3, 6.5, pieces, 0xf7c82e);
  }

  /* ── tractor ── */
  {
    const t = new THREE.Group();
    t.position.set(-10, 0, 25);
    t.rotation.y = 0.5;
    g.add(t);
    const green = M(0x3f8f4a);
    const tire = M(0x26262b);
    const yel = M(0xf0b429);
    part(t, box(1.6, 1.1, 3.2), green, 0, 1.5, 0.3);
    part(t, box(1.8, 1.2, 1.6), green, 0, 1.6, -1.6);
    part(t, box(1.7, 0.12, 1.7), M(0x2a1a12), 0, 3.7, -1.6);
    for (const [x, z] of [
      [-0.8, -0.85],
      [0.8, -0.85],
      [-0.8, -2.35],
      [0.8, -2.35],
    ])
      part(t, box(0.1, 1.5, 0.1), M(0x2a1a12), x, 2.95, z);
    part(t, cyl(0.1, 0.1, 1.3, 5), M(0x2a1a12), 0.5, 2.6, 1.3);
    for (const s of [-1, 1]) {
      part(t, cyl(1.25, 1.25, 0.6, 12), tire, 1.15 * s, 1.25, -1.6, { rz: PI / 2 });
      part(t, cyl(0.6, 0.6, 0.64, 10), yel, 1.15 * s, 1.25, -1.6, { rz: PI / 2 });
      part(t, cyl(0.7, 0.7, 0.45, 10), tire, 1.0 * s, 0.7, 1.4, { rz: PI / 2 });
      part(t, cyl(0.32, 0.32, 0.5, 8), yel, 1.0 * s, 0.7, 1.4, { rz: PI / 2 });
    }
    circ(-10.6, 23.9, 1.9, '#3f8f4a', 3.8);
    circ(-9.4, 26.2, 1.7);
  }

  /* ── chicken coop ── */
  {
    const c = new THREE.Group();
    c.position.set(45, 0, -30);
    g.add(c);
    part(c, box(3.4, 2.4, 3), M(0xd9a05b), 0, 2, 0);
    for (const [x, z] of [
      [-1.5, -1.3],
      [1.5, -1.3],
      [-1.5, 1.3],
      [1.5, 1.3],
    ])
      part(c, box(0.2, 0.8, 0.2), M(0x6b4226), x, 0.4, z);
    roofSlabs(c, [[-2.2, 2.9], [0, 4.3], [2.2, 2.9]], 3.6, M(0xa83a2e), 0.25);
    part(c, box(0.1, 0.9, 0.8), M(0x2a1a12), -1.72, 1.6, 0);
    part(c, box(2.2, 0.1, 0.8), M(0x8a5a3a), -2.7, 0.55, 0, { rz: 0.45 });
    rect(45, -30, 1.9, 1.7, '#d9a05b', 4.5);
  }

  // A trailhead replaces the old pen. The hunt itself lives on a separate map.
  {
    const H = SPOT.hunt;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      decalCircle(34 + t * 22, 28 + t * 13, 2.1, DIRT, 3, 12);
    }
    decalCircle(H.x, H.z, 5, DIRT, 3, 20);
    const entrance = new THREE.Group();
    entrance.position.set(54, 0, H.z);
    entrance.rotation.y = -PI / 2;
    g.add(entrance);
    const post = M(0x8a5a3a);
    for (const s of [-1, 1]) {
      part(entrance, box(0.5, 6.3, 0.5), post, s * 4, 3.15, 0);
      part(entrance, box(0.5, 0.8, 0.5), glow(0xffd78b, 0.7), s * 4, 4.6, 0.65);
      part(entrance, cone(0.47, 0.35, 4), M(0x394c36), s * 4, 5.16, 0.65);
    }
    part(entrance, box(9.2, 1.85, 0.4), M(0x344d36), 0, 5.8, 0);
    const tex = signTexture('SLOPWOOD FOREST', 5.4, '#fbf3df', '#344d36', 'HOG HUNT - E TO TRAVEL');
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(8.9, 1.65), new THREE.MeshStandardMaterial({ roughness: 0.85, map: tex }));
    sm.position.set(0, 5.8, 0.22);
    entrance.add(sm);
    for (const z of [33, 49]) {
      part(g, cyl(0.5, 0.7, 4, 6), post, 58, 2, z);
      part(g, pineGeo(3, 9), M(0x365c3e), 58, 7, z);
    }
  }

  /* ── rocks ── */
  for (const [x, z, s] of [
    [-50, 26, 1.4],
    [50, 46, 1.6],
    [24, 50, 1.0],
    [-34, -10, 1.1],
    [50, 10, 1.2],
    [-50, -48, 1.5],
  ]) {
    part(g, rockGeo(s, 0), M(0x9b948a), x, s * 0.45, z, { sy: 0.7, ry: x });
    circ(x, z, s * 0.9, undefined, 1.4);
  }

  /* ── forest ring + hills beyond the fence ── */
  {
    const n = 150;
    const trunks = new THREE.InstancedMesh(cyl(0.4, 0.6, 3, 5), M(0x6b4a33), n);
    const pines = new THREE.InstancedMesh(pineGeo(2.8, 7), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: false }), n);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    const greens = [0x3f7a3a, 0x4a8a3f, 0x356b3a, 0x5a9a48, 0x2f6238];
    for (let i = 0; i < n; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 20; tries++) {
        const a = rr(0, TAU);
        const r = rr(64, 135);
        x = Math.cos(a) * r * 1.05;
        z = Math.sin(a) * r * 1.05;
        if (Math.abs(x) < 62 && Math.abs(z) < 62) continue;
        if (Math.abs(x) < 8 && z > 0) continue;
        break;
      }
      const s = rr(0.8, 1.7);
      d.position.set(x, 1.5 * s, z);
      d.rotation.set(0, rr(0, TAU), 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
      d.position.y = 6 * s;
      d.updateMatrix();
      pines.setMatrixAt(i, d.matrix);
      pines.setColorAt(i, col.setHex(greens[i % greens.length]));
    }
    trunks.castShadow = true;
    pines.castShadow = true;
    g.add(trunks, pines);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + rr(-0.15, 0.15);
      const r = rr(170, 240);
      const s = rr(40, 80);
      part(g, sph(1, 10, 6), M(i % 2 ? 0x6fa04a : 0x7fae58), Math.cos(a) * r, -4, Math.sin(a) * r, { sx: s, sy: s * rr(0.3, 0.5), sz: s, shadow: false });
    }
  }

  /* ── clouds ── */
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, fog: false, emissive: 0x9fb4d6, emissiveIntensity: 0.06 });
  const clouds: THREE.Group[] = [];
  {
    const cm = cloudMat;
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      c.position.set(rr(-240, 240), rr(60, 95), rr(-240, 240));
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) part(c, sph(1, 7, 5), cm, k * 7 - n * 3.5, rr(-1, 1), rr(-3, 3), { sx: rr(6, 10), sy: rr(2.5, 4), sz: rr(5, 8), shadow: false });
      g.add(c);
      clouds.push(c);
    }
  }

  /* ── chickens ── */
  interface Chicken {
    obj: THREE.Group;
    x: number;
    z: number;
    tx: number;
    tz: number;
    wait: number;
    ph: number;
  }
  const HOME = { x: 37, z: -20 };
  const chickens: Chicken[] = [];
  for (let i = 0; i < 6; i++) {
    const obj = new THREE.Group();
    part(obj, sph(0.32, 7, 5), M(i % 3 === 0 ? 0xc98b4a : 0xfdfaf2), 0, 0.42, 0, { sz: 1.2 });
    part(obj, sph(0.2, 6, 5), M(i % 3 === 0 ? 0xc98b4a : 0xfdfaf2), 0, 0.72, 0.28);
    part(obj, cone(0.06, 0.16, 4), M(0xf0b429), 0, 0.7, 0.5, { rx: PI / 2, shadow: false });
    part(obj, box(0.05, 0.14, 0.2), M(0xd9352b), 0, 0.92, 0.28, { shadow: false });
    part(obj, cone(0.14, 0.3, 4), M(0xfdfaf2), 0, 0.6, -0.4, { rx: -1.0 });
    const x = HOME.x + rr(-7, 7);
    const z = HOME.z + rr(-6, 6);
    obj.position.set(x, 0, z);
    g.add(obj);
    chickens.push({ obj, x, z, tx: x, tz: z, wait: rr(0, 3), ph: rr(0, 6) });
  }

  const update = (time: number, dt: number, scare: { x: number; z: number }[]) => {
    windHub.rotation.z -= dt * 0.7;
    dish.rotation.y += dt * 0.5;
    beacon.emissiveIntensity = Math.sin(time * 4) > 0.2 ? 2.2 : 0.1;
    coilMat.emissiveIntensity = 0.8 + Math.sin(time * 9) * 0.5 + (Math.sin(time * 31) > 0.8 ? 1.2 : 0);
    for (const c of clouds) {
      c.position.x += dt * 1.6;
      if (c.position.x > 260) c.position.x = -260;
    }
    for (const rp of lakeRipples) {
      const p = ((time * 0.42 + rp.ph) % 1 + 1) % 1;
      rp.mesh.scale.setScalar(0.35 + p * rp.maxR);
      rp.mat.opacity = Math.sin(p * PI) * 0.34;
    }
    for (const mn of minnows) {
      const a = time * mn.sp + mn.ph;
      const nx = mn.cx + Math.cos(a) * mn.r;
      const nz = mn.cz + Math.sin(a * 1.5) * (mn.r * 0.65);
      const dx = -Math.sin(a) * mn.r * mn.sp;
      const dz = Math.cos(a * 1.5) * 1.5 * mn.r * 0.65 * mn.sp;
      mn.obj.position.set(nx, 0, nz);
      mn.obj.rotation.y = Math.atan2(dx, dz);
    }
    for (const c of chickens) {
      let fx = 0;
      let fz = 0;
      for (const s of scare) {
        const dx = c.x - s.x;
        const dz = c.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 6 && d > 0.01) {
          fx += dx / d;
          fz += dz / d;
        }
      }
      let speed = 0;
      let hx = 0;
      let hz = 0;
      if (fx !== 0 || fz !== 0) {
        const l = Math.hypot(fx, fz) || 1;
        hx = fx / l;
        hz = fz / l;
        speed = 8;
        c.wait = 0.5;
        c.tx = c.x;
        c.tz = c.z;
      } else if (c.wait > 0) {
        c.wait -= dt;
        if (c.wait <= 0) {
          c.tx = HOME.x + (Math.random() - 0.5) * 16;
          c.tz = HOME.z + (Math.random() - 0.5) * 12;
        }
      } else {
        const dx = c.tx - c.x;
        const dz = c.tz - c.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) c.wait = 1 + Math.random() * 3;
        else {
          hx = dx / d;
          hz = dz / d;
          speed = 1.6;
        }
      }
      if (speed > 0) {
        c.x += hx * speed * dt;
        c.z += hz * speed * dt;
        c.x = Math.min(HOME.x + 11, Math.max(HOME.x - 11, c.x));
        c.z = Math.min(HOME.z + 9, Math.max(HOME.z - 8, c.z));
        c.obj.rotation.y = Math.atan2(hx, hz);
        c.ph += dt * speed * 4;
      }
      c.obj.position.set(c.x, speed > 0 ? Math.abs(Math.sin(c.ph)) * 0.18 : 0, c.z);
      c.obj.rotation.x = speed === 0 && Math.sin(time * 2 + c.ph) > 0.7 ? 0.5 : 0;
    }
  };

  /* ── wind-swept grass everywhere that is not a path, plot, building or water ── */
  const blocked = (x: number, z: number) => {
    if (isOnLakeDock(x, z)) return true;
    for (const n of noGrass) {
      if (n.c ? Math.hypot(x - n.x, z - n.z) < n.a : Math.abs(x - n.x) < n.a && Math.abs(z - n.z) < n.b) return true;
    }
    for (const c of colliders) {
      if (c.kind === 'c' ? Math.hypot(x - c.x, z - c.z) < c.r + 0.35 : Math.abs(x - c.x) < c.hx + 0.35 && Math.abs(z - c.z) < c.hz + 0.35) return true;
    }
    return false;
  };
  const grass = buildGrass(
    28000,
    () => {
      const x = (Math.random() * 2 - 1) * 72;
      const z = (Math.random() * 2 - 1) * 72;
      if ((Math.abs(x) > 57 || Math.abs(z) > 57) && Math.random() < 0.55) return null;
      return blocked(x, z) ? null : { x, z };
    },
    [0x6fae3f, 0x86c04b, 0x5d9a37, 0x9ccf5a, 0x7ab648],
  );
  g.add(grass);

  return { group: g, colliders, edibles, features, bellPivot, dummyPivot, windowMat, cloudMat, grass, update };
}
