/* Copius — ingredient pages. One job: let the drawing draw itself.
   The page ships an <img> so it works without JS; here we fetch that same SVG,
   put it inline, normalise every stroke with pathLength="1" and add .draw —
   css/page.css does the rest. Reduced motion: nothing happens. */
(function () {
  "use strict";
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var img = document.querySelector("main figure img[src*='.svg']");
  if (!img || !window.fetch || !window.DOMParser) return;
  fetch(img.getAttribute("src")).then(function (r) {
    return r.ok ? r.text() : Promise.reject(r.status);
  }).then(function (text) {
    var svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") return;
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", img.alt || "");
    Array.prototype.forEach.call(svg.querySelectorAll(".s,.sf"), function (p) { p.setAttribute("pathLength", "1"); });
    svg.classList.add("draw");
    img.replaceWith(document.importNode(svg, true));
  }).catch(function () { /* the <img> stays — nothing lost */ });
})();
