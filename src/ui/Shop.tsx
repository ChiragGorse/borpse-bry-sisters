import { ACTIVE_IDS, UPGRADES, costOf, maxLevel, type ActiveId, type HudState, type NpcId, type UpgradeId } from '../game/data';
import { padActionLabel, padLabel, type PadLayout } from '../game/gamepad';
import { Key, Portrait, TruffleIcon } from './Hud';

interface ShopProps {
  hud: HudState;
  portraits: Record<string, string>;
  onBuy: (id: UpgradeId) => void;
  onClose: () => void;
}

const SHOP_META: Record<
  NpcId,
  {
    alt: string;
    title: string;
    subtitle: string;
    quote: string;
    aside: string;
    portraitBg: string;
    titleCls: string;
    headerHint: string;
    footNote?: string;
    backLabel: string;
  }
> = {
  rickley: {
    alt: 'Rickley',
    title: "RICKLEY'S",
    subtitle: 'Farm-fresh grit',
    quote: "“Truffles for toughness, Kenji. Ain't no charity, but it's close.”",
    aside: 'gingham',
    portraitBg: 'bg-[#ffe9b8]',
    titleCls: 'text-barn',
    headerHint: 'Press a number or click to buy',
    backLabel: 'Back to the farm',
  },
  kingger: {
    alt: 'Kingger',
    title: 'KINGGER LABS',
    subtitle: '// gadgets, mostly safe',
    quote: '“I ran the numbers. You need all of these. Statistically.”',
    aside: 'blueprint',
    portraitBg: 'bg-[#16304f]',
    titleCls: 'text-neon',
    headerHint: 'Press a number or click to buy',
    backLabel: 'Back to the farm',
  },
  trout: {
    alt: 'Trout the trout',
    title: "TROUT'S DOJO",
    subtitle: 'Way of the Wet Fin',
    quote: '“Name’s Trout. Float like a lily pad, slap like a six-pound rainbow. Learn the combos, kid.”',
    aside: 'dojo-waves',
    portraitBg: 'bg-[#b5edf5]',
    titleCls: 'text-[#1b6b80]',
    headerHint: 'Press 1–5 or click to learn a move',
    footNote: 'Test new moves & combos on the orange-shirt dummy beside the lake!',
    backLabel: 'Back to the dock',
  },
  kioff: {
    alt: 'Kioff',
    title: "KIOFF'S RENDER FARM",
    subtitle: '// portals, decoys, corn',
    quote: '“Gen Ed, sure. But who do you think rendered the Backrooms? Pick something and don’t touch the chickens.”',
    aside: 'blueprint',
    portraitBg: 'bg-[#cbb8f0]',
    titleCls: 'text-[#5a3f86]',
    headerHint: 'Press a number or click to buy',
    footNote: 'New abilities go into a free loadout slot. Swap them from the pause menu.',
    backLabel: 'Back to the coop',
  },
  charig: {
    alt: 'Charig',
    title: "CHARIG'S STASH",
    subtitle: 'Heals, speedruns & one cursed phone',
    quote: '“I knew Allen before he was… like this. Trust me: nothing tilts him like losing at Smash Battles.”',
    aside: 'gingham',
    portraitBg: 'bg-[#bfe6cf]',
    titleCls: 'text-[#1f6b47]',
    headerHint: 'Press a number or click to buy',
    footNote: 'New abilities go into a free loadout slot. Swap them from the pause menu.',
    backLabel: 'Back to the porch',
  },
};

/** Where an active ability lives in your loadout: its slot key, or a nudge to equip it. */
function slotLabel(hud: HudState, id: UpgradeId): string | undefined {
  if (!(ACTIVE_IDS as readonly string[]).includes(id) || hud.levels[id] <= 0) return undefined;
  const slot = hud.actives.find((a) => a.id === (id as ActiveId));
  return slot ? `Slot ${slot.key}` : 'Not equipped: pause menu';
}

function techniqueInput(id: UpgradeId, layout: PadLayout) {
  const label = (action: Parameters<typeof padActionLabel>[1]) => padActionLabel(layout, action);
  switch (id) {
    case 'uppercut': return `${label('roll')}, then ${label('headbutt')}`;
    case 'bellyflop': return `${label('jump')}, then ${label('headbutt')}`;
    case 'cyclone': return `${label('headbutt')} x4`;
    case 'riverrush': return `2+ hits, then ${label('charge')}`;
    default: return undefined;
  }
}

