import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Game } from '../game/Game';
import type { HudState } from '../game/data';

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
 */

const STICK_RADIUS = 56; // px the knob can travel from the base centre
const DEADZONE = 0.12;
const LOOK_SPEED = 1.8; // touch pixels → "mouse pixels"; a finger drag needs more turn per pixel than a mouse

interface Props {
  game: () => Game | null;
  hud: HudState;
}

type Pt = { id: number; x: number; y: number };

export function MobileControls({ game, hud }: Props) {
  const root = useRef<HTMLDivElement>(null);
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
      const h = el.getBoundingClientRect().height || window.innerHeight;
      placeStick(104, h - 104, 0, 0, false);
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
        if (!stick && p.x < p.w * 0.5 && p.y > p.h * 0.35) {
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
  }, [game]);

  const inForest = hud.area === 'forest';
  const canListen = inForest && !!hud.hunt && hud.hunt.caught < hud.hunt.total;

  return (
    <div
      ref={root}
      aria-label="Touch controls"
      className="absolute inset-0 z-[9] touch-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* joystick */}
      <div ref={base} className="pointer-events-none absolute left-0 top-0 rounded-full p-[14px] transition-opacity duration-150" aria-hidden="true">
        <div
          className="flex items-center justify-center rounded-full border-[3px] border-ink/70 bg-paper/25 backdrop-blur-[2px]"
          style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
        >
          <div ref={knob} className="h-14 w-14 rounded-full border-[3px] border-ink bg-pig shadow-[0_3px_0_var(--color-ink)]" />
        </div>
      </div>

      {/* pause */}
      <TouchButton
        label="Pause"
        size={44}
        style={{ left: 'calc(env(safe-area-inset-left) + 10px)', top: '42%' }}
        className="bg-paper"
        onPress={() => game()?.pause()}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
          <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
        </svg>
      </TouchButton>

      {/* action cluster, anchored on the headbutt button */}
      <ActionCluster game={game} hud={hud} canListen={canListen} />
    </div>
  );
}

/** Position on an arc around the headbutt button: `a` degrees from "left", sweeping up; `r` px out. */
function arc(a: number, r: number, size: number) {
  const anchorRight = 30 + 40; // centre of the 80px headbutt button
  const anchorBottom = 30 + 40;
  const rad = (a * Math.PI) / 180;
  return {
    right: `calc(env(safe-area-inset-right) + ${anchorRight + Math.cos(rad) * r - size / 2}px)`,
    bottom: `calc(env(safe-area-inset-bottom) + ${anchorBottom + Math.sin(rad) * r - size / 2}px)`,
  };
}

function ActionCluster({ game, hud, canListen }: { game: () => Game | null; hud: HudState; canListen: boolean }) {
  const press = (code: string) => () => game()?.touchPress(code);
  const release = (code: string) => () => game()?.touchRelease(code);

  // Unlockables fill the outer ring in order, so a new ability pops into the next free slot.
  const extras: { code: string; label: string; cd: number; className: string; icon: ReactNode }[] = [];
  if (hud.zapUnlocked) extras.push({ code: 'KeyQ', label: 'Zap', cd: hud.zapCd, className: 'bg-lab', icon: '⚡' });
  if (hud.whipUnlocked) extras.push({ code: 'KeyC', label: 'Whip', cd: hud.whipCd, className: 'bg-[#7fc8cf]', icon: '〰' });
  if (hud.squealUnlocked) extras.push({ code: 'KeyF', label: 'Squeal', cd: hud.squealCd, className: 'bg-[#ffb3c7]', icon: '📢' });
  if (canListen)
    extras.push({ code: 'KeyR', label: 'Listen', cd: hud.hunt?.listenCd ?? 0, className: 'bg-[#a9d18e]', icon: '👂' });
  const outer = [8, 38, 68, 98];

  return (
    <>
      <TouchButton
        label={hud.cycloneUnlocked ? 'Headbutt combo' : 'Headbutt'}
        size={80}
        style={{ right: 'calc(env(safe-area-inset-right) + 30px)', bottom: 'calc(env(safe-area-inset-bottom) + 30px)' }}
        className="bg-mustard"
        onPress={press('KeyJ')}
        onRelease={release('KeyJ')}
      >
        <span className="font-display text-sm leading-none">BUTT</span>
      </TouchButton>
      <TouchButton
        label={hud.rushReady ? 'River Rush' : 'Charge'}
        size={60}
        style={arc(0, 92, 60)}
        className={hud.rushReady ? 'bg-[#7df9ff]' : 'bg-barn text-paper'}
        cd={hud.rushReady ? 0 : hud.chargeCd}
        onPress={press('KeyK')}
        onRelease={release('KeyK')}
      >
        <span className="font-display text-[11px] leading-none">{hud.rushReady ? 'RUSH' : 'DASH'}</span>
      </TouchButton>
      <TouchButton
        label="Dodge roll"
        size={60}
        style={arc(45, 92, 60)}
        className="bg-white"
        cd={hud.stam < 25 ? 1 : 0}
        onPress={press('ShiftLeft')}
        onRelease={release('ShiftLeft')}
      >
        <span className="font-display text-[11px] leading-none">ROLL</span>
      </TouchButton>
      <TouchButton
        label="Jump"
        size={60}
        style={arc(90, 92, 60)}
        className="bg-paper"
        onPress={press('Space')}
        onRelease={release('Space')}
      >
        <span className="font-display text-[11px] leading-none">JUMP</span>
      </TouchButton>
      {extras.map((x, i) => (
        <TouchButton
          key={x.code}
          label={x.label}
          size={50}
          style={arc(outer[i], 150, 50)}
          className={`${x.className} pop-in`}
          cd={x.cd}
          onPress={press(x.code)}
          onRelease={release(x.code)}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="text-base leading-none" aria-hidden="true">
              {x.icon}
            </span>
            <span className="mt-0.5 text-[8px] font-extrabold uppercase">{x.label}</span>
          </span>
        </TouchButton>
      ))}
    </>
  );
}

function TouchButton({
  label,
  size,
  style,
  className = '',
  cd = 0,
  onPress,
  onRelease,
  children,
}: {
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
  return (
    <button
      type="button"
      aria-label={label}
      className={`absolute flex touch-none select-none items-center justify-center overflow-hidden rounded-full border-[3px] border-ink text-ink shadow-[0_4px_0_var(--color-ink)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-ink)] ${className}`}
      style={{ ...style, width: size, height: size }}
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
