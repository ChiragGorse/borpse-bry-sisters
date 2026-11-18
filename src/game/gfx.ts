import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export type Quality = 'high' | 'medium' | 'low';

export interface SkyState {
  /** Unit vector toward the sun (or moon). */
  dir: THREE.Vector3;
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  /** Overall sky brightness; tiny at night. */
  gain: number;
  tint: THREE.Color;
  exposure: number;
}

/** Final colour grade: a touch of saturation, a vignette and fine film grain (applied before tone mapping). */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.26 },
    uGrain: { value: 0.032 },
    uSat: { value: 1.1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uSat;
    varying vec2 vUv;
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      float l = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      c.rgb = max( vec3( 0.0 ), mix( vec3( l ), c.rgb, uSat ) );
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep( 0.18, 0.78, dot( q, q ) * 1.9 );
      c.rgb *= 1.0 + ( hash( vUv * 900.0 + fract( uTime ) * 37.0 ) - 0.5 ) * uGrain;
      gl_FragColor = c;
    }`,
};

/** Physically based atmosphere (three.js Sky) with extra controls for brightness, tint and hiding the sun disc. */
function makeSky(disk: number): Sky {
  const sky = new Sky();
  const mat = sky.material;
  mat.uniforms.uGain = { value: 1 };
  mat.uniforms.uTint = { value: new THREE.Color(0xffffff) };
  mat.uniforms.uDisk = { value: disk };
  mat.fragmentShader = mat.fragmentShader
    .replace('void main() {', 'uniform float uGain;\nuniform vec3 uTint;\nuniform float uDisk;\nvoid main() {')
    .replace('* sundisk;', '* sundisk * uDisk;')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * uTint * uGain, 1.0 );');
  mat.needsUpdate = true;
  return sky;
}

/**
 * Rendering pipeline: atmospheric sky, image-based lighting captured from that sky, half-res ambient occlusion,
 * half-res HDR bloom, colour grading and filmic tone mapping. Tuned so HiDPI/Retina laptops and mobile GPUs
 * never choke on multisampled FP16 bandwidth.
 */
export class Gfx {
  quality: Quality = 'high';
  /** Extra DPR clamp for bandwidth-limited mobile dGPUs on 2× Retina panels (e.g. Intel MacBook Pros). */
  retinaClamp = false;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private ao: GTAOPass;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private sky: Sky;
  private envSky: Sky;
  private envScene = new THREE.Scene();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envKey = '';
  private envTimer = 0;
  private w = 1;
  private h = 1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.52;
    scene.environmentIntensity = 0.45;

    this.sky = makeSky(1);
    this.sky.scale.setScalar(500);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.sky.material.depthTest = false;
    scene.add(this.sky);

    // a second copy without the sun disc is what lights the scene, so the sun is not counted twice
    this.envSky = makeSky(0);
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const sw = Math.max(1, size.x);
    const sh = Math.max(1, size.y);
    // Avoid multisampled HalfFloat renderbuffers: on macOS Metal / mobile Polaris GPUs, 4× MSAA RGBA16F
    // resolves destroy memory bandwidth. Un-multisampled HalfFloat is crisp and 3–5× faster.
    const target = new THREE.WebGLRenderTarget(sw, sh, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    const hw = Math.max(1, Math.round(sw * 0.5));
    const hh = Math.max(1, Math.round(sh * 0.5));
    this.ao = new GTAOPass(scene, camera, hw, hh);
    this.ao.blendIntensity = 0.9;
    this.ao.updateGtaoMaterial({ radius: 0.75, distanceExponent: 1.5, thickness: 1.3, scale: 1.15, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 8 });
    // keep see-through effects, the sky and the grass out of the occlusion pass
    const hidden: THREE.Object3D[] = [];
    const pass = this.ao as unknown as { overrideVisibility: () => void; restoreVisibility: () => void };
    pass.overrideVisibility = () => {
      scene.traverseVisible((o) => {
        let hide = (o as THREE.Points).isPoints === true || (o as THREE.Line).isLine === true || o.userData.noAO === true;
        const mesh = o as THREE.Mesh;
        if (!hide && mesh.isMesh) {
          const m = mesh.material;
          hide = !Array.isArray(m) && (m.transparent || !m.depthWrite);
        }
        if (hide) hidden.push(o);
      });
      for (const o of hidden) o.visible = false;
    };
    pass.restoreVisibility = () => {
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
    };
    this.composer.addPass(this.ao);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(hw, hh), 0.28, 0.55, 1.85);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  private pixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    if (this.retinaClamp) {
      return Math.min(dpr, this.quality === 'high' ? 1.15 : this.quality === 'medium' ? 1.0 : 0.85);
    }
    const cap = this.quality === 'high' ? 1.35 : this.quality === 'medium' ? 1.1 : 1.0;
    return Math.min(dpr, cap);
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.quality !== 'low') {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      // Run both GTAO and Bloom at half buffer resolution (~4× less fill-rate cost, virtually identical quality)
      const hw = Math.max(1, Math.round(w * pr * 0.5));
      const hh = Math.max(1, Math.round(h * pr * 0.5));
      this.ao.setSize(hw, hh);
      this.bloom.setSize(hw, hh);
    }
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.ao.enabled = q === 'high';
    this.setSize(this.w, this.h);
  }

  setSky(s: SkyState, dt: number) {
    for (const sky of [this.sky, this.envSky]) {
      const u = sky.material.uniforms;
      u.turbidity.value = s.turbidity;
      u.rayleigh.value = s.rayleigh;
      u.mieCoefficient.value = s.mie;
      u.mieDirectionalG.value = s.mieG;
      (u.sunPosition.value as THREE.Vector3).copy(s.dir);
      u.uGain.value = s.gain;
      (u.uTint.value as THREE.Color).copy(s.tint);
    }
    this.renderer.toneMappingExposure = s.exposure;
    // re-capture the sky IBL only when it has noticeably shifted (throttled to avoid mid-transition GPU stalls)
    this.envTimer -= dt;
    const key = [s.dir.y * 2, s.turbidity * 0.5, s.rayleigh * 0.5, s.gain * 2, s.tint.r, s.tint.b].map((v) => v.toFixed(1)).join('|');
    if (key !== this.envKey && this.envTimer <= 0) {
      this.envKey = key;
      this.envTimer = 1.2;
      const rt = this.pmrem.fromScene(this.envScene, 0, 1, 3000);
      const old = this.envRT;
      this.envRT = rt;
      this.scene.environment = rt.texture;
      old?.dispose();
    }
  }

  render(dt: number, time: number) {
    this.sky.position.copy(this.camera.position);
    if (this.quality === 'low') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.grade.uniforms.uTime.value = time;
    this.composer.render(dt);
  }

  dispose() {
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.composer.dispose();
  }
}
