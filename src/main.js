// Home page entry. Section modules are initialised here, in page order.
import { initScroll } from './lib/scroll.js';
import { checkTokenSync } from './lib/motion.js';
import { initCursor } from './lib/cursor.js';
import { initHoverRoll } from './lib/hover-roll.js';
import { initBackdrop } from './lib/backdrop.js';
import { initHeader } from './sections/header.js';
import { initPreloader } from './sections/preloader.js';
import { initHero } from './sections/hero.js';
import { initStatement } from './sections/statement.js';
import { initStats } from './sections/stats.js';
import { initPublications } from './sections/publications.js';
import { initTimeline } from './sections/timeline.js';
import { initAbout } from './sections/about.js';
import { initMarquee } from './sections/marquee.js';
import { initContact } from './sections/contact.js';

initScroll(); // first: everything below may need to stop/start scrolling
initCursor();
initHoverRoll();
initBackdrop();
initHeader();
initPreloader();
initHero(); // after the preloader: it waits for it before loading three.js
initStatement(); // after the hero, so ScrollTrigger measures it below the hero's pin spacing
initStats();
initPublications();
initTimeline(); // after publications, so ScrollTrigger measures it below the fan's own triggers
initAbout();
initMarquee();
initContact();

if (import.meta.env.DEV) checkTokenSync();
