/* ============================================================
   DataFrame - progress store (localStorage + export/import + link).
   Persists completion, in-progress, per-star checklist and notes.
   ============================================================ */
(function () {
  "use strict";
  window.DF = window.DF || {};
  var KEY = "dataframe.progress.v1";

  var state = { completed: [], started: [], notes: {}, checks: {} };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var p = JSON.parse(raw);
        state.completed = p.completed || [];
        state.started = p.started || [];
        state.notes = p.notes || {};
        state.checks = p.checks || {};
      }
    } catch (e) { /* ignore corrupt storage */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota / private mode */ }
  }
  function has(arr, id) { return arr.indexOf(id) !== -1; }
  function add(arr, id) { if (!has(arr, id)) arr.push(id); }
  function remove(arr, id) { var i = arr.indexOf(id); if (i !== -1) arr.splice(i, 1); }

  var store = {
    isComplete: function (id) { return has(state.completed, id); },
    prereqsMet: function (star) {
      return (star.prereq || []).every(function (p) { return has(state.completed, p); });
    },
    statusOf: function (star) {
      if (has(state.completed, star.id)) return "complete";
      if (!this.prereqsMet(star)) return "locked";
      return has(state.started, star.id) ? "progress" : "available";
    },
    toggleComplete: function (id) {
      if (has(state.completed, id)) { remove(state.completed, id); }
      else { add(state.completed, id); remove(state.started, id); }
      save();
      return has(state.completed, id);
    },
    markStarted: function (id) {
      if (!has(state.completed, id) && !has(state.started, id)) { add(state.started, id); save(); }
    },
    getChecks: function (id) { return state.checks[id] || []; },
    setCheck: function (id, idx, val) {
      var arr = state.checks[id] || [];
      arr[idx] = val;
      state.checks[id] = arr;
      if (val) this.markStarted(id);
      save();
    },
    getNotes: function (id) { return state.notes[id] || ""; },
    setNotes: function (id, text) {
      if (text) { state.notes[id] = text; this.markStarted(id); } else { delete state.notes[id]; }
      save();
    },
    stats: function () {
      var total = DF.STARS.length;
      var done = state.completed.filter(function (id) {
        return DF.STARS.some(function (s) { return s.id === id; });
      }).length;
      return { done: done, total: total, pct: total ? Math.round((done / total) * 100) : 0 };
    },
    phaseStats: function (phaseId) {
      var stars = DF.STARS.filter(function (s) { return s.phase === phaseId; });
      var done = stars.filter(function (s) { return has(state.completed, s.id); }).length;
      return { done: done, total: stars.length };
    },
    exportJSON: function () { return JSON.stringify(state, null, 2); },
    importObject: function (obj) {
      if (!obj || typeof obj !== "object") return false;
      state.completed = Array.isArray(obj.completed) ? obj.completed : [];
      state.started = Array.isArray(obj.started) ? obj.started : [];
      state.notes = obj.notes || {};
      state.checks = obj.checks || {};
      save();
      return true;
    },
    reset: function () { state = { completed: [], started: [], notes: {}, checks: {} }; save(); },

    encodeLink: function () {
      var payload = { c: state.completed, s: state.started };
      var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      var base = location.origin + location.pathname;
      return base + "?p=" + b64;
    },
    applyFromLocation: function () {
      var m = location.search.match(/[?&]p=([^&]+)/);
      if (!m) return false;
      try {
        var obj = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
        (obj.c || []).forEach(function (id) { add(state.completed, id); });
        (obj.s || []).forEach(function (id) { add(state.started, id); });
        save();
        history.replaceState(null, "", location.origin + location.pathname);
        return true;
      } catch (e) { return false; }
    }
  };

  load();
  DF.store = store;
})();
