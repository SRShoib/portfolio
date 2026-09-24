// Home page entry. Section modules are initialised here, in page order.
import { initScroll } from './lib/scroll.js';
import { checkTokenSync } from './lib/motion.js';
import { initHeader } from './sections/header.js';
import { initPreloader } from './sections/preloader.js';
import { initHero } from './sections/hero.js';
import { initContact } from './sections/contact.js';

initScroll(); // first: everything below may need to stop/start scrolling
initHeader();
initPreloader();
initHero(); // after the preloader: it waits for it before loading three.js
initContact();

if (import.meta.env.DEV) checkTokenSync();
