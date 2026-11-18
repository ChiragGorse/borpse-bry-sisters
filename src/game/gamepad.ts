export type PadLayout = 'xbox' | 'playstation' | 'nintendo';
type Direction = 'up' | 'down' | 'left' | 'right';
export type PadMenuCommand = Direction | 'confirm' | { scroll: number };

// The indices are physical positions from the Gamepad API's standard mapping.
const BUTTON_INDEX = {
  south: 0, east: 1, west: 2, north: 3,
  leftBumper: 4, rightBumper: 5, leftTrigger: 6, rightTrigger: 7,
  start: 9, rightStick: 11,
  up: 12, down: 13, left: 14, right: 15,
} as const;
type PadButton = keyof typeof BUTTON_INDEX;

export const PAD_ACTIONS = {
  headbutt: { button: 'west', key: 'KeyJ' },
  charge: { button: 'rightTrigger', key: 'KeyK' },
  roll: { button: 'east', key: 'ShiftLeft' },
  jump: { button: 'south', key: 'Space' },
  interact: { button: 'north', key: 'KeyE' },
  zap: { button: 'rightBumper', key: 'KeyQ' },
  whip: { button: 'leftBumper', key: 'KeyC' },
  squeal: { button: 'leftTrigger', key: 'KeyF' },
  listen: { button: 'up', key: 'KeyR' },
} as const;

const labels: Record<PadLayout, Record<PadButton, string>> = {
  xbox: {
    south: 'A', east: 'B', west: 'X', north: 'Y',
    leftBumper: 'LB', rightBumper: 'RB', leftTrigger: 'LT', rightTrigger: 'RT',
    start: 'Menu', rightStick: 'RS click', up: 'D-pad Up', down: 'D-pad Down', left: 'D-pad Left', right: 'D-pad Right',
  },
  playstation: {
    south: 'Cross', east: 'Circle', west: 'Square', north: 'Triangle',
    leftBumper: 'L1', rightBumper: 'R1', leftTrigger: 'L2', rightTrigger: 'R2',
    start: 'Options', rightStick: 'R3', up: 'D-pad Up', down: 'D-pad Down', left: 'D-pad Left', right: 'D-pad Right',
  },
  nintendo: {
    south: 'B', east: 'A', west: 'Y', north: 'X',
    leftBumper: 'L', rightBumper: 'R', leftTrigger: 'ZL', rightTrigger: 'ZR',
    start: '+', rightStick: 'R stick click', up: 'D-pad Up', down: 'D-pad Down', left: 'D-pad Left', right: 'D-pad Right',
  },
};

export const padLabel = (layout: PadLayout, button: PadButton) => labels[layout][button];
export const padActionLabel = (layout: PadLayout, action: keyof typeof PAD_ACTIONS) => padLabel(layout, PAD_ACTIONS[action].button);
export const padDown = (bits: number, button: PadButton) => (bits & (1 << BUTTON_INDEX[button])) !== 0;

export interface PadFrame {
  layout: PadLayout;
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  held: number;
  pressed: number;
  used: boolean;
}

function layoutFor(id: string): PadLayout {
  if (/nintendo|joy-con|switch pro|057e/i.test(id)) return 'nintendo';
  if (/sony|dualsense|dualshock|playstation|054c/i.test(id) || /^wireless controller\b/i.test(id) && !/045e/i.test(id)) return 'playstation';
  return 'xbox';
}

function stick(x: number, y: number, deadzone: number): [number, number] {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= deadzone) return [0, 0];
  const scale = (Math.min(length, 1) - deadzone) / (1 - deadzone) / length;
  return [x * scale, y * scale];
}

function moved(x: number, y: number, oldX: number, oldY: number) {
  return Math.hypot(x, y) > 0.12 && (Math.hypot(oldX, oldY) <= 0.12 || Math.hypot(x - oldX, y - oldY) > 0.12);
}

function standard(pad: Gamepad | null | undefined): pad is Gamepad {
  return !!pad && pad.connected && pad.mapping === 'standard';
}

export class GamepadInput {
  private index: number | null = null;
  private id = '';
  private layout: PadLayout = 'xbox';
  private last: PadFrame | null = null;
  private waitForNeutral = false;
  private blocked = false;

  suspend() {
    if (this.index !== null) this.waitForNeutral = true;
  }

  poll(): PadFrame | null {
    if (this.blocked || !navigator.getGamepads) return null;
    let pads: (Gamepad | null)[];
    try {
      pads = navigator.getGamepads();
    } catch {
      // A browser or embedding page can forbid access without affecting keyboard play.
      this.blocked = true;
      return null;
    }

    const current = this.index === null ? null : pads[this.index];
    const pad = standard(current) ? current : pads.find(standard);
    if (!pad) {
      this.suspend();
      this.index = null;
      this.last = null;
      return null;
    }

    if (pad.index !== this.index || pad.id !== this.id) {
      this.suspend();
      this.index = pad.index;
      this.id = pad.id;
      this.layout = layoutFor(pad.id);
      this.last = null;
    }

    const [moveX, moveY] = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.18);
    const [lookX, lookY] = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.18);
    let held = 0;
    for (let i = 0; i < Math.min(pad.buttons.length, 16); i++) {
      const button = pad.buttons[i];
      if (button?.pressed || (button?.value ?? 0) >= 0.55) held |= 1 << i;
    }

    if (this.waitForNeutral) {
      this.last = null;
      if (!held && Math.hypot(moveX, moveY) < 0.10 && Math.hypot(lookX, lookY) < 0.10) this.waitForNeutral = false;
      return { layout: this.layout, moveX: 0, moveY: 0, lookX: 0, lookY: 0, held: 0, pressed: 0, used: false };
    }

    const last = this.last;
    const pressed = held & ~(last?.held ?? 0);
    const used = pressed !== 0 || moved(moveX, moveY, last?.moveX ?? 0, last?.moveY ?? 0) || moved(lookX, lookY, last?.lookX ?? 0, last?.lookY ?? 0);
    return this.last = { layout: this.layout, moveX, moveY, lookX, lookY, held, pressed, used };
  }
}

export class PadMenuRepeat {
  private direction: Direction | null = null;
  private next = 0;
  private scope = '';

  step(frame: PadFrame, now: number, scope: string): Direction | null {
    let direction: Direction | null = null;
    if (padDown(frame.held, 'up')) direction = 'up';
    else if (padDown(frame.held, 'down')) direction = 'down';
    else if (padDown(frame.held, 'left')) direction = 'left';
    else if (padDown(frame.held, 'right')) direction = 'right';
    else if (Math.abs(frame.moveY) > Math.abs(frame.moveX) && Math.abs(frame.moveY) > 0.45) direction = frame.moveY < 0 ? 'up' : 'down';
    else if (Math.abs(frame.moveX) > 0.45) direction = frame.moveX < 0 ? 'left' : 'right';

    const changed = direction !== this.direction || scope !== this.scope;
    this.direction = direction;
    this.scope = scope;
    if (!direction || (!changed && now < this.next)) return null;
    this.next = now + (changed ? 340 : 125);
    return direction;
  }

  reset() {
    this.direction = null;
    this.scope = '';
  }
}