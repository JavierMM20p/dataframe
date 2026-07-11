/* ============================================================
   DataFrame - galaxy graph engine.
   Positions, edges, nodes, pan/zoom, and progress-driven state.
   ============================================================ */
(function () {
  "use strict";
  window.DF = window.DF || {};

  var galaxy = document.getElementById("galaxy");
  var world = document.getElementById("world");
  var svg = document.getElementById("edges");
  var nodesLayer = document.getElementById("nodes");

  var SVGNS = "http://www.w3.org/2000/svg";
  var BADGE = { ai: "AI", emerging: "EMG", standards: "STD" };

  var view = { tx: 0, ty: 0, scale: 1 };
  var bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  var nodeEls = {};   // id -> button
  var edgeList = [];  // {el, from, to}
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;

  /* ------------------------------------------------------------------
     Layered ("Sugiyama-style") layout.
     Phases stay grouped as horizontal bands (topic clusters) stacked
     bottom-to-top. Inside each phase, nodes are split into sub-rows by
     dependency depth; rows are ordered left-to-right by a barycenter
     heuristic to reduce edge crossings, then centered on a vertical
     trunk. Long edges are routed through dummy waypoints so they thread
     between nodes instead of crossing over them.
     ------------------------------------------------------------------ */
  var LG = {
    COLGAP: 165,   // horizontal room reserved for a real node
    DUMGAP: 76,    // slimmer lane reserved for an edge waypoint
    ROWGAP: 88,    // vertical gap between adjacent sub-rows
    PHASEGAP: 60,  // extra vertical gap between phases (band separation)
    CENTER_X: 1350
  };
  var LAYOUT = null; // { pos:{id->{x,y}}, dummy:{id->{x,y}}, edges:[{from,to,chain}] }

  function median(a) {
    if (!a.length) return null;
    a = a.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function computeLayout() {
    var stars = DF.STARS, byId = {};
    stars.forEach(function (s) { byId[s.id] = s; });
    var ord = function (pid) { return DF.PHASES[pid].order; };

    // intra-phase longest-path depth => sub-rows within a phase band
    var depth = {};
    function d(id) {
      if (depth[id] != null) return depth[id];
      depth[id] = 0; // guard against cycles
      var s = byId[id], m = 0;
      (s.prereq || []).forEach(function (p) {
        if (byId[p] && byId[p].phase === s.phase) m = Math.max(m, d(p) + 1);
      });
      return depth[id] = m;
    }
    stars.forEach(function (s) { d(s.id); });

    // global rows ordered bottom-to-top by (phaseOrder, depth)
    var keyOf = function (s) { return ord(s.phase) * 100 + depth[s.id]; };
    var keys = []; stars.forEach(function (s) { var k = keyOf(s); if (keys.indexOf(k) < 0) keys.push(k); });
    keys.sort(function (a, b) { return a - b; });
    var rankOf = {}; keys.forEach(function (k, i) { rankOf[k] = i; });
    var starRank = {}; stars.forEach(function (s) { starRank[s.id] = rankOf[keyOf(s)]; });

    var N = keys.length, levels = [];
    for (var i = 0; i < N; i++) levels.push([]);
    stars.forEach(function (s) { levels[starRank[s.id]].push({ id: s.id, real: true }); });

    // edges, expanded with dummy waypoints for every intermediate row
    var edges = [], neigh = {};
    stars.forEach(function (s) { neigh[s.id] = []; });
    function link(a, b) { (neigh[a] = neigh[a] || []).push(b); (neigh[b] = neigh[b] || []).push(a); }
    var dseq = 0;
    stars.forEach(function (s) {
      (s.prereq || []).forEach(function (pid) {
        if (!byId[pid]) return;
        var r0 = starRank[pid], r1 = starRank[s.id];
        var lo = Math.min(r0, r1), hi = Math.max(r0, r1);
        var chain = [pid], prev = pid;
        for (var r = lo + 1; r < hi; r++) {
          var did = "§" + (dseq++);
          levels[r].push({ id: did, real: false });
          neigh[did] = [];
          link(prev, did); prev = did; chain.push(did);
        }
        link(prev, s.id); chain.push(s.id);
        edges.push({ from: pid, to: s.id, chain: r0 <= r1 ? chain : chain.slice().reverse() });
      });
    });

    // seed ordering by the old hand-placed x, then reduce crossings by barycenter sweeps
    var order = {};
    levels.forEach(function (L) {
      L.sort(function (a, b) {
        var xa = a.real ? byId[a.id].off[0] : 0, xb = b.real ? byId[b.id].off[0] : 0;
        return (xa - xb) || (a.id < b.id ? -1 : 1);
      });
      L.forEach(function (n, i) { order[n.id] = i; });
    });
    for (var it = 0; it < 20; it++) {
      var seq = it % 2 ? levels.slice().reverse() : levels;
      seq.forEach(function (L) {
        var b = {};
        L.forEach(function (n) { var m = median((neigh[n.id] || []).map(function (x) { return order[x]; })); b[n.id] = m == null ? order[n.id] : m; });
        L.sort(function (p, q) { return (b[p.id] - b[q.id]) || (order[p.id] - order[q.id]); });
        L.forEach(function (n, i) { order[n.id] = i; });
      });
    }

    // x-coordinate: pack each row with variable-width slots, then center it on the trunk
    var hw = {};
    levels.forEach(function (L) { L.forEach(function (n) { hw[n.id] = (n.real ? LG.COLGAP : LG.DUMGAP) / 2; }); });
    var x = {};
    levels.forEach(function (L) {
      var c = 0;
      L.forEach(function (n) { c += hw[n.id]; x[n.id] = c; c += hw[n.id]; });
      var mid = c / 2;
      L.forEach(function (n) { x[n.id] += LG.CENTER_X - mid; });
    });

    // y-coordinate: cumulative from bottom, extra gap between phases
    var yForRank = [], curY = 0;
    for (var r = 0; r < N; r++) {
      if (r > 0) {
        var gap = LG.ROWGAP;
        if (Math.floor(keys[r] / 100) !== Math.floor(keys[r - 1] / 100)) gap += LG.PHASEGAP;
        curY -= gap;
      }
      yForRank[r] = curY;
    }
    var rankById = {}; levels.forEach(function (L, r) { L.forEach(function (n) { rankById[n.id] = r; }); });

    var posMap = {}, dummyMap = {};
    for (var id in x) {
      var pt = { x: x[id], y: yForRank[rankById[id]] };
      if (byId[id]) posMap[id] = pt; else dummyMap[id] = pt;
    }
    return { pos: posMap, dummy: dummyMap, edges: edges };
  }

  function pos(star) {
    if (!LAYOUT) LAYOUT = computeLayout();
    return LAYOUT.pos[star.id];
  }

  function computeBounds() {
    var xs = [], ys = [];
    DF.STARS.forEach(function (s) { var p = pos(s); xs.push(p.x); ys.push(p.y); });
    var pad = 260;
    bounds.minX = Math.min.apply(null, xs) - pad;
    bounds.minY = Math.min.apply(null, ys) - pad;
    bounds.maxX = Math.max.apply(null, xs) + pad;
    bounds.maxY = Math.max.apply(null, ys) + pad;
  }

  function applyTransform() {
    world.style.transform = "translate(" + view.tx + "px," + view.ty + "px) scale(" + view.scale + ")";
  }

  function anchorFor(id) {
    var el = nodeEls[id];
    if (!el) return null;
    var node = el.querySelector(".node");
    if (!node) return null;
    var left = parseFloat(el.style.left) || 0;
    var top = parseFloat(el.style.top) || 0;
    return {
      x: left - el.offsetWidth / 2 + node.offsetLeft + node.offsetWidth / 2,
      y: top - el.offsetHeight / 2 + node.offsetTop + node.offsetHeight / 2
    };
  }

  // point for a chain member: real nodes use their live DOM anchor,
  // dummy waypoints use their stored layout coords (in layer space)
  function chainPoint(id) {
    if (LAYOUT.dummy[id]) {
      var dp = LAYOUT.dummy[id];
      return { x: dp.x - bounds.minX, y: dp.y - bounds.minY };
    }
    return anchorFor(id);
  }

  // smooth path through the chain: straight for direct edges, rounded at
  // each waypoint (quadratic through the midpoints) for routed long edges
  function chainPath(chain) {
    var pts = [];
    for (var i = 0; i < chain.length; i++) { var p = chainPoint(chain[i]); if (!p) return null; pts.push(p); }
    if (pts.length === 2) return "M" + pts[0].x + "," + pts[0].y + " L" + pts[1].x + "," + pts[1].y;
    var d = "M" + pts[0].x + "," + pts[0].y;
    for (var j = 1; j < pts.length - 1; j++) {
      var mx = (pts[j].x + pts[j + 1].x) / 2, my = (pts[j].y + pts[j + 1].y) / 2;
      d += " Q" + pts[j].x + "," + pts[j].y + " " + mx + "," + my;
    }
    d += " L" + pts[pts.length - 1].x + "," + pts[pts.length - 1].y;
    return d;
  }

  function positionEdges() {
    edgeList.forEach(function (edge) {
      var d = chainPath(edge.chain);
      if (d) edge.el.setAttribute("d", d);
    });
  }

  function build() {
    computeBounds();
    var W = bounds.maxX - bounds.minX, H = bounds.maxY - bounds.minY;
    world.style.width = W + "px";
    world.style.height = H + "px";
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    // edges (routed through dummy waypoints; drawn as smooth SVG paths)
    LAYOUT.edges.forEach(function (e) {
      var ln = document.createElementNS(SVGNS, "path");
      svg.appendChild(ln);
      edgeList.push({ el: ln, from: e.from, to: e.to, chain: e.chain });
    });

    // constellation labels
    Object.keys(DF.PHASES).forEach(function (pid) {
      var stars = DF.STARS.filter(function (s) { return s.phase === pid; });
      if (!stars.length) return;
      var cx = 0, minY = Infinity;
      stars.forEach(function (s) { var p = pos(s); cx += p.x; if (p.y < minY) minY = p.y; });
      cx = cx / stars.length;
      var lab = document.createElement("div");
      lab.className = "clabel";
      lab.style.left = (cx - bounds.minX) + "px";
      lab.style.top = (minY - bounds.minY - 70) + "px";
      lab.textContent = DF.PHASES[pid].name;
      nodesLayer.appendChild(lab);
    });

    // nodes
    DF.STARS.forEach(function (s) {
      var p = pos(s);
      var el = document.createElement("button");
      el.className = "star";
      el.style.left = (p.x - bounds.minX) + "px";
      el.style.top = (p.y - bounds.minY) + "px";
      el.setAttribute("data-id", s.id);
      var badges = (s.badges || []).map(function (b) { return BADGE[b]; }).filter(Boolean).join(" / ");
      el.innerHTML =
        '<span class="node"><span class="check">&#10003;</span></span>' +
        (badges ? '<span class="badges">' + badges + "</span>" : "") +
        '<span class="lbl">' + s.title + "</span>";
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        DF.panel.open(s.id);
      });
      el.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      nodesLayer.appendChild(el);
      nodeEls[s.id] = el;
    });

    refresh();
    applyTransform();
    requestAnimationFrame(positionEdges);
  }

  function refresh() {
    DF.STARS.forEach(function (s) {
      var el = nodeEls[s.id];
      if (!el) return;
      var st = DF.store.statusOf(s);
      el.className = "star " + st +
        (s.kind === "project" ? " project" : "") +
        (s.kind === "capstone" ? " project" : "");
      el.setAttribute("aria-label", s.title + ", " + st);
    });
    edgeList.forEach(function (e) {
      var a = DF.store.isComplete(e.from);
      var toStar = DF.STARS.find(function (x) { return x.id === e.to; });
      var toStatus = toStar ? DF.store.statusOf(toStar) : "locked";
      var cls = "";
      if (a && toStatus === "complete") cls = "complete";
      else if (a && (toStatus === "available" || toStatus === "progress")) cls = "active";
      e.el.setAttribute("class", cls);
    });
    requestAnimationFrame(positionEdges);
  }

  /* ---- view control ---- */
  function clampScale(s) { return Math.max(0.16, Math.min(2.2, s)); }

  // whole-tree overview (used by the fit button)
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var W = bounds.maxX - bounds.minX, H = bounds.maxY - bounds.minY;
    var scale = clampScale(Math.min((vw - 80) / W, (vh - 160) / H));
    view.scale = scale;
    view.tx = (vw - W * scale) / 2;
    view.ty = (vh - H * scale) / 2 + 10;
    applyTransform();
  }

  // opening view: the base of the tree (Launchpad), at a readable scale, anchored near the bottom
  function home() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var W = bounds.maxX - bounds.minX, H = bounds.maxY - bounds.minY;
    var scale = clampScale(Math.min((vw - 120) / W, 0.68));
    view.scale = scale;
    view.tx = (vw - W * scale) / 2;
    view.ty = vh - H * scale - 70;
    applyTransform();
  }

  function focus(id) {
    var s = DF.STARS.find(function (x) { return x.id === id; });
    if (!s) return;
    var p = pos(s);
    var lx = p.x - bounds.minX, ly = p.y - bounds.minY;
    view.scale = clampScale(Math.max(view.scale, 0.85));
    view.tx = window.innerWidth / 2 - lx * view.scale;
    view.ty = window.innerHeight / 2 - ly * view.scale;
    animateTransform();
    highlight(id);
  }

  function animateTransform() {
    if (reduce) { applyTransform(); return; }
    world.style.transition = "transform .5s cubic-bezier(.22,.8,.28,1)";
    applyTransform();
    setTimeout(function () { world.style.transition = ""; }, 520);
  }

  function highlight(id) {
    var el = nodeEls[id];
    if (!el) return;
    el.classList.add("hit");
    setTimeout(function () { el.classList.remove("hit"); }, 2000);
  }

  function zoomAt(factor, cx, cy) {
    var ns = clampScale(view.scale * factor);
    var k = ns / view.scale;
    view.tx = cx - (cx - view.tx) * k;
    view.ty = cy - (cy - view.ty) * k;
    view.scale = ns;
    applyTransform();
  }

  /* ---- interaction: drag to pan, wheel to zoom ---- */
  var dragging = false, sx = 0, sy = 0, stx = 0, sty = 0, moved = false;
  galaxy.addEventListener("pointerdown", function (e) {
    dragging = true; moved = false;
    sx = e.clientX; sy = e.clientY; stx = view.tx; sty = view.ty;
    galaxy.classList.add("grabbing");
    galaxy.setPointerCapture(e.pointerId);
  });
  galaxy.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    view.tx = stx + dx; view.ty = sty + dy;
    applyTransform();
  });
  function endDrag(e) { dragging = false; galaxy.classList.remove("grabbing"); }
  galaxy.addEventListener("pointerup", endDrag);
  galaxy.addEventListener("pointercancel", endDrag);
  galaxy.addEventListener("wheel", function (e) {
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.12 : 0.89;
    zoomAt(factor, e.clientX, e.clientY);
  }, { passive: false });

  /* ---- search / phase filter ---- */
  function search(term) {
    term = (term || "").trim().toLowerCase();
    DF.STARS.forEach(function (s) {
      var el = nodeEls[s.id];
      if (!el) return;
      if (!term) { el.classList.remove("dim", "hit"); return; }
      var hit = s.title.toLowerCase().indexOf(term) !== -1 || (s.goal || "").toLowerCase().indexOf(term) !== -1;
      el.classList.toggle("dim", !hit);
      el.classList.toggle("hit", hit);
    });
  }
  function filterPhase(pid) {
    DF.STARS.forEach(function (s) {
      var el = nodeEls[s.id];
      if (!el) return;
      el.classList.toggle("dim", pid && s.phase !== pid);
    });
    if (pid) {
      var stars = DF.STARS.filter(function (s) { return s.phase === pid; });
      if (stars.length) focus(stars[Math.floor(stars.length / 2)].id);
    }
  }
  function clearFilter() {
    DF.STARS.forEach(function (s) { var el = nodeEls[s.id]; if (el) el.classList.remove("dim", "hit"); });
  }

  window.addEventListener("resize", function () { /* keep current view; user can hit fit */ });

  DF.graph = {
    build: build, refresh: refresh, fit: fit, home: home, focus: focus, highlight: highlight,
    zoomIn: function () { zoomAt(1.2, window.innerWidth / 2, window.innerHeight / 2); },
    zoomOut: function () { zoomAt(0.83, window.innerWidth / 2, window.innerHeight / 2); },
    search: search, filterPhase: filterPhase, clearFilter: clearFilter,
    pos: pos
  };
})();
