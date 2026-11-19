import { useEffect } from 'react';
import { CHANGELOG, GAME_VERSION } from '../game/changelog';

const SEEN = 'borpse.seenVersion';

/** Whether this browser hasn't opened the changelog since the current version came out. */
export function changelogUnseen(): boolean {
  try {
    return window.localStorage.getItem(SEEN) !== GAME_VERSION;
  } catch {
    return false;
  }
}

/** "What's new": every version of the game, newest first. */
export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(SEEN, GAME_VERSION);
    } catch {
      /* fine */
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-40 flex justify-center overflow-y-auto bg-ink/65 p-4 backdrop-blur-[2px]" data-pad-menu>
      <div role="dialog" aria-modal="true" aria-labelledby="changelog-title" className="sticker pop-in my-auto w-full max-w-[600px] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-barn">The Borpse Bry Sisters · {GAME_VERSION}</p>
            <h2 id="changelog-title" className="mt-1 font-display text-3xl leading-none">
              WHAT&rsquo;S NEW
            </h2>
          </div>
          <button type="button" onClick={onClose} autoFocus data-pad-default className="btn bg-mustard px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide">
            Close
          </button>
        </div>
        <ol className="mt-4 grid gap-3">
          {CHANGELOG.map((v, i) => (
            <li key={v.version} className={`rounded-xl border-[2.5px] border-ink p-3.5 ${i === 0 ? 'bg-[#fff1d6]' : 'bg-white'}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="rounded-md border-2 border-ink bg-pig px-1.5 py-px font-mono text-[11px] font-bold">{v.version}</span>
                <h3 className="font-display text-base leading-tight">{v.title.toUpperCase()}</h3>
                {i === 0 && <span className="rounded-full bg-barn px-2 py-px text-[10px] font-extrabold uppercase tracking-wide text-paper">Latest</span>}
                <span className="ml-auto font-mono text-[10px] font-medium text-ink/55">{v.date}</span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] font-bold leading-snug text-ink/85">
                {v.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
