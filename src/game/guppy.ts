import * as THREE from 'three';
import { box, cyl, glow, M, makeHpBar, part, sph, torus, unique, type EnemyModel } from './models';

export { GUPPY_END, GUPPY_HP, GUPPY_SWING } from './layout';

export interface GuppyModel extends EnemyModel {
  arms: [THREE.Group, THREE.Group];
  boots: [THREE.Group, THREE.Group];
  tail: THREE.Group;
}

function finGeometry(size: number): THREE.BufferGeometry {
  const fin = new THREE.Shape();
  fin.moveTo(0, -0.14 * size);
  fin.quadraticCurveTo(0.4 * size, -0.5 * size, size, -0.34 * size);
  fin.lineTo(0.78 * size, 0);
  fin.quadraticCurveTo(1.2 * size, 0.48 * size, 0.68 * size, 0.47 * size);
  fin.lineTo(0, 0.12 * size);
  return new THREE.ExtrudeGeometry(fin, { depth: 0.055, bevelEnabled: true, bevelSize: 0.028, bevelThickness: 0.025, bevelSegments: 1, curveSegments: 6 });
}

export function makePathGuppy(): GuppyModel {
  const root = new THREE.Group();
  root.name = 'Path Guppy';
  const anim = new THREE.Group();
  root.add(anim);
  const skin = unique(0x439685);
  const belly = M(0xc7d6ae);
  const fin = M(0xf2b557);
  const waders = M(0x405149);
  const jacket = M(0xa06437);
  const strap = M(0x483a30);
  const buckle = M(0xe2b75f);
  const dark = M(0x252c2e);

  const boot = (s: number) => {
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.34, 0.99, 0);
    anim.add(hinge);
    part(hinge, cyl(0.23, 0.18, 0.67), waders, 0, -0.31, 0);
    part(hinge, sph(0.3), dark, 0, -0.78, 0.13, { sx: 0.9, sy: 0.68, sz: 1.5 });
    part(hinge, cyl(0.225, 0.225, 0.08), strap, 0, -0.43, 0);
    return hinge;
  };
  const boots: GuppyModel['boots'] = [boot(-1), boot(1)];
  part(anim, sph(0.69, 12, 8), jacket, 0, 1.45, 0, { sy: 1.05, sz: 0.65 });
  part(anim, sph(0.52), waders, 0, 1.24, 0.25, { sx: 0.93, sy: 0.85, sz: 0.46 });
  for (const s of [-1, 1]) {
    part(anim, box(0.11, 0.57, 0.08), strap, s * 0.32, 1.66, 0.37, { rz: s * 0.17 });
    part(anim, box(0.13, 0.12, 0.07), buckle, s * 0.28, 1.43, 0.47);
  }
  part(anim, box(0.81, 0.78, 0.34), strap, 0, 1.47, -0.52);
  part(anim, cyl(0.18, 0.18, 0.93), M(0x947546), 0, 1.94, -0.53, { rz: Math.PI / 2 });
  part(anim, torus(0.18, 0.032), strap, -0.25, 1.94, -0.53, { ry: Math.PI / 2 });
  part(anim, torus(0.18, 0.032), strap, 0.25, 1.94, -0.53, { ry: Math.PI / 2 });

  const arm = (s: number) => {
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.63, 1.82, 0);
    hinge.rotation.z = s * 0.16;
    anim.add(hinge);
    part(hinge, cyl(0.22, 0.19, 0.48), jacket, 0, -0.23, 0);
    part(hinge, cyl(0.19, 0.14, 0.32), skin, 0, -0.55, 0);
    part(hinge, sph(0.19), skin, 0, -0.74, 0.04, { sx: 1.1, sy: 0.94, sz: 0.75 });
    return hinge;
  };
  const arms: GuppyModel['arms'] = [arm(-1), arm(1)];

  part(anim, sph(0.63, 12, 9), skin, 0, 2.41, 0.05, { sx: 1.17, sy: 0.94, sz: 0.93 });
  part(anim, sph(0.48), belly, 0, 2.24, 0.39, { sy: 0.64, sz: 0.68 });
  part(anim, sph(0.19), dark, 0, 2.22, 0.67, { sx: 1.2, sy: 0.40, sz: 0.38, shadow: false });
  for (const s of [-1, 1]) {
    part(anim, finGeometry(0.44), fin, s * 0.61, 2.38, 0.02, { ry: s < 0 ? Math.PI : 0, rz: s * 0.22 });
    part(anim, sph(0.17), M(0xf8efd2), s * 0.34, 2.56, 0.54, { sy: 1.15, sz: 0.67, shadow: false });
    part(anim, sph(0.092), dark, s * 0.31, 2.55, 0.63, { sz: 0.62, shadow: false });
    part(anim, sph(0.025), M(0xffffff), s * 0.29, 2.58, 0.683, { shadow: false });
    part(anim, sph(0.15), skin, s * 0.34, 2.735, 0.535, { sx: 1.27, sy: 0.30, sz: 0.58, rz: s * 0.30, shadow: false });
    part(anim, torus(0.16, 0.016, 4, 10, Math.PI * 0.61), M(0x516d5e), s * 0.44, 2.27, 0.48, { ry: s * 0.66, rz: s * 1.52, shadow: false });
  }
  part(anim, finGeometry(0.55), fin, -0.22, 2.91, -0.17, { rz: 0.57, ry: -0.17 });

  const tail = new THREE.Group();
  tail.position.set(0, 1.16, -0.49);
  anim.add(tail);
  part(tail, sph(0.24), skin, 0, 0.13, -0.25, { sx: 0.65, sy: 0.7, sz: 1.6 });
  part(tail, finGeometry(0.85), fin, 0, 0.16, -0.39, { ry: Math.PI / 2 });
  part(anim, sph(0.11), glow(0xcbe2a0, 0.26), 0.54, 1.42, 0.49, { shadow: false });

  const hp = makeHpBar(1.7, 3.75);
  root.add(hp.group);
  return { root, anim, flash: skin, hp, arms, boots, tail };
}