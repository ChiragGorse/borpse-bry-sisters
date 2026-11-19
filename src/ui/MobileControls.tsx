import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Game } from '../game/Game';
import { ACTIVE_INFO, LOADOUT_SLOTS, SLOT_CODES, type HudState } from '../game/data';
import { SCALE_MAX, SCALE_MIN, clamp01, resetTouchLayout, setTouchLayout, useTouchLayout, type TouchLayout } from './touchLayout';

/**
 * On-screen controls for phones and tablets.
 *
 * - Left side of the screen: a floating joystick. Touch anywhere in the lower-left and the stick
 *   appears under your thumb; drag to trot around (analog — a small push walks).
 * - Anywhere else that isn't a button: drag to pan the camera, so the other thumb can steer while moving.
 * - Bottom-right: action buttons. Headbutt, Charge (dash), Roll and Jump are always there; Zap, Whip and
 *   Squeal fade in once they're bought / learned, and Listen appears while hunting in the forest.
 *
 * Buttons send the same key codes the keyboard does, so the game logic is shared with desktop.
 *
 * Every button can be dragged somewhere else (and resized, and the stick swapped to the right) in edit
 * mode, opened from Settings; the arrangement is saved on this device (./touchLayout.ts).
 */

const STICK_RADIUS = 40; // px the knob can travel from the base centre
const DEADZONE = 0.12;
// Button layout (px). Kept small so the farm stays visible on phone screens.
const HB_SIZE = 54; // headbutt
const HB_EDGE = 16; // headbutt distance from the bottom-right corner
const RING_SIZE = 40; // dash / roll / jump
const RING_R = 58;
const EXTRA_SIZE = 34; // unlockables + listen
const EXTRA_R = 98;
const LOOK_SPEED = 1.8; // touch pixels → "mouse pixels"; a finger drag needs more turn per pixel than a mouse

interface Props {
  game: () => Game | null;
  hud: HudState;
  /** Arrange the buttons instead of playing. */
  edit?: boolean;
  onDone?: () => void;
}

type Pt = { id: number; x: number; y: number };

export function MobileControls({ game, hud, edit = false, onDone }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const saved = useTouchLayout();
  // edits happen on a draft, saved when you press Done
  const [draft, setDraft] = useState<TouchLayout>(saved);
  const layout = edit ? draft : saved;
  const stickRight = layout.stickRight;
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);

  // Touch Events (not Pointer Events) drive the stick and camera: they're the most consistent multi-touch
  // source across iOS Safari and Android Chrome, and each finger keeps a stable `identifier`.
  // Listeners are native + non-passive so preventDefault() can stop scrolling, zooming and text selection.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let stick: (Pt & { ox: number; oy: number }) | null = null;
    const looks = new Map<number, Pt>();

    const placeStick = (cx: number, cy: number, kx: number, ky: number, active: boolean) => {
      const b = base.current;
      const k = knob.current;
      if (!b || !k) return;
      b.style.transform = `translate(${cx - STICK_RADIUS - 14}px, ${cy - STICK_RADIUS - 14}px)`;
      b.style.opacity = active ? '1' : '0.55';
      k.style.transform = `translate(${kx}px, ${ky}px)`;
    };
    const resetStick = () => {
      const r = el.getBoundingClientRect();
      const h = r.height || window.innerHeight;
      const w = r.width || window.innerWidth;
      placeStick(stickRight ? w - 74 : 74, h - 70, 0, 0, false);
    };
    const local = (t: Touch) => {
      const r = el.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top, w: r.width, h: r.height };
    };
    // Fingers that land on a button belong to that button, not to the stick or camera.
    const onButton = (t: Touch) => t.target instanceof Element && !!t.target.closest('button');

    const start = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (onButton(t)) continue;
        e.preventDefault();
        const p = local(t);
        // Lower-left region spawns the joystick (if it isn't already held); everything else looks around.
        if (!stick && (stickRight ? p.x > p.w * 0.5 : p.x < p.w * 0.5) && p.y > p.h * 0.35) {
          stick = { id: t.identifier, x: p.x, y: p.y, ox: p.x, oy: p.y };
          placeStick(p.x, p.y, 0, 0, true);
          game()?.setTouchMove(0, 0);
        } else {
          looks.set(t.identifier, { id: t.identifier, x: p.x, y: p.y });
        }
      }
    };

    const move = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const p = local(t);
        if (stick && stick.id === t.identifier) {
          e.preventDefault();
          let dx = p.x - stick.ox;
          let dy = p.y - stick.oy;
          const d = Math.hypot(dx, dy);
          if (d > STICK_RADIUS) {
            // Drag past the rim and the base follows your thumb, so you never "run out" of stick.
            const over = d - STICK_RADIUS;
            stick.ox += (dx / d) * over;
            stick.oy += (dy / d) * over;
            dx = p.x - stick.ox;
            dy = p.y - stick.oy;
          }
          placeStick(stick.ox, stick.oy, dx, dy, true);
          const mag = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
          if (mag < DEADZONE) game()?.setTouchMove(0, 0);
          else {
            const scaled = (mag - DEADZONE) / (1 - DEADZONE) / mag;
            game()?.setTouchMove((dx / STICK_RADIUS) * scaled, (-dy / STICK_RADIUS) * scaled);
          }
          continue;
        }
        const l = looks.get(t.identifier);
        if (l) {
          e.preventDefault();
          game()?.touchLook((p.x - l.x) * LOOK_SPEED, (p.y - l.y) * LOOK_SPEED);
          l.x = p.x;
          l.y = p.y;
        }
      }
    };

    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (stick?.id === t.identifier) {
          stick = null;
          game()?.setTouchMove(0, 0);
          resetStick();
        }
        looks.delete(t.identifier);
      }
    };

    resetStick();
    // while arranging buttons, fingers drag buttons and nothing else
    if (edit) return;
    const opts = { passive: false } as const;
    el.addEventListener('touchstart', start, opts);
    el.addEventListener('touchmove', move, opts);
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    window.addEventListener('resize', resetStick);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      window.removeEventListener('resize', resetStick);
      // Controls going away (pause, shop, game over…) must not leave Kenji trotting.
      game()?.setTouchMove(0, 0);
    };
  }, [game, edit, stickRight]);

  const inForest = hud.area === 'forest';
  const canListen = edit || (inForest && !!hud.hunt && !hud.hunt.done);
  const place: Place = {
    layout,
    edit,
    flip: stickRight,
    move: (id, x, y) => setDraft((d) => ({ ...d, pos: { ...d.pos, [id]: { x: clamp01(x), y: clamp01(y) } } })),
    root,
  };

  return (
    <div
      ref={root}
      aria-label="Touch controls"
      className="absolute inset-0 touch-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* joystick */}
      <div ref={base} className="pointer-events-none absolute left-0 top-0 rounded-full p-[14px] transition-opacity duration-150" aria-hidden="true">
        <div
          className="flex items-center justify-center rounded-full border-2 border-ink/50 bg-paper/15"
          style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
        >
          <div ref={knob} className="h-9 w-9 rounded-full border-2 border-ink/80 bg-pig/80" />
        </div>
      </div>

      {edit && (
        <div className="pointer-events-auto absolute inset-x-2 top-2 z-[12] mx-auto flex max-w-[640px] flex-wrap items-center justify-center gap-2 rounded-2xl border-[2.5px] border-ink bg-paper/95 px-3 py-2 text-ink shadow-[3px_3px_0_var(--color-ink)]">
          <span className="text-xs font-extrabold">Drag the buttons where you want them.</span>
          <span className="flex items-center gap-1 text-xs font-extrabold">
            Size
            <button type="button" className="rounded-full border-2 border-ink bg-white px-2 font-display" aria-label="Smaller buttons" onClick={() => setDraft((d) => ({ ...d, scale: Math.max(SCALE_MIN, Math.round((d.scale - 0.1) * 10) / 10) }))}>−</button>
            <span className="w-8 text-center tabular-nums">{Math.round(draft.scale * 100)}%</span>
            <button type="button" className="rounded-full border-2 border-ink bg-white px-2 font-display" aria-label="Bigger buttons" onClick={() => setDraft((d) => ({ ...d, scale: Math.min(SCALE_MAX, Math.round((d.scale + 0.1) * 10) / 10) }))}>+</button>
          </span>
          <button type="button" className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-[11px] font-extrabold uppercase" onClick={() => setDraft((d) => ({ ...d, stickRight: !d.stickRight }))}>
            Stick: {draft.stickRight ? 'right' : 'left'}
          </button>
          <button type="button" className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-[11px] font-extrabold uppercase" onClick={() => { resetTouchLayout(); setDraft({ pos: {}, scale: 1, stickRight: false }); }}>
            Reset
          </button>
          <button type="button" className="rounded-full border-2 border-ink bg-mustard px-3 py-0.5 text-[11px] font-extrabold uppercase" onClick={() => { setTouchLayout(draft); onDone?.(); }}>
            Done
          </button>
        </div>
      )}
      {/* pause */}
      <TouchButton
        id="pause"
        place={place}
        label="Pause"
        size={30}
        style={{ left: 'calc(env(safe-area-inset-left) + 10px)', top: '42%' }}
        className="bg-paper/60"
        onPress={() => game()?.pause()}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
          <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
        </svg>
      </TouchButton>

      {/* action cluster, anchored on the headbutt button */}
      <ActionCluster game={game} hud={hud} canListen={canListen} place={place} />
    </div>
  );
}

/** Position on an arc around the headbutt button: `a` degrees from "left", sweeping up; `r` px out. */
function arc(a: number, r: number, size: number, flip = false, scale = 1) {
  const anchorSide = (HB_EDGE + HB_SIZE / 2) * scale; // centre of the headbutt button
  const anchorBottom = (HB_EDGE + HB_SIZE / 2) * scale;
  const rad = (a * Math.PI) / 180;
  const side = `calc(env(safe-area-inset-${flip ? 'left' : 'right'}) + ${anchorSide + Math.cos(rad) * r * scale - (size * scale) / 2}px)`;
  return {
    ...(flip ? { left: side } : { right: side }),
    bottom: `calc(env(safe-area-inset-bottom) + ${anchorBottom + Math.sin(rad) * r * scale - (size * scale) / 2}px)`,
  };
}

/** How buttons find their spot: the saved layout, edit mode, and which side the cluster sits on. */
interface Place {
  layout: TouchLayout;
  edit: boolean;
  flip: boolean;
  move: (id: string, x: number, y: number) => void;
  root: React.RefObject<HTMLDivElement | null>;
}

function ActionCluster({ game, hud, canListen, place }: { game: () => Game | null; hud: HudState; canListen: boolean; place: Place }) {
  const press = (code: string) => () => game()?.touchPress(code);
  const release = (code: string) => () => game()?.touchRelease(code);
  const { flip } = place;
  const sc = place.layout.scale;

  // each loadout slot has its own spot on the outer rings (in edit mode, empty slots show too)
  const tint: Record<string, string> = { zap: 'bg-lab/75', tailwhip: 'bg-[#7fc8cf]/75', squeal: 'bg-[#ffb3c7]/75', portal: 'bg-[#e8d97a]/75', decoy: 'bg-[#9ff6ff]/75', potion: 'bg-[#a6f0b0]/75', smash: 'bg-[#cbb8f0]/75' };
  const ring = (i: number) => (i < 4 ? arc([8, 38, 68, 98][i], EXTRA_R, EXTRA_SIZE, flip, sc) : arc([14, 40, 66, 92][i - 4] ?? 92, EXTRA_R + EXTRA_SIZE + 8, EXTRA_SIZE, flip, sc));
  const extras: { id: string; code: string; label: string; cd: number; className: string; icon: ReactNode; style: CSSProperties }[] = [];
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    const a = hud.actives[i];
    if (a?.id) extras.push({ id: `slot${i}`, code: a.code, label: a.name, cd: a.cd, className: tint[a.id] ?? 'bg-paper/75', icon: ACTIVE_INFO[a.id].icon, style: ring(i) });
    else if (place.edit) extras.push({ id: `slot${i}`, code: SLOT_CODES[i], label: `Slot ${i + 1}`, cd: 0, className: 'bg-paper/50', icon: '·', style: ring(i) });
  }
  if (canListen) extras.push({ id: 'listen', code: 'KeyR', label: 'Ask Herb', cd: hud.hunt?.listenCd ?? 0, className: 'bg-[#a9d18e]/75', icon: '🐽', style: ring(6) });
  const side = (px: number) => (flip ? { left: `calc(env(safe-area-inset-left) + ${px}px)` } : { right: `calc(env(safe-area-inset-right) + ${px}px)` });

  return (
    <>
      <TouchButton
        id="butt"
        place={place}
        label={hud.cycloneUnlocked ? 'Headbutt combo' : 'Headbutt'}
        size={HB_SIZE}
        style={{ ...side(HB_EDGE * sc), bottom: `calc(env(safe-area-inset-bottom) + ${HB_EDGE * sc}px)` }}
        className="bg-mustard/75"
        onPress={press('KeyJ')}
        onRelease={release('KeyJ')}
      >
        <span className="font-display text-[11px] leading-none">BUTT</span>
      </TouchButton>
      <TouchButton
        id="charge"
        place={place}
        label={hud.rushReady ? 'River Rush' : 'Charge'}
        size={RING_SIZE}
        style={arc(0, RING_R, RING_SIZE, flip, sc)}
        className={hud.rushReady ? 'bg-[#7df9ff]/80' : 'bg-barn/75 text-paper'}
        cd={hud.rushReady ? 0 : hud.chargeCd}
        onPress={press('KeyK')}
        onRelease={release('KeyK')}
      >
        <span className="font-display text-[8.5px] leading-none">{hud.rushReady ? 'RUSH' : 'DASH'}</span>
      </TouchButton>
      <TouchButton
        id="roll"
        place={place}
        label="Dodge roll"
        size={RING_SIZE}
        style={arc(45, RING_R, RING_SIZE, flip, sc)}
        className="bg-white/60"
        cd={hud.stam < 25 ? 1 : 0}
        onPress={press('ShiftLeft')}
        onRelease={release('ShiftLeft')}
      >
        <span className="font-display text-[8.5px] leading-none">ROLL</span>
      </TouchButton>
      <TouchButton
        id="jump"
        place={place}
        label="Jump"
        size={RING_SIZE}
        style={arc(90, RING_R, RING_SIZE, flip, sc)}
        className="bg-paper/60"
        onPress={press('Space')}
        onRelease={release('Space')}
      >
        <span className="font-display text-[8.5px] leading-none">JUMP</span>
      </TouchButton>
      {extras.map((x) => (
        <TouchButton
          key={x.id}
          id={x.id}
          place={place}
          label={x.label}
          size={EXTRA_SIZE}
          style={x.style}
          className={`${x.className} pop-in`}
          cd={x.cd}
          onPress={press(x.code)}
          onRelease={release(x.code)}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="text-[11px] leading-none" aria-hidden="true">
              {x.icon}
            </span>
            <span className="mt-px text-[6.5px] font-extrabold uppercase">{x.label}</span>
          </span>
        </TouchButton>
      ))}
    </>
  );
}

function TouchButton({
  id,
  place,
  label,
  size,
  style,
  className = '',
  cd = 0,
  onPress,
  onRelease,
  children,
}: {
  id: string;
  place: Place;
  label: string;
  size: number;
  style: CSSProperties;
  className?: string;
  cd?: number;
  onPress: () => void;
  onRelease?: () => void;
  children: ReactNode;
}) {
  const held = useRef<number | null>(null);
  const cooling = cd > 0;
  const px = size * place.layout.scale;
  const saved = place.layout.pos[id];
  // a spot you chose (centre, as a fraction of the screen) beats the default arc
  const at: CSSProperties = saved ? { left: `${saved.x * 100}%`, top: `${saved.y * 100}%`, transform: 'translate(-50%, -50%)' } : style;
  const drag = (e: React.PointerEvent) => {
    const r = place.root.current?.getBoundingClientRect();
    if (!r) return;
    place.move(id, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  if (place.edit)
    return (
      <button
        type="button"
        aria-label={`Move ${label}`}
        className={`absolute z-[11] flex touch-none select-none items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-ink text-ink outline outline-2 outline-offset-2 outline-mustard ${className}`}
        style={{ ...at, width: px, height: px }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="relative">{children}</span>
      </button>
    );
  return (
    <button
      type="button"
      aria-label={label}
      className={`absolute z-[11] flex touch-none select-none items-center justify-center overflow-hidden rounded-full border-2 border-ink/80 text-ink shadow-[0_2px_0_rgb(42_26_18/0.6)] active:translate-y-[2px] active:shadow-none ${className}`}
      style={{ ...at, width: px, height: px }}
      onTouchStart={(e) => {
        const t = e.changedTouches[0];
        if (!t || held.current !== null) return;
        held.current = t.identifier;
        navigator.vibrate?.(8);
        onPress();
      }}
      onTouchEnd={(e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === held.current) {
            held.current = null;
            onRelease?.();
          }
        }
      }}
      onTouchCancel={() => {
        held.current = null;
        onRelease?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {cooling && <span className="absolute inset-x-0 bottom-0 bg-ink/45" style={{ height: `${Math.min(1, cd) * 100}%` }} aria-hidden="true" />}
      <span className="relative">{children}</span>
    </button>
  );
}
