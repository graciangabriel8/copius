/* Copius — app logic: language, search, filters, modal, pairing lab, trios. */
(function () {
  "use strict";

  var LS_LANG = "atlas-lang", LS_FAVS = "atlas-favs";
  var LS_MYINGS = "atlas-my-ingredients", LS_VIEW = "copius-view";
  var BASE = window.INGREDIENTS, TRIOS = window.TRIOS, I18N = window.I18N, CAT_ORDER = window.CAT_ORDER;
  var PHOTOS = new Set(window.PHOTOS || []);

  // User creations, persisted in this browser.
  var myIngs = JSON.parse(localStorage.getItem(LS_MYINGS) || "[]");

  var ING, byId, PAIRS, EDGE_COUNT;
  function rebuildIndex() {
    ING = BASE.concat(myIngs);
    byId = {};
    ING.forEach(function (i) { byId[i.id] = i; });
    // Symmetric pairing graph: a declared pair counts in both directions.
    PAIRS = {};
    ING.forEach(function (i) { PAIRS[i.id] = new Set(); });
    ING.forEach(function (i) {
      i.pairs.forEach(function (p) {
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

  var state = {
    lang: localStorage.getItem(LS_LANG) || ((navigator.language || "").toLowerCase().indexOf("fr") === 0 ? "fr" : "en"),
    view: localStorage.getItem(LS_VIEW) || "atlas",
    chefQ: "", chefGender: "all", chefStars: "all", chefCountry: "all", chefEra: "all",
    cat: "all", q: "", dq: "", seasonNow: false, favsOnly: false, rareOnly: false, luxeOnly: false, sort: "name"
  };
  var favs = new Set(JSON.parse(localStorage.getItem(LS_FAVS) || "[]"));
  var modalStack = [];

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
    var cur = modalStack[modalStack.length - 1];
    if (cur && !el("overlay").hidden) renderModal(cur);
  }
  function attachPhoto(id, file) {
    fileToPhoto(file, function (dataURL) {
      photosMap[id] = dataURL;
      if (idb) idbPut(id, dataURL).catch(function () {});
      renderAll();
  setView(state.view);
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
  function norm(s) {
    return s.toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function el(id) { return document.getElementById(id); }

  function monogramSvg(ch, label) {
    return '<svg class="art" viewBox="0 0 96 96" role="img" aria-label="' + esc(label || ch) + '">' +
      '<circle cx="48" cy="50" r="42" fill="#f1f1f0"/>' +
      '<circle cx="48" cy="50" r="32" fill="none" stroke="#c9c9c4" stroke-width="1.6" stroke-dasharray="4 5"/>' +
      '<text x="48" y="62" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="#6a6a64">' + esc(ch) + "</text></svg>";
  }
  function monogram(i) {
    return monogramSvg((name(i) || "?").trim().charAt(0).toUpperCase(), name(i));
  }

  function art(i, cls) {
    if (photosMap[i.id]) return '<img class="' + (cls || "") + '" src="' + photosMap[i.id] + '" alt="' + esc(name(i)) + '">';
    if (PHOTOS.has(i.id)) return '<img class="' + (cls || "") + '" src="img/' + i.id + '.jpg" alt="' + esc(name(i)) + '" loading="lazy">';
    if (i.custom) return monogram(i);
    return '<svg class="art" viewBox="0 0 96 96" role="img" aria-label="' + esc(name(i)) + '">' +
      '<circle cx="48" cy="50" r="42" fill="#f1f1f0"/>' + i.svg + "</svg>";
  }

  function catLabel(c) { return T().categories[c]; }
  function inSeasonNow(i) { return i.season.length === 0 || i.season.indexOf(new Date().getMonth() + 1) !== -1; }

  /* ---------- static labels ---------- */
  function applyStatic() {
    var t = T();
    document.documentElement.lang = state.lang;
    el("tagline").textContent = t.tagline;
    el("search").placeholder = t.searchPh;
    el("seasonNowLbl").textContent = t.inSeasonNow;
    el("favsOnlyLbl").textContent = t.favsOnly;
    el("rareOnlyLbl").textContent = t.rareOnly + " ✦";
    el("luxeOnlyLbl").textContent = t.luxeOnly + " ◆";
    el("random").textContent = t.random;
    el("labTitle").textContent = t.labTitle;
    el("labHint").textContent = t.labHint;
    el("triosTitle").textContent = t.triosTitle;
    el("footNote").textContent = t.footNote;
    el("createBtn").textContent = "+ " + t.create;
    el("tabAtlas").textContent = t.tabAtlas;
    el("tabChefs").textContent = t.tabChefs;
    el("creationsTitle").textContent = t.myCreations;
    el("creationsHint").textContent = t.myCreationsHint;
    el("lang-en").classList.toggle("active", state.lang === "en");
    el("lang-fr").classList.toggle("active", state.lang === "fr");
    var sort = el("sort");
    sort.innerHTML = '<option value="name">' + esc(t.sortName) + '</option><option value="family">' + esc(t.sortFamily) + "</option>";
    sort.value = state.sort;
    el("stats").textContent = t.statsTpl
      .replace("{n}", ING.length)
      .replace("{f}", CAT_ORDER.length)
      .replace("{p}", EDGE_COUNT);
  }

  /* ---------- category chips ---------- */
  function renderCats() {
    var t = T(), html = "";
    html += chip("all", t.all);
    CAT_ORDER.forEach(function (c) { html += chip(c, t.categories[c]); });
    el("cats").innerHTML = html;
    function chip(v, label) {
      return '<button type="button" class="chip' + (state.cat === v ? " active" : "") + '" data-cat="' + v + '">' + esc(label) + "</button>";
    }
  }

  /* ---------- grid ---------- */
  function filtered() {
    var q = norm(state.q.trim()), t = T();
    return ING.filter(function (i) {
      if (state.cat !== "all" && i.cat !== state.cat) return false;
      if (state.seasonNow && !inSeasonNow(i)) return false;
      if (state.favsOnly && !favs.has(i.id)) return false;
      if (state.rareOnly && !i.rare) return false;
      if (state.luxeOnly && !i.luxe) return false;
      if (!q) return true;
      var hay = norm(i.name.en + " " + i.name.fr + " " + i.latin + " " + catLabel(i.cat) + " " +
        i.flavor.map(function (f) { return t.flavors[f]; }).join(" "));
      return hay.indexOf(q) !== -1;
    }).sort(function (a, b) {
      // With a query, a name match outranks a match on latin, family or flavour —
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

  function matchRank(i, q) {
    var n = norm(name(i));
    if (n.indexOf(q) === 0) return 0;                                  // name starts with it
    if (n.indexOf(q) !== -1) return 1;                                 // name contains it
    if (norm(i.name.en + " " + i.name.fr).indexOf(q) !== -1) return 2; // the other language
    if (norm(i.latin || "").indexOf(q) !== -1) return 3;               // latin
    return 4;                                                          // family or flavour only
  }

  function renderGrid() {
    var t = T(), list = filtered();
    el("empty").hidden = list.length > 0;
    el("empty").textContent = t.empty;
    el("grid").innerHTML = list.map(function (i) {
      var seasonDot = (i.season.length > 0 && inSeasonNow(i)) ? '<span class="in-season" title="' + esc(t.inSeasonNow) + '"></span>' : "";
      return '<article class="card" data-id="' + i.id + '" tabindex="0" role="button">' +
        seasonDot +
        (i.custom ? '<span class="creation-tag">' + esc(t.creationLabel) + "</span>" : "") +
        '<button type="button" class="fav' + (favs.has(i.id) ? " on" : "") + '" data-fav="' + i.id +
          '" title="' + esc(favs.has(i.id) ? t.favRemove : t.favAdd) + '" aria-label="' + esc(favs.has(i.id) ? t.favRemove : t.favAdd) + '">&#9733;</button>' +
        '<div class="card-art">' + art(i) + "</div>" +
        "<h3>" + esc(name(i)) + (i.rare ? ' <span class="rare-mark" title="' + esc(t.rareMark) + '">✦</span>' : "") + (i.luxe ? ' <span class="luxe-mark" title="' + esc(t.luxeMark) + '">◆</span>' : "") + (i.coeur ? ' <span class="coeur-mark" title="' + esc(t.coeurMark) + '">♥</span>' : "") + "</h3>" +
        '<p class="latin">' + esc(i.custom ? t.creationLabel : i.latin) + "</p>" +
        '<p class="cat-line">' + esc(catLabel(i.cat)) + "</p>" +
        '<div class="tags">' + i.flavor.slice(0, 3).map(function (f) {
          return '<span class="tag">' + esc(t.flavors[f]) + "</span>";
        }).join("") + "</div>" +
        "</article>";
    }).join("");
  }

  /* ---------- ingredient of the day ---------- */
  function dailyIngredient() {
    var d = new Date();
    var seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
    return BASE[seed % BASE.length];
  }
  function renderDaily() {
    var t = T(), i = dailyIngredient();
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

  function pairChip(id) {
    var i = byId[id];
    return '<button type="button" class="pair-chip" data-open="' + id + '">' + art(i) + "<span>" + esc(name(i)) + "</span></button>";
  }

  function triosOf(id) {
    return TRIOS.filter(function (tr) { return tr.ids.indexOf(id) !== -1; });
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


  function renderTree(ing) {
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

    var svg = '<svg class="tw-svg" viewBox="0 0 460 404" role="img" aria-label="' + esc(name(ing)) + '">' +
      links +
      '<g class="tw-core"><circle class="tw-core-disc" r="' + CR + '" cx="' + CX + '" cy="' + CY + '"/>' +
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

    return '<section class="tw" id="treeSec"><h3 class="tw-title">' + esc(t.preparations) + "</h3>" +
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

  function setView(v) {
    state.view = v;
    try { localStorage.setItem(LS_VIEW, v); } catch (e) {}
    el("atlasView").hidden = v !== "atlas";
    el("chefsView").hidden = v !== "chefs";
    el("tabAtlas").classList.toggle("active", v === "atlas");
    el("tabChefs").classList.toggle("active", v === "chefs");
    el("tabAtlas").setAttribute("aria-selected", v === "atlas");
    el("tabChefs").setAttribute("aria-selected", v === "chefs");
    if (v === "chefs") renderChefs();
  }

  var COUNTRIES = ["FR","IT","ES","GB","DK","SE","NO","SI","US","PE","JP"];

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
    el("chefSearch").placeholder = t.chefSearchPh;
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
        '<p class="tw-sub">' + esc(t.chefIngredients) + "</p>" +
        '<div class="pair-grid">' + c.ingredients.filter(function (x) { return byId[x]; }).map(pairChip).join("") + "</div>" +
        "</div></article>";
    }).join("");
  }


  function renderModal(id) {
    var t = T(), i = byId[id];
    var other = state.lang === "en" ? i.name.fr : i.name.en;
    var pairs = Array.from(PAIRS[i.id]).sort(function (a, b) { return name(byId[a]).localeCompare(name(byId[b]), state.lang, CMP); });
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
      "<h2>" + esc(name(i)) + (i.rare ? ' <span class="rare-mark" title="' + esc(t.rareMark) + '">✦</span>' : "") + (i.luxe ? ' <span class="luxe-mark" title="' + esc(t.luxeMark) + '">◆</span>' : "") + (i.coeur ? ' <span class="coeur-mark" title="' + esc(t.coeurMark) + '">♥</span>' : "") + "</h2>" +
      '<p class="m-latin">' + (i.custom ? esc(other) : esc(i.latin) + " · " + esc(other)) + "</p>" +
      (i.origin[state.lang] ? '<p class="m-origin">' + esc(t.origin) + " — " + esc(i.origin[state.lang]) + "</p>" : "") +
      (i.custom ? "" : '<div class="m-season">' + seasonDots(i) + "</div>") +
      "</div></div>" +
      '<div class="m-tags">' + i.flavor.map(function (f) { return '<span class="tag">' + esc(t.flavors[f]) + "</span>"; }).join("") + "</div>" +
      (i.story[state.lang] ? "<h3>" + esc(i.custom ? t.notesLbl : t.story) + "</h3>" +
        '<p class="m-story">' + esc(i.story[state.lang]) + "</p>" : "") +
      (i.tip[state.lang] ? '<div class="m-note"><h3>' + esc(t.chefNote) + "</h3><p>" + esc(i.tip[state.lang]) + "</p></div>" : "") +
      renderTree(i) +
      "<h3>" + esc(t.pairsWith) + "</h3>" +
      '<div class="pair-grid">' + pairs.map(pairChip).join("") + "</div>" +
      (trios.length ? "<h3>" + esc(t.inTrios) + "</h3>" + trios.map(function (tr) {
        return '<p class="m-story" style="font-size:14px">· <strong>' + esc(tr.name[state.lang]) + "</strong> — " +
          tr.ids.map(function (x) { return esc(name(byId[x])); }).join(" + ") + "</p>";
      }).join("") : "") +
      '<button type="button" class="m-lab-btn" data-lab="' + i.id + '">' + esc(t.openLab) + "</button>";
    el("modalBody").innerHTML = html;
    el("backBtn").hidden = modalStack.length < 2;
    el("closeBtn").title = t.close;
    el("backBtn").title = t.back;
  }

  function openModal(id, push) {
    treeSel = null;
    if (!byId[id]) return;
    if (push !== false) modalStack.push(id);
    renderModal(id);
    el("overlay").hidden = false;
    document.body.style.overflow = "hidden";
    if (history.replaceState) history.replaceState(null, "", "#" + id);
  }
  function closeModal() {
    modalStack = [];
    el("overlay").hidden = true;
    document.body.style.overflow = "";
    if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
  }
  function backModal() {
    modalStack.pop();
    var prev = modalStack[modalStack.length - 1];
    if (prev) { renderModal(prev); if (history.replaceState) history.replaceState(null, "", "#" + prev); }
    else closeModal();
  }

  /* ---------- pairing lab ---------- */
  function fillLabSelects() {
    var t = T();
    var opts = ING.slice().sort(function (a, b) { return name(a).localeCompare(name(b), state.lang, CMP); })
      .map(function (i) { return '<option value="' + i.id + '">' + esc(name(i)) + " · " + esc(catLabel(i.cat)) + "</option>"; }).join("");
    ["labA", "labB"].forEach(function (id) {
      var sel = el(id), prev = sel.value;
      sel.innerHTML = '<option value="">' + esc(t.choose) + "</option>" + opts;
      if (prev && byId[prev]) sel.value = prev;
    });
  }

  function renderLabResult() {
    var t = T(), a = el("labA").value, b = el("labB").value, box = el("labResult");
    if (!a || !b) { box.innerHTML = ""; return; }
    if (a === b) { box.innerHTML = '<div class="verdict mid">' + esc(t.labSame) + "</div>"; return; }
    var A = byId[a], B = byId[b];
    var direct = PAIRS[a].has(b);
    var bridges = Array.from(PAIRS[a]).filter(function (x) { return x !== b && PAIRS[b].has(x); })
      .sort(function (x, y) { return name(byId[x]).localeCompare(name(byId[y]), state.lang, CMP); });
    var shared = A.flavor.filter(function (f) { return B.flavor.indexOf(f) !== -1; });
    var html = "";
    if (direct) html += '<div class="verdict ok">&#10003;&nbsp; ' + esc(t.labDirect) + "</div>";
    else if (bridges.length) html += '<div class="verdict mid">' + esc(t.labBridge) + "</div>";
    else html += '<div class="verdict none">' + esc(t.labNone) + "</div>";
    if (shared.length) {
      html += '<p class="shared-notes">' + esc(t.sharedNotes) + " " +
        shared.map(function (f) { return '<span class="tag">' + esc(t.flavors[f]) + "</span>"; }).join("") + "</p>";
    }
    if (bridges.length) html += '<div class="bridge-grid">' + bridges.map(pairChip).join("") + "</div>";
    box.innerHTML = html;
  }

  /* ---------- trios section ---------- */
  function renderTrios() {
    el("triosGrid").innerHTML = TRIOS.map(function (tr) {
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
    el("createOverlay").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeCreate() {
    el("createOverlay").hidden = true;
    document.body.style.overflow = "";
    createState = null;
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
        Object.keys(t.flavors).map(function (f) { return '<button type="button" class="tag" data-fl="' + f + '">' + esc(t.flavors[f]) + "</button>"; }).join("") +
        "</div>" + picker + common;
    el("createModal").innerHTML =
      '<div class="modal-bar"><span class="cform-title">' + esc(t.createTitle) + "</span>" +
      '<button type="button" class="ghost" id="createClose" aria-label="' + esc(t.close) + '">&#10005;</button></div>' +
      '<div class="modal-body cform">' + body + "</div>";
    renderPicked();
  }

  function renderPicked() {
    if (!el("cPairs")) return;
    var html = createState.picked.map(function (id) {
      var i = byId[id];
      if (!i) return "";
      return '<span class="pair-chip">' + art(i) + "<span>" + esc(name(i)) + '</span>' +
        '<button type="button" class="rm" data-rm="' + id + '" aria-label="&times;">&#10005;</button></span>';
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
    myIngs.forEach(function (i) {
      out.push('<div class="creation-card cc-ing" data-open="' + i.id + '">' +
        '<button type="button" class="cc-del" data-del-ing="' + i.id + '" title="' + esc(t.deleteConfirm) + '">&#10005;</button>' +
        '<div class="trio-arts">' + art(i) + "</div>" +
        "<h3>" + esc(name(i)) + (i.coeur ? ' <span class="coeur-mark" title="' + esc(t.coeurMark) + '">♥</span>' : "") + "</h3>" +
        '<p class="cc-type">' + esc(catLabel(i.cat)) + " · " + esc(t.creationLabel) + "</p>" +
        (i.story[state.lang] ? '<p class="trio-note">' + esc(i.story[state.lang].slice(0, 110)) + "</p>" : "") +
        "</div>");
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
    fillLabSelects();
    renderLabResult();
    renderTrios();
    renderCreations();
    if (state.view === "chefs") renderChefs();
  }

  function setLang(l) {
    state.lang = l;
    localStorage.setItem(LS_LANG, l);
    renderAll();
    var current = modalStack[modalStack.length - 1];
    if (current && !el("overlay").hidden) renderModal(current);
  }

  /* ---------- events ---------- */
  el("lang-en").addEventListener("click", function () { setLang("en"); });
  el("lang-fr").addEventListener("click", function () { setLang("fr"); });

  el("search").addEventListener("input", function (e) { state.q = e.target.value; renderGrid(); });
  el("seasonNow").addEventListener("change", function (e) { state.seasonNow = e.target.checked; renderGrid(); });
  el("favsOnly").addEventListener("change", function (e) { state.favsOnly = e.target.checked; renderGrid(); });
  el("rareOnly").addEventListener("change", function (e) { state.rareOnly = e.target.checked; renderGrid(); });
  el("luxeOnly").addEventListener("change", function (e) { state.luxeOnly = e.target.checked; renderGrid(); });
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
  el("grid").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var c = e.target.closest(".card");
    if (c) openModal(c.getAttribute("data-id"));
  });

  document.body.addEventListener("click", function (e) {
    var pp = e.target.closest("[data-photo-pick]");
    if (pp) { photoTarget = pp.getAttribute("data-photo-pick"); el("photoFile").click(); return; }
    var pd = e.target.closest("[data-photo-del]");
    if (pd) { deletePhoto(pd.getAttribute("data-photo-del")); return; }
    var o = e.target.closest("[data-open]");
    if (o) { openModal(o.getAttribute("data-open")); return; }
    var br = e.target.closest("[data-branch]");
    if (br) {
      treeSel = br.getAttribute("data-branch");
      var host = el("treeSec");
      if (host) {
        var tmp = document.createElement("div");
        tmp.innerHTML = renderTree(byId[modalStack[modalStack.length - 1]]);
        host.replaceWith(tmp.firstChild);
      }
      return;
    }
    var lab = e.target.closest("[data-lab]");
    if (lab) {
      var id = lab.getAttribute("data-lab");
      closeModal();
      el("labA").value = id;
      renderLabResult();
      el("lab").scrollIntoView({ behavior: "smooth" });
      el("labB").focus();
    }
  });

  el("closeBtn").addEventListener("click", closeModal);
  el("backBtn").addEventListener("click", backModal);
  el("overlay").addEventListener("click", function (e) { if (e.target === el("overlay")) closeModal(); });

  el("labA").addEventListener("change", renderLabResult);
  el("labB").addEventListener("change", renderLabResult);

  /* creations events */
  el("createBtn").addEventListener("click", function () { openCreate(); });
  el("tabAtlas").addEventListener("click", function () { setView("atlas"); });
  el("tabChefs").addEventListener("click", function () { setView("chefs"); });
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
      var cur = modalStack[modalStack.length - 1];
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
    if (fl) { fl.classList.toggle("on"); return; }
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

  document.addEventListener("keydown", function (e) {
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

  /* ---------- init ---------- */
  renderAll();
  idbOpen().then(function (db) {
    idb = db;
    return idbLoadAll();
  }).then(function (all) {
    photosMap = all;
    if (Object.keys(all).length) { renderAll(); refreshOpenModal(); }
  }).catch(function () { /* photos unavailable — Copius works without them */ });
  var hash = decodeURIComponent(location.hash.replace("#", ""));
  if (hash && byId[hash]) { setView("atlas"); openModal(hash); }
})();
