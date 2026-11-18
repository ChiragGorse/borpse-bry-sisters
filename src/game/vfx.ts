import * as THREE from 'three';

const PI = Math.PI;
const TAU = PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function makeSoftPuffTex(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  if (x) {
    // layered cloud puffs so smoke/dust/foam looks organic rather than a flat circle
    const blobs: [number, number, number, number][] = [
      [64, 64, 54, 0.72],
      [48, 56, 36, 0.45],
      [80, 58, 34, 0.42],
      [60, 78, 35, 0.4],
      [66, 46, 30, 0.35],
    ];
    for (const [bx, by, br, a] of blobs) {
      const g = x.createRadialGradient(bx, by, br * 0.08, bx, by, br);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.55, `rgba(245,245,245,${a * 0.55})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
    }
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function makeSlashTex(): THREE.CanvasTexture {
  const W = 256;
  const H = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (x) {
    const img = x.createImageData(W, H);
    for (let j = 0; j < H; j++) {
      // v=0 inner edge, v=1 outer blade edge (sharp bright rim, softer inner wake)
      const v = j / (H - 1);
      const rim = Math.pow(Math.sin(Math.pow(v, 0.62) * PI), 1.35);
      const hotEdge = Math.exp(-Math.pow((v - 0.82) / 0.13, 2)) * 0.85;
      for (let i = 0; i < W; i++) {
        // u=0 tail, u=1 leading tip
        const u = i / (W - 1);
        const along = Math.pow(u, 1.35) * Math.sin(Math.min(1, (1 - u) * 7.5) * (PI / 2));
        // subtle wispy streaks along the swing
        const streak = 0.78 + 0.22 * Math.sin(v * 26 + u * 5) * Math.sin(v * 11 - u * 8);
        const a = Math.min(1, (rim * 0.78 + hotEdge) * along * streak);
        const white = Math.min(1, 0.75 + hotEdge * 0.55 + Math.pow(u, 3) * 0.35);
        const k = (j * W + i) * 4;
        img.data[k] = white * 255;
        img.data[k + 1] = white * 255;
        img.data[k + 2] = white * 255;
        img.data[k + 3] = a * 255;
      }
    }
    x.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function makeCraterTex(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  if (x) {
    const cx = S / 2;
    const cy = S / 2;
    // soft scorched ring
    const g = x.createRadialGradient(cx, cy, 8, cx, cy, 118);
    g.addColorStop(0, 'rgba(35,24,16,0.68)');
    g.addColorStop(0.38, 'rgba(52,36,24,0.42)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);

    // jagged radial fracture lines
    x.lineCap = 'round';
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 13; i++) {
      let a = (i / 13) * TAU + (rnd() - 0.5) * 0.28;
      let px = cx + Math.cos(a) * (10 + rnd() * 10);
      let py = cy + Math.sin(a) * (10 + rnd() * 10);
      const segs = 4 + ((rnd() * 3) | 0);
      for (let s = 0; s < segs; s++) {
        a += (rnd() - 0.5) * 0.52;
        const len = 14 + rnd() * 14;
        const nx = px + Math.cos(a) * len;
        const ny = py + Math.sin(a) * len;
        x.strokeStyle = `rgba(255,255,255,${(1 - s / segs) * 0.85})`;
        x.lineWidth = (1 - s / (segs + 1)) * 3.4;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(nx, ny);
        x.stroke();
        // occasional fork branch
        if (s === 1 && rnd() < 0.65) {
          const ba = a + (rnd() < 0.5 ? 0.65 : -0.65);
          x.lineWidth = 1.6;
          x.beginPath();
          x.moveTo(nx, ny);
          x.lineTo(nx + Math.cos(ba) * 18, ny + Math.sin(ba) * 18);
          x.stroke();
        }
        px = nx;
        py = ny;
      }
    }
  }
  return new THREE.CanvasTexture(c);
}

function makeSplashRingTex(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  if (x) {
    const cx = S / 2;
    const g = x.createRadialGradient(cx, cx, 18, cx, cx, 120);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.93, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    // foam droplets around outer edge
    let seed = 99;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU + rnd() * 0.14;
      const r = 82 + rnd() * 36;
      const sr = 2 + rnd() * 4.5;
      x.fillStyle = `rgba(255,255,255,${0.45 + rnd() * 0.45})`;
      x.beginPath();
      x.arc(cx + Math.cos(a) * r, cx + Math.sin(a) * r, sr, 0, TAU);
      x.fill();
    }
  }
  return new THREE.CanvasTexture(c);
}

/** Flat curved slash ribbon geometry in XZ spanning `arc` radians. */
function makeSlashGeo(innerR: number, outerR: number, arc: number, segs = 28): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = -arc * 0.5 + u * arc;
    // taper width slightly near tail and tip for a sharp crescent silhouette
    const pinch = Math.sin(Math.pow(u, 0.7) * PI);
    const r0 = innerR + (outerR - innerR) * (1 - pinch) * 0.42;
    const r1 = innerR + (outerR - innerR) * (0.55 + 0.45 * pinch);
    const sa = Math.sin(a);
    const ca = Math.cos(a);
    pos.push(sa * r0, 0, ca * r0, sa * r1, 0, ca * r1);
    uv.push(u, 0, u, 1);
    if (i < segs) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** 3D 6-pointed star burst geometry for crisp anime/arcade-meets-HDR hit flashes. */
function makeStarburstGeo(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const spike = new THREE.OctahedronGeometry(1, 0);
  spike.scale(0.14, 1.0, 0.14);
  const pos: number[] = [];
  const dirs: [number, number, number][] = [
    [0, 0, 0],
    [PI / 2, 0, 0],
    [0, 0, PI / 2],
    [PI / 4, PI / 4, 0],
    [-PI / 4, PI / 4, 0],
    [PI / 4, 0, PI / 4],
    [-PI / 4, 0, PI / 4],
  ];
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const src = spike.index ? spike.toNonIndexed() : spike;
  const a = src.attributes.position;
  for (let d = 0; d < dirs.length; d++) {
    e.set(dirs[d][0], dirs[d][1], dirs[d][2]);
    m.makeRotationFromEuler(e);
    const sc = d < 3 ? 1 : 0.72;
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).multiplyScalar(sc).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
    }
  }
  void g;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

interface SlashFx {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  spin: number;
  scale0: number;
  scale1: number;
  rise: number;
}

interface BurstFx {
  core: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  maxScale: number;
}

interface BoltFx {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
}

interface DecalFx {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  baseAlpha: number;
}

interface WaveFx {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  h0: number;
  h1: number;
  spin: number;
}

interface FlashLight {
  light: THREE.PointLight;
  t: number;
  dur: number;
  peak: number;
}

export interface SparkOpts {
  dirX?: number;
  dirY?: number;
  dirZ?: number;
  /** 0 = omnidirectional, 1 = tight directional cone. */
  focus?: number;
  hdr?: number;
  stretch?: number;
  drag?: number;
  grav?: number;
  up?: number;
  altColor?: number;
}

export interface PuffOpts {
  spread?: number;
  rise?: number;
  speed?: number;
  size0?: number;
  size1?: number;
  life?: number;
  opacity?: number;
  glow?: boolean;
}

export interface SlashOpts {
  x: number;
  y: number;
  z: number;
  heading: number;
  color: number;
  radius?: number;
  tiltX?: number;
  tiltZ?: number;
  spin?: number;
  dur?: number;
  wide?: boolean;
  full?: boolean;
  rise?: number;
  hdr?: number;
}

/**
 * High-impact 3D combat VFX manager:
 * - Velocity-stretched HDR additive sparks & embers (blooms cleanly under ACES)
 * - Soft volumetric billboard dust, steam, and water-mist clouds
 * - Tumbled shaded debris / chunks / droplets (backwards-compatible with `emit(...)`)
 * - Glowing crescent blade arcs & 360° cyclone/water ribbons
 * - 3D starburst impact flashes + pooled dynamic HDR point lights
 * - Branching 3D lightning bolts for Tesla Tusks & parries
 * - Expanding shockwave cylinders/domes & fading ground fracture/splash decals
 */
export class CombatVfx {
  readonly group = new THREE.Group();
  /** Scale particle counts with graphics preset (1 = Cinematic, 0.7 = Balanced, 0.45 = Fast). */
  density = 1;

  // 1) Velocity-aligned HDR additive sparks (640 instances)
  private sparkN = 640;
  private sparkMesh: THREE.InstancedMesh;
  private spP = new Float32Array(this.sparkN * 3);
  private spV = new Float32Array(this.sparkN * 3);
  private spLife = new Float32Array(this.sparkN);
  private spMax = new Float32Array(this.sparkN);
  private spSize = new Float32Array(this.sparkN);
  private spStretch = new Float32Array(this.sparkN);
  private spGrav = new Float32Array(this.sparkN);
  private spDrag = new Float32Array(this.sparkN);
  private spCur = 0;

  // 2) Soft billboard dust / smoke / mist puffs (360 instances)
  private puffN = 360;
  private puffMesh: THREE.InstancedMesh;
  private pfP = new Float32Array(this.puffN * 3);
  private pfV = new Float32Array(this.puffN * 3);
  private pfLife = new Float32Array(this.puffN);
  private pfMax = new Float32Array(this.puffN);
  private pfS0 = new Float32Array(this.puffN);
  private pfS1 = new Float32Array(this.puffN);
  private pfRot = new Float32Array(this.puffN);
  private pfCur = 0;

  // 3) Additive glowing orbs / embers / water motes (360 instances)
  private moteN = 360;
  private moteMesh: THREE.InstancedMesh;
  private mtP = new Float32Array(this.moteN * 3);
  private mtV = new Float32Array(this.moteN * 3);
  private mtLife = new Float32Array(this.moteN);
  private mtMax = new Float32Array(this.moteN);
  private mtSize = new Float32Array(this.moteN);
  private mtGrav = new Float32Array(this.moteN);
  private mtSwirl = new Float32Array(this.moteN);
  private mtCur = 0;

  // 4) Solid tumbled chunks / droplets / crumbs (420 instances)
  private chunkN = 420;
  private chunkMesh: THREE.InstancedMesh;
  private chP = new Float32Array(this.chunkN * 3);
  private chV = new Float32Array(this.chunkN * 3);
  private chLife = new Float32Array(this.chunkN);
  private chMax = new Float32Array(this.chunkN);
  private chSize = new Float32Array(this.chunkN);
  private chGrav = new Float32Array(this.chunkN);
  private chCur = 0;

  // Shared geometries & textures for transient mesh FX
  private slashTex: THREE.CanvasTexture;
  private craterTex: THREE.CanvasTexture;
  private splashTex: THREE.CanvasTexture;
  private arcGeo: THREE.BufferGeometry;
  private wideArcGeo: THREE.BufferGeometry;
  private fullArcGeo: THREE.BufferGeometry;
  private starGeo: THREE.BufferGeometry;
  private burstRingGeo: THREE.BufferGeometry;
  private waveCylGeo: THREE.BufferGeometry;
  private decalGeo: THREE.BufferGeometry;

  private slashes: SlashFx[] = [];
  private bursts: BurstFx[] = [];
  private bolts: BoltFx[] = [];
  private decals: DecalFx[] = [];
  private waves: WaveFx[] = [];
  private lights: FlashLight[] = [];

  private d = new THREE.Object3D();
  private c = new THREE.Color();
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private camQ = new THREE.Quaternion();
  private spinQ = new THREE.Quaternion();
  private zAxis = new THREE.Vector3(0, 0, 1);

  constructor() {
    this.group.userData.noAO = true;

    // Sparks: elongated octahedron along +Y so quaternion.setFromUnitVectors(UP, velDir) stretches along flight path
    const sparkGeo = new THREE.OctahedronGeometry(0.5, 0);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
    });
    this.sparkMesh = this.initPool(sparkGeo, sparkMat, this.sparkN);

    // Puffs: soft painted cloud card
    const puffTex = makeSoftPuffTex();
    const puffGeo = new THREE.PlaneGeometry(1, 1);
    const puffMat = new THREE.MeshBasicMaterial({
      map: puffTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      fog: true,
    });
    this.puffMesh = this.initPool(puffGeo, puffMat, this.puffN);

    // Glowing motes / plasma / water glints
    const moteGeo = new THREE.IcosahedronGeometry(0.5, 0);
    const moteMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.moteMesh = this.initPool(moteGeo, moteMat, this.moteN);

    // Tumbled chunks (dodecahedrons look far richer than raw cubes)
    const chunkGeo = new THREE.DodecahedronGeometry(0.58, 0);
    const chunkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.chunkMesh = this.initPool(chunkGeo, chunkMat, this.chunkN);

    this.slashTex = makeSlashTex();
    this.craterTex = makeCraterTex();
    this.splashTex = makeSplashRingTex();
    this.arcGeo = makeSlashGeo(0.56, 1.05, PI * 0.92, 28);
    this.wideArcGeo = makeSlashGeo(0.45, 1.12, PI * 1.32, 34);
    this.fullArcGeo = makeSlashGeo(0.52, 1.08, PI * 1.88, 42);
    this.starGeo = makeStarburstGeo();
    this.burstRingGeo = new THREE.RingGeometry(0.78, 1.0, 36);
    this.waveCylGeo = new THREE.CylinderGeometry(1.06, 0.92, 1, 36, 1, true);
    this.waveCylGeo.translate(0, 0.5, 0);
    this.decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2);

    // Pooled dynamic impact lights (3 reusable point lights, active on Cinematic preset)
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffd27a, 0, 14, 1.7);
      light.castShadow = false;
      light.visible = false;
      this.group.add(light);
      this.lights.push({ light, t: 0, dur: 0.2, peak: 0 });
    }
  }

  private initPool(geo: THREE.BufferGeometry, mat: THREE.Material, count: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.noAO = true;
    this.d.scale.setScalar(0);
    this.d.updateMatrix();
    this.c.setHex(0xffffff);
    for (let i = 0; i < count; i++) {
      m.setMatrixAt(i, this.d.matrix);
      m.setColorAt(i, this.c);
    }
    this.group.add(m);
    return m;
  }

  private scaled(count: number, min = 1): number {
    if (count <= 0) return 0;
    return Math.max(min, Math.round(count * this.density));
  }

  /**
   * Drop-in enhanced replacement for the old `parts.emit(...)`: emits organic chunks PLUS paired bright sparks
   * so every existing call site across the game immediately feels livelier.
   */
  emit(x: number, y: number, z: number, count: number, color: number, speed: number, size: number, life: number, grav = 20, up = 0.6) {
    const n = this.scaled(count);
    this.c.setHex(color);
    const lum = this.c.r * 0.3 + this.c.g * 0.59 + this.c.b * 0.11;
    const isDust = color === 0xe9dfc8 || color === 0xd7b684 || color === 0x5c4030;
    const isBright = lum > 0.52 && !isDust;

    if (isDust) {
      this.dust(x, y, z, Math.max(1, Math.ceil(n * 0.85)), color, {
        speed: speed * 0.55,
        size0: size * 1.4,
        size1: size * 4.4,
        life: life * 1.25,
        rise: 1.6 + up * 1.4,
      });
      // kick up a few tiny dirt clods too
      this.chunks(x, y, z, Math.max(1, Math.floor(n * 0.45)), color, speed * 0.9, size * 0.65, life * 0.9, grav + 8, up);
      return;
    }

    if (isBright) {
      this.sparks(x, y, z, Math.ceil(n * 1.15), color, speed * 1.25, size * 0.72, life * 0.95, {
        grav: grav * 0.85,
        up,
        hdr: 3.4,
        stretch: 3.6,
        altColor: 0xffffff,
      });
      this.motes(x, y, z, Math.max(1, Math.floor(n * 0.45)), color, speed * 0.7, size * 0.9, life * 1.1, grav * 0.25, 0);
      return;
    }

    this.chunks(x, y, z, n, color, speed, size * 0.85, life, grav, up);
    if (n >= 4) {
      this.sparks(x, y, z, Math.ceil(n * 0.45), color, speed * 1.2, size * 0.55, life * 0.75, { grav, up, hdr: 2.6, stretch: 2.8 });
    }
  }

  /** Solid tumbled chunks (clay shards, mud clods, crop crumbs, grill metal). */
  chunks(x: number, y: number, z: number, count: number, color: number, speed: number, size: number, life: number, grav = 22, up = 0.65) {
    const n = this.scaled(count);
    for (let k = 0; k < n; k++) {
      const i = this.chCur;
      this.chCur = (this.chCur + 1) % this.chunkN;
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.75);
      const j = i * 3;
      this.chP[j] = x + (Math.random() - 0.5) * 0.25;
      this.chP[j + 1] = y + (Math.random() - 0.5) * 0.2;
      this.chP[j + 2] = z + (Math.random() - 0.5) * 0.25;
      this.chV[j] = Math.cos(a) * s;
      this.chV[j + 1] = s * up * (0.45 + Math.random() * 0.95);
      this.chV[j + 2] = Math.sin(a) * s;
      this.chLife[i] = this.chMax[i] = life * (0.6 + Math.random() * 0.5);
      this.chSize[i] = size * (0.55 + Math.random() * 0.75);
      this.chGrav[i] = grav;
      const shade = 0.85 + Math.random() * 0.45;
      this.chunkMesh.setColorAt(i, this.c.setHex(color).multiplyScalar(shade * 1.35));
    }
    if (this.chunkMesh.instanceColor) this.chunkMesh.instanceColor.needsUpdate = true;
  }

  /** Velocity-stretched HDR sparks that streak, bounce off the ground, and bloom cleanly. */
  sparks(x: number, y: number, z: number, count: number, color: number, speed: number, size: number, life: number, o: SparkOpts = {}) {
    const n = this.scaled(count);
    const hdr = o.hdr ?? 3.8;
    const stretch = o.stretch ?? 4.2;
    const drag = o.drag ?? 2.4;
    const grav = o.grav ?? 18;
    const up = o.up ?? 0.65;
    const focus = o.focus ?? 0;
    const dx = o.dirX ?? 0;
    const dy = o.dirY ?? 0.35;
    const dz = o.dirZ ?? 0;

    for (let k = 0; k < n; k++) {
      const i = this.spCur;
      this.spCur = (this.spCur + 1) % this.sparkN;
      const a = Math.random() * TAU;
      const elev = (Math.random() - 0.22) * PI * 0.65;
      const ce = Math.cos(elev);
      let vx = Math.cos(a) * ce;
      let vy = Math.sin(elev) * 0.7 + up * (0.3 + Math.random() * 0.7);
      let vz = Math.sin(a) * ce;
      if (focus > 0) {
        vx = vx * (1 - focus) + dx * focus + (Math.random() - 0.5) * 0.45;
        vy = vy * (1 - focus) + dy * focus + Math.random() * 0.4;
        vz = vz * (1 - focus) + dz * focus + (Math.random() - 0.5) * 0.45;
      }
      const vl = Math.hypot(vx, vy, vz) || 1;
      const s = speed * (0.45 + Math.random() * 0.85);
      const j = i * 3;
      this.spP[j] = x + (Math.random() - 0.5) * 0.22;
      this.spP[j + 1] = y + (Math.random() - 0.5) * 0.22;
      this.spP[j + 2] = z + (Math.random() - 0.5) * 0.22;
      this.spV[j] = (vx / vl) * s;
      this.spV[j + 1] = (vy / vl) * s;
      this.spV[j + 2] = (vz / vl) * s;
      this.spLife[i] = this.spMax[i] = life * (0.55 + Math.random() * 0.6);
      this.spSize[i] = size * (0.55 + Math.random() * 0.7);
      this.spStretch[i] = stretch * (0.75 + Math.random() * 0.6);
      this.spGrav[i] = grav;
      this.spDrag[i] = drag;
      const pickCol = o.altColor !== undefined && Math.random() < 0.34 ? o.altColor : color;
      this.c.setHex(pickCol).multiplyScalar(hdr * (0.8 + Math.random() * 0.45));
      this.sparkMesh.setColorAt(i, this.c);
    }
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  /** Soft volumetric camera-facing dust, smoke, steam, or water-mist puffs. */
  dust(x: number, y: number, z: number, count: number, color: number, o: PuffOpts = {}) {
    const n = this.scaled(count);
    const spread = o.spread ?? 0.35;
    const speed = o.speed ?? 3.2;
    const rise = o.rise ?? 1.8;
    const s0 = o.size0 ?? 0.45;
    const s1 = o.size1 ?? 1.85;
    const life = o.life ?? 0.62;
    const boost = o.glow ? 2.1 : 1.15;

    for (let k = 0; k < n; k++) {
      const i = this.pfCur;
      this.pfCur = (this.pfCur + 1) % this.puffN;
      const a = Math.random() * TAU;
      const r = Math.random() * spread;
      const sp = speed * (0.35 + Math.random() * 0.8);
      const j = i * 3;
      this.pfP[j] = x + Math.cos(a) * r;
      this.pfP[j + 1] = y + Math.random() * 0.22;
      this.pfP[j + 2] = z + Math.sin(a) * r;
      this.pfV[j] = Math.cos(a) * sp;
      this.pfV[j + 1] = rise * (0.55 + Math.random() * 0.75);
      this.pfV[j + 2] = Math.sin(a) * sp;
      this.pfLife[i] = this.pfMax[i] = life * (0.7 + Math.random() * 0.45);
      this.pfS0[i] = s0 * (0.75 + Math.random() * 0.45);
      this.pfS1[i] = s1 * (0.75 + Math.random() * 0.5);
      this.pfRot[i] = Math.random() * TAU;
      const sh = (0.86 + Math.random() * 0.28) * boost;
      this.puffMesh.setColorAt(i, this.c.setHex(color).multiplyScalar(sh));
    }
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;
  }

  /** Radial ring of dust puffs hugging the ground (great for slams, landings, and shockwaves). */
  dustRing(x: number, y: number, z: number, count: number, radius: number, color: number, outSpeed = 7, size = 1.9, life = 0.75) {
    const n = this.scaled(count, 4);
    for (let k = 0; k < n; k++) {
      const i = this.pfCur;
      this.pfCur = (this.pfCur + 1) % this.puffN;
      const a = (k / n) * TAU + (Math.random() - 0.5) * 0.3;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sp = outSpeed * (0.65 + Math.random() * 0.55);
      const j = i * 3;
      this.pfP[j] = x + ca * radius;
      this.pfP[j + 1] = y + 0.18 + Math.random() * 0.2;
      this.pfP[j + 2] = z + sa * radius;
      this.pfV[j] = ca * sp;
      this.pfV[j + 1] = 1.2 + Math.random() * 1.8;
      this.pfV[j + 2] = sa * sp;
      this.pfLife[i] = this.pfMax[i] = life * (0.75 + Math.random() * 0.4);
      this.pfS0[i] = size * 0.38;
      this.pfS1[i] = size * (0.85 + Math.random() * 0.45);
      this.pfRot[i] = Math.random() * TAU;
      this.puffMesh.setColorAt(i, this.c.setHex(color).multiplyScalar(1.12));
    }
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;
  }

  /** Luminous floating embers, water bubbles, or aura motes with optional orbital swirl. */
  motes(x: number, y: number, z: number, count: number, color: number, speed: number, size: number, life: number, grav = -2, swirl = 0, spread = 0.35, hdr = 3.2) {
    const n = this.scaled(count);
    for (let k = 0; k < n; k++) {
      const i = this.mtCur;
      this.mtCur = (this.mtCur + 1) % this.moteN;
      const a = Math.random() * TAU;
      const r = Math.random() * spread;
      const sp = speed * (0.35 + Math.random() * 0.75);
      const j = i * 3;
      this.mtP[j] = x + Math.cos(a) * r;
      this.mtP[j + 1] = y + (Math.random() - 0.3) * spread * 0.7;
      this.mtP[j + 2] = z + Math.sin(a) * r;
      this.mtV[j] = Math.cos(a) * sp - Math.sin(a) * swirl;
      this.mtV[j + 1] = (0.4 + Math.random() * 0.9) * Math.max(1.5, speed * 0.55);
      this.mtV[j + 2] = Math.sin(a) * sp + Math.cos(a) * swirl;
      this.mtLife[i] = this.mtMax[i] = life * (0.65 + Math.random() * 0.5);
      this.mtSize[i] = size * (0.55 + Math.random() * 0.7);
      this.mtGrav[i] = grav;
      this.mtSwirl[i] = swirl;
      this.moteMesh.setColorAt(i, this.c.setHex(color).multiplyScalar(hdr * (0.8 + Math.random() * 0.4)));
    }
    if (this.moteMesh.instanceColor) this.moteMesh.instanceColor.needsUpdate = true;
  }

  /** Rich water splash combining glossy aqua streaks, white foam mist, and rising droplets (for Trout-Fu!). */
  waterBurst(x: number, y: number, z: number, intensity = 1, swirl = 0) {
    this.sparks(x, y, z, Math.round(18 * intensity), 0x4be3ff, 11 * (0.75 + intensity * 0.25), 0.19, 0.48, {
      grav: 24,
      up: 0.95,
      hdr: 3.4,
      stretch: 3.4,
      altColor: 0xe8fdff,
    });
    this.dust(x, y + 0.15, z, Math.round(7 * intensity), 0xb8f5ff, {
      spread: 0.5 * intensity,
      speed: 4.8 * intensity,
      rise: 2.2,
      size0: 0.5,
      size1: 1.9 * (0.7 + intensity * 0.3),
      life: 0.5,
      glow: true,
    });
    this.motes(x, y + 0.25, z, Math.round(10 * intensity), 0x8ef6ff, 5.5, 0.2, 0.65, 9, swirl, 0.6 * intensity, 3.0);
  }

  /** Sweeping glowing 3D crescent blade arc or 360° cyclone ribbon. */
  slash(o: SlashOpts) {
    const geo = o.full ? this.fullArcGeo : o.wide ? this.wideArcGeo : this.arcGeo;
    const col = new THREE.Color(o.color).multiplyScalar(o.hdr ?? 3.4);
    const mat = new THREE.MeshBasicMaterial({
      map: this.slashTex,
      color: col,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(o.x, o.y, o.z);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(o.tiltX ?? 0, o.heading, o.tiltZ ?? 0);
    const r = o.radius ?? 2.2;
    mesh.scale.setScalar(r * 0.72);
    mesh.userData.noAO = true;
    this.group.add(mesh);
    this.slashes.push({
      mesh,
      mat,
      t: 0,
      dur: o.dur ?? 0.24,
      spin: o.spin ?? 5.5,
      scale0: r * 0.74,
      scale1: r * 1.18,
      rise: o.rise ?? 0,
    });
  }

  /** High-impact 3D hit burst: HDR starburst spikes + shock halo + directional sparks + real point-light flash. */
  hitBurst(x: number, y: number, z: number, color: number, scale = 1, dirX = 0, dirZ = 0) {
    const hdrCol = new THREE.Color(color).multiplyScalar(4.4);
    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffffff).lerp(new THREE.Color(color), 0.35).multiplyScalar(5.0),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(this.starGeo, coreMat);
    core.position.set(x, y, z);
    core.rotation.set(Math.random() * PI, Math.random() * PI, Math.random() * PI);
    core.scale.setScalar(0.25 * scale);
    core.userData.noAO = true;

    const ringMat = new THREE.MeshBasicMaterial({
      color: hdrCol,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(this.burstRingGeo, ringMat);
    ring.position.set(x, y, z);
    ring.scale.setScalar(0.3 * scale);
    ring.userData.noAO = true;

    this.group.add(core, ring);
    this.bursts.push({ core, coreMat, ring, ringMat, t: 0, dur: 0.19 + 0.05 * Math.min(scale, 2), maxScale: 0.92 * scale });

    const hasDir = dirX !== 0 || dirZ !== 0;
    this.sparks(x, y, z, Math.round(14 + 12 * scale), color, 12 + 5 * scale, 0.16 + 0.04 * scale, 0.38 + 0.1 * scale, {
      dirX,
      dirY: 0.42,
      dirZ,
      focus: hasDir ? 0.52 : 0,
      hdr: 4.2,
      stretch: 4.8,
      grav: 18,
      altColor: 0xffffff,
    });
    this.flash(x, y + 0.3, z, color, 8 * scale, 0.18 + 0.05 * scale, 8 + 3 * scale);
  }

  /** Pooled short-lived point light that illuminates nearby characters, buildings, and grass on big hits. */
  flash(x: number, y: number, z: number, color: number, intensity = 10, dur = 0.22, distance = 12) {
    if (this.density < 0.9) return;
    let slot = this.lights.find((l) => !l.light.visible);
    if (!slot) slot = this.lights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    slot.light.color.setHex(color);
    slot.light.position.set(x, y, z);
    slot.light.intensity = intensity;
    slot.light.distance = distance;
    slot.light.visible = true;
    slot.t = 0;
    slot.dur = dur;
    slot.peak = intensity;
  }

  /** Jagged 3D lightning bolt snapping between two world points (with optional secondary fork). */
  lightning(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color = 0x6ff7ff, thickness = 0.085, dur = 0.24) {
    const start = new THREE.Vector3(x0, y0, z0);
    const end = new THREE.Vector3(x1, y1, z1);
    const len = start.distanceTo(end);
    const segs = Math.max(6, Math.min(16, Math.round(len * 1.4)));
    const jitter = Math.min(0.85, len * 0.13);
    const pts: THREE.Vector3[] = [start.clone()];
    for (let i = 1; i < segs; i++) {
      const f = i / segs;
      const env = Math.sin(f * PI);
      const p = start.clone().lerp(end, f);
      p.x += (Math.random() - 0.5) * 2 * jitter * env;
      p.y += (Math.random() - 0.38) * 2 * jitter * env;
      p.z += (Math.random() - 0.5) * 2 * jitter * env;
      pts.push(p);
    }
    pts.push(end.clone());

    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, segs * 2, thickness, 5, false);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(4.8),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.noAO = true;
    this.group.add(mesh);
    this.bolts.push({ mesh, mat, t: 0, dur });

    // spark shower at endpoint
    this.sparks(x1, y1, z1, 10, color, 11, 0.14, 0.32, { grav: 6, hdr: 4.5, stretch: 4.5, altColor: 0xffffff });
  }

  /** Expanding 3D cylindrical shockwave / vortex wall (great for slams, Belly Flop, Squeal, Shield break, River Rush). */
  shockWall(x: number, y: number, z: number, color: number, r0: number, r1: number, h0 = 0.6, h1 = 2.4, dur = 0.42, spin = 3) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.slashTex,
      color: new THREE.Color(color).multiplyScalar(2.7),
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.waveCylGeo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.random() * TAU;
    mesh.scale.set(r0, h0, r0);
    mesh.userData.noAO = true;
    this.group.add(mesh);
    this.waves.push({ mesh, mat, t: 0, dur, r0, r1, h0, h1, spin });
  }

  /** Ground impact fracture or glowing foam-splash ring that fades cleanly over a couple of seconds. */
  groundMark(x: number, y: number, z: number, radius: number, kind: 'crater' | 'splash', color = 0xffb266, dur = 2.4) {
    // cap active decals so the scene always stays light
    while (this.decals.length >= 14) {
      const old = this.decals.shift()!;
      this.group.remove(old.mesh);
      old.mat.dispose();
    }
    const splash = kind === 'splash';
    const mat = new THREE.MeshBasicMaterial({
      map: splash ? this.splashTex : this.craterTex,
      color: splash ? new THREE.Color(color).multiplyScalar(2.2) : new THREE.Color(color).multiplyScalar(1.5),
      transparent: true,
      opacity: splash ? 0.85 : 0.78,
      blending: splash ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -16,
    });
    const mesh = new THREE.Mesh(this.decalGeo, mat);
    mesh.position.set(x, y + 0.08, z);
    mesh.rotation.y = Math.random() * TAU;
    mesh.scale.setScalar(radius * 2);
    mesh.userData.noAO = true;
    this.group.add(mesh);
    this.decals.push({ mesh, mat, t: 0, dur, baseAlpha: mat.opacity });
  }

  /** Directional jet of speed lines & flame/water streaks behind a charging character. */
  chargeTrail(x: number, y: number, z: number, hx: number, hz: number, style: 'dust' | 'rocket' | 'river' | 'boss') {
    const bx = x - hx * 0.7;
    const bz = z - hz * 0.7;
    if (style === 'river') {
      this.sparks(bx, y + 0.55, bz, 3, 0x45e6ff, 11, 0.16, 0.28, {
        dirX: -hx,
        dirY: 0.18,
        dirZ: -hz,
        focus: 0.78,
        hdr: 4.0,
        stretch: 5.5,
        grav: 6,
        altColor: 0xffffff,
      });
      this.dust(bx, y + 0.25, bz, 1, 0x9bf5ff, { speed: 2.2, rise: 1.1, size0: 0.45, size1: 1.45, life: 0.34, glow: true });
    } else if (style === 'rocket') {
      this.sparks(bx, y + 0.45, bz, 3, 0xff7a1a, 12, 0.16, 0.26, {
        dirX: -hx,
        dirY: 0.15,
        dirZ: -hz,
        focus: 0.8,
        hdr: 4.4,
        stretch: 5.2,
        grav: 3,
        altColor: 0xffe26a,
      });
      this.dust(bx, y + 0.22, bz, 1, 0xd8cfc2, { speed: 2.0, rise: 1.4, size0: 0.4, size1: 1.4, life: 0.42 });
    } else if (style === 'boss') {
      this.sparks(bx, y + 1.4, bz, 3, 0xff8a2e, 13, 0.2, 0.28, {
        dirX: -hx,
        dirY: 0.15,
        dirZ: -hz,
        focus: 0.75,
        hdr: 3.8,
        stretch: 5.0,
        grav: 6,
        altColor: 0xffd86b,
      });
      this.dust(bx, y + 0.25, bz, 2, 0xd7b684, { spread: 0.8, speed: 3.5, rise: 1.8, size0: 0.7, size1: 2.4, life: 0.52 });
    } else {
      this.sparks(bx, y + 0.5, bz, 2, 0xfff0c4, 9, 0.13, 0.22, {
        dirX: -hx,
        dirY: 0.1,
        dirZ: -hz,
        focus: 0.82,
        hdr: 3.0,
        stretch: 5.0,
        grav: 2,
      });
      this.dust(bx, y + 0.2, bz, 1, 0xe6dac2, { speed: 2.0, rise: 1.2, size0: 0.4, size1: 1.35, life: 0.4 });
    }
  }

  update(dt: number, camera: THREE.Camera) {
    if (dt <= 0) return;
    this.camQ.copy(camera.quaternion);

    // 1) Update velocity-aligned sparks
    let sparkDirty = false;
    for (let i = 0; i < this.sparkN; i++) {
      if (this.spLife[i] <= 0) continue;
      sparkDirty = true;
      this.spLife[i] -= dt;
      if (this.spLife[i] <= 0) {
        this.d.scale.setScalar(0);
        this.d.updateMatrix();
        this.sparkMesh.setMatrixAt(i, this.d.matrix);
        continue;
      }
      const j = i * 3;
      const drag = Math.exp(-this.spDrag[i] * dt);
      this.spV[j] *= drag;
      this.spV[j + 2] *= drag;
      this.spV[j + 1] = this.spV[j + 1] * drag - this.spGrav[i] * dt;
      this.spP[j] += this.spV[j] * dt;
      this.spP[j + 1] += this.spV[j + 1] * dt;
      this.spP[j + 2] += this.spV[j + 2] * dt;
      if (this.spP[j + 1] < 0.06) {
        this.spP[j + 1] = 0.06;
        this.spV[j + 1] = Math.abs(this.spV[j + 1]) * 0.42;
        this.spV[j] *= 0.72;
        this.spV[j + 2] *= 0.72;
      }
      const rem = this.spLife[i] / this.spMax[i];
      const vx = this.spV[j];
      const vy = this.spV[j + 1];
      const vz = this.spV[j + 2];
      const spd = Math.hypot(vx, vy, vz);
      const w = this.spSize[i] * Math.pow(rem, 0.55);
      const len = w * Math.max(1.2, Math.min(this.spStretch[i], 0.8 + spd * 0.28));
      this.d.position.set(this.spP[j], this.spP[j + 1], this.spP[j + 2]);
      if (spd > 0.05) {
        this.v.set(vx / spd, vy / spd, vz / spd);
        this.d.quaternion.setFromUnitVectors(UP, this.v);
      }
      this.d.scale.set(w, len, w);
      this.d.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.d.matrix);
    }
    if (sparkDirty) this.sparkMesh.instanceMatrix.needsUpdate = true;

    // 2) Update soft camera-facing puffs
    let puffDirty = false;
    for (let i = 0; i < this.puffN; i++) {
      if (this.pfLife[i] <= 0) continue;
      puffDirty = true;
      this.pfLife[i] -= dt;
      if (this.pfLife[i] <= 0) {
        this.d.scale.setScalar(0);
        this.d.updateMatrix();
        this.puffMesh.setMatrixAt(i, this.d.matrix);
        continue;
      }
      const j = i * 3;
      const damp = Math.exp(-3.2 * dt);
      this.pfV[j] *= damp;
      this.pfV[j + 2] *= damp;
      this.pfV[j + 1] *= Math.exp(-1.4 * dt);
      this.pfP[j] += this.pfV[j] * dt;
      this.pfP[j + 1] += this.pfV[j + 1] * dt;
      this.pfP[j + 2] += this.pfV[j + 2] * dt;
      const p = 1 - this.pfLife[i] / this.pfMax[i];
      // bloom out quickly, then gently shrink out at end of life so no alpha attribute is needed
      const grow = this.pfS0[i] + (this.pfS1[i] - this.pfS0[i]) * (1 - Math.pow(1 - p, 2.2));
      const fade = p > 0.55 ? Math.max(0, 1 - (p - 0.55) / 0.45) : 1;
      const s = grow * Math.pow(fade, 0.7);
      this.pfRot[i] += dt * (i % 2 ? 0.9 : -0.9);
      this.spinQ.setFromAxisAngle(this.zAxis, this.pfRot[i]);
      this.q.copy(this.camQ).multiply(this.spinQ);
      this.d.position.set(this.pfP[j], this.pfP[j + 1], this.pfP[j + 2]);
      this.d.quaternion.copy(this.q);
      this.d.scale.setScalar(s);
      this.d.updateMatrix();
      this.puffMesh.setMatrixAt(i, this.d.matrix);
    }
    if (puffDirty) this.puffMesh.instanceMatrix.needsUpdate = true;

    // 3) Update luminous motes / embers
    let moteDirty = false;
    for (let i = 0; i < this.moteN; i++) {
      if (this.mtLife[i] <= 0) continue;
      moteDirty = true;
      this.mtLife[i] -= dt;
      if (this.mtLife[i] <= 0) {
        this.d.scale.setScalar(0);
        this.d.updateMatrix();
        this.moteMesh.setMatrixAt(i, this.d.matrix);
        continue;
      }
      const j = i * 3;
      this.mtV[j + 1] -= this.mtGrav[i] * dt;
      const sw = this.mtSwirl[i];
      if (sw !== 0) {
        const vx = this.mtV[j];
        const vz = this.mtV[j + 2];
        const ca = Math.cos(sw * dt);
        const sa = Math.sin(sw * dt);
        this.mtV[j] = vx * ca - vz * sa;
        this.mtV[j + 2] = vx * sa + vz * ca;
      }
      const damp = Math.exp(-1.8 * dt);
      this.mtV[j] *= damp;
      this.mtV[j + 2] *= damp;
      this.mtP[j] += this.mtV[j] * dt;
      this.mtP[j + 1] = Math.max(0.08, this.mtP[j + 1] + this.mtV[j + 1] * dt);
      this.mtP[j + 2] += this.mtV[j + 2] * dt;
      const rem = this.mtLife[i] / this.mtMax[i];
      const pulse = 0.82 + 0.25 * Math.sin(this.mtLife[i] * 22 + i);
      const s = this.mtSize[i] * Math.sin(Math.min(1, rem * 1.25) * (PI / 2)) * pulse;
      this.d.position.set(this.mtP[j], this.mtP[j + 1], this.mtP[j + 2]);
      this.d.rotation.set(i + this.mtLife[i] * 4, this.mtLife[i] * 5, i * 0.7);
      this.d.scale.setScalar(s);
      this.d.updateMatrix();
      this.moteMesh.setMatrixAt(i, this.d.matrix);
    }
    if (moteDirty) this.moteMesh.instanceMatrix.needsUpdate = true;

    // 4) Update tumbled debris chunks
    let chunkDirty = false;
    for (let i = 0; i < this.chunkN; i++) {
      if (this.chLife[i] <= 0) continue;
      chunkDirty = true;
      this.chLife[i] -= dt;
      if (this.chLife[i] <= 0) {
        this.d.scale.setScalar(0);
        this.d.updateMatrix();
        this.chunkMesh.setMatrixAt(i, this.d.matrix);
        continue;
      }
      const j = i * 3;
      this.chV[j + 1] -= this.chGrav[i] * dt;
      this.chP[j] += this.chV[j] * dt;
      this.chP[j + 1] += this.chV[j + 1] * dt;
      this.chP[j + 2] += this.chV[j + 2] * dt;
      if (this.chP[j + 1] < 0.06) {
        this.chP[j + 1] = 0.06;
        this.chV[j + 1] *= -0.34;
        this.chV[j] *= 0.62;
        this.chV[j + 2] *= 0.62;
      }
      const s = this.chSize[i] * Math.min(1, (this.chLife[i] / this.chMax[i]) * 2.1);
      this.d.position.set(this.chP[j], this.chP[j + 1], this.chP[j + 2]);
      this.d.rotation.set(i + this.chLife[i] * 7, this.chLife[i] * 9, i * 2);
      this.d.scale.set(s, s * 0.78, s * 1.12);
      this.d.updateMatrix();
      this.chunkMesh.setMatrixAt(i, this.d.matrix);
    }
    if (chunkDirty) this.chunkMesh.instanceMatrix.needsUpdate = true;

    // 5) Slash ribbons
    this.slashes = this.slashes.filter((s) => {
      s.t += dt;
      const p = s.t / s.dur;
      if (p >= 1) {
        this.group.remove(s.mesh);
        s.mat.dispose();
        return false;
      }
      const ease = 1 - Math.pow(1 - p, 2.4);
      s.mesh.rotation.y += s.spin * dt;
      s.mesh.position.y += s.rise * dt;
      s.mesh.scale.setScalar(s.scale0 + (s.scale1 - s.scale0) * ease);
      s.mat.opacity = Math.pow(1 - p, 1.45) * 0.95;
      return true;
    });

    // 6) Hit starbursts & camera-facing shock halos
    this.bursts = this.bursts.filter((b) => {
      b.t += dt;
      const p = b.t / b.dur;
      if (p >= 1) {
        this.group.remove(b.core, b.ring);
        b.coreMat.dispose();
        b.ringMat.dispose();
        return false;
      }
      const pop = Math.sin(Math.min(1, p * 1.35) * PI);
      b.core.scale.setScalar(b.maxScale * (0.35 + pop * 0.95));
      b.core.rotation.y += dt * 7;
      b.coreMat.opacity = Math.pow(1 - p, 1.3);
      const ringEase = 1 - Math.pow(1 - p, 2.6);
      b.ring.quaternion.copy(this.camQ);
      b.ring.scale.setScalar(b.maxScale * (0.32 + ringEase * 1.45));
      b.ringMat.opacity = Math.pow(1 - p, 1.7) * 0.92;
      return true;
    });

    // 7) Lightning arcs (flicker sharply as they fade)
    this.bolts = this.bolts.filter((b) => {
      b.t += dt;
      const p = b.t / b.dur;
      if (p >= 1) {
        this.group.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mat.dispose();
        return false;
      }
      const flicker = Math.random() < 0.78 ? 1 : 0.35;
      b.mat.opacity = (1 - p * p) * flicker;
      return true;
    });

    // 8) Expanding shock walls / vortex cylinders
    this.waves = this.waves.filter((w) => {
      w.t += dt;
      const p = w.t / w.dur;
      if (p >= 1) {
        this.group.remove(w.mesh);
        w.mat.dispose();
        return false;
      }
      const ease = 1 - Math.pow(1 - p, 2.5);
      const r = w.r0 + (w.r1 - w.r0) * ease;
      const h = (w.h0 + (w.h1 - w.h0) * (1 - p * 0.55)) * (1 - p * 0.35);
      w.mesh.scale.set(r, Math.max(0.05, h), r);
      w.mesh.rotation.y += w.spin * dt;
      w.mat.opacity = Math.pow(1 - p, 1.55) * 0.82;
      return true;
    });

    // 9) Ground fracture / foam decals
    this.decals = this.decals.filter((dc) => {
      dc.t += dt;
      const p = dc.t / dc.dur;
      if (p >= 1) {
        this.group.remove(dc.mesh);
        dc.mat.dispose();
        return false;
      }
      const fade = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
      dc.mat.opacity = dc.baseAlpha * fade * fade;
      return true;
    });

    // 10) Dynamic impact point lights
    for (const fl of this.lights) {
      if (!fl.light.visible) continue;
      fl.t += dt;
      const p = fl.t / fl.dur;
      if (p >= 1) {
        fl.light.intensity = 0;
        fl.light.visible = false;
      } else {
        fl.light.intensity = fl.peak * Math.pow(1 - p, 1.8);
      }
    }
  }

  clear() {
    this.d.scale.setScalar(0);
    this.d.updateMatrix();
    const zeroPool = (life: Float32Array, mesh: THREE.InstancedMesh, n: number) => {
      life.fill(0);
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, this.d.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    };
    zeroPool(this.spLife, this.sparkMesh, this.sparkN);
    zeroPool(this.pfLife, this.puffMesh, this.puffN);
    zeroPool(this.mtLife, this.moteMesh, this.moteN);
    zeroPool(this.chLife, this.chunkMesh, this.chunkN);

    for (const s of this.slashes) {
      this.group.remove(s.mesh);
      s.mat.dispose();
    }
    this.slashes = [];
    for (const b of this.bursts) {
      this.group.remove(b.core, b.ring);
      b.coreMat.dispose();
      b.ringMat.dispose();
    }
    this.bursts = [];
    for (const b of this.bolts) {
      this.group.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mat.dispose();
    }
    this.bolts = [];
    for (const w of this.waves) {
      this.group.remove(w.mesh);
      w.mat.dispose();
    }
    this.waves = [];
    for (const dc of this.decals) {
      this.group.remove(dc.mesh);
      dc.mat.dispose();
    }
    this.decals = [];
    for (const fl of this.lights) {
      fl.light.intensity = 0;
      fl.light.visible = false;
    }
  }

  dispose() {
    this.clear();
    this.slashTex.dispose();
    this.craterTex.dispose();
    this.splashTex.dispose();
    this.arcGeo.dispose();
    this.wideArcGeo.dispose();
    this.fullArcGeo.dispose();
    this.starGeo.dispose();
    this.burstRingGeo.dispose();
    this.waveCylGeo.dispose();
    this.decalGeo.dispose();
    for (const m of [this.sparkMesh, this.puffMesh, this.moteMesh, this.chunkMesh]) {
      m.geometry.dispose();
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  }
}
