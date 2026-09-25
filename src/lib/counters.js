// Count-up numbers. A GSAP tween cannot animate `textContent` directly, so this tweens a plain
// object's `value` property and writes it into the element on every tick. `snap: { value: 1 }`
// rounds that value to a whole number each tick, so the visible digits never show a decimal.

import { gsap } from 'gsap';

/** Animate `el.textContent` from 0 to `to`. Returns the tween (kill it to stop/clean up). */
export function countUp(el, { to, duration = 1.1, ease = 'out', delay = 0 } = {}) {
  const proxy = { value: 0 };
  el.textContent = '0';
  return gsap.to(proxy, {
    value: to,
    duration,
    ease,
    delay,
    snap: { value: 1 },
    onUpdate: () => {
      el.textContent = String(proxy.value);
    },
  });
}
