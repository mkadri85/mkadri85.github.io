/* Scroll reveal for browsers without CSS scroll-driven animations.
 *
 * print-theme.css does this with animation-timeline: view(), which Chrome and Edge
 * support and Safari does not. On an iPhone that means no motion at all, which is
 * how this was found. So: if the browser can do it in CSS, stay out of the way. If
 * it cannot, do the same thing with an observer.
 *
 * The hiding class goes on <html> from JavaScript, never in the HTML. A visitor
 * with JavaScript off, or a crawler, gets the page fully visible - nothing is ever
 * hidden by a stylesheet that might load without its script.
 */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  var cssHandlesIt = window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()');
  if (cssHandlesIt) return;

  if (!('IntersectionObserver' in window)) return;

  var SEL = 'article h2, article figure, article table, article .callout,' +
            ' article .toc, article blockquote, .grid .post';

  var els = [].slice.call(document.querySelectorAll(SEL));
  if (!els.length) return;

  document.documentElement.classList.add('reveal-js');
  els.forEach(function (el) { el.classList.add('rv'); });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('rv-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  els.forEach(function (el) { io.observe(el); });

  // Anything already on screen at load is revealed immediately, so the first
  // screen is never sitting at zero opacity waiting for a scroll that may not come.
  requestAnimationFrame(function () {
    els.forEach(function (el) {
      var b = el.getBoundingClientRect();
      if (b.top < innerHeight && b.bottom > 0) { el.classList.add('rv-in'); io.unobserve(el); }
    });
  });
})();

/* Section transitions - see the matching block in print-theme.css.
 * Runs on any page that has <section> elements after a hero; the blog pages
 * have none and are unaffected. Hidden state goes on <html> from here, never
 * in the markup, so nothing is blank without JavaScript. */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  var secs = [].slice.call(document.querySelectorAll('section'))
    .filter(function (s) { return !s.classList.contains('hero') && s.querySelector(':scope > .wrap'); });
  if (!secs.length) return;

  var root = document.documentElement;
  root.classList.add('sec-js');

  // header height -> snap offset, measured rather than guessed
  var hdr = document.querySelector('header');
  if (hdr) root.style.setProperty('--hdr', Math.round(hdr.getBoundingClientRect().height) + 'px');
  root.classList.add('sec-snap');

  // cascade index for the items inside each section
  secs.forEach(function (s) {
    [].forEach.call(s.querySelectorAll('.reveal'), function (el, i) { el.style.setProperty('--i', i); });
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var s = e.target;
      s.classList.add('sec-in');
      io.unobserve(s);
      // drop the compositor hint once the transition has finished
      setTimeout(function () { s.classList.add('sec-done'); }, 1200);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

  secs.forEach(function (s) { io.observe(s); });

  // anything already on screen at load is revealed immediately - the first
  // screen must never sit hidden waiting for a scroll that may not come
  requestAnimationFrame(function () {
    secs.forEach(function (s) {
      var b = s.getBoundingClientRect();
      if (b.top < innerHeight && b.bottom > 0) { s.classList.add('sec-in'); io.unobserve(s); }
    });
  });
})();
