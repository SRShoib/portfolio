// Contact footer behaviour: assemble the email address and make the copy button work.
//
// Privacy rule 5: the address must not appear in the HTML as one string a scraper can regex out.
// content.js keeps it in two pieces (user + domain); static HTML carries a readable
// "name [at] domain [dot] com" fallback, and this module builds the real address at runtime.
// Scrapers that only read HTML never see it; people with JS get a working mailto: link.

import { gsap } from 'gsap';
import { ease, motionDuration } from '../lib/motion.js';
import { enhanceRollLink } from '../lib/hover-roll.js';
import { getEmail } from '../data/content.js';

let teardown = null;

/** Copy text to the clipboard. `navigator.clipboard` needs a secure context (https or localhost)
 *  and can be refused, so fall back to the old select-and-copy command before giving up. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.append(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* ignore: report failure below */
    }
    field.remove();
    return ok;
  }
}

export function initContact() {
  const address = document.querySelector('[data-email]');
  const button = document.querySelector('[data-copy-email]');
  const status = document.querySelector('[data-copy-status]');
  if (!address) return;

  const email = getEmail();

  // Replace the "[at] / [dot]" fallback with a real mailto: link to the assembled address.
  const link = document.createElement('a');
  link.href = `mailto:${email}`;
  link.textContent = email;
  address.replaceChildren(link);
  enhanceRollLink(link); // built after initHoverRoll() already ran, so it needs its own call

  if (!button) return;
  button.hidden = false; // the button is JS-only: hidden in the HTML until now

  const idleLabel = button.textContent;
  let timer = 0;

  const onClick = async () => {
    const ok = await copyText(email);
    // Visible confirmation (the button text + a transform-only pulse) and audible confirmation
    // (the live region). motionDuration('s') is a one-off JS tween, exactly what it exists for
    // (motion.js): a snappy pop under full motion, capped to 200ms under reduced motion.
    button.textContent = ok ? 'Copied ✓' : 'Copy failed';
    if (status) status.textContent = ok ? 'Email address copied to the clipboard.' : 'Could not copy. The address is shown above.';
    if (ok) {
      gsap.killTweensOf(button);
      gsap.fromTo(button, { scale: 1 }, { scale: 1.08, duration: motionDuration('s') / 2, ease: ease.out, yoyo: true, repeat: 1 });
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      button.textContent = idleLabel;
      if (status) status.textContent = '';
    }, 2000);
  };

  button.addEventListener('click', onClick);
  teardown = () => {
    clearTimeout(timer);
    button.removeEventListener('click', onClick);
    gsap.killTweensOf(button);
    gsap.set(button, { clearProps: 'scale' });
    button.textContent = idleLabel;
    button.hidden = true;
  };
}

export function destroyContact() {
  teardown?.();
  teardown = null;
}
