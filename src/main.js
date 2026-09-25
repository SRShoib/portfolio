// Home page entry. Section modules are initialised here, in page order.
import { initScroll } from './lib/scroll.js';
import { checkTokenSync } from './lib/motion.js';
import { initHeader } from './sections/header.js';
import { initPreloader } from './sections/preloader.js';
import { initHero } from './sections/hero.js';
import { initStatement } from './sections/statement.js';
import { initStats } from './sections/stats.js';
import { initContact } from './sections/contact.js';

initScroll(); // first: everything below may need to stop/start scrolling
initHeader();
initPreloader();
initHero(); // after the preloader: it waits for it before loading three.js
initStatement(); // after the hero, so ScrollTrigger measures it below the hero's pin spacing
initStats();
initContact();

if (import.meta.env.DEV) checkTokenSync();
