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
["i18n.js","photos.js","data-vegetables.js","data-fruits.js","data-herbs.js","data-spices.js","data-pantry.js","data-animal.js","data-gastronomy-garden.js","data-gastronomy-pantry.js","data-premium.js","data-cuts.js","trios.js","trios-gastronomy.js","trios-premium.js"]
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

var cats = {};
INGREDIENTS.forEach(function (i) { cats[i.cat] = (cats[i.cat] || 0) + 1; });
log("ingredients: " + INGREDIENTS.length);
log("families: " + Object.keys(cats).map(function (c) { return c + "=" + cats[c]; }).join(", "));
log("trios: " + TRIOS.length);

if (errors.length) {
  log("\n" + errors.length + " error(s):");
  errors.forEach(function (e) { log("  - " + e); });
  throw new Error(errors.length + " validation error(s)");
}
log("OK — data is consistent.");
