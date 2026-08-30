/* Atlas — app logic: language, search, filters, modal, pairing lab, trios. */
(function () {
  "use strict";

  var LS_LANG = "atlas-lang", LS_FAVS = "atlas-favs";
  var LS_MYINGS = "atlas-my-ingredients";
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
      refreshOpenModal();
    }, function () { alert(T().photoError); });
  }
  function deletePhoto(id) {
    delete photosMap[id];
    if (idb) idbDel(id).catch(function () {});
    renderAll();
    refreshOpenModal();
  }

  function T() { return I18N[state.lang]; }
  function name(i) { return i.name[state.lang]; }
  function norm(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
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
      if (state.sort === "family" && a.cat !== b.cat) {
        return CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat);
      }
      return name(a).localeCompare(name(b), state.lang);
    });
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

  function renderModal(id) {
    var t = T(), i = byId[id];
    var other = state.lang === "en" ? i.name.fr : i.name.en;
    var pairs = Array.from(PAIRS[i.id]).sort(function (a, b) { return name(byId[a]).localeCompare(name(byId[b]), state.lang); });
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
    var opts = ING.slice().sort(function (a, b) { return name(a).localeCompare(name(b), state.lang); })
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
      .sort(function (x, y) { return name(byId[x]).localeCompare(name(byId[y]), state.lang); });
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
  }).catch(function () { /* photos unavailable — the Atlas works without them */ });
  var hash = decodeURIComponent(location.hash.replace("#", ""));
  if (hash && byId[hash]) openModal(hash);
})();
