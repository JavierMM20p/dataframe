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

  function pos(star) {
    var c = DF.PHASES[star.phase].center;
    // widen a touch horizontally, compress vertically so stacked phases do not collide
    return { x: c.x + star.off[0] * 1.12, y: c.y + star.off[1] * 0.72 };
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

  function positionEdges() {
    edgeList.forEach(function (edge) {
      var from = anchorFor(edge.from);
      var to = anchorFor(edge.to);
      if (!from || !to) return;
      edge.el.setAttribute("x1", from.x);
      edge.el.setAttribute("y1", from.y);
      edge.el.setAttribute("x2", to.x);
      edge.el.setAttribute("y2", to.y);
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

    // edges
    DF.STARS.forEach(function (s) {
      (s.prereq || []).forEach(function (pid) {
        var a = DF.STARS.find(function (x) { return x.id === pid; });
        if (!a) return;
        var pa = pos(a), pb = pos(s);
        var ln = document.createElementNS(SVGNS, "line");
        ln.setAttribute("x1", pa.x - bounds.minX); ln.setAttribute("y1", pa.y - bounds.minY);
        ln.setAttribute("x2", pb.x - bounds.minX); ln.setAttribute("y2", pb.y - bounds.minY);
        svg.appendChild(ln);
        edgeList.push({ el: ln, from: pid, to: s.id });
      });
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
