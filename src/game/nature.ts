import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dirtMap, dirtNormal, grassMap, grassNormal, planksBump, shinglesBump, waterNormal } from './textures';

const PI = Math.PI;

/** Shared animation clock + camera position for wind, water, and distance-culled grass. */
export const NATURE = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } };

export function tickNature(t: number, cam?: THREE.Camera) {
  NATURE.uTime.value = t;
  if (cam) NATURE.uCam.value.copy(cam.position);
  waterNormal().offset.set(t * 0.011, t * 0.017);
}

/* ───────────────────────── ground ───────────────────────── */

/** Textured turf or packed earth, chosen from the colour. `layer` > 0 makes it a decal sitting above the base ground. */
export function groundMaterial(color: number, layer: number): THREE.MeshStandardMaterial {
  const c = new THREE.Color(color);
  const dirt = c.r > c.g * 1.02;
  const m = new THREE.MeshStandardMaterial({
    color,
    map: dirt ? dirtMap() : grassMap(),
    normalMap: dirt ? dirtNormal() : grassNormal(),
    normalScale: new THREE.Vector2(dirt ? 0.7 : 0.9, dirt ? 0.7 : 0.9),
    roughness: dirt ? 0.93 : 0.97,
    metalness: 0,
    envMapIntensity: 0.55,
  });
  if (layer > 0) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -layer;
    m.polygonOffsetUnits = -layer * 2;
  }
  // a second, much larger sample of the same texture hides the tiling
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\n#ifdef USE_MAP\n\tdiffuseColor.rgb *= mix( 0.8, 1.14, texture2D( map, vMapUv * 0.071 ).g );\n#endif',
    );
  };
  return m;
}

/** Rewrites a flat XY geometry's UVs to world-space XZ so neighbouring ground pieces share one continuous texture. */
export function worldUV(geo: THREE.BufferGeometry, ox: number, oz: number, tile: number, rot = 0) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i);
    const ly = p.getY(i);
    uv.setXY(i, (ox + lx * c - ly * s) / tile, (oz - (lx * s + ly * c)) / tile);
  }
  uv.needsUpdate = true;
}

export function worldCircle(r: number, seg: number, ox: number, oz: number, tile: number): THREE.CircleGeometry {
  const geo = new THREE.CircleGeometry(r, seg);
  worldUV(geo, ox, oz, tile);
  return geo;
}

/* ───────────────────────── water ───────────────────────── */

/** Glossy rippling water that reflects the sky. */
export function waterMaterial(color: number, opacity: number, offset: number, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.07,
    metalness: 0.05,
    normalMap: waterNormal(),
    normalScale: new THREE.Vector2(0.55, 0.55),
    transparent: opacity < 1,
    opacity,
    envMapIntensity: 1.5,
    side,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset * 2,
  });
}

/* ───────────────────────── organic shapes ───────────────────────── */

let lumpSeed = 1;

function lumpy(r: number, ws: number, hs: number, amp: number, freq: number): THREE.BufferGeometry {
  const seed = lumpSeed++ * 1.37;
  const sphere = new THREE.SphereGeometry(r, ws, hs);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geo = mergeVertices(sphere, 1e-4);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.copy(v).normalize();
    const d =
      Math.sin(n.x * 3.1 * freq + seed) * Math.sin(n.y * 2.7 * freq + seed * 1.7) * Math.sin(n.z * 3.3 * freq + seed * 0.6) +
      0.5 * Math.sin(n.x * 6.1 * freq + n.z * 5.3 * freq + seed) +
      0.3 * Math.sin(n.y * 9.2 * freq + n.x * 4.4 * freq + seed * 2.3);
    v.addScaledVector(n, d * amp * r);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Billowy tree canopy. The second argument is ignored so it drops in for IcosahedronGeometry. */
export function blobGeo(r: number, _detail?: number): THREE.BufferGeometry {
  void _detail;
  return lumpy(r, 18, 12, 0.15, 1.5);
}

/** Weathered boulder. The second argument is ignored so it drops in for DodecahedronGeometry. */
export function rockGeo(r: number, _detail?: number): THREE.BufferGeometry {
  void _detail;
  return lumpy(r, 12, 9, 0.19, 1.15);
}

/** Layered conifer crown spanning -h/2..h/2, a drop-in for a single cone. */
export function pineGeo(r: number, h: number): THREE.BufferGeometry {
  const tiers: THREE.BufferGeometry[] = [];
  const radii = [1, 0.8, 0.58, 0.36];
  for (let i = 0; i < radii.length; i++) {
    const th = i === radii.length - 1 ? h * 0.4 : h * 0.46;
    const cone = new THREE.ConeGeometry(r * radii[i], th, 10, 1);
    const p = cone.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const z = p.getZ(k);
      const y = p.getY(k);
      const rad = Math.hypot(x, z);
      if (rad < 1e-4) continue;
      // ragged, drooping branch tips
      const a = Math.atan2(z, x);
      const wob = 1 + 0.1 * Math.sin(a * 5 + i * 1.9) + 0.06 * Math.sin(a * 11 + i);
      const droop = (rad / (r * radii[i])) * 0.09 * th;
      p.setXYZ(k, x * wob, y - droop, z * wob);
    }
    cone.computeVertexNormals();
    cone.translate(0, -h / 2 + i * h * 0.2 + th / 2, 0);
    tiers.push(cone);
  }
  return mergeGeometries(tiers) ?? tiers[0];
}

