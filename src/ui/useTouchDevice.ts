import { useEffect, useState } from 'react';

/**
 * True when the device's primary input is a finger: phones and tablets.
 * Touchscreen laptops keep a mouse/trackpad as their primary pointer, so they stay on keyboard + mouse.
 */
const QUERY = '(hover: none) and (pointer: coarse)';

function detect(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.(QUERY).matches ?? false;
  return mq && (navigator.maxTouchPoints ?? 0) > 0;
}

export function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(detect);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const update = () => setTouch(detect());
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return touch;
}
