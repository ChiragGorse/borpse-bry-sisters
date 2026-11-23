/**
 * Graphics settings, each adjustable on its own, plus the presets that set them all at once.
 * Saved on this device. No THREE or DOM beyond localStorage, so the settings screen can use it too.
 */

export type Preset = 'high' | 'medium' | 'low' | 'potato';

export interface GfxSettings {
  /** `full`: real lights, shadows and sky reflections. `flat`: no lighting at all, plain colours. */
  lighting: 'full' | 'flat';
  /** Surface textures (ground, wood, roofs, bumps). Signs keep their lettering either way. */
  textures: boolean;
  shadows: 'off' | 'low' | 'medium' | 'high';
  /** Ambient occlusion: soft contact shadows in corners and under things. */
  ao: boolean;
  /** Bloom and colour grading. */
  effects: boolean;
  /** The atmospheric sky (off: a plain colour). */
  sky: boolean;
  grass: 'off' | 'low' | 'medium' | 'high';
  particles: 'low' | 'medium' | 'high';
  /** Render resolution, as a multiple of the screen's (capped at the screen's own). */
  resolution: number;
}

export const PRESETS: Record<Preset, GfxSettings> = {
  high: { lighting: 'full', textures: true, shadows: 'high', ao: true, effects: true, sky: true, grass: 'high', particles: 'high', resolution: 1.35 },
  medium: { lighting: 'full', textures: true, shadows: 'medium', ao: false, effects: true, sky: true, grass: 'medium', particles: 'medium', resolution: 1.1 },
  low: { lighting: 'full', textures: true, shadows: 'low', ao: false, effects: false, sky: true, grass: 'low', particles: 'low', resolution: 1 },
  potato: { lighting: 'flat', textures: false, shadows: 'off', ao: false, effects: false, sky: false, grass: 'off', particles: 'low', resolution: 0.7 },
};

export const PRESET_LABEL: Record<Preset, string> = { high: 'Cinematic', medium: 'Balanced', low: 'Fast', potato: 'Potato' };
export const PRESET_ORDER: Preset[] = ['high', 'medium', 'low', 'potato'];
export const RESOLUTIONS = [0.5, 0.7, 0.85, 1, 1.15, 1.35];

/** The preset these settings match exactly, or null for a custom mix. */
export function presetOf(s: GfxSettings): Preset | null {
  for (const p of PRESET_ORDER) {
    const q = PRESETS[p];
    if ((Object.keys(q) as (keyof GfxSettings)[]).every((k) => q[k] === s[k])) return p;
  }
  return null;
}

export function settingsLabel(s: GfxSettings): string {
  const p = presetOf(s);
  return p ? PRESET_LABEL[p] : 'Custom';
}

const KEY = 'borpse.graphics';
/** The older single graphics level (before settings were split up). */
const OLD_KEY = 'borpse.gfx';

/** Settings saved on this device, or null if none were ever chosen. */
export function loadGraphics(): GfxSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<GfxSettings>;
      return sanitize({ ...PRESETS.potato, ...s });
    }
    const old = localStorage.getItem(OLD_KEY);
    if (old === 'high' || old === 'medium' || old === 'low' || old === 'potato') return { ...PRESETS[old] };
  } catch {
    /* storage blocked or bad data */
  }
  return null;
}

export function saveGraphics(s: GfxSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: just for this session */
  }
}

/** Keeps every field to a value the game understands. */
export function sanitize(s: GfxSettings): GfxSettings {
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
  const d = PRESETS.potato;
  const res = Number(s.resolution);
  return {
    lighting: pick(s.lighting, ['full', 'flat'] as const, d.lighting),
    textures: typeof s.textures === 'boolean' ? s.textures : d.textures,
    shadows: pick(s.shadows, ['off', 'low', 'medium', 'high'] as const, d.shadows),
    ao: typeof s.ao === 'boolean' ? s.ao : d.ao,
    effects: typeof s.effects === 'boolean' ? s.effects : d.effects,
    sky: typeof s.sky === 'boolean' ? s.sky : d.sky,
    grass: pick(s.grass, ['off', 'low', 'medium', 'high'] as const, d.grass),
    particles: pick(s.particles, ['low', 'medium', 'high'] as const, d.particles),
    resolution: Number.isFinite(res) ? Math.min(1.35, Math.max(0.5, res)) : d.resolution,
  };
}
