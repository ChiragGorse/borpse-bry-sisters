/**
 * Potato graphics: every lit, textured material in the scene is swapped for a flat, unlit colour
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
const glow = new THREE.Color();

export class PotatoMode {
  active = false;
  /** Darkens everything (no lights to do it): lower in the haunted forest at night. */
  dim = 1;
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
      tmp.copy(s.color).multiplyScalar(this.dim);
      // glowing things (emissive flashes, eyes, lava) still glow
      const e = (s as THREE.MeshStandardMaterial).emissive;
      if (e) tmp.add(glow.copy(e).multiplyScalar((s as THREE.MeshStandardMaterial).emissiveIntensity ?? 1));
      b.color.copy(tmp);
      b.opacity = s.opacity;
      b.transparent = s.transparent;
      b.visible = s.visible;
    }
  }
}
