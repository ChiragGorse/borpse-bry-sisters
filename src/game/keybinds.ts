/**
 * Remappable keyboard and mouse controls.
 *
 * The game logic listens for one built-in "canonical" key per action (W A S D, J, K, Shift, Space, E,
 * R, Q F C V X G…), which is also what the gamepad and touch buttons press. The keyboard layer simply
 * translates whatever physical keys the player bound into those canonical keys, so rebinding needs no
 * changes anywhere else.
 */

export type BindAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'attack'
  | 'charge'
  | 'roll'
  | 'jump'
  | 'interact'
  | 'listen'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'pause'
  | 'mute';

export const BIND_ACTIONS: { id: BindAction; label: string; group: 'Move' | 'Fight' | 'Abilities' | 'Other' }[] = [
  { id: 'forward', label: 'Move forward', group: 'Move' },
  { id: 'back', label: 'Move back', group: 'Move' },
  { id: 'left', label: 'Move left', group: 'Move' },
  { id: 'right', label: 'Move right', group: 'Move' },
  { id: 'attack', label: 'Headbutt (Allen: swipe)', group: 'Fight' },
  { id: 'charge', label: 'Hog Charge (Allen: dash)', group: 'Fight' },
  { id: 'roll', label: 'Dodge roll (Allen: wok guard)', group: 'Fight' },
  { id: 'jump', label: 'Jump (Allen: body slam)', group: 'Fight' },
  { id: 'slot1', label: 'Ability slot 1', group: 'Abilities' },
  { id: 'slot2', label: 'Ability slot 2', group: 'Abilities' },
  { id: 'slot3', label: 'Ability slot 3', group: 'Abilities' },
  { id: 'slot4', label: 'Ability slot 4', group: 'Abilities' },
  { id: 'slot5', label: 'Ability slot 5', group: 'Abilities' },
  { id: 'slot6', label: 'Ability slot 6', group: 'Abilities' },
  { id: 'interact', label: 'Talk / use / dig', group: 'Other' },
  { id: 'listen', label: 'Ask Herb (Allen: sizzle spin)', group: 'Other' },
  { id: 'pause', label: 'Pause (Esc always works)', group: 'Other' },
  { id: 'mute', label: 'Mute', group: 'Other' },
];

/** The key the game logic itself listens for, per action. */
export const CANON: Record<BindAction, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  attack: 'KeyJ',
  charge: 'KeyK',
  roll: 'ShiftLeft',
  jump: 'Space',
  interact: 'KeyE',
  listen: 'KeyR',
  slot1: 'KeyQ',
  slot2: 'KeyF',
  slot3: 'KeyC',
  slot4: 'KeyV',
  slot5: 'KeyX',
  slot6: 'KeyG',
  pause: 'KeyP',
  mute: 'KeyM',
};
const CANON_CODES = new Set(Object.values(CANON));

export type Binds = Record<BindAction, string[]>;
/** Up to two keys per action. */
export const MAX_KEYS = 2;

export const DEFAULT_BINDS: Binds = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  attack: ['Mouse0', 'KeyJ'],
  charge: ['Mouse2', 'KeyK'],
  roll: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  interact: ['KeyE'],
  listen: ['KeyR'],
  slot1: ['KeyQ', 'Digit1'],
  slot2: ['KeyF', 'Digit2'],
  slot3: ['KeyC', 'Digit3'],
  slot4: ['KeyV', 'Digit4'],
  slot5: ['KeyX', 'Digit5'],
  slot6: ['KeyG', 'Digit6'],
  pause: ['KeyP'],
  mute: ['KeyM'],
};

const STORE = 'borpse.keybinds';
const clone = (b: Binds): Binds => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]])) as Binds;

function load(): Binds {
  const out = clone(DEFAULT_BINDS);
  try {
    const raw = window.localStorage.getItem(STORE);
    if (!raw) return out;
    const saved = JSON.parse(raw) as Partial<Record<string, unknown>>;
    for (const a of BIND_ACTIONS) {
      const v = saved[a.id];
      if (Array.isArray(v)) out[a.id] = v.filter((c): c is string => typeof c === 'string').slice(0, MAX_KEYS);
    }
  } catch {
    /* no storage (private window, preview): defaults */
  }
  return out;
}

let current: Binds = typeof window === 'undefined' ? clone(DEFAULT_BINDS) : load();
const listeners = new Set<() => void>();

export function getBinds(): Binds {
  return current;
}

export function setBinds(b: Binds) {
  current = clone(b);
  try {
    window.localStorage.setItem(STORE, JSON.stringify(current));
  } catch {
    /* fine: they last until the page closes */
  }
  for (const f of listeners) f();
}

export function resetBinds() {
  setBinds(DEFAULT_BINDS);
}

export function onBindsChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * Binds `code` to `action` in key slot `index` (0 or 1). The key is taken off any other action first.
 * Returns the actions it was taken from.
 */
export function assignKey(b: Binds, action: BindAction, index: number, code: string): { binds: Binds; stolenFrom: BindAction[] } {
  const next = clone(b);
  const stolenFrom: BindAction[] = [];
  for (const a of BIND_ACTIONS) {
    if (a.id === action) continue;
    if (next[a.id].includes(code)) {
      next[a.id] = next[a.id].filter((c) => c !== code);
      stolenFrom.push(a.id);
    }
  }
  const keys = next[action].filter((c) => c !== code);
  keys.splice(Math.min(index, keys.length), index < keys.length ? 1 : 0, code);
  next[action] = keys.slice(0, MAX_KEYS);
  return { binds: next, stolenFrom };
}

export function clearKey(b: Binds, action: BindAction, index: number): Binds {
  const next = clone(b);
  next[action] = next[action].filter((_, i) => i !== index);
  return next;
}

/** The canonical keys a physical key (or 'Mouse0'-style button) presses under the current bindings. */
export function translate(code: string): string[] {
  const out: string[] = [];
  for (const a of BIND_ACTIONS) if (current[a.id].includes(code)) out.push(CANON[a.id]);
  // keys that aren't any action's canonical key (arrows, Enter…) still do their own thing
  if (!CANON_CODES.has(code) && !out.length) out.push(code);
  return out;
}

const NAMES: Record<string, string> = {
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Mouse3: 'Mouse 4',
  Mouse4: 'Mouse 5',
  ShiftLeft: 'Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'Alt',
  AltRight: 'R-Alt',
  MetaLeft: 'Cmd',
  MetaRight: 'R-Cmd',
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Bksp',
  CapsLock: 'Caps',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** A short, readable name for a key code ('KeyW' → 'W', 'Mouse0' → 'LMB'). */
export function keyLabel(code: string | undefined): string {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
}

/** The label of an action's first key. */
export function bindLabel(action: BindAction): string {
  return keyLabel(current[action][0]);
}

/** The action whose canonical key is `canon`, if any. */
export function actionOf(canon: string): BindAction | undefined {
  return BIND_ACTIONS.find((a) => CANON[a.id] === canon)?.id;
}
