import type { ReactNode } from 'react';
import type { HudState } from '../game/data';
import { padActionLabel } from '../game/gamepad';
import { bindLabel, getBinds, keyLabel, type BindAction } from '../game/keybinds';

export function TruffleIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse cx="12" cy="13" rx="9.5" ry="7.5" fill="none" stroke="#f0b429" strokeWidth="2.2" />
      <path d="M12 5 17.5 8.5 18.5 14 14.5 19 9 19 5.5 14 7 8Z" fill="#6b4a2e" stroke="#2a1a12" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="10" cy="11" r="1.1" fill="#8d6a48" />
      <circle cx="14.5" cy="14" r="1.3" fill="#8d6a48" />
    </svg>
  );
}

/** Every key bound to an action, as key caps separated by slashes. */
export function Keys({ action }: { action: BindAction }) {
  const keys = getBinds()[action];
  if (!keys.length) return <Key>unbound</Key>;
  return (
    <>
      {keys.map((c, i) => (
        <span key={c} className="contents">
          {i > 0 && ' / '}
          <Key>{keyLabel(c)}</Key>
        </span>
      ))}
    </>
  );
}

export function Portrait({ src, alt, className = '', bg = 'bg-pig' }: { src?: string; alt: string; className?: string; bg?: string }) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-full border-[3px] border-ink ${bg} ${className}`}>
      {src ? <img src={src} alt={alt} className="h-full w-full object-cover" draggable={false} /> : <span className="sr-only">{alt}</span>}
    </div>
  );
}

export function Key({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={`inline-flex min-w-7 items-center justify-center rounded-md border-2 px-1.5 py-0.5 font-mono text-xs font-medium leading-none ${
        dark ? 'border-neon/70 bg-night text-neon' : 'border-ink bg-white text-ink shadow-[0_2px_0_var(--color-ink)]'
      }`}
    >
      {children}
    </kbd>
  );
}

function Bar({ value, max, label, fill, className = '' }: { value: number; max: number; label: string; fill: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div
      className={`overflow-hidden rounded-full border-[2.5px] border-ink bg-ink/85 ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
    >
      <div className={`h-full rounded-full transition-[width] duration-150 ease-out ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Ability({
  k,
  name,
  cd = 0,
  locked = false,
  hint,
  glow = false,
  icon,
}: {
  k: string;
  name: string;
  /** Shown instead of the name (the six ability slots are narrow). */
  icon?: string;
  cd?: number;
  locked?: boolean;
  hint?: string;
  glow?: boolean;
}) {
  const ready = !locked && cd <= 0;
  return (
    <div
      title={icon ? name : undefined}
      className={`relative flex h-[46px] flex-1 flex-col items-center justify-center overflow-hidden rounded-lg border-[2.5px] px-0.5 ${
        locked
          ? 'border-dashed border-ink/35 text-ink/45'
          : glow
            ? 'border-ink bg-[#7df9ff]'
            : ready
              ? 'border-ink bg-white'
              : 'border-ink bg-white/60'
      }`}
    >
      {cd > 0 && !glow && <div className="absolute inset-x-0 bottom-0 bg-ink/40" style={{ height: `${Math.min(1, cd) * 100}%` }} />}
      <span className="relative font-mono text-[9.5px] font-medium leading-none">{locked ? (hint ?? 'locked') : k}</span>
      {icon ? (
        <span className="relative mt-1 text-[15px] leading-none" aria-label={name}>
          {icon}
        </span>
      ) : (
        <span className="relative mt-1 text-[9.5px] font-extrabold uppercase leading-none">{name}</span>
      )}
    </div>
  );
}

const SPEAKER: Record<string, string> = {
  Allen: 'bg-[#ff7a1a] text-ink',
  Rickley: 'bg-barn text-paper',
  Kingger: 'bg-lab text-ink',
  Trout: 'bg-[#1f6f78] text-paper',
  'Path Guppy': 'bg-[#266854] text-paper',
  Kenji: 'bg-pig text-ink',
  Charig: 'bg-[#2f6d4e] text-paper',
  Kioff: 'bg-[#6a4c9c] text-paper',
  Earwhen: 'bg-[#6fb7e8] text-ink',
};

/** Earwhen's health bar (the finale). */
function EarwhenBar({ earwhen, portraits }: { earwhen: NonNullable<HudState['earwhen']>; portraits: Record<string, string> }) {
  return (
    <section aria-label="Earwhen status" className="sticker w-full max-w-[580px] px-3 py-2">
      <div className="flex items-center gap-3">
        <Portrait src={portraits.earwhen} alt="Earwhen" bg="bg-[#d4ecfa]" className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="font-display text-base leading-none text-[#2f7fb5]">
              EARWHEN
              <span className="ml-2 align-middle font-mono text-[10px] font-medium tabular-nums text-ink/60">
                {Math.ceil(earwhen.hp)}/{earwhen.maxHp}
              </span>
            </h2>
            <span className={`rounded-full border-2 border-ink px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${earwhen.alert ? 'alert-blink bg-barn text-paper' : 'bg-white text-ink'}`}>
              {earwhen.tag}
            </span>
          </div>
          <Bar value={earwhen.hp} max={earwhen.maxHp} label="Earwhen health" fill="bg-[#6fb7e8]" className="mt-1.5 h-4" />
        </div>
      </div>
    </section>
  );
}

interface HudProps {
  hud: HudState;
  portraits: Record<string, string>;
  minimapRef: (el: HTMLCanvasElement | null) => void;
  dim: boolean;
  /** Phone/tablet: on-screen controls are showing, so hide keyboard hints and make the prompt tappable. */
  touch?: boolean;
  onInteract?: () => void;
}

/** Your panel when you play Allen: his health and poise, his moves with their cooldowns, and the pigs. */
function AllenPanel({ hud, portraits, touch }: { hud: HudState; portraits: Record<string, string>; touch: boolean }) {
  const a = hud.allen!;
  const boss = hud.boss;
  return (
    <section aria-label="Allen status" className="sticker col-start-1 row-start-1 w-full max-w-[236px] p-2 sm:w-[300px] sm:max-w-none sm:p-2.5">
      <div className="flex items-center gap-2.5">
        <Portrait src={portraits.allen} alt="Allen B. Hwang" bg="bg-[#ffd3b0]" className="h-8 w-8 min-[360px]:h-10 min-[360px]:w-10 sm:h-12 sm:w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="truncate font-display text-sm leading-none text-[#c2501a] sm:text-lg">YOU ARE ALLEN</h2>
            {boss.active && (
              <span className="font-mono text-[10px] font-medium tabular-nums sm:text-xs">
                {Math.ceil(boss.hp)}/{boss.maxHp}
              </span>
            )}
          </div>
          {boss.active ? (
            <>
              <Bar value={boss.hp} max={boss.maxHp} label="Allen health" fill="bg-[#ff8a3c]" className="mt-1.5 h-4" />
              <Bar value={boss.poise * 100} max={100} label="Stagger" fill="bg-mustard" className="mt-1 h-2.5" />
            </>
          ) : (
            <p className="mt-1 text-[11px] font-bold leading-tight text-ink/70">Waiting at the gate for the next course</p>
          )}
        </div>
      </div>
      <div className={`mt-2 grid-cols-4 gap-1 ${touch ? 'hidden' : 'grid'}`}>
        {a.moves.map((m) => (
          <Ability key={m.name} k={m.key} name={m.name} cd={m.cd} />
        ))}
      </div>
      <p className="mt-2 text-[10px] font-bold leading-tight text-ink/60">E next to a crop or pie to eat it · get staggered and the pigs pile on</p>
      {hud.party && (
        <ul aria-label="The pigs" className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
          {hud.party.map((p) => (
            <li key={p.id} className={`flex min-w-0 items-center gap-1 ${p.down ? 'opacity-50' : ''}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ink" style={{ background: p.tint }} aria-hidden="true" />
              <span className="truncate text-[10px] font-extrabold uppercase leading-none tracking-wide">{p.down ? `${p.name} · down` : p.name}</span>
              <span className="ml-auto h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-ink/25" aria-label={`${p.hp} of ${p.maxHp} health`}>
                <span className="block h-full rounded-full bg-[#e8506a]" style={{ width: `${Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100))}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Hud({ hud, portraits, minimapRef, dim, touch = false, onInteract }: HudProps) {
  const boss = hud.boss;
  const shield = boss.shield;
  const pad = hud.gamepad?.active ? hud.gamepad.layout : undefined;
  const low = hud.hp / hud.maxHp < 0.3 && hud.hp > 0;
  const [promptKey, promptText] = hud.prompt ? hud.prompt.split('|') : ['', ''];
  const interactKey = pad ? padActionLabel(pad, 'interact') : bindLabel('interact');
  const listenKey = pad ? padActionLabel(pad, 'listen') : bindLabel('listen');
  const inForest = hud.area === 'forest';
  const firstBreak = !inForest && hud.mode === 'intermission' && hud.course === 0;

  // a story moment: letterbox the screen and show only who's talking
  if (hud.cinematic)
    return (
      <div className="cutscene pointer-events-none absolute inset-0 z-10">
        <div className="cutscene-bar cutscene-bar-top" />
        <div className="cutscene-bar cutscene-bar-bottom" />
        {hud.subtitle && (
          <div className="absolute inset-x-0 bottom-[calc(var(--cutscene-bar)+12px)] flex justify-center px-4">
            <p key={hud.subtitle.text} className="pop-in flex max-w-[640px] items-start gap-2.5 rounded-2xl border-[3px] border-ink bg-paper/95 px-3.5 py-2 shadow-[4px_4px_0_var(--color-ink)]" role="status">
              <span className={`mt-0.5 shrink-0 rounded-md border-2 border-ink px-2 py-0.5 font-display text-xs leading-tight ${SPEAKER[hud.subtitle.who] ?? 'bg-white'}`}>{hud.subtitle.who.toUpperCase()}</span>
              <span className="text-[15px] font-bold leading-snug">{hud.subtitle.text}</span>
            </p>
          </div>
        )}
      </div>
    );

  return (
    <div className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-200 ${dim ? 'opacity-30' : 'opacity-100'} ${touch ? 'hud-touch' : ''}`}>
      {low && <div className="low-hp absolute inset-0" />}
      {hud.hurtTick > 0 && <div key={hud.hurtTick} className="hurt-flash absolute inset-0" />}

      <div className="absolute inset-x-0 top-0 grid grid-cols-[minmax(0,1fr)_minmax(0,7.5rem)] items-start gap-2 p-2 sm:grid-cols-[auto_1fr_auto] sm:gap-3 sm:p-4">
        {/* Kenji, or Allen when you play him */}
        {hud.allen ? (
          <AllenPanel hud={hud} portraits={portraits} touch={touch} />
        ) : (
        <section aria-label="Kenji status" className="sticker col-start-1 row-start-1 w-full max-w-[236px] p-2 sm:w-[268px] sm:max-w-none sm:p-2.5">
          <div className="flex items-center gap-2.5">
            <Portrait src={portraits.kenji} alt="Kenji the pig" className="h-8 w-8 min-[360px]:h-10 min-[360px]:w-10 sm:h-12 sm:w-12" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="truncate font-display text-sm leading-none sm:text-lg">{(hud.party?.find((p) => p.you)?.name ?? 'Kenji').toUpperCase()}</h2>
                <span className="font-mono text-[10px] font-medium tabular-nums sm:text-xs">
                  {hud.hp}/{hud.maxHp}
                </span>
              </div>
              <Bar value={hud.hp} max={hud.maxHp} label="Kenji health" fill={low ? 'bg-barn' : 'bg-[#ee5d7c]'} className="mt-1.5 h-4" />
              <Bar value={hud.stam} max={hud.maxStam} label="Stamina" fill="bg-mustard" className="mt-1 h-2.5" />
            </div>
          </div>
          <div className={`mt-2 grid-cols-3 gap-1 ${touch ? 'hidden' : 'grid sm:flex'}`}>
            <Ability k={pad ? padActionLabel(pad, 'headbutt') : bindLabel('attack')} name={hud.cycloneUnlocked ? 'Butt×4' : 'Butt'} />
            <Ability k={pad ? padActionLabel(pad, 'charge') : bindLabel('charge')} name={hud.rushReady ? 'RUSH!' : 'Charge'} cd={hud.chargeCd} glow={hud.rushReady} />
            <Ability k={pad ? padActionLabel(pad, 'roll') : bindLabel('roll')} name="Roll" cd={hud.stam < 25 ? 1 : 0} />
          </div>
          {/* your loadout: the abilities in your six slots */}
          <div className={`mt-1 gap-1 ${touch ? 'hidden' : 'flex'}`}>
            {hud.actives.some((a) => a.id) ? (
              hud.actives.filter((a) => a.id).map((a) => <Ability key={a.slot} k={a.key} name={a.name} icon={a.icon} cd={a.cd} />)
            ) : (
              <Ability k={hud.actives[0]?.key ?? 'Q'} name="Abilities" locked hint="Shops" />
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5" aria-label={`${hud.truffles} truffles`}>
              <TruffleIcon className="h-6 w-6" />
              <span className="font-display text-xl leading-none tabular-nums">{hud.truffles}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(hud.allies > 0 || hud.fallen > 0) && (
                <span
                  className={`rounded-full border-2 border-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide tabular-nums ${
                    hud.allies > 0 ? 'bg-[#ffb3c7] text-ink' : 'bg-ink/15 text-ink/70'
                  }`}
                >
                  Hogs {hud.allies}/{hud.alliesMax}
                </span>
              )}
              {hud.fallen > 0 && (
                <span className="rounded-full border-2 border-ink bg-barn px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-paper tabular-nums" title="Rebel hogs permanently lost in battle">
                  ☠ {hud.fallen}
                </span>
              )}
              {hud.muddy && <span className="rounded-full border-2 border-ink bg-[#9a6a4e] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-paper">Mud −15%</span>}
            </div>
          </div>
          {hud.party && (
            <ul aria-label="The herd" className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
              {hud.party
                .filter((p) => !p.you)
                .map((p) => (
                  <li key={p.id} className={`flex min-w-0 items-center gap-1 ${p.down ? 'opacity-50' : ''}`}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ink" style={{ background: p.tint }} aria-hidden="true" />
                    <span className="truncate text-[10px] font-extrabold uppercase leading-none tracking-wide">{p.down ? `${p.name} · down` : p.name}</span>
                    <span className="ml-auto h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-ink/25" aria-label={`${p.hp} of ${p.maxHp} health`}>
                      <span className="block h-full rounded-full bg-[#e8506a]" style={{ width: `${Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100))}%` }} />
                    </span>
                  </li>
                ))}
            </ul>
          )}
          {hud.focus && (
            <div className="pop-in mt-2 rounded-lg border-2 border-ink bg-[#7df9ff] px-2.5 py-1 text-center text-[10px] font-extrabold uppercase tracking-wide">
              Perfect dodge · focus +35% damage
            </div>
          )}
          {hud.combo && (
            <div className="pop-in mt-2 flex items-center justify-between gap-2 rounded-lg border-2 border-ink bg-[#d7f3f7] px-2.5 py-1">
              <span className="font-display text-sm leading-none text-[#184b59] tabular-nums">{hud.combo.count}× COMBO</span>
              <span className="truncate text-[10px] font-extrabold uppercase tracking-wide text-ink/80">{hud.combo.move}</span>
              <span className="rounded border border-ink bg-mustard px-1 font-mono text-[10px] font-medium leading-tight tabular-nums">+{hud.combo.bonusPct}%</span>
            </div>
          )}
        </section>
        )}

        {/* Boss / objective */}
        <div className={`col-span-2 col-start-1 row-start-2 justify-center sm:col-span-3 lg:col-span-1 lg:col-start-2 lg:row-start-1 ${
          hud.banner && !boss.active ? 'hidden sm:flex' : 'flex'
        } ${touch ? 'landscape:px-[150px] lg:landscape:px-0' : ''}`}>
          {hud.earwhen && !boss.active ? (
            <EarwhenBar earwhen={hud.earwhen} portraits={portraits} />
          ) : boss.active ? (
            <div className="flex w-full max-w-[580px] flex-col gap-1.5">
            <section aria-label="Allen B. Hwang status" className="sticker w-full max-w-[580px] px-3 py-2.5">
              <div className="flex items-center gap-3">
                <Portrait src={portraits.allen} alt="Allen B. Hwang" bg="bg-[#ffd3b0]" className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h2 className="font-display text-lg leading-none text-[#c2501a]">
                      ALLEN B. HWANG
                      <span className="ml-2 align-middle font-mono text-[10px] font-medium uppercase tracking-wider text-ink/60">
                        Phase {boss.phase + 1}/{boss.phases}
                      </span>
                    </h2>
                    <span
                      className={`rounded-full border-2 border-ink px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${
                        boss.alert ? 'alert-blink bg-barn text-paper' : boss.enraged ? 'bg-barn text-paper' : 'bg-white text-ink'
                      }`}
                    >
                      {boss.tag}
                    </span>
                  </div>
                  <div className="relative mt-1.5">
                    <Bar
                      value={boss.hp}
                      max={boss.maxHp}
                      label="Allen health"
                      fill={shield ? 'shield-stripes' : boss.exposed ? 'bg-[#2bb3c0]' : boss.enraged ? 'bg-barn' : 'bg-[#ff7a1a]'}
                      className="h-5"
                    />
                    {Array.from({ length: boss.phases - 1 }, (_, i) => (
                      <span key={i} className="absolute inset-y-[2.5px] w-[3px] bg-paper" style={{ left: `calc(${((i + 1) / boss.phases) * 100}% - 1.5px)` }} aria-hidden="true" />
                    ))}
                    {shield && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="rounded-sm border-2 border-ink bg-paper px-1.5 font-display text-[9.5px] leading-[13px] tracking-[0.2em] text-ink">INVINCIBLE</span>
                      </span>
                    )}
                  </div>
                  {shield ? (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-barn">Sauce jars</span>
                      <span className="flex gap-1" aria-label={`${shield.left} of ${shield.total} sauce jars left`}>
                        {Array.from({ length: shield.total }, (_, i) => (
                          <span key={i} className={`h-2.5 w-3.5 rounded-sm border-2 border-ink ${i < shield.left ? 'bg-[#ff7a1a]' : 'bg-transparent'}`} />
                        ))}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/15">
                        <div className={`h-full rounded-full ${shield.time < 5 ? 'bg-barn' : 'bg-mustard'}`} style={{ width: `${(shield.time / shield.dur) * 100}%` }} />
                      </div>
                      <span className="font-mono text-[11px] font-medium tabular-nums">{Math.ceil(shield.time)}s</span>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-ink/60">Stagger</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/15">
                        <div className="h-full rounded-full bg-mustard transition-[width] duration-150" style={{ width: `${boss.poise * 100}%` }} />
                      </div>
                      {hud.foeCount > 0 && (
                        <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-barn tabular-nums">
                          +{hud.foeCount} {hud.foeCount === 1 ? 'bot' : 'bots'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
            {hud.earwhen && <EarwhenBar earwhen={hud.earwhen} portraits={portraits} />}
            </div>
          ) : hud.hunt ? (
            <section aria-label="Hog hunt" className="sticker w-full max-w-[530px] px-4 py-3 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#416744]">Hog Hunt / {hud.hunt.location}</p>
              <p className="mt-1.5 font-display text-2xl leading-none">{hud.hunt.done ? 'BACK TO THE TRAILHEAD' : `${hud.hunt.found} / ${hud.hunt.total} TRUFFLE CACHES`}</p>
              <p className="mt-2 text-xs font-bold leading-snug text-ink/75">{hud.hunt.hint}</p>
              <p className="mt-2 flex items-center justify-center gap-2 text-[11px] font-bold text-ink/65">
                {!hud.hunt.done && <><Key>{listenKey}</Key> {hud.hunt.listenCd > 0 ? `Herb is sniffing (${Math.ceil(hud.hunt.listenCd)}s)` : 'Ask Herb which way'}<span aria-hidden="true">/</span></>} {hud.hunt.done ? 'Trailhead' : 'Next cache'} {hud.hunt.distance}m
              </p>
            </section>
          ) : (
            <section aria-label="Objective" className="sticker max-w-[580px] -rotate-1 px-4 py-2.5 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-barn">
                Intermission · next up course {hud.course + 1}: {hud.courseName}
              </p>
              <p className={`mt-1 font-bold leading-snug ${touch ? 'text-xs' : 'text-sm'}`}>{hud.objective}</p>
            </section>
          )}
        </div>

        {/* Farm */}
        <section aria-label={inForest ? 'Forest map' : 'Farm status'} className="sticker col-start-2 row-start-1 w-full p-2 sm:col-start-3 sm:w-[196px] sm:p-2.5">
          {inForest ? (
            <>
              <h2 className="font-display text-[13px] leading-tight text-[#34563b]">SLOPWOOD FOREST</h2>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-wide text-ink/65">Farm safe / something's watching</p>
            </>
          ) : (
          <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <h2 className="text-[11px] font-extrabold uppercase tracking-wider">Farm uneaten</h2>
            <span className="font-display text-lg leading-none tabular-nums">{Math.round(hud.farm)}%</span>
          </div>
          <Bar value={hud.farm} max={100} label="Farm uneaten" fill={hud.farm < 35 ? 'bg-barn' : 'bg-leaf'} className="mt-1.5 h-3.5" />
          <div className="mt-2">
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[10.5px] font-bold uppercase tracking-wide text-ink/75">{hud.courseName}</span>
              <span className="font-mono text-[10px] font-medium text-ink/60 tabular-nums">
                {hud.course + 1}/{hud.courseCount}
              </span>
            </div>
            <div className="mt-1 flex gap-1" aria-label={`Course ${hud.course + 1} of ${hud.courseCount}`}>
              {Array.from({ length: hud.courseCount }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full border-[1.5px] border-ink ${i < hud.course ? 'bg-leaf' : i === hud.course ? 'bg-mustard' : 'bg-transparent'}`} />
              ))}
            </div>
          </div>
          </>
          )}
          <canvas ref={minimapRef} width={360} height={360} className="mt-2 hidden aspect-square w-full rounded-lg border-[2.5px] border-ink md:block" aria-label={inForest ? 'Slopwood Forest minimap' : 'Farm minimap'} />
          {inForest ? (
            <ul className="mt-2 hidden flex-wrap gap-x-2.5 gap-y-1 text-[9.5px] font-bold uppercase tracking-wide text-ink/70 md:flex">
              <li className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#ffb04a]" />Herb</li>
              <li className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-mustard" />Truffles / home</li>
            </ul>
          ) : (
          <ul className="mt-1.5 hidden flex-wrap gap-x-2.5 gap-y-0.5 text-[9.5px] font-bold uppercase tracking-wide text-ink/70 md:flex">
            <li className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-barn" />
              Rickley
            </li>
            <li className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-lab" />
              Kingger
            </li>
            <li className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#f0758d]" />
              Trout
            </li>
            <li className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-mustard" />
              Bell
            </li>
            <li className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-plum" />
              Allen
            </li>
            <li className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full border border-mustard bg-[#344d36]" />
              Forest
            </li>
          </ul>
          )}
        </section>
      </div>

      {/* banner */}
      {hud.banner && (
        <div className="absolute inset-x-0 top-[26%] flex justify-center px-4">
          <div key={hud.banner.key} className="banner text-center">
            <p className="outlined font-display text-4xl leading-[1.05] text-paper drop-shadow-[5px_5px_0_var(--color-barn)] sm:text-6xl">{hud.banner.title}</p>
            <p className="mx-auto mt-3 inline-block rounded-full border-[3px] border-ink bg-mustard px-4 py-1 text-sm font-extrabold uppercase tracking-wide sm:text-base">{hud.banner.sub}</p>
          </div>
        </div>
      )}

      {/* controls reminder for the first intermission */}
      {firstBreak && !touch && !hud.allen && (
        <aside aria-label="Controls" className="sticker absolute bottom-4 left-4 hidden w-[250px] p-3 lg:block">
          <h2 className="font-display text-sm leading-none">HOW TO PIG</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 text-xs font-bold">
            <dt className="flex gap-0.5">
              {pad ? <Key>Left stick</Key> : <><Key>{bindLabel('forward')}</Key><Key>{bindLabel('left')}</Key><Key>{bindLabel('back')}</Key><Key>{bindLabel('right')}</Key></>}
            </dt>
            <dd>Trot around</dd>
            <dt>
              <Key>{pad ? 'Right stick' : 'Mouse'}</Key>
            </dt>
            <dd>{pad ? 'Look around' : 'Look (arrows work too)'}</dd>
            <dt>
              {pad ? <Key>{padActionLabel(pad, 'headbutt')}</Key> : <Keys action="attack" />}
            </dt>
            <dd>Headbutt combo ×3</dd>
            <dt>
              {pad ? <Key>{padActionLabel(pad, 'charge')}</Key> : <Keys action="charge" />}
            </dt>
            <dd>Hog Charge</dd>
            <dt>
              <Key>{pad ? padActionLabel(pad, 'roll') : bindLabel('roll')}</Key>
            </dt>
            <dd>Dodge roll (invincible)</dd>
            <dt>
              <Key>{pad ? padActionLabel(pad, 'jump') : 'Space'}</Key>
            </dt>
            <dd>Jump over shockwaves</dd>
            <dt>
              <Key>{interactKey}</Key>
            </dt>
            <dd>Talk · join hunt · ring bell</dd>
          </dl>
        </aside>
      )}

      {inForest && !touch && (
        <aside aria-label="Forest controls" className="sticker absolute bottom-4 left-4 hidden w-[235px] p-3 lg:block">
          <h2 className="font-display text-sm text-[#34563b]">HOG HUNT</h2>
          <p className="mt-1.5 text-xs font-bold leading-relaxed text-ink/75">Follow Herb's lantern to each truffle cache and dig it up. Stay close: something lurks in these woods.</p>
          <p className="mt-2 text-xs font-bold"><Key>{listenKey}</Key> Ask Herb which way to the next cache</p>
          <p className="mt-2 text-xs font-bold"><Key>{interactKey}</Key> Dig when Herb finds a cache · leave at the south trailhead</p>
          <p className="mt-2 text-[10px] font-medium text-ink/60">Need a shortcut? Return through the pause menu.</p>
        </aside>
      )}

      {!pad && !touch && !hud.locked && hud.screen === 'play' && (
        <p className="absolute bottom-4 right-4 hidden max-w-[240px] rounded-xl border-[2.5px] border-ink bg-paper/95 px-3 py-2 text-xs font-bold leading-snug sm:block">
          Click the game to steer the camera with your mouse. <Key>Esc</Key> pauses. Rebind keys in Settings.
        </p>
      )}

      {/* subtitle + prompt */}
      <div className={`absolute inset-x-0 flex flex-col items-center gap-2.5 px-4 ${touch ? 'portrait:bottom-[170px] landscape:bottom-1 landscape:px-[150px]' : 'bottom-5'}`}>
        {hud.subtitle && (
          <p key={hud.subtitle.text} className="hud-zoom hud-fade pop-in flex max-w-[640px] items-start gap-2.5 rounded-2xl border-[3px] border-ink bg-paper/95 px-3.5 py-2 shadow-[4px_4px_0_var(--color-ink)]" role="status">
            <span className={`mt-0.5 shrink-0 rounded-md border-2 border-ink px-2 py-0.5 font-display text-xs leading-tight ${SPEAKER[hud.subtitle.who] ?? 'bg-white'}`}>{hud.subtitle.who.toUpperCase()}</span>
            <span className="text-[15px] font-bold leading-snug">{hud.subtitle.text}</span>
          </p>
        )}
        {hud.prompt && hud.screen === 'play' && touch && (
          <button
            type="button"
            onTouchStart={() => {
              navigator.vibrate?.(8);
              onInteract?.();
            }}
            className="hud-zoom bob pointer-events-auto flex touch-none items-center gap-2 rounded-full border-[3px] border-ink bg-mustard px-4 py-2 text-sm font-extrabold shadow-[4px_4px_0_var(--color-ink)]"
          >
            <span className="rounded-md border-2 border-ink bg-white px-1.5 py-0.5 font-mono text-[10px] leading-none">TAP</span>
            {promptText}
          </button>
        )}
        {hud.prompt && hud.screen === 'play' && !touch && (
          <p className="bob flex items-center gap-2 rounded-full border-[3px] border-ink bg-mustard px-4 py-1.5 text-sm font-extrabold shadow-[4px_4px_0_var(--color-ink)]">
            <Key>{promptKey === 'E' ? interactKey : promptKey}</Key>
            {promptText}
          </p>
        )}
      </div>
    </div>
  );
}
