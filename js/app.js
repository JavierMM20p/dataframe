/* ============================================================
   DataFrame - application wiring.
   HUD, legend, search, zoom, data menu, onboarding, startup.
   ============================================================ */
(function () {
  "use strict";
  window.DF = window.DF || {};

  var $ = function (id) { return document.getElementById(id); };
  var progText = $("progText"), progBar = $("progBar");
  var clist = $("clist");
  var toastEl = $("toast"), toastTimer = null;
  var countEls = {};

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2400);
  }

  function updateProgress() {
    var s = DF.store.stats();
    progText.innerHTML = "<b>" + s.pct + "%</b> &nbsp;<b>" + s.done + "</b>/" + s.total;
    progBar.style.width = s.pct + "%";
    var stat = $("menuStat");
    if (stat) stat.textContent = s.done + " of " + s.total + " stars complete";
    Object.keys(countEls).forEach(function (pid) {
      var ps = DF.store.phaseStats(pid);
      countEls[pid].textContent = ps.done + "/" + ps.total;
    });
  }

  function buildLegend() {
    var selected = null;
    Object.keys(DF.PHASES).sort(function (a, b) { return DF.PHASES[a].order - DF.PHASES[b].order; })
      .forEach(function (pid) {
        var row = document.createElement("div");
        var name = document.createElement("span");
        name.textContent = DF.PHASES[pid].name;
        var count = document.createElement("span");
        count.style.color = "var(--faint)";
        count.style.marginLeft = "8px";
        count.style.fontVariantNumeric = "tabular-nums";
        countEls[pid] = count;
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.appendChild(name);
        row.appendChild(count);
        row.addEventListener("click", function () {
          if (selected === pid) { selected = null; DF.graph.clearFilter(); row.classList.remove("on"); }
          else {
            selected = pid;
            clist.querySelectorAll("div").forEach(function (d) { d.classList.remove("on"); });
            row.classList.add("on");
            DF.graph.filterPhase(pid);
          }
        });
        clist.appendChild(row);
      });
  }

  function recommendNext() {
    var ordered = DF.STARS.slice().sort(function (a, b) {
      return DF.PHASES[a.phase].order - DF.PHASES[b.phase].order;
    });
    var inProgress = ordered.find(function (s) { return DF.store.statusOf(s) === "progress"; });
    var avail = ordered.find(function (s) { return DF.store.statusOf(s) === "available"; });
    return inProgress || avail || ordered[0];
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function wire() {
    $("nextBtn").addEventListener("click", function () {
      var rec = recommendNext();
      if (rec) { DF.graph.focus(rec.id); DF.panel.open(rec.id); dismissHint(); }
    });
    $("zoomIn").addEventListener("click", DF.graph.zoomIn);
    $("zoomOut").addEventListener("click", DF.graph.zoomOut);
    $("zoomFit").addEventListener("click", DF.graph.fit);

    var search = $("search");
    if (search) search.addEventListener("input", function () { DF.graph.search(search.value); });

    $("panelX").addEventListener("click", DF.panel.close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { DF.panel.close(); closeMenu(); }
    });

    // data menu
    var menu = $("menu");
    function closeMenu() { menu.classList.remove("open"); menu.setAttribute("aria-hidden", "true"); }
    window._dfCloseMenu = closeMenu;
    $("menuBtn").addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle("open");
      menu.setAttribute("aria-hidden", open ? "false" : "true");
    });
    document.addEventListener("click", function (e) {
      if (!menu.contains(e.target) && e.target !== $("menuBtn")) closeMenu();
    });
    $("exportBtn").addEventListener("click", function () {
      download("dataframe-progress.json", DF.store.exportJSON());
      toast("Progress exported"); closeMenu();
    });
    $("importBtn").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var ok = DF.store.importObject(JSON.parse(r.result));
          if (ok) { DF.graph.refresh(); updateProgress(); toast("Progress imported"); }
          else toast("Could not read that file");
        } catch (err) { toast("Could not read that file"); }
        closeMenu();
      };
      r.readAsText(file);
      e.target.value = "";
    });
    $("linkBtn").addEventListener("click", function () {
      var link = DF.store.encodeLink();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () { toast("Progress link copied"); });
      } else { toast(link); }
      closeMenu();
    });
    $("resetBtn").addEventListener("click", function () {
      if (confirm("Reset all progress? This cannot be undone.")) {
        DF.store.reset(); DF.graph.refresh(); updateProgress(); toast("Progress reset");
      }
      closeMenu();
    });

    // hint
    $("hintX").addEventListener("click", dismissHint);
    setTimeout(function () { var h = $("hint"); if (h && h.parentNode) dismissHint(); }, 14000);

    // onboarding
    $("obGo").addEventListener("click", function () {
      $("onboard").classList.remove("open");
      $("onboard").setAttribute("aria-hidden", "true");
      try { localStorage.setItem("dataframe.onboarded", "1"); } catch (e) {}
    });
  }

  function dismissHint() {
    var h = $("hint");
    if (h) { h.style.opacity = "0"; setTimeout(function () { if (h.parentNode) h.remove(); }, 500); }
  }

  function maybeOnboard() {
    var seen = false;
    try { seen = localStorage.getItem("dataframe.onboarded") === "1"; } catch (e) {}
    if (!seen) {
      $("onboard").classList.add("open");
      $("onboard").setAttribute("aria-hidden", "false");
    }
  }

  DF.app = { updateProgress: updateProgress, toast: toast };

  // ---- startup ----
  var imported = DF.store.applyFromLocation();
  DF.graph.build();
  DF.graph.fit();
  buildLegend();
  updateProgress();
  wire();
  maybeOnboard();
  if (imported) toast("Progress loaded from link");
})();
