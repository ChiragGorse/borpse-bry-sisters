/**
 * Background music: the Ballad and Island instrumentals take turns on the title screen and the farm,
 * "Entering the Forest" plays in the forest, and the fight track takes over (with a crossfade) while a fight is on.
 *
 * The tracks are plain files next to the page (public/music/), streamed with <audio> elements so the
 * single-file game page stays small. If they are missing (e.g. a page opened from somewhere without
 * them), the game just plays without music.
 */
export type MusicMood = 'farm' | 'forest' | 'fight';

const FARM_TRACKS = ['music/ballad.mp3', 'music/island.mp3'];
const FIGHT_TRACK = 'music/fight.mp3';
const FOREST_TRACK = 'music/forest.mp3';
const VOLUME = 0.42;
/** Seconds for a full fade in or out. */
const FADE = 1.6;

interface Track {
  el: HTMLAudioElement;
  /** Current fade level, 0-1. */
  level: number;
}

export class Music {
  private farm: Track[] = [];
  private fight: Track | null = null;
  private forest: Track | null = null;
  private farmIdx = 0;
  private unlocked = false;
  private lastT = 0;
  muted = false;
  mood: MusicMood = 'farm';

  private make(src: string, loop: boolean): Track {
    const el = new Audio();
    el.src = src;
    el.preload = 'auto';
    el.loop = loop;
    el.volume = 0;
    return { el, level: 0 };
  }

  /** Browsers only allow sound after the player has clicked or pressed something: call this then. */
  unlock() {
    if (this.unlocked || typeof Audio === 'undefined') return;
    this.unlocked = true;
    this.farm = FARM_TRACKS.map((src) => this.make(src, false));
    // when one farm song ends, the other one starts
    this.farm.forEach((t, i) =>
      t.el.addEventListener('ended', () => {
        if (this.farmIdx !== i) return;
        this.farmIdx = (i + 1) % this.farm.length;
        const next = this.farm[this.farmIdx];
        next.el.currentTime = 0;
        next.level = this.mood === 'farm' ? 1 : 0;
        this.apply(next);
        if (this.mood === 'farm' && !this.muted) void next.el.play().catch(() => {});
      }),
    );
    this.fight = this.make(FIGHT_TRACK, true);
    this.forest = this.make(FOREST_TRACK, true);
  }

  setMuted(m: boolean) {
    this.muted = m;
    for (const t of this.all()) {
      if (m) t.el.pause();
      this.apply(t);
    }
  }

  private all(): Track[] {
    return [...this.farm, ...(this.fight ? [this.fight] : []), ...(this.forest ? [this.forest] : [])];
  }

  private apply(t: Track) {
    t.el.volume = Math.max(0, Math.min(1, this.muted ? 0 : t.level * t.level * VOLUME));
  }

  /** Fades towards the music for `mood`. Call every frame. (Fades run on the wall clock, not the game's capped frame time.) */
  update(mood: MusicMood) {
    if (!this.unlocked) return;
    const now = performance.now();
    const dt = this.lastT ? Math.min(0.5, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    if (mood !== this.mood) {
      // coming back to the farm after a fight: start the next farm song fresh
      if (mood === 'farm' && this.mood !== 'farm') {
        const cur = this.farm[this.farmIdx];
        if (cur && cur.level <= 0.01) {
          this.farmIdx = (this.farmIdx + 1) % this.farm.length;
          this.farm[this.farmIdx].el.currentTime = 0;
        }
      }
      // a new fight starts the fight song from the top once the old one has faded out
      if (mood === 'fight' && this.fight && this.fight.level <= 0.01) this.fight.el.currentTime = 0;
      this.mood = mood;
    }
    const step = dt / FADE;
    this.farm.forEach((t, i) => this.fade(t, mood === 'farm' && i === this.farmIdx, step));
    if (this.fight) this.fade(this.fight, mood === 'fight', step);
    if (this.forest) this.fade(this.forest, mood === 'forest', step);
  }

  private fade(t: Track, on: boolean, step: number) {
    t.level = Math.max(0, Math.min(1, t.level + (on ? step : -step)));
    this.apply(t);
    if (this.muted) return;
    if (t.level > 0 && t.el.paused) void t.el.play().catch(() => {});
    else if (t.level <= 0 && !t.el.paused) t.el.pause();
  }

  dispose() {
    for (const t of this.all()) {
      t.el.pause();
      t.el.removeAttribute('src');
      t.el.load();
    }
    this.farm = [];
    this.fight = null;
    this.forest = null;
  }
}
