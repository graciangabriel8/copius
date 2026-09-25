// Data integrity check. Run from the project root with either:
//   node tools/validate.js
//   osascript -l JavaScript tools/validate.js      (no Node required, macOS built-in)
// Verifies unique ids, valid pairing/trio references, known flavor keys and
// categories, and that every text field exists in both languages. Then the lock:
// js/free.js holds exactly the free ids, with no pairing, variety link or paid id
// in its records; _config.yml keeps every premium source off the site; and
// .gitignore keeps js/_premium.js out of the repo.
"use strict";

var read, log, listJs;
if (typeof require === "function" && typeof process !== "undefined") {
  var fs = require("fs"), path = require("path");
  read = function (f) { return fs.readFileSync(path.join(__dirname, "..", f), "utf8"); };
  log = console.log;
  listJs = function () { return fs.readdirSync(path.join(__dirname, "..", "js")).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return "js/" + f; }); };
} else {
  ObjC.import("Foundation");
  var cwd = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  read = function (f) {
    var s = $.NSString.stringWithContentsOfFileEncodingError(cwd + "/" + f, $.NSUTF8StringEncoding, null);
    if (!s || s.isNil()) throw new Error("cannot read " + f);
    return ObjC.unwrap(s);
  };
  log = function (s) { console.log(s); };
  listJs = function () {
    var a = ObjC.deepUnwrap($.NSFileManager.defaultManager.contentsOfDirectoryAtPathError(cwd + "/js", null)) || [];
    return a.filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return "js/" + f; });
  };
}

// The full data, from tools/sources.txt: atlas.html loads only the free file now,
// so its script tags no longer name the sources.
var SOURCES = read("tools/sources.txt").split("\n").map(function (l) { return l.trim(); })
  .filter(function (l) { return l && l.charAt(0) !== "#"; });
var g = (typeof globalThis !== "undefined") ? globalThis : this;
g.window = {};
["js/i18n.js", "js/photos.js"].concat(SOURCES).forEach(function (f) { eval(read(f)); });

var I18N = g.window.I18N, INGREDIENTS = g.window.INGREDIENTS, TRIOS = g.window.TRIOS, CAT_ORDER = g.window.CAT_ORDER;
var errors = [];
var ids = {};

INGREDIENTS.forEach(function (i) {
  if (ids[i.id]) errors.push("duplicate id: " + i.id);
  ids[i.id] = true;
  if (CAT_ORDER.indexOf(i.cat) === -1) errors.push(i.id + ": unknown category " + i.cat);
  ["en","fr"].forEach(function (lang) {
    ["name","origin","story","tip"].forEach(function (field) {
      if (!i[field] || !i[field][lang]) errors.push(i.id + ": missing " + field + "." + lang);
    });
    if (!I18N[lang].categories[i.cat]) errors.push(i.id + ": category " + i.cat + " missing in i18n." + lang);
  });
  i.flavor.forEach(function (f) {
    if (!I18N.en.flavors[f]) errors.push(i.id + ": flavor '" + f + "' missing in i18n.en");
    if (!I18N.fr.flavors[f]) errors.push(i.id + ": flavor '" + f + "' missing in i18n.fr");
  });
  if (!i.svg || !i.svg.length) errors.push(i.id + ": missing svg");
  if (Object.prototype.toString.call(i.season) !== "[object Array]") errors.push(i.id + ": season must be an array");
  else i.season.forEach(function (m) { if (m < 1 || m > 12) errors.push(i.id + ": bad month " + m); });
  if (!i.pairs || i.pairs.length < 3) errors.push(i.id + ": fewer than 3 pairings");
});
var byIdV = {}; INGREDIENTS.forEach(function (x) { byIdV[x.id] = x; });
INGREDIENTS.forEach(function (i) {
  var seen = {};
  /* A variety names its species; the lab reads it with the species' record.
     The parent must exist and the chain of parents must end. */
  if (i.parent !== undefined) {
    if (!ids[i.parent]) errors.push(i.id + ": parent '" + i.parent + "' does not exist");
    if (i.parent === i.id) errors.push(i.id + ": is its own parent");
    var hop = i.parent, steps = 0;
    while (hop && byIdV[hop] && steps < 6) { if (hop === i.id) { errors.push(i.id + ": parent chain loops"); break; } hop = byIdV[hop].parent; steps++; }
  }
  // Where the same-species block files it, when its family would mislead (js/app.js isMade).
  if (i.kin !== undefined && i.kin !== "form" && i.kin !== "made") errors.push(i.id + ": kin must be \"form\" or \"made\"");
  i.pairs.forEach(function (p) {
    if (!ids[p]) errors.push(i.id + ": pairing ref '" + p + "' does not exist");
    if (p === i.id) errors.push(i.id + ": pairs with itself");
    if (seen[p]) errors.push(i.id + ": pairing '" + p + "' listed twice");
    seen[p] = true;
  });
});
TRIOS.forEach(function (t) {
  t.ids.forEach(function (x) { if (!ids[x]) errors.push("trio '" + t.name.en + "': ref '" + x + "' does not exist"); });
  ["en","fr"].forEach(function (lang) {
    if (!t.name[lang]) errors.push("trio missing name." + lang);
    if (!t.note[lang]) errors.push("trio '" + t.name.en + "': missing note." + lang);
  });
});

