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
  // threshold 0: fire the moment the section's top edge crosses the line 12% above
  // the bottom of the viewport. A fraction-of-section threshold is wrong for tall
  // sections - on a phone the projects section runs to thousands of pixels, and
  // 8% of that meant scrolling hundreds of pixels into it before anything moved.
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });

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

/* Diagnostic overlay - only when the URL carries ?motiondebug=1.
 * Exists because "I don't feel anything on the phone" cannot be investigated from
 * a laptop: it shows on the device what this script actually sees there. */
(function () {
  if (!/[?&]motiondebug=1/.test(location.search)) return;
  var box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;margin:0;padding:10px 12px;' +
    'background:rgba(0,0,0,.88);color:#9fe3a1;font:12px/1.5 Menlo,monospace;border-radius:8px;white-space:pre-wrap;' +
    'pointer-events:none;max-height:45vh;overflow:hidden';
  document.body.appendChild(box);
  var errs = [];
  window.addEventListener('error', function (e) { errs.push((e.message || 'error').slice(0, 80)); });
  function nearest() {
    var best = null, bd = 1e9;
    [].forEach.call(document.querySelectorAll('section'), function (s) {
      var r = s.getBoundingClientRect(), d = Math.abs(r.top - innerHeight * 0.5);
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }
  function tick() {
    var root = document.documentElement, rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var s = nearest(), w = s && s.querySelector(':scope > .wrap'), cs = w && getComputedStyle(w);
    box.textContent =
      'motion debug\n' +
      'script ran: yes   sec-js on <html>: ' + root.classList.contains('sec-js') + '\n' +
      'reduce motion: ' + (rm ? 'ON  <- transitions are switched off by this' : 'off') + '\n' +
      'IntersectionObserver: ' + ('IntersectionObserver' in window) + '   sections: ' + document.querySelectorAll('section').length + '\n' +
      'viewport: ' + innerWidth + 'x' + innerHeight + '   scrollY: ' + Math.round(scrollY) + '\n' +
      (s ? 'nearest section: #' + (s.id || s.className) + '  sec-in: ' + s.classList.contains('sec-in') +
           '\n  wrap opacity: ' + (cs ? (+cs.opacity).toFixed(2) : '-') + '  transform: ' + (cs ? cs.transform.slice(0, 32) : '-') : 'no section') + '\n' +
      'errors: ' + (errs.length ? errs.join(' | ') : 'none') + '\n' +
      'ua: ' + navigator.userAgent.slice(0, 70);
    requestAnimationFrame(tick);
  }
  tick();
})();
