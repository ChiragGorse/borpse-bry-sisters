/**
 * Rickley's truffle garden, drawn: a raised dirt bed per plot, a sprouting mushroom cap that grows
 * with the plot, dark wet soil while watered, and a glowing ripe truffle (gold for a Golden Truffle).
 */
import * as THREE from 'three';
import type { Plot } from './data';
import { GARDEN } from './layout';

interface PlotView {
  bed: THREE.Mesh;
  soil: THREE.MeshStandardMaterial;
  sprout: THREE.Group;
  cap: THREE.Mesh;
  capMat: THREE.MeshStandardMaterial;
  glow: THREE.Mesh;
}

export class GardenView {
  readonly group = new THREE.Group();
  private views: PlotView[] = [];

  constructor(plots: Plot[]) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xf1e2c4, roughness: 0.8 });
    const bedGeo = new THREE.BoxGeometry(2.3, 0.28, 2.3);
    const frameGeo = new THREE.BoxGeometry(2.6, 0.2, 0.18);
    const stemGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.5, 8);
    const capGeo = new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const glowGeo = new THREE.SphereGeometry(0.62, 12, 10);
    for (const p of plots) {
      const soil = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
      const bed = new THREE.Mesh(bedGeo, soil);
      bed.position.set(p.x, 0.12, p.z);
      bed.receiveShadow = true;
      this.group.add(bed);
      for (const [dx, dz, rot] of [
        [0, 1.2, 0],
        [0, -1.2, 0],
        [1.2, 0, Math.PI / 2],
        [-1.2, 0, Math.PI / 2],
      ] as const) {
        const f = new THREE.Mesh(frameGeo, frameMat);
        f.position.set(p.x + dx, 0.18, p.z + dz);
        f.rotation.y = rot;
        f.castShadow = true;
        this.group.add(f);
      }
      const sprout = new THREE.Group();
      sprout.position.set(p.x, 0.26, p.z);
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 0.25;
      sprout.add(stem);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x7a5233, roughness: 0.6 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 0.46;
      cap.castShadow = true;
      sprout.add(cap);
      // a few little truffle lumps around it once it's ripe
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const lump = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), capMat);
        lump.position.set(Math.cos(a) * 0.48, 0.07, Math.sin(a) * 0.48);
        lump.name = 'lump';
        sprout.add(lump);
      }
      this.group.add(sprout);
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.25, depthWrite: false }));
      glow.position.set(p.x, 0.75, p.z);
      this.group.add(glow);
      this.views.push({ bed, soil, sprout, cap, capMat, glow });
    }
    // a little sign
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), frameMat);
    post.position.set(GARDEN.x + 5.2, 0.7, GARDEN.z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 1.6), new THREE.MeshStandardMaterial({ color: 0xc79a6b, roughness: 0.8 }));
    board.position.set(GARDEN.x + 5.2, 1.35, GARDEN.z);
    post.castShadow = board.castShadow = true;
    this.group.add(post, board);
  }

  update(plots: Plot[], time: number) {
    plots.forEach((p, i) => {
      const v = this.views[i];
      if (!v) return;
      v.soil.color.setHex(p.planted && p.wet > 0 ? 0x3f2a18 : 0x6b4a2b);
      v.sprout.visible = p.planted;
      const ripe = p.planted && p.g >= 1;
      const s = 0.25 + 0.75 * Math.min(1, p.g);
      v.sprout.scale.setScalar(s * (ripe ? 1 + Math.sin(time * 4 + i) * 0.05 : 1));
      v.capMat.color.setHex(p.gold && p.g > 0.6 ? 0xe8b628 : 0x7a5233);
      v.capMat.emissive.setHex(ripe ? (p.gold ? 0x6a4a00 : 0x2a1808) : 0x000000);
      for (const c of v.sprout.children) if (c.name === 'lump') c.visible = ripe;
      v.glow.visible = ripe;
      (v.glow.material as THREE.MeshBasicMaterial).color.setHex(p.gold ? 0xffd23d : 0xffe7b0);
      (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.1 * Math.sin(time * 3 + i);
    });
  }
}