// ---- work trees ----
var TREES = g.window.TREES || [];
var branchCount = 0, seenBranch = {};
TREES.forEach(function (tr) {
  if (!ids[tr.id]) errors.push("tree '" + tr.id + "': no such ingredient");
  if (!tr.branches || !tr.branches.length) errors.push("tree '" + tr.id + "': no branches");
  (tr.branches || []).forEach(function (b) {
    branchCount++;
    var key = tr.id + "/" + b.id;
    if (seenBranch[key]) errors.push("duplicate branch " + key);
    seenBranch[key] = true;
    ["name","variety","technique"].forEach(function (f) {
      ["en","fr"].forEach(function (l) {
        if (!b[f] || !b[f][l]) errors.push(key + ": missing " + f + "." + l);
      });
    });
    if (!b.tips || !b.tips.length) errors.push(key + ": no tips");
    (b.tips || []).forEach(function (tp, n) {
      ["en","fr"].forEach(function (l) {
        if (!tp[l]) errors.push(key + ": tip " + n + " missing " + l);
      });
    });
    if (!b.pairs || b.pairs.length < 3) errors.push(key + ": fewer than 3 pairings");
    (b.pairs || []).forEach(function (x) {
      if (!ids[x]) errors.push(key + ": pairing ref '" + x + "' does not exist");
    });
  });
});

// ---- the lock ----
// js/free.js (tools/build-free.js) is all the ingredient data the public atlas
// loads: the ids of tools/free-tier.json and no other, without pairs or parent.
// A paid id may appear in it only in COPIUS_LOCKED, the teaser that follows.
// The same list as tools/build-free.js: pairs and parent are never in it.
var FREE_KEYS = ["id", "cat", "price", "pk", "name", "latin", "origin", "season", "flavor",
                 "texture", "story", "tip", "svg", "sign", "luxe", "rare", "kin"];
