import { useState, type ReactNode } from 'react';
import type { NetStatus } from '../game/net/NetClient';
import type { HudState } from '../game/data';
import { padActionLabel, padLabel, type PadLayout } from '../game/gamepad';
import { Key, Portrait } from './Hud';

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function ControlsList({ pad }: { pad?: PadLayout }) {
  const rows: [ReactNode, string][] = pad ? [
    [<Key>Left stick</Key>, 'Move'],
    [<><Key>Right stick</Key><Key>{padLabel(pad, 'rightStick')}</Key></>, 'Look / recenter'],
    [<Key>{padActionLabel(pad, 'headbutt')}</Key>, 'Headbutt / combo'],
    [<Key>{padActionLabel(pad, 'charge')}</Key>, 'Hog Charge'],
    [<Key>{padActionLabel(pad, 'roll')}</Key>, 'Dodge roll'],
    [<Key>{padActionLabel(pad, 'jump')}</Key>, 'Jump'],
    [<Key>{padActionLabel(pad, 'whip')}</Key>, 'Tail-Whip (Trout)'],
    [<Key>{padActionLabel(pad, 'zap')}</Key>, 'Lightning Zap (Kingger)'],
    [<Key>{padActionLabel(pad, 'squeal')}</Key>, 'Sonic Squeal (Kingger)'],
    [<Key>{padActionLabel(pad, 'interact')}</Key>, 'Talk, travel, or ring the bell'],
    [<Key>{padActionLabel(pad, 'listen')}</Key>, 'Listen for hogs in the forest'],
    [<Key>{padLabel(pad, 'start')}</Key>, 'Pause / resume'],
  ] : [
    [
      <>
        <Key>W</Key>
        <Key>A</Key>
        <Key>S</Key>
        <Key>D</Key>
      </>,
      'Move',
    ],
    [<Key>Mouse</Key>, 'Look around (arrow keys also work)'],
    [
      <>
        <Key>LMB</Key>
        <Key>J</Key>
      </>,
      'Headbutt — chain three for a heavy finisher',
    ],
    [
      <>
        <Key>RMB</Key>
        <Key>K</Key>
      </>,
      'Hog Charge — big damage, cracks his stagger bar',
    ],
    [<Key>Shift</Key>, 'Dodge roll — roll through a hit for a Perfect Dodge'],
    [<Key>Space</Key>, 'Jump — hop shockwaves (or dive with Belly Flop)'],
    [<Key>Q</Key>, 'Lightning Zap — chain-lightning strike (buy from Kingger)'],
    [<Key>C</Key>, 'Tail-Whip Counter (learn from Trout at the lake)'],
    [<Key>F</Key>, 'Sonic Squeal (buy it from Kingger)'],
    [<Key>E</Key>, 'Talk to Rickley / Kingger / Trout, enter forest, ring bell'],
    [<Key>R</Key>, 'In the forest: listen for nearby wild hogs'],
    [
      <>
        <Key>Esc</Key>
        <Key>M</Key>
      </>,
      'Pause · mute',
    ],
  ];
  return (
    <dl className={`grid grid-cols-[auto_1fr] items-center gap-x-2.5 text-ink ${pad ? 'gap-y-1.5 text-xs' : 'gap-y-2 text-[13px]'} font-bold leading-snug`}>
      {rows.map(([k, label], i) => (
        <div key={i} className="contents">
          <dt className="flex gap-1">{k}</dt>
          <dd>{label}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────────────────── title ───────────────────────── */

const HERD_SIZES = [
  { bots: 0, label: 'Solo' },
  { bots: 3, label: '+3 bots' },
  { bots: 7, label: '+7 bots' },
];

export interface OnlineProps {
  /** Whether this page can reach a game server at all. */
  available: boolean;
  status: NetStatus | null;
  onJoin: (room: string, name: string) => void;
  onLeave: () => void;
}

const ONLINE_BOTS = [0, 2, 4];

function readPref(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private window: fine, we just won't remember it */
  }
}

/** Host or join an online room, then wait in its lobby. */
function OnlinePanel({ online, onBots }: { online: OnlineProps; onBots?: (n: number) => void }) {
  const st = online.status;
  const [name, setName] = useState(() => readPref('borpse.name', 'Kenji'));
  const [room, setRoom] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase().slice(0, 4) ?? '');
  const [copied, setCopied] = useState(false);
  if (!online.available) {
    return <p className="rise-in text-xs font-medium text-paper/70 [animation-delay:170ms]">Online co-op needs the game server: open the game from a Borpse server to play with friends.</p>;
  }
  const inRoom = st && (st.state === 'lobby' || st.state === 'connecting');
  if (inRoom) {
    const link = `${window.location.origin}${window.location.pathname}?room=${st.room}`;
    const humans = st.players.filter((p) => !p.bot);
    return (
      <section aria-label="Online room" className="sticker rise-in flex max-w-[560px] flex-col gap-2 p-3 [animation-delay:170ms]">
        {st.state === 'connecting' ? (
          <p className="text-sm font-bold" role="status">Connecting to the game server…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-ink/70">Room</span>
              <span className="font-display text-2xl leading-none tracking-[0.12em]">{st.room}</span>
              <button
                type="button"
                className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
                onClick={() => {
                  navigator.clipboard?.writeText(link).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
              >
                {copied ? 'Link copied' : 'Copy invite link'}
              </button>
              <button type="button" onClick={online.onLeave} className="ml-auto text-xs font-extrabold uppercase tracking-wide text-barn underline">
                Leave
              </button>
            </div>
            <ul aria-label="Pigs in this room" className="flex flex-wrap gap-1.5">
              {st.players.map((p) => (
                <li key={p.id} className="flex items-center gap-1 rounded-full border-2 border-ink bg-white px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide">
                  <span className="h-2.5 w-2.5 rounded-full border border-ink" style={{ background: '#' + p.tint.toString(16).padStart(6, '0') }} aria-hidden="true" />
                  {p.name}
                  {p.id === st.pid && <span className="text-ink/50">(you)</span>}
                  {p.bot && <span className="text-ink/50">bot</span>}
                </li>
              ))}
            </ul>
            {st.host ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-ink/70">You're the host. Bot pigs:</span>
                {ONLINE_BOTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={st.bots === n}
                    onClick={() => onBots?.(n)}
                    className={`rounded-full border-2 border-ink px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${st.bots === n ? 'bg-pig' : 'bg-white text-ink/70'}`}
                  >
                    {n === 0 ? 'None' : `+${n}`}
                  </button>
                ))}
                <span className="text-xs font-bold text-ink/70">· press Defend the Farm when everyone's in</span>
              </div>
            ) : (
              <p className="text-xs font-bold text-ink/70" role="status">
                {humans.length} {humans.length === 1 ? 'pig' : 'pigs'} here · waiting for the host to start
              </p>
            )}
          </>
        )}
      </section>
    );
  }
  return (
    <form
      aria-label="Play online"
      className="rise-in flex max-w-[560px] flex-wrap items-end gap-2 [animation-delay:170ms]"
      onSubmit={(e) => {
        e.preventDefault();
        writePref('borpse.name', name);
        online.onJoin(room, name);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-mustard">Online name</span>
        <input id="online-name" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} className="w-36 rounded-lg border-2 border-ink bg-paper px-2 py-1 text-sm font-bold text-ink" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-mustard">Room code</span>
        <input
          id="online-room"
          value={room}
          maxLength={4}
          placeholder="new"
          onChange={(e) => setRoom(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          className="w-24 rounded-lg border-2 border-ink bg-paper px-2 py-1 font-mono text-sm font-bold uppercase tracking-[0.2em] text-ink"
        />
      </label>
      <button type="submit" className="btn bg-pig px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide text-ink">
        {room.length === 4 ? 'Join room' : 'Host a room'}
      </button>
      {st?.state === 'closed' && st.error && (
        <p className="w-full text-xs font-bold text-[#ffb3a6]" role="alert">
          {st.error}
        </p>
      )}
    </form>
  );
}

export function TitleScreen({
  portraits,
  pad,
  touch = false,
  bots = 0,
  onBots,
  online,
  onStart,
}: {
  portraits: Record<string, string>;
  pad?: PadLayout;
  touch?: boolean;
  bots?: number;
  onBots?: (n: number) => void;
  online?: OnlineProps;
  onStart: () => void;
}) {
  const inRoom = online?.status && (online.status.state === 'lobby' || online.status.state === 'connecting');
  const waiting = inRoom && !online!.status!.host;
  const cast: { id: string; name: string; line: string; bg: string }[] = [
    { id: 'kenji', name: 'Kenji', line: 'You. A pig with a grudge.', bg: 'bg-pig' },
    { id: 'rickley', name: 'Rickley', line: 'Farmer. Trades truffles for grit.', bg: 'bg-[#ffe9b8]' },
    { id: 'kingger', name: 'Kingger', line: 'Nerd. Builds questionable gadgets.', bg: 'bg-[#bfe9ee]' },
    { id: 'trout', name: 'Trout', line: 'A lake trout. Teaches sick combos.', bg: 'bg-[#b5edf5]' },
    { id: 'allen', name: 'Allen B. Hwang', line: 'Loves pork belly. That is you.', bg: 'bg-[#ffd3b0]' },
  ];
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto" data-pad-menu>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgb(27_18_13/0.92)_0%,rgb(27_18_13/0.72)_38%,rgb(27_18_13/0)_72%)]" />
      <main className="relative flex min-h-full flex-col justify-center gap-5 px-6 py-6 sm:px-12 lg:max-w-[760px] lg:px-16">
        <header className="rise-in">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.3em] text-mustard sm:text-sm">A farm-to-table horror story</p>
          <h1 className="outlined mt-4 -rotate-2 font-display text-[clamp(2.6rem,min(8.2vw,10.5vh),6rem)] leading-[0.92] text-paper drop-shadow-[6px_6px_0_var(--color-barn)]">
            <span className="block text-[0.45em] leading-none text-mustard">THE</span>
            BORPSE BRY
            <br />
            SISTERS
          </h1>
          <p className="mt-5 max-w-[30rem] text-lg font-medium leading-snug text-paper/90">
            Allen B. Hwang is at the gate, and he has a bib with your face on it. Headbutt him off the farm before he eats the crops, the pies, and you.
          </p>
        </header>

        <div className="rise-in flex flex-wrap items-center gap-4 [animation-delay:120ms]">
          <button
            type="button"
            onClick={onStart}
            autoFocus
            data-pad-default
            disabled={!!waiting || online?.status?.state === 'connecting'}
            className="btn bg-mustard px-7 py-3.5 font-display text-2xl leading-none text-ink disabled:opacity-60"
          >
            {waiting ? 'WAITING FOR HOST' : 'DEFEND THE FARM'}
          </button>
          <div className="text-sm font-bold text-paper/80">
            <p>8 brutal courses · 5 kitchen enemies · permadeath hog squad</p>
            {pad ? (
              <p className="mt-1 flex items-center gap-2 text-[#ffe6a0]" role="status"><Key>{padLabel(pad, 'south')}</Key> Start with controller</p>
            ) : touch ? (
              <p className="mt-1 text-xs font-medium text-paper/75">Left thumb moves · drag the right side to look · tap the buttons to fight</p>
            ) : (
              <p className="mt-1 text-xs font-medium text-paper/75">Keyboard + mouse, or press a button on your controller</p>
            )}
          </div>
        </div>

        {online && <OnlinePanel online={online} onBots={onBots} />}

        {onBots && !inRoom && (
          <fieldset className="rise-in flex flex-wrap items-center gap-2 [animation-delay:170ms]">
            <legend className="sr-only">Herd size</legend>
            <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-mustard">Herd</span>
            {HERD_SIZES.map((h) => (
              <button
                key={h.bots}
                type="button"
                aria-pressed={bots === h.bots}
                onClick={() => onBots(h.bots)}
                className={`rounded-full border-2 border-ink px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${bots === h.bots ? 'bg-pig text-ink' : 'bg-paper/85 text-ink/70'}`}
              >
                {h.label}
              </button>
            ))}
            <span className="text-xs font-medium text-paper/75">Bot pigs fight beside you · multiplayer test</span>
          </fieldset>
        )}

        <ul className="rise-in grid max-w-[740px] grid-cols-2 gap-2 [animation-delay:220ms] sm:grid-cols-5" aria-label="Cast">
          {cast.map((c) => (
            <li key={c.id} className="sticker flex flex-col items-center gap-1.5 p-2.5 text-center">
              <Portrait src={portraits[c.id]} alt={c.name} bg={c.bg} className="h-16 w-16" />
              <h2 className={`font-display text-sm leading-none ${c.id === 'allen' ? 'text-plum' : ''}`}>{c.name.toUpperCase()}</h2>
              <p className="text-[11.5px] font-bold leading-tight text-ink/70">{c.line}</p>
            </li>
          ))}
        </ul>
      </main>

      <aside aria-label="Controls" className="sticker rise-in absolute bottom-6 right-6 hidden w-[340px] p-4 [animation-delay:320ms] xl:block">
        <h2 className="mb-3 font-display text-base leading-none">{pad ? 'GAMEPAD CONTROLS' : 'HOW TO PIG'}</h2>
        <ControlsList pad={pad} />
      </aside>
    </div>
  );
}

export function OpeningCutscene({
  step,
  total,
  portraits,
  onSkip,
}: {
  step: number;
  total: number;
  portraits: Record<string, string>;
  onSkip: () => void;
}) {
  const scene = [
    {
      who: 'STORYTELLER',
      title: 'THE EMPTY PEN',
      text: 'Before the dinner bell, Rickley had a whole herd. Then Allen came through the gate with a bib, a bottomless appetite, and absolutely no manners.',
      portrait: portraits.allen,
      alt: 'Allen',
      bg: 'bg-[#ffd3b0]',
    },
    {
      who: 'ALLEN',
      title: 'NO PIG LEFT BEHIND',
      text: 'He ate every one of Rickley’s pigs. Every last one. The troughs were empty, the smokehouse was full, and Rickley’s farm was suddenly worth less than a bent spoon.',
      portrait: portraits.allen,
      alt: 'Allen',
      bg: 'bg-[#ffd3b0]',
    },
    {
      who: 'RICKLEY',
      title: 'BROKE, BUT NOT BEATEN',
      text: 'Rickley was broke and could not fight Allen alone. He counted his coins, looked at his last pig, Kenji, and made one desperate call.',
      portrait: portraits.rickley,
      alt: 'Rickley',
      bg: 'bg-[#ffe9b8]',
    },
    {
      who: 'KINGGER',
      title: 'A VERY QUESTIONABLE RECRUIT',
      text: 'Kingger answered from his lab. For one last handful of truffles, he brought Tesla tusks, rocket trotters, and a plan that was only 62% likely to explode.',
      portrait: portraits.kingger,
      alt: 'Kingger',
      bg: 'bg-[#bfe9ee]',
    },
    {
      who: 'RICKLEY',
      title: 'PROTECT THE LAST PIG',
      text: 'Now Rickley and Kingger have one job: keep Kenji alive. If Allen wants his final pork belly, he will have to get past the whole farm.',
      portrait: portraits.rickley,
      alt: 'Rickley',
      bg: 'bg-[#ffe9b8]',
    },
  ][Math.min(step, 4)];

  return (
    <div className="cutscene pointer-events-none absolute inset-0 z-50" data-pad-menu>
      <div className="cutscene-bar cutscene-bar-top">
        <p className="font-mono text-[10px] font-extrabold uppercase tracking-[0.24em] text-mustard">
          The Borpse Bry Sisters · prologue
        </p>
        <p className="font-mono text-[10px] font-bold text-paper/70">{step + 1} / {total}</p>
      </div>
      <div key={step} className="cutscene-caption pop-in">
        <p className="font-mono text-[10px] font-extrabold uppercase tracking-[0.18em] text-mustard">{scene.who}</p>
        <h2 className="mt-1 font-display text-2xl leading-none text-paper sm:text-4xl">{scene.title}</h2>
        <p className="mt-2 max-w-[680px] text-sm font-bold leading-snug text-paper/90 sm:text-base">{scene.text}</p>
      </div>
      <button type="button" onClick={onSkip} className="pointer-events-auto cutscene-skip btn absolute right-4 top-12 z-10 bg-paper px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide">
        Skip
      </button>
      <div className="cutscene-bar cutscene-bar-bottom" />
    </div>
  );
}

/* ───────────────────────── pause ───────────────────────── */

const GFX_LABEL = { high: 'Cinematic', medium: 'Balanced', low: 'Fast' } as const;

export function PauseScreen({
  muted,
  gfx,
  pad,
  disconnected,
  onResume,
  onMute,
  onGraphics,
  onRestart,
  onReturnFarm,
  restartLabel = 'Start over',
  note,
}: {
  restartLabel?: string;
  note?: string;
  muted: boolean;
  gfx: 'high' | 'medium' | 'low';
  pad?: PadLayout;
  disconnected?: boolean;
  onResume: () => void;
  onMute: () => void;
  onGraphics: () => void;
  onRestart: () => void;
  onReturnFarm?: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-[2px]" data-pad-menu>
      <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="sticker pop-in my-auto w-full max-w-[460px] p-5 sm:p-6">
        <h2 id="pause-title" className="font-display text-4xl leading-none">
          PAUSED
        </h2>
        {disconnected ? (
          <p className="mt-2 text-sm font-bold text-barn" role="status">Controller disconnected. Reconnect and press a button, or resume with the keyboard.</p>
        ) : (
          <p className="mt-1.5 text-sm font-bold text-ink/65">{onReturnFarm ? 'The forest can wait. Your recruits are staying with you.' : 'Allen is politely holding his fork mid-air.'}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={onResume} autoFocus data-pad-default className="btn flex-1 bg-mustard px-5 py-2.5 font-display text-xl leading-none">
            RESUME
          </button>
          <button type="button" onClick={onMute} aria-pressed={muted} className="btn bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide">
            Sound: {muted ? 'off' : 'on'}
          </button>
          <button type="button" onClick={onGraphics} className="btn bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide" title="Cinematic adds ambient occlusion, denser grass and sharper shadows. Fast is for slower computers.">
            Graphics: {GFX_LABEL[gfx]}
          </button>
          <button type="button" onClick={onRestart} className="btn bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide">
            {restartLabel}
          </button>
        </div>
        {note && <p className="mt-3 text-sm font-bold text-ink/70">{note}</p>}
        {onReturnFarm && (
          <button type="button" onClick={onReturnFarm} className="btn mt-3 w-full bg-[#416744] px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-paper">Return to the farm with your recruits</button>
        )}
        <div className="mt-4 rounded-xl border-[2.5px] border-ink bg-white p-3.5">
          {pad && <p className="mb-3 border-b border-ink/15 pb-2 font-mono text-[10px] font-medium uppercase tracking-wide text-ink/65">D-pad / stick to select · {padLabel(pad, 'south')} to confirm</p>}
          <ControlsList pad={pad} />
        </div>
        <div className="mt-3 rounded-xl border-[2.5px] border-ink bg-[#fff1d6] p-3">
          <h3 className="font-display text-sm leading-none text-[#c2501a]">ALLEN &amp; HIS KITCHEN BRIGADE</h3>
          <ul className="mt-2 space-y-1 text-[12px] font-bold leading-snug">
            <li>Sauce Shield / Wok Guard / Sizzle Spin — smash all sauce jars, flank his wok, and kite his spin.</li>
            <li>Kitchen Brigade — Grillbots bite, Sriracha Spitters leave burning chili puddles, Skewer Hounds lunge, Tenderizer Brutes armor-slam, and Kettle Bombers explode (knock them back with Tail-Whip!).</li>
            <li>Six named hogs roam Slopwood Forest. Recruit them between courses. Fallen hogs do not return.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── end screens ───────────────────────── */

function Stats({ hud }: { hud: HudState }) {
  const items: [string, string][] = [
    ['Combat time', fmtTime(hud.stats.time)],
    ['Damage dealt', String(hud.stats.dealt)],
    ["Foes KO'd", String(hud.stats.ko)],
    ['Hogs fallen', String(hud.stats.fallen)],
    ['Truffles', String(hud.stats.earned)],
    ['Farm left', `${Math.round(hud.farm)}%`],
  ];
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-xl border-[2.5px] border-ink bg-white px-2.5 py-2 text-center">
          <dd className="font-display text-xl leading-none tabular-nums">{v}</dd>
          <dt className="mt-1 text-[10px] font-extrabold uppercase leading-tight tracking-wide text-ink/60">{k}</dt>
        </div>
      ))}
    </dl>
  );
}

export function GameOverScreen({ hud, portraits, onRetry, onRestart }: { hud: HudState; portraits: Record<string, string>; onRetry: () => void; onRestart: () => void }) {
  const farm = hud.overReason === 'farm';
  const guppy = hud.overReason === 'guppy';
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[rgb(60_14_10/0.72)] p-4 backdrop-blur-[2px]" data-pad-menu>
      <div role="dialog" aria-modal="true" aria-labelledby="over-title" className="sticker pop-in my-auto w-full max-w-[640px] p-5 sm:p-7">
        <div className="flex items-center gap-4">
          {!guppy && <Portrait src={portraits.allen} alt="Allen B. Hwang, pleased" bg="bg-[#cdb4e0]" className="h-20 w-20" />}
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-barn">
              {guppy ? 'Slopwood Forest / Trail Encounter' : `Course ${hud.course + 1} / ${hud.courseName}`}
            </p>
            <h2 id="over-title" className="mt-1 font-display text-3xl leading-none sm:text-5xl">
              {guppy ? 'GUPPY GOT YOU' : farm ? 'THE FARM GOT EATEN' : 'KENJI GOT PLATED'}
            </h2>
          </div>
        </div>
        <p className="mt-4 text-base font-medium leading-snug">
          {guppy
            ? 'Path Guppy knocked Kenji out. Head back to the farm to recover. Recruits and collected truffles are safe.'
            : farm
            ? 'Allen cleaned out every crop, pie and hay bale. Hit him while he is eating to interrupt the meal — and have Rickley replant between courses.'
            : 'Allen is tying on his bib. Roll through his swings for a Perfect Dodge, step out of the red circles, smash the sauce jars when he turns invincible, and get behind his wok when he guards.'}
        </p>
        <Stats hud={hud} />
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={onRetry} autoFocus data-pad-default className="btn flex-1 bg-mustard px-5 py-3 font-display text-xl leading-none">
            {guppy ? 'RETURN TO THE FARM' : `RETRY COURSE ${hud.course + 1}`}
          </button>
          <button type="button" onClick={onRestart} className="btn bg-white px-4 py-3 text-sm font-extrabold uppercase tracking-wide">
            Start over
          </button>
        </div>
        {!guppy && <p className="mt-3 text-xs font-bold text-ink/60">Retrying keeps every upgrade you bought before ringing the bell.</p>}
      </div>
    </div>
  );
}

export function VictoryScreen({ hud, portraits, onRestart }: { hud: HudState; portraits: Record<string, string>; onRestart: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/45 p-4" data-pad-menu>
      <div role="dialog" aria-modal="true" aria-labelledby="win-title" className="pop-in my-auto w-full max-w-[680px] overflow-hidden rounded-[20px] border-[3px] border-ink bg-paper shadow-[8px_8px_0_var(--color-ink)]">
        <div className="gingham flex items-center justify-center gap-3 border-b-[3px] border-ink px-5 py-4">
          <Portrait src={portraits.rickley} alt="Rickley" bg="bg-[#ffe9b8]" className="h-16 w-16" />
          <Portrait src={portraits.kenji} alt="Kenji, victorious" className="h-24 w-24" />
          <Portrait src={portraits.kingger} alt="Kingger" bg="bg-[#bfe9ee]" className="h-16 w-16" />
          <Portrait src={portraits.trout} alt="Trout" bg="bg-[#b5edf5]" className="h-16 w-16" />
        </div>
        <div className="p-5 sm:p-7">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-leaf">All eight courses survived</p>
          <h2 id="win-title" className="mt-1 font-display text-4xl leading-none sm:text-5xl">
            THE FARM IS SAVED
          </h2>
          <p className="mt-3 text-base font-medium leading-snug">
            Allen B. Hwang has sworn off pork belly and is, reportedly, very into tofu now. Rickley is planting soybeans just in case. Kingger wants his Grillbots back for “research”.
          </p>
          <Stats hud={hud} />
          <button type="button" onClick={onRestart} autoFocus data-pad-default className="btn mt-5 w-full bg-mustard px-5 py-3 font-display text-xl leading-none">
            PLAY AGAIN
          </button>
        </div>
      </div>
    </div>
  );
}
