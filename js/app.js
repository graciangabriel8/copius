/* Copius — app logic: language, search, filters, modal, pairing lab, trios. */
(function () {
  "use strict";

  var LS_LANG = "atlas-lang", LS_FAVS = "atlas-favs";
  var LS_MYINGS = "atlas-my-ingredients";
  var BASE = window.INGREDIENTS || [], TRIOS = window.TRIOS || [], I18N = window.I18N, CAT_ORDER = window.CAT_ORDER;
  var TECHNIQUES = window.TECHNIQUES || [], BASES = window.BASES || [], COMPONENTS = window.COMPONENTS || [];
  var techById = {}, baseById = {}, compById = {};
  TECHNIQUES.forEach(function (x) { techById[x.id] = x; });
  BASES.forEach(function (x) { baseById[x.id] = x; });
  /* The free version holds the free three in full; the full version holds every one. */
  COMPONENTS.forEach(function (x) { compById[x.id] = x; });
  var PHOTOS = new Set(window.PHOTOS || []);

  /* The version. js/free.js carries the free cut and COPIUS_LOCKED, the teaser
     for the rest: the paid entries' names and families, and the counts the
     locked panels quote. js/_premium.js, when atlas.html loads it, replaces the
     data with all of it and sets COPIUS_PREMIUM. Nothing else opens the full
     version, so a missing or broken bundle leaves the free one. Locked is keyed
     on that flag alone, never on which data happens to be present: the pairings,
     trees and views stay shut even if a paid record arrived without it. */
  var LOCKED = window.COPIUS_PREMIUM !== true;
  /* Sales are open (DESIGN-PAYMENT.md section 9): the price leads to the order
     page instead of « bientôt ». tools/build-pages.py reads this line to word the
     public pages the same way, so this is the one switch; config.php's
     payments_live is the server's own. */
  var PAYMENTS_LIVE = true;
  var LK = window.COPIUS_LOCKED || {};
  LK = {
    counts: LK.counts || { ingredients: 0, free: 0, paid: 0, pairings: 0, chefs: 0, dishes: 0, bases: 0, trios: 0, trees: 0, components: 0 },
    familyPaid: LK.familyPaid || {}, pairs: LK.pairs || {}, kin: LK.kin || {},
    trees: LK.trees || {}, basesUsing: LK.basesUsing || {}, items: LK.items || [],
    /* [id, family, origin type, name en, name fr, summary en, summary fr] for every
       component, and how many paid components use each ingredient. */
    components: LK.components || [], compUsing: LK.compUsing || {}
  };
  var PAID = {};   // id -> [id, name en, name fr, family]
  LK.items.forEach(function (x) { PAID[x[0]] = x; });
  if (LOCKED) BASE = BASE.filter(function (i) { return !PAID[i.id]; });
  /* The three paid views. Their tabs stay, marked, and open a panel saying what
     is behind them. */
  var PAID_VIEWS = ["chefs", "bases", "lab"];
  var LOCK_ICON = '<svg class="lock-ico" viewBox="0 0 16 16" aria-hidden="true">' +
    '<rect x="3" y="7.2" width="10" height="7" rx="1.6"/><path d="M5.4 7.2V5.1a2.6 2.6 0 0 1 5.2 0v2.1"/></svg>';

  /* Signing in. The server sets two cookies: the session, which no script can
     read, and __Host-copius_full, which only says that one exists and makes
     atlas.html ask /api/premium.php for the bundle. An answer that is not the
     bundle is a stub naming why (COPIUS_SESSION); a marker with no answer at
     all means the request never came back: offline, or the server failing
     outright, which reads like the database being down. There is no
     separate sign-up: the account appears at the first sign-in of an address
     that has access. */
  /* A sign-in or sign-out in one tab reloads the site's other open tabs. A
     broadcast rather than a localStorage stamp, so nothing is left stored. */
  var SESSION_CH = window.BroadcastChannel ? new BroadcastChannel("copius-session") : null;
  function hasMark() { return /(?:^|;\s*)__Host-copius_full=1(?:;|$)/.test(document.cookie); }
  /* The service worker's offline copy of the full version (service-worker.js,
     PREMIUM_CACHE): gone with the sign-in, so also at any load without the
     marker (the cookie expired or was cleared). Settles, never rejects. */
  function forgetBundle() {
    try { if (window.caches) return caches.delete("premium-copius").catch(function () {}); } catch (e) {}
    return Promise.resolve();
  }
  var MARK_AT_LOAD = hasMark();
  if (!MARK_AT_LOAD) forgetBundle();
  var SESSION = window.COPIUS_SESSION ||
    (MARK_AT_LOAD && LOCKED ? (navigator.onLine === false ? "offline" : "unavailable") : "");
  var SESSION_NOTE = { ended: "sessionEnded", noaccess: "sessionNoAccess",
                       unavailable: "sessionUnavailable", offline: "sessionOffline" };

  /* A data file that fails to load says nothing: its family is simply absent and
     the count quietly drops, which is how one bad fetch of data-vegetables.js
     turned into an atlas with no vegetables in it and a search that could not
     find a courgette. The service worker is cache-first, so a bad response stays
     cached until the next version bump — it does not heal on a reload. Compare
     the families the app expects against the ones that arrived, and if any are
     missing, drop the caches and reload once. Once: a family that is genuinely
     empty must not put the page in a loop. The free data is one file, loaded
     whole or not at all, and its cut need not cover every family; so locked,
     the check is that the file arrived, not that each family did. */
  (function () {
    var missing = LOCKED
      ? (BASE.length && window.COPIUS_LOCKED ? [] : ["js/free.js"])
      : (CAT_ORDER || []).filter(function (c) {
          return !BASE.some(function (i) { return i.cat === c; });
        });
    if (!missing.length) return;
    var KEY = "copius-reloaded-for-missing-data";
    try {
      if (sessionStorage.getItem(KEY)) {
        console.error("Copius: still missing after a cache reset: " + missing.join(", "));
        return;
      }
      sessionStorage.setItem(KEY, "1");
    } catch (e) { return; }        /* no session storage means no loop guard */
    console.warn("Copius: " + missing.join(", ") + " failed to load — clearing the cache and reloading");
    var reload = function () { location.reload(); };
    var caches_ = self.caches
      ? caches.keys().then(function (k) { return Promise.all(k.map(function (n) { return caches.delete(n); })); })
      : Promise.resolve();
    caches_.then(function () {
      return navigator.serviceWorker
        ? navigator.serviceWorker.getRegistrations().then(function (rs) {
            return Promise.all(rs.map(function (r) { return r.unregister(); }));
          })
        : null;
    }).then(reload, reload);
  })();

  /* Storage can be unreadable (cookies blocked) or hold a value that is not the
     array we wrote (a hand-edited '{', a stray '5'); either used to throw here
     and leave the atlas blank. Anything but a clean array reads as empty.
     Manual check: DevTools > Application > Local Storage, set atlas-favs to "{",
     reload — the grid renders and the console is clean. */
  function readList(k) {
    try { var v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function readItem(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // User creations, persisted in this browser. A stored entry is always a
  // creation, whatever its JSON says: the flag and the drawn art are ours.
  var myIngs = readList(LS_MYINGS).filter(function (i) { return i && typeof i.id === "string"; });
  myIngs.forEach(function (i) { i.custom = true; i.svg = ""; });

  /* ---------- bases as plate items ----------
     A sauce is a thing a cook puts on a plate, and the atlas already holds 45
     of them — but as bases, with no flavour tags and no pairings of their own.
     What every one of them does have is the list of what goes into it, so each
     becomes a synthetic ingredient built from its parts.

     Two judgements, both deliberately conservative. Its flavour is the notes
     carried by at least two of its ingredients, capped at four, so a sauce
     reads like one ingredient rather than a flavour bomb that swamps every
     axis on the plate. Its pairings are the things that agree with at least
     two of its parts, so hollandaise inherits what butter AND egg yolk like
     rather than everything either of them has ever been served with. */
  function buildBaseItems(byIngId) {
    return BASES.map(function (b) {
      var parts = (b.ingredients || []).filter(function (x) { return byIngId[x]; });
      if (!parts.length) return null;
      var flavN = {}, pairN = {};
      parts.forEach(function (id) {
        var ing = byIngId[id];
        (ing.flavor || []).forEach(function (f) { flavN[f] = (flavN[f] || 0) + 1; });
        (ing.pairs || []).forEach(function (pp) { pairN[pp] = (pairN[pp] || 0) + 1; });
      });
      var flavor = Object.keys(flavN).filter(function (f) { return flavN[f] >= 2; })
        .sort(function (x, y) { return flavN[y] - flavN[x]; }).slice(0, 4);
      /* A sauce of two ingredients can have nothing carried twice; fall back to
         what its parts do say rather than shipping a tasteless sauce. */
      if (!flavor.length) {
        flavor = Object.keys(flavN).sort(function (x, y) { return flavN[y] - flavN[x]; }).slice(0, 3);
      }
      var pairs = Object.keys(pairN).filter(function (pp) {
        return pairN[pp] >= 2 && byIngId[pp];
      });
      return {
        id: BASE_PREFIX + b.id, cat: "__base", isBase: true,
        name: { en: b.name.en, fr: b.name.fr },
        latin: "", origin: { en: "", fr: "" }, season: [],
        flavor: flavor, pairs: pairs, svg: "",
        story: { en: "", fr: "" }, tip: { en: "", fr: "" }
      };
    }).filter(Boolean);
  }

  /* ---------- components as plate items ----------
     A component is a finished element, so unlike a base it brings its own
     flavour, texture and pairings: the record's, plus the ingredients it is
     made of. Its role on the plate comes from its family, in this one table,
     keyed by family and never by id (the engine reads `role` first). */
  var COMP_FAMILIES = ["purees", "sauces", "emulsions", "broths", "butters-oils", "glazes",
                       "crunch", "pickles", "gels", "powders", "creams", "sweet"];
  var COMP_ROLE = {
    sauces: "sauce", emulsions: "sauce", "butters-oils": "sauce", glazes: "sauce",
    broths: "sauce", gels: "sauce", creams: "sauce",
    crunch: "crunch", powders: "crunch", pickles: "acid", purees: "vegetable", sweet: "fruit"
  };
  function buildCompItems(byIngId) {
    return COMPONENTS.map(function (c) {
      var seen = {}, pairs = (c.pairs || []).concat((c.ingredients || []).map(function (x) { return x.id; }))
        .filter(function (id) {
          if (!byIngId[id] || seen[id]) return false;
          return (seen[id] = true);
        });
      return {
        id: COMP_PREFIX + c.id, cat: "__comp", isComp: true, family: c.family,
        role: COMP_ROLE[c.family] || "sauce",
        name: { en: c.name.en, fr: c.name.fr },
        latin: "", origin: { en: "", fr: "" }, season: [],
        flavor: (c.flavor || []).slice(), texture: (c.texture || []).slice(),
        pairs: pairs, svg: "",
        story: { en: "", fr: "" }, tip: { en: "", fr: "" }
      };
    });
  }

  var ING, byId, PAIRS, EDGE_COUNT, BASE_ITEMS = [], COMP_ITEMS = [];
  var BASE_PREFIX = "base:", COMP_PREFIX = "comp:";

  function rebuildIndex() {
    ING = BASE.concat(myIngs);
    byId = {};
    ING.forEach(function (i) { byId[i.id] = i; });
    /* Built from the ingredient index, then added to it — the lab can reach a
       sauce, and nothing else (grid, search, counters) iterates BASE_ITEMS. */
    BASE_ITEMS = LOCKED ? [] : buildBaseItems(byId);
    BASE_ITEMS.forEach(function (b) { byId[b.id] = b; });
    COMP_ITEMS = LOCKED ? [] : buildCompItems(byId);
    COMP_ITEMS.forEach(function (c) { byId[c.id] = c; });
    // Symmetric pairing graph: a declared pair counts in both directions.
    PAIRS = {};
    ING.forEach(function (i) { PAIRS[i.id] = new Set(); });
    ING.forEach(function (i) {
      /* Locked, only a creation's pairings count: they are the visitor's own. */
      if (LOCKED && !i.custom) return;
      (i.pairs || []).forEach(function (p) {
        if (!byId[p]) return;
        PAIRS[i.id].add(p);
        PAIRS[p].add(i.id);
      });
    });
    var n = 0, seen = new Set();
    Object.keys(PAIRS).forEach(function (a) {
      PAIRS[a].forEach(function (b) {
        var k = a < b ? a + "|" + b : b + "|" + a;
        if (!seen.has(k)) { seen.add(k); n++; }
      });
    });
    EDGE_COUNT = n;
  }
  rebuildIndex();

  /* An entry, then its parent, then the parent's parent: Tahitian vanilla,
     vanilla. The parent field names the species a variety belongs to, so what
     is recorded for the species holds for it (see recordedPair). Bounded and
     cycle-safe; a parent missing from ING (free tier, deleted) ends the line. */
  function lineage(id) {
    var out = [id], seen = {}; seen[id] = 1;
    var p = byId[id] && byId[id].parent;
    while (p && byId[p] && !seen[p] && out.length < 4) { out.push(p); seen[p] = 1; p = byId[p].parent; }
    return out;
  }
  /* The two sides of a pair: each entry, then those of its ancestors the other
     side does not share. A shared species speaks for neither side: two honeys
     are no classic because acacia honey lists honey, and vanilla's pairings
     are no bridge between vanilla and Tahitian vanilla. When one entry is the
     other's ancestor, the descendant speaks alone: glutinous rice's likeness
     to rice is no bridge between rice and black glutinous rice. */
  function pairSides(a, b) {
    var la = lineage(a), lb = lineage(b);
    return [
      la.indexOf(b) !== -1 ? [a] : [a].concat(la.slice(1).filter(function (x) { return lb.indexOf(x) === -1; })),
      lb.indexOf(a) !== -1 ? [b] : [b].concat(lb.slice(1).filter(function (x) { return la.indexOf(x) === -1; }))
    ];
  }
  /* Is the pair recorded, and by whom? { via: null } when a or b records it
     itself; { via: [x, y] } when it is recorded for a species of one or both
     (lobster × vanilla, read for Tahitian vanilla); null when nothing does.
     The nearest record wins, ties broken by id, so swapping the two slots
     names the same pair. */
  function recordedPair(a, b) {
    if (PAIRS[a] && PAIRS[a].has(b)) return { via: null };
    var s = pairSides(a, b), best = null, i, j, k;
    for (i = 0; i < s[0].length; i++) {
      for (j = 0; j < s[1].length; j++) {
        if (!(i || j) || !PAIRS[s[0][i]] || !PAIRS[s[0][i]].has(s[1][j])) continue;
        k = [s[0][i], s[1][j]].sort().join("|");
        if (!best || i + j < best.n || (i + j === best.n && k < best.k)) best = { via: [s[0][i], s[1][j]], n: i + j, k: k };
      }
    }
    return best ? { via: best.via } : null;
  }
  /* What both sides are recorded with, the two lineages themselves apart. */
  function bridgesOf(a, b) {
    var s = pairSides(a, b), own = lineage(a).concat(lineage(b));
    function recs(side) {
      var r = new Set();
      side.forEach(function (x) { if (PAIRS[x]) PAIRS[x].forEach(function (p) { r.add(p); }); });
      return r;
    }
    var nb = recs(s[1]);
    return Array.from(recs(s[0])).filter(function (x) { return own.indexOf(x) === -1 && nb.has(x); });
  }
  /* "Recorded for lobster × vanilla." — said wherever an inherited pair is
     shown, so a variety never claims a record of its own. */
  function viaLine(via) {
    return T().labVia.replace("{pair}", name(byId[via[0]]) + " × " + name(byId[via[1]]));
  }

  var state = {
    lang: readItem(LS_LANG) || ((navigator.language || "").toLowerCase().indexOf("fr") === 0 ? "fr" : "en"),
    view: "atlas",   // every visit opens on the atlas; the last tab used to be restored and a visit ending in the lab reopened there
    chefQ: "", chefGender: "all", chefStars: "all", chefCountry: "all", chefEra: "all",
    cat: "all", q: "", dq: "", months: [], favsOnly: false, rareOnly: false, luxeOnly: false, signOnly: false, priceBand: "all", flavour: "all", sort: "name",
    techQ: "", techGroup: "all", baseQ: "", baseGroup: "all",
    compQ: "", compFamily: "all", compOrigin: "all"
  };
  var favs = new Set(readList(LS_FAVS));
  /* Everything opened in the dialog, oldest first: {kind: ing|tech|base, id}.
     ← pops it, whatever the chain (ingredient → base → technique…); closing
     empties it. */
  var modalStack = [];
  function modalTop() { return modalStack[modalStack.length - 1]; }
  function currentIng() { var c = modalTop(); return c && c.kind === "ing" ? c.id : null; }

  /* ---------- photos (drag & drop or picker, stored in IndexedDB) ---------- */
  var photosMap = {};
  var idb = null;
  function idbOpen() {
    return new Promise(function (res, rej) {
      var rq = indexedDB.open("atlas-photos", 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore("photos"); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function idbPut(key, val) {
    return new Promise(function (res, rej) {
      var tx = idb.transaction("photos", "readwrite");
      tx.objectStore("photos").put(val, key);
      tx.oncomplete = res;
      tx.onerror = function () { rej(tx.error); };
    });
  }
  function idbDel(key) {
    return new Promise(function (res, rej) {
      var tx = idb.transaction("photos", "readwrite");
      tx.objectStore("photos").delete(key);
      tx.oncomplete = res;
      tx.onerror = function () { rej(tx.error); };
    });
  }
  function idbLoadAll() {
    return new Promise(function (res, rej) {
      var out = {};
      var cur = idb.transaction("photos", "readonly").objectStore("photos").openCursor();
      cur.onsuccess = function () {
        var c = cur.result;
        if (c) { out[c.key] = c.value; c.continue(); } else res(out);
      };
      cur.onerror = function () { rej(cur.error); };
    });
  }

  // Downscale + compress in the browser so a phone photo stays ~100 KB.
  function fileToPhoto(file, cb, errCb) {
    if (!file || (file.type && file.type.indexOf("image/") !== 0)) { errCb(); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var max = 900, w = img.naturalWidth, h = img.naturalHeight;
      var k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = function () { URL.revokeObjectURL(url); errCb(); };
    img.src = url;
  }

  function refreshOpenModal() {
    if (modalTop() && !el("overlay").hidden) showModal();
  }
  function attachPhoto(id, file) {
    fileToPhoto(file, function (dataURL) {
      photosMap[id] = dataURL;
      if (idb) idbPut(id, dataURL).catch(function () {});
      renderAll();
      refreshOpenModal();
    }, function () { alert(T().photoError); });
  }
  function deletePhoto(id) {
    delete photosMap[id];
    if (idb) idbDel(id).catch(function () {});
    renderAll();
    refreshOpenModal();
  }

  // Sort names by their letters, not their punctuation — otherwise ’Nduja sits above Abricot.
  var CMP = { ignorePunctuation: true, sensitivity: "base" };
  function T() { return I18N[state.lang]; }
  function name(i) { return i.name[state.lang]; }
  // œ/æ are separate letters, not decomposable — NFD leaves them alone, so expand
  // them by hand. Applied to both query and names, so it matches either way round.
  /* Folds case, accents, ligatures and apostrophes: a keyboard types ' and the
     names are set with ’, so "miel d'acacia" has to find Miel d’acacia. */
  function norm(s) {
    return s.toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  // The only guard between data and markup, attribute values included — all five.
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function el(id) { return document.getElementById(id); }
  function reducedMotion() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  function monogramSvg(ch, label) {
    return '<svg class="art" viewBox="0 0 96 96" role="img" aria-label="' + esc(label || ch) + '">' +
      '<circle cx="48" cy="50" r="42" fill="var(--plate)"/>' +
      '<circle cx="48" cy="50" r="32" fill="none" stroke="var(--border-strong)" stroke-width="1.6" stroke-dasharray="4 5"/>' +
      '<text x="48" y="62" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="var(--ink-3)">' + esc(ch) + "</text></svg>";
  }
  function monogram(i) {
    return monogramSvg((name(i) || "?").trim().charAt(0).toUpperCase(), name(i));
  }

  /* Each family draws its lines in its own colour (css/style.css, [data-f]):
     green for leaves and roots, pink for fruit and flowers, blue for the sea,
     brown for mushrooms and the farm, gold for the pantry. */
  var FAMILY = {};
  [["g", "vegetables herbs seaweed legumes"], ["r", "fruits flowers sweet"], ["s", "seafood shellfish roe"],
   ["e", "mushrooms meat cuts dairy fats"], ["o", "spices nuts grains condiments cellar infusions texture"]]
    .forEach(function (f) { f[1].split(" ").forEach(function (c) { FAMILY[c] = f[0]; }); });
  function famAttr(i) { return FAMILY[i.cat] ? ' data-f="' + FAMILY[i.cat] + '"' : ""; }

  function art(i, cls) {
    if (photosMap[i.id]) return '<img class="' + (cls || "") + '" src="' + photosMap[i.id] + '" alt="' + esc(name(i)) + '">';
    if (PHOTOS.has(i.id)) return '<img class="' + (cls || "") + '" src="img/' + i.id + '.jpg" alt="' + esc(name(i)) + '" loading="lazy">';
    if (i.custom) return monogram(i);
    return '<svg class="art"' + famAttr(i) + ' viewBox="0 0 96 96" role="img" aria-label="' + esc(name(i)) + '">' +
      '<circle cx="48" cy="50" r="42" fill="var(--plate)"/>' + i.svg + "</svg>";
  }

  /* Prices are French retail, in euros. The English view keeps the euro — these
     are euro figures, and converting them would date instantly — but writes them
     the English way: symbol first, no space. "12–18 €/kg" -> "€12–18/kg". */
  var UNIT_EN = { "pièce": "each", "botte de": "bunch of", "botte": "bunch", "barquette": "punnet",
                  "flacon": "bottle", "pot": "pot", "feuilles": "leaves", "feuille": "leaf",
                  "douzaine": "dozen", "paquet": "pack", "bocal": "jar" };
  // Longest key first, so "feuilles" is a whole word and never "leaf" + "s".
  var UNIT_RE = new RegExp("\\b(" + Object.keys(UNIT_EN).sort(function (a, b) { return b.length - a.length; }).join("|") + ")\\b", "g");
  function priceText(s) {
    if (state.lang !== "en") return s;
    var out = s.replace(/([\d][\d\s\u00a0\u202f]*(?:,\d+)?)\s*[\u2013-]\s*([\d][\d\s\u00a0\u202f]*(?:,\d+)?)\s*\u20ac\s*\/\s*/g,
      function (m, lo, hi) {
        var num = function (x) { return x.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."); };
        return "\u20ac" + num(lo) + "\u2013" + num(hi) + "/";
      });
    out = out.replace(/([\d][\d\s\u00a0\u202f]*(?:,\d+)?)\s*\u20ac\s*\/\s*/g, function (m, v) {
      return "\u20ac" + v.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".") + "/";
    });
    return out.replace(UNIT_RE, function (m) { return UNIT_EN[m]; }).replace(/\bde\b/g, "of");
  }

  function catLabel(c) { return T().categories[c]; }
  function inSeasonNow(i) { return i.season.length === 0 || i.season.indexOf(new Date().getMonth() + 1) !== -1; }
  /* Picked months (1–12) keep what is in season in any of them. All-year entries
     drop out: 1,139 of them would bury the month, and the month pages leave them
     out too. */
  function inPickedMonths(i) {
    return state.months.some(function (m) { return i.season.indexOf(m) !== -1; });
  }
  function renderMonthPick() {
    var t = T(), now = new Date().getMonth() + 1;
    el("monthPickLbl").textContent = t.season;
    el("monthPick").setAttribute("aria-label", t.season);
    el("monthBtns").innerHTML = t.monthsShort.map(function (m, idx) {
      var on = state.months.indexOf(idx + 1) !== -1;
      return '<button type="button" class="mp' + (on ? " on" : "") + (idx + 1 === now ? " now" : "") +
        '" data-month="' + (idx + 1) + '" aria-pressed="' + on + '" aria-label="' + esc(t.months[idx]) +
        '" title="' + esc(t.months[idx]) + '">' + m + "</button>";
    }).join("");
    paintSeasonLink();
  }
  /* The link goes to the month's own page, which carries what arrives and what
     leaves: the month last picked, or this one. */
  function paintSeasonLink() {
    var months = ["january","february","march","april","may","june","july","august",
                  "september","october","november","december"],
        moisFr = ["janvier","fevrier","mars","avril","mai","juin","juillet","aout",
                  "septembre","octobre","novembre","decembre"],
        m = state.months.length ? state.months[state.months.length - 1] - 1 : new Date().getMonth(),
        sl = el("seasonLink");
    sl.href = state.lang === "fr" ? "fr/saison/" + moisFr[m] + "/" : "season/" + months[m] + "/";
    sl.textContent = T().seasonPage;
  }

  /* ---------- static labels ---------- */
  // A search field's placeholder is also its name for assistive tech.
  function placeholder(id, text) {
    el(id).placeholder = text;
    el(id).setAttribute("aria-label", text);
  }
  function applyStatic() {
    var t = T();
    document.documentElement.lang = state.lang;
    placeholder("search", t.searchPh);
    startTypewriter();
    /* Static markup names its controls by key, so they switch with the rest. */
    [["data-i18n-aria", "aria-label"], ["data-i18n-title", "title"]].forEach(function (p) {
      Array.prototype.forEach.call(document.querySelectorAll("[" + p[0] + "]"), function (n) {
        n.setAttribute(p[1], t[n.getAttribute(p[0])]);
      });
    });
    el("labA").setAttribute("aria-label", t.labA);
    el("labB").setAttribute("aria-label", t.labB);
    renderMonthPick();
    el("favsOnlyLbl").textContent = t.favsOnly;
    el("rareOnlyLbl").textContent = t.rareOnly + " ✦";
    /* No free entry is a connoisseur's one, so locked the filter could only
       ever empty the grid. */
    el("rareOnly").closest(".check").hidden = LOCKED;
    el("luxeOnlyLbl").textContent = t.luxeOnly + " ◆";
    var signs = [];
    BASE.forEach(function (i) {
      if (i.sign && signs.indexOf(i.sign) === -1) signs.push(i.sign);
    });
    signs.sort();
    el("signOnlyLbl").textContent = t.signOnly + (signs.length ? " (" + signs.join(", ") + ")" : "");
    el("random").textContent = t.random;
    el("labTitle").textContent = t.labTitle;
    el("labHint").textContent = t.labHint;
    el("triosTitle").textContent = t.triosTitle;
    el("footNote").textContent = t.footNote + " · " + t.alcoholWarning;
    el("contactLine").textContent = t.contactLine + " · " + t.replyTime;
    el("aboutLink").textContent = t.aboutLink;
    el("privacyLink").textContent = t.privacyLink;
    el("legalLink").textContent = t.legalLink;
    el("legalLink").href = "confidentialite/#" + t.legalAnchor;
    el("cgvLink").textContent = t.cgvLink;
    el("cancelLink").textContent = t.cancelLink;
    el("withdrawLink").textContent = t.withdrawLink;
    el("nokimeLink").textContent = t.nokimeLink;
    el("disclaimer").textContent = t.disclaimer;
    el("createBtn").textContent = "+ " + t.create;
    el("tabAtlas").textContent = t.tabAtlas;
    el("tabTech").textContent = t.tabTech;
    el("tabSub").textContent = t.tabSub;
    el("tabSub").hidden = !LOCKED;
    el("tabComponents").textContent = t.tabComponents;
    /* A paid tab carries a lock, and says so to assistive tech. */
    [["tabChefs", t.tabChefs], ["tabBases", t.tabBases], ["tabLab", t.tabLab]].forEach(function (p) {
      var b = el(p[0]);
      b.innerHTML = esc(p[1]) + (LOCKED ? LOCK_ICON : "");
      if (LOCKED) {
        b.setAttribute("aria-label", p[1] + " — " + t.lockedTag);
        b.setAttribute("aria-controls", "lockedView");
      }
    });
    paintSeg("viewTabs");
    /* a tab with nothing behind it reads as broken — hide it until it has data.
       A locked tab has its panel whatever data is loaded. */
    el("tabTech").hidden = TECHNIQUES.length === 0;
    el("tabBases").hidden = !LOCKED && BASES.length === 0;
    /* Open to everyone: locked, the list is the teaser's names and summaries. */
    el("tabComponents").hidden = compRows().length === 0;
    el("creationsTitle").textContent = t.myCreations;
    el("creationsHint").textContent = t.myCreationsHint;
    el("lang-en").classList.toggle("active", state.lang === "en");
    el("lang-fr").classList.toggle("active", state.lang === "fr");
    paintSeg("langToggle");
    /* An ended session says "sign in again", so its line opens the form. The
       note ends on the way to the subscription tab. */
    var note = SESSION_NOTE[SESSION];
    el("tierNote").innerHTML = LOCKED
      ? (note ? (SESSION === "ended"
          ? '<button type="button" class="linkish tier-state" data-full>' + esc(t[note]) + "</button> "
          : '<strong class="tier-state">' + esc(t[note]) + "</strong> ") : "") +
        esc((PAYMENTS_LIVE ? t.tierNoteLive : t.tierNote).replace("{n}", fmt(LK.counts.free))) +
        ' <button type="button" class="linkish tier-more" data-sub>' + esc(t.fullMore) + "</button>" : "";
    el("accountWrap").hidden = !hasMark();
    el("accountLink").textContent = t.accountLink;
    var t2 = t;
    fillSel("priceBand", [["all", t2.fAllPrices], ["1", t2.p1], ["2", t2.p2], ["3", t2.p3], ["4", t2.p4]], state.priceBand);
    /* Built from the tags that exist rather than a hand-kept list, so a new
       flavour on an entry appears here by itself. */
    var flavourOpts = Object.keys(ING.reduce(function (m, x) {
      x.flavor.forEach(function (f) { m[f] = 1; }); return m;
    }, {})).map(function (f) { return [f, t2.flavors[f] || f]; })
      .sort(function (a, b) { return a[1].localeCompare(b[1], state.lang); });
    fillSel("flavour", [["all", t2.fAllFlavours]].concat(flavourOpts), state.flavour);
    var sort = el("sort");
    sort.innerHTML = '<option value="name">' + esc(t.sortName) + '</option><option value="family">' + esc(t.sortFamily) + "</option>";
    sort.value = state.sort;
  }

  /* The stats line answers the question of the moment: the whole atlas when
     nothing narrows it, "312 of 1,852" as soon as a search or filter does. */
  function fmt(n) { return n.toLocaleString(state.lang === "fr" ? "fr-FR" : "en-GB"); }
  function renderStats(shown) {
    var t = T(), s = state;
    var narrowed = s.cat !== "all" || s.q.trim() || s.months.length || s.favsOnly || s.rareOnly ||
      s.luxeOnly || s.signOnly || s.priceBand !== "all" || s.flavour !== "all";
    el("stats").textContent = narrowed
      ? t.statsFiltered.replace("{n}", fmt(shown)).replace("{t}", fmt(ING.length))
      /* The free version has no pairings, and "0 recorded pairings" reads as a
         broken site rather than as a version. It says what the full one adds. */
      : (LOCKED ? t.statsTplFree : t.statsTpl)
          .replace("{n}", fmt(ING.length))
          .replace("{f}", CAT_ORDER.filter(function (c) { return ING.some(function (i) { return i.cat === c; }); }).length)
          .replace("{p}", fmt(LOCKED ? LK.counts.paid : EDGE_COUNT));
  }

  /* ---------- category chips ---------- */
  function renderCats() {
    var t = T(), html = "";
    html += chip("all", t.all);
    var pop = {};
    ING.forEach(function (i) { pop[i.cat] = 1; });
    CAT_ORDER.forEach(function (c) { if (pop[c]) html += chip(c, t.categories[c]); });
    el("cats").innerHTML = html;
    function chip(v, label) {
      var on = state.cat === v;
      return '<button type="button" class="chip' + (on ? " active" : "") + '" data-cat="' + v + '" aria-pressed="' + on + '">' + esc(label) + "</button>";
    }
  }

  /* ---------- grid ---------- */
  function filtered() {
    var q = norm(state.q.trim()), t = T();
    return ING.filter(function (i) {
      /* A standing query searches the whole atlas. The filters are folded away
         while it stands (see onSearch), and a filter nobody can see must not
         narrow what the reader gets. They apply again once the box is empty. */
      if (!q) {
        if (state.cat !== "all" && i.cat !== state.cat) return false;
        if (state.months.length && !inPickedMonths(i)) return false;
        if (state.favsOnly && !favs.has(i.id)) return false;
        if (state.rareOnly && !i.rare) return false;
        if (state.luxeOnly && !i.luxe) return false;
        if (state.signOnly && !i.sign) return false;
        if (state.priceBand !== "all" && (i.price || 2) !== +state.priceBand) return false;
        if (state.flavour !== "all" && i.flavor.indexOf(state.flavour) === -1) return false;
        return true;
      }
      /* Names only: the latin name used to be searchable, so "rosa" returned
         nine unrelated entries. Family and flavour still match, because the
         placeholder offers them. */
      var hay = norm(i.name.en + " " + i.name.fr + " " + catLabel(i.cat) + " " +
        i.flavor.map(function (f) { return t.flavors[f]; }).join(" "));
      return hay.indexOf(q) !== -1;
    }).sort(function (a, b) {
      // With a query, a name match outranks a match on family or flavour —
      // otherwise searching "oeuf" buries Œuf under every "Laitages & œufs" entry.
      if (q) {
        var ra = matchRank(a, q), rb = matchRank(b, q);
        if (ra !== rb) return ra - rb;
      }
      if (state.sort === "family" && a.cat !== b.cat) {
        return CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat);
      }
      return name(a).localeCompare(name(b), state.lang, CMP);
    });
  }


    /* Same plant or animal. Derived from the latin binomial rather than stored,
       so it needs no upkeep and covers every cluster at once: the parenthetical
       in "Coregonus albula (roe)" names the part, not a different species.
       Only a real binomial keys \u2014 capitalised ASCII genus, lowercase ASCII
       species (hyphens allowed: "uva-crispa"), an optional \u00d7 between, and
       nothing but a space, a comma, a parenthesis or the end after it \u2014 so
       "B\u0153uf \u2014 cuisse", "Lait ferment\u00e9" and "Halite (NaCl)" get no group rather
       than a bogus one, and "Musa spp." names a genus, not a species. A cheese or a
       ham carries its protected name in this slot ("Brie de Meaux AOP"), and no
       epithet is a Romance preposition; pharmacopoeia Latin for a mineral or a
       chemical ("Natrii chloridum", "Acetum vini", "Calcium lactate") names no
       organism. Neither groups. */
    function kinKey(lat) {
      if (!lat) return null;
      var m = lat.replace(/\u00d7(?=\S)/g, "\u00d7 ").match(/^([A-Z][a-z]+) (?:\u00d7 )?([a-z]+(?:-[a-z]+)?)(?=$|[\s(,])/);
      if (!m || /^(spp|var|subsp|cv|de|des|du|di|del|della)$/.test(m[2]) || /^(Natrii|Acetum|Calcium)$/.test(m[1])) return null;
      return (m[1] + " " + m[2]).toLowerCase();
    }

    var KIN = (function () {
      var m = {};
      ING.forEach(function (i) {
        var k = kinKey(i.latin);
        if (!k) return;
        (m[k] = m[k] || []).push(i.id);
      });
      return m;
    })();


    /* The plant or animal itself (its varieties, cuts, parts, dried or milled
       forms) comes first; what is made from it (sauces, wines, oils, cheeses,
       sugars, additives) is listed apart, so tofu's species reads as the bean
       and its forms, with the soy sauces and the lecithin below them. */
    var KIN_SHOWN = 12;
    /* By family, and an entry's own kin:"form" or kin:"made" where its family
       misleads: cacao beans filed with chocolate, noodles with their flour. A
       form is the thing itself, whole, cut, dried, cured, smoked or milled. */
    var MADE_CATS = ["condiments", "texture", "sweet", "cellar", "fats", "infusions", "dairy"];
    function isMade(x) { return x.kin ? x.kin === "made" : MADE_CATS.indexOf(x.cat) !== -1; }
    function kinRow(ids) {
      var t = T();
      var sorted = ids.slice().sort(function (a, b) {
        return name(byId[a]).localeCompare(name(byId[b]), state.lang);
      });
      var shown = sorted.slice(0, KIN_SHOWN);
      var more = sorted.length - shown.length;
      return '<div class="chip-row">' + shown.map(function (x) {
          return '<button type="button" class="chip-link" data-open="' + esc(x) + '">' +
            art(byId[x]) + "<span>" + esc(name(byId[x])) + "</span></button>";
        }).join("") + "</div>" +
        (more ? '<p class="kin-more">' + esc(t.andMore.replace("{n}", more)) + "</p>" : "");
    }
    function kinBlock(i) {
      var k = kinOf(i);
      /* Locked, the same species past the free cut is a count, not a list. */
      var paid = LOCKED && !i.custom ? (LK.kin[i.id] || 0) : 0;
      if (!k.length && !paid) return "";
      var t = T();
      var made = k.filter(function (x) { return isMade(byId[x]); });
      var forms = k.filter(function (x) { return made.indexOf(x) === -1; });
      return "<h3>" + esc(t.sameSpecies) + (k.length ? ' <span class="kin-n">' + k.length + "</span>" : "") + "</h3>" +
        '<p class="kin-latin">' + esc(i.latin) + "</p>" +
        (forms.length ? kinRow(forms) : "") +
        (made.length && forms.length ? '<p class="kin-sub">' + esc(t.madeFromIt) + ' <span class="kin-n">' + made.length + "</span></p>" : "") +
        (made.length ? kinRow(made) : "") +
        (paid ? '<button type="button" class="kin-locked" data-full>' + LOCK_ICON +
          esc(t.lockedKin.replace("{n}", paid)) + "</button>" : "");
    }

    function kinOf(i) {
      var k = kinKey(i.latin);
      if (!k || !KIN[k]) return [];
      return KIN[k].filter(function (x) { return x !== i.id && byId[x]; });
    }

  function matchRank(i, q) {
    var n = norm(name(i));
    if (n.indexOf(q) === 0) return 0;                                  // name starts with it
    if (n.indexOf(q) !== -1) return 1;                                 // name contains it
    if (norm(i.name.en + " " + i.name.fr).indexOf(q) !== -1) return 2; // the other language
    return 3;                                                          // family or flavour only
  }

  /* ---------- the free version's edge ----------
     Paid names are searched as the grid is — the same folding, both languages —
     and listed under the free results, greyed and capped. With no query, the
     grid ends on how many the full version adds, in the family on screen. */
  var LOCKED_SHOWN = 12;
  function lockedName(x) { return state.lang === "fr" ? x[2] : x[1]; }
  function lockedHits(q) {
    if (!q) return [];
    /* The family is public in the teaser, so a family search ("légumes") also
       says how many more the full version holds; name matches come first. */
    return LK.items.filter(function (x) { return norm(x[1] + " " + x[2] + " " + catLabel(x[3])).indexOf(q) !== -1; })
      .map(function (x) {
        var here = norm(lockedName(x)), there = norm(state.lang === "fr" ? x[1] : x[2]);
        return { x: x, r: here.indexOf(q) === 0 ? 0 : there.indexOf(q) === 0 ? 1 : here.indexOf(q) !== -1 ? 2 :
          there.indexOf(q) !== -1 ? 3 : 4 };
      })
      .sort(function (a, b) {
        return a.r - b.r || lockedName(a.x).localeCompare(lockedName(b.x), state.lang, CMP);
      })
      .map(function (h) { return h.x; });
  }
  function paidFavCount() {
    var n = 0;
    favs.forEach(function (id) { if (PAID[id] && (state.cat === "all" || PAID[id][3] === state.cat)) n++; });
    return n;
  }
  /* Returns how many paid names the query found, for the empty line. */
  function renderLockedEnd() {
    var box = el("lockedEnd");
    if (!LOCKED) { box.hidden = true; box.innerHTML = ""; return 0; }
    var t = T(), q = norm(state.q.trim()), html = "", hits = lockedHits(q);
    if (q) {
      if (hits.length) {
        html = '<h2 class="locked-h">' + LOCK_ICON + esc(t.lockedHits) +
          ' <span class="kin-n">' + fmt(hits.length) + "</span></h2>" +
          '<div class="locked-rows">' + hits.slice(0, LOCKED_SHOWN).map(function (x) {
            return '<button type="button" class="locked-row" data-locked="' + esc(x[0]) + '">' +
              LOCK_ICON + '<span class="lr-name">' + esc(lockedName(x)) + "</span>" +
              '<span class="lr-cat">' + esc(catLabel(x[3])) + "</span></button>";
          }).join("") + "</div>" +
          (hits.length > LOCKED_SHOWN
            ? '<button type="button" class="linkish locked-more" data-full>' +
                esc(t.lockedHitsMore.replace("{n}", fmt(hits.length - LOCKED_SHOWN))) + "</button>"
            : "");
      }
    } else {
      var pf = state.favsOnly ? paidFavCount() : 0;
      if (pf) {
        html += '<p class="locked-favs">' +
          esc(pf === 1 ? t.lockedFavsOne : t.lockedFavs.replace("{n}", fmt(pf))) + "</p>";
      }
      /* A count under any other filter would read as that many more matches:
         the teaser does not know which paid entries are in season or prestige. */
      var narrowed = state.months.length || state.favsOnly || state.rareOnly || state.luxeOnly ||
        state.signOnly || state.priceBand !== "all" || state.flavour !== "all";
      var n = narrowed ? 0 : state.cat === "all" ? LK.counts.paid : (LK.familyPaid[state.cat] || 0);
      if (n) {
        html += '<button type="button" class="locked-line" data-full>' + LOCK_ICON +
          esc(state.cat === "all" ? t.lockedGrid.replace("{n}", fmt(n))
            : t.lockedGridCat.replace("{family}", catLabel(state.cat)).replace("{n}", fmt(n))) + "</button>";
      }
    }
    box.innerHTML = html;
    box.hidden = !html;
    return hits.length;
  }

  function renderGrid() {
    var t = T(), list = filtered();
    var paidHits = renderLockedEnd();
    el("empty").hidden = list.length > 0;
    el("empty").textContent = paidHits ? t.emptyFree : t.empty;
    renderStats(list.length);
    /* The star is a sibling of the keyboard target, not a child: a button
       inside a role=button is one control to assistive tech. The whole card
       still opens on click through the grid's delegated handler. */
    el("grid").innerHTML = list.map(function (i) {
      var seasonDot = (i.season.length > 0 && inSeasonNow(i)) ? '<span class="in-season" title="' + esc(t.inSeasonNow) + '"></span>' : "";
      return '<article class="card" data-id="' + i.id + '">' +
        seasonDot +
        (i.custom ? '<span class="creation-tag">' + esc(t.creationLabel) + "</span>" : "") +
        '<button type="button" class="fav' + (favs.has(i.id) ? " on" : "") + '" data-fav="' + i.id +
          '" title="' + esc(favs.has(i.id) ? t.favRemove : t.favAdd) + '" aria-label="' + esc(favs.has(i.id) ? t.favRemove : t.favAdd) + '">&#9733;</button>' +
        '<div class="card-main" tabindex="0" role="button">' +
        '<div class="card-art">' + art(i) + "</div>" +
        "<h3>" + esc(name(i)) + signMark(i) + (i.rare ? ' <span class="rare-mark" title="' + esc(t.rareMark) + '">✦</span>' : "") + (i.luxe ? ' <span class="luxe-mark" title="' + esc(t.luxeMark) + '">◆</span>' : "") + (i.coeur ? ' <span class="coeur-mark" title="' + esc(t.coeurMark) + '">♥</span>' : "") + "</h3>" +
        '<p class="latin">' + esc(i.custom ? t.creationLabel : i.latin) + "</p>" +
        '<p class="cat-line">' + esc(catLabel(i.cat)) + "</p>" +
        '<p class="price-line"><span class="price-band" title="' + esc(T().priceLabel) + '">' +
          "\u20ac".repeat(i.price || 2) + "</span></p>" +
        '<div class="tags">' + i.flavor.slice(0, 3).map(function (f) {
          return '<span class="tag">' + esc(t.flavors[f]) + "</span>";
        }).join("") + "</div>" +
        evinNote(i, "card") +
        "</div></article>";
    }).join("");
  }

  /* ---------- ingredient of the day ---------- */
  /* Full-cycle rotation. Consecutive days step by a stride coprime to the list
     length, so every ingredient shows exactly once before any repeat, and
     neighbours in the data files never land on consecutive days. The old
     version added 1 to the index each day, which walked the files in order and
     served twelve spices in a row. Over the loaded entries only, so a locked
     visitor is never handed a paid one. */
  function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }
  function dailyIngredient() {
    var d = new Date(), n = BASE.length;
    if (!n) return null;
    var day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    var k = Math.round(n * 0.6180339887);
    while (k > 1 && gcd(k, n) !== 1) k--;
    return BASE[((day % n) * k) % n];
  }
  function renderDaily() {
    var t = T(), i = dailyIngredient();
    if (!i) { el("daily").hidden = true; return; }
    el("daily").innerHTML =
      '<div class="d-art">' + art(i) + "</div>" +
      "<div>" +
      '<p class="d-label">' + esc(t.daily) + "</p>" +
      "<h2>" + esc(name(i)) + "</h2>" +
      '<p class="d-latin">' + esc(i.latin) + " · " + esc(catLabel(i.cat)) + "</p>" +
      '<p class="d-story">' + esc(i.story[state.lang].split(". ")[0]) + ".</p>" +
      "</div>";
    el("daily").onclick = function () { openModal(i.id); };
  }

  /* ---------- modal ---------- */
  function seasonDots(i) {
    var t = T();
    if (i.season.length === 0) return '<span>' + esc(t.season) + " — " + esc(t.allYear) + "</span>";
    var dots = t.monthsShort.map(function (m, idx) {
      var on = i.season.indexOf(idx + 1) !== -1;
      return '<span class="dot' + (on ? " on" : "") + '" title="' + esc(t.months[idx]) + '">' + m + "</span>";
    }).join("");
    return "<span>" + esc(t.season) + '</span><span class="dots">' + dots + "</span>";
  }

  /* Butter is paired by 479 entries, garlic by 413. Rendering all of them buried
     the rest of the card under a wall of chips — 347 entries (19%) had more than
     ten. Show ten, keep the rest in the DOM but hidden so the reveal costs no
     re-render and the chips stay findable by the browser's own page search. */
  var PAIR_SHOWN = 10;

  function pairBlock(list) {
    if (list.length <= PAIR_SHOWN) {
      return '<div class="pair-grid">' + list.map(pairChip).join("") + "</div>";
    }
    return '<div class="pair-grid">' + list.slice(0, PAIR_SHOWN).map(pairChip).join("") +
      '</div><div class="pair-grid pair-rest" hidden>' +
      list.slice(PAIR_SHOWN).map(pairChip).join("") + "</div>" +
      '<button type="button" class="linkish pair-more" data-morepairs>' +
      esc(T().morePairs.replace("%d", list.length)) + "</button>";
  }

  /* loi Evin, CSP art. L3323-4: a communication naming an alcoholic drink carries
     the health message, whatever its purpose — Cass. crim. 3 nov. 2004 defines the
     offence by effect, so "it is educational" is not a defence. The cellar family
     IS the drinks cabinet, so it carries the mention by default and the exceptions
     are listed; a vinegar given one it does not need is the harmless direction to
     be wrong in. tools/build-pages.py reads these two sets out of this file, so
     this is their only home in the app. */
  var NOT_A_DRINK = ["champagne-vinegar", "raspberry-vinegar", "shanxi-vinegar",
                     "verjus-rouge", "vincotto", "grape-must"];
  var DRINKS_ELSEWHERE = ["shaoxing-wine", "hon-mirin"];

  function isAlcohol(i) {
    return (i.cat === "cellar" && NOT_A_DRINK.indexOf(i.id) === -1) ||
           DRINKS_ELSEWHERE.indexOf(i.id) !== -1;
  }

  function evinNote(i, place) {
    if (!isAlcohol(i)) return "";
    var cls = place === "card" ? "alcohol-warn alcohol-warn-sm" : "alcohol-warn";
    return '<p class="' + cls + '">' + esc(T().alcoholWarning) + "</p>";
  }

  /* Protected designation. Card and modal header only — never a chip: butter alone
     renders 479 of them and a grid speckled red and blue is unreadable. */
  function signMark(i) {
    if (!i.sign) return "";
    /* Geographical indications read blue; origin appellations read red. */
    var igp = i.sign === "IGP" || i.sign === "PGI" || i.sign === "IG";
    return ' <span class="sign sign-' + (igp ? "igp" : "aop") + '">' + esc(i.sign) + "</span>";
  }

  function pairChip(id) {
    var i = byId[id];
    return '<button type="button" class="pair-chip" data-open="' + id + '">' + art(i) + "<span>" + esc(name(i)) + "</span></button>";
  }

  /* A trio whose ingredients are not all loaded is not shown at all. */
  function trioKnown(tr) { return tr.ids.every(function (x) { return byId[x]; }); }
  function triosOf(id) {
    return TRIOS.filter(function (tr) { return tr.ids.indexOf(id) !== -1 && trioKnown(tr); });
  }

  /* ---------- work trees: an ingredient and its preparations ---------- */
  var TREES = window.TREES || [];
  var treeById = {};
  TREES.forEach(function (t) { treeById[t.id] = t; });
  var treeSel = null;

  // One drawn glyph per preparation, in a 40x40 box, same stroke idiom as the entry art.
  // Keyed by technique, not by ingredient — confit looks the same everywhere,
  // which is part of what the trees teach. Branches name one via `art`.
  var BRANCH_ART = {
    generic:   '<circle class="tl" cx="20" cy="20" r="11"/>',
    raw:       '<path class="tl" d="M20 6v28"/><path class="tl" d="M20 16q-10-8-13 0 5 9 13 3zM20 25q10-8 13 0-5 9-13 3z"/>',
    puree:     '<path class="tl" d="M8 30q3-14 12-14t12 14"/><path class="tl" d="M14 30q2-8 6-8t6 8"/><path class="tl" d="M20 15v-6"/>',
    roasted:   '<path class="tl" d="M9 24l7-12 7 5 8-3-4 14z"/><path class="tl" d="M16 12l-3 12M23 17l-2 11"/>',
    confit:    '<path class="tl" d="M8 16h24v10a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8z"/><path class="tl" d="M6 16h28"/><ellipse class="tl" cx="20" cy="25" rx="6" ry="4"/>',
    gratin:    '<path class="tl" d="M7 27h26a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6z"/><path class="tl" d="M9 22q11-5 22 0M10 17q10-5 20 0M12 12q8-4 16 0"/>',
    dumpling:  '<ellipse class="tl" cx="13" cy="17" rx="7" ry="5"/><ellipse class="tl" cx="27" cy="21" rx="7" ry="5"/><ellipse class="tl" cx="18" cy="29" rx="7" ry="5"/><path class="tl" d="M10 17h6M24 21h6M15 29h6"/>',
    chips:     '<path class="tl" d="M11 33l5-24 4 1-4 24zM18 33l4-25 4 1-3 25zM25 32l4-23 4 1-4 23z"/>',
    sweated:   '<path class="tl" d="M8 22h24v6a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z"/><path class="tl" d="M14 17q2-5 0-8M20 16q2-6 0-9M26 17q2-5 0-8"/>',
    caramel:   '<path class="tl" d="M8 20h24v8a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z"/><path class="tl" d="M12 26q4 4 8 0t8 0"/><path class="tl" d="M20 15V8M14 16l-3-6M26 16l3-6"/>',
    grilled:   '<ellipse class="tl" cx="20" cy="20" rx="13" ry="10"/><path class="tl" d="M10 15l16 4M9 22l18 4M13 28l14 3"/>',
    fried:     '<path class="tl" d="M6 20h20a8 8 0 0 1 0 12H6z"/><path class="tl" d="M26 26h9"/><path class="tl" d="M10 16q2-5 0-8M17 16q2-5 0-8"/>',
    braised:   '<path class="tl" d="M9 18h22v10a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7z"/><path class="tl" d="M7 18h26M20 13v-5"/><path class="tl" d="M13 26q7 4 14 0"/>',
    stock:     '<path class="tl" d="M10 16h20v12a7 7 0 0 1-7 7h-6a7 7 0 0 1-7-7z"/><path class="tl" d="M8 16h24"/><path class="tl" d="M14 11q2-4 0-6M20 10q2-4 0-6M26 11q2-4 0-6"/>',
    emulsion:  '<path class="tl" d="M20 6v9"/><path class="tl" d="M14 15q6 12 12 0"/><path class="tl" d="M17 15q3 14 6 0M20 15v15"/><path class="tl" d="M9 30h22"/>',
    whipped:   '<path class="tl" d="M9 32h22"/><path class="tl" d="M11 32q1-9 4-12t5 3 5-4 4 13"/><path class="tl" d="M20 20V8"/>',
    custard:   '<ellipse class="tl" cx="14" cy="16" rx="7" ry="9"/><path class="tl" d="M18 23l12 12"/><path class="tl" d="M8 30q6 4 12 0"/>',
    meringue:  '<path class="tl" d="M9 32h22"/><path class="tl" d="M11 32q1-9 4-12t5 3 5-4 4 13"/><path class="tl" d="M20 20V8"/><path class="tl" d="M17 11q3-4 6 0"/>',
    reduced:   '<path class="tl" d="M11 12h18l-4 20a5 5 0 0 1-5 4h-0a5 5 0 0 1-5-4z"/><path class="tl" d="M13 24q7 4 14 0"/>',
    sauce:     '<path class="tl" d="M8 26q6-6 12 0t12 0"/><path class="tl" d="M8 31q6-6 12 0t12 0"/><path class="tl" d="M20 20V9M16 12l4-4 4 4"/>',
    pickled:   '<path class="tl" d="M13 13h14v18a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4z"/><path class="tl" d="M11 13h18M17 13V9h6v4"/><path class="tl" d="M15 22h10M15 27h10"/>',
    dried:     '<path class="tl" d="M20 8v24"/><path class="tl" d="M20 15q-9-5-11 2 6 6 11 1zM20 24q9-5 11 2-6 6-11 1z"/><path class="tl" d="M14 35h12"/>',
    smoked:    '<path class="tl" d="M8 30h24v4H8z"/><path class="tl" d="M13 26q-4-5 0-9t0-8M20 26q-4-5 0-9t0-8M27 26q-4-5 0-9t0-8"/>',
    cured:     '<path class="tl" d="M10 24q10-12 20 0-10 10-20 0z"/><path class="tl" d="M20 18v12"/><circle class="tl" cx="14" cy="12" r="1.6"/><circle class="tl" cx="22" cy="9" r="1.6"/><circle class="tl" cx="29" cy="13" r="1.6"/>',
    baked:     '<path class="tl" d="M7 28h26l-3 6H10z"/><path class="tl" d="M10 28q3-13 10-13t10 13"/><path class="tl" d="M15 21q5-3 10 0"/>',
    compote:   '<path class="tl" d="M11 18h18v11a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6z"/><path class="tl" d="M9 18h22"/><circle class="tl" cx="16" cy="25" r="3"/><circle class="tl" cx="24" cy="27" r="3"/>',
    tempered:  '<path class="tl" d="M8 14h24v6H8zM8 22h24v6H8z"/><path class="tl" d="M16 14v14M24 14v14"/>',
    ganache:   '<path class="tl" d="M9 22q11-8 22 0v6a6 6 0 0 1-6 6H15a6 6 0 0 1-6-6z"/><path class="tl" d="M9 22q4 5 8 0t8 0 6 0"/>',
    chopped:   '<path class="tl" d="M8 30h24"/><circle class="tl" cx="14" cy="25" r="2.4"/><circle class="tl" cx="21" cy="27" r="2.4"/><circle class="tl" cx="27" cy="24" r="2.4"/><circle class="tl" cx="18" cy="21" r="2.4"/><path class="tl" d="M28 8l-9 11"/>',
    clarified: '<path class="tl" d="M13 10h14l-2 14H15z"/><path class="tl" d="M15 24h10l1 8a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z"/><path class="tl" d="M11 10h18"/>',
    noisette:  '<path class="tl" d="M7 22h20a7 7 0 0 1 0 12H7z"/><path class="tl" d="M27 28h8"/><circle class="tl" cx="13" cy="28" r="2"/><circle class="tl" cx="20" cy="29" r="2"/><path class="tl" d="M12 16q2-5 0-8"/>',
    coque:     '<ellipse class="tl" cx="20" cy="14" rx="7" ry="9"/><path class="tl" d="M12 22h16l-2 10a3 3 0 0 1-3 2h-6a3 3 0 0 1-3-2z"/><path class="tl" d="M10 34h20"/>',
    poached:   '<ellipse class="tl" cx="20" cy="19" rx="11" ry="8"/><circle class="tl" cx="20" cy="19" r="4"/><path class="tl" d="M6 31q4-3 7 0t7 0 7 0 7 0"/>',
    scrambled: '<path class="tl" d="M8 28q2-7 7-7t6 5 7-6 5 8"/><ellipse class="tl" cx="14" cy="24" rx="4" ry="3"/><ellipse class="tl" cx="25" cy="26" rx="4" ry="3"/><path class="tl" d="M7 32h26"/>',
    omelette:  '<path class="tl" d="M7 26q4-11 13-11t13 11q-6 6-13 6t-13-6z"/><path class="tl" d="M14 17q4 9 3 15M23 16q-3 9-2 15"/>',
    friedegg:  '<path class="tl" d="M8 24q-1-8 6-9t8 3 8-1 4 8-6 8-10-2-10 1 0-8z"/><ellipse class="tl" cx="19" cy="22" rx="5" ry="4.5"/>'
  };


  /* What a locked section says in place of its content, and the way to the
     panel that says what the full version holds. The pairings' box, the wall
     a reel's visitor meets first, also carries the order link and its price. */
  function lockedBox(text, order) {
    var t = T();
    return '<div class="locked-box"><p>' + esc(text) + "</p>" +
      (order ? orderLine(t) : "") +
      '<button type="button" class="linkish" data-full>' + esc(t.fullMore) + "</button></div>";
  }

  /* The order link, then the price under it; before the payments, the price
     and "coming soon". */
  function orderLine(t) {
    return PAYMENTS_LIVE
      ? '<a class="sub-cta locked-cta" href="commande/">' + esc(t.subCta) + ' <span aria-hidden="true">→</span></a>' +
        '<p class="locked-price">' + esc(t.fullPrice) + "</p>"
      : '<p class="locked-price">' + esc(t.fullPrice) + " · " + esc(t.fullSoon) + "</p>";
  }

  function renderTree(ing) {
    if (LOCKED) {
      /* The branches carry pairings: locked, only how many there are. */
      var nb = ing.custom ? 0 : LK.trees[ing.id];
      if (!nb) return "";
      return '<section class="tw" id="treeSec"><h3 class="tw-title" id="treeTitle">' +
        esc(T().preparations) + LOCK_ICON + "</h3>" +
        lockedBox(T().lockedTree.replace("{n}", nb)) + "</section>";
    }
    var tr = treeById[ing.id];
    if (!tr) return "";
    var t = T(), n = tr.branches.length;
    var has = tr.branches.some(function (b) { return b.id === treeSel; });
    if (!has) treeSel = tr.branches[0].id;
    var sel = tr.branches.filter(function (b) { return b.id === treeSel; })[0];

    // widen the orbit as branches are added so labels never collide
    var CX = 230, CY = 188, R = 118 + Math.max(0, n - 6) * 9, NR = n > 6 ? 27 : 30,
        CR = 46, nodes = "", links = "";
    tr.branches.forEach(function (b, k) {
      var a = (-90 + k * (360 / n)) * Math.PI / 180;
      var ux = Math.cos(a), uy = Math.sin(a);
      var x = CX + R * ux, y = CY + R * uy;
      var sx = CX + CR * ux, sy = CY + CR * uy;
      var ex = x - NR * ux, ey = y - NR * uy;
      var mx = (sx + ex) / 2 - uy * 12, my = (sy + ey) / 2 + ux * 12;   // gentle bow
      var on = b.id === treeSel;
      links += '<path class="tw-link' + (on ? " on" : "") + '" d="M' + sx.toFixed(1) + ' ' + sy.toFixed(1) +
               'Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1) + '"/>';
      nodes += '<g class="tw-node' + (on ? " on" : "") + '" data-branch="' + b.id + '" tabindex="0" role="button" ' +
               'aria-pressed="' + on + '" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')">' +
               '<circle class="tw-disc" r="' + NR + '"/>' +
               '<g transform="translate(-20 -20)">' + (BRANCH_ART[b.art || b.id] || BRANCH_ART.generic) + "</g>" +
               '<text class="tw-lbl" y="' + (NR + 17) + '">' + esc(b.name[state.lang]) + "</text></g>";
    });

    // role=group, not img: an image's children are presentational, and the
    // branch nodes are buttons.
    var svg = '<svg class="tw-svg" viewBox="0 0 460 404" role="group" aria-labelledby="treeTitle">' +
      links +
      '<g class="tw-core"' + famAttr(ing) + '><circle class="tw-core-disc" r="' + CR + '" cx="' + CX + '" cy="' + CY + '"/>' +
      '<g transform="translate(' + (CX - 34) + ' ' + (CY - 34) + ') scale(0.71)">' + (ing.svg || "") + "</g></g>" +
      nodes + "</svg>";

    var panel =
      '<div class="tw-panel">' +
      '<div class="tw-panel-head"><h4>' + esc(sel.name[state.lang]) + "</h4>" +
      '<span class="tw-variety">' + esc(sel.variety[state.lang]) + "</span></div>" +
      "<p>" + esc(sel.technique[state.lang]) + "</p>" +
      '<div class="tw-tips">' + sel.tips.map(function (tp) {
        return "<p>" + esc(tp[state.lang]) + "</p>"; }).join("") + "</div>" +
      '<p class="tw-sub">' + esc(t.pairsInForm) + "</p>" +
      '<div class="pair-grid tw-pairs">' + sel.pairs.filter(function (x) { return byId[x]; }).map(pairChip).join("") + "</div>" +
      "</div>";

    return '<section class="tw" id="treeSec"><h3 class="tw-title" id="treeTitle">' + esc(t.preparations) + "</h3>" +
           '<p class="tw-hint">' + esc(t.preparationsHint) + "</p>" +
           '<div class="tw-stage">' + svg + "</div>" + panel + "</section>";
  }

  /* ---------- chefs: a chronology ---------- */
  var CHEFS = (window.CHEFS || []).slice().sort(function (a, b) { return a.born - b.born; });

  function century(y) {
    var c = Math.floor((y - 1) / 100) + 1;
    return state.lang === "fr" ? c + "e siècle" : c + (c % 10 === 1 && c !== 11 ? "st" : c % 10 === 2 && c !== 12 ? "nd" : c % 10 === 3 && c !== 13 ? "rd" : "th") + " c.";
  }

  function initials(nm) {
    var parts = nm.replace(/,.*$/, "").split(/\s+/).filter(function (w) { return /^[A-ZÉÈÀÂÎÔÛÇ]/.test(w); });
    return (parts[0] || "?").charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "");
  }

  /* Ingredients and techniques are the part a cook is expected to know and the
     part a school can teach from; the bases, the chefs and the lab (PAID_VIEWS,
     above) are the full version. Locked, their tab opens #lockedView, which
     says what is behind it. */
  function viewLocked(v) { return LOCKED && PAID_VIEWS.indexOf(v) !== -1; }

  function renderLockedView(v) {
    var t = T(), c = LK.counts;
    var title = { chefs: t.chefsTitle, bases: t.basesTitle, lab: t.labTitle }[v];
    var body = v === "chefs" ? t.lockedChefs.replace("{n}", fmt(c.chefs)).replace("{d}", fmt(c.dishes))
      : v === "bases" ? t.lockedBases.replace("{n}", fmt(c.bases))
      : t.lockedLab.replace("{p}", fmt(c.pairings)).replace("{t}", fmt(c.trios));
    el("lockedPanel").innerHTML =
      '<p class="locked-kicker">' + LOCK_ICON + esc(t.lockedIn) + "</p>" +
      "<h2>" + esc(title) + "</h2>" +
      '<p class="locked-body">' + esc(body) + "</p>" + orderLine(t) +
      '<button type="button" class="linkish" data-sub>' + esc(t.fullMore) + "</button>";
  }

  function setView(v) {
    /* The offer is for the free version; loaded in full, the atlas instead. */
    if (v === "sub" && !LOCKED) v = "atlas";
    state.view = v;
    var shut = viewLocked(v);
    var views = { atlas: "atlasView", chefs: "chefsView", tech: "techView", bases: "basesView",
                  components: "componentsView", lab: "labView", sub: "subView" };
    var tabs = { atlas: "tabAtlas", chefs: "tabChefs", tech: "tabTech", bases: "tabBases",
                 components: "tabComponents", lab: "tabLab", sub: "tabSub" };
    Object.keys(views).forEach(function (k) {
      el(views[k]).hidden = shut || v !== k;
      el(tabs[k]).classList.toggle("active", v === k);
      el(tabs[k]).setAttribute("aria-selected", v === k);
    });
    el("lockedView").hidden = !shut;
    /* Measured from the active button, which is zero-width while the panel is
       hidden — so the pill can only be placed once the panel is up. */
    paintSeg("viewTabs");
    if (shut) { renderLockedView(v); return; }
    if (v === "lab") { paintSeg("labModes"); paintSeg("plateModes"); }
    if (v === "chefs") renderChefs();
    if (v === "tech") renderTech();
    if (v === "bases") renderBases();
    if (v === "components") renderComponents();
    if (v === "sub") renderSub();
  }

  /* ---------- techniques ---------- */
  var TECH_GROUPS = ["cuisson", "preparation", "liaison", "froid", "patisserie"];
  function groupLabel(g) {
    var t = T();
    return t["g" + g.charAt(0).toUpperCase() + g.slice(1)] || g;
  }
  function renderTech() {
    var t = T();
    el("techTitle").textContent = t.techTitle;
    el("techHint").textContent = t.techHint;
    placeholder("techSearch", t.techSearchPh);
    fillSel("techGroup", [["all", t.fAllGroups]].concat(TECH_GROUPS.map(function (g) {
      return [g, groupLabel(g)];
    })), state.techGroup);
    var q = norm(state.techQ.trim());
    var list = TECHNIQUES.filter(function (x) {
      if (state.techGroup !== "all" && x.group !== state.techGroup) return false;
      if (!q) return true;
      return norm(x.name.en + " " + x.name.fr + " " + x.summary[state.lang]).indexOf(q) !== -1;
    }).sort(function (x, y) {
      return x.name[state.lang].localeCompare(y.name[state.lang], state.lang, CMP);
    });
    el("techCount").textContent = t.techCountTpl.replace("{n}", list.length);
    /* A-Z glossary: the list is already sorted by the displayed name; each entry
       sits under its first letter (accents, case and a leading quote folded, "À la
       nappe" under A), and the rail is built from what is left after the filters. */
    var byLetter = {}, order = [];
    list.forEach(function (x) {
      var L = azLetter(x.name[state.lang]);
      if (!byLetter[L]) { byLetter[L] = []; order.push(L); }
      byLetter[L].push(x);
    });
    el("techRail").innerHTML = AZ.concat(byLetter["#"] ? ["#"] : []).map(function (L) {
      return byLetter[L] ? '<button type="button" class="az-b" data-az="' + L + '">' + L + "</button>"
                         : '<span class="az-b off" aria-hidden="true">' + L + "</span>";
    }).join("");
    el("techList").innerHTML = order.map(function (L) {
      return '<section class="az-let" id="techaz-' + L + '"><h3 class="az-L">' + L + '</h3><div class="az-ul">' +
        byLetter[L].map(function (x) {
          return '<div class="az-row" id="t-' + esc(x.id) + '" data-tech-card="' + esc(x.id) + '" data-g="' + esc(x.group) +
            '" tabindex="0" role="button"><span class="az-term">' + esc(x.name[state.lang]) + '</span>' +
            '<span class="az-gist">' + esc(x.summary[state.lang]) + '</span>' +
            '<span class="az-grp">' + esc(groupLabel(x.group)) + "</span></div>";
        }).join("") + "</div></section>";
    }).join("");
  }
  var AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  function azLetter(s) {
    var c = norm(s).replace(/^[^a-z0-9]+/, "").charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : "#";
  }

  function renderTechModal(id) {
    var t = T(), x = techById[id];
    if (!x) return;
    /* Techniques are free and the bases are not, so this list is the one door
       between them: without the guard, a free visitor opens a technique, reads
       "used in" and clicks straight through into a paid base. Locked, it says
       how many bases use it instead. */
    var used = LOCKED ? [] :
      BASES.filter(function (d) { return (d.techniques || []).indexOf(id) !== -1; })
        .sort(function (p, q) { return p.name[state.lang].localeCompare(q.name[state.lang], state.lang, CMP); });
    var usedPaid = LOCKED ? (LK.basesUsing[id] || 0) : 0;
    el("modalBody").innerHTML =
      '<div class="bm-head"><p class="tech-group">' + esc(groupLabel(x.group)) + "</p>" +
      '<h2 id="modalTitle">' + esc(x.name[state.lang]) + "</h2>" +
      '<p class="base-era">' + esc(state.lang === "en" ? x.name.fr : x.name.en) + "</p></div>" +
      '<p class="dm-sum">' + esc(x.summary[state.lang]) + "</p>" +
      "<h3>" + esc(t.techHow) + '</h3><p class="tm-body">' + esc(x.how[state.lang]) + "</p>" +
      '<div class="m-note warn"><h3>' + esc(t.techWatch) + "</h3><p>" + esc(x.watch[state.lang]) + "</p></div>" +
      (used.length ? "<h3>" + esc(t.techUsedIn) + '</h3><div class="chip-row">' +
        used.map(function (d) {
          return '<button type="button" class="chip-link" data-baselink="' + esc(d.id) + '">' + esc(d.name[state.lang]) + "</button>";
        }).join("") + "</div>" : "") +
      (usedPaid ? "<h3>" + esc(t.techUsedIn) + LOCK_ICON + '</h3><div class="chip-row">' +
        '<button type="button" class="chip-link chip-locked" data-full>' + LOCK_ICON +
        esc(usedPaid === 1 ? t.lockedBasesUsingOne : t.lockedBasesUsing.replace("{n}", usedPaid)) +
        "</button></div>" : "");
  }
  function openTech(id) { openItem("tech", id); }

  /* ---------- bases ---------- */
  var BASE_ORDER = ["fonds","sauces","liaisons","emulsions","aigredoux","salaisons","sucre"];
    function renderBases() {
      var t = T();
      el("basesTitle").textContent = t.basesTitle;
      el("basesHint").textContent = t.basesHint;
      placeholder("baseSearch", t.baseSearchPh);
      var groups = [];
      BASES.forEach(function (d) { if (groups.indexOf(d.group) === -1) groups.push(d.group); });
      groups.sort(function (a, b) { return BASE_ORDER.indexOf(a) - BASE_ORDER.indexOf(b); });
      fillSel("baseGroup", [["all", t.fAllGroups]].concat(groups.map(function (r) {
        return [r, t.baseGroups[r] || r];
      })), state.baseGroup);
      var q = norm(state.baseQ.trim());
      var list = BASES.filter(function (d) {
        if (state.baseGroup !== "all" && d.group !== state.baseGroup) return false;
        if (!q) return true;
        return norm(d.name.en + " " + d.name.fr + " " + d.ratio[state.lang] + " " +
          d.summary[state.lang]).indexOf(q) !== -1;
      }).sort(function (a, b) {
        if (a.group !== b.group) return BASE_ORDER.indexOf(a.group) - BASE_ORDER.indexOf(b.group);
        return a.name[state.lang].localeCompare(b.name[state.lang], state.lang);
      });
      el("baseCount").textContent = t.baseCountTpl.replace("{n}", list.length);
      /* Ratio ledger: one ruled header per family with its count, then a row per
         base. The list is already in family order. */
      el("baseList").innerHTML = groups.map(function (g) {
        var rows = list.filter(function (d) { return d.group === g; });
        if (!rows.length) return "";
        return '<section class="lg-grp"><div class="lg-gh"><h3>' + esc(t.baseGroups[g] || g) + "</h3><span>" +
          rows.length + "</span></div>" + rows.map(function (d) {
            return '<div class="lg-row" data-base="' + esc(d.id) + '" tabindex="0" role="button">' +
              '<h4 class="lg-name">' + esc(d.name[state.lang]) + "</h4>" + ratioHtml(d.ratio[state.lang]) + "</div>";
          }).join("") + "</section>";
      }).join("");
    }

  /* A ratio is shown as a formula only when every part of its first sentence is
     a quantity and a label joined by " : "; whatever follows (later sentences,
     the text after " — " or " ; ") becomes the note. Anything else (a list inside
     one term, "+", "ou", a second quantity or a temperature in a label, a time as a
     term, a term without a quantity, fewer than two terms) is shown whole, in
     italics: a plain line beats a half-read formula, and nothing of the string is
     ever left out or altered. Matching runs on a copy whose no-break spaces are
     plain spaces (same length), and every piece shown is cut from the raw string,
     so the French spaces before ":" and ";" stay, and so does a closing period. */
  var RATIO_QTY = /^(?:(Pour|Per|jusqu'à|up to)\s+)?(\d+(?:[.,]\d+)?(?:\s?[–-]\s?\d+(?:[.,]\d+)?|\s+(?:à|to)\s+\d+(?:[.,]\d+)?)?(?:\s?(?:c\. à s\.|c\. à c\.|tbsp|tsp|kg|g|mg|L|dL|cl|ml|%|min|h)(?![\p{L}]))?)(?:\s+(.*))?$/iu;
  var RATIO_BAD_LABEL = /\s[+→=]\s|=|\.\s|\s(?:ou|or)\s|(?:^|[^\p{L}\d])\d/iu;
  function parseRatio(raw) {
    var n = raw.replace(/[  ]/g, " "), rest = [], end = n.length,
        m = n.match(/^(.*?)(?: — |\s?;\s)(.*)$/);
    if (m) { end = m[1].length; rest.push(raw.slice(n.length - m[2].length)); }
    var s = n.slice(0, end);
    m = s.match(/^(.+?\.)\s+(?=[A-ZÀ-ÖØ-ÞŒ])(.*)$/);
    if (m) { rest.unshift(raw.slice(s.length - m[2].length, s.length)); s = m[1]; }
    var terms = [], pos = 0, at;
    do {
      at = s.indexOf(" : ", pos);
      var part = s.slice(pos, at === -1 ? s.length : at), q = part.match(RATIO_QTY);
      if (!q) return null;
      var label = q[3] || "";
      if (RATIO_BAD_LABEL.test(label) || /\d\s?(?:min|h)$/i.test(q[2])) return null;
      terms.push({
        pre: q[1] ? raw.substr(pos, q[1].length) : "",
        qty: raw.substr(pos + part.indexOf(q[2], (q[1] || "").length), q[2].length),
        label: label ? raw.substr(pos + part.length - label.length, label.length) : ""
      });
      pos = at + 3;
    } while (at !== -1);
    if (terms.length < 2) return null;
    return { terms: terms, note: rest.join(" · ") };
  }
  function ratioHtml(raw) {
    var p = parseRatio(raw);
    if (!p) return '<div class="lg-f"><span class="lg-t txt"><span class="lg-q">' + esc(raw) + "</span></span></div>";
    return '<div><div class="lg-f">' + p.terms.map(function (x, i) {
      /* The colon travels with the term after it, so a wrapped line never ends on one. */
      return '<span class="lg-c">' + (i ? '<span class="lg-sep" aria-hidden="true">:</span>' : "") + '<span class="lg-t">' +
        (x.pre ? '<span class="lg-pre">' + esc(x.pre) + "</span>" : "") + '<span class="lg-q">' + esc(x.qty) + "</span>" +
        (x.label ? '<span class="lg-l">' + esc(x.label) + "</span>" : "") + "</span></span>";
    }).join("") + "</div>" + (p.note ? '<p class="lg-note">' + esc(p.note) + "</p>" : "") + "</div>";
  }

  /* ---------- components ----------
     Open to everyone. The free version lists every component's name and summary
     (COPIUS_LOCKED.components) and opens the free three in full (their records
     are in window.COMPONENTS); the full version holds every record. */
  function compRows() {
    if (!LOCKED) {
      return COMPONENTS.map(function (c) {
        return { id: c.id, family: c.family, origin: c.origin.type, name: c.name, summary: c.summary, rec: c };
      });
    }
    return LK.components.map(function (x) {
      return { id: x[0], family: x[1], origin: x[2], name: { en: x[3], fr: x[4] },
               summary: { en: x[5], fr: x[6] }, rec: compById[x[0]] || null };
    });
  }
  function compFamilyLabel(f) { return T().compFamilies[f] || f; }
  function compBadge(origin) {
    return origin === "legendary" ? ' <span class="comp-badge">' + esc(T().compLegendary) + "</span>" : "";
  }
  /* An ingredient of a component: a chip to the ingredient, or in the free version
     the locked chip of a paid one. */
  function compIngChip(id) {
    if (byId[id]) {
      return '<button type="button" class="chip-link" data-open="' + esc(id) + '">' + art(byId[id]) +
        "<span>" + esc(name(byId[id])) + "</span></button>";
    }
    if (LOCKED && PAID[id]) {
      return '<button type="button" class="chip-link chip-locked" data-locked="' + esc(id) + '">' + LOCK_ICON +
        "<span>" + esc(lockedName(PAID[id])) + "</span></button>";
    }
    return "";
  }
  function compIngName(id) {
    return byId[id] ? name(byId[id]) : LOCKED && PAID[id] ? lockedName(PAID[id]) : "";
  }
  /* "500 g", "2 pinches", "1" (a count: the ingredient's name says what). */
  function compQty(q) {
    var u = q.unit;
    if (u === "pc") return fmt(q.qty);
    if (u === "g" || u === "ml") return fmt(q.qty) + " " + u;
    var w = T().compUnits[u] || [u, u];
    var plural = state.lang === "fr" ? q.qty > 1 : q.qty !== 1;
    return fmt(q.qty) + " " + w[plural ? 1 : 0];
  }

  /* A plate: up to four of the component's ingredient drawings on a disc, "+n"
     for the rest. Salt and water are never drawn (unless nothing else is). The
     list carries no chef or restaurant: only the opened component's origin block
     does. The free version's paid components have no record: a lock on the empty
     plate and the summary instead of the ingredients. */
  var PLATE_SKIP = { salt: 1, water: 1 };
  function compCard(r) {
    var t = T(), open = !!r.rec, drawn = "", names = "";
    if (open) {
      var all = r.rec.ingredients.map(function (x) { return x.id; }).filter(compIngName);
      var key = all.filter(function (id) { return !PLATE_SKIP[id]; });
      if (!key.length) key = all;
      var shown = key.slice(0, 4), more = key.length - shown.length;
      names = key.map(function (id) { return esc(compIngName(id)); }).join(" \u00b7 ");
      drawn = '<span class="pl-disc n' + shown.length + '">' +
        shown.map(function (id) { return '<img src="img/' + esc(id) + '.svg" alt="" loading="lazy">'; }).join("") +
        (more > 0 ? '<span class="pl-more">+' + more + "</span>" : "") + "</span>";
    } else {
      drawn = '<span class="pl-disc shut">' + LOCK_ICON + "</span>";
    }
    var chips = (open ? (r.rec.texture || []).slice(0, 2).map(function (x) {
      return '<span class="pl-chip">' + esc(t.textures[x] || x) + "</span>";
    }).join("") : "") + (r.origin === "legendary" ? '<span class="pl-chip leg">' + esc(t.compLegendary) + "</span>" : "");
    return '<article class="pl' + (open ? "" : " pl-shut") + '" ' +
      (open ? 'data-comp="' + esc(r.id) + '"'
            : 'data-full aria-label="' + esc(r.name[state.lang] + " \u2014 " + t.lockedTag) + '"') +
      ' tabindex="0" role="button">' + drawn + "<div>" +
      '<p class="pl-fam">' + esc(compFamilyLabel(r.family)) + "</p>" +
      '<h3 class="pl-name">' + esc(r.name[state.lang]) + "</h3>" +
      (chips ? '<div class="pl-chips">' + chips + "</div>" : "") +
      (open ? '<p class="pl-ings">' + names + "</p>" : '<p class="pl-sum">' + esc(r.summary[state.lang]) + "</p>") +
      "</div></article>";
  }

  function renderComponents() {
    var t = T(), rows = compRows();
    el("componentsTitle").textContent = t.componentsTitle;
    el("componentsHint").textContent = t.componentsHint;
    placeholder("compSearch", t.compSearchPh);
    var fams = COMP_FAMILIES.filter(function (f) { return rows.some(function (r) { return r.family === f; }); });
    if (state.compFamily !== "all" && fams.indexOf(state.compFamily) === -1) state.compFamily = "all";
    fillSel("compFamily", [["all", t.compAllFamilies]].concat(fams.map(function (f) {
      return [f, compFamilyLabel(f)];
    })), state.compFamily);
    fillSel("compOrigin", ["all", "copius", "legendary"].map(function (o) {
      return [o, t.compOrigins[o]];
    }), state.compOrigin);
    var q = norm(state.compQ.trim());
    var list = rows.filter(function (r) {
      if (state.compFamily !== "all" && r.family !== state.compFamily) return false;
      if (state.compOrigin !== "all" && r.origin !== state.compOrigin) return false;
      if (!q) return true;
      var ings = r.rec ? r.rec.ingredients.map(function (x) { return compIngName(x.id); }).join(" ") : "";
      return norm(r.name.en + " " + r.name.fr + " " + r.summary[state.lang] + " " +
        compFamilyLabel(r.family) + " " + ings).indexOf(q) !== -1;
    });
    el("compCount").textContent = list.length === 1 ? t.compCountOne : t.compCountTpl.replace("{n}", list.length);
    list.sort(function (a, b) {
      return fams.indexOf(a.family) - fams.indexOf(b.family) ||
        a.name[state.lang].localeCompare(b.name[state.lang], state.lang, CMP);
    });
    el("componentList").innerHTML = '<div class="pl-grid">' + list.map(compCard).join("") + "</div>" +
      (LOCKED && LK.counts.components
        ? '<button type="button" class="locked-line" data-full>' + LOCK_ICON +
          esc(t.lockedComponents.replace("{n}", fmt(LK.counts.components))) + "</button>" : "");
  }

  function renderCompModal(id) {
    var t = T(), c = compById[id];
    if (!c) return;
    var o = c.origin || {};
    var ings = c.ingredients.map(function (x) {
      var chip = compIngChip(x.id);
      return chip ? '<li><span class="comp-qty">' + esc(compQty(x)) + "</span>" + chip + "</li>" : "";
    }).join("");
    var pairs = (c.pairs || []).map(compIngChip).join("");
    /* The base is paid, and the free version holds no record of it: a locked chip
       that says so, never a name it does not have. */
    var built = !c.base ? "" : LOCKED
      ? '<button type="button" class="chip-link chip-locked" data-full>' + LOCK_ICON +
          esc(t.lockedBasesUsingOne) + "</button>"
      : baseById[c.base]
        ? '<button type="button" class="chip-link" data-baselink="' + esc(c.base) + '">' +
            esc(baseById[c.base].name[state.lang]) + "</button>" : "";
    var tags = (c.texture || []).map(function (x) { return t.textures[x] || x; })
      .concat((c.flavor || []).map(function (x) { return t.flavors[x] || x; }))
      .filter(function (x, i, a) { return a.indexOf(x) === i; });
    var season = Array.isArray(c.season) && c.season.length ? '<div class="m-season">' + seasonDots(c) + "</div>" : "";
    var colon = state.lang === "fr" ? " : " : ": ";
    el("modalBody").innerHTML =
      '<div class="bm-head"><p class="base-meta">' + esc(compFamilyLabel(c.family)) + compBadge(o.type) + "</p>" +
      '<h2 id="modalTitle">' + esc(c.name[state.lang]) + "</h2>" +
      '<p class="base-era">' + esc(c.name[state.lang === "en" ? "fr" : "en"]) + "</p></div>" +
      '<p class="bm-sum">' + esc(c.summary[state.lang]) + "</p>" +
      '<p class="comp-temp">' + esc(t.compTemps[c.temp] || "") + "</p>" + season +
      (ings ? "<h3>" + esc(t.compIngredients) + '</h3><ul class="comp-ings">' + ings + "</ul>" : "") +
      (built ? "<h3>" + esc(t.compBuiltOn) + '</h3><div class="chip-row">' + built + "</div>" : "") +
      "<h3>" + esc(t.compYield) + '</h3><p class="bm-sum">' + esc(c.yield[state.lang]) + "</p>" +
      "<h3>" + esc(t.compMethod) + '</h3><ol class="comp-method">' + c.method.map(function (s) {
        return "<li>" + esc(s[state.lang]) + "</li>";
      }).join("") + "</ol>" +
      '<div class="m-note"><h3>' + esc(t.compKeys) + '</h3><ul class="comp-keys">' + c.keys.map(function (s) {
        return "<li>" + esc(s[state.lang]) + "</li>";
      }).join("") + "</ul></div>" +
      "<h3>" + esc(t.compHolds) + '</h3><p class="bm-sum">' + esc(c.holds[state.lang]) + "</p>" +
      "<h3>" + esc(t.compLifts) + '</h3><p class="bm-sum">' + esc(c.lifts[state.lang]) + "</p>" +
      (tags.length ? '<div class="m-tags">' + tags.map(function (x) {
        return '<span class="tag">' + esc(x) + "</span>";
      }).join("") + "</div>" : "") +
      (pairs ? "<h3>" + esc(t.compPairs) + '</h3><div class="chip-row">' + pairs + "</div>" : "") +
      (o.type === "legendary"
        ? '<div class="m-note"><h3>' + esc(t.compOurs) + "</h3><p>" + esc((o.ours || {})[state.lang] || "") + "</p>" +
          '<p class="comp-credit">' + esc(t.compChef) + colon +
          esc(compCredit(o.chef)) + " · " + esc(t.compRestaurant) + colon +
          esc(compCredit(o.restaurant)) + "</p>" +
          (o.source ? '<p class="comp-credit">' + esc(t.compSource) + colon +
            '<a href="' + esc(o.source) + '" target="_blank" rel="noopener">' +
            esc(o.source.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) +
            ' <span aria-hidden="true">↗</span></a></p>' : "") + "</div>"
        : "");
  }
  /* The chef and restaurant lines are English in the data: the connectors, the
     places and the quotes are put into the reader's language here; the
     qualifier in brackets is in the localised "Our version" note beside it. */
  function compCredit(v) {
    var t = T(), x = String(v || "").replace(/\s*\([^)]*\)/g, "");
    x = x.split(" and ").join(" " + t.compAnd + " ").split(", then ").join(", " + t.compThen + " ");
    Object.keys(t.compPlaces).forEach(function (k) { x = x.split(k).join(t.compPlaces[k]); });
    return state.lang === "fr"
      ? x.replace(/'/g, "\u2019").replace(/"([^"]*)"/g, "\u00ab\u202f$1\u202f\u00bb") : x;
  }
  function openComp(id) { openItem("comp", id); }

  /* "Used in" on an ingredient: every component made with it in the full version;
     in the free version the free three that are, then the paid ones as a count. */
  function compUsedBlock(id) {
    var t = T();
    var used = COMPONENTS.filter(function (c) {
      return c.ingredients.some(function (x) { return x.id === id; });
    }).sort(function (a, b) { return a.name[state.lang].localeCompare(b.name[state.lang], state.lang, CMP); });
    var paid = LOCKED ? (LK.compUsing[id] || 0) : 0;
    if (!used.length && !paid) return "";
    return "<h3>" + esc(t.compUsedIn) + (paid ? LOCK_ICON : "") + '</h3><div class="chip-row">' +
      used.map(function (c) {
        return '<button type="button" class="chip-link comp-chip" data-complink="' + esc(c.id) + '">' +
          esc(c.name[state.lang]) + "</button>";
      }).join("") +
      (paid ? '<button type="button" class="chip-link chip-locked" data-full>' + LOCK_ICON +
        esc(paid === 1 ? t.lockedCompUsingOne : t.lockedCompUsing.replace("{n}", paid)) + "</button>" : "") +
      "</div>";
  }

  var COUNTRIES = ["FR","IT","ES","GB","DK","SE","NO","FO","SI","US","PE","CO","GH","JP","KR","HK","TH"];

  function chefMatches(c, q) {
    if (state.chefGender !== "all" && c.gender !== state.chefGender) return false;
    var n = c.stars ? c.stars.n : 0;
    if (state.chefStars !== "all" && String(n) !== state.chefStars) return false;
    if (state.chefCountry !== "all" && c.country !== state.chefCountry) return false;
    if (state.chefEra !== "all" && String(Math.floor((c.born - 1) / 100) + 1) !== state.chefEra) return false;
    if (!q) return true;
    var hay = norm(c.name + " " + c.place[state.lang] + " " + c.work[state.lang] + " " + c.role[state.lang]);
    return hay.indexOf(q) !== -1;
  }

  function chefYears(c) {
    var t = T();
    if (c.died) return (c.approx ? "c. " : "") + c.born + "–" + c.died;
    var b = c.approx ? (c.gender === "f" ? t.bornFc : t.bornMc) : (c.gender === "f" ? t.bornF : t.bornM);
    return b + " " + c.born;
  }

  function fillSel(id, opts, cur) {
    el(id).innerHTML = opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("");
  }

  function renderChefFilters() {
    var t = T();
    placeholder("chefSearch", t.chefSearchPh);
    el("chefReset").textContent = t.chefReset;
    fillSel("chefGender", [["all", t.fAllGender], ["f", t.fWomen], ["m", t.fMen]], state.chefGender);
    fillSel("chefStars", [["all", t.fAllStars], ["3", "★★★"], ["2", "★★"], ["1", "★"], ["0", t.fNoStars]], state.chefStars);
    fillSel("chefCountry", [["all", t.fAllCountries]].concat(COUNTRIES.map(function (k) { return [k, t.countries[k]]; })), state.chefCountry);
    var eras = {}; CHEFS.forEach(function (c) { eras[Math.floor((c.born - 1) / 100) + 1] = true; });
    fillSel("chefEra", [["all", t.fAllEras]].concat(Object.keys(eras).sort(function (a, b) { return a - b; }).map(function (k) {
      return [k, century(k * 100 - 50)]; })), state.chefEra);
  }

  function renderChefs() {
    var t = T(), lastC = null, q = norm(state.chefQ.trim());
    el("chefsTitle").textContent = t.chefsTitle;
    el("chefsHint").textContent = t.chefsHint;
    renderChefFilters();
    var list = CHEFS.filter(function (c) { return chefMatches(c, q); });
    el("chefCount").textContent = t.chefCountTpl.replace("{n}", list.length).replace("{t}", CHEFS.length);
    if (!list.length) { el("chefsTimeline").innerHTML = '<p class="empty">' + esc(t.chefEmpty) + "</p>"; return; }
    el("chefsTimeline").innerHTML = list.map(function (c) {
      var cen = century(c.born), head = "";
      if (cen !== lastC) { lastC = cen; head = '<p class="tl-era">' + esc(cen) + "</p>"; }
      return head +
        '<article class="tl-item">' +
        '<div class="tl-marker"><span class="tl-mono">' + esc(initials(c.name)) + "</span></div>" +
        '<div class="tl-card">' +
        '<p class="tl-years">' + esc(chefYears(c)) + " · " + esc(c.place[state.lang]) +
          (c.discipline === "patisserie" ? " · " + esc(t.patisserie) : "") + "</p>" +
        "<h3>" + esc(c.name) + "</h3>" +
        '<p class="tl-role">' + esc(c.role[state.lang]) + " · <em>" + esc(c.work[state.lang]) + "</em></p>" +
        (c.stars ? '<p class="tl-stars"><span class="tl-star">' + new Array(c.stars.n + 1).join("★") +
          '</span> ' + esc(t.michelin) + " · " + esc(c.stars.years) + " — " + esc(c.stars.note[state.lang]) + "</p>" : "") +
        (c.phrase ? '<blockquote class="tl-phrase">“' + esc(c.phrase.text) + '”<cite>' + esc(c.phrase.by) + "</cite></blockquote>" : "") +
        "<p>" + esc(c.contribution[state.lang]) + "</p>" +
        '<p class="tl-legacy">' + esc(c.legacy[state.lang]) + "</p>" +
        (c.dishes ? c.dishes.map(function (d) {
          /* Two kinds, and the difference is a claim. "memorable" says the dish
             moved something and history has had time to agree; "signature" says
             only that this is the plate the cook is known for. A chef with no
             settled dish carries neither, which is why 51 of 81 show nothing. */
          var memorable = d.kind === "memorable";
          var known = d.ingredients.filter(function (x) { return byId[x]; });
          return '<div class="tl-dish' + (memorable ? " tl-dish-mem" : "") + '">' +
            '<p class="tw-sub">' + esc(memorable ? t.chefMemorable : t.chefSignature) + "</p>" +
            '<p class="tl-dish-name">' + esc(d.name[state.lang]) +
              (d.year[state.lang] === "\u2014" ? "" :
                ' <span class="tl-dish-year">' + esc(d.year[state.lang]) + "</span>") + "</p>" +
            "<p>" + esc(d.note[state.lang]) + "</p>" +
            (d.why ? '<p class="tl-why"><span class="tl-why-lbl">' + esc(t.chefWhy) + "</span> " +
              esc(d.why[state.lang]) + "</p>" : "") +
            '<div class="pair-grid">' + known.map(pairChip).join("") + "</div>" +
            /* Two ingredients is one pair and worth asking about; one is not a
               question, so the button does not appear. */
            (known.length > 1 ? '<button type="button" class="m-lab-btn" data-dishlab="' +
              esc(known.join(",")) + '" data-dishname="' + esc(d.name[state.lang]) + '">' +
              esc(t.dishLab) + "</button>" : "") +
            "</div>";
        }).join("") : "") +
        '<p class="tw-sub">' + esc(t.chefIngredients) + "</p>" +
        '<div class="pair-grid">' + c.ingredients.filter(function (x) { return byId[x]; }).map(pairChip).join("") + "</div>" +
        (c.url ? '<p class="tl-link"><a href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(t.chefSite) + ' <span aria-hidden="true">↗</span></a>' +
          '<span class="tl-link-host">' + esc(c.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) + "</span></p>" : "") +
        "</div></article>";
    }).join("");
  }


  function renderModal(id) {
    var t = T(), i = byId[id];
    var other = state.lang === "en" ? i.name.fr : i.name.en;
    var pairs = Array.from(PAIRS[i.id] || []).sort(function (a, b) { return name(byId[a]).localeCompare(name(byId[b]), state.lang, CMP); });
    var trios = triosOf(id);
    var html =
      '<div class="m-head">' +
      '<div class="m-art">' + art(i) +
      '<div class="photo-actions"><button type="button" class="linkish" data-photo-pick="' + i.id + '">' +
      esc(photosMap[i.id] ? t.changePhoto : t.addPhoto) + "</button>" +
      (photosMap[i.id] ? '<button type="button" class="linkish" data-photo-del="' + i.id + '">' + esc(t.removePhoto) + "</button>" : "") +
      '</div><p class="drop-hint">' + esc(t.dropHint) + "</p></div>" +
      "<div>" +
      '<p class="m-cat">' + esc(catLabel(i.cat)) + (i.custom ? " · " + esc(t.creationLabel) : "") + "</p>" +
      '<h2 id="modalTitle">' + esc(name(i)) + signMark(i) + (i.rare ? ' <span class="rare-mark" title="' + esc(t.rareMark) + '">✦</span>' : "") + (i.luxe ? ' <span class="luxe-mark" title="' + esc(t.luxeMark) + '">◆</span>' : "") + (i.coeur ? ' <span class="coeur-mark" title="' + esc(t.coeurMark) + '">♥</span>' : "") + "</h2>" +
      '<p class="m-latin">' + (i.custom ? esc(other) : esc(i.latin) + " · " + esc(other)) + "</p>" +
      (i.origin[state.lang] ? '<p class="m-origin">' + esc(t.origin) + " — " + esc(i.origin[state.lang]) + "</p>" : "") +
      (i.price ? '<p class="m-price"><span class="price-band">' + "\u20ac".repeat(i.price) + "</span>" +
        (i.pk ? ' <span class="price-kg">' + esc(priceText(i.pk)) + "</span>" : "") +
        ' <span class="price-hint">' + esc(t.priceHint) + "</span></p>" : "") +
      (i.custom ? "" : '<div class="m-season">' + seasonDots(i) + "</div>") +
      "</div></div>" +
      '<div class="m-tags">' + i.flavor.map(function (f) { return '<span class="tag">' + esc(t.flavors[f]) + "</span>"; }).join("") + "</div>" +
      (i.story[state.lang] ? "<h3>" + esc(i.custom ? t.notesLbl : t.story) + "</h3>" +
        '<p class="m-story">' + esc(i.story[state.lang]) + "</p>" : "") +
      (i.tip[state.lang] ? '<div class="m-note"><h3>' + esc(t.chefNote) + "</h3><p>" + esc(i.tip[state.lang]) + "</p></div>" : "") +
      renderTree(i) +
      kinBlock(i) +
      evinNote(i) +
      /* Locked, an entry's pairings, trios and lab are a count and a way to the
         full version. A creation keeps its own pairings: they are its maker's. */
      (LOCKED && !i.custom
        ? "<h3>" + esc(t.lockedPairsHead) + LOCK_ICON + "</h3>" +
          lockedBox(LK.pairs[i.id]
            ? t.lockedPairs.replace("{n}", fmt(LK.pairs[i.id]))
            : t.lockedPairsNone, true)
        : "<h3>" + esc(t.pairsWith) + "</h3>" +
          pairBlock(pairs) +
          (trios.length ? "<h3>" + esc(t.inTrios) + "</h3>" + trios.map(function (tr) {
            return '<p class="m-story" style="font-size:14px">· <strong>' + esc(tr.name[state.lang]) + "</strong> — " +
              tr.ids.map(function (x) { return esc(name(byId[x])); }).join(" + ") + "</p>";
          }).join("") : "") +
          (LOCKED ? "" : '<button type="button" class="m-lab-btn" data-lab="' + i.id + '">' + esc(t.openLab) + "</button>"));
    el("modalBody").innerHTML = html + compUsedBlock(i.id);
  }

  /* What the full version holds, every count read from COPIUS_LOCKED; with an
     id, it opens on that paid entry's name and links its public page: drawing,
     family, season, price band, story and kitchen note. */
  function renderFullModal(id) {
    var t = T(), c = LK.counts, x = id ? PAID[id] : null, head;
    if (x) {
      var nm = lockedName(x), other = state.lang === "fr" ? x[1] : x[2];
      head = '<div class="bm-head"><p class="m-cat">' + esc(catLabel(x[3])) + " · " + LOCK_ICON + esc(t.lockedTag) + "</p>" +
        '<h2 id="modalTitle">' + esc(nm) + "</h2>" +
        (other !== nm ? '<p class="m-latin">' + esc(other) + "</p>" : "") + "</div>" +
        '<p class="dm-sum">' + esc(t.fullIs.replace("{name}", nm)) + "</p>" +
        '<p class="full-page"><a href="' + (state.lang === "fr" ? "fr/i/" : "i/") + encodeURIComponent(x[0]) + '/">' +
          esc(t.fullPage) + ' <span aria-hidden="true">→</span></a></p>' +
        "<h3>" + esc(t.fullTitle) + "</h3>";
    } else {
      head = '<div class="bm-head"><h2 id="modalTitle">' + esc(t.fullTitle) + "</h2></div>" +
        "<h3>" + esc(t.fullHolds) + "</h3>";
    }
    el("modalBody").innerHTML = head + fullRows(t) +
      '<p class="full-price"><span class="full-amount">' + esc(t.fullPrice) + "</span>" +
        (PAYMENTS_LIVE ? '<a class="full-order" href="commande/">' + esc(t.subCta) + "</a>"
          : '<span class="full-soon">' + esc(t.fullSoon) + "</span>") + "</p>" +
      '<p class="full-free">' + esc(t.fullFree.replace("{n}", fmt(c.free))) + "</p>" + signinBlock(t);
  }

  /* The list of what the full version holds, for the dialog and the tab. */
  function fullRows(t) {
    var c = LK.counts;
    return '<ul class="full-list">' + [
      t.fullIngredients.replace("{p}", fmt(c.paid)).replace("{t}", fmt(c.ingredients)),
      t.fullPairings.replace("{n}", fmt(c.pairings)),
      t.fullTrees.replace("{n}", fmt(c.trees)),
      t.fullLab,
      t.fullTrios.replace("{n}", fmt(c.trios)),
      t.fullChefs.replace("{n}", fmt(c.chefs)).replace("{d}", fmt(c.dishes)),
      /* A cached free.js from before bases or components has no such count:
         the row is left out rather than fmt(undefined) breaking the dialog. */
      c.bases == null ? "" : t.fullBases.replace("{n}", fmt(c.bases)),
      c.components == null ? "" : t.fullComponents.replace("{n}", fmt(c.components))
    ].filter(Boolean).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
  }

  /* The subscription tab: the full version with its order link and the terms
     under it, then the free one in use and the one for schools, then the
     sign-in for an access already bought. Drawn again only for a new language
     or sign-in, so any other redraw (a photo loaded, the tab opened again)
     keeps an address or a code being typed. */
  var subDrawn = "";
  function renderSub() {
    var t = T(), key = state.lang + hasMark();
    if (key === subDrawn) return;
    subDrawn = key;
    el("subPanel").innerHTML =
      "<h2>" + esc(t.subTitle).replace("{price}", '<span class="amt">' + esc(t.subPrice) + "</span>") + "</h2>" +
      '<div class="sub-plans">' +
        '<article class="sub-plan sub-full"><h3>' + esc(t.fullTitle) + "</h3>" + fullRows(t) +
          (PAYMENTS_LIVE ? '<a class="sub-cta" href="commande/">' + esc(t.subCta) + "</a>"
            : '<p class="full-soon sub-soon">' + esc(t.fullSoon) + "</p>") +
          '<p class="sub-terms">' + esc(t.subTerms) + "</p></article>" +
        '<div class="sub-side">' +
          '<article class="sub-plan"><p class="sub-now">' + esc(t.subFreeNow) + "</p>" +
            "<h3>" + esc(t.subFreeTitle) + "</h3>" +
            '<p class="sub-holds">' + esc(t.subFreeHolds.replace("{n}", fmt(LK.counts.free))) + "</p></article>" +
          '<article class="sub-plan"><h3>' + esc(t.subSchoolsTitle) + "</h3>" +
            '<p class="full-soon sub-soon">' + esc(t.fullSoon) + "</p></article>" +
        "</div>" +
      "</div>" + signinBlock(t);
  }

  /* One field, one button, one line on what the address is for, and one
     message after the submit, the same whatever the address: the page never
     learns whether it has access. Signed in already, the account instead.
     The dialog and the tab can both hold one, so each render numbers its ids. */
  var signinSeq = 0;
  function signinBlock(t) {
    if (hasMark()) {
      return '<p class="signin-in"><button type="button" class="linkish" data-account>' +
        esc(t.accountLink) + "</button></p>";
    }
    var n = ++signinSeq;
    return '<form class="signin" data-signin>' +
      '<p class="signin-head" id="signinHead' + n + '">' + esc(t.signinHead) + "</p>" +
      '<div class="signin-row"><input type="email" name="email" required autocomplete="email" ' +
        'spellcheck="false" aria-label="' + esc(t.signinPlaceholder) + '" aria-describedby="signinHead' + n + '" ' +
        'placeholder="' + esc(t.signinPlaceholder) + '">' +
        '<button type="submit" class="create-btn">' + esc(t.signinBtn) + "</button></div>" +
      /* The code the mail also carries, for the app on a home screen: a link in a
         mail opens in a browser, whose sign-in the app does not share. */
      '<p class="signin-head signin-code" id="codeHead' + n + '">' + esc(t.codeHead) + "</p>" +
      '<div class="signin-row"><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" ' +
        'maxlength="9" spellcheck="false" aria-describedby="codeHead' + n + '" aria-label="' + esc(t.codeHead) + '" ' +
        'placeholder="' + esc(t.codePlaceholder) + '">' +
        '<button type="button" class="create-btn" data-code>' + esc(t.codeBtn) + "</button></div>" +
      '<p class="signin-why">' + esc(t.signinWhy) + ' <a href="confidentialite/">' + esc(t.privacyLink) + "</a></p>" +
      '<p class="signin-sent" role="status"></p></form>';
  }

  /* The account: who is signed in, and the two ways out. /api/me.php is asked
     once per opening; a language switch redraws from the answer already held. */
  var ME = null;
  function renderAccountModal() {
    var t = T(), html = '<div class="bm-head"><h2 id="modalTitle">' + esc(t.accountTitle) + "</h2></div>";
    if (!ME) {
      el("modalBody").innerHTML = html + '<p class="dm-sum" aria-busy="true">…</p>';
      /* Anything but a JSON answer carrying an address (offline, an error page)
         is a failure, never the signed-in view with nothing in it. */
      fetch("/api/me.php", { credentials: "same-origin", cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : { status: r.status }; })
        .then(function (m) { return m && typeof m.email === "string" ? m : { status: (m && m.status) || -1 }; })
        .catch(function () { return { status: -1 }; })
        .then(function (m) {
          ME = m;
          /* No session behind the marker: drop the marker too, so the page
             stops offering an account that is not there. */
          if (m.status === 401) { document.cookie = "__Host-copius_full=; Max-Age=0; Path=/; Secure"; forgetBundle(); }
          var top = modalTop();
          if (top && top.kind === "account" && !el("overlay").hidden) { showModal(); applyStatic(); }
        });
      return;
    }
    if (ME.status) {
      /* After a 401 the marker is gone, so signinBlock gives the form back. */
      el("modalBody").innerHTML = html + '<p class="dm-sum">' +
        esc(t[ME.status === 401 ? "sessionEnded" : navigator.onLine === false ? "sessionOffline" : "sessionUnavailable"]) +
        "</p>" + (ME.status === 401 ? signinBlock(t) : "");
      return;
    }
    el("modalBody").innerHTML = html +
      '<p class="dm-sum">' + esc(t.accountAs).replace("{email}", function () {
        return "<strong>" + esc(ME.email) + "</strong>";
      }) + "</p>" +
      '<p class="dm-sum">' + esc(ME.access ? t.accountFull : t.sessionNoAccess) + "</p>" +
      '<div class="account-out">' +
        '<button type="button" class="m-lab-btn" data-signout>' + esc(t.signOut) + "</button>" +
        '<button type="button" class="m-lab-btn" data-signout="all">' + esc(t.signOutAll) + "</button>" +
        '<p class="full-free">' + esc(t.signOutAllHint) + "</p>" +
        '<p class="signin-sent" role="status"></p></div>' +
      '<p class="signin-why"><a href="resilier/">' + esc(t.cancelLink) + '</a> · ' +
        '<a href="renoncer/">' + esc(t.withdrawLink) + "</a></p>";
  }

  /* After the server has cleared both cookies, the page reloads from the
     start, and the site's other open tabs do the same. Both buttons wait for
     the answer: a single sign-out landing first would leave "everywhere" with
     no session to act on. */
  function signOut(all, btn) {
    var box = btn.parentNode, both = box.querySelectorAll("[data-signout]");
    function enable(on) { for (var k = 0; k < both.length; k++) both[k].disabled = !on; }
    enable(false);
    fetch("/api/logout.php", { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: all }) })
      .then(function (r) {
        if (!r.ok) throw new Error("logout " + r.status);
        if (SESSION_CH) SESSION_CH.postMessage("changed");
        /* Back to copius.fr/, the home page, once the offline copy is gone. */
        return forgetBundle().then(function () { location.replace("/"); });
      })
      .catch(function () {
        enable(true);
        var out = box.querySelector(".signin-sent");
        if (out) out.textContent = T().signOutFailed;
      });
  }

  /* One dialog, three kinds of entry. showModal draws whatever is on top of
     the stack; openItem pushes, backModal pops, closeModal empties. Focus goes
     to ✕ on open and back to the control that opened the dialog on close. */
  var RENDER = { ing: renderModal, tech: renderTechModal, base: renderBaseModal, comp: renderCompModal,
                 full: renderFullModal, account: renderAccountModal };
  var LOOKUP = { ing: function (id) { return byId[id]; }, tech: function (id) { return techById[id]; },
                 base: function (id) { return baseById[id]; }, comp: function (id) { return compById[id]; },
                 full: function (id) { return LOCKED && (!id || !!PAID[id]); },
                 account: function () { return true; } };
  var opener = null;
  /* Give every stroke the same nominal length so one animation duration suits
     a two-stroke leaf and a twenty-stroke artichoke. Cheap: one modal's worth
     of paths, only when the drawing is an inline svg. */
  function primeArt() {
    var art = document.querySelector(".m-art .art");
    if (!art) return;
    /* Only ask for the animation when the viewer has not asked for less of it. */
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var n = art.querySelectorAll("path,circle,ellipse,rect");
    for (var k = 0; k < n.length; k++) {
      if (n[k].getTotalLength) { try { n[k].setAttribute("pathLength", "1"); } catch (e) {} }
    }
    /* The class carries the hidden starting state, so a drawing is only ever
       hidden by the same code that is about to reveal it. */
    art.classList.add("draw");
  }

  function showModal() {
    var top = modalTop();
    RENDER[top.kind](top.id);
    // Every card starts at its own top. This covers the already-visible cases —
    // a pair chip, the back button — where the write actually sticks.
    el("overlay").scrollTop = 0;
    if (top.kind === "ing") primeArt();
    el("backBtn").hidden = modalStack.length < 2;
    if (history.replaceState) {
      /* A paid name keeps its link too: #id opens the panel naming it. */
      history.replaceState(null, "", top.kind === "ing" || (top.kind === "full" && top.id)
        ? "#" + top.id : location.pathname + location.search);
    }
  }
  function openItem(kind, id) {
    if (!LOOKUP[kind](id)) return;
    treeSel = null;
    if (el("overlay").hidden) { modalStack = []; opener = document.activeElement; }
    modalStack.push({ kind: kind, id: id });
    showModal();
    el("overlay").hidden = false;
    // A hidden overflow:auto element ignores scrollTop writes and restores its
    // previous position when shown again, so showModal's reset one line above is
    // a no-op on this path. Reset again after the unhide, or every card after
    // the first opens wherever the last one was left.
    el("overlay").scrollTop = 0;
    document.body.style.overflow = "hidden";
    el("closeBtn").focus();
  }
  function openModal(id) { openItem("ing", id); }
  function closeModal() {
    modalStack = [];
    el("overlay").hidden = true;
    document.body.style.overflow = "";
    if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    if (opener && opener.focus) opener.focus();
    opener = null;
  }
  function backModal() {
    modalStack.pop();
    if (modalStack.length) { treeSel = null; showModal(); el("closeBtn").focus(); }
    else closeModal();
  }

    function renderBaseModal(id) {
      var t = T(), d = baseById[id];
      if (!d) return;
      var ings = d.ingredients.filter(function (i) { return byId[i]; }).map(function (i) {
        return '<button type="button" class="chip-link" data-open="' + esc(i) + '">' + art(byId[i]) +
          "<span>" + esc(name(byId[i])) + "</span></button>";
      }).join("");
      var techs = d.techniques.filter(function (x) { return techById[x]; }).map(function (x) {
        return '<button type="button" class="chip-link" data-tech="' + esc(x) + '">' +
          esc(techById[x].name[state.lang]) + "</button>";
      }).join("");
      /* The components built on this base; the base is the full version's, so
         the list is too. */
      var into = COMPONENTS.filter(function (c) { return c.base === id; })
        .sort(function (a, b) { return a.name[state.lang].localeCompare(b.name[state.lang], state.lang, CMP); })
        .map(function (c) {
          return '<button type="button" class="chip-link comp-chip" data-complink="' + esc(c.id) + '">' +
            esc(c.name[state.lang]) + "</button>";
        }).join("");
      el("modalBody").innerHTML =
        '<div class="bm-head"><p class="base-meta">' + esc(t.baseGroups[d.group] || d.group) + "</p>" +
        '<h2 id="modalTitle">' + esc(d.name[state.lang]) + "</h2>" +
        '<p class="base-ratio big">' + esc(d.ratio[state.lang]) + "</p></div>" +
        '<p class="bm-sum">' + esc(d.summary[state.lang]) + "</p>" +
        "<h3>" + esc(t.baseMethod) + "</h3>" + '<p class="bm-sum">' + esc(d.method[state.lang]) + "</p>" +
        "<h3>" + esc(t.baseUses) + "</h3>" + '<p class="bm-sum">' + esc(d.uses[state.lang]) + "</p>" +
        '<div class="m-note"><h3>' + esc(t.baseFailure) + "</h3><p>" + esc(d.failure[state.lang]) + "</p></div>" +
        (ings ? "<h3>" + esc(t.baseIngredients) + '</h3><div class="chip-row">' + ings + "</div>" : "") +
        (techs ? "<h3>" + esc(t.baseTechniques) + '</h3><div class="chip-row">' + techs + "</div>" : "") +
        (into ? "<h3>" + esc(t.compDevelopedInto) + '</h3><div class="chip-row">' + into + "</div>" : "");
    }
  /* Guarded as well as hidden: a chip left in a stale modal, a restored view or
     a hand-typed hash all reach this without passing the tab. */
  function openBase(id) { if (LOCKED) return; openItem("base", id); }

  /* ---------- pairing lab ---------- */
  /* The two slots hold ids; the boxes show names. A box is searched like the
     plate's (see makeFinder), and a pick writes the name back into it. */
  var labPick = { A: "", B: "" };

  function setLabPick(slot, id) {
    labPick[slot] = id && byId[id] ? id : "";
    el("lab" + slot).value = labPick[slot] ? name(byId[labPick[slot]]) : "";
    renderLabResult();
  }

  /* A language switch renames what the boxes show; a creation deleted since it
     was picked leaves its slot. */
  function fillLabInputs() {
    var t = T();
    ["A", "B"].forEach(function (slot) {
      /* Placeholder only: the box's name stays "first/second ingredient". */
      el("lab" + slot).setAttribute("placeholder", t.labFindPh);
      if (labPick[slot] && !byId[labPick[slot]]) { labPick[slot] = ""; el("lab" + slot).value = ""; }
      if (labPick[slot]) el("lab" + slot).value = name(byId[labPick[slot]]);
    });
  }

  function renderLabResult() {
    var t = T(), a = labPick.A, b = labPick.B, box = el("labResult");
    if (!a || !b) { box.innerHTML = ""; return; }
    /* The plate's note style: a recorded pair is good news, the rest neutral. */
    if (a === b) { box.innerHTML = '<p class="plate-note lab-note">' + esc(t.labSame) + "</p>"; return; }
    var A = byId[a], B = byId[b];
    var rec = recordedPair(a, b), direct = !!rec;
    var bridges = bridgesOf(a, b)
      .sort(function (x, y) { return name(byId[x]).localeCompare(name(byId[y]), state.lang, CMP); });
    var shared = A.flavor.filter(function (f) { return B.flavor.indexOf(f) !== -1; });
    var html = "";
    if (direct) {
      html += '<p class="plate-note lab-note ok">' + esc(t.labDirect) + "</p>";
      if (rec.via) html += '<p class="lab-via">' + esc(viaLine(rec.via)) + "</p>";
    }
    else html += '<p class="plate-note lab-note">' + esc(bridges.length ? t.labBridge : t.labNone) + "</p>";
    if (shared.length) {
      html += '<p class="shared-notes">' + esc(t.sharedNotes) + " " +
        shared.map(function (f) { return '<span class="tag">' + esc(t.flavors[f]) + "</span>"; }).join("") + "</p>";
    }
    if (bridges.length) html += '<div class="bridge-grid">' + bridges.map(pairChip).join("") + "</div>";
    box.innerHTML = html;
  }

  /* The same verdict, for one pair, without the DOM: renderLabResult reads the
     two slots, and a set has no slots to read. */
  function verdict(a, b) {
    var rec = recordedPair(a, b);
    if (rec) return { v: "ok", via: rec.via };
    return { v: bridgesOf(a, b).length ? "mid" : "none", via: null };
  }

  /* A dish, judged as a set: every pair among its ingredients, and what the
     12 778 recorded accords say about each one. Four ingredients is six pairs.
     Picking in either box afterwards returns it to pair mode on its own,
     because renderLabResult overwrites exactly this element. */
  function renderLabSet(ids, dishName) {
    var t = T(), box = el("labResult");
    ids = ids.filter(function (x) { return byId[x]; });
    if (ids.length < 2) { box.innerHTML = ""; return; }
    var rows = [], i, j;
    for (i = 0; i < ids.length; i++) {
      for (j = i + 1; j < ids.length; j++) {
        var vd = verdict(ids[i], ids[j]);
        rows.push([ids[i], ids[j], vd.v, vd.via]);
      }
    }
    var order = { ok: 0, mid: 1, none: 2 };
    rows.sort(function (x, y) { return order[x[2]] - order[y[2]]; });
    /* The long bridge line ends in a colon that expects the bridge chips after
       it, and a row has no room for them. */
    var label = { ok: t.labDirect, mid: t.labBridgeShort, none: t.labNone };
    var direct = rows.filter(function (r) { return r[2] === "ok"; }).length;
    box.innerHTML =
      '<p class="lab-set-head">' + esc(dishName) +
        ' <span class="lab-set-count">' +
        esc(t.labSetCount.replace("{n}", direct).replace("{t}", rows.length)) + "</span></p>" +
      '<ul class="lab-set">' + rows.map(function (r) {
        return '<li class="lab-set-row"><span class="lab-set-pair">' +
          esc(name(byId[r[0]])) + ' <span class="lab-x" aria-hidden="true">×</span> ' +
          esc(name(byId[r[1]])) +
          (r[3] ? '<span class="lab-set-via">' + esc(viaLine(r[3])) + "</span>" : "") + "</span>" +
          '<span class="verdict ' + r[2] + '">' +
          (r[2] === "ok" ? "&#10003;&nbsp; " : "") + esc(label[r[2]]) + "</span></li>";
      }).join("") + "</ul>";
  }

  /* ---------- the plate ----------
     The two-slot lab answers "do these two agree". A plate asks something else:
     is this balanced, does it hold together, and is anything here on its own.
     js/plate.js does the judging and knows nothing about the DOM; everything
     below is what turns its note keys into a page. */
  var PLATE = window.COPIUS_PLATE;
  var labMode = "pair";           // pair | plate
  var plateMode = "guided";       // guided | free
  var plateTpl = "main";          // which guided template, when guided
  /* Suggestions a cook has waved off, keyed by template and role so switching
     away and back remembers. A skipped slot stops being a gap: it does not sit
     there looking unfinished. */
  var plateSkip = {};
  function skipKey(role) { return plateTpl + ":" + role; }
  var plate = [];                 // [{ id, form }] — form is a branch id, or ""
  /* Taken off with × during this visit: the cook said no, so it is not
     suggested back. Held in memory only; a new visit starts clean, so does an
     emptied plate, and adding an item back by hand withdraws its no. */
  var plateRemoved = new Set();
  var plateWhyOpen = false;       // the grade shows; its arithmetic is asked for

  /* The bands, in one place, because they are now three things at once: the
     label on the bar, the sentence under it, and the rows of the scale. The
     boundaries are measured, not chosen — of 4 000 random plates 132 reached 55
     and one reached 87, and the top band holds 63% of the trios and chefs'
     dishes (tools/measure-scale.js). */
  var SCALE = [
    { band: "balanced",   lo: 75, hi: 100, label: "plateBandBalanced",   why: "scaleBalanced" },
    { band: "sound",      lo: 55, hi: 74,  label: "plateBandSound",      why: "scaleSound" },
    { band: "uneven",     lo: 35, hi: 54,  label: "plateBandUneven",     why: "scaleUneven" },
    { band: "off",        lo: 1,  hi: 34,  label: "plateBandOff",        why: "scaleOff" },
    { band: "unrecorded", lo: 0,  hi: 0,   label: "plateBandUnrecorded", why: "scaleUnrecorded" }
  ];

  /* A form is not a garnish on the name. js/data-trees.js records a different
     set of pairings for each preparation, because purée and frites do not agree
     with the same things; when a form is chosen, those are the pairings. */
  function branchesOf(id) {
    var tr = treeById[id];
    return tr ? tr.branches : [];
  }
  function itemPairs(id, form) {
    if (form) {
      var b = branchesOf(id).filter(function (x) { return x.id === form; })[0];
      if (b && b.pairs) return b.pairs.filter(function (x) { return byId[x]; });
    }
    return byId[id] ? (byId[id].pairs || []).slice() : [];
  }
  /* The branch's own texture where a form is chosen — purée is not a potato. */
  function itemTexture(id, form) {
    if (form) {
      var b = branchesOf(id).filter(function (x) { return x.id === form; })[0];
      if (b && b.texture && b.texture.length) return b.texture.slice();
    }
    return byId[id] && byId[id].texture ? byId[id].texture.slice() : [];
  }

  function formName(id, form) {
    var b = branchesOf(id).filter(function (x) { return x.id === form; })[0];
    return b ? b.name[state.lang] : "";
  }
  function itemLabel(it) {
    var f = formName(it.id, it.form);
    return name(byId[it.id]) + (f ? " · " + f : "");
  }

  function template() {
    return PLATE.TEMPLATES.filter(function (t) { return t.id === plateTpl; })[0] ||
           PLATE.TEMPLATES[0];
  }

  /* What the chosen template suggests, and how much of it is on the plate.
     A suggestion, not a gate: a plate with empty slots is not incomplete, and
     the search offers every role whatever the slots say. The atlas's own 79
     curated plates do not fill any fixed grid — none of them satisfied the one
     this used to enforce — so the slots show what a plate of this kind usually
     wants and stop there. */
  function roleRoom() {
    var used = {};
    plate.forEach(function (it) {
      var r = PLATE.roleOf(byId[it.id]);
      used[r] = (used[r] || 0) + 1;
    });
    return template().slots.map(function (g) {
      return { role: g.role, n: g.n, filled: Math.min(used[g.role] || 0, g.n),
               skipped: !!plateSkip[skipKey(g.role)] };
    });
  }
  /* One ceiling, both modes. Guided never blocks on its slots. */
  function plateFull() { return plate.length >= PLATE.MAX_FREE; }

  /* One search for the plate's box and the lab's two. It reaches names in both
     languages, the family, the latin name and the flavour notes — the last of
     those is the only way to find a group the atlas records but does not file
     together. 83 entries carry a citrus note and they sit under fruits,
     condiments and the cellar alike; typing "agrume" is what finds them. */
  function searchMatches(i, q) {
    if (!q) return true;
    var t = T();
    var hay = norm(i.name.en + " " + i.name.fr + " " + catLabel(i.cat) + " " +
      (i.latin || "") + " " +
      (i.flavor || []).map(function (f) { return t.flavors[f] + " " + f; }).join(" "));
    return hay.indexOf(q) !== -1;
  }

  /* A name that STARTS with the query is what was meant nine times in ten —
     and the match is tested against BOTH names, because someone typing
     "potato" into the French build means the potato, not the starch that
     happens to sort first among things whose French name contains it. */
  function rankHits(pool, q) {
    if (q) {
      /* The reader's own language wins a tie, because the collisions are real:
         "citron" is French for the lemon and English for the cédrat, and a
         French reader typing it means the lemon. */
      var rank = function (i) {
        var here = norm(i.name[state.lang]);
        var there = norm(i.name[state.lang === "fr" ? "en" : "fr"]);
        if (here === q) return 0;
        if (there === q) return 1;
        if (here.indexOf(q) === 0) return 2;
        if (there.indexOf(q) === 0) return 3;
        return 4;                                                    // mentions it
      };
      return pool.sort(function (a, b) {
        var d = rank(a) - rank(b);
        if (d) return d;
        /* "Potato" and "Potato starch" both start with "potato"; the shorter is
           the one that was meant. */
        d = name(a).length - name(b).length;
        if (d) return d;
        return name(a).localeCompare(name(b), state.lang, CMP);
      });
    }
    return pool.sort(function (a, b) { return name(a).localeCompare(name(b), state.lang, CMP); });
  }

  function plateSearchHits(q) {
    return rankHits(ING.concat(BASE_ITEMS, COMP_ITEMS).filter(function (i) {
      if (plate.some(function (it) { return it.id === i.id; })) return false;
      return searchMatches(i, q);
    }), q);
  }

  /* A lab box offers every ingredient but the one already in the other box:
     a pair of the same thing has nothing to judge. Bases have no recorded
     pairs, so they stay in the plate's search only. */
  function labSlotHits(slot) {
    var other = slot === "A" ? "B" : "A";
    return function (q) {
      return rankHits(ING.filter(function (i) {
        return i.id !== labPick[other] && searchMatches(i, q);
      }), q);
    };
  }

  /* Type, see, click. The old pickers were dropdowns, or a search that filtered
     a separate dropdown you then had to open yourself, so adding one
     ingredient took four moves. Now the query and the answer are the same
     place. o: input, list, hits(q), opens(q), pick(id); typed() and holds()
     optional. */
  var FINDER_SHOWN = 8;
  function makeFinder(o) {
    var hits = [], cursor = -1;
    function close() {
      o.list.hidden = true; o.list.innerHTML = "";
      o.input.setAttribute("aria-expanded", "false");
      o.input.removeAttribute("aria-activedescendant");
      cursor = -1;
    }
    function render(open) {
      var t = T(), q = (o.input.value || "").trim();
      hits = o.hits(norm(q));
      /* Opened on nothing, the list would be every row: the old dropdown again. */
      if (!open || !o.opens(q)) { close(); return; }
      var shown = hits.slice(0, FINDER_SHOWN);
      if (cursor >= shown.length) cursor = shown.length - 1;
      /* Focus stays in the box, so a screen reader follows the highlighted row
         through aria-activedescendant, which needs every row to have an id. */
      o.list.innerHTML = shown.length
        ? shown.map(function (i, k) {
            return '<li id="' + o.list.id + "-" + k + '" class="plate-result' + (k === cursor ? " on" : "") +
              '" role="option" aria-selected="' + (k === cursor) + '"' +
              ' data-pick="' + esc(i.id) + '">' +
              '<span class="pr-name">' + esc(name(i)) + "</span>" +
              '<span class="pr-cat">' + esc(catLabel(i.cat)) + "</span></li>";
          }).join("")
        : '<li class="plate-result empty" role="presentation">' + esc(t.plateNoMatch) + "</li>";
      /* How many more, as the list's last line: a line under the box sat
         beneath the open list, and one line shared by both lab boxes stood
         under the first while the second was being typed into. */
      if (hits.length > FINDER_SHOWN) {
        o.list.innerHTML += '<li class="plate-more" role="presentation">' +
          esc(t.plateMore.replace("{n}", hits.length - FINDER_SHOWN)) + "</li>";
      }
      o.list.hidden = false;
      o.input.setAttribute("aria-expanded", "true");
      /* The arrow keys move a highlight the list never scrolled to, and the
         pinned hint covers its bottom row: bring the row into the part that
         shows, whichever way it went. */
      if (cursor >= 0) {
        /* Measured, not offsetTop: rows are fractional pixels tall and whole
           ones drift a pixel short by the last row. */
        var row = o.list.children[cursor].getBoundingClientRect(), box = o.list.getBoundingClientRect(),
            more = o.list.querySelector(".plate-more");
        var floor = more ? more.getBoundingClientRect().top : box.bottom - o.list.clientTop,
            ceil = box.top + o.list.clientTop;
        if (row.bottom > floor) o.list.scrollTop += Math.ceil(row.bottom - floor);
        else if (row.top < ceil) o.list.scrollTop = cursor ? o.list.scrollTop - Math.ceil(ceil - row.top) : 0;
      }
      if (cursor >= 0) o.input.setAttribute("aria-activedescendant", o.list.id + "-" + cursor);
      else o.input.removeAttribute("aria-activedescendant");
    }
    function pick(id) { close(); o.pick(id); }
    o.input.addEventListener("input", function () {
      cursor = -1;
      if (o.typed) o.typed();
      render(true);
    });
    o.input.addEventListener("focus", function () { render(true); });
    /* Blur has to lose to the click that caused it, or picking a result closes
       the list before the click lands. */
    o.input.addEventListener("blur", function () { setTimeout(close, 140); });
    o.input.addEventListener("keydown", function (e) {
      /* The Enter that confirms an input-method composition belongs to it. */
      if (e.isComposing || e.keyCode === 229) return;
      var shown = Math.min(hits.length, FINDER_SHOWN);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (o.list.hidden) { render(true); return; }
        if (!shown) return;
        cursor += e.key === "ArrowDown" ? 1 : -1;
        if (cursor < 0) cursor = shown - 1;
        if (cursor >= shown) cursor = 0;
        render(true);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        /* Enter with nothing highlighted takes the first match, which is what
           someone who typed a name and hit Enter meant. A closed list offers
           nothing, so Enter there picks nothing. */
        if (o.list.hidden) return;
        var first = hits[cursor >= 0 ? cursor : 0];
        if (first) pick(first.id);
        return;
      }
      /* A search box clears its text on Escape by default. With the list open,
         Escape closes the list and nothing else; a second Escape still clears. */
      if (e.key === "Escape" && !o.list.hidden) { e.preventDefault(); close(); }
      /* A box showing a chosen ingredient keeps it on Escape; the clear button
         is there for emptying it on purpose. */
      else if (e.key === "Escape" && o.holds && o.holds()) e.preventDefault();
    });
    o.list.addEventListener("mousedown", function (e) {
      /* Any row keeps focus in the box, the hint included, or the blur closes
         the list; the scrollbar (the list itself) keeps its own behaviour. */
      if (e.target !== o.list) e.preventDefault();
      var li = e.target.closest("[data-pick]");
      if (li) pick(li.getAttribute("data-pick"));
    });
    return {
      render: render,
      close: close,
      isOpen: function () { return !o.list.hidden; }
    };
  }
  var plateFinder = null;   // built with the other events, below

  function renderPlateSlots() {
    var t = T();
    if (plateMode !== "guided") {
      el("plateSlots").innerHTML = "";
      return;
    }
    el("plateSlots").innerHTML = roleRoom().map(function (g) {
      var pips = "";
      for (var k = 0; k < g.n; k++) {
        pips += '<span class="slot-pip' + (k < g.filled ? " on" : "") + '" aria-hidden="true"></span>';
      }
      var cls = "plate-slot" + (g.skipped ? " skipped" : g.filled >= g.n ? " done" : "");
      return '<button type="button" class="' + cls + '" data-plate-skip="' + g.role + '"' +
        ' aria-pressed="' + (g.skipped ? "true" : "false") + '"' +
        ' title="' + esc(g.skipped ? t.plateUnskip : t.plateSkip) + '">' +
        '<span class="slot-role">' + esc(t.roles[g.role]) + "</span>" + pips + "</button>";
    }).join("");
  }

  function renderPlateItems() {
    var t = T();
    if (!plate.length) {
      el("plateItems").innerHTML = '<p class="muted plate-empty">' + esc(t.plateEmpty) + "</p>";
      return;
    }
    el("plateItems").innerHTML = plate.map(function (it, k) {
      var i = byId[it.id], br = branchesOf(it.id);
      /* The form belongs to the thing on the plate, not to the search box: it
         is only offered for the 11 entries that have one, and only once the
         ingredient is chosen. */
      var form = br.length
        ? '<select class="chip-form" data-plate-form="' + k + '" aria-label="' +
            esc(t.plateFormLabel) + '">' +
            '<option value="">' + esc(t.plateFormPlain) + "</option>" +
            br.map(function (b) {
              return '<option value="' + b.id + '"' + (b.id === it.form ? " selected" : "") +
                ">" + esc(b.name[state.lang]) + "</option>";
            }).join("") + "</select>"
        : "";
      return '<span class="plate-chip">' + art(i) +
        '<span class="plate-chip-name">' + esc(name(i)) + "</span>" + form +
        '<span class="plate-chip-role">' + esc(t.roles[PLATE.roleOf(i)]) + "</span>" +
        '<button type="button" class="plate-x" data-plate-del="' + k + '" aria-label="' +
        esc(t.plateRemove.replace("{name}", itemLabel(it))) + '">\u00d7</button></span>';
    }).join("");
  }

  /* "a, b and c", in the reader's language. */
  function andList(xs) {
    if (xs.length < 2) return xs[0] || "";
    return xs.slice(0, -1).join(", ") + " " + T().andWord + " " + xs[xs.length - 1];
  }

  /* One line per recorded or bridged pair, chosen from what is actually true
     of that pair rather than one of three sentences repeated down the column.
     Everything it reads — the shared notes, the bridge ingredients, the family
     — is already in the atlas; saying which is what makes the row worth
     reading twice. The pairs with nothing recorded share one line in the
     verdict, so they need no sentence of their own. */
  function pairNote(row) {
    var t = T(), A = byId[row.a.id], B = byId[row.b.id];

    if (row.verdict === "ok") {
      var notes = (A.flavor || []).filter(function (f) {
        return (B.flavor || []).indexOf(f) !== -1;
      }).map(function (f) { return t.flavors[f].toLowerCase(); });
      if (A.cat === B.cat) return t.pairOkFamily.replace("{family}", catLabel(A.cat).toLowerCase());
      if (notes.length) return t.pairOkNotes.replace("{notes}", andList(notes.slice(0, 3)));
      return t.pairOkContrast;
    }

    /* The engine's own bridges, species included, so the note names what the
       verdict was actually drawn from. */
    var via = (row.bridges || []).filter(function (x) { return byId[x]; })
      .map(function (x) { return name(byId[x]); })
      .sort(function (x, y) { return x.localeCompare(y, state.lang, CMP); });
    if (via.length > 3) {
      return t.pairBridgeMany.replace("{n}", via.length).replace("{via}", andList(via.slice(0, 2)));
    }
    if (via.length) return t.pairBridgeOne.replace("{via}", andList(via));
    return t.labBridgeShort;
  }

  /* What the engine is told about the atlas: one object, for the verdict and
     for every plate the suggestions try. */
  var PLATE_CTX = {
    byId: function (id) { return byId[id] || null; },
    pairsOf: itemPairs,
    textureOf: itemTexture,
    lineageOf: lineage,
    neighboursOf: function (id) {
      /* A component is in no PAIRS row: its own list is its neighbours. */
      return PAIRS[id] ? Array.from(PAIRS[id]) : byId[id] && byId[id].isComp ? byId[id].pairs.slice() : [];
    }
  };

  /* What to put on next, judged rather than guessed. Only the recorded
     partners of what is already here are worth trying — something recorded
     with nothing on the plate can only pull its score down — so they are
     tallied first, the REC_SHORTLIST likeliest are judged with the plate, and
     the REC_SHOWN that do the most for the result are offered. This runs on
     every change to the plate, so the shortlist is the whole cost:
     REC_SHORTLIST judgements of at most MAX_FREE items.

     Never offered: what is already here or shares a lineage with it (a second
     vanilla is no new accord, see pairSides); a drink or anything from the
     cellar, because nudging a cook toward a wine is the promotional register
     the loi Évin forbids (isAlcohol); a role the cook has waved off; and
     anything taken off the plate with × during this visit (plateRemoved);
     and more than one of a species line among the offers — the stronger stays.
     Nor does a reason name a drink: a candidate counts only through the
     things it is recorded with that are not one.

     On a plate with room every candidate recorded with something here is
     offered, the ones that tie in a lonely item first: adding to a good plate
     may lower its density and still be the dish the cook wants. A full plate
     has no room, so the offer becomes a swap for its most isolated item —
     never a drink, and the same kind of item (a vegetable for a vegetable) —
     and a swap has to earn its place: it disappears when none raises the score. */
  var REC_SHORTLIST = 16;
  var REC_SHOWN = 3;
  function recommend(r) {
    if (!plate.length) return [];
    var out = null;
    if (plateFull()) {
      /* Fewest recorded accords, then fewest bridges, the first added on a tie.
         An accord counts a hundred, so no number of bridges (fourteen at most)
         outweighs one. */
      var weight = {};
      plate.forEach(function (it) { weight[it.id] = 0; });
      r.rows.forEach(function (row) {
        var w = row.verdict === "ok" ? 100 : row.verdict === "mid" ? 1 : 0;
        weight[row.a.id] += w; weight[row.b.id] += w;
      });
      /* Never a drink: a swap would be the nudge toward one the loi Évin rules out. */
      plate.forEach(function (it) {
        if (!isAlcohol(byId[it.id]) && (!out || weight[it.id] < weight[out.id])) out = it;
      });
      if (!out) return [];
    }
    var keep = plate.filter(function (it) { return it !== out; });
    var skipped = {}, taken = {}, lone = {}, offered = {};
    roleRoom().forEach(function (g) { if (g.skipped) skipped[g.role] = true; });
    plate.forEach(function (it) { lineage(it.id).forEach(function (x) { taken[x] = true; }); });
    r.lonely.forEach(function (it) { lone[it.id] = true; });

    /* How many items here each candidate is recorded with, species included,
       and how many of those are on their own. A chosen form speaks alone, as
       it does in the engine: its own list, never the plain ingredient's.
       Bounded by the plate (MAX_FREE) times each item's recorded partners. */
    var tally = {};
    keep.forEach(function (it) {
      /* A drink's partners could only be offered through it, and no reason
         names a drink, so they would crowd the shortlist for nothing. */
      if (isAlcohol(byId[it.id])) return;
      var mine = {};
      if (it.form) itemPairs(it.id, it.form).forEach(function (c) { mine[c] = true; });
      else {
        lineage(it.id).forEach(function (x) {
          if (PAIRS[x]) PAIRS[x].forEach(function (c) { mine[c] = true; });
        });
        /* A base is in no PAIRS row; its own list is its only voice. */
        itemPairs(it.id, "").forEach(function (c) { mine[c] = true; });
      }
      /* A component's own ingredients are already in it: never offered back. */
      if (byId[it.id] && byId[it.id].isComp) {
        compById[it.id.slice(COMP_PREFIX.length)].ingredients.forEach(function (x) { delete mine[x.id]; });
      }
      Object.keys(mine).forEach(function (c) {
        var e = tally[c] || (tally[c] = { id: c, links: 0, lone: 0 });
        e.links++;
        if (lone[it.id]) e.lone++;
      });
    });
    /* Likeliest first: ties in a lonely item, then recorded with more of the
       plate, then recorded with more of the atlas, which leaves the most room
       to build on. The id settles the rest, so the offer never flickers. */
    var shortlist = Object.keys(tally).map(function (c) { return tally[c]; }).filter(function (e) {
      var i = byId[e.id];
      return i && PAIRS[e.id] && !isAlcohol(i) && i.cat !== "cellar" && !plateRemoved.has(e.id) &&
        !skipped[PLATE.roleOf(i)] && !lineage(e.id).some(function (x) { return taken[x]; }) &&
        (!out || PLATE.roleOf(i) === PLATE.roleOf(byId[out.id]));
    }).sort(function (x, y) {
      return y.lone - x.lone || y.links - x.links || PAIRS[y.id].size - PAIRS[x.id].size ||
        (x.id < y.id ? -1 : 1);
    }).slice(0, REC_SHORTLIST);

    /* Then what each actually does: the lonely items it ties in, the score it
       leaves, the items it is recorded with. */
    return shortlist.map(function (e, rank) {
      var cand = { id: e.id, form: "" };
      var rr = PLATE.judge(keep.concat([cand]), PLATE_CTX), still = {}, linked = [];
      rr.lonely.forEach(function (it) { still[it.id] = true; });
      rr.rows.forEach(function (row) {
        if (row.verdict !== "ok") return;
        var other = row.a === cand ? row.b : row.b === cand ? row.a : null;
        if (other && !isAlcohol(byId[other.id])) linked.push(other);
      });
      /* The reason names the lonely items first: they are what it is for. */
      linked.sort(function (x, y) {
        return (lone[y.id] ? 1 : 0) - (lone[x.id] ? 1 : 0) || plate.indexOf(x) - plate.indexOf(y);
      });
      /* ties: it links two things and the first was on its own — only then
         is "links A and B" true of it rather than "goes with A". */
      return { id: e.id, out: out, score: rr.score, linked: linked, rank: rank,
               ties: linked.length > 1 && !!lone[linked[0].id],
               rescued: r.lonely.filter(function (it) {
                 return !isAlcohol(byId[it.id]) && it !== out && !still[it.id];
               }).length };
    }).filter(function (s) {
      return s.linked.length && (!s.out || s.score > r.score);
    }).sort(function (x, y) {
      return y.rescued - x.rescued ||
        (y.score === null ? -1 : y.score) - (x.score === null ? -1 : x.score) ||
        y.linked.length - x.linked.length || x.rank - y.rank;
    }).filter(function (s) {
      /* One per species line, as `taken` holds between the plate and the
         candidates: the stronger offer came first in the sort and stays. */
      var mine = lineage(s.id);
      if (mine.some(function (x) { return offered[x]; })) return false;
      mine.forEach(function (x) { offered[x] = true; });
      return true;
    }).slice(0, REC_SHOWN);
  }

  /* An all-soft plate (the engine's plateAllSoft note) is offered the crunch
     components: the crunch family, else a powder tagged crisp, crunchy or
     brittle. Ranked first by whether its sweetness matches the plate's, then
     by how many items on the plate appear in the component's pairs or
     ingredients, then by how many share a partner with it; each is
     added in one tap, like the offers above. */
  var CRUNCH_TAGS = ["crisp", "crunchy", "brittle"];
  var CRUNCH_SHOWN = 3;
  function crunchOffer(r) {
    if (LOCKED || plateFull() || !r.texNotes.some(function (nt) { return nt.key === "plateAllSoft"; })) return [];
    var onPlate = {};
    plate.forEach(function (it) { onPlate[it.id] = true; });
    return COMP_ITEMS.filter(function (c) {
      if (onPlate[c.id] || plateRemoved.has(c.id)) return false;
      return c.family === "crunch" ||
        (c.family === "powders" && c.texture.some(function (x) { return CRUNCH_TAGS.indexOf(x) !== -1; }));
    }).map(function (c) {
      /* The engine says what it links to, as for recommend: a chosen form
         speaks only through its own list, and lineage is the engine's to
         exclude. A plate of components never appears in a pairs list (they
         are comp: ids), so a bridge through another component counts too —
         only there, and only through what the crunch is served with, never
         its recipe: through salt or butter nearly everything bridges.
         Neither a drink on the plate nor one as the shared partner is ever
         the reason (isAlcohol). */
      var cand = { id: c.id, form: "" }, linked = [], bridges = [],
          rec = compById[c.id.slice(COMP_PREFIX.length)];
      PLATE.judge(plate.concat([cand]), PLATE_CTX).rows.forEach(function (row) {
        var other = row.a === cand ? row.b : row.b === cand ? row.a : null, oi = other && byId[other.id];
        if (!other || (oi && isAlcohol(oi))) return;
        if (row.verdict === "ok") { linked.push(other); return; }
        if (row.verdict !== "mid" || !oi || !oi.isComp) return;
        /* The most particular partner names the bridge best: the one recorded
           with the fewest things. */
        var via = row.bridges.filter(function (x) {
          return (rec.pairs || []).indexOf(x) !== -1 && byId[x] && !isAlcohol(byId[x]);
        }).sort(function (x, y) {
          return PLATE_CTX.neighboursOf(x).length - PLATE_CTX.neighboursOf(y).length || (x < y ? -1 : 1);
        })[0];
        if (via) bridges.push({ item: other, via: via });
      });
      /* A dessert crunch: sugar in the recipe and no salt or umami in its
         taste (the engine's axes): the nougatine, not the granola salé or the
         beetroot tuile. It leads on a dessert plate and trails on the others. */
      var sweet = rec.ingredients.some(function (x) { return byId[x.id] && byId[x.id].cat === "sweet"; }) &&
        !c.flavor.some(function (f) { var a = PLATE.AXIS_BY_TAG[f]; return a === "salty" || a === "umami"; });
      return { id: c.id, linked: linked, bridges: bridges, fits: sweet === !!r.sweetPlate };
    }).filter(function (s) {
      /* A component recorded with nothing here would sit alone on the plate and
         lower the grade: only linked or bridged ones are offered. */
      return s.linked.length > 0 || s.bridges.length > 0;
    }).sort(function (a, b) {
      return (b.fits ? 1 : 0) - (a.fits ? 1 : 0) ||
        b.linked.length - a.linked.length || b.bridges.length - a.bridges.length ||
        (a.id < b.id ? -1 : 1);
    }).slice(0, CRUNCH_SHOWN);
  }

  /* Pairs with nothing recorded are named on one line, this many of them. */
  var NONE_NAMED = 6;

  /* The verdict reads top to bottom as the questions come: is this plate good
     (the score and its band), what holds it and what is on its own (one line),
     what to try next (the suggestions). Then the five tastes, the allergens a
     cook must write down, and the pairs. The arithmetic — every weighted note,
     texture and its caveat — waits behind "Why this grade". */
  function renderPlateVerdict() {
    var t = T(), box = el("plateVerdict");
    if (plate.length < 1) { box.innerHTML = ""; return; }
    var r = PLATE.judge(plate, PLATE_CTX);

    /* Some notes name ingredients; the rest are plain sentences. */
    function noteText(nt) {
      var txt = t[nt.key] || "";
      /* Everything on its own is one fact about the plate, not a list of it. */
      if (nt.key === "plateLonely" && nt.ids.length === r.count) return t.plateLonelyAll;
      if (nt.key === "plateLonely") return txt.replace("{names}", andList(nt.items.map(itemLabel)));
      if (nt.key === "plateSpine") {
        return txt.replace("{a}", name(byId[nt.ids[0]])).replace("{b}", name(byId[nt.ids[1]]));
      }
      if (nt.key === "plateAllergen") {
        var gk = { treeNuts: "allergenTreeNuts", peanut: "allergenPeanut", sesame: "allergenSesame" };
        return txt.replace("{names}", nt.ids.map(function (id) { return name(byId[id]); }).join(", "))
                  .replace("{groups}", nt.groups.map(function (g) { return t[gk[g]]; }).join(" \u00b7 "));
      }
      return txt;
    }
    function noteLi(nt) {
      var w = typeof nt.points === "number"
        ? '<span class="note-pts">' + (nt.points > 0 ? "+" : "\u2212") + Math.abs(nt.points) + "</span>"
        : "";
      return '<li class="plate-note ' + nt.level + '">' + w +
        '<span class="note-text">' + esc(noteText(nt)) + "</span></li>";
    }

    /* The score, and the band that gives it a meaning. Below three ingredients
       the engine returns null rather than a number nobody should act on. */
    var head = "";
    if (r.score !== null) {
      var step = SCALE.filter(function (s) { return s.band === r.band; })[0] || SCALE[SCALE.length - 1];
      head = '<div class="score-head">' +
        '<div class="score-line"><span class="score-label">' + esc(t.plateScore) + "</span>" +
        '<span class="score-band ' + r.band + '">' + esc(t[step.label]) + "</span></div>" +
        '<div class="score-bar"><span class="' + r.band + '" style="width:' + r.score + '%"></span></div>' +
        '<div class="score-n"><b>' + r.score + "</b><span>/ 100</span></div>" +
        /* The number alone taught nothing: a plate the atlas had never seen
           came out at 31 and read as a passing mark. The band's own sentence
           sits under the bar, always, not behind the detail toggle. */
        '<p class="score-meaning">' + esc(t[step.why]) + "</p>" +
        '<button type="button" class="score-why" data-plate-why aria-expanded="' +
          (plateWhyOpen ? "true" : "false") + '">' +
          esc(plateWhyOpen ? t.plateHide : t.plateWhy) + "</button></div>";
    }

    /* One line under the score: the spine, then who is on their own — or, when
       nobody is, that the set is well recorded. Below three, what to do next.
       A graded plate with none of those still gets its line: the count. */
    var said = {};
    r.structure.forEach(function (nt) { said[nt.key] = nt; });
    var sum = [said.plateSpine, said.plateLonely || said.plateTight, said.plateThin]
      .filter(function (nt) { return nt; });
    var summary = sum.length
      ? '<p class="plate-note plate-summary ' + (said.plateLonely ? "warn" : sum[0].level) + '">' +
          esc(sum.map(noteText).join(" ")) + "</p>"
      : r.score !== null
        ? '<p class="plate-note plate-summary info">' +
            esc(t.labSetCount.replace("{n}", r.direct).replace("{t}", r.rows.length)) + "</p>"
        : "";

    /* The pill the guided slots wear: one family of chips in the lab. The
       visible text is the button's whole name, so what a voice user reads
       is what they can say. */
    var offer = recommend(r).map(function (s) {
      var nm = name(byId[s.id]);
      var why = s.out ? t.recSwap.replace("{x}", itemLabel(s.out)).replace("{a}", itemLabel(s.linked[0]))
        : s.ties
          ? t.recLinks.replace("{a}", itemLabel(s.linked[0])).replace("{b}", itemLabel(s.linked[1]))
          : t.recGoesWith.replace("{a}", itemLabel(s.linked[0]));
      return '<button type="button" class="plate-slot" data-plate-add="' + esc(s.id) + '"' +
        (s.out ? ' data-plate-swap="' + esc(s.out.id) + '"' : "") + ">" +
        /* The space keeps the two apart in the name a screen reader builds;
           in the flex row it takes no room. */
        '<span class="slot-role">' + esc(nm) + "</span> " +
        '<span class="rec-why">' + esc(why) + "</span></button>";
    }).join("");
    if (offer) offer = "<h3>" + esc(t.plateRecs) + "</h3>" + '<div class="plate-slots plate-recs">' + offer + "</div>";
    /* The plate is all soft: crunch components to add, same chips as above. */
    var crunch = crunchOffer(r).map(function (s) {
      var why = s.linked.length ? t.recGoesWith.replace("{a}", itemLabel(s.linked[0]))
        : t.recSharesWith.replace("{via}", name(byId[s.bridges[0].via])).replace("{a}", itemLabel(s.bridges[0].item));
      return '<button type="button" class="plate-slot" data-plate-add="' + esc(s.id) + '">' +
        '<span class="slot-role">' + esc(name(byId[s.id])) + "</span> " +
        '<span class="rec-why">' + esc(why) + "</span></button>";
    }).join("");
    if (crunch) offer += "<h3>" + esc(t.compCrunchOffer) + "</h3>" + '<div class="plate-slots plate-recs">' + crunch + "</div>";

    /* One strip of cells, each a taste and how many things on the plate carry
       it: "2 of 4". The five tastes are drawn in full, zeroes included: an
       empty cell is the finding — sweet, salt, acid, bitter, umami, and a cook
       reads the gap. Not on salt: a cook seasons, so nothing is missing when no
       salty ingredient is listed; it is marked as taken for granted. The
       supporting axes use the same strip, present ones only, because there a
       missing cell and an empty one say the same thing. */
    function strip(axes) {
      return '<ul class="taste-strip">' + axes.map(function (a) {
        var v = r.axes[a], cls = v ? "on" : a === "salty" ? "assumed" : "off";
        return '<li class="taste ' + cls + '"><span class="taste-name">' + esc(t.axes[a]) + "</span>" +
          '<span class="taste-val">' + esc(cls === "assumed" ? t.plateSaltAssumed
            : t.plateTasteOf.replace("{v}", v).replace("{n}", r.count)) + "</span></li>";
      }).join("") + "</ul>";
    }
    var support = PLATE.SUPPORT.filter(function (a) { return r.axes[a] > 0; })
      .sort(function (a, b) { return r.axes[b] - r.axes[a]; });

    /* One mark a row — ✓ recorded, ~ a shared partner, · nothing — and the
       reason in small type under the pair. The pairs with nothing recorded
       share the last row: the same sentence down three rows was what made
       this list a wall. */
    function setRow(v, mark, pair, why) {
      return '<li class="lab-set-row"><span class="pair-mark ' + v + '" aria-hidden="true">' + mark + "</span>" +
        '<span class="lab-set-pair">' + pair + '<span class="lab-set-why">' + esc(why) + "</span></span></li>";
    }
    var cohesion = "";
    if (r.rows.length) {
      var told = r.rows.filter(function (row) { return row.verdict !== "none"; }).sort(function (x, y) {
        return (x.verdict === "ok" ? 0 : 1) - (y.verdict === "ok" ? 0 : 1);
      });
      var blank = r.rows.filter(function (row) { return row.verdict === "none"; });
      var unnamed = blank.length - NONE_NAMED;
      cohesion = "<h3>" + esc(t.plateCohesion) + ' <span class="lab-set-count">' +
        esc(t.labSetCount.replace("{n}", r.direct).replace("{t}", r.rows.length)) + "</span></h3>" +
        '<ul class="lab-set marks">' + told.map(function (row) {
          return setRow(row.verdict, row.verdict === "ok" ? "\u2713" : "~",
            esc(itemLabel(row.a)) + ' <span class="lab-x" aria-hidden="true">\u00d7</span> ' +
            esc(itemLabel(row.b)) +
            (row.via ? '<span class="lab-set-via">' + esc(viaLine(row.via)) + "</span>" : ""),
            pairNote(row));
        }).join("") +
        (blank.length
          ? setRow("none", "\u00b7", blank.slice(0, NONE_NAMED).map(function (row) {
              return esc(itemLabel(row.a)) + ' <span class="lab-x" aria-hidden="true">\u00d7</span> ' +
                esc(itemLabel(row.b));
            }).join(", ") + (unnamed > 0 ? " (+" + unnamed + ")" : ""), t.pairNoneRest)
          : "") + "</ul>";
    }

    /* Everything behind the grade: the scale, the split, the weighted notes,
       texture (read beside the tastes, without a score: it earns none), and
       what the lab leaves out. Only with a grade to explain. */
    var detail = plateWhyOpen && head
      ? '<div class="score-scale"><h3>' + esc(t.scaleTitle) + "</h3>" +
          '<p class="scale-intro">' + esc(t.scaleIntro.replace("{p}", fmt(EDGE_COUNT))) + "</p>" +
          '<ol class="scale-grid">' + SCALE.map(function (s) {
            return '<li class="' + (s.band === r.band ? "on" : "") + '">' +
              '<span class="scale-range">' + (s.lo === s.hi ? s.lo : s.lo + "\u2013" + s.hi) + "</span>" +
              '<span class="scale-band ' + s.band + '">' + esc(t[s.label]) + "</span>" +
              '<span class="scale-why">' + esc(t[s.why]) + "</span></li>";
          }).join("") + "</ol>" +
          '<p class="scale-foot">' + esc(t.scaleFootnote) + "</p></div>" +
        '<p class="plate-split">' +
          esc(t.plateSplit.replace("{f}", r.flavour).replace("{c}", r.cohesion)) + "</p>" +
        (support.length ? "<h3>" + esc(t.plateSupport) + "</h3>" + strip(support) : "") +
        (r.notes.length ? '<ul class="plate-notes">' + r.notes.map(noteLi).join("") + "</ul>" : "") +
        (r.texture !== null && r.texNotes.length
          ? "<h3>" + esc(t.plateTexture) + ' <span class="lab-set-count">' +
              esc(t.plateTextureN.replace("{n}", r.textured).replace("{t}", r.count)) + "</span></h3>" +
            '<ul class="plate-notes">' + r.texNotes.map(noteLi).join("") + "</ul>"
          : "") +
        '<p class="plate-caveat">' + esc(t.plateNoTexture) + "</p>"
      : "";

    box.innerHTML = head + summary + offer +
      "<h3>" + esc(t.plateTastes) + ' <span class="lab-set-count">' +
        esc(t.plateTastesN.replace("{n}", r.tastes)) + "</span></h3>" +
      strip(PLATE.PRIMARY) +
      detail +
      /* Declarable allergens: information a cook must write down, not a verdict. */
      (r.flags && r.flags.length
        ? "<h3>" + esc(t.plateFlags) + "</h3>" +
          '<ul class="plate-notes">' + r.flags.map(noteLi).join("") + "</ul>"
        : "") +
      '<p class="plate-caveat">' + esc(t.plateAllergenCaveat) + "</p>" +
      cohesion;
  }

  /* Slide the pill to whichever choice is active. Measured, not assumed: the
     two labels in a group are rarely the same width. A group that is not on
     screen measures zero, so this runs after the panel is shown, never before. */
  function paintSeg(id) {
    var g = el(id);
    if (!g) return;
    var on = g.querySelector("button.active");
    var ind = g.querySelector(".seg-ind");
    var born = false;
    if (!ind) {
      ind = document.createElement("span");
      ind.className = "seg-ind";
      ind.setAttribute("aria-hidden", "true");
      g.insertBefore(ind, g.firstChild);
      born = true;
    }
    if (!on || !on.offsetWidth) { ind.style.opacity = "0"; return; }

    var w = on.offsetWidth + "px", x = "translateX(" + on.offsetLeft + "px)";
    if (born) {
      /* A brand-new element has no rendered start state, so the browser may
         collapse the first placement and every later one into a single frame
         with nothing to animate. Read a layout property to settle it at its
         CSS start (width 0, untranslated) before moving it for the first
         time. */
      /* eslint-disable-next-line no-unused-expressions */
      ind.offsetWidth;
    }
    ind.style.opacity = "1";
    ind.style.width = w;
    ind.style.transform = x;
  }
  /* The pill is measured, not laid out, so a window that changes width (a phone
     turned, a window dragged across the 600px or 720px layout) leaves it off its
     button until it is measured again. One repaint per frame. */
  var segFrame = 0;
  window.addEventListener("resize", function () {
    cancelAnimationFrame(segFrame);
    segFrame = requestAnimationFrame(function () {
      ["viewTabs", "langToggle", "labModes", "plateModes"].forEach(paintSeg);
    });
  });

  /* At 375px the plate's search box has 275px for text, and the full
     placeholder needs 389 in French: phones get the short one, from the
     breakpoint of the lab's own CSS block. The box keeps the full text as its
     name. A rotation or resize across the line swaps it, nothing more. */
  var PHONE = window.matchMedia ? window.matchMedia("(max-width: 600px)") : null;
  function platePlaceholder() {
    var t = T();
    el("plateSearch").placeholder = PHONE && PHONE.matches ? t.plateSearchPhShort : t.plateSearchPh;
    el("plateSearch").setAttribute("aria-label", t.plateSearchPh);
  }
  if (PHONE) PHONE.addEventListener("change", platePlaceholder);

  function renderPlateAll() {
    var t = T();
    el("plateHint").textContent = plateMode === "guided"
      ? t.plateHintGuided
      : t.plateHintFree.replace("{n}", PLATE.MAX_FREE);
    platePlaceholder();
    el("plateGuided").textContent = t.plateGuided;
    el("plateFree").textContent = t.plateFree;
    el("labModePair").textContent = t.labModePair;
    el("labModePlate").textContent = t.labModePlate;
    /* .active is what .lang-toggle/.tier-toggle style; .on lit nothing. */
    el("plateGuided").classList.toggle("active", plateMode === "guided");
    el("plateFree").classList.toggle("active", plateMode === "free");
    el("labModePair").classList.toggle("active", labMode === "pair");
    el("labModePlate").classList.toggle("active", labMode === "plate");
    paintSeg("labModes");
    paintSeg("plateModes");
    /* Only guided has a template to choose. */
    el("plateTplRow").hidden = plateMode !== "guided";
    var tsel = el("plateTpl");
    tsel.innerHTML = PLATE.TEMPLATES.map(function (x) {
      return '<option value="' + x.id + '">' + esc(t.templates[x.id]) + "</option>";
    }).join("");
    tsel.value = plateTpl;
    tsel.setAttribute("aria-label", t.plateTplLabel);
    if (plateFinder) plateFinder.render(plateFinder.isOpen());
    renderPlateSlots();
    renderPlateItems();
    renderPlateVerdict();
  }

  function setLabMode(m) {
    labMode = m;
    el("labPair").hidden = m !== "pair";
    el("labPlate").hidden = m !== "plate";
    renderPlateAll();
    /* plateModes lives inside labPlate: while that was hidden it measured zero,
       so the pill can only be placed once the panel is on screen. */
    paintSeg("plateModes");
  }
  function setPlateMode(m) {
    if (m === plateMode) return;
    plateMode = m;
    el("plateSearch").value = "";
    /* Nothing is dropped on the way in or out: the slots are a suggestion, so a
       plate that does not match the template is simply a plate with empty
       slots rather than a plate that has to lose ingredients. */
    renderPlateAll();
  }

  /* On the plate if there is room and it is not there yet; true when it went on.
     No form is chosen here. Only 11 of 1 838 entries have one, so asking
     before every add is noise for the other 1 827 — the chip carries the
     choice, for the few that offer it. */
  function putOnPlate(id) {
    if (!id || !byId[id] || plateFull()) return false;
    if (plate.some(function (it) { return it.id === id; })) return false;
    plate.push({ id: id, form: "" });
    plateRemoved.delete(id);
    return true;
  }

  function addToPlate(id) {
    if (!putOnPlate(id)) return;
    el("plateSearch").value = "";
    plateFinder.close();
    renderPlateAll();
    el("plateSearch").focus();
  }


  /* ---------- trios section ---------- */
  function renderTrios() {
    el("triosGrid").innerHTML = TRIOS.filter(trioKnown).map(function (tr) {
      return '<div class="trio-card">' +
        '<div class="trio-arts">' + tr.ids.map(function (x) { return art(byId[x]); }).join("") + "</div>" +
        "<h3>" + esc(tr.name[state.lang]) + "</h3>" +
        '<p class="trio-ings">' + tr.ids.map(function (x) {
          return '<button type="button" data-open="' + x + '">' + esc(name(byId[x])) + "</button>";
        }).join(" + ") + "</p>" +
        '<p class="trio-note">' + esc(tr.note[state.lang]) + "</p>" +
        "</div>";
    }).join("");
  }

  /* ---------- creations: custom ingredients ---------- */
  var createState = null;

  function slugify(s) { return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x"; }

  function openCreate() {
    createState = { type: "ing", picked: [], editId: null, notes: "", coeur: false };
    renderCreateForm();
    opener = document.activeElement;
    el("createOverlay").hidden = false;
    document.body.style.overflow = "hidden";
    el("createClose").focus();
  }
  function closeCreate() {
    el("createOverlay").hidden = true;
    document.body.style.overflow = "";
    createState = null;
    if (opener && opener.focus) opener.focus();
    opener = null;
  }

  function renderCreateForm() {
    var t = T(), s = createState;
    var picker = '<div class="cf-label">' + esc(t.pairsWith) + "</div>" +
      '<div class="picker"><input type="text" id="cPick" list="atlasList" placeholder="' + esc(t.searchIngPh) + '">' +
      '<button type="button" id="cPickAdd">' + esc(t.addBtn) + "</button></div>" +
      '<datalist id="atlasList">' + ING.map(function (i) { return '<option value="' + esc(name(i)) + '">'; }).join("") + "</datalist>" +
      '<div id="cPairs" class="picked-chips"></div>';
    var common = "<label>" + esc(t.notesLbl) + '<textarea id="cNotes">' + esc(s.notes || "") + "</textarea></label>" +
      '<label class="check-inline"><input type="checkbox" id="cCoeur"' + (s.coeur ? " checked" : "") + "> " + esc(t.coeurLbl) + "</label>" +
      '<p class="cf-err" id="cErr"></p>' +
      '<button type="button" id="cSave" class="m-lab-btn">' + esc(t.saveBtn) + "</button>";
    var body = '<div class="cf-row2"><label>' + esc(t.nameEn) + '<input type="text" id="cNameEn"></label>' +
        "<label>" + esc(t.nameFr) + '<input type="text" id="cNameFr"></label></div>' +
        "<label>" + esc(t.family) + '<select id="cCat">' +
        CAT_ORDER.map(function (c) { return '<option value="' + c + '">' + esc(t.categories[c]) + "</option>"; }).join("") +
        "</select></label>" +
        '<div class="cf-label">' + esc(t.flavorNotes) + "</div>" +
        '<div class="fchips" id="cFlavors">' +
        Object.keys(t.flavors).map(function (f) { return '<button type="button" class="tag" data-fl="' + f + '" aria-pressed="false">' + esc(t.flavors[f]) + "</button>"; }).join("") +
        "</div>" + picker + common;
    el("createModal").innerHTML =
      '<div class="modal-bar"><span class="cform-title" id="createTitle">' + esc(t.createTitle) + "</span>" +
      '<button type="button" class="ghost" id="createClose" aria-label="' + esc(t.close) + '">&#10005;</button></div>' +
      '<div class="modal-body cform">' + body + "</div>";
    renderPicked();
  }

  function renderPicked() {
    if (!el("cPairs")) return;
    var t = T();
    var html = createState.picked.map(function (id) {
      var i = byId[id];
      if (!i) return "";
      return '<span class="pair-chip">' + art(i) + "<span>" + esc(name(i)) + '</span>' +
        '<button type="button" class="rm" data-rm="' + id + '" aria-label="' + esc(t.removePick.replace("{name}", name(i))) + '">&#10005;</button></span>';
    }).join("");
    el("cPairs").innerHTML = html;
  }

  function addPick() {
    var inp = el("cPick"), raw = inp.value.trim(), v = norm(raw);
    if (!v) return;
    var match = ING.filter(function (i) { return norm(i.name.en) === v || norm(i.name.fr) === v; })[0];
    if (match) {
      if (createState.picked.indexOf(match.id) === -1) createState.picked.push(match.id);
    } else {
      el("cErr").textContent = T().noMatch;
      return;
    }
    el("cErr").textContent = "";
    inp.value = "";
    renderPicked();
  }

  function saveCreation() {
    var t = T(), s = createState;
    var notes = el("cNotes").value.trim(), coeur = el("cCoeur").checked;
      var ne = el("cNameEn").value.trim(), nf = el("cNameFr").value.trim();
      if (!ne && !nf) { el("cErr").textContent = t.nameRequired; return; }
      ne = ne || nf; nf = nf || ne;
      var id = "c-" + slugify(nf), n = 2;
      while (byId[id]) id = "c-" + slugify(nf) + "-" + (n++);
      myIngs.push({
        id: id, cat: el("cCat").value, custom: true, coeur: coeur,
        name: { en: ne, fr: nf }, latin: "", origin: { en: "", fr: "" }, season: [],
        flavor: Array.from(el("cFlavors").querySelectorAll(".tag.on")).map(function (b) { return b.getAttribute("data-fl"); }),
        story: { en: notes, fr: notes }, tip: { en: "", fr: "" },
        pairs: s.picked.slice(), svg: ""
      });
      localStorage.setItem(LS_MYINGS, JSON.stringify(myIngs));
      rebuildIndex();
      closeCreate();
      renderAll();
      openModal(id);
  }

  function deleteIng(id) {
    if (!confirm(T().deleteConfirm)) return;
    myIngs = myIngs.filter(function (i) { return i.id !== id; });
    localStorage.setItem(LS_MYINGS, JSON.stringify(myIngs));
    if (photosMap[id]) { delete photosMap[id]; if (idb) idbDel(id).catch(function () {}); }
    favs.delete(id);
    localStorage.setItem(LS_FAVS, JSON.stringify(Array.from(favs)));
    rebuildIndex();
    renderAll();
  }

  function renderCreations() {
    var t = T(), out = [];
    // Same shape as a grid card: the delete button beside the keyboard target, not inside it.
    myIngs.forEach(function (i) {
      out.push('<div class="creation-card cc-ing" data-open="' + i.id + '">' +
        '<button type="button" class="cc-del" data-del-ing="' + i.id + '" title="' + esc(t.deleteConfirm) + '" aria-label="' + esc(t.deleteConfirm) + '">&#10005;</button>' +
        '<div class="cc-main" tabindex="0" role="button">' +
        '<div class="trio-arts">' + art(i) + "</div>" +
        "<h3>" + esc(name(i)) + (i.coeur ? ' <span class="coeur-mark" title="' + esc(t.coeurMark) + '">♥</span>' : "") + "</h3>" +
        '<p class="cc-type">' + esc(catLabel(i.cat)) + " · " + esc(t.creationLabel) + "</p>" +
        (i.story[state.lang] ? '<p class="trio-note">' + esc(i.story[state.lang].slice(0, 110)) + "</p>" : "") +
        "</div></div>");
    });
    el("creationsGrid").innerHTML = out.length ? out.join("") :
      '<p class="empty" style="grid-column:1/-1">' + esc(t.emptyCreations) + "</p>";
  }

  /* ---------- render all ---------- */
  function renderAll() {
    applyStatic();
    renderCats();
    renderDaily();
    renderGrid();
    /* The lab and the trios are the full version and share a tab of their own;
       locked, that tab opens #lockedView and nothing in #labView is drawn. */
    if (!LOCKED) {
      fillLabInputs();
      renderLabResult();
      renderPlateAll();
      renderTrios();
    }
    renderCreations();
    /* every non-atlas view has to re-render too, or a language switch leaves it
       in the old language — keyed off state.view so a new view cannot be missed */
    if (viewLocked(state.view)) { renderLockedView(state.view); return; }
    var render = { chefs: renderChefs, tech: renderTech, bases: renderBases, components: renderComponents,
                   sub: renderSub };
    if (render[state.view]) render[state.view]();
  }

  function setLang(l) {
    state.lang = l;
    localStorage.setItem(LS_LANG, l);
    renderAll();
    refreshOpenModal();
  }

  /* ---------- motion ---------- */
  /* The search placeholder types out what the field understands — an
     ingredient, a flavour, a family — while the field is empty and nobody is
     in it. Focus restores the full sentence at once; the aria-label is never
     touched, so assistive tech reads one stable name. */
  var TW = { timer: null };
  function startTypewriter() {
    stopTypewriter();
    var input = el("search"), t = T();
    if (reducedMotion() || document.activeElement === input || input.value) return;
    var words = t.searchPhrases || (state.lang === "fr"
      ? ["un ingrédient", "une saveur", "une famille"]
      : ["an ingredient", "a flavour", "a family"]);
    var lead = t.searchLead || (state.lang === "fr" ? "Rechercher " : "Search ");
    var w = 0, n = 0, phase = "type";
    function tick() {
      var word = words[w], delay = 70;
      if (phase === "type") { n++; if (n >= word.length) { phase = "hold"; delay = 1600; } }
      else if (phase === "hold") { phase = "erase"; delay = 40; }
      else { n--; if (n <= 0) { phase = "type"; w = (w + 1) % words.length; delay = 260; } }
      input.placeholder = lead + word.slice(0, Math.max(0, n)) + (phase === "hold" ? "\u2026" : "");
      TW.timer = setTimeout(tick, delay);
    }
    TW.timer = setTimeout(tick, 900);
  }
  function stopTypewriter() {
    if (TW.timer) { clearTimeout(TW.timer); TW.timer = null; }
    el("search").placeholder = T().searchPh;
  }
  el("search").addEventListener("focus", stopTypewriter);
  el("search").addEventListener("blur", function () { if (!el("search").value) startTypewriter(); });

  /* A tab left open past midnight gets the new day's ingredient without a
     reload; the fresh card rises in through the .daily rules in style.css. */
  var dailyKey = new Date().toDateString();
  setInterval(function () {
    var k = new Date().toDateString();
    if (k !== dailyKey) { dailyKey = k; renderDaily(); }
  }, 60000);

  /* ---------- events ---------- */
  el("lang-en").addEventListener("click", function () { setLang("en"); });
  el("lang-fr").addEventListener("click", function () { setLang("fr"); });

  /* Typing in the top search is looking for an ingredient, whatever tab it
     starts from: the atlas comes forward and everything between the box and
     the grid folds away (the day's ingredient, the families, the filters), so
     the results are the first thing under it. The header stays pinned, so
     bringing the grid up under it never hides the box being typed in. */
  function onSearch(value) {
    var was = !!state.q.trim();
    state.q = value;
    var on = !!state.q.trim(), moved = on && state.view !== "atlas";
    el("atlasView").classList.toggle("searching", on);
    if (moved) setView("atlas");
    renderGrid();
    /* The top of the page when a search starts, and again when it pulls the
       atlas back from another tab, which left the page at that tab's scroll.
       With the filters folded away the results already sit under the tabs;
       scrolling them up under the header hid the tabs for nothing. */
    if (on && (!was || moved) && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    }
  }
  el("search").addEventListener("input", function (e) { onSearch(e.target.value); });
  el("monthBtns").addEventListener("click", function (e) {
    var b = e.target.closest("[data-month]");
    if (!b) return;
    var m = +b.getAttribute("data-month"), at = state.months.indexOf(m);
    if (at === -1) state.months.push(m); else state.months.splice(at, 1);
    renderMonthPick();
    el("monthBtns").querySelector('[data-month="' + m + '"]').focus();
    renderGrid();
  });
  el("favsOnly").addEventListener("change", function (e) { state.favsOnly = e.target.checked; renderGrid(); });
  el("rareOnly").addEventListener("change", function (e) { state.rareOnly = e.target.checked; renderGrid(); });
  el("luxeOnly").addEventListener("change", function (e) { state.luxeOnly = e.target.checked; renderGrid(); });
  el("signOnly").addEventListener("change", function (e) { state.signOnly = e.target.checked; renderGrid(); });
  el("priceBand").addEventListener("change", function (e) { state.priceBand = e.target.value; renderGrid(); });
  el("flavour").addEventListener("change", function (e) { state.flavour = e.target.value; renderGrid(); });
  el("sort").addEventListener("change", function (e) { state.sort = e.target.value; renderGrid(); });
  el("random").addEventListener("click", function () {
    openModal(ING[Math.floor(Math.random() * ING.length)].id);
  });

  el("cats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]");
    if (!b) return;
    state.cat = b.getAttribute("data-cat");
    renderCats(); renderGrid();
  });

  el("grid").addEventListener("click", function (e) {
    var f = e.target.closest("[data-fav]");
    if (f) {
      var id = f.getAttribute("data-fav");
      if (favs.has(id)) favs.delete(id); else favs.add(id);
      localStorage.setItem(LS_FAVS, JSON.stringify(Array.from(favs)));
      renderGrid();
      return;
    }
    var c = e.target.closest(".card");
    if (c) openModal(c.getAttribute("data-id"));
  });

  /* Every element that opens or switches an entry — chips in the grid, the
     trios, a chef, the dialog itself — is handled here, once. A second handler
     on #modalBody used to open the same entry twice per click. */
  document.body.addEventListener("click", function (e) {
    var mp = e.target.closest("[data-morepairs]");
    if (mp) {
      var rest = mp.parentNode.querySelector(".pair-rest");
      if (rest) rest.hidden = false;
      mp.remove();
      return;
    }
    var pp = e.target.closest("[data-photo-pick]");
    if (pp) { photoTarget = pp.getAttribute("data-photo-pick"); el("photoFile").click(); return; }
    var pd = e.target.closest("[data-photo-del]");
    if (pd) { deletePhoto(pd.getAttribute("data-photo-del")); return; }
    var sk = e.target.closest("[data-plate-skip]");
    if (sk) {
      var role = sk.getAttribute("data-plate-skip");
      if (plateSkip[skipKey(role)]) delete plateSkip[skipKey(role)];
      else {
        plateSkip[skipKey(role)] = true;
      }
      renderPlateAll();
      return;
    }
    var why = e.target.closest("[data-plate-why]");
    if (why) { plateWhyOpen = !plateWhyOpen; renderPlateVerdict(); return; }
    /* A suggestion goes on the plate; a swap takes the place of what it
       replaces. The clicked chip is gone with the redraw, so focus moves to
       the next suggestion, or back to the search when none is left. */
    var rec = e.target.closest("[data-plate-add]");
    if (rec) {
      var swapOut = rec.getAttribute("data-plate-swap"), at = -1;
      plate.forEach(function (it, k) { if (it.id === swapOut) at = k; });
      if (at >= 0) plate.splice(at, 1, { id: rec.getAttribute("data-plate-add"), form: "" });
      else putOnPlate(rec.getAttribute("data-plate-add"));
      renderPlateAll();
      (el("plateVerdict").querySelector("[data-plate-add]") || el("plateSearch")).focus();
      return;
    }
    /* × redraws the chips and drops focus on the page: it goes to the × now
       at the same place, else the one before, else the search. */
    var px = e.target.closest("[data-plate-del]");
    if (px) {
      var gone = parseInt(px.getAttribute("data-plate-del"), 10);
      if (plate[gone]) plateRemoved.add(plate[gone].id);
      plate.splice(gone, 1);
      if (!plate.length) plateRemoved.clear();   // an emptied plate starts a new dish
      renderPlateAll();
      (el("plateItems").querySelector('[data-plate-del="' + Math.min(gone, plate.length - 1) + '"]') ||
        el("plateSearch")).focus();
      return;
    }
    /* A locked view's button opens the subscription tab and moves focus to
       its tab, since the button itself is gone with the panel. */
    var sb = e.target.closest("[data-sub]");
    if (sb) { setView("sub"); el("tabSub").focus(); return; }
    /* A paid name opens the full-version panel naming it; anything else marked
       data-full opens it plain. Inside the dialog it stacks, so ← comes back. */
    var ac = e.target.closest("[data-account]");
    if (ac) { ME = null; openItem("account", ""); return; }
    var so = e.target.closest("[data-signout]");
    if (so) { signOut(so.getAttribute("data-signout") === "all", so); return; }
    var lk = e.target.closest("[data-locked]");
    if (lk) { openItem("full", lk.getAttribute("data-locked")); return; }
    var fu = e.target.closest("[data-full]");
    if (fu) { openItem("full", ""); return; }
    var o = e.target.closest("[data-open]");
    if (o) { openModal(o.getAttribute("data-open")); return; }
    var k = e.target.closest("[data-tech]");
    if (k) { openTech(k.getAttribute("data-tech")); return; }
    var d = e.target.closest("[data-baselink]");
    if (d) { openBase(d.getAttribute("data-baselink")); return; }
    var cl = e.target.closest("[data-complink]");
    if (cl) { openComp(cl.getAttribute("data-complink")); return; }
    var br = e.target.closest("[data-branch]");
    if (br) {
      treeSel = br.getAttribute("data-branch");
      var host = el("treeSec");
      if (host) {
        var tmp = document.createElement("div");
        tmp.innerHTML = renderTree(byId[currentIng()]);
        host.replaceWith(tmp.firstChild);
      }
      return;
    }
    var lab = e.target.closest("[data-lab]");
    if (lab) {
      var id = lab.getAttribute("data-lab");
      closeModal();
      // setView hides every panel but the current one, so a jump into the lab
      // has to switch to the lab's tab or it scrolls to a hidden element.
      setView("lab");
      setLabMode("pair");
      setLabPick("A", id);
      el("lab").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
      if (!labPick.B) el("labB").focus();
      return;
    }
    /* A dish carries more than two ingredients, and the lab's two slots hold a
       pair. Rather than seed two and drop the rest, open it on the whole set:
       every pair among them, which is the question the dish actually poses. */
    var dishLab = e.target.closest("[data-dishlab]");
    if (dishLab) {
      setView("lab");
      setLabMode("pair");
      labPick.A = labPick.B = ""; el("labA").value = el("labB").value = "";
      renderLabSet(dishLab.getAttribute("data-dishlab").split(","),
                   dishLab.getAttribute("data-dishname") || "");
      el("lab").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
    }
  });
  /* Cards, the daily block, creation cards and tree branches are role=button
     on a div or an svg group: Enter and Space act as a click, and the click
     handlers above do the rest. Native buttons already do this themselves. */
  document.body.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var n = e.target;
    if (!n.matches || !n.matches('[role="button"]:not(button)')) return;
    e.preventDefault();
    n.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  el("closeBtn").addEventListener("click", closeModal);
  el("backBtn").addEventListener("click", backModal);
  el("overlay").addEventListener("click", function (e) { if (e.target === el("overlay")) closeModal(); });


  /* plate events */
  el("labModePair").addEventListener("click", function () { setLabMode("pair"); });
  el("labModePlate").addEventListener("click", function () { setLabMode("plate"); });
  el("plateGuided").addEventListener("click", function () { setPlateMode("guided"); });
  el("plateFree").addEventListener("click", function () { setPlateMode("free"); });
  el("plateTpl").addEventListener("change", function (e) {
    plateTpl = e.target.value;
    renderPlateAll();
  });
  /* Delegated, because the chips are rebuilt on every render. */
  el("plateItems").addEventListener("change", function (e) {
    var sel = e.target.closest("[data-plate-form]");
    if (!sel) return;
    var k = parseInt(sel.getAttribute("data-plate-form"), 10);
    if (plate[k]) { plate[k].form = sel.value; renderPlateAll(); }
  });
  plateFinder = makeFinder({
    input: el("plateSearch"), list: el("plateResults"),
    hits: plateSearchHits,
    /* It opens on a query only: typing is the one way in, as in the lab's
       two boxes. A role picker that listed a whole family on focus was the
       old dropdown again. */
    opens: function (q) { return !!q; },
    pick: addToPlate
  });
  ["A", "B"].forEach(function (slot) {
    function holds() {
      return !!labPick[slot] && el("lab" + slot).value.trim() === name(byId[labPick[slot]]);
    }
    makeFinder({
      input: el("lab" + slot), list: el("lab" + slot + "Results"),
      hits: labSlotHits(slot),
      /* A box that already shows its chosen ingredient stays shut on focus: the
         list would cover the verdict to offer what is already chosen. */
      opens: function (q) { return !!q && !holds(); },
      holds: holds,
      /* Typing over a chosen name un-chooses it: the verdict must never belong
         to a pair the boxes no longer show. */
      typed: function () {
        if (labPick[slot]) { labPick[slot] = ""; renderLabResult(); }
      },
      pick: function (id) {
        setLabPick(slot, id);
        /* The first pick leads straight on to the second box; otherwise focus
           stays put, and the verdict is announced from its live region. */
        if (slot === "A" && !labPick.B) el("labB").focus();
      }
    });
  });

  /* creations events */
  el("createBtn").addEventListener("click", function () { openCreate(); });
  el("tabAtlas").addEventListener("click", function () { setView("atlas"); });
  el("tabChefs").addEventListener("click", function () { setView("chefs"); });
  el("tabTech").addEventListener("click", function () { setView("tech"); });
  el("tabBases").addEventListener("click", function () { setView("bases"); });
  el("tabComponents").addEventListener("click", function () { setView("components"); });
  el("tabLab").addEventListener("click", function () { setView("lab"); });
  el("tabSub").addEventListener("click", function () { setView("sub"); });
  el("techSearch").addEventListener("input", function (e) { state.techQ = e.target.value; renderTech(); });
  el("techGroup").addEventListener("change", function (e) { state.techGroup = e.target.value; renderTech(); });
  el("baseSearch").addEventListener("input", function (e) { state.baseQ = e.target.value; renderBases(); });
  el("baseGroup").addEventListener("change", function (e) { state.baseGroup = e.target.value; renderBases(); });
  /* a base's ingredient chip opens the ingredient; a technique chip jumps to it */
  el("baseList").addEventListener("click", function (e) {
    var card = e.target.closest("[data-base]");
    if (card) { openBase(card.getAttribute("data-base")); return; }
  });
  el("compSearch").addEventListener("input", function (e) { state.compQ = e.target.value; renderComponents(); });
  el("compFamily").addEventListener("change", function (e) { state.compFamily = e.target.value; renderComponents(); });
  el("compOrigin").addEventListener("change", function (e) { state.compOrigin = e.target.value; renderComponents(); });
  el("componentList").addEventListener("click", function (e) {
    var card = e.target.closest("[data-comp]");
    if (card) openComp(card.getAttribute("data-comp"));
  });
  /* a letter of the glossary rail jumps to its section: the sticky header's height
     is measured at the click (it is one row on a desktop and three on a phone), so
     the heading is never left under it, and focus moves to the section's first
     entry so the next Tab reads on from there. */
  el("techRail").addEventListener("click", function (e) {
    var b = e.target.closest("[data-az]"), sec = b && el("techaz-" + b.getAttribute("data-az"));
    if (!sec) return;
    var head = document.querySelector(".site-head");
    sec.style.scrollMarginTop = ((head ? head.offsetHeight : 0) + 8) + "px";
    sec.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    var first = sec.querySelector(".az-row");
    if (first) first.focus({ preventScroll: true });
  });
  el("techList").addEventListener("click", function (e) {
    var c = e.target.closest("[data-tech-card]");
    if (c) openTech(c.getAttribute("data-tech-card"));
  });
  el("chefSearch").addEventListener("input", function (e) { state.chefQ = e.target.value; renderChefs(); });
  ["chefGender","chefStars","chefCountry","chefEra"].forEach(function (id) {
    el(id).addEventListener("change", function (e) { state[id] = e.target.value; renderChefs(); });
  });
  el("chefReset").addEventListener("click", function () {
    state.chefQ = ""; state.chefGender = state.chefStars = state.chefCountry = state.chefEra = "all";
    el("chefSearch").value = ""; renderChefs();
  });

  /* photo events: hidden picker + drag & drop */
  var photoTarget = null;
  el("photoFile").addEventListener("change", function (e) {
    var f = e.target.files[0];
    if (f && photoTarget) attachPhoto(photoTarget, f);
    e.target.value = "";
    photoTarget = null;
  });
  var dropEl = null;
  function clearDrop() { if (dropEl) { dropEl.classList.remove("drop-hover"); dropEl = null; } }
  function resolvePhotoTarget(node) {
    if (!node || !node.closest) return null;
    var n = node.closest(".card[data-id], [data-open], #modal");
    if (!n) return null;
    if (n.id === "modal") {
      var cur = currentIng();
      return (cur && !el("overlay").hidden) ? { id: cur, el: n } : null;
    }
    var id = n.getAttribute("data-id") || n.getAttribute("data-open");
    return id ? { id: id, el: n } : null;
  }
  document.addEventListener("dragover", function (e) {
    var types = e.dataTransfer ? Array.prototype.slice.call(e.dataTransfer.types || []) : [];
    if (types.indexOf("Files") === -1) return;
    e.preventDefault();
    var t = resolvePhotoTarget(e.target);
    if (!t || dropEl !== t.el) clearDrop();
    if (t) { e.dataTransfer.dropEffect = "copy"; t.el.classList.add("drop-hover"); dropEl = t.el; }
    else e.dataTransfer.dropEffect = "none";
  });
  document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) clearDrop(); });
  document.addEventListener("drop", function (e) {
    e.preventDefault();
    var t = resolvePhotoTarget(e.target);
    clearDrop();
    if (!t) return;
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) attachPhoto(t.id, f);
  });
  el("createOverlay").addEventListener("click", function (e) { if (e.target === el("createOverlay")) closeCreate(); });
  el("createModal").addEventListener("click", function (e) {
    if (!createState) return;
    if (e.target.closest("#createClose")) { closeCreate(); return; }
    var fl = e.target.closest("[data-fl]");
    if (fl) { fl.setAttribute("aria-pressed", fl.classList.toggle("on")); return; }
    if (e.target.closest("#cPickAdd")) { addPick(); return; }
    var rm = e.target.closest("[data-rm]");
    if (rm) {
      var rid = rm.getAttribute("data-rm");
      createState.picked = createState.picked.filter(function (x) { return x !== rid; });
      renderPicked();
      return;
    }
    if (e.target.closest("#cSave")) saveCreation();
  });
  el("createModal").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "cPick") { e.preventDefault(); addPick(); }
  });
  function creationGridClick(e) {
    var di = e.target.closest("[data-del-ing]");
    if (di) { e.stopPropagation(); deleteIng(di.getAttribute("data-del-ing")); return; }
  }
  el("creationsGrid").addEventListener("click", creationGridClick);

  /* Tab stays inside whichever dialog is open, wrapping at either end. */
  var FOCUSABLE = 'button:not([hidden]),[href],input,select,textarea,[tabindex="0"]';
  function trapTab(e, box) {
    var list = Array.prototype.filter.call(box.querySelectorAll(FOCUSABLE), function (n) {
      return !n.disabled && n.getClientRects().length;
    });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1], cur = document.activeElement;
    if (e.shiftKey ? (cur === first || !box.contains(cur)) : (cur === last || !box.contains(cur))) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
      if (!el("createOverlay").hidden) trapTab(e, el("createModal"));
      else if (!el("overlay").hidden) trapTab(e, el("modal"));
      return;
    }
    if (e.key === "Escape" && !el("createOverlay").hidden) { closeCreate(); return; }
    if (e.key === "Escape" && !el("overlay").hidden) {
      if (modalStack.length > 1) backModal(); else closeModal();
    }
    if (e.key === "/" && document.activeElement !== el("search") &&
        !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      el("search").focus();
    }
  });

  /* The sign-in form. Whatever the server says about the address, the page
     says the same thing; only a request that never went through (offline, or
     too many from this connection) says so instead. */
  document.body.addEventListener("submit", function (e) {
    var f = e.target.closest("[data-signin]");
    if (!f) return;
    e.preventDefault();
    /* Enter in the code field signs in with the code: a new link would cancel it.
       In the installed app, Enter in the address field goes on to the code field
       while it is empty: a reader there has usually come with a code to type. */
    var code = f.elements.code;
    if (document.activeElement === code) { f.querySelector("[data-code]").click(); return; }
    if (document.activeElement === f.elements.email && !code.value.trim() &&
        ((window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true)) {
      code.focus(); return;
    }
    var btn = f.querySelector("button"), out = f.querySelector(".signin-sent"), t = T();
    btn.disabled = true;
    fetch("/api/login.php", { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: f.elements.email.value.trim(), lang: state.lang }) })
      .then(function (r) { return r.ok; }, function () { return false; })
      .then(function (ok) { btn.disabled = false; out.textContent = ok ? t.signinSent : t.signinFailed; });
  });
  /* The code from the mail, with the address typed above it. Signed in, this
     page and the site's other tabs reload into the full version. */
  document.body.addEventListener("click", function (e) {
    var b = e.target.closest("[data-code]");
    if (!b) return;
    var f = b.closest("[data-signin]"), out = f.querySelector(".signin-sent"), t = T();
    var email = f.elements.email.value.trim(), code = f.elements.code.value.replace(/\D/g, "");
    if (!f.elements.email.checkValidity() || !email) { f.elements.email.reportValidity(); return; }
    if (code.length !== 6) { out.textContent = t.codeWrong; f.elements.code.focus(); return; }
    b.disabled = true;
    fetch("/api/verify.php", { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email, code: code }) })
      .then(function (r) { return r.status; }, function () { return 0; })
      .then(function (s) {
        b.disabled = false;
        if (s === 200) {
          if (!hasMark()) { out.textContent = t.cxCookies; return; }
          if (SESSION_CH) SESSION_CH.postMessage("changed");
          location.reload();
          return;
        }
        out.textContent = s === 410 ? t.codeWrong : s === 403 ? t.sessionNoAccess : t.signinFailed;
      });
  });
  /* A sign-in or sign-out in one tab reloads the others; so does a page the
     back button brings back from memory with a marker that has since changed. */
  if (SESSION_CH) SESSION_CH.onmessage = function () { location.reload(); };
  window.addEventListener("pageshow", function (e) {
    if (e.persisted && hasMark() !== MARK_AT_LOAD) location.reload();
  });

  /* ---------- init ---------- */
  renderAll();
  /* state.view defaults to "atlas" but nothing applied it to the DOM, so a first
     load showed the atlas with no tab marked selected. */
  setView(state.view);
  idbOpen().then(function (db) {
    idb = db;
    return idbLoadAll();
  }).then(function (all) {
    photosMap = all;
    if (Object.keys(all).length) { renderAll(); refreshOpenModal(); }
  }).catch(function () { /* photos unavailable — Copius works without them */ });
  // A shared link with a bad percent-escape (#%E0) must not throw.
  var hash = "";
  try { hash = decodeURIComponent(location.hash.replace("#", "")); } catch (e) {}
  if (hash && byId[hash]) { setView("atlas"); openModal(hash); }
  else if (hash && LOCKED && PAID[hash]) { setView("atlas"); openItem("full", hash); }
  else if (hash === "abonnement" || hash === "subscription") setView("sub");
})();
