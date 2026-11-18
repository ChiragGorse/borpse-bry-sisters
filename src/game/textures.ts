import * as THREE from 'three';

/**
 * Procedural surface textures generated on a canvas at load time, so the game still ships as a single file
 * with no image assets. Everything here tiles seamlessly.
 */

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Tileable fractal value noise in 0..1. */
export function noiseField(size: number, cells: number, octaves: number, seed: number): Float32Array {
  const rnd = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let c = cells;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(c * c);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * c;
      const y0 = Math.floor(fy);
      const ty = smooth(fy - y0);
      const ya = (y0 % c) * c;
      const yb = ((y0 + 1) % c) * c;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * c;
        const x0 = Math.floor(fx);
        const tx = smooth(fx - x0);
        const xa = x0 % c;
        const xb = (x0 + 1) % c;
        const top = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * tx;
        const bot = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * tx;
        out[y * size + x] += (top + (bot - top) * ty) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
    c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function finish(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bake(size: number, srgb: boolean, px: (i: number, out: number[]) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const rgb = [0, 0, 0];
    for (let i = 0; i < size * size; i++) {
      px(i, rgb);
      img.data[i * 4] = Math.max(0, Math.min(255, rgb[0]));
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, rgb[1]));
      img.data[i * 4 + 2] = Math.max(0, Math.min(255, rgb[2]));
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  return finish(canvas, srgb);
}

function normalFromHeight(h: Float32Array, size: number, strength: number): THREE.CanvasTexture {
  return bake(size, false, (i, out) => {
    const x = i % size;
    const y = (i / size) | 0;
    const l = h[y * size + ((x + size - 1) % size)];
    const r = h[y * size + ((x + 1) % size)];
    const u = h[((y + size - 1) % size) * size + x];
    const d = h[((y + 1) % size) * size + x];
    const nx = (l - r) * strength;
    const ny = (u - d) * strength;
    const inv = 1 / Math.hypot(nx, ny, 1);
    out[0] = (nx * inv * 0.5 + 0.5) * 255;
    out[1] = (ny * inv * 0.5 + 0.5) * 255;
    out[2] = (inv * 0.5 + 0.5) * 255;
  });
}

const cache = new Map<string, THREE.CanvasTexture>();
function memo(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Fine grayscale grain used as a bump + roughness map so painted surfaces stop looking like plastic. */
export function grainTex(): THREE.CanvasTexture {
  return memo('grain', () => {
    const n = noiseField(256, 24, 4, 11);
    return bake(256, false, (i, out) => {
      const v = (0.58 + 0.42 * n[i]) * 255;
      out[0] = out[1] = out[2] = v;
    });
  });
}

const grassFields = () => ({ a: noiseField(512, 6, 4, 3), b: noiseField(512, 96, 2, 5), c: noiseField(512, 3, 2, 9) });

/** Near-white mottled turf detail; the material colour supplies the actual green. */
export function grassMap(): THREE.CanvasTexture {
  return memo('grass', () => {
    const { a, b, c } = grassFields();
    return bake(512, true, (i, out) => {
      const v = (0.8 + 0.32 * a[i]) * (0.82 + 0.36 * b[i]);
      out[0] = v * (0.9 + 0.2 * c[i]) * 255;
      out[1] = v * 255;
      out[2] = v * (0.8 + 0.16 * c[i]) * 255;
    });
  });
}

export function grassNormal(): THREE.CanvasTexture {
  return memo('grassN', () => normalFromHeight(noiseField(512, 96, 2, 5), 512, 2.4));
}

const dirtFields = () => ({ a: noiseField(512, 8, 5, 21), b: noiseField(512, 128, 1, 22) });

/** Packed earth with scattered pebbles, again tinted by the material colour. */
export function dirtMap(): THREE.CanvasTexture {
  return memo('dirt', () => {
    const { a, b } = dirtFields();
    return bake(512, true, (i, out) => {
      const pebble = b[i] > 0.8 ? -0.2 : b[i] < 0.13 ? 0.1 : 0;
      const v = 0.86 + 0.22 * a[i] + pebble;
      out[0] = v * 255;
      out[1] = v * 0.985 * 255;
      out[2] = v * 0.96 * 255;
    });
  });
}

export function dirtNormal(): THREE.CanvasTexture {
  return memo('dirtN', () => {
    const { a, b } = dirtFields();
    const h = new Float32Array(a.length);
    for (let i = 0; i < h.length; i++) h[i] = a[i] * 0.55 + b[i] * 0.45;
    return normalFromHeight(h, 512, 2.6);
  });
}

/** Ripple normal map shared by every body of water (scrolled over time). */
export function waterNormal(): THREE.CanvasTexture {
  return memo('waterN', () => {
    const a = noiseField(512, 10, 4, 31);
    const b = noiseField(512, 28, 2, 32);
    const h = new Float32Array(a.length);
    for (let i = 0; i < h.length; i++) h[i] = a[i] * 0.7 + b[i] * 0.3;
    return normalFromHeight(h, 512, 3.2);
  });
}

/** Board siding: grooves between planks plus fine wood grain. Used as a bump map on barn and house walls. */
export function planksBump(): THREE.CanvasTexture {
  return memo('planks', () => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rnd = rng(77);
    if (ctx) {
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 900; i++) {
        const x = rnd() * size;
        const y = rnd() * size;
        ctx.fillStyle = `rgba(${rnd() < 0.5 ? '90,90,90' : '235,235,235'},${0.1 + rnd() * 0.16})`;
        ctx.fillRect(x, y, 1, 14 + rnd() * 60);
      }
      for (let b = 0; b < 4; b++) {
        const x = b * 64;
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(x, 0, 4, size);
        ctx.fillStyle = '#8a8a8a';
        ctx.fillRect(x + 4, 0, 2, size);
      }
    }
    const t = finish(canvas, false);
    t.repeat.set(1 / 2.4, 1 / 2.4);
    return t;
  });
}

/** Overlapping roof shingle courses, laid out in vertical bands to suit the roof slab UVs. */
export function shinglesBump(): THREE.CanvasTexture {
  return memo('shingles', () => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      for (let band = 0; band < 8; band++) {
        const x = band * 32;
        const grad = ctx.createLinearGradient(x, 0, x + 32, 0);
        grad.addColorStop(0, '#f0f0f0');
        grad.addColorStop(0.82, '#9a9a9a');
        grad.addColorStop(1, '#2c2c2c');
        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, 32, size);
        ctx.fillStyle = '#333333';
        for (let y = band % 2 ? 16 : 0; y < size; y += 32) ctx.fillRect(x, y, 30, 3);
      }
    }
    const t = finish(canvas, false);
    t.repeat.set(1, 3);
    return t;
  });
}
