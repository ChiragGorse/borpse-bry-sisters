import type { PadMenuCommand } from '../game/gamepad';

export function navigatePadMenu(root: HTMLElement, command: PadMenuCommand): boolean {
  const menu = root.querySelector<HTMLElement>('[data-pad-menu]');
  if (!menu) return false;
  if (typeof command === 'object') {
    menu.scrollTop += command.scroll;
    return true;
  }

  const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    .filter((button) => button.getClientRects().length > 0);
  if (buttons.length === 0) return false;
  const index = buttons.findIndex((button) => button === document.activeElement);
  if (command === 'confirm') {
    const choice = buttons[index] ?? buttons.find((button) => button.hasAttribute('data-pad-default'));
    if (choice) choice.click();
    else buttons[0].focus();
    return true;
  }

  const direction = command === 'down' || command === 'right' ? 1 : -1;
  const next = buttons[index === -1 ? 0 : (index + direction + buttons.length) % buttons.length];
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}