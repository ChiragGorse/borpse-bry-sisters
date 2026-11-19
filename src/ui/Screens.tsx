import { useState, type ReactNode } from 'react';
import { serverAddress, type NetStatus } from '../game/net/NetClient';
import { ACTIVE_INFO, type ActiveId, type HudState } from '../game/data';
import { padActionLabel, padLabel, type PadLayout } from '../game/gamepad';
import { Key, Keys, Portrait } from './Hud';
import { bindLabel } from '../game/keybinds';
import { GAME_VERSION } from '../game/changelog';
import { changelogUnseen } from './Changelog';

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function ControlsList({ pad }: { pad?: PadLayout }) {
  const rows: [ReactNode, string][] = pad ? [
    [<Key>Left stick</Key>, 'Move'],
    [<><Key>Right stick</Key><Key>{padLabel(pad, 'rightStick')}</Key></>, 'Look / recenter'],
    [<Key>{padActionLabel(pad, 'headbutt')}</Key>, 'Headbutt / combo'],
    [<Key>{padActionLabel(pad, 'charge')}</Key>, 'Hog Charge'],
    [<Key>{padActionLabel(pad, 'roll')}</Key>, 'Dodge roll'],
    [<Key>{padActionLabel(pad, 'jump')}</Key>, 'Jump'],
    [<><Key>{padActionLabel(pad, 'zap')}</Key><Key>{padActionLabel(pad, 'squeal')}</Key><Key>{padActionLabel(pad, 'whip')}</Key></>, 'Ability slots 1-3'],
    [<Key>D-pad ← → ↓</Key>, 'Ability slots 4-6 (set them in the pause menu)'],
    [<Key>{padActionLabel(pad, 'interact')}</Key>, 'Talk, travel, or ring the bell'],
    [<Key>{padActionLabel(pad, 'listen')}</Key>, 'Hog Hunt: ask Herb where to dig'],
    [<Key>{padLabel(pad, 'start')}</Key>, 'Pause / resume'],
  ] : [
    [<><Key>{bindLabel('forward')}</Key><Key>{bindLabel('left')}</Key><Key>{bindLabel('back')}</Key><Key>{bindLabel('right')}</Key></>, 'Move'],
    [<Key>Mouse</Key>, 'Look around (arrow keys also work)'],
    [<Keys action="attack" />, 'Headbutt — chain three for a heavy finisher'],
    [<Keys action="charge" />, 'Hog Charge — big damage, cracks his stagger bar'],
    [<Keys action="roll" />, 'Dodge roll — roll through a hit for a Perfect Dodge'],
    [<Keys action="jump" />, 'Jump — hop shockwaves (or dive with Belly Flop)'],
    [<Key>{(['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6'] as const).map((a) => bindLabel(a)).join(' ')}</Key>, 'Six ability slots: abilities you buy drop into them (rearrange in the pause menu)'],
    [<Keys action="interact" />, 'Talk, shop, travel, dig, ring the bell'],
    [<Keys action="listen" />, 'Hog Hunt: ask Herb which way to the next truffles'],
    [<><Key>Esc</Key><Key>{bindLabel('mute')}</Key></>, 'Pause · mute'],
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
  /** Host: who plays Allen (a player id, or 0 for the AI). */
  onAllen: (pid: number) => void;
  /** The server this page knows about (e.g. baked into the build), shown in the Server box; may be empty. */
  defaultServer: string;
  status: NetStatus | null;
  onJoin: (room: string, name: string, serverUrl: string) => void;
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
  const [name, setName] = useState(() => readPref('borpse.name', ''));
  const [room, setRoom] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase().slice(0, 4) ?? '');
  const [copied, setCopied] = useState(false);
  // a server from an invite link wins over the one remembered from last time
  const [server, setServer] = useState(() =>
    new URLSearchParams(window.location.search).has('server') ? online.defaultServer : readPref('borpse.server', online.defaultServer) || online.defaultServer,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const securePage = window.location.protocol === 'https:';
  const inRoom = st && (st.state === 'lobby' || st.state === 'connecting');
  if (inRoom) {
    // invite links carry the server too, so friends land in the right place
    const params = new URLSearchParams({ room: st.room });
    if (server && !/^(https?:\/\/)?(localhost|127\.)/i.test(server.trim())) params.set('server', server.trim());
    const link = `${window.location.origin}${window.location.pathname}?${params}`;
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ink/70">Allen:</span>
              {st.host ? (
                [{ id: 0, name: 'AI' }, ...(st.allen ? [{ id: st.allen, name: st.allenName }] : []), ...humans.map((p) => ({ id: p.id, name: p.name }))].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={st.allen === o.id}
                    onClick={() => online.onAllen(o.id)}
                    className={`rounded-full border-2 border-ink px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${st.allen === o.id ? 'bg-[#ffd3b0]' : 'bg-white text-ink/70'}`}
                  >
                    {o.id === st.pid ? `${o.name} (you)` : o.name}
                  </button>
                ))
              ) : (
                <span className="text-xs font-extrabold uppercase">{st.allen ? (st.allen === st.pid ? 'You!' : st.allenName) : 'the AI'}</span>
              )}
            </div>
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
        if (!name.trim()) {
          setFormError('Pick a name first, so everyone knows which pig is you.');
          document.getElementById('online-name')?.focus();
          return;
        }
        const addr = serverAddress(server);
        if ('error' in addr) {
          setFormError(addr.error);
          return;
        }
        setFormError(null);
        writePref('borpse.name', name);
        writePref('borpse.server', server);
        online.onJoin(room, name, addr.url);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-mustard">Server</span>
        <input
          id="online-server"
          value={server}
          placeholder={securePage ? 'abc.trycloudflare.com' : '192.168.1.23:8080'}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => setServer(e.target.value)}
          className="w-56 max-w-full rounded-lg border-2 border-ink bg-paper px-2 py-1 font-mono text-sm font-bold text-ink"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-mustard">Your name *</span>
        <input
          id="online-name"
          value={name}
          maxLength={16}
          required
          placeholder="e.g. Kenji"
          aria-invalid={!!formError && !name.trim()}
          onChange={(e) => {
            setName(e.target.value);
            if (formError) setFormError(null);
          }}
          className={`w-36 rounded-lg border-2 bg-paper px-2 py-1 text-sm font-bold text-ink ${formError && !name.trim() ? 'border-barn' : 'border-ink'}`}
        />
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
      <button type="submit" disabled={!name.trim()} title={name.trim() ? undefined : 'Enter your name first'} className="btn bg-pig px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide text-ink disabled:opacity-60">
        {room.length === 4 ? 'Join room' : 'Host a room'}
      </button>
      {(formError || (st?.state === 'closed' && st.error)) && (
        <p className="w-full max-w-[34rem] text-xs font-bold text-[#ffb3a6]" role="alert">
          {formError ?? st!.error}
        </p>
      )}
      {securePage && !online.defaultServer && (
        <p className="w-full max-w-[34rem] text-xs font-medium leading-snug text-paper/75">
          Running the server on your own PC? You can use <code className="font-mono">localhost:8080</code> yourself. Friends need a secure address: run{' '}
          <code className="font-mono">cloudflared tunnel --url http://localhost:8080</code> and share the https address it prints.
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
  role = 'pig',
  onRole,
  online,
  onStart,
  onSettings,
  onChangelog,
}: {
  onSettings?: () => void;
  onChangelog?: () => void;
  role?: 'pig' | 'allen';
  onRole?: (r: 'pig' | 'allen') => void;
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
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.3em] text-mustard sm:text-sm">A farm-to-table horror story</p>
            {onChangelog && (
              <button
                type="button"
                onClick={onChangelog}
                className="flex items-center gap-1.5 rounded-full border-2 border-mustard px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide text-mustard hover:bg-mustard hover:text-ink"
              >
                {GAME_VERSION} · What&rsquo;s new
                {changelogUnseen() && <span className="rounded-full bg-barn px-1.5 text-[9px] text-paper">NEW</span>}
              </button>
            )}
          </div>
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
          {onSettings && (
            <button type="button" onClick={onSettings} className="btn bg-paper px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-ink">
              Settings
            </button>
          )}
          <div className="text-sm font-bold text-paper/80">
            <p>8 brutal courses · a finale boss · truffle hunts in a haunted forest</p>
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
            {!onRole && <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-mustard">Herd</span>}
            {onRole && (
              <>
                <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-mustard">Play as</span>
                {(['pig', 'allen'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={role === r}
                    onClick={() => onRole(r)}
                    className={`rounded-full border-2 border-ink px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${role === r ? 'bg-pig text-ink' : 'bg-paper/85 text-ink/70'}`}
                  >
                    {r === 'pig' ? 'Kenji' : 'Allen'}
                  </button>
                ))}
                <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-mustard">{role === 'allen' ? 'Pigs' : 'Herd'}</span>
              </>
            )}
            {HERD_SIZES.filter((h) => role === 'pig' || h.bots > 0).map((h) => (
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
            <span className="text-xs font-medium text-paper/75">{role === 'allen' ? 'Bot pigs fight you · eat the farm or flatten them all' : 'Bot pigs fight beside you'}</span>
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
  const charig = { who: 'CHARIG', portrait: portraits.charig, alt: 'Charig', bg: 'bg-[#c9e6d3]' };
  const scene = [
    {
      ...charig,
      title: 'BEFORE ANY OF THIS',
      text: 'Before the farm, before the dinner bell, before any of this mess, there was school. And at school, there was a war.',
    },
    {
      ...charig,
      title: 'THE AL VS GEN ED WAR',
      text: 'The AL kids (me, Kenji, Allen, Path Guppy and Rickley) against the Gen Eds: Kioff, Kingger and Trout. It was brutal. It was glorious. It was mostly in the hallway.',
    },
    {
      ...charig,
      title: 'WE WON. THEN WE FORGOT WHY.',
      text: 'We won. Then, honestly? None of us could remember what we were fighting about. So we did the only reasonable thing and started a farm.',
    },
    {
      ...charig,
      title: 'BACK IN THE LAB',
      text: 'Allen and I had good times. Roblox until 3 a.m., funny videos nobody else laughed at, chemistry back in the lab that was “only slightly” on fire.',
      memory: true,
    },
    {
      ...charig,
      title: 'GREED AND HUNGER',
      text: 'But somewhere along the way Allen got consumed by greed and hunger. He ate everything the farm grew, so we kicked him out. That is how all of this started.',
    },
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
  ][Math.min(step, 9)] as { who: string; title: string; text: string; portrait: string; alt: string; bg: string; memory?: boolean };

  return (
    <div className={`cutscene pointer-events-none absolute inset-0 z-50${scene.memory ? ' cutscene-memory' : ''}`} data-pad-menu>
      {scene.memory && <div className="cutscene-memory-tint" aria-hidden="true" />}
      <div className="cutscene-bar cutscene-bar-top">
        <p className="font-mono text-[10px] font-extrabold uppercase tracking-[0.24em] text-mustard">
          The Borpse Bry Sisters · prologue
        </p>
        <p className="font-mono text-[10px] font-bold text-paper/70">{step + 1} / {total}</p>
      </div>
      <div key={step} className="cutscene-caption flex items-start gap-3">
        <Portrait src={scene.portrait} alt={scene.alt} bg={scene.bg} className="cutscene-portrait mt-1 hidden h-14 w-14 sm:block" />
        <div className="min-w-0">
          <p className="cutscene-who font-mono text-[10px] font-extrabold uppercase tracking-[0.18em] text-mustard">{scene.who}</p>
          <h2 className="cutscene-title mt-1 font-display text-2xl leading-none text-paper sm:text-4xl">{scene.title}</h2>
          <p className="cutscene-text mt-2 max-w-[680px] text-sm font-bold leading-snug text-paper/90 sm:text-base">{scene.text}</p>
        </div>
        {/* how long until the next beat */}
        <span className="cutscene-progress" aria-hidden="true" />
      </div>
      <button type="button" onClick={onSkip} className="pointer-events-auto cutscene-skip btn absolute right-4 top-12 z-10 bg-paper px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide">
        Skip
      </button>
      <div className="cutscene-bar cutscene-bar-bottom" />
    </div>
  );
}

/* ───────────────────────── pause ───────────────────────── */

/** A menu action that ends the run: the first press asks, the second does it. */
export interface MenuAction {
  label: string;
  /** Shown on the button after the first press. */
  confirm?: string;
  onPress: () => void;
}

function ConfirmButton({ action, className }: { action: MenuAction; className: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (action.confirm && !asking) {
          setAsking(true);
          window.setTimeout(() => setAsking(false), 5000);
          return;
        }
        action.onPress();
      }}
      onBlur={() => setAsking(false)}
      className={`${className} ${asking ? 'bg-barn text-paper' : ''}`}
    >
      {asking ? action.confirm : action.label}
    </button>
  );
}

export function PauseScreen({
  muted,
  pad,
  disconnected,
  onResume,
  onMute,
  onSettings,
  actions,
  note,
  loadout,
  onReturnFarm,
}: {
  muted: boolean;
  pad?: PadLayout;
  disconnected?: boolean;
  onResume: () => void;
  onMute: () => void;
  onSettings: () => void;
  /** Restart / back to the menu / leave the room, as fits this game. */
  actions: MenuAction[];
  note?: string;
  /** Your ability slots and the abilities you own, to rearrange. */
  loadout?: { actives: HudState['actives']; owned: ActiveId[]; onAssign: (slot: number, id: ActiveId | null) => void };
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
          <p className="mt-1.5 text-sm font-bold text-ink/65">{onReturnFarm ? 'The forest can wait. Your truffles are safe.' : 'Allen is politely holding his fork mid-air.'}</p>
        )}
        <div className="mt-4 grid gap-2">
          <button type="button" onClick={onResume} autoFocus data-pad-default className="btn bg-mustard px-5 py-3 font-display text-xl leading-none">
            RESUME
          </button>
          {onReturnFarm && (
            <button type="button" onClick={onReturnFarm} className="btn bg-[#416744] px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-paper">
              Return to the farm with your truffles
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onSettings} className="btn bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide">
              Settings
            </button>
            <button type="button" onClick={onMute} aria-pressed={muted} className="btn bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide">
              Sound: {muted ? 'off' : 'on'}
            </button>
          </div>
          {actions.length > 0 && (
            <div className={`grid gap-2 ${actions.length > 1 ? 'grid-cols-2' : ''}`}>
              {actions.map((a) => (
                <ConfirmButton key={a.label} action={a} className="btn bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide" />
              ))}
            </div>
          )}
        </div>
        {note && <p className="mt-3 text-sm font-bold text-ink/70">{note}</p>}
        {loadout && loadout.owned.length > 0 && (
          <section aria-labelledby="loadout-title" className="mt-4 border-t-2 border-ink/15 pt-3">
            <h3 id="loadout-title" className="font-display text-base leading-none">ABILITY LOADOUT</h3>
            <p className="mt-1 text-xs font-bold text-ink/60">Six slots, six keys. Pick what each one fires; choosing an ability that's in another slot swaps them.</p>
            <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {loadout.actives.map((a) => (
                <li key={a.slot} className="flex items-center gap-2">
                  <Key>{a.key}</Key>
                  <label className="sr-only" htmlFor={`slot-${a.slot}`}>
                    Slot {a.slot + 1} ({a.key})
                  </label>
                  <select
                    id={`slot-${a.slot}`}
                    value={a.id ?? ''}
                    onChange={(e) => loadout.onAssign(a.slot, (e.target.value || null) as ActiveId | null)}
                    className="min-w-0 flex-1 rounded-lg border-2 border-ink bg-white px-2 py-1 text-sm font-bold text-ink"
                  >
                    <option value="">Empty</option>
                    {loadout.owned.map((id) => (
                      <option key={id} value={id}>
                        {ACTIVE_INFO[id].icon} {ACTIVE_INFO[id].name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        )}
        <details className="mt-4 rounded-xl border-[2.5px] border-ink bg-white p-3.5">
          <summary className="cursor-pointer font-display text-sm leading-none">CONTROLS</summary>
          <div className="mt-3">
            {pad && <p className="mb-3 border-b border-ink/15 pb-2 font-mono text-[10px] font-medium uppercase tracking-wide text-ink/65">D-pad / stick to select · {padLabel(pad, 'south')} to confirm</p>}
            <ControlsList pad={pad} />
          </div>
        </details>
        <details className="mt-3 rounded-xl border-[2.5px] border-ink bg-[#fff1d6] p-3">
          <summary className="cursor-pointer font-display text-sm leading-none text-[#c2501a]">TIPS</summary>
          <ul className="mt-2 space-y-1 text-[12px] font-bold leading-snug">
            <li>Sauce Shield / Wok Guard / Sizzle Spin: smash all sauce jars, flank his wok, and kite his spin.</li>
            <li>Kitchen Brigade: Grillbots bite, Sriracha Spitters leave burning chili puddles, Skewer Hounds lunge, Tenderizer Brutes armor-slam, and Kettle Bombers explode (knock them back with Tail-Whip!).</li>
            <li>Between courses, go on a Hog Hunt with Herb for truffles. Stay near his lantern.</li>
          </ul>
        </details>
        <p className="mt-3 text-center font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/45">{GAME_VERSION}</p>
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

export function GameOverScreen({ hud, portraits, onRetry, actions }: { hud: HudState; portraits: Record<string, string>; onRetry: () => void; actions: MenuAction[] }) {
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
              {hud.allen ? 'DINNER IS SERVED' : guppy ? 'GUPPY GOT YOU' : farm ? 'THE FARM GOT EATEN' : 'KENJI GOT PLATED'}
            </h2>
          </div>
        </div>
        <p className="mt-4 text-base font-medium leading-snug">
          {hud.allen
            ? farm
              ? 'You ate every crop, pie and hay bale on the farm. Compliments to the farmer. You win!'
              : 'Every last pig is flattened. You win! Go again on this course, or start the feast over.'
            : guppy
            ? 'Path Guppy knocked Kenji out. Head back to the farm to recover. Recruits and collected truffles are safe.'
            : farm
            ? 'Allen cleaned out every crop, pie and hay bale. Hit him while he is eating to interrupt the meal — and have Rickley replant between courses.'
            : 'Allen is tying on his bib. Roll through his swings for a Perfect Dodge, step out of the red circles, smash the sauce jars when he turns invincible, and get behind his wok when he guards.'}
        </p>
        <Stats hud={hud} />
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={onRetry} autoFocus data-pad-default className="btn flex-1 bg-mustard px-5 py-3 font-display text-xl leading-none">
            {hud.allen ? `PLAY COURSE ${hud.course + 1} AGAIN` : guppy ? 'RETURN TO THE FARM' : `RETRY COURSE ${hud.course + 1}`}
          </button>
          {actions.map((a) => (
            <ConfirmButton key={a.label} action={a} className="btn bg-white px-4 py-3 text-sm font-extrabold uppercase tracking-wide" />
          ))}
        </div>
        {!guppy && <p className="mt-3 text-xs font-bold text-ink/60">Retrying keeps every upgrade you bought before ringing the bell.</p>}
      </div>
    </div>
  );
}

export function VictoryScreen({ hud, portraits, onRestart, actions }: { hud: HudState; portraits: Record<string, string>; onRestart: () => void; actions: MenuAction[] }) {
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
          <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-leaf">{hud.allen ? 'Every course served' : 'Every course survived, Earwhen included'}</p>
          <h2 id="win-title" className="mt-1 font-display text-4xl leading-none sm:text-5xl">
            {hud.allen ? 'THE PIGS WON' : 'THE FARM IS SAVED'}
          </h2>
          <p className="mt-3 text-base font-medium leading-snug">
            {hud.allen && 'The herd drove you off the farm for good. Better luck at the next feast. '}
            Allen B. Hwang has sworn off pork belly and is, reportedly, very into tofu now. Rickley is planting soybeans just in case. Kingger wants his Grillbots back for “research”.
          </p>
          <Stats hud={hud} />
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={onRestart} autoFocus data-pad-default className="btn flex-1 bg-mustard px-5 py-3 font-display text-xl leading-none">
              PLAY AGAIN
            </button>
            {actions.map((a) => (
              <ConfirmButton key={a.label} action={a} className="btn bg-white px-4 py-3 text-sm font-extrabold uppercase tracking-wide" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