var FREE_IDS = JSON.parse(read("tools/free-tier.json")).ids, FREE = {};
FREE_IDS.forEach(function (id) { FREE[id] = true; });
var freeText = read("js/free.js"), FW = {};
new Function("window", freeText)(FW);
var freeRecs = FW.INGREDIENTS || [], inFree = {};
freeRecs.forEach(function (r) {
  inFree[r.id] = true;
  if (!FREE[r.id]) errors.push("js/free.js: " + r.id + " is not in tools/free-tier.json");
  Object.keys(r).forEach(function (k) {
    if (FREE_KEYS.indexOf(k) < 0) errors.push("js/free.js: " + r.id + " carries " + k);
  });
});
FREE_IDS.forEach(function (id) { if (!inFree[id]) errors.push("js/free.js: free id " + id + " is missing"); });
var from = freeText.indexOf("window.INGREDIENTS"), to = freeText.indexOf("window.COPIUS_LOCKED");
if (from < 0 || to < from) errors.push("js/free.js: no INGREDIENTS followed by COPIUS_LOCKED");
else {
  var quoted = {}, qre = /"((?:[^"\\]|\\.)*)"/g, qm, part = freeText.slice(from, to);
  while ((qm = qre.exec(part))) quoted[qm[1]] = true;
  INGREDIENTS.forEach(function (i) {
    if (!FREE[i.id] && quoted[i.id]) errors.push("js/free.js: paid id \"" + i.id + "\" in its INGREDIENTS");
  });
}
// Jekyll publishes the repo: every source but the techniques (free, and loaded
// as is) is excluded by path, and the techniques are not.
var excluded = {}, inExclude = false;
read("_config.yml").split("\n").forEach(function (l) {
  if (/^exclude:\s*$/.test(l)) { inExclude = true; return; }
  if (!inExclude) return;
  var m = /^\s+-\s+["']?([^"'\s#]+)["']?\s*(#.*)?$/.exec(l);
  if (m) excluded[m[1]] = true;
  else if (/^[^\s#]/.test(l)) inExclude = false;
});
SOURCES.forEach(function (f) {
  var pub = f === "js/data-techniques.js";
  if (!pub && !excluded[f]) errors.push("_config.yml: " + f + " is not excluded, so the site would publish it");
  if (pub && excluded[f]) errors.push("_config.yml: " + f + " is excluded, but the free atlas loads it");
});
// Every js file is a source (excluded above), one the public site serves, or the
// unpublished bundle; and the atlas loads only served ones. A new premium file wired
// the old way, a script tag and no sources.txt line, would otherwise go out with
// every other check green.
var PUBLISHED_JS = ["js/app.js", "js/i18n.js", "js/photos.js", "js/page.js", "js/free.js", "js/data-techniques.js"];
var isSource = {};
SOURCES.forEach(function (f) { isSource[f] = true; });
listJs().forEach(function (f) {
  if (!isSource[f] && PUBLISHED_JS.indexOf(f) < 0 && f !== "js/_premium.js")
    errors.push(f + " is neither in tools/sources.txt nor a published file, so the site would serve it");
});
(read("atlas.html").match(/src="js\/[^"?]+/g) || []).forEach(function (m) {
  var f = m.slice(5);
  if (PUBLISHED_JS.indexOf(f) < 0) errors.push("atlas.html loads " + f + ", which is not a published file");
});
// On OVH the whole checkout is served and .htaccess does Jekyll's job: once it is
// committed, it must refuse every js file but these same six (the OVH switch script
// writes it; both its rules must carry the list).
var htaccess = null;
try { htaccess = read(".htaccess"); } catch (e) { /* not moved to OVH yet: nothing to check */ }
if (htaccess !== null) {
  var want = PUBLISHED_JS.map(function (f) { return f.slice(3, -3); }).sort().join("|"), rules = 0;
  htaccess.split("\n").forEach(function (l) {
    var m = /js\/\(\?!\(([^)]*)\)/.exec(l);
    if (!m || /^\s*#/.test(l)) return;
    rules++;
    if (m[1].split("|").sort().join("|") !== want)
      errors.push(".htaccess lets through js/(" + m[1] + "), not the published files (" + want + ")");
  });
  if (rules < 2) errors.push(".htaccess: the js/ rule is missing from " + (rules ? "one of its two rule sets" : "both rule sets"));
}
var ignored = read(".gitignore").split("\n").map(function (l) { return l.trim(); });
if (ignored.indexOf("js/_premium.js") < 0 && ignored.indexOf("/js/_premium.js") < 0)
  errors.push(".gitignore: js/_premium.js is not listed, so the full version could be committed");

var cats = {};
INGREDIENTS.forEach(function (i) { cats[i.cat] = (cats[i.cat] || 0) + 1; });
log("ingredients: " + INGREDIENTS.length);
log("families: " + Object.keys(cats).map(function (c) { return c + "=" + cats[c]; }).join(", "));
log("trios: " + TRIOS.length);
log("trees: " + TREES.length + " (" + branchCount + " branches)");
log("js/free.js: " + freeRecs.length + " records for " + FREE_IDS.length + " free ids, " +
    (INGREDIENTS.length - FREE_IDS.length) + " paid ids kept out");

if (errors.length) {
  log("\n" + errors.length + " error(s):");
  errors.forEach(function (e) { log("  - " + e); });
  throw new Error(errors.length + " validation error(s)");
}
log("OK — data is consistent.");
