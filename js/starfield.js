/* Monochrome parallax starfield + occasional shooting star. */
(function () {
  "use strict";
  var cv = document.getElementById("sky");
  if (!cv) return;
  var cx = cv.getContext("2d");
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var W, H, DPR, stars, shooters;

  function init() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = W + "px"; cv.style.height = H + "px";
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var n = Math.round((W * H) / 7000);
    stars = [];
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.3 + 0.2,
        base: Math.random() * 0.5 + 0.22,
        tw: Math.random() * 0.9 + 0.2,
        ph: Math.random() * 6.28,
        g: 200 + Math.floor(Math.random() * 55)
      });
    }
    shooters = [];
  }

  function draw(t) {
    cx.clearRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var a = reduce ? s.base : s.base + Math.sin(t * 0.001 * s.tw + s.ph) * 0.28;
      a = Math.max(0, Math.min(1, a));
      cx.globalAlpha = a;
      cx.fillStyle = "rgb(" + s.g + "," + s.g + "," + (s.g + 4) + ")";
      cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.283); cx.fill();
      if (s.r > 1) {
        cx.globalAlpha = a * 0.22;
        cx.beginPath(); cx.arc(s.x, s.y, s.r * 2.4, 0, 6.283); cx.fill();
      }
    }
    cx.globalAlpha = 1;
    if (!reduce) {
      if (Math.random() < 0.0035 && shooters.length < 2) {
        shooters.push({ x: Math.random() * W * 0.7, y: Math.random() * H * 0.4, len: 0, sp: 6 + Math.random() * 4, a: 1, dx: 1, dy: 0.45 });
      }
      for (var j = shooters.length - 1; j >= 0; j--) {
        var sh = shooters[j];
        sh.x += sh.sp * sh.dx; sh.y += sh.sp * sh.dy;
        sh.len = Math.min(sh.len + sh.sp, 120); sh.a -= 0.012;
        var g = cx.createLinearGradient(sh.x, sh.y, sh.x - sh.len * sh.dx, sh.y - sh.len * sh.dy);
        g.addColorStop(0, "rgba(255,255,255," + Math.max(0, sh.a) + ")");
        g.addColorStop(1, "rgba(255,255,255,0)");
        cx.strokeStyle = g; cx.lineWidth = 1.5;
        cx.beginPath(); cx.moveTo(sh.x, sh.y); cx.lineTo(sh.x - sh.len * sh.dx, sh.y - sh.len * sh.dy); cx.stroke();
        if (sh.a <= 0 || sh.x > W + 50) shooters.splice(j, 1);
      }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", init);
  init();
  if (reduce) draw(0); else requestAnimationFrame(draw);
})();
