// Data integrity check. Run from the project root with either:
//   node tools/validate.js
//   osascript -l JavaScript tools/validate.js      (no Node required, macOS built-in)
// Verifies unique ids, valid pairing/trio references, known flavor keys and
// categories, and that every text field exists in both languages.
"use strict";

var read, log;
if (typeof require === "function" && typeof process !== "undefined") {
  var fs = require("fs"), path = require("path");
  read = function (f) { return fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"); };
  log = console.log;
} else {
  ObjC.import("Foundation");
  var cwd = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  read = function (f) {
    return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(cwd + "/js/" + f, $.NSUTF8StringEncoding, null));
  };
  log = function (s) { console.log(s); };
}

var g = (typeof globalThis !== "undefined") ? globalThis : this;
g.window = {};
(function () {
  // Load exactly what index.html loads, so the validator can never drift
  // from the app the way it did when this list was written by hand.
  var html = read("../index.html");
  var re = /src="js\/([a-z0-9.-]+\.js)\?/g, m, out = ["i18n.js", "photos.js"];
  while ((m = re.exec(html))) {
    var f = m[1];
    // data + vocabulary only; app.js needs a browser and is not data
    if (!/^(data-|trios)/.test(f)) continue;
    if (out.indexOf(f) === -1) out.push(f);
  }
  return out;
})()
  .forEach(function (f) { eval(read(f)); });

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
INGREDIENTS.forEach(function (i) {
  i.pairs.forEach(function (p) {
    if (!ids[p]) errors.push(i.id + ": pairing ref '" + p + "' does not exist");
    if (p === i.id) errors.push(i.id + ": pairs with itself");
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

var cats = {};
INGREDIENTS.forEach(function (i) { cats[i.cat] = (cats[i.cat] || 0) + 1; });
log("ingredients: " + INGREDIENTS.length);
log("families: " + Object.keys(cats).map(function (c) { return c + "=" + cats[c]; }).join(", "));
log("trios: " + TRIOS.length);
log("trees: " + TREES.length + " (" + branchCount + " branches)");

if (errors.length) {
  log("\n" + errors.length + " error(s):");
  errors.forEach(function (e) { log("  - " + e); });
  throw new Error(errors.length + " validation error(s)");
}
log("OK — data is consistent.");
