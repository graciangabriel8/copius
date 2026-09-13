/* Copius — ingredient pages. The page ships an <img> of the drawing, because
   that is the only form Google Images can index. This fetches the same file out
   of the browser's cache and lays a copy of it over the top, for two reasons.

   It draws itself, which an <img> cannot be made to do.

   And it can be themed, which an <img> also cannot: a file loaded that way sees
   the browser's colour scheme and never the choice made in the atlas. Where the
   two agree the copy leaves at the end of the draw and the <img> underneath is
   identical. Where they disagree — data-art="swap", set before first paint —
   the copy stays, because it is the one wearing the right colours.

   Reduced motion with the themes agreeing: nothing happens at all. No fetch, no
   parser, a bad response: nothing happens either, and the <img> is already on
   screen. Nothing here can leave the page without a drawing. */
(function () {
  "use strict";
  if (!window.fetch || !window.DOMParser) return;
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var swap = document.documentElement.getAttribute("data-art") === "swap";
  if (reduced && !swap) return;
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
    svg.classList.add("ink");
    if (!reduced) {
      /* Every stroke measured as 1, so one dashoffset draws them all at once. */
      Array.prototype.forEach.call(svg.querySelectorAll(".s,.sf"), function (p) {
        p.setAttribute("pathLength", "1");
      });
      svg.classList.add("draw");
    }
    img.parentNode.appendChild(svg);
    if (swap) return;
    /* The animation is a known length: 1.05s of stroke, and a fill that starts
       at .46s and runs .58s. A background tab runs none of it and this still
       fires — then the copy simply vanishes off a drawing that was never
       hidden, and the <img> it was covering is the same picture. */
    setTimeout(function () { svg.parentNode && svg.parentNode.removeChild(svg); }, 1400);
  }).catch(function () { /* the <img> is already on screen — nothing lost */ });
})();
