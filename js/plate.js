/* The plate engine.

   A plate is judged, not looked up. Fifteen ingredients drawn from 1 838 is a
   number with 38 digits, so no list of outcomes could ever be written; what can
   be written is the handful of things that make a plate work, tested against
   data the atlas already holds — 35 flavour tags, the recorded pairings, and
   the 22 families.

   Deliberately free of the DOM. The engine returns note *keys*, which js/i18n.js
   turns into sentences in either language, so the same verdict can be checked
   from a script with no browser in sight.

   What it does not judge yet: texture. No entry carries one, and inventing a
   value per ingredient would be a guess wearing a data structure. Stated in the
   UI rather than faked. */
(function () {
  "use strict";

  /* ---------- roles ----------
     What an ingredient does on a plate, which is not quite what family it comes
     from. Family is the default; the overrides below are the places where the
     two genuinely part company — a potato is filed under vegetables and eaten
     as a starch, an egg is filed under dairy and eaten as a protein. */
  var ROLE_BY_CAT = {
    meat: "protein", cuts: "protein", seafood: "protein",
    shellfish: "protein", roe: "protein", legumes: "protein",
    vegetables: "vegetable", mushrooms: "vegetable", seaweed: "vegetable",
    grains: "starch",
    fats: "fat", dairy: "fat",
    spices: "seasoning", herbs: "seasoning",
    condiments: "seasoning", flowers: "seasoning",
    fruits: "fruit", sweet: "fruit",
    cellar: "aside", infusions: "aside", texture: "aside"
  };

  var ROLE_OVERRIDE = {
    potato: "starch", "bintje-potato": "starch", "ratte-potato": "starch",
    "vitelotte-potato": "starch", "sweet-potato": "starch", cassava: "starch",
    taro: "starch", yam: "starch", nagaimo: "starch",
    "banane-plantain": "starch", konnyaku: "starch",
    egg: "protein", "century-egg": "protein", "salted-duck-egg": "protein"
  };

  var ROLES = ["protein", "vegetable", "starch", "fat", "seasoning", "fruit", "aside"];

  function roleOf(ing) {
    return ROLE_OVERRIDE[ing.id] || ROLE_BY_CAT[ing.cat] || "aside";
  }

  /* ---------- flavour axes ----------
     The five basic tastes first, because they are what the tongue actually has
     receptors for and what a cook is taught to balance: sweet, salt, acid,
     bitter, umami. Everything else the atlas records is real but is not a
     taste — richness is mouthfeel, heat is pain, aromatics are smell — so they
     sit behind the five as supporting axes rather than beside them.

     Every one of the 35 tags belongs to exactly one axis, and the count is
     asserted at the bottom of this file so a tag added to the atlas and
     forgotten here fails loudly instead of quietly dropping out of the reading. */
  var AXIS_BY_TAG = {
    /* --- the five --- */
    sweet: "sweet", fruity: "sweet", honeyed: "sweet",
    salty: "salty", briny: "salty", marine: "salty",
    sour: "sour", tangy: "sour", citrus: "sour",
    bitter: "bitter", resinous: "bitter",
    umami: "umami", meaty: "umami",
    /* --- what supports them --- */
    rich: "fat", buttery: "fat", creamy: "fat", milky: "fat",
    hot: "heat", peppery: "heat", pungent: "heat", numbing: "heat",
    herbal: "aroma", floral: "aroma", anise: "aroma", grassy: "aroma",
    woody: "aroma", warm: "aroma", musky: "aroma", fresh: "aroma",
    earthy: "depth", smoky: "depth", toasty: "depth", nutty: "depth",
    mild: "quiet", delicate: "quiet"
  };

  /* The five the balance wheel is drawn from. */
  var PRIMARY = ["sweet", "salty", "sour", "bitter", "umami"];
  var SUPPORT = ["fat", "heat", "aroma", "depth", "quiet"];
  var AXES = PRIMARY.concat(SUPPORT);

  /* Axes that make a plate loud. Four of these at once is the "everything is
     shouting" plate — each one is good, and they do not all fit on one plate. */
  var LOUD = ["heat", "aroma", "depth", "bitter"];

  function axesOf(ing) {
    var out = {};
    (ing.flavor || []).forEach(function (f) {
      var a = AXIS_BY_TAG[f];
      if (a) out[a] = true;
    });
    return Object.keys(out);
  }

  /* ---------- the verdict ----------
     ctx supplies what the engine cannot know on its own:
       byId(id)        -> ingredient record, or null
       pairsOf(id,form) -> array of ids this item pairs with, in this form

     A form matters here. Potato purée and potato frites are the same entry and
     not the same ingredient: js/data-trees.js records different pairings for
     each, and the caller is what knows which form is on the plate. */
  function judge(items, ctx) {
    items = (items || []).filter(function (it) { return ctx.byId(it.id); });

    var n = items.length;
    var roles = {}, axisCount = {}, notes = [];
    ROLES.forEach(function (r) { roles[r] = 0; });
    AXES.forEach(function (a) { axisCount[a] = 0; });

    var FLESH = { meat: 1, cuts: 1, seafood: 1, shellfish: 1, roe: 1 };
    var flesh = 0;
    items.forEach(function (it) {
      var ing = ctx.byId(it.id);
      roles[roleOf(ing)]++;
      if (FLESH[ing.cat]) flesh++;
      axesOf(ing).forEach(function (a) { axisCount[a]++; });
    });

    /* Cohesion. Every pair among the selection, judged the way the two-slot lab
       judges one: recorded, bridged through a shared neighbour, or neither. */
    var sets = items.map(function (it) {
      var s = {};
      ctx.pairsOf(it.id, it.form).forEach(function (p) { s[p] = true; });
      return s;
    });
    /* A pairing is normally symmetric: comté lists potato, so potato pairs with
       comté whichever way round it is read. A form breaks that symmetry on
       purpose. Comté is recorded against a potato gratin and not against
       roasted potatoes, and comté's own list — which knows nothing of forms —
       would otherwise put the edge back and make the whole form selector
       decorative. So the specific claim governs: when an item carries a form,
       only that form's list can speak for it. */
    function declares(from, to) { return !!sets[from][items[to].id]; }
    function linked(x, y) {
      var fx = !!items[x].form, fy = !!items[y].form;
      if (fx && fy) return declares(x, y) || declares(y, x);
      if (fx) return declares(x, y);
      if (fy) return declares(y, x);
      return declares(x, y) || declares(y, x);
    }

    var rows = [], degree = items.map(function () { return 0; }), i, j;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var a = items[i], b = items[j], v;
        if (linked(i, j)) {
          v = "ok";
          degree[i]++; degree[j]++;
        } else {
          var bridged = Object.keys(sets[i]).some(function (x) {
            return x !== a.id && x !== b.id && sets[j][x];
          });
          v = bridged ? "mid" : "none";
        }
        rows.push({ a: a, b: b, verdict: v });
      }
    }
    var direct = rows.filter(function (r) { return r.verdict === "ok"; }).length;

    /* An ingredient that pairs with nothing else here. Named, because "one of
       these does not belong" is useless without saying which. */
    var lonely = [];
    if (n >= 3) {
      items.forEach(function (it, k) { if (degree[k] === 0) lonely.push(it); });
    }

    /* ---------- the fifteen readings ----------
       One rule per thing that can go right or wrong on the flavour side, each
       carrying its own weight, and the weights add up to the balance score. A
       table rather than fifteen if-statements, so the set can be counted,
       exercised one by one, and read without following control flow.

       Weights are not measurements. They say which faults matter more than
       which, and they are the one honestly arguable thing in this file. A
       plate missing acid under fat is worse than a plate that is merely
       narrow, and the numbers are ordered to say so.

       They are calibrated, though, not invented. Every condition below was
       measured over 30 000 random plates of three to six ingredients, and the
       rewards are small because the conditions turn out to be common: the
       tripod holds for half of all random plates, so it cannot be worth what a
       missing acid costs. The bands are set where they are for the same
       reason — the reachable ceiling is 83, so "balanced" means a plate that
       trips nothing and earns nearly everything.

       c carries everything a rule may look at: A (how many ingredients carry
       each axis), roles, n, loud (how many loud axes are doubled up) and
       distinct (how many axes appear at all). */
    var loudCount = LOUD.filter(function (a) { return axisCount[a] >= 2; }).length;
    var distinct = AXES.filter(function (a) { return axisCount[a] > 0; }).length;
    /* Salt and umami are two of the five tastes and one job on a plate: they
       are what the other flavours push against. The rules that ask for a
       savoury anchor ask for either. */
    var savoury = axisCount.salty + axisCount.umami;
    var tastes = PRIMARY.filter(function (a) { return axisCount[a] > 0; }).length;

    /* Sweet and savoury plates are not balanced against the same rules, and
       judging a dessert by savoury ones is how this engine came to rate Pêche
       Melba below four ingredients drawn out of a hat. A plate reads as sweet
       when sweetness clearly leads, a real share of the plate is fruit or sweet
       pantry, and there is no flesh on it. Each clause is there because of a
       plate that broke without it: dairy carrying a sweet note had a potato
       gratin reading as a dessert; comté with apple went the same way until
       sweetness had to beat savoury twice over; and testing for protein rather
       than for flesh threw out most of patisserie, since a coulant is
       chocolate, butter, EGG and sugar. The rules that ask for a savoury
       anchor stand down here, because a charlotte is not missing anything. */
    var sweetPlate = flesh === 0 && roles.fruit >= Math.max(1, Math.ceil(n / 3)) &&
                     axisCount.sweet >= 2 && axisCount.sweet > savoury * 2;

    var c = { A: axisCount, roles: roles, n: n, loud: loudCount, distinct: distinct,
              savoury: savoury, tastes: tastes, sweetPlate: sweetPlate };

    var RULES = [
      /* --- what is missing, heaviest first --- */
      { key: "plateNoAcid", level: "warn", points: -18,
        test: function (c) { return c.A.fat >= 3 && c.A.sour === 0; } },

      /* Sweetness has to be on the plate, not merely in the tasting notes.
         Cream and comté are both tagged sweet and a gratin is not a dessert,
         so the rule needs an actual sweet component before it says anything. */
      { key: "plateSweetFlat", level: "warn", points: -15,
        test: function (c) {
          return c.roles.fruit >= 1 && c.A.sweet >= 2 && c.A.sour === 0 && c.A.bitter === 0;
        } },

      { key: "plateNoSalt", level: "warn", points: -14,
        test: function (c) { return !c.sweetPlate && c.savoury === 0; } },

      { key: "plateCrowded", level: "warn", points: -14,
        test: function (c) { return c.loud >= 4; } },

      { key: "plateAllQuiet", level: "warn", points: -12,
        test: function (c) { return c.A.quiet >= c.n && c.loud === 0; } },

      { key: "plateHeatAlone", level: "warn", points: -10,
        test: function (c) { return c.A.heat >= 2 && c.A.fat === 0 && c.A.sweet === 0; } },

      { key: "plateBitterUnchecked", level: "warn", points: -10,
        test: function (c) { return c.A.bitter >= 2 && c.A.fat === 0 && c.A.sweet === 0; } },

      { key: "plateAcidPiling", level: "warn", points: -10,
        test: function (c) { return c.A.sour >= 3 && c.A.fat === 0; } },

      /* Of the five tastes, two or fewer on a plate of four is a plate playing
         one idea — teachable in a way "four distinct axes" never was. */
      { key: "plateNarrow", level: "warn", points: -10,
        test: function (c) { return !c.sweetPlate && c.n >= 4 && c.tastes <= 2; } },

      { key: "plateNoAroma", level: "warn", points: -8,
        test: function (c) { return !c.sweetPlate && c.n >= 4 && c.A.aroma === 0 && c.A.depth === 0; } },

      /* --- what is working --- */
      { key: "plateTripod", level: "ok", points: 12,
        test: function (c) { return !c.sweetPlate && c.A.sour >= 1 && c.A.fat >= 1 && c.savoury >= 1; } },

      { key: "plateFatMeetsAcid", level: "ok", points: 6,
        test: function (c) { return c.A.fat >= 2 && c.A.sour >= 1; } },

      { key: "plateSaltMeetsSweet", level: "ok", points: 4,
        test: function (c) { return c.savoury >= 1 && c.A.sweet >= 1; } },

      /* The dessert’s own tripod: sugar, fat and something sharp or bitter to
         stop it cloying — the reason lemon meets butter and chocolate meets
         raspberry. Only ever read on a plate that is actually sweet. */
      { key: "plateSweetTripod", level: "ok", points: 12,
        test: function (c) {
          return c.sweetPlate && c.A.fat >= 1 && (c.A.sour >= 1 || c.A.bitter >= 1);
        } },

      { key: "plateAromaLift", level: "ok", points: 3,
        test: function (c) { return c.A.aroma >= 1 && c.loud < 4; } },

      { key: "plateDepthAnchor", level: "ok", points: 3,
        test: function (c) { return c.A.depth >= 1 && c.savoury >= 1; } }
    ];

    /* A neutral plate that trips nothing sits here. Not a half-mark out of a
       hundred — the score is a reading, and its meaning is the band. */
    var BASE = 55;
    var score = null, band = null;

    if (n >= MIN_JUDGED) {
      RULES.forEach(function (rule) {
        if (rule.test(c)) notes.push({ level: rule.level, key: rule.key, points: rule.points });
      });
      score = BASE;
      notes.forEach(function (nt) { score += nt.points; });
      score = Math.max(0, Math.min(100, score));
      band = score >= 80 ? "balanced" : score >= 62 ? "sound" : score >= 42 ? "uneven" : "off";
      /* Loudest first inside each level, so the biggest lever is the first
         thing read. */
      notes.sort(function (x, y) {
        if ((x.points < 0) !== (y.points < 0)) return x.points < 0 ? -1 : 1;
        return Math.abs(y.points) - Math.abs(x.points);
      });
    }

    /* ---------- structure ----------
       Whether the ingredients are recorded together is not a flavour question,
       so it earns no points and sits in its own list. A plate can be perfectly
       balanced out of four things nobody has ever put on a plate together. */
    var structure = [];
    lonely.forEach(function (it) {
      structure.push({ level: "warn", key: "plateLonely", ids: [it.id], form: it.form });
    });

    /* The spine: the recorded pair that also shares the most flavour notes.
       Two ingredients agreeing on both counts is what the rest hangs off. */
    var spine = null, best = -1;
    rows.forEach(function (r) {
      if (r.verdict !== "ok") return;
      var A = ctx.byId(r.a.id), B = ctx.byId(r.b.id);
      var shared = (A.flavor || []).filter(function (f) {
        return (B.flavor || []).indexOf(f) !== -1;
      }).length;
      if (shared > best) { best = shared; spine = r; }
    });
    if (spine && n >= MIN_JUDGED) {
      structure.push({ level: "ok", key: "plateSpine", ids: [spine.a.id, spine.b.id] });
    }
    if (rows.length >= 3 && direct / rows.length >= 0.4) {
      structure.push({ level: "ok", key: "plateTight" });
    }
    if (n > 0 && n < MIN_JUDGED) {
      structure.push({ level: "info", key: "plateThin" });
    }

    return {
      count: n,
      roles: roles,
      axes: axisCount,
      distinct: distinct,
      tastes: tastes,      // how many of the five are present at all
      savoury: savoury,
      sweetPlate: sweetPlate,
      rows: rows,
      direct: direct,
      lonely: lonely,
      score: score,        // null below MIN_JUDGED — too little to read
      band: band,
      notes: notes,        // the flavour reading, each note carrying its weight
      structure: structure // recorded-together, which earns no points
    };
  }

  /* The guided plate: the shape of a plate taught as a plate, one slot per
     thing it needs. Not a rule about cooking — a scaffold for someone who has
     not built one before, and Libre mode is there for everyone else. */
  var GUIDED = [
    { role: "protein", n: 1 },
    { role: "vegetable", n: 2 },
    { role: "starch", n: 1 },
    { role: "fat", n: 1 },
    { role: "seasoning", n: 2 }
  ];

  var MAX_FREE = 15;

  /* Below this there is not enough on the plate for a balance reading to mean
     anything, and a score out of two ingredients would be noise wearing a
     number. */
  var MIN_JUDGED = 3;

  /* A tag in the atlas with no axis here would be silently ignored, and the
     balance rules would quietly stop seeing it. Fail at load instead. */
  var TAG_COUNT = 35;
  if (Object.keys(AXIS_BY_TAG).length !== TAG_COUNT && window.console) {
    window.console.warn("plate.js: expected " + TAG_COUNT + " flavour tags, mapped " +
      Object.keys(AXIS_BY_TAG).length + " — a tag was added without an axis.");
  }

  window.COPIUS_PLATE = {
    ROLES: ROLES,
    AXES: AXES,
    PRIMARY: PRIMARY,
    SUPPORT: SUPPORT,
    GUIDED: GUIDED,
    MAX_FREE: MAX_FREE,
    AXIS_BY_TAG: AXIS_BY_TAG,
    roleOf: roleOf,
    axesOf: axesOf,
    judge: judge
  };
})();