/* ───────────────────────── building surfaces ───────────────────────── */

export function planked(material: THREE.Material): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;
  const m = material.clone();
  m.bumpMap = planksBump();
  m.bumpScale = 2.4;
  m.roughnessMap = null;
  return m;
}

export function shingled(material: THREE.Material): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;
  const m = material.clone();
  m.bumpMap = shinglesBump();
  m.bumpScale = 2.6;
  m.roughnessMap = null;
  return m;
}

/* ───────────────────────── grass ───────────────────────── */

/**
 * Instanced tufts of three curved blades that sway in the wind.
 * `sample` proposes a spot (or null to reject); tints are per-tuft colour choices.
 */
export function buildGrass(max: number, sample: () => { x: number; z: number } | null, tints: number[], height = 0.5): THREE.InstancedMesh {
  // Lightweight 3-blade tapered triangle tuft (3 tris/tuft instead of 12 = 4× less vertex load, lush silhouette)
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const BLADES = 3;
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * PI * 2 + 0.4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const base = pos.length / 3;
    const w = 0.048;
    const bx = ca * 0.06;
    const bz = sa * 0.06;
    const tx = ca * 0.28;
    const tz = sa * 0.28;
    pos.push(bx - sa * w, 0, bz + ca * w, bx + sa * w, 0, bz - ca * w, tx, 1, tz);
    col.push(0.38, 0.38, 0.38, 0.38, 0.38, 0.38, 1, 1, 1);
    nor.push(ca * 0.2, 1, sa * 0.2, ca * 0.2, 1, sa * 0.2, ca * 0.3, 1, sa * 0.3);
    idx.push(base, base + 1, base + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = NATURE.uTime;
    shader.uniforms.uCam = NATURE.uCam;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uCam;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
	#ifdef USE_INSTANCING
		vec2 gp = instanceMatrix[3].xz;
		float gDist = length( gp - uCam.xz );
		float gFade = 1.0 - smoothstep( 36.0, 56.0, gDist );
		if ( gFade <= 0.001 ) {
			transformed = vec3( 0.0 );
		} else {
			transformed.y *= gFade;
			float gw = position.y;
			float gust = sin( uTime * 1.7 + gp.x * 0.33 + gp.y * 0.21 ) + 0.4 * sin( uTime * 3.3 + gp.x * 0.85 - gp.y * 0.65 );
			transformed.x += gust * 0.16 * gw;
			transformed.z += cos( uTime * 1.25 + gp.y * 0.37 ) * 0.09 * gw;
		}
	#endif`,
    );
    // light both faces of a blade the same way instead of flipping the normal on the back face
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );\n\tnonPerturbedNormal = normal;',
    );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, max);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  const palette = tints.map((t) => new THREE.Color(t));
  let n = 0;
  for (let tries = 0; tries < max * 4 && n < max; tries++) {
    const p = sample();
    if (!p) continue;
    d.position.set(p.x, 0, p.z);
    d.rotation.set(0, Math.random() * PI * 2, 0);
    const s = 0.8 + Math.random() * 0.9;
    d.scale.set(s, height * (0.55 + Math.random() * 0.9), s);
    d.updateMatrix();
    mesh.setMatrixAt(n, d.matrix);
    c.copy(palette[(Math.random() * palette.length) | 0]).multiplyScalar(0.8 + Math.random() * 0.4);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.userData.max = n;
  mesh.userData.noAO = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Thins the grass for lower graphics settings (instances are placed in random order, so this stays even). */
export function setGrassDensity(mesh: THREE.InstancedMesh, f: number) {
  mesh.count = Math.floor((mesh.userData.max as number) * f);
}
