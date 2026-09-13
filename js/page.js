/* Copius — ingredient pages. One job: let the drawing draw itself, without ever
   taking the <img> away. The page ships an <img>; we fetch that same svg out of
   the browser's cache, lay a copy of it over the top, draw it, and remove the
   copy. The DOM before and after is the page exactly as it shipped — which is
   the point: the <img> is what Google Images indexes. Reduced motion, no fetch,
   no parser, a bad response: nothing happens and the <img> is already there. */
(function () {
  "use strict";
  if (!window.fetch || !window.DOMParser) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var img = document.querySelector("main figure img[src*='.svg']");
  if (!img) return;
  fetch(img.getAttribute("src")).then(function (r) {
    return r.ok ? r.text() : Promise.reject(r.status);
  }).then(function (text) {
    var parsed = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
    if (!parsed || parsed.nodeName.toLowerCase() !== "svg") return;
    var svg = document.importNode(parsed, true);
    /* The <img> underneath already carries the name; a second copy of it would
       just make a screen reader say everything twice. */
    svg.removeAttribute("role");
    svg.removeAttribute("aria-label");
    svg.setAttribute("aria-hidden", "true");
    /* Every stroke measured as 1, so one dashoffset draws them all at once. */
    Array.prototype.forEach.call(svg.querySelectorAll(".s,.sf"), function (p) {
      p.setAttribute("pathLength", "1");
    });
    svg.classList.add("draw");
    img.parentNode.appendChild(svg);
    /* The animation is a known length: .62s of stroke, and a fill that starts at
       .26s and runs .5s. A background tab runs none of it and this still fires —
       then the copy simply vanishes off a drawing that was never hidden. */
    setTimeout(function () { svg.parentNode && svg.parentNode.removeChild(svg); }, 1000);
  }).catch(function () { /* the <img> is already on screen — nothing lost */ });
})();