export function Shop({ hud, portraits, onBuy, onClose }: ShopProps) {
  const npc = hud.shopNpc ?? 'rickley';
  const lab = npc === 'kingger';
  const dojo = npc === 'trout';
  const meta = SHOP_META[npc];
  const list = UPGRADES.filter((u) => u.npc === npc);
  const pad = hud.gamepad?.active ? hud.gamepad.layout : undefined;

  return (
    <div className="absolute inset-0 z-30 flex justify-center overflow-y-auto bg-ink/55 p-3 backdrop-blur-[2px] sm:p-6" data-pad-menu>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-title"
        className={`pop-in my-auto grid w-full max-w-[920px] overflow-hidden rounded-[20px] border-[3px] border-ink shadow-[8px_8px_0_var(--color-ink)] md:grid-cols-[255px_1fr] ${
          lab ? 'bg-night text-paper' : dojo ? 'bg-[#f4fbfa] text-ink' : 'bg-paper text-ink'
        }`}
      >
        {/* shopkeeper / sensei */}
        <aside className={`flex flex-row items-center gap-4 border-b-[3px] border-ink p-4 md:flex-col md:items-start md:border-b-0 md:border-r-[3px] md:p-5 ${meta.aside}`}>
          <Portrait src={portraits[npc]} alt={meta.alt} bg={meta.portraitBg} className="h-20 w-20 md:h-36 md:w-36" />
          <div className={`rounded-xl border-[3px] border-ink p-3 ${lab ? 'bg-night' : 'bg-paper'}`}>
            <h2 id="shop-title" className={`font-display text-2xl leading-none ${meta.titleCls}`}>
              {meta.title}
            </h2>
            <p className={`mt-1 font-mono text-[11px] font-medium uppercase tracking-[0.16em] ${lab ? 'text-neon/70' : dojo ? 'text-[#c94f68]' : 'text-ink/60'}`}>
              {meta.subtitle}
            </p>
            <p className="mt-2.5 text-sm font-medium leading-snug">{meta.quote}</p>
          </div>
        </aside>

        {/* stock / techniques */}
        <div className="flex min-w-0 flex-col p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className={`text-xs font-extrabold uppercase tracking-wider ${lab ? 'text-paper/60' : 'text-ink/60'}`}>
              {pad ? `D-pad or left stick to select / ${padLabel(pad, 'south')} to ${dojo ? 'learn' : 'buy'}` : meta.headerHint}
            </p>
            <p className={`flex items-center gap-1.5 rounded-full border-[2.5px] px-3 py-1 ${lab ? 'border-neon/60 bg-night' : 'border-ink bg-white'}`} aria-label={`You have ${hud.truffles} truffles`}>
              <TruffleIcon className="h-5 w-5" />
              <span className="font-display text-lg leading-none tabular-nums">{hud.truffles}</span>
            </p>
          </div>

          <ul className={`mt-3 flex flex-col ${list.length > 5 ? 'gap-1.5' : 'gap-2'}`}>
            {list.map((u, i) => {
              const lvl = hud.levels[u.id];
              const max = maxLevel(u);
              const maxed = lvl >= max;
              const cost = costOf(u, lvl, hud.repairCount);
              const farmFull = u.id === 'repair' && hud.farm >= 99.5 && hud.allies === 0;
              const afford = hud.truffles >= cost;
              const disabled = maxed || !afford || farmFull;
              const input = slotLabel(hud, u.id) ?? (pad ? techniqueInput(u.id, pad) ?? u.input : u.input);
              const desc = maxed
                ? dojo
                  ? 'Technique mastered!'
                  : 'Fully upgraded.'
                : farmFull
                  ? 'Nothing to replant — the farm is untouched.'
                  : u.levels[Math.min(lvl, u.levels.length - 1)];
              return (
                <li
                  key={u.id}
                  className={`flex items-center gap-3 rounded-xl border-[2.5px] ${list.length > 5 ? 'px-2.5 py-2' : 'p-2.5'} ${
                    lab ? 'border-neon/35 bg-[#13243b]' : 'border-ink bg-white'
                  }`}
                >
                  {!pad && <Key dark={lab}>{i + 1}</Key>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="text-[15px] font-extrabold leading-tight">{u.name}</h3>
                      {input && (
                        <span
                          className={`rounded-md border-2 px-1.5 py-0.5 font-mono text-[10.5px] font-medium leading-none ${
                            lab ? 'border-neon/70 bg-night text-neon' : 'border-ink bg-[#d7f3f7] text-[#123d4c]'
                          }`}
                        >
                          {input}
                        </span>
                      )}
                      {!u.repeatable && (
                        <span className="flex gap-1" aria-label={`Level ${lvl} of ${max}`}>
                          {Array.from({ length: max }, (_, n) => (
                            <span
                              key={n}
                              className={`h-2.5 w-4 rounded-sm border-2 ${lab ? 'border-neon/70' : 'border-ink'} ${
                                n < lvl ? (lab ? 'bg-neon' : dojo ? 'bg-[#f0758d]' : 'bg-leaf') : 'bg-transparent'
                              }`}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-[13px] font-medium leading-snug ${lab ? 'text-paper/75' : 'text-ink/70'}`}>{desc}</p>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onBuy(u.id)}
                    className={`btn shrink-0 px-3 py-1.5 font-display text-base leading-none ${
                      lab ? 'bg-neon text-night' : dojo ? 'bg-[#5ad2e2] text-ink' : 'bg-mustard text-ink'
                    }`}
                    aria-label={maxed ? `${u.name} is maxed` : `${dojo ? 'Learn' : 'Buy'} ${u.name} for ${cost} truffles`}
                  >
                    {maxed ? (
                      'MAX'
                    ) : (
                      <>
                        <TruffleIcon className="h-5 w-5" />
                        <span className="tabular-nums">{cost}</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {meta.footNote ? <p className="text-xs font-bold text-[#1b6b80]">{meta.footNote}</p> : <span />}
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className={`btn px-4 py-2 text-sm font-extrabold uppercase tracking-wide ${
                lab ? 'bg-paper text-ink' : dojo ? 'bg-[#184b59] text-paper' : 'bg-barn text-paper'
              }`}
            >
              <Key>{pad ? padLabel(pad, 'east') : 'E'}</Key> {meta.backLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
