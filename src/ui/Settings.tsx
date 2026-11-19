import { useEffect, useState } from 'react';
import { BIND_ACTIONS, MAX_KEYS, assignKey, clearKey, getBinds, keyLabel, onBindsChange, resetBinds, setBinds, type BindAction } from '../game/keybinds';

const GFX_LABEL = { high: 'Cinematic', medium: 'Balanced', low: 'Fast' } as const;

/**
 * Settings: sound, graphics, keyboard rebinding, and (on touch screens) arranging the on-screen buttons.
 * Opened from the title screen and the pause menu.
 */
export function SettingsDialog({
  onClose,
  touch,
  onEditTouch,
  muted,
  onMute,
  gfx,
  onGraphics,
}: {
  onClose: () => void;
  touch: boolean;
  /** Close settings and drag the touch buttons around. */
  onEditTouch?: () => void;
  muted?: boolean;
  onMute?: () => void;
  gfx?: 'high' | 'medium' | 'low';
  onGraphics?: () => void;
}) {
  const [tab, setTab] = useState<'keys' | 'touch'>(touch ? 'touch' : 'keys');
  const [binds, setLocal] = useState(getBinds);
  const [listening, setListening] = useState<{ action: BindAction; index: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => onBindsChange(() => setLocal(getBinds())), []);

  // waiting for a key: grab the next key or mouse button before the game (or the page) sees it
  useEffect(() => {
    if (!listening) return;
    const finish = (code: string | null) => {
      setListening(null);
      if (code === null) return;
      const { binds: next, stolenFrom } = assignKey(getBinds(), listening.action, listening.index, code);
      setBinds(next);
      const label = (a: BindAction) => BIND_ACTIONS.find((b) => b.id === a)?.label ?? a;
      setNote(stolenFrom.length ? `${keyLabel(code)} was moved off ${stolenFrom.map(label).join(', ')}.` : null);
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') finish(null);
      else if (e.code === 'Backspace' || e.code === 'Delete') {
        setListening(null);
        setBinds(clearKey(getBinds(), listening.action, listening.index));
      } else finish(e.code);
    };
    const onMouse = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      finish(`Mouse${e.button}`);
    };
    const noMenu = (e: MouseEvent) => e.preventDefault();
    // wait a tick so the click that started listening doesn't bind itself
    const t = window.setTimeout(() => {
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('mousedown', onMouse, true);
      document.addEventListener('contextmenu', noMenu, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onMouse, true);
      document.removeEventListener('contextmenu', noMenu, true);
    };
  }, [listening]);

  // Esc closes the dialog (when not choosing a key)
  useEffect(() => {
    if (listening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [listening, onClose]);

  const groups = ['Move', 'Fight', 'Abilities', 'Other'] as const;
  return (
    <div className="absolute inset-0 z-40 flex justify-center overflow-y-auto bg-ink/65 p-4 backdrop-blur-[2px]" data-pad-menu>
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="sticker pop-in my-auto w-full max-w-[560px] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="settings-title" className="font-display text-3xl leading-none">
            SETTINGS
          </h2>
          <button type="button" onClick={onClose} autoFocus data-pad-default className="btn bg-mustard px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide">
            Done
          </button>
        </div>

        {(onMute || onGraphics) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {onMute && (
              <button type="button" onClick={onMute} aria-pressed={muted} className="btn bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-wide">
                Sound: {muted ? 'off' : 'on'}
              </button>
            )}
            {onGraphics && gfx && (
              <button type="button" onClick={onGraphics} className="btn bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-wide" title="Cinematic adds ambient occlusion, denser grass and sharper shadows. Fast is for slower computers.">
                Graphics: {GFX_LABEL[gfx]}
              </button>
            )}
          </div>
        )}

        <div role="tablist" aria-label="Controls" className="mt-4 flex gap-1 border-b-2 border-ink/15">
          {(['keys', 'touch'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`-mb-[2px] rounded-t-lg border-2 border-b-0 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide ${tab === t ? 'border-ink bg-white' : 'border-transparent text-ink/60'}`}
            >
              {t === 'keys' ? 'Keyboard & mouse' : 'Touch buttons'}
            </button>
          ))}
        </div>

        {tab === 'keys' ? (
          <div className="mt-3">
            <p className="text-xs font-bold text-ink/65">
              Click a key to change it, then press the new key or mouse button. <kbd className="font-mono">Esc</kbd> cancels, <kbd className="font-mono">Backspace</kbd> clears it. Each action can have two keys.
            </p>
            {note && (
              <p className="mt-2 rounded-lg bg-[#fff1d6] px-2 py-1 text-xs font-bold text-[#a1460f]" role="status">
                {note}
              </p>
            )}
            {groups.map((g) => (
              <section key={g} className="mt-3">
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/55">{g}</h3>
                <ul className="mt-1 grid gap-1">
                  {BIND_ACTIONS.filter((a) => a.group === g).map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-[13px] font-bold">{a.label}</span>
                      {Array.from({ length: MAX_KEYS }, (_, i) => {
                        const on = listening?.action === a.id && listening.index === i;
                        const code = binds[a.id][i];
                        return (
                          <button
                            key={i}
                            type="button"
                            aria-label={`${a.label}, key ${i + 1}: ${code ? keyLabel(code) : 'none'}. Press to change.`}
                            onClick={() => {
                              setNote(null);
                              setListening(on ? null : { action: a.id, index: Math.min(i, binds[a.id].length) });
                            }}
                            className={`w-24 rounded-lg border-2 px-2 py-1 font-mono text-xs font-bold ${on ? 'alert-blink border-ink bg-mustard' : code ? 'border-ink bg-white' : 'border-dashed border-ink/40 bg-transparent text-ink/45'}`}
                          >
                            {on ? 'Press a key…' : code ? keyLabel(code) : '+ add'}
                          </button>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <button
              type="button"
              onClick={() => {
                resetBinds();
                setNote('Back to the default keys.');
              }}
              className="btn mt-4 bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-wide"
            >
              Reset to defaults
            </button>
          </div>
        ) : (
          <div className="mt-3 text-sm font-bold">
            <p className="text-ink/70">Move the on-screen buttons wherever your thumbs like them, make them bigger or smaller, or put the stick on the right. The layout is saved on this device.</p>
            {onEditTouch ? (
              <button type="button" onClick={onEditTouch} className="btn mt-3 bg-pig px-4 py-2 text-sm font-extrabold uppercase tracking-wide">
                Arrange touch buttons
              </button>
            ) : (
              <p className="mt-3 text-xs text-ink/60">Open this from the pause menu during a game to arrange the buttons over the farm.</p>
            )}
            {!touch && <p className="mt-2 text-xs text-ink/55">(This device doesn't look like a touch screen, so the touch buttons aren't shown while you play.)</p>}
          </div>
        )}
      </div>
    </div>
  );
}
