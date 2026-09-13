// Dishes out of js/data-chefs.js and into tools/dishes.json, for build-pages.py.
// Run from the project root with either:
//   node tools/dump-dishes.js
//   osascript -l JavaScript tools/dump-dishes.js      (no Node required, macOS built-in)
//
// Why a sidecar rather than a regex in the Python: build-pages.py parses the
// ingredient files with a regex over flat `{id:"…",cat:"…"}` records, and a chef
// record is not that shape — the dish is a nested object inside an array inside
// it. A regex that survives one edit to that data would be luck. Here the JS
// engine does the parsing, which is the one reader guaranteed to agree with the
// browser, and Python reads JSON. Same trade as tools/season-notes.json.
//
// bump.sh runs this, so the sidecar cannot fall behind the data.
"use strict";

var read, write, log;
if (typeof require === "function" && typeof process !== "undefined") {
  var fs = require("fs"), path = require("path");
  var root = path.join(__dirname, "..");
  read = function (f) { return fs.readFileSync(path.join(root, f), "utf8"); };
  write = function (f, s) { fs.writeFileSync(path.join(root, f), s); };
  log = console.log;
} else {
  ObjC.import("Foundation");
  var cwd = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  read = function (f) {
    return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(
      cwd + "/" + f, $.NSUTF8StringEncoding, null));
  };
  write = function (f, s) {
    $.NSString.alloc.initWithUTF8String(s).writeToFileAtomicallyEncodingError(
      cwd + "/" + f, true, $.NSUTF8StringEncoding, null);
  };
  log = function (s) { console.log(s); };
}

var window = { CHEFS: null };
new Function("window", read("js/data-chefs.js"))(window);
var CHEFS = window.CHEFS;
if (!CHEFS || !CHEFS.length) { log("no chefs loaded — has data-chefs.js changed shape?"); throw new Error("no chefs"); }

// Ingredient ids, so a dish cannot ship a link to a page that will not exist.
var ING = {};
read("atlas.html").replace(/src="js\/(data-[a-z-]+\.js)\?/g, function (_, fn) {
  if (fn.indexOf("chefs") !== -1 || fn.indexOf("trees") !== -1) return "";
  read("js/" + fn).replace(/\{id:"([a-z0-9é-]+)",cat:"/g, function (__, id) { ING[id] = true; return ""; });
  return "";
});

var out = [], seen = {}, problems = [];
CHEFS.forEach(function (c) {
  (c.dishes || []).forEach(function (d) {
    if (!d.id) problems.push(c.id + ": dish with no id");
    else if (seen[d.id]) problems.push("duplicate dish id: " + d.id);
    else if (!/^[a-z0-9-]+$/.test(d.id)) problems.push("id is not slug-safe: " + d.id);
    else if (d.id.length > 40) problems.push("id over 40 characters: " + d.id);
    seen[d.id] = true;

    ["name", "year", "note", "why"].forEach(function (k) {
      if (!d[k] || !d[k].en || !d[k].fr) problems.push(d.id + ": " + k + " missing a language");
    });
    if (d.kind !== "memorable" && d.kind !== "signature") problems.push(d.id + ": kind is " + d.kind);

    var known = (d.ingredients || []).filter(function (x) { return ING[x]; });
    var unknown = (d.ingredients || []).filter(function (x) { return !ING[x]; });
    if (unknown.length) problems.push(d.id + ": no such ingredient — " + unknown.join(", "));

    out.push({
      id: d.id, kind: d.kind, name: d.name, year: d.year, note: d.note, why: d.why,
      ingredients: known,
      chef: { id: c.id, name: c.name, born: c.born, died: c.died || null,
              country: c.country, place: c.place }
    });
  });
});

if (problems.length) {
  problems.forEach(function (p) { log("  " + p); });
  throw new Error(problems.length + " problem(s) — dishes.json not written");
}

out.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
write("tools/dishes.json", JSON.stringify(out, null, 1) + "\n");
log("tools/dishes.json — " + out.length + " dishes (" +
    out.filter(function (d) { return d.kind === "memorable"; }).length + " memorable, " +
    out.filter(function (d) { return d.kind === "signature"; }).length + " signature)");
