/**
 * Potato graphics: every lit, textured material in the scene is swapped for a flat, unlit colour
 * (with one cheap exception: in the dark forest Herb's lantern lights things up around him)
 * (MeshBasicMaterial with no textures), so the GPU does almost no work per pixel. The originals are
 * kept and put back when you leave potato mode. Colours (hit flashes, glowing things) keep following
 * the original materials, so the game still reads the same, just flat.
 */
import * as THREE from 'three';

type Swappable = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial | THREE.MeshToonMaterial;

function swappable(m: THREE.Material): m is Swappable {
  return (
    m instanceof THREE.MeshStandardMaterial ||
    m instanceof THREE.MeshLambertMaterial ||
    m instanceof THREE.MeshPhongMaterial ||
    m instanceof THREE.MeshToonMaterial
  );
}

const tmp = new THREE.Color();

/**
 * Shared by every flat material: how bright the world is with no lantern (`ambient`, 1 = flat colour as
 * is), and Herb's lantern, a single point of light that fades out over `lampR` metres.
 */
const LIGHT = {
  uAmbient: { value: 1 },
  uLampPos: { value: new THREE.Vector3() },
  uLampColor: { value: new THREE.Color(1.0, 0.72, 0.38) },
  uLampI: { value: 0 },
  uLampR: { value: 13 },
};

const VERT_DECL = 'varying vec3 vPotatoWorld;\n';
const VERT_BODY = `
  vec4 potatoWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    potatoWorld = instanceMatrix * potatoWorld;
  #endif
  vPotatoWorld = (modelMatrix * potatoWorld).xyz;
`;
const FRAG_DECL = `varying vec3 vPotatoWorld;
uniform float uAmbient;
uniform vec3 uLampPos;
uniform vec3 uLampColor;
uniform float uLampI;
uniform float uLampR;
uniform vec3 uGlow;
`;
const FRAG_BODY = `
  float potatoD = distance(vPotatoWorld, uLampPos);
  float potatoLamp = uLampI * pow(clamp(1.0 - potatoD / uLampR, 0.0, 1.0), 1.6);
  gl_FragColor.rgb = gl_FragColor.rgb * (vec3(uAmbient) + uLampColor * potatoLamp) + uGlow;
`;

export class PotatoMode {
  active = false;
  /** How bright the world is away from Herb's lantern (1 = flat colours as they are). */
  set ambient(v: number) {
    LIGHT.uAmbient.value = v;
  }
  /** Herb's lantern: where it is and how bright (0 = no lantern). */
  setLamp(pos: THREE.Vector3 | null, intensity: number) {
    LIGHT.uLampI.value = pos ? intensity : 0;
    if (pos) LIGHT.uLampPos.value.copy(pos);
  }
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private flat = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  private scanT = 0;

  constructor(private scene: THREE.Scene) {}

  private flatFor(src: Swappable): THREE.MeshBasicMaterial {
    let b = this.flat.get(src);
    if (!b) {
      b = new THREE.MeshBasicMaterial({
        color: src.color,
        transparent: src.transparent,
        opacity: src.opacity,
        side: src.side,
        depthWrite: src.depthWrite,
        depthTest: src.depthTest,
        vertexColors: src.vertexColors,
        fog: src.fog,
        alphaTest: src.alphaTest,
      });
      // its own glow (emissive) is added on top, so glowing things still glow in the dark
      const glowU = { value: new THREE.Color() };
      b.userData.glow = glowU.value;
      b.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, LIGHT, { uGlow: glowU });
        sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + VERT_BODY);
        sh.fragmentShader = FRAG_DECL + sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>' + FRAG_BODY);
      };
      b.customProgramCacheKey = () => 'potato-lit';
      this.flat.set(src, b);
    }
    return b;
  }

  /** Swaps the materials of everything in the scene that hasn't been swapped yet. */
  private scan() {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || this.originals.has(mesh)) return;
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        if (!mat.some(swappable)) return;
        this.originals.set(mesh, mat);
        mesh.material = mat.map((m) => (swappable(m) ? this.flatFor(m) : m));
      } else if (mat && swappable(mat)) {
        this.originals.set(mesh, mat);
        mesh.material = this.flatFor(mat);
      }
    });
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (on) {
      this.scan();
      return;
    }
    for (const [mesh, mat] of this.originals) mesh.material = mat;
    this.originals.clear();
    for (const b of this.flat.values()) b.dispose();
    this.flat.clear();
  }

  private inScene(o: THREE.Object3D) {
    while (o.parent) o = o.parent;
    return o === this.scene;
  }

  /** Each frame: catch newly added models now and then, and keep flat colours in step with the originals. */
  update(dt: number) {
    if (!this.active) return;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      // forget models that were removed from the scene
      for (const mesh of this.originals.keys()) if (!this.inScene(mesh)) this.originals.delete(mesh);
      this.scan();
      // and the flat copies nobody uses any more
      const used = new Set<THREE.Material>();
      for (const mat of this.originals.values()) for (const m of Array.isArray(mat) ? mat : [mat]) used.add(m);
      for (const [src, b] of this.flat)
        if (!used.has(src)) {
          b.dispose();
          this.flat.delete(src);
        }
    }
    for (const [src, b] of this.flat) {
      const s = src as Swappable;
      b.color.copy(s.color);
      // glowing things (emissive flashes, eyes, lava) still glow, even in the dark
      const e = (s as THREE.MeshStandardMaterial).emissive;
      const g = b.userData.glow as THREE.Color;
      if (e) g.copy(tmp.copy(e).multiplyScalar((s as THREE.MeshStandardMaterial).emissiveIntensity ?? 1));
      else g.setRGB(0, 0, 0);
      b.opacity = s.opacity;
      b.transparent = s.transparent;
      b.visible = s.visible;
    }
  }
}
