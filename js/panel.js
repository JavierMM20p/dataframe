/* ============================================================
   DataFrame - star detail panel.
   Renders objectives, the assembled prompt, checklist, notes, etc.
   ============================================================ */
(function () {
  "use strict";
  window.DF = window.DF || {};

  var panel = document.getElementById("panel");
  var body = document.getElementById("panelBody");
  var STATE = { locked: "Locked", available: "Available", progress: "In progress", complete: "Complete" };
  var BADGE = { ai: "AI-leverage", emerging: "Emerging", standards: "Standards" };
  var current = null;

  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function kindLabel(s) {
    if (s.kind === "project") return "project";
    if (s.kind === "capstone") return "capstone";
    if (s.kind === "orientation") return "orientation";
    return "lesson";
  }

  function open(id) {
    var s = DF.STARS.find(function (x) { return x.id === id; });
    if (!s) return;
    current = id;
    var status = DF.store.statusOf(s);
    var prompt = DF.assemblePrompt(s);
    var checks = DF.store.getChecks(id);

    var badgeChips = (s.badges || []).map(function (b) {
      return '<span class="chip">' + BADGE[b] + "</span>";
    }).join("");

    var h = "";
    h += '<div class="p-badges">' + badgeChips +
         '<span class="chip state ' + status + '">' + STATE[status] + "</span></div>";
    var lvl = DF.LEVELS && DF.LEVELS[DF.PHASES[s.phase].level];
    var lvlTag = lvl ? '<span class="p-level">Level ' + lvl.order + " · " + esc(lvl.name) + "</span>" : "";
    h += '<div class="p-phase">' + lvlTag + esc(DF.PHASES[s.phase].name) + " / " + kindLabel(s) + "</div>";
    h += "<h2>" + esc(s.title) + "</h2>";
    h += '<div class="p-meta">~' + esc(s.est || "") + " &nbsp;/&nbsp; your AI teaches it live</div>";

    if (status === "locked") {
      var need = (s.prereq || []).map(function (p) {
        var st = DF.STARS.find(function (x) { return x.id === p; });
        return st ? st.title : p;
      }).join(", ");
      h += '<div class="locked-banner"><b>LOCKED</b> &mdash; complete first: ' + esc(need) +
           ". You can still preview the lesson below.</div>";
    }

    h += '<div class="sec"><h3>Learning objectives</h3><ul class="obj">' +
         s.obj.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul></div>";

    if (s.ai) {
      h += '<div class="sec"><div class="ai-box"><div class="t">AI leverage / ' + esc(s.ai.t) + "</div>" +
           "<p>" + esc(s.ai.p) + '</p><div class="verify">' + esc(s.ai.v) + "</div></div></div>";
    }

    if (s.options) {
      h += '<div class="sec"><h3>Pick your project</h3><div class="opts">' +
           s.options.map(function (o) {
             return '<div class="opt"><div class="oh"><span class="th">' + esc(o.th) +
               '</span><span class="tt">' + esc(o.tt) + "</span></div><p>" + esc(o.p) + "</p></div>";
           }).join("") + "</div></div>";
    }

    h += '<div class="sec"><h3>Your AI professor / assembled prompt</h3>' +
         '<div class="promptbox"><pre id="promptText">' + esc(prompt) + "</pre>" +
         '<div class="cta">' +
         '<button class="btn primary" id="copyBtn">Copy full prompt</button>' +
         '<a class="btn" id="openClaude" href="https://claude.ai/new" target="_blank" rel="noopener">Open in Claude</a>' +
         '<a class="btn" id="openGpt" href="https://chatgpt.com/" target="_blank" rel="noopener">Open in ChatGPT</a>' +
         "</div></div></div>";

    h += '<div class="sec"><h3>Definition of done</h3><ul class="dod" id="dod">' +
         s.dod.map(function (d, i) {
           var on = checks[i] ? " on" : "";
           return '<li data-i="' + i + '" class="' + (on ? "on" : "") + '"><span class="cb">&#10003;</span><span>' +
             esc(d[0]) + "</span>" + (d[1] === "std" ? '<span class="std-tag">STANDARD</span>' : "") + "</li>";
         }).join("") + "</ul></div>";

    h += '<div class="sec"><h3>Resources</h3><div class="res">' +
         s.res.map(function (r) {
           var url = r[2] && /^https?:/.test(r[2]) ? r[2] : "#";
           var attr = url === "#" ? 'href="#" onclick="return false"' : 'href="' + url + '" target="_blank" rel="noopener"';
           return "<a " + attr + '><span class="ty">' + esc(r[1]) + "</span>" + esc(r[0]) + "</a>";
         }).join("") + "</div></div>";

    if (s.iq && s.iq.length) {
      h += '<div class="sec"><details class="iq"><summary>Interview questions (' + s.iq.length + ")</summary><ol>" +
           s.iq.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ol></details></div>";
    }

    h += '<div class="sec"><h3>Notes</h3><textarea class="notes" id="notes" placeholder="Your notes for this star, saved in this browser">' +
         esc(DF.store.getNotes(id)) + "</textarea></div>";

    h += '<button class="mark-done ' + (status === "complete" ? "done" : "") + '" id="markDone">' +
         (status === "complete" ? "Completed &mdash; mark incomplete" : "Mark star complete") + "</button>";

    body.innerHTML = h;
    body.scrollTop = 0;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");

    wire(s, prompt);
  }

  function wire(s, prompt) {
    var copy = document.getElementById("copyBtn");
    if (copy) copy.addEventListener("click", function () { copyPrompt(prompt, "Prompt copied - paste it into your AI"); });
    var oc = document.getElementById("openClaude");
    if (oc) oc.addEventListener("click", function () { copyPrompt(prompt, "Prompt copied - paste into the Claude tab"); });
    var og = document.getElementById("openGpt");
    if (og) og.addEventListener("click", function () { copyPrompt(prompt, "Prompt copied - paste into the ChatGPT tab"); });

    var dod = document.getElementById("dod");
    if (dod) {
      dod.querySelectorAll("li").forEach(function (li) {
        li.addEventListener("click", function () {
          var i = parseInt(li.getAttribute("data-i"), 10);
          var on = !li.classList.contains("on");
          li.classList.toggle("on", on);
          DF.store.setCheck(s.id, i, on);
          DF.graph.refresh();
        });
      });
    }

    var notes = document.getElementById("notes");
    if (notes) {
      notes.addEventListener("input", function () {
        DF.store.setNotes(s.id, notes.value);
        DF.graph.refresh();
      });
    }

    var md = document.getElementById("markDone");
    if (md) {
      md.addEventListener("click", function () {
        var nowComplete = DF.store.toggleComplete(s.id);
        DF.graph.refresh();
        DF.app.updateProgress();
        open(s.id); // re-render to reflect new state
        DF.app.toast(nowComplete ? "Star complete - new stars unlocked" : "Marked incomplete");
      });
    }
  }

  function copyPrompt(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { DF.app.toast(msg); }, function () { fallbackCopy(text); DF.app.toast(msg); });
    } else { fallbackCopy(text); DF.app.toast(msg); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function close() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    current = null;
  }

  DF.panel = { open: open, close: close };
})();
