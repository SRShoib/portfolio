// Entry for every inner page: the four case studies and the 404. No preloader here; it
// belongs to the home page only.
import { initScroll } from './lib/scroll.js';
import { checkTokenSync } from './lib/motion.js';
import { initCursor } from './lib/cursor.js';
import { initHeader } from './sections/header.js';
import { initCaseStudy } from './sections/case-study.js';
import { initContact } from './sections/contact.js';

initScroll();
initCursor();
initHeader();
initCaseStudy();
initContact();

if (import.meta.env.DEV) checkTokenSync();
