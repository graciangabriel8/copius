// The figures the score scale quotes ("of 4 000 plates drawn at random, N% scored
// under 35 and one reached M"), measured with the real engine. Re-run after any
// change to js/plate.js, to the pairings, or to the variety links, and restate the
// figures in js/i18n.js (scaleIntro, both languages) from what it prints.
//
//   osascript -l JavaScript tools/measure-scale.js          (from the project root)
//
// 4 000 plates of 3 to 5 distinct ingredients, drawn from the whole atlas with a
// fixed seed, so two runs on the same data print the same thing.
ObjC.import("Foundation");
var root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
function read(f) { return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(root + "/" + f, $.NSUTF8StringEncoding, null)); }
var g = globalThis; g.window = { console: console };
// The full data, in tools/sources.txt order (js/plate.js is its last file): the
// draw below is seeded, so the order of INGREDIENTS is part of the measure.
["js/i18n.js", "js/photos.js"].concat(read("tools/sources.txt").split("\n")
  .map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== "#"; }))
  .forEach(function (f) { eval(read(f)); });
var ING = g.window.INGREDIENTS, PLATE = g.window.COPIUS_PLATE, byId = {};
ING.forEach(function (i) { byId[i.id] = i; });
// Same lineage the app builds: an entry, then its parent, then the parent's parent.
function lineage(id) {
  var out = [id], seen = {}; seen[id] = 1;
  var p = byId[id] && byId[id].parent;
  while (p && byId[p] && !seen[p] && out.length < 4) { out.push(p); seen[p] = 1; p = byId[p].parent; }
  return out;
}
// The app's symmetric pairing map (rebuildIndex): a declared pair counts both ways.
var PAIRS = {};
ING.forEach(function (i) { PAIRS[i.id] = {}; });
ING.forEach(function (i) { i.pairs.forEach(function (p) { if (byId[p]) { PAIRS[i.id][p] = 1; PAIRS[p][i.id] = 1; } }); });
var ctx = {
  byId: function (id) { return byId[id] || null; },
  pairsOf: function (id) { return byId[id] ? byId[id].pairs.slice() : []; },
  textureOf: function (id) { return byId[id] && byId[id].texture ? byId[id].texture.slice() : []; },
  lineageOf: lineage,
  neighboursOf: function (id) { return PAIRS[id] ? Object.keys(PAIRS[id]) : []; }
};
// mulberry32: exact in 32-bit integer arithmetic, where a float LCG overflows
// double precision and cycles back through plates it has already drawn.
var seed = 20260925;
function rnd() {
  seed = (seed + 0x6D2B79F5) | 0;
  var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
var scores = [];
for (var k = 0; k < 4000; k++) {
  var n = 3 + Math.floor(rnd() * 3), pick = {};
  while (Object.keys(pick).length < n) pick[ING[Math.floor(rnd() * ING.length)].id] = 1;
  var r = PLATE.judge(Object.keys(pick).map(function (id) { return { id: id }; }), ctx);
  scores.push(r.score);
}
var under35 = scores.filter(function (s) { return s < 35; }).length;
var over55 = scores.filter(function (s) { return s >= 55; }).length;
var linked = ING.filter(function (i) { return i.parent; }).length;
console.log("entries " + ING.length + ", with a parent " + linked);
var best = Math.max.apply(null, scores), atBest = scores.filter(function (s) { return s === best; }).length;
console.log("plates 4000: under 35 " + (100 * under35 / 4000).toFixed(1) + "%, 55 or more " + over55 + ", best " + best + " (reached by " + atBest + ")");
// The share of curated sets in the top band, quoted beside SCALE in js/app.js.
var sets = (g.window.TRIOS || []).map(function (t) { return t.ids; });
(g.window.CHEFS || []).forEach(function (c) { (c.dishes || []).forEach(function (d) { sets.push(d.ingredients || []); }); });
sets = sets.map(function (ids) { return ids.filter(function (x) { return byId[x]; }); }).filter(function (ids) { return ids.length >= 2; });
var balanced = sets.filter(function (ids) {
  return PLATE.judge(ids.map(function (id) { return { id: id }; }), ctx).band === "balanced";
}).length;
console.log("trios and chefs' dishes " + sets.length + ": balanced " + Math.round(100 * balanced / sets.length) + "%");
