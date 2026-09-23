// Entry for every inner page: the four case studies and the 404. No preloader here; it
// belongs to the home page only.
import { initScroll } from './lib/scroll.js';
import { checkTokenSync } from './lib/motion.js';
import { initHeader } from './sections/header.js';

initScroll();
initHeader();

if (import.meta.env.DEV) checkTokenSync();
