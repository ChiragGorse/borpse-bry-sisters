import * as THREE from 'three';
import { M, glow, box, cyl, cone, sph, part } from './models';
import { signTexture, type MapFeature } from './world';
import type { Collider } from './layout';
import { blobGeo as shrubGeo, buildGrass, groundMaterial, pineGeo, rockGeo as boulderGeo, waterMaterial, worldCircle, worldUV } from './nature';
import { GUPPY_END } from './layout';

const PI = Math.PI;
const TAU = PI * 2;

export { FOREST_BOUND, FOREST_EXIT, FOREST_START, FOREST_HOMES } from './layout';
import { FOREST_BOUND, FOREST_EXIT, FOREST_HOMES } from './layout';

export interface ForestWorld {
  group: THREE.Group;
  colliders: Collider[];
  features: MapFeature[];
  paths: { x: number; z: number }[][];
  grass: THREE.InstancedMesh;
  update(time: number): void;
}

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

export function buildForest(): ForestWorld {
  const group = new THREE.Group();
  group.name = 'Folk Valley';
  const colliders: Collider[] = [];
  const features: MapFeature[] = [];
  const random = seeded(83471);
  const rr = (a: number, b: number) => a + random() * (b - a);
  const d = new THREE.Object3D();
  const color = new THREE.Color();
  const paths = [
    [[0, 78], [0, 54], [-5, 40], [-7, 26], [0, 13], [-5, -1], [8, -16], [8, -33], [4, -51]],
    [[-7, 26], [-24, 24], [-39, 13], [-47, 17], [-54, 12], [-58, 5], [GUPPY_END.x, GUPPY_END.z]],
    [[0, 13], [18, 22], [35, 22]],
    [[-5, -1], [-24, -16], [-41, -37]],
    [[8, -33], [25, -43], [45, -38]],
  ].map((p) => p.map(([x, z]) => ({ x, z })));

  const circleCollider = (x: number, z: number, r: number, h: number) => {
    colliders.push({ kind: 'c', x, z, r, h, hx: 0, hz: 0, enabled: true });
  };
  const patchMats = new Map<string, THREE.Material>();
  const patch = (x: number, z: number, r: number, tint: number, layer = 1) => {
    const key = `${tint}:${layer}`;
    let material = patchMats.get(key);
    if (!material) {
      material = groundMaterial(tint, layer);
      patchMats.set(key, material);
    }
    const mesh = new THREE.Mesh(worldCircle(r, 32, x, z, 9), material);
    mesh.rotation.x = -PI / 2;
    mesh.position.set(x, 0.013 * layer, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  const groundGeo = new THREE.PlaneGeometry(700, 700);
  worldUV(groundGeo, 0, 0, 9);
  const ground = new THREE.Mesh(groundGeo, groundMaterial(0x56734a, 0));
  ground.rotation.x = -PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  for (let i = 0; i < 60; i++) patch(rr(-78, 78), rr(-78, 78), rr(3, 11), i % 2 ? 0x607e4b : 0x4e6e43, i % 2 ? 1 : 2);
  for (const h of FOREST_HOMES) {
    patch(h.x, h.z, h.r + 2, 0x81915b, 3);
    patch(h.x + 1, h.z - 1, h.r * 0.65, 0x8b9864, 4);
    features.push({ kind: 'c', x: h.x, z: h.z, r: h.r + 1, hx: 0, hz: 0, color: '#81915b' });
  }
  patch(GUPPY_END.x, GUPPY_END.z, GUPPY_END.r, 0x868763, 3);
  patch(GUPPY_END.x, GUPPY_END.z, 5.6, 0xa58c6f, 4);
  features.push({ kind: 'c', x: GUPPY_END.x, z: GUPPY_END.z, r: GUPPY_END.r, hx: 0, hz: 0, color: '#9a876d' });

  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s <= length; s += 2.4) {
        const t = Math.min(1, s / length);
        patch(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 2.2, 0xae9571, 5);
      }
    }
  }

  const pathDistance = (x: number, z: number) => {
    let best = Infinity;
    for (const path of paths) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
      }
    }
    return best;
  };
  const guppyDistance = (x: number, z: number) => Math.hypot(x - GUPPY_END.x, z - GUPPY_END.z);
  const nearClearing = (x: number, z: number) => guppyDistance(x, z) < GUPPY_END.r + 6 || FOREST_HOMES.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + 3);
  const riverZ = (x: number) => -17 + Math.sin(x * 0.055) * 6;

  // Instancing keeps a dense, fully modeled woodland inexpensive to draw.
  const trees: { x: number; z: number; s: number; rot: number }[] = [];
  for (let x = -110; x <= 110; x += 6.5) {
    for (let z = -110; z <= 110; z += 6.5) {
      const tx = x + rr(-2, 2);
      const tz = z + rr(-2, 2);
      if (Math.abs(tx) < 76 && Math.abs(tz) < 76) {
        const trailWidth = tx < -45 && tz > -14 && tz < 24 ? 7.6 : 5;
        if (pathDistance(tx, tz) < trailWidth || nearClearing(tx, tz)) continue;
        if (Math.hypot(tx - 27, tz + 10) < 12 || Math.abs(tz - riverZ(tx)) < 4) continue;
        if (Math.hypot(tx, tz - 62) < 12) continue;
        if (random() < 0.18) continue;
      }
      trees.push({ x: tx, z: tz, s: rr(0.85, 1.55), rot: rr(0, TAU) });
    }
  }
  const trunks = new THREE.InstancedMesh(cyl(0.32, 0.65, 5.3, 6), M(0x66503a), trees.length);
  const leaves = new THREE.InstancedMesh(pineGeo(3.3, 8), M(0xffffff), trees.length);
  const tops = new THREE.InstancedMesh(pineGeo(2.5, 6.4), M(0xffffff), trees.length);
  const greens = [0x294f39, 0x355f40, 0x416e46, 0x50784a, 0x3c6548];
  trees.forEach((t, i) => {
    d.rotation.set(0, t.rot, 0);
    d.scale.setScalar(t.s);
    d.position.set(t.x, 2.65 * t.s, t.z);
    d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);
    d.position.y = 7.5 * t.s;
    d.updateMatrix();
    leaves.setMatrixAt(i, d.matrix);
    leaves.setColorAt(i, color.setHex(greens[i % greens.length]));
    d.position.y = 11 * t.s;
    d.updateMatrix();
    tops.setMatrixAt(i, d.matrix);
    tops.setColorAt(i, color.setHex(greens[(i + 1) % greens.length]));
    if (Math.abs(t.x) < FOREST_BOUND && Math.abs(t.z) < FOREST_BOUND) {
      circleCollider(t.x, t.z, 0.65 * t.s, 5.3 * t.s);
      features.push({ kind: 'c', x: t.x, z: t.z, r: 2.5 * t.s, hx: 0, hz: 0, color: '#385b3d' });
    }
  });
  trunks.castShadow = leaves.castShadow = tops.castShadow = true;
  trunks.receiveShadow = true;
  group.add(trunks, leaves, tops);

  const riverPositions: number[] = [];
  const riverIndices: number[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = -85 + (i / 60) * 170;
    riverPositions.push(x, 0.085, riverZ(x) - 1.8, x, 0.085, riverZ(x) + 1.8);
    if (i < 60) {
      const n = i * 2;
      riverIndices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  const waterGeo = new THREE.BufferGeometry();
  waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(riverPositions, 3));
  const riverUV: number[] = [];
  for (let i = 0; i < riverPositions.length; i += 3) riverUV.push(riverPositions[i] / 7, riverPositions[i + 2] / 7);
  waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(riverUV, 2));
  waterGeo.setIndex(riverIndices);
  waterGeo.computeVertexNormals();
  const waterMat = waterMaterial(0x2a6f78, 0.9, -6, THREE.DoubleSide);
  group.add(new THREE.Mesh(waterGeo, waterMat));
  const pond = new THREE.Mesh(worldCircle(8.5, 40, 27, -10, 7), waterMat);
  pond.rotation.x = -PI / 2;
  pond.position.set(27, 0.086, -10);
  group.add(pond);
  circleCollider(27, -10, 8.3, 0);
  features.push({ kind: 'c', x: 27, z: -10, r: 8.5, hx: 0, hz: 0, color: '#659e9a' });
  const wood = M(0x886749);
  const bz = riverZ(8);
  for (let i = 0; i < 13; i++) part(group, box(4.4, 0.09, 0.5), wood, 8, 0.1, bz - 3.3 + i * 0.55);
  for (const s of [-1, 1]) {
    part(group, box(0.14, 0.15, 7.4), M(0x634b35), 8 + s * 2.3, 1.1, bz);
    for (const z of [bz - 3.4, bz, bz + 3.4]) {
      part(group, box(0.18, 1.2, 0.18), wood, 8 + s * 2.3, 0.6, z);
      circleCollider(8 + s * 2.3, z, 0.25, 1.2);
    }
  }

  // Landmarks make exploration navigable without exposing every hog on the map.
  const sign = (x: number, z: number, text: string, sub: string, rot = 0, width = 5) => {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    root.rotation.y = rot;
    group.add(root);
    part(root, box(0.2, 3.1, 0.2), wood, 0, 1.55, 0);
    part(root, box(width + 0.25, 1.4, 0.15), M(0x354d39), 0, 2.65, 0);
    const texture = signTexture(text, 4.2, '#fff3d4', '#354d39', sub);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.2), new THREE.MeshStandardMaterial({ roughness: 0.85, map: texture }));
    face.position.set(0, 2.65, 0.1);
    root.add(face);
  };
  sign(-4.5, 49, 'FOLK VALLEY', 'STAY NEAR THE LANTERN', 0.1, 6.3);
  sign(3.7, 65, 'BACK TO THE FARM', 'E - BRING YOUR RECRUITS', PI, 5.3);
  sign(-3, 17, 'OLD CAMP  <', 'ACORN GROVE  >');
  sign(10, -30, 'DEEPWOOD', 'KEEP GOING, COMRADE');
  sign(-42.5, 17.5, "GUPPY'S END  <", 'PAST THE OLD CAMP', 0.45, 5.8);
  sign(-64, -8, 'PATH GUPPY', 'NO TRESPASSING', 0.34, 6.1);
  const arch = new THREE.Group();
  arch.position.set(FOREST_EXIT.x, 0, FOREST_EXIT.z + 3);
  group.add(arch);
  for (const s of [-1, 1]) {
    part(arch, cyl(0.3, 0.4, 5, 6), wood, s * 3.8, 2.5, 0);
    part(arch, box(0.45, 0.7, 0.45), glow(0xffdc8f, 0.8), s * 3.8, 3.3, -0.45);
    part(arch, cone(0.45, 0.25, 4), M(0x354d39), s * 3.8, 3.8, -0.45);
  }
  part(arch, box(8.5, 0.5, 0.5), wood, 0, 5, 0);
  const exitMaterial = new THREE.MeshBasicMaterial({ color: 0xffd483, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const exitPlane = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 4.6), exitMaterial);
  exitPlane.position.set(0, 2.3, 68);
  group.add(exitPlane);

  const camp = new THREE.Group();
  camp.position.set(-44, 0, 9);
  camp.rotation.y = 0.5;
  group.add(camp);
  part(camp, cone(3.4, 3.8, 4), M(0xc58a48), 0, 1.9, 0, { ry: PI / 4, sz: 1.3 });
  part(camp, cone(1.4, 2.7, 3), M(0x3c4232), 0, 1.27, 2.43, { sz: 0.05 });
  part(camp, cyl(0.3, 0.3, 3.3, 6), wood, 4.7, 0.3, 2, { rz: PI / 2 });
  const fire = part(camp, new THREE.OctahedronGeometry(0.7), glow(0xffb44d, 1.2), 3, 0.5, 6, { sy: 1.3, shadow: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    part(camp, sph(0.35, 6, 4), M(0x7a8172), 3 + Math.cos(a) * 1.1, 0.15, 6 + Math.sin(a) * 1.1, { sy: 0.65 });
  }
  circleCollider(-44, 9, 3.1, 4);

  const gladeLanterns: THREE.MeshStandardMaterial[] = [];
  for (const [x, z, h] of [[-63.4, -1, 2.5], [-55.7, -5.8, 1.9]]) {
    const iron = M(0x39433d);
    part(group, cyl(0.13, 0.22, h, 7), wood, x, h / 2, z);
    part(group, box(0.53, 0.075, 0.53), iron, x, h + 0.05, z);
    const glass = new THREE.MeshStandardMaterial({ color: 0xf5cb79, emissive: 0xffb54b, emissiveIntensity: 1.3, roughness: 0.38 });
    part(group, cyl(0.17, 0.19, 0.42, 7), glass, x, h + 0.31, z, { shadow: false });
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) part(group, box(0.045, 0.52, 0.045), iron, x + s * 0.20, h + 0.29, z + t * 0.20, { shadow: false });
    }
    part(group, cone(0.39, 0.33, 4), iron, x, h + 0.69, z, { ry: PI / 4 });
    gladeLanterns.push(glass);
    circleCollider(x, z, 0.31, h + 0.85);
  }
  part(group, cyl(0.64, 0.55, 4.2, 9), M(0x69503a), -63.35, 0.45, -4.6, { rz: PI / 2, ry: -0.34 });
  part(group, sph(0.73, 8, 6), M(0x667444), -64.25, 0.97, -4.45, { sx: 1.3, sy: 0.26 });
  circleCollider(-64.2, -4.5, 0.92, 0.9);
  circleCollider(-62.7, -4.7, 0.78, 0.9);
  for (const [x, z, r] of [[-57.4, -8.4, 0.95], [-65, -5.85, 0.85], [-56.6, -7.85, 0.52], [-62.5, 2.55, 0.54], [-61.75, 2.3, 0.44]]) {
    part(group, boulderGeo(r), M(0x858f78), x, r * 0.24, z, { sy: 0.57, ry: x });
    circleCollider(x, z, r * 0.8, r * 0.72);
  }

  const rockGeo = boulderGeo(1);
  const rocks = new THREE.InstancedMesh(rockGeo, M(0x85907c), 85);
  for (let i = 0; i < 85; i++) {
    const a = (i / 85) * TAU;
    let x = i < 60 ? Math.cos(a) * rr(77, 85) : rr(-65, 65);
    let z = i < 60 ? Math.sin(a) * rr(77, 85) : rr(-65, 65);
    if (pathDistance(x, z) < 5 || nearClearing(x, z)) { x += 8; z += 4; }
    if (guppyDistance(x, z) < GUPPY_END.r + 1.5) x += 13;
    const r = i < 60 ? rr(2.1, 4) : rr(0.8, 2);
    d.position.set(x, r * 0.55, z);
    d.rotation.set(0, rr(0, TAU), 0.2);
    d.scale.set(r, r * 0.8, r);
    d.updateMatrix();
    rocks.setMatrixAt(i, d.matrix);
    if (Math.abs(x) < 73 && Math.abs(z) < 73 && pathDistance(x, z) > 3) circleCollider(x, z, r * 0.9, r * 1.3);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  group.add(rocks);

  const ferns = new THREE.InstancedMesh(shrubGeo(0.55), M(0xffffff), 420);
  const mushrooms = new THREE.InstancedMesh(sph(0.2, 6, 4), M(0xffffff), 180);
  for (let i = 0; i < 420; i++) {
    const x = rr(-73, 73);
    const z = rr(-73, 73);
    const s = rr(0.6, 1.3);
    d.position.set(x, 0.3, z);
    d.rotation.set(0.2, rr(0, TAU), 0.3);
    d.scale.setScalar(guppyDistance(x, z) < GUPPY_END.r - 1 ? 0 : s);
    d.updateMatrix();
    ferns.setMatrixAt(i, d.matrix);
    ferns.setColorAt(i, color.setHex(i % 2 ? 0x72954b : 0x8aab58));
    if (i < 180) {
      d.position.y = 0.17;
      if (guppyDistance(x, z) < GUPPY_END.r - 1) d.scale.setScalar(0);
      else d.scale.set(1.4, 0.8, 1.4);
      d.updateMatrix();
      mushrooms.setMatrixAt(i, d.matrix);
      mushrooms.setColorAt(i, color.setHex(i % 3 ? 0xca7954 : 0xf1d49b));
    }
  }
  group.add(ferns, mushrooms);

  const prints = new THREE.InstancedMesh(sph(0.13, 5, 3), M(0x574732), 144);
  let printIndex = 0;
  for (const h of FOREST_HOMES) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU * 0.5;
      for (const side of [-1, 1]) {
        d.position.set(h.x + Math.sin(a) * 6 + side * 0.12, 0.078, h.z + 9 - i * 0.75);
        d.rotation.set(0, a, 0);
        d.scale.set(0.8, 0.16, 1.4);
        d.updateMatrix();
        prints.setMatrixAt(printIndex++, d.matrix);
      }
    }
  }
  group.add(prints);

  const motesGeo = new THREE.BufferGeometry();
  const motesPositions = new Float32Array(85 * 3);
  for (let i = 0; i < 85; i++) {
    motesPositions[i * 3] = rr(-70, 70);
    motesPositions[i * 3 + 1] = rr(0.9, 5);
    motesPositions[i * 3 + 2] = rr(-70, 70);
  }
  motesGeo.setAttribute('position', new THREE.BufferAttribute(motesPositions, 3));
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({ color: 0xffe4a0, size: 0.12, transparent: true, opacity: 0.65, depthWrite: false }));
  group.add(motes);

  const grass = buildGrass(
    18000,
    () => {
      const x = (Math.random() * 2 - 1) * 78;
      const z = (Math.random() * 2 - 1) * 78;
      if (pathDistance(x, z) < 2.5 || guppyDistance(x, z) < 6.8 || Math.abs(z - riverZ(x)) < 2.6 || Math.hypot(x - 27, z + 10) < 9.2) return null;
      return { x, z };
    },
    [0x4f7f3a, 0x5d8f40, 0x456f35, 0x6a9a48],
    0.55,
  );
  group.add(grass);

  return {
    group, colliders, features, paths, grass,
    update(time) {
      fire.scale.y = 1.3 + Math.sin(time * 13) * 0.18;
      fire.rotation.y = time * 2;
      motes.position.y = Math.sin(time * 0.5) * 0.3;
      (motes.material as THREE.PointsMaterial).opacity = 0.5 + Math.sin(time * 1.7) * 0.18;
      exitMaterial.opacity = 0.12 + Math.sin(time * 2.2) * 0.035;
      for (let i = 0; i < gladeLanterns.length; i++) {
        gladeLanterns[i].emissiveIntensity = 1.35 + Math.sin(time * 5.6 + i * 2) * 0.2;
      }
    },
  };
}