/* Smooth wheel scrolling, as on nokime.fr (his ask, 25 Nov 2026, after cantor8.io, which uses Lenis): each wheel step
   moves a target and the page eases toward it, 10 % of the way per 60 Hz frame, never faster than VMAX, and a flick
   aims at most LEAD screens ahead, so a hard flick does not land at the bottom. Touch, keyboard, scrollbar, anchors
   and the pages' own scrollTo stay native: a scroll this code did not make cancels the glide. Off under reduced
   motion, for pinch-zoom (ctrl + wheel) or a pinch-zoomed page, for sideways wheels, inside any box that can still
   scroll itself (the atlas sheet, the search list), and while a page has locked its own scroll (an open sheet sets
   body overflow:hidden, which stops the wheel but not scrollTo). Every page loads this file next to its stylesheet. */
(function () {
  var mq = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  if (!window.requestAnimationFrame || (mq && mq.matches)) return;
  var VMAX = 35, LEAD = 0.75;   // px per 60 Hz frame at most (~2 100 px/s), and how far ahead of the page a flick may aim, in screens
  var root = document.documentElement, cur = 0, target = 0, set = -1, raf = 0, last = 0, was = "";
  function max() { return Math.max(0, root.scrollHeight - root.clientHeight); }
  function locked() {   // the page has switched its own scroll off; body's overflow rules the page only while html's is visible (the home page clips body and scrolls html)
    var h = getComputedStyle(root), o = (h.overflowX === "visible" && h.overflowY === "visible" ? getComputedStyle(document.body) : h).overflowY;
    return o === "hidden" || o === "clip";
  }
  function inner(el, dy) {   // an element between the pointer and the page that can still scroll this way
    for (; el && el !== document.body && el !== root; el = el.parentElement) {
      if (el.nodeType !== 1 || el.clientHeight === undefined || el.scrollHeight <= el.clientHeight + 1) continue;   // SVG has no clientHeight
      var o = getComputedStyle(el).overflowY;
      if ((o === "auto" || o === "scroll") && (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return true;
    }
    return false;
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; set = -1; root.style.scrollBehavior = was; }
  function frame(now) {
    if (Math.abs(window.pageYOffset - set) > 2) { stop(); return; }   // moved by something else since the last frame
    var dt = Math.min(64, now - (last || now - 16.7)); last = now;
    var step = (target - cur) * (1 - Math.pow(0.9, dt / 16.7)), cap = VMAX * dt / 16.7;
    cur += Math.max(-cap, Math.min(cap, step));
    if (Math.abs(target - cur) < 0.5) cur = target;
    set = Math.round(cur); window.scrollTo(0, set);
    if (cur === target) { stop(); return; }
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener("wheel", function (e) {
    if (e.defaultPrevented || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY || (mq && mq.matches)) return;
    if ((window.visualViewport && visualViewport.scale > 1.01) || !document.body || locked() || inner(e.target, e.deltaY)) { if (raf) stop(); return; }
    var d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (!raf) { cur = target = set = window.pageYOffset; was = root.style.scrollBehavior; root.style.scrollBehavior = "auto"; last = 0; }
    var lead = LEAD * root.clientHeight;   // a hard flick never runs more than this far ahead of the page
    target = Math.max(0, Math.min(max(), Math.max(cur - lead, Math.min(cur + lead, target + d))));
    e.preventDefault();
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: false });
  window.addEventListener("scroll", function () { if (raf && Math.abs(window.pageYOffset - set) > 2) stop(); }, { passive: true });
  if (mq && mq.addEventListener) mq.addEventListener("change", function (m) { if (m.matches) stop(); });
})();
