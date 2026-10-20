/* Pixel-art sprites for "Where in the World Is Cameron SanFrancisco?"
 * Plain browser script. Defines on window:
 *   drawStreet(g, seed)                 384x188 street backdrop (cached per seed)
 *   drawDetective(g, x, y, frame, opts) player detective; x = body centre, y = feet. opts {run, flip, slump}
 *                                       (slump: head down, hat low, sad 12-frame shuffle with a rain cloud)
 *   drawSuspect(g, x, y, frame, opts)   fleeing suspect; opts {hat, hair, skin, run, flip, caught, glasses}
 *   drawFlyingHat(g, x, y, angleStep)   the suspect's fedora centred on x,y, rotated angleStep * 90deg
 *                                       (fractional steps allowed; snapped to 22.5deg)
 *   henchmanScene(g, t, style)          one frame of the 400x240 overlay; style "tiptoe" | "scoot" (aliases "sneak",
 *                                       "dance") | "peek" (cycles right/left/corner; or "peek-left" etc.);
 *                                       returns true while playing, false when done.
 * Everything is integer fillRect pixel art and deterministic from its inputs. People (detective, suspect,
 * henchman, flying hat) are drawn at half resolution into scratch canvases and blitted at 2x on even
 * coordinates, so each of their pixels is a crisp 2x2 block; the street stays at full resolution.
 */
(function () {
  "use strict";
  var round = Math.round, floor = Math.floor, sin = Math.sin, cos = Math.cos, PI = Math.PI,
    max = Math.max, min = Math.min, abs = Math.abs, sqrt = Math.sqrt;

  /* ---------- tiny helpers ---------- */
  function R(g, x, y, w, h, c) { if (c) g.fillStyle = c; g.fillRect(round(x), round(y), round(w), round(h)); }
  function P(g, x, y, c) { if (c) g.fillStyle = c; g.fillRect(round(x), round(y), 1, 1); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rng(seed) {
    var s = (seed | 0) ^ 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) | 0; var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
  function rgb(c) {
    c = String(c || "#888").replace("#", "");
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hex(a) { return "#" + a.map(function (v) { v = clamp(round(v), 0, 255); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
  var colorMemo = {};
  function shade(c, f) { var k = c + "*" + f, v = colorMemo[k]; if (v) return v; var a = rgb(c); return (colorMemo[k] = hex([a[0] * f, a[1] * f, a[2] * f])); }
  function mix(c1, c2, t) { var k = c1 + c2 + t, v = colorMemo[k]; if (v) return v; var a = rgb(c1), b = rgb(c2); return (colorMemo[k] = hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])); }
  var memo = {};
  function M(fn, c, f) { var k = fn + c + f; return memo[k] || (memo[k] = fn === "s" ? shade(c, f) : mix(c, "#ffffff", f)); }
  function disc(g, cx, cy, r, c, flatBottom) {
    if (c) g.fillStyle = c;
    for (var dy = -r; dy <= (flatBottom != null ? flatBottom : r); dy++) {
      var hw = floor(sqrt(max(0, r * r - dy * dy)) + 0.35);
      g.fillRect(round(cx - hw), round(cy + dy), hw * 2 + 1, 1);
    }
  }
  function ellipse(g, cx, cy, rx, ry, c) {
    if (c) g.fillStyle = c;
    for (var dy = -ry; dy <= ry; dy++) {
      var hw = floor(rx * sqrt(max(0, 1 - (dy * dy) / (ry * ry))) + 0.35);
      g.fillRect(round(cx - hw), round(cy + dy), hw * 2 + 1, 1);
    }
  }
  /* A jointed limb: polyline drawn as square "dots", optional outline pass first, optional stripes. */
  function chain(g, pts, w, fill, ol, stripe, stripeLen) {
    var dots = [], h = w >> 1, i, j;
    for (i = 0; i + 3 < pts.length; i += 2) {
      var x0 = pts[i], y0 = pts[i + 1], dx = pts[i + 2] - x0, dy = pts[i + 3] - y0, n = max(1, Math.ceil(max(abs(dx), abs(dy))));
      for (j = i ? 1 : 0; j <= n; j++) dots.push(round(x0 + dx * j / n), round(y0 + dy * j / n));
    }
    if (ol) {
      g.fillStyle = ol;
      for (i = 0; i < dots.length; i += 2) { g.fillRect(dots[i] - h - 1, dots[i + 1] - h, w + 2, w); g.fillRect(dots[i] - h, dots[i + 1] - h - 1, w, w + 2); }
    }
    var sl = stripeLen || 2;
    g.fillStyle = fill;
    for (i = 0; i < dots.length; i += 2) {
      if (stripe) g.fillStyle = (floor(i / 2 / sl) % 2) ? stripe : fill;
      g.fillRect(dots[i] - h, dots[i + 1] - h, w, w);
    }
  }
  function pt(x, y, a, L) { return [x + sin(a) * L, y + cos(a) * L]; }
  /* two-bone IK: angles (from straight down, + = forward) reaching target tx,ty; bend = +1/-1 elbow side */
  function ik(sx, sy, tx, ty, L1, L2, bend, extra) {
    var dx = tx - sx, dy = ty - sy, d = clamp(sqrt(dx * dx + dy * dy), 0.5, L1 + L2 - 0.01), base = Math.atan2(dx, dy);
    var A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), a1 = base + bend * A, e = pt(sx, sy, a1, L1);
    var o = { a1: a1, a2: Math.atan2(tx - e[0], ty - e[1]) };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  /* black cross-bands along a limb polyline (for striped sleeves) */
  function bands(g, pts, w, c, every) {
    var h = w >> 1, acc = 0; g.fillStyle = c;
    for (var i = 0; i + 3 < pts.length; i += 2) {
      var x0 = pts[i], y0 = pts[i + 1], dx = pts[i + 2] - x0, dy = pts[i + 3] - y0, L = sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
      for (var d = 0; d < L; d += 0.5) {
        acc += 0.5; if (floor(acc) % every >= 2) continue;
        var cx = x0 + ux * d, cy = y0 + uy * d;
        for (var j = -h; j <= w - 1 - h; j++) g.fillRect(round(cx - uy * j), round(cy + ux * j), 1, 1);
      }
    }
  }

  /* ---------- 3x5 pixel font for signs ---------- */
  var FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
    F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
    K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
    Z: "111001010100111", "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
    "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010", "8": "111101111101111",
    "9": "111101111001110", "&": "010101010101011", "'": "010010000000000", ".": "000000000000010", "-": "000000111000000", " ": "000000000000000"
  };
  function text(g, s, x, y, c) {
    g.fillStyle = c;
    for (var i = 0; i < s.length; i++) {
      var f = FONT[s[i]] || FONT[" "];
      for (var k = 0; k < 15; k++) if (f[k] === "1") g.fillRect(x + i * 4 + (k % 3), y + floor(k / 3), 1, 1);
    }
  }

  /* =====================================================================
   * STREET
   * ===================================================================== */
  var SKIES = [
    { name: "dusk", bands: ["#1f2a5c", "#28376c", "#33467c", "#43578c", "#58699a", "#7a7ba4", "#a088a6", "#c896a0", "#e2a894", "#f0c08c"],
      cloud: "#f2cfc4", cloudS: "#b78aa6", cloudH: "#fff0e2", far: "#4c5487", farLit: "#f2c46c", haze: "#8a7ea6", sun: "#ffd890" },
    { name: "day", bands: ["#2f5bb8", "#3766c0", "#4072c8", "#4b7fcf", "#5a8cd6", "#6c9adc", "#80a9e0", "#96b8e4", "#aecbe8", "#c4daec"],
      cloud: "#f4f6fb", cloudS: "#aebcd8", cloudH: "#ffffff", far: "#7b8fc0", farLit: "#dfe8f4", haze: "#a6b8dc", sun: "#fff4c0" },
    { name: "night", bands: ["#0c1030", "#111638", "#161c42", "#1b234c", "#212a56", "#283260", "#2f3a68", "#374270", "#3e4a76", "#4a5480"],
      cloud: "#4a5482", cloudS: "#2e3660", cloudH: "#6a74a2", far: "#232a50", farLit: "#f2c46c", haze: "#2a3260", sun: "#f4f0d8" }
  ];
  var SHOPS = [
    ["CAFE", "#c8323c", "#f3e9d2", "cups"], ["BOOKS", "#2b6b5a", "#f3e9d2", "books"], ["DELI", "#2f5ea8", "#f3e9d2", "jars"],
    ["PIZZA", "#2b8a3e", "#f3e9d2", "pizza"], ["BAKERY", "#d86a8a", "#fbe8ee", "cakes"], ["FLOWERS", "#7a3e8a", "#f3e9d2", "flowers"],
    ["NEWS", "#1d1a2e", "#f7d046", "papers"], ["TOYS", "#e08a1e", "#fff2c8", "toys"], ["MUSIC", "#3a3a8a", "#d8d8f8", "records"],
    ["DINER", "#c8323c", "#ffffff", "cups"], ["TAILOR", "#5a4a3a", "#e8dcc4", "suits"], ["HOTEL", "#7a1e2a", "#f7d046", "lobby"],
    ["CINEMA", "#2a2a5a", "#f7d046", "posters"], ["BANK", "#3a4a5a", "#e8e0c8", "bank"], ["SHOES", "#a04a20", "#f3e9d2", "shoes"]
  ];

  function sky(g, S, r) {
    var B = S.bands, bh = 14, i, x, y;
    for (i = 0; i < B.length; i++) R(g, 0, i * bh, 384, bh + 1, B[i]);
    R(g, 0, B.length * bh, 384, 188, B[B.length - 1]);
    // dithered band seams
    for (i = 1; i < B.length; i++) {
      y = i * bh;
      g.fillStyle = B[i];
      for (x = 0; x < 384; x += 2) { g.fillRect(x, y - 2, 1, 1); g.fillRect(x + 1, y - 1, 1, 1); }
      g.fillStyle = B[i - 1];
      for (x = 0; x < 384; x += 2) g.fillRect(x + 1, y, 1, 1);
    }
    if (S.name === "night") {
      for (i = 0; i < 70; i++) { x = floor(r() * 384); y = floor(r() * 90); P(g, x, y, r() < 0.2 ? "#ffffff" : "#9aa4d8"); if (r() < 0.08) { P(g, x - 1, y, "#5a64a0"); P(g, x + 1, y, "#5a64a0"); P(g, x, y - 1, "#5a64a0"); P(g, x, y + 1, "#5a64a0"); } }
      var mx = 40 + floor(r() * 300), my = 18 + floor(r() * 18);
      g.globalAlpha = 0.12; disc(g, mx, my, 12, S.sun); g.globalAlpha = 0.2; disc(g, mx, my, 9, S.sun); g.globalAlpha = 1;
      disc(g, mx, my, 6, S.sun); disc(g, mx + 3, my - 2, 5, S.bands[1]); P(g, mx - 3, my + 1, "#d8d4bc"); P(g, mx - 2, my + 3, "#d8d4bc");
    } else {
      var sx = 60 + floor(r() * 260), sy = S.name === "dusk" ? 104 : 26;
      g.globalAlpha = 0.10; disc(g, sx, sy, 22, S.sun); g.globalAlpha = 0.16; disc(g, sx, sy, 15, S.sun); g.globalAlpha = 1;
      disc(g, sx, sy, 9, S.sun); disc(g, sx - 2, sy - 2, 5, mix(S.sun, "#ffffff", 0.5));
    }
  }
  function cloud(g, S, cx, cy, w, r) {
    var puffs = [], n = 3 + floor(w / 10), i;
    for (i = 0; i < n; i++) {
      var t = i / (n - 1), rr = round(4 + sin(t * PI) * (w / 6) + r() * 3);
      puffs.push([round(cx - w / 2 + t * w), cy - round(sin(t * PI) * w / 10), rr]);
    }
    for (i = 0; i < n; i++) disc(g, puffs[i][0], puffs[i][1] + 2, puffs[i][2], S.cloudS, 2);
    for (i = 0; i < n; i++) disc(g, puffs[i][0], puffs[i][1], puffs[i][2], S.cloud, 1);
    for (i = 0; i < n; i++) { var p = puffs[i]; R(g, p[0] - p[2] + 2, p[1] - p[2] + 1, max(1, p[2] - 1), 1, S.cloudH); R(g, p[0] - p[2] + 1, p[1] - p[2] + 2, 1, 2); }
    R(g, cx - w / 2 - 2, cy + 3, w + 4, 1, S.cloudS);
  }
  function farSkyline(g, S, r) {
    var x = -4;
    while (x < 384) {
      var w = 8 + floor(r() * 18), h = 26 + floor(r() * 56), top = 128 - h;
      R(g, x, top, w, 140 - top, S.far);
      if (r() < 0.3) { R(g, x + 2, top - 3, w - 4, 3); }
      if (r() < 0.25) { R(g, x + floor(w / 2), top - 10, 1, 10); if (S.name !== "day") P(g, x + floor(w / 2), top - 11, "#ff5a4a"); g.fillStyle = S.far; }
      for (var wy = top + 3; wy < 136; wy += 4) for (var wx = x + 2; wx < x + w - 1; wx += 3) {
        var q = r();
        if (q < 0.18) P(g, wx, wy, S.farLit); else if (q < 0.3) P(g, wx, wy, mix(S.far, "#000000", 0.25));
      }
      g.fillStyle = S.far; x += w + (r() < 0.3 ? 2 : 0);
    }
    // atmospheric haze line
    g.globalAlpha = 0.25; R(g, 0, 118, 384, 22, S.haze); g.globalAlpha = 1;
  }
  function midLayer(g, S, r) {
    var x = -10, cols = ["#5a5a78", "#6a5a6e", "#4e5f7a", "#6e6a7e", "#585070", "#4a5468"];
    if (S.name === "day") cols = ["#8a8eaa", "#9a8e9e", "#7e8fa8", "#a29eae", "#8a84a0", "#7a8498"];
    while (x < 384) {
      var w = 26 + floor(r() * 34), top = 24 + floor(r() * 46), c = cols[floor(r() * cols.length)], d = shade(c, 0.78), l = mix(c, "#ffffff", 0.18);
      R(g, x, top, w, 140 - top, c); R(g, x + w - 3, top, 3, 140 - top, d); R(g, x, top, w, 2, l); R(g, x - 1, top - 1, w + 2, 1, d);
      // windows
      var lit = S.name === "day" ? 0.08 : 0.38;
      for (var wy = top + 5; wy < 132; wy += 6) for (var wx = x + 3; wx < x + w - 5; wx += 5) {
        var q = r();
        R(g, wx, wy, 3, 4, q < lit ? (q < lit / 3 ? "#ffe9a8" : "#f2c46c") : shade(c, 0.6));
        if (q >= lit) P(g, wx, wy, mix(c, "#9ab0d8", 0.35));
      }
      // rooftop gear
      var k = r();
      if (k < 0.3) { // water tower
        var tx = x + 4 + floor(r() * (w - 14));
        R(g, tx + 1, top - 4, 1, 4, "#3a2a2a"); R(g, tx + 7, top - 4, 1, 4); R(g, tx + 1, top - 3, 7, 1);
        R(g, tx, top - 13, 9, 9, "#6a4a3a"); R(g, tx, top - 13, 2, 9, "#8a6248"); R(g, tx + 7, top - 13, 2, 9, "#4a3228");
        R(g, tx, top - 10, 9, 1, "#3a2a2a"); R(g, tx, top - 6, 9, 1); R(g, tx - 1, top - 14, 11, 1, "#3a2a2a"); R(g, tx + 1, top - 15, 7, 1); R(g, tx + 3, top - 16, 3, 1); P(g, tx + 4, top - 17);
      } else if (k < 0.55) { // antenna
        var ax = x + floor(w / 2); R(g, ax, top - 14, 1, 14, "#2a2a3a"); R(g, ax - 2, top - 10, 5, 1); R(g, ax - 1, top - 6, 3, 1);
        if (S.name !== "day") { P(g, ax, top - 15, "#ff4a3a"); g.globalAlpha = 0.3; R(g, ax - 1, top - 16, 3, 3, "#ff4a3a"); g.globalAlpha = 1; }
      } else if (k < 0.8) { // vents / AC units
        R(g, x + 3, top - 4, 7, 4, "#7a7a8a"); R(g, x + 3, top - 4, 7, 1, "#9a9aaa"); R(g, x + 5, top - 3, 3, 2, "#4a4a5a");
        if (w > 26) { R(g, x + w - 10, top - 3, 5, 3, "#6a6a7a"); R(g, x + w - 9, top - 6, 2, 3, "#5a5a6a"); }
      }
      x += w + floor(r() * 3);
    }
  }

  function windowPane(g, x, y, w, h, lit, r, frame, sill) {
    R(g, x - 1, y - 1, w + 2, h + 2, frame);
    if (lit) {
      R(g, x, y, w, h, "#f2c46c"); R(g, x, y, w, floor(h / 2), "#ffe29a"); P(g, x, y, "#fff4cc");
      var q = r();
      if (q < 0.3) { R(g, x, y, 1, h, "#c8505a"); R(g, x + w - 1, y, 1, h); R(g, x, y, w, 1, "#a83a46"); } // curtains
      else if (q < 0.45) { R(g, x + 1, y + h - 4, 2, 3, "#3a2a2a"); P(g, x + 1, y + h - 5); P(g, x + 3, y + h - 5); P(g, x + 3, y + h - 2); } // cat
      else if (q < 0.6) { R(g, x + w - 3, y + h - 6, 1, 5, "#5a3a2a"); R(g, x + w - 4, y + h - 7, 3, 2, "#fff4cc"); } // lamp
    } else {
      R(g, x, y, w, h, "#29345a"); R(g, x, y, w, 1, "#1c2442");
      g.fillStyle = "#5a72a8"; for (var i = 0; i < min(w, h) - 1; i++) if (y + 2 + i < y + h && x + w - 2 - i >= x) g.fillRect(x + w - 2 - i, y + 2 + i, 1, 1);
      P(g, x + w - 2, y + 1, "#8aa0d0");
    }
    R(g, x + floor(w / 2), y, 1, h, frame); if (h > 6) R(g, x, y + floor(h / 2), w, 1, frame);
    if (sill !== false) { R(g, x - 2, y + h + 1, w + 4, 1, "#e6dccb"); R(g, x - 2, y + h + 2, w + 4, 1, "#8a8272"); }
  }
  function flowerBox(g, x, y, w, r) {
    R(g, x, y, w, 3, "#7a4a2a"); R(g, x, y, w, 1, "#9a6a3a");
    for (var i = 0; i < w; i += 2) { P(g, x + i, y - 1, "#3a8a3a"); P(g, x + i + 1, y - 2, "#4aa44a"); if (r() < 0.5) P(g, x + i, y - 2, ["#e84a6a", "#f7d046", "#f0f0f0", "#c84ae8"][floor(r() * 4)]); }
  }
  function brick(g, x, y, w, h, base, mortar) {
    R(g, x, y, w, h, base);
    var dark = shade(base, 0.86), lite = mix(base, "#ffffff", 0.1), row = 0;
    for (var yy = y; yy < y + h; yy += 3, row++) {
      R(g, x, yy + 2, w, 1, mortar);
      for (var xx = x + (row % 2 ? 2 : 0) - 4; xx < x + w; xx += 6) {
        if (xx >= x) R(g, xx, yy, 1, 2, mortar);
        if ((xx * 7 + row * 13) % 5 === 0 && xx + 2 < x + w && xx + 1 >= x) R(g, xx + 1, yy, 4 > x + w - xx - 1 ? x + w - xx - 1 : 4, 1, (xx + row) % 3 ? dark : lite);
      }
    }
  }
  function cornice(g, x, w, top, c) {
    var l = mix(c, "#ffffff", 0.25), d = shade(c, 0.6);
    R(g, x - 2, top, w + 4, 4, c); R(g, x - 2, top, w + 4, 1, l); R(g, x - 2, top + 4, w + 4, 1, d);
    for (var i = x - 1; i < x + w + 2; i += 3) R(g, i, top + 5, 2, 2, c);
    R(g, x, top + 7, w, 1, d);
  }

  function storefront(g, x, w, r, shop, kind) {
    var gTop = 104, name = shop[0], awnA = shop[1], awnB = shop[2], i;
    // wall band around storefront
    R(g, x, gTop, w, 36, kind.trim); R(g, x, gTop, w, 1, mix(kind.trim, "#ffffff", 0.3));
    // sign board
    var tw = name.length * 4 - 1, bw = max(tw + 8, 24), bx = x + floor((w - bw) / 2);
    var board = r() < 0.5 ? "#1d1a2e" : shade(awnA, 0.5);
    R(g, bx - 1, gTop + 1, bw + 2, 10, "#0e0c16"); R(g, bx, gTop + 2, bw, 8, board); R(g, bx, gTop + 2, bw, 1, mix(board, "#ffffff", 0.2));
    text(g, name, bx + floor((bw - tw) / 2), gTop + 4, kind.signText || "#f7d046");
    P(g, bx + 1, gTop + 3, "#8a8a9a"); P(g, bx + bw - 2, gTop + 3); P(g, bx + 1, gTop + 8); P(g, bx + bw - 2, gTop + 8);
    // awning (striped, scalloped)
    var ay = gTop + 12, ah = 7;
    R(g, x + 1, ay - 1, w - 2, 1, shade(awnA, 0.45));
    for (i = 0; i < w - 2; i++) {
      var c = floor(i / 4) % 2 ? awnB : awnA;
      R(g, x + 1 + i, ay, 1, ah, c);
      if (floor(i / 4) % 2 === 0) { P(g, x + 1 + i, ay, mix(c, "#ffffff", 0.25)); }
      if (i % 4 === 1 || i % 4 === 2) P(g, x + 1 + i, ay + ah, c); // scallop
    }
    R(g, x + 1, ay + 2, w - 2, 1, "rgba(0,0,0,0.12)");
    g.fillStyle = "rgba(0,0,0,0.25)"; for (i = 0; i < w - 2; i++) if (i % 4 === 0 || i % 4 === 3) g.fillRect(x + 1 + i, ay + ah, 1, 1);
    // shadow under awning
    R(g, x + 1, ay + ah + 1, w - 2, 2, "rgba(0,0,0,0.3)");
    // display windows + door
    var wy = ay + ah + 1, wh = 140 - wy - 3, doorW = 9, doorX = r() < 0.5 ? x + 4 : x + w - 4 - doorW;
    var lit = "#f6d896", litTop = "#fff0c4";
    function display(dx, dw) {
      if (dw < 6) return;
      R(g, dx - 1, wy, dw + 2, wh + 1, "#1d1a2e");
      R(g, dx, wy + 1, dw, wh - 1, lit); R(g, dx, wy + 1, dw, 3, litTop);
      goods(g, dx, wy + 1, dw, wh - 1, shop[3], r);
      g.fillStyle = "rgba(255,255,255,0.35)"; for (var k = 0; k < 5; k++) { g.fillRect(dx + 2 + k, wy + 2 + k, 1, 1); g.fillRect(dx + 5 + k, wy + 2 + k, 1, 1); }
      R(g, dx, wy + wh - 1, dw, 1, "#5a4a3a"); // ledge
    }
    if (doorX < x + w / 2) display(doorX + doorW + 3, x + w - 4 - (doorX + doorW + 3)); else display(x + 4, doorX - 3 - (x + 4));
    // door
    R(g, doorX - 1, wy, doorW + 2, 140 - wy, "#1d1a2e");
    var dc = shade(awnA, 0.6);
    R(g, doorX, wy + 1, doorW, 140 - wy - 1, dc); R(g, doorX, wy + 1, 1, 140 - wy - 1, mix(dc, "#ffffff", 0.2));
    R(g, doorX + 2, wy + 3, doorW - 4, 7, lit); R(g, doorX + 2, wy + 3, doorW - 4, 1, litTop);
    R(g, doorX + 2, wy + 12, doorW - 4, 1, shade(dc, 0.7)); R(g, doorX + 2, wy + 14, doorW - 4, 1);
    P(g, doorX + doorW - 2, wy + 11, "#f7d046");
    if (r() < 0.6) { R(g, doorX + 2, wy + 5, 5, 3, "#c8323c"); R(g, doorX + 3, wy + 6, 3, 1, "#ffffff"); }
    R(g, doorX - 1, 138, doorW + 2, 2, "#8a8478"); R(g, doorX - 1, 138, doorW + 2, 1, "#b8b0a4"); // step
    R(g, x + 1, 138, w - 2, 2, shade(kind.trim, 0.7)); R(g, doorX - 1, 138, doorW + 2, 2, "#9a9488");
  }
  function goods(g, x, y, w, h, kind, r) {
    var i, j, c;
    var pal = ["#c8323c", "#2f5ea8", "#2b8a3e", "#f7d046", "#7a3e8a", "#e08a1e", "#1d1a2e", "#f3e9d2"];
    R(g, x, y + h - 6, w, 1, "#8a6a4a"); // lower shelf
    if (kind === "books" || kind === "records" || kind === "papers") {
      for (j = 0; j < 2; j++) { var sy = y + 4 + j * 6; R(g, x, sy + 4, w, 1, "#8a6a4a");
        for (i = 1; i < w - 1; i++) { if (r() < 0.15) continue; c = pal[floor(r() * pal.length)]; var bh = 3 + floor(r() * 2); R(g, x + i, sy + 4 - bh, 1, bh, c); } }
    } else if (kind === "cakes" || kind === "pizza") {
      for (i = 2; i < w - 5; i += 7) { var cx = x + i; R(g, cx, y + h - 9, 5, 3, kind === "pizza" ? "#e8a040" : "#f3e9d2"); R(g, cx, y + h - 10, 5, 1, kind === "pizza" ? "#c8323c" : "#e86a8a"); P(g, cx + 2, y + h - 11, "#c8323c"); R(g, cx - 1, y + h - 7, 7, 1, "#c8c0b0"); }
      for (i = 3; i < w - 3; i += 5) { disc(g, x + i, y + 6, 1, pal[floor(r() * 6)]); }
    } else if (kind === "flowers") {
      for (i = 2; i < w - 2; i += 4) { R(g, x + i, y + h - 9, 3, 3, "#9a5a2a"); R(g, x + i + 1, y + h - 13, 1, 4, "#2b8a3e"); P(g, x + i, y + h - 12, "#3aa04a"); var fc = pal[floor(r() * 6)]; R(g, x + i, y + h - 15, 3, 2, fc); P(g, x + i + 1, y + h - 16, fc); P(g, x + i + 1, y + h - 15, "#f7d046"); }
    } else if (kind === "suits") {
      for (i = 3; i < w - 6; i += 9) { disc(g, x + i + 2, y + 3, 1, "#c8a888"); R(g, x + i, y + 5, 5, 8, pal[floor(r() * 3)]); R(g, x + i + 2, y + 5, 1, 4, "#f3e9d2"); R(g, x + i + 2, y + 13, 1, 3, "#5a4a3a"); }
    } else if (kind === "bank" || kind === "lobby") {
      R(g, x + 1, y + h - 10, w - 2, 4, "#7a4a2a"); R(g, x + 1, y + h - 10, w - 2, 1, "#9a6a3a");
      for (i = 3; i < w - 3; i += 6) { R(g, x + i, y + 2, 1, 3, "#c8a040"); disc(g, x + i, y + 6, 1, "#fff4cc"); }
      if (w > 12) { R(g, x + 4, y + h - 13, 2, 3, "#3a2a2a"); P(g, x + 4, y + h - 14, "#d9a47c"); }
    } else if (kind === "posters") {
      for (i = 2; i < w - 6; i += 9) { R(g, x + i, y + 2, 7, 10, "#1d1a2e"); R(g, x + i + 1, y + 3, 5, 8, pal[floor(r() * 6)]); disc(g, x + i + 3, y + 6, 1, "#f7d046"); R(g, x + i + 1, y + 9, 5, 1, "#f3e9d2"); }
    } else if (kind === "shoes" || kind === "toys") {
      for (j = 0; j < 2; j++) { var yy = y + 6 + j * 6; R(g, x, yy + 2, w, 1, "#8a6a4a");
        for (i = 2; i < w - 4; i += 5) { c = pal[floor(r() * 6)]; if (kind === "shoes") { R(g, x + i, yy, 4, 2, c); R(g, x + i, yy - 1, 2, 1, c); } else { R(g, x + i, yy - 2, 3, 4, c); P(g, x + i + 1, yy - 3, "#f3e9d2"); } } }
    } else { // cups, jars
      for (j = 0; j < 2; j++) { var y2 = y + 6 + j * 6; R(g, x, y2 + 2, w, 1, "#8a6a4a");
        for (i = 2; i < w - 3; i += 4) { c = kind === "jars" ? pal[floor(r() * 6)] : "#f3e9d2"; R(g, x + i, y2 - 1, 2, 3, c); if (kind === "jars") P(g, x + i, y2 - 2, "#8a6a4a"); else P(g, x + i + 2, y2, c); } }
    }
  }

  var FACADES = {
    brick: function (r) { var b = ["#9a4a3a", "#8a5038", "#a8603e", "#7a3e36", "#93573f"][floor(r() * 5)]; return { base: b, trim: "#4a3a3a", mortar: shade(b, 0.7), corn: "#c8bca8", frame: "#e6dccb" }; },
    stone: function (r) { var b = ["#cbb894", "#c2b6a2", "#d4c4a0", "#b8ac98"][floor(r() * 4)]; return { base: b, trim: "#6a5a4a", corn: mix(b, "#ffffff", 0.2), frame: "#5a4a3a" }; },
    deco: function (r) { var b = ["#d8c8a0", "#9aa8b4", "#c8b0a0", "#a8b89a"][floor(r() * 4)]; return { base: b, trim: "#2a3a4a", corn: "#e8d8b0", frame: "#3a3a4a", signText: "#f3e9d2" }; },
    town: function (r) { var b = ["#e8a0a0", "#9ac8b4", "#e8d090", "#a8b8e0", "#d8a8d0"][floor(r() * 5)]; return { base: b, trim: shade(b, 0.55), corn: "#f3efe6", frame: "#f3efe6" }; },
    glass: function (r) { var b = ["#4a6a98", "#3e6a7a", "#5a6a8a"][floor(r() * 3)]; return { base: b, trim: "#2a2a3a", corn: "#9aaac0", frame: "#2a3a58", signText: "#9ae8ff" }; }
  };
  function frontBuilding(g, x, w, top, type, r, S, shop) {
    var K = FACADES[type](r), i, wx, wy, base = K.base, dark = shade(base, 0.72), lite = mix(base, "#ffffff", 0.22);
    var litP = S.name === "day" ? 0.12 : S.name === "night" ? 0.6 : 0.45;
    if (type === "brick") {
      brick(g, x, top, w, 104 - top, base, K.mortar);
    } else if (type === "stone") {
      R(g, x, top, w, 104 - top, base);
      for (wy = top + 6, i = 0; wy < 104; wy += 6, i++) { R(g, x, wy, w, 1, shade(base, 0.82)); for (wx = x + (i % 2 ? 6 : 0); wx < x + w; wx += 12) R(g, wx, wy - 5, 1, 5); }
      R(g, x, top, 3, 104 - top, lite); R(g, x + w - 3, top, 3, 104 - top, dark);
    } else if (type === "deco") {
      R(g, x, top, w, 104 - top, base);
    } else if (type === "town") {
      R(g, x, top, w, 104 - top, base);
      for (wy = top + 2; wy < 104; wy += 3) R(g, x, wy, w, 1, shade(base, 0.9));
      R(g, x, top, 2, 104 - top, K.corn); R(g, x + w - 2, top, 2, 104 - top, K.corn);
    } else {
      R(g, x, top, w, 104 - top, base);
    }
    // outline + side shading
    R(g, x, top, 1, 140 - top, "#1d1a2e"); R(g, x + w - 1, top, 1, 140 - top, "#1d1a2e");
    R(g, x + w - 3, top, 2, 104 - top, "rgba(0,0,0,0.18)");

    if (type === "deco") {
      // stepped crown + flag
      var cw = floor(w / 2), cx = x + floor((w - cw) / 2);
      R(g, cx, top - 10, cw, 10, base); R(g, cx + 4, top - 16, cw - 8, 6, base); R(g, cx - 1, top - 10, cw + 2, 1, lite); R(g, cx + 3, top - 16, cw - 6, 1, lite);
      R(g, cx, top - 10, 1, 10, "#1d1a2e"); R(g, cx + cw - 1, top - 10, 1, 10); R(g, cx + 4, top - 16, 1, 6); R(g, cx + cw - 5, top - 16, 1, 6);
      for (i = 0; i < cw - 10; i += 2) P(g, cx + 5 + i, top - 13 + (i % 4 ? 0 : 1), K.corn); // zigzag
      var fx = cx + floor(cw / 2); R(g, fx, top - 28, 1, 12, "#3a3a4a"); R(g, fx + 1, top - 28, 7, 4, "#c8323c"); R(g, fx + 1, top - 27, 7, 1, "#f3e9d2"); P(g, fx + 7, top - 25, "#c8323c");
      R(g, x - 1, top - 1, w + 2, 3, K.corn); R(g, x - 1, top + 2, w + 2, 1, dark);
      // piers and ribbon windows
      var nP = max(3, floor((w - 6) / 8)), step = (w - 6) / nP;
      for (i = 0; i < nP; i++) {
        var px0 = round(x + 4 + i * step), pw = round(step) - 3;
        for (wy = top + 6; wy < 98; wy += 10) {
          windowPane(g, px0 + 1, wy, pw - 1, 6, r() < litP, r, K.frame, false);
          R(g, px0, wy + 7, pw + 1, 2, mix(base, "#c8a040", 0.35)); P(g, px0 + floor(pw / 2), wy + 7, "#c8a040");
        }
        R(g, px0 - 2, top + 3, 2, 101 - top, lite);
      }
    } else if (type === "glass") {
      g.fillStyle = shade(base, 0.6);
      for (wx = x + 2; wx < x + w - 2; wx += 6) g.fillRect(wx, top, 1, 104 - top);
      for (wy = top + 4; wy < 104; wy += 7) g.fillRect(x, wy, w, 1);
      for (wy = top + 5; wy < 102; wy += 7) for (wx = x + 3; wx < x + w - 6; wx += 6) if (r() < litP * 0.7) { R(g, wx, wy, 5, 6, "#f2d48a"); R(g, wx, wy, 5, 2, "#ffe9b0"); }
      g.fillStyle = "rgba(255,255,255,0.16)";
      for (i = 0; i < 104 - top; i++) { g.fillRect(x + ((i * 1 + 6) % w), top + i, 3, 1); g.fillRect(x + ((i + 26) % w), top + i, 1, 1); }
      R(g, x - 1, top - 2, w + 2, 2, K.corn); R(g, x + 3, top - 7, 8, 5, "#6a6a7a"); R(g, x + 3, top - 7, 8, 1, "#8a8a9a");
    } else {
      cornice(g, x, w, top, K.corn);
      var floors = floor((104 - top - 10) / 16), nW = max(2, floor((w - 6) / 14)), gap = (w - nW * 8) / (nW + 1);
      for (var f = 0; f < floors; f++) {
        wy = top + 12 + f * 16;
        for (i = 0; i < nW; i++) {
          wx = round(x + gap + i * (8 + gap));
          var isLit = r() < litP;
          if (type === "stone") {
            R(g, wx - 1, wy - 3, 10, 3, "#5a4a3a"); R(g, wx, wy - 3, 8, 1, K.corn); R(g, wx + 1, wy - 4, 6, 1, "#5a4a3a"); R(g, wx + 2, wy - 4, 4, 1, K.corn);
            windowPane(g, wx, wy - 2, 8, 12, isLit, r, K.frame);
            R(g, wx - 2, wy - 3, 1, 15, lite);
          } else if (type === "town") {
            windowPane(g, wx, wy, 8, 10, isLit, r, K.frame);
            R(g, wx - 4, wy - 1, 3, 12, K.trim); R(g, wx + 9, wy - 1, 3, 12, K.trim);
            for (var s = 0; s < 12; s += 2) { P(g, wx - 3, wy + s, shade(K.trim, 0.7)); P(g, wx + 10, wy + s); }
            if (r() < 0.6) flowerBox(g, wx - 1, wy + 13, 10, r);
          } else {
            R(g, wx - 1, wy - 3, 10, 2, K.corn); R(g, wx - 1, wy - 2, 10, 1, shade(K.corn, 0.7)); P(g, wx + 4, wy - 3, "#ffffff");
            windowPane(g, wx, wy, 8, 10, isLit, r, K.frame);
            if (r() < 0.2) { R(g, wx + 1, wy + 13, 6, 3, "#9a9aa8"); R(g, wx + 1, wy + 13, 6, 1, "#c8c8d0"); R(g, wx + 2, wy + 14, 4, 1, "#5a5a6a"); }
            else if (r() < 0.2) flowerBox(g, wx - 1, wy + 13, 10, r);
          }
        }
        if (type === "brick" && K.esc) {
          R(g, x + 3, wy + 13, w - 6, 1, "#1d1a2e"); for (i = x + 3; i < x + w - 3; i += 2) P(g, i, wy + 11, "#1d1a2e"); R(g, x + 3, wy + 11, w - 6, 1);
          for (i = 0; i < 14 && f < floors - 1; i++) P(g, x + w - 8 - floor(i * 0.7), wy + 14 + i, "#1d1a2e");
        }
      }
      if (type === "stone") { for (i = x + 2; i < x + w - 2; i += 3) R(g, i, top - 5, 1, 4, K.corn); R(g, x, top - 6, w, 1, K.corn); R(g, x, top - 1, w, 1, shade(K.corn, 0.7)); }
    }
    storefront(g, x, w, r, shop, K);
    return K;
  }
  function lamp(g, x, S) {
    var c = "#1e3a32", l = "#3a6a5a";
    R(g, x - 3, 139, 7, 4, c); R(g, x - 2, 138, 5, 1); R(g, x - 3, 139, 1, 4, l);
    R(g, x - 1, 100, 3, 39, c); R(g, x - 1, 100, 1, 39, l);
    R(g, x - 2, 120, 5, 2, c); R(g, x - 2, 110, 5, 1, c);
    R(g, x - 2, 98, 5, 2, c);
    var glowOn = S.name !== "day", lc = glowOn ? "#ffe9a0" : "#d8e4ec";
    if (glowOn) { g.globalAlpha = 0.10; disc(g, x, 92, 14, "#ffd870"); g.globalAlpha = 0.16; disc(g, x, 92, 9, "#ffd870"); g.globalAlpha = 1; }
    R(g, x - 4, 88, 9, 10, "#0e1e1a"); R(g, x - 3, 89, 7, 8, lc); R(g, x, 89, 1, 8, "#0e1e1a"); P(g, x - 2, 90, "#ffffff");
    R(g, x - 5, 86, 11, 2, c); R(g, x - 3, 84, 7, 2, c); R(g, x - 1, 82, 3, 2, c); P(g, x, 81, c); R(g, x - 4, 86, 9, 1, l);
    R(g, x - 3, 98, 7, 1, c);
  }
  function hydrant(g, x) {
    R(g, x - 3, 132, 7, 10, "#5a0e14"); R(g, x - 2, 131, 5, 11, "#c8323c"); R(g, x - 2, 131, 1, 11, "#e86a6a");
    R(g, x - 4, 134, 9, 3, "#a8222c"); R(g, x - 5, 135, 1, 1, "#5a0e14"); R(g, x + 5, 135, 1, 1);
    R(g, x - 1, 129, 3, 2, "#a8222c"); P(g, x, 128, "#5a0e14"); R(g, x - 3, 141, 7, 1, "#5a0e14"); P(g, x, 135, "#f7d046");
  }
  function bin(g, x) {
    R(g, x - 4, 129, 9, 13, "#1a3a2a"); for (var i = -3; i < 5; i += 2) R(g, x + i, 130, 1, 11, "#3a6a4a");
    R(g, x - 5, 128, 11, 2, "#2a4a3a"); R(g, x - 4, 128, 9, 1, "#5a8a6a"); R(g, x - 4, 134, 9, 1, "#2a4a3a");
    P(g, x - 2, 127, "#f3e9d2"); P(g, x + 1, 127, "#c8323c"); P(g, x - 1, 126, "#f3e9d2");
  }
  function mailbox(g, x) {
    R(g, x - 5, 126, 11, 14, "#1d2a5a"); R(g, x - 4, 125, 9, 1); R(g, x - 4, 126, 9, 13, "#2f5ea8"); R(g, x - 4, 126, 1, 13, "#5a8ad0");
    R(g, x - 3, 129, 7, 1, "#1d2a5a"); R(g, x - 2, 132, 5, 3, "#f3e9d2"); R(g, x - 1, 133, 3, 1, "#c8323c");
    R(g, x - 4, 139, 2, 3, "#1d2a5a"); R(g, x + 3, 139, 2, 3);
  }
  function bench(g, x) {
    R(g, x - 10, 131, 21, 2, "#7a4a2a"); R(g, x - 10, 131, 21, 1, "#9a6a3a"); R(g, x - 10, 134, 21, 2, "#7a4a2a"); R(g, x - 10, 134, 21, 1, "#9a6a3a");
    R(g, x - 11, 128, 1, 14, "#1d1a2e"); R(g, x + 11, 128, 1, 14); R(g, x - 10, 137, 21, 1); R(g, x - 9, 138, 1, 4); R(g, x + 9, 138, 1, 4);
  }
  function tree(g, x, S) {
    R(g, x - 5, 140, 11, 2, "#3a3a44"); R(g, x - 4, 140, 9, 1, "#5a5a64");
    R(g, x - 1, 108, 3, 32, "#5a3a22"); R(g, x - 1, 108, 1, 32, "#7a5232"); P(g, x - 2, 118, "#5a3a22"); P(g, x + 2, 114);
    var d = S.name === "night" ? "#1e4a2e" : "#2b6b3a", m = S.name === "night" ? "#2b6b3a" : "#3a8a44", l = S.name === "night" ? "#3a8a44" : "#5aac52";
    disc(g, x - 7, 102, 7, d); disc(g, x + 7, 101, 7, d); disc(g, x, 94, 9, d); disc(g, x, 104, 7, d);
    disc(g, x - 6, 100, 6, m); disc(g, x + 6, 99, 6, m); disc(g, x, 93, 8, m);
    disc(g, x - 3, 90, 4, l); disc(g, x - 8, 97, 2, l); disc(g, x + 4, 95, 2, l);
    g.fillStyle = d; for (var i = 0; i < 12; i++) g.fillRect(x - 10 + ((i * 7) % 20), 90 + ((i * 5) % 16), 1, 1);
  }
  function car(g, x, y, body, r) {
    var d = shade(body, 0.65), l = mix(body, "#ffffff", 0.35);
    R(g, x + 2, y + 15, 46, 2, "rgba(0,0,0,0.35)");
    R(g, x, y + 5, 50, 9, "#14121e"); R(g, x + 1, y + 6, 48, 7, body); R(g, x + 1, y + 6, 48, 1, l); R(g, x + 1, y + 11, 48, 2, d);
    R(g, x + 10, y - 1, 28, 7, "#14121e"); R(g, x + 11, y, 26, 6, body); R(g, x + 11, y, 26, 1, l);
    R(g, x + 13, y + 1, 10, 4, "#9ac0e0"); R(g, x + 25, y + 1, 10, 4, "#9ac0e0"); P(g, x + 14, y + 1, "#ffffff"); P(g, x + 26, y + 1); R(g, x + 23, y + 1, 2, 5, body);
    R(g, x + 22, y + 7, 1, 5, d); R(g, x + 18, y + 8, 3, 1, "#c8c8d0"); R(g, x + 28, y + 8, 3, 1);
    R(g, x + 47, y + 7, 2, 2, "#fff4c0"); R(g, x + 1, y + 7, 2, 2, "#e84a4a"); R(g, x, y + 11, 50, 1, "#c8c8d0");
    var wh = [x + 10, x + 40];
    for (var i = 0; i < 2; i++) { disc(g, wh[i], y + 13, 4, "#14121e"); disc(g, wh[i], y + 13, 2, "#8a8a9a"); P(g, wh[i], y + 13, "#d8d8e0"); }
    if (body === "#f2c230") { R(g, x + 21, y - 4, 8, 3, "#14121e"); R(g, x + 22, y - 3, 6, 1, "#f7e8a0"); for (var k = 0; k < 48; k += 4) R(g, x + 1 + k, y + 9, 2, 1, "#14121e"); }
  }
  function sidewalkAndRoad(g, S, r) {
    var i, x;
    R(g, 0, 140, 384, 13, "#b4ab9e"); R(g, 0, 140, 384, 1, "#5a5448"); R(g, 0, 141, 384, 1, "#8a8276");
    R(g, 0, 146, 384, 1, "#9a9286");
    for (x = 0; x < 384; x += 16) { R(g, x, 142, 1, 11, "#9a9286"); R(g, x + 1, 142, 1, 11, "#ccc4b6"); }
    for (i = 0; i < 160; i++) { P(g, floor(r() * 384), 142 + floor(r() * 11), r() < 0.5 ? "#a49c90" : "#c4bcae"); }
    for (i = 0; i < 6; i++) { x = floor(r() * 380); P(g, x, 148 + floor(r() * 4), "#7a7468"); P(g, x + 1, 148 + floor(r() * 4)); }
    R(g, 0, 153, 384, 2, "#ddd5c6"); R(g, 0, 155, 384, 3, "#8a8274"); R(g, 0, 158, 384, 1, "#4a4652");
    R(g, 0, 159, 384, 29, "#383844");
    for (i = 0; i < 700; i++) P(g, floor(r() * 384), 159 + floor(r() * 29), r() < 0.5 ? "#42424e" : "#30303a");
    for (x = 4 + floor(r() * 10); x < 384; x += 32) { R(g, x, 173, 16, 2, "#e8e0c8"); R(g, x, 175, 16, 1, "#9a9488"); }
    R(g, 0, 186, 384, 1, "#f2c230"); R(g, 0, 187, 384, 1, "#9a7a20");
    // storm drain + manhole
    var dx = 40 + floor(r() * 300); R(g, dx, 156, 14, 3, "#1d1a2e"); for (i = 1; i < 14; i += 2) P(g, dx + i, 157, "#5a5a6a");
    var mx = 60 + floor(r() * 260); ellipse(g, mx, 181, 8, 2, "#24242e"); ellipse(g, mx, 181, 7, 1, "#4a4a56"); R(g, mx - 5, 181, 11, 1, "#2a2a34");
  }
  function drawStreetRaw(g, seed) {
    var r = rng(seed), S = SKIES[((seed % 3) + 3) % 3], i, x;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    sky(g, S, r);
    for (i = 0; i < 4; i++) cloud(g, S, 30 + i * 96 + floor(r() * 50), 12 + floor(r() * 34), 26 + floor(r() * 30), r);
    farSkyline(g, S, r);
    midLayer(g, S, r);
    // front row
    x = -floor(r() * 24);
    var types = ["brick", "stone", "town", "deco", "brick", "glass", "town", "stone"], used = {}, lastT = "";
    var shopIx = floor(r() * SHOPS.length);
    while (x < 384) {
      var w = 58 + floor(r() * 34), t;
      do { t = types[floor(r() * types.length)]; } while (t === lastT);
      lastT = t;
      var top = t === "deco" ? 34 + floor(r() * 16) : t === "glass" ? 18 + floor(r() * 20) : 38 + floor(r() * 32);
      var K = frontBuilding(g, x, w, top, t, r, S, SHOPS[shopIx++ % SHOPS.length]);
      if (t === "brick" && r() < 0.5) { /* fire-escape ladder variant handled per floor */ }
      // blade sign
      if (r() < 0.35) {
        var word = ["HOTEL", "BAR", "EAT", "INN", "JAZZ", "OPEN"][floor(r() * 6)], bx = x + w - 6, by = 60;
        R(g, bx - 3, by - 2, 6, 1, "#1d1a2e"); R(g, bx - 4, by, 9, word.length * 6 + 3, "#1d1a2e"); R(g, bx - 3, by + 1, 7, word.length * 6 + 1, "#c8323c");
        for (var k = 0; k < word.length; k++) text(g, word[k], bx - 1, by + 2 + k * 6, S.name === "day" ? "#f3e9d2" : "#ffe9a0");
        if (S.name !== "day") { g.globalAlpha = 0.18; R(g, bx - 6, by - 2, 13, word.length * 6 + 7, "#ff6a6a"); g.globalAlpha = 1; }
      }
      x += w;
      if (r() < 0.22 && x < 370) { // alley
        var aw = 5 + floor(r() * 4);
        R(g, x, 64, aw, 76, "#1a1a2c"); R(g, x, 64, aw, 1, "#2a2a3c");
        R(g, x + 1, 134, 4, 6, "#2a2a2a"); R(g, x + 1, 134, 4, 1, "#4a4a4a"); x += aw;
      }
    }
    sidewalkAndRoad(g, S, r);
    // street furniture: lamps at fixed spacing, plus seeded extras between them
    var off = 30 + floor(r() * 40);
    for (x = off; x < 384; x += 130) lamp(g, x, S);
    var items = [hydrant, bin, mailbox, bench, tree], placed = [];
    for (i = 0; i < 3; i++) {
      var fx = 20 + floor(r() * 344), ok = true;
      for (var q = off; q < 384; q += 130) if (abs(fx - q) < 18) ok = false;
      for (var p2 = 0; p2 < placed.length; p2++) if (abs(fx - placed[p2]) < 30) ok = false;
      if (!ok) continue; placed.push(fx);
      var it = items[floor(r() * items.length)]; it === tree ? tree(g, fx, S) : it(g, fx);
    }
    var cars = ["#f2c230", "#c8323c", "#2f5ea8", "#2b8a3e", "#e8e0d0", "#7a3e8a"];
    car(g, 20 + floor(r() * 120), 163, cars[floor(r() * cars.length)], r);
    if (r() < 0.7) car(g, 210 + floor(r() * 120), 163, cars[floor(r() * cars.length)], r);
    g.restore();
  }
  var streetCache = {};
  window.drawStreet = function (g, seed) {
    seed = typeof seed === "number" ? seed | 0 : hashStr(seed);
    var c = streetCache[seed];
    if (!c) {
      c = document.createElement("canvas"); c.width = 384; c.height = 188;
      drawStreetRaw(c.getContext("2d"), seed);
      var keys = Object.keys(streetCache); if (keys.length > 12) delete streetCache[keys[0]];
      streetCache[seed] = c;
    }
    var s = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0); g.imageSmoothingEnabled = s;
  };


  /* =====================================================================
   * PEOPLE — every person is drawn natively at HALF resolution into a small
   * scratch canvas, then blitted at 2x (smoothing off, even coordinates), so
   * each visible pixel of a person is a crisp 2x2 block on the target canvas.
   * Units inside this section are half-res pixels unless noted.
   * ===================================================================== */
  var scratchMemo = {};
  function scratch(key, w, h) {
    var c = scratchMemo[key];
    if (!c) { c = document.createElement("canvas"); c.width = w; c.height = h; scratchMemo[key] = c; }
    var g = c.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
    return c;
  }
  function evenPx(v) { return floor(round(v) / 2) * 2; }
  /* draw half-res canvas c at 2x so that its anchor (ax, ay) lands on even target coords (X, Y) */
  function blit2(g, c, X, Y, ax, ay, flip) {
    var s = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
    g.save(); g.translate(X, Y); g.scale(flip ? -2 : 2, 2); g.drawImage(c, -ax, -ay); g.restore();
    g.imageSmoothingEnabled = s;
  }
  /* upper part (rows <= yMax) of a filled ellipse */
  function ellTop(g, cx, cy, rx, ry, c, yMax) {
    g.fillStyle = c;
    for (var dy = -ry; dy <= ry; dy++) {
      if (cy + dy > yMax) break;
      var hw = floor(rx * sqrt(max(0, 1 - (dy * dy) / (ry * ry))) + 0.35);
      g.fillRect(round(cx - hw), round(cy + dy), hw * 2 + 1, 1);
    }
  }

  /* ---- detective + suspect rig (facing right, feet at 0,0) ---- */
  var LT = 5, LS = 4.5, AU = 4, AF = 3.5;
  function phase(frame, N) { return ((((frame | 0) % N) + N) % N) / N * PI * 2; }
  function gait(frame, run) {
    var p = phase(frame, 6), legs = [], i;
    for (i = 0; i < 2; i++) {
      var ph = p + i * PI, a1, bend;
      if (run) { a1 = 1.0 * sin(ph); bend = 0.2 + 2.0 * max(0, cos(ph + 0.5)); }
      else { a1 = 0.5 * sin(ph); bend = 0.08 + 1.1 * max(0, cos(ph + 0.2)); }
      var a2 = a1 - bend;
      legs.push({ a1: a1, a2: a2, fp: clamp(-a2 * 0.75, -0.35, 1.15) });
    }
    var ap = p + PI, arms;
    if (run) arms = [{ a1: 1.3 * sin(ap), a2: 1.3 * sin(ap) + 1.7 }, { a1: 1.3 * sin(p), a2: 1.3 * sin(p) + 1.7 }];
    else arms = [{ a1: 0.8 * sin(ap), a2: 0.8 * sin(ap) + 0.35 + 0.7 * max(0, sin(ap)) }, { a1: 0.8 * sin(p), a2: 0.8 * sin(p) + 0.35 + 0.7 * max(0, sin(p)) }];
    return { legs: legs, arms: arms, lean: run ? 0.27 : 0.06, p: p,
      lift: run ? round(2.4 * max(0, sin(2 * p + 0.6))) : round(1.1 * max(0, sin(2 * p + 0.4))),
      bob: run ? round(0.9 * sin(2 * p - 0.9)) : 0,
      flap: run ? 1.9 + 0.9 * sin(2 * p) : 0.6 + 0.5 * sin(2 * p), run: run };
  }
  /* sad, slow shuffle: 12-frame cycle, feet dragging, arms dangling */
  function slumpPose(frame) {
    var p = phase(frame, 12), legs = [], i;
    for (i = 0; i < 2; i++) {
      var ph = p + i * PI, a1 = 0.3 * sin(ph), bend = 0.15 + 0.45 * max(0, cos(ph + 0.3)), a2 = a1 - bend;
      legs.push({ a1: a1, a2: a2, fp: clamp(-a2 * 0.25, -0.1, 0.25) });
    }
    return { legs: legs, arms: [{ a1: 0.1 * sin(p + PI) - 0.05, a2: 0.12 * sin(p + PI) + 0.02 }, { a1: 0.1 * sin(p) - 0.05, a2: 0.12 * sin(p) + 0.02 }],
      lean: 0.2, p: p, lift: 0, bob: round(0.6 * max(0, sin(2 * p - 0.6))), flap: 0.3, slump: true };
  }
  function caughtPose(frame) {
    var j = (frame | 0) % 2;
    return { legs: [{ a1: 0.2, a2: 0.1, fp: 0 }, { a1: -0.22, a2: -0.12, fp: 0 }],
      arms: [{ to: [5, -6 - j], bend: -1 }, { to: [-4, -6 + j], bend: 1 }],
      lean: -0.08, p: 0, lift: j, bob: 0, flap: 0.3, caught: true, jit: j };
  }
  var DET = {
    coat: "#a0622e", coatS: "#6a3c18", coatL: "#d08a4a", ol: "#1e1008", pants: "#3c3542", pantsS: "#29232e", shoe: "#6a2418", shoeL: "#b4563a",
    hat: "#3c4290", hatS: "#262a60", hatL: "#6a74c8", band: "#d8323c", feather: "#ffd23a", skin: "#f6c49a", hair: "#7a4a26", scarf: "#e8402e", scarfS: "#a8221a",
    belt: "#4a2812", button: "#ffd23a", glass: true, cuff: "#6a3c18", grin: true
  };
  function suspectLook(o) {
    var skin = o.skin || "#d9a47c";
    return {
      coat: o.red ? "#cc2432" : "#e0b46a", coatS: o.red ? "#8a1420" : "#a8803e", coatL: o.red ? "#f0606a" : "#f6dc9c", ol: "#2e1e10", pants: "#4a3a34", pantsS: "#33282a", shoe: "#1d1a2e", shoeL: "#5a5678",
      hat: "#7a4e28", hatS: "#4c3018", hatL: "#a87444", band: "#2a1a10", skin: skin, hair: o.hair || "#1d1a2e", belt: o.red ? "#8a1420" : "#a8803e", button: "#5a4026",
      collarUp: true, low: true, glasses: o.glasses !== false, hatOn: o.hat !== false, cuff: "#a8803e", flail: true
    };
  }
  function sweatDrop(g, x, y) {
    P(g, x, y - 1, "#1d3a6a"); R(g, x - 1, y, 3, 2, "#1d3a6a"); P(g, x, y + 2, "#1d3a6a");
    P(g, x, y, "#bfeaff"); P(g, x, y + 1, "#6ac0f0");
  }
  /* round cartoon head facing right. cx = skull centre column, hy = top of skull.
     mode: "" | "caught" | "panic" | "sad" */
  function drawHead(g, cx, hy, K, mode, frame) {
    var o = K.ol, sk = K.skin, skS = shade(sk, 0.82), ink = "#1d1a2e", cy = hy + 5, f = (frame | 0) % 3;
    var nose = mix(sk, "#ff5a4a", 0.45);
    // skull + friendly jaw
    disc(g, cx, cy, 6, o); ellipse(g, cx + 2, cy + 3, 5, 4, o);
    disc(g, cx, cy, 5, skS); ellipse(g, cx + 2, cy + 3, 4, 3, skS);
    disc(g, cx + 1, cy - 1, 4, sk); ellipse(g, cx + 2, cy + 2, 4, 3, sk);
    // hair at the back, ear
    R(g, cx - 5, cy - 2, 2, 5, K.hair); P(g, cx - 5, cy - 2, mix(K.hair, "#ffffff", 0.3));
    R(g, cx - 3, cy + 1, 2, 2, skS); P(g, cx - 3, cy + 1, o); P(g, cx - 3, cy + 3, o);
    // rosy cheek
    P(g, cx + 2, cy + 3, mix(sk, "#f04a6a", 0.5)); P(g, cx + 3, cy + 3, mix(sk, "#f04a6a", 0.35));
    var ex = [cx + 1, cx + 4], ey = cy - 1, i;
    if (mode === "sad") {
      for (i = 0; i < 2; i++) { R(g, ex[i], ey + 1, 2, 1, ink); }
      P(g, ex[1] + 1, ey + 2, "#5ab4f0"); P(g, ex[1] + 1, ey + 3, "#8ad4ff"); // a little tear
    } else if (mode === "caught" || mode === "panic") {
      for (i = 0; i < 2; i++) { R(g, ex[i], ey - 1, 2, 3, "#ffffff"); P(g, ex[i] + 1, ey + (f === 1 ? 1 : 0), ink); }
    } else {
      for (i = 0; i < 2; i++) { P(g, ex[i], ey, "#ffffff"); P(g, ex[i], ey + 1, "#ffffff"); R(g, ex[i] + 1, ey, 1, 2, ink); }
    }
    // big round nose
    disc(g, cx + 7, cy + 1, 2, o); disc(g, cx + 7, cy + 1, 1, nose); P(g, cx + 6, cy, mix(nose, "#ffffff", 0.55));
    // mouth
    var my = cy + 4;
    if (mode === "caught" || mode === "panic") {
      R(g, cx + 3, my - 1, 3, 3, o); P(g, cx + 4, my, "#8a1e1e"); if (f === 1) P(g, cx + 4, my + 1, "#8a1e1e");
      if (mode === "caught") { sweatDrop(g, cx - 7 - (f & 1), hy + 1 + f); sweatDrop(g, cx + 7, hy - 3 + (f & 1)); }
      else sweatDrop(g, cx - 7 - f, hy + 2);
    } else if (mode === "sad") {
      R(g, cx + 2, my, 3, 1, o); P(g, cx + 1, my + 1, o); P(g, cx + 5, my + 1, o);
    } else if (K.grin) {
      P(g, cx + 1, my - 1, o); R(g, cx + 2, my, 4, 1, o); P(g, cx + 6, my - 1, o); R(g, cx + 2, my - 1, 4, 1, "#ffffff");
    } else {
      P(g, cx + 1, my, o); R(g, cx + 2, my + 1, 3, 1, o); P(g, cx + 5, my, o);
    }
  }
  /* fedora: by = brim row, cx = centre */
  function drawFedora(g, cx, by, c, cs, cl, band, o, feather) {
    R(g, cx - 4, by - 5, 9, 5, o); R(g, cx - 8, by - 1, 17, 3, o); P(g, cx - 8, by - 2, o); P(g, cx + 8, by - 2, o);
    R(g, cx - 3, by - 4, 7, 4, c); P(g, cx, by - 4, cs); R(g, cx - 3, by - 4, 1, 2, cl); R(g, cx + 3, by - 4, 1, 3, cs);
    R(g, cx - 3, by - 2, 7, 1, band);
    R(g, cx - 7, by, 15, 1, c); R(g, cx - 7, by, 5, 1, cl); P(g, cx - 8, by - 1, c); P(g, cx + 8, by - 1, c); P(g, cx + 7, by, cs);
    if (feather) {
      chain(g, [cx - 3, by - 2, cx - 6, by - 4, cx - 7, by - 5], 1, feather, o);
      P(g, cx - 7, by - 5, "#fff6c0");
    }
  }
  function drawCoat(g, K, hipY, lean, legs, flap, p, run, sy) {
    var hem = hipY + 5, y, o = K.ol, i, kneeF = -99, kneeB = 99, rows = [];
    for (i = 0; i < 2; i++) { var kx = sin(legs[i].a1) * LT; kneeF = max(kneeF, kx); kneeB = min(kneeB, kx); }
    for (y = sy; y <= hem; y++) {
      var t = (y - sy) / (hem - sy), sh = round(lean * max(0, hipY - y));
      var f = 2 + round(1.2 * t), b = -2 - round(1.5 * t);
      if (y > hipY - 1) {
        var d = (y - hipY + 1) / (hem - hipY + 1);
        f = max(f, round(kneeF * d * 0.8 + 1.5)); b = min(b, round(kneeB * d * 0.6 - 2));
        b -= round(flap * d * d + (run ? sin(p * 2 + y * 0.8) * 0.6 : 0));
      }
      rows.push([y, b + sh, f + sh, sh]);
    }
    g.fillStyle = o;
    for (i = 0; i < rows.length; i++) g.fillRect(rows[i][1] - 1, rows[i][0], rows[i][2] - rows[i][1] + 3, 1);
    var last = rows[rows.length - 1]; g.fillRect(last[1] - 1, last[0] + 1, last[2] - last[1] + 3, 1);
    g.fillRect(rows[0][1], rows[0][0] - 1, rows[0][2] - rows[0][1] + 1, 1);
    for (i = 0; i < rows.length; i++) {
      var r0 = rows[i];
      R(g, r0[1], r0[0], r0[2] - r0[1] + 1, 1, K.coat); P(g, r0[1], r0[0], K.coatS); P(g, r0[2], r0[0], K.coatL);
    }
    // lapel + buttons + belt
    var sx = rows[0][3];
    P(g, sx + 1, sy, K.coatL); P(g, sx + 1, sy + 1, K.coatL); P(g, sx, sy + 2, K.coatS);
    var bsh = round(lean * 4);
    P(g, bsh + 2, sy + 3, K.button);
    var by = hipY - 1, rowB = rows[clamp(by - sy, 0, rows.length - 1)];
    R(g, rowB[1], by, rowB[2] - rowB[1] + 1, 1, K.belt); P(g, rowB[2] - 1, by, K.button);
    var tl = run ? 1 + round(sin(p * 2)) : 0;
    if (run) R(g, rowB[1] - 1 - tl, by, 1 + tl, 1, K.belt);
    R(g, last[1], last[0], last[2] - last[1] + 1, 1, K.coatS);
  }
  function legDraw(g, hx, hy, L, pants, ol, shoe, shoeL) {
    var k = pt(hx, hy, L.a1, LT), a = pt(k[0], k[1], L.a2, LS);
    chain(g, [hx, hy, k[0], k[1], a[0], a[1]], 1, pants, ol);
    var cf = cos(L.fp), sf = sin(L.fp);
    chain(g, [a[0] - cf, a[1] - sf, a[0] + cf * 3, a[1] + sf * 3], 2, shoe, ol);
    P(g, a[0] + cf * 2, a[1] - 1 + sf * 2, shoeL);
  }
  function legFoot(L) {
    var k = pt(0, 0, L.a1, LT), a = pt(k[0], k[1], L.a2, LS);
    return max(round(a[1]), round(a[1] + sin(L.fp) * 3), round(a[1] - sin(L.fp))) + 1;
  }
  function armDraw(g, sx, sy, A, sleeve, ol, skin) {
    var e = pt(sx, sy, A.a1, AU), h = pt(e[0], e[1], A.a2, AF);
    chain(g, [sx, sy, e[0], e[1], h[0], h[1]], 1, sleeve, ol);
    var hx = round(h[0]), hy = round(h[1]);
    R(g, hx - 1, hy, 4, 2, ol); R(g, hx, hy - 1, 2, 4, ol); R(g, hx, hy, 2, 2, skin);
    return { h: [hx + 0.5, hy + 0.5], e: e };
  }
  function magnifier(g, h, a2) {
    var dx = sin(a2), dy = cos(a2);
    chain(g, [h[0], h[1], h[0] + dx * 2.5, h[1] + dy * 2.5], 1, "#7a4a26", "#1d1a2e");
    var cx = round(h[0] + dx * 5), cy = round(h[1] + dy * 5);
    disc(g, cx, cy, 3, "#1d1a2e"); disc(g, cx, cy, 2, "#f0b830"); disc(g, cx, cy, 1, "#a8e8fa"); P(g, cx - 1, cy - 1, "#ffffff");
  }
  function rainCloud(g, x, y, frame) {
    var o = "#2a2a3e", c = "#9a9ab4", l = "#c8c8dc", f = frame | 0, i;
    disc(g, x - 3, y + 1, 3, o); disc(g, x + 1, y, 3, o); disc(g, x + 4, y + 1, 2, o); R(g, x - 5, y + 1, 11, 4, o);
    disc(g, x - 3, y + 1, 2, c); disc(g, x + 1, y, 2, c); disc(g, x + 4, y + 1, 1, c); R(g, x - 4, y + 1, 9, 3, c);
    P(g, x, y - 2, l); P(g, x - 4, y, l);
    for (i = 0; i < 3; i++) { var dy = (f + i * 2) % 5; P(g, x - 3 + i * 3, y + 5 + dy, "#7ab8f0"); }
  }
  function runFx(g, p) {
    var i, k = ((p / (PI * 2)) * 2) % 1;
    for (i = 0; i < 2; i++) {
      var age = (k + i * 0.5) % 1, r = round(age * 2), px = round(-6 - age * 7 - i * 2);
      g.globalAlpha = age < 0.75 ? 1 : 0.6; disc(g, px, -1 - r, r, "#ece4d4"); g.globalAlpha = 1;
    }
    g.fillStyle = "#ffffff";
    for (i = 0; i < 3; i++) { var w = 3 + ((i * 2 + round(k * 3)) % 3); g.fillRect(-9 - w - i, -20 + i * 5, w, 1); }
  }
  var PW = 56, PAX = 28, PAY = 52;
  function person(g, x, y, frame, K, o) {
    o = o || {};
    var slump = !!o.slump, caught = !!o.caught && !slump, run = !!o.run && !slump && !caught;
    var pose = caught ? caughtPose(frame) : slump ? slumpPose(frame) : gait(frame, run);
    if (run && K.flail) { // suspect panics: arms windmill over his head
      var q = pose.p * 2;
      pose.arms = [{ a1: 1.85 + 0.45 * sin(q), a2: 1.85 + 0.45 * sin(q) + 0.9 + 0.5 * sin(q + 1.2) }, { a1: 4.2 + 0.45 * sin(q + PI), a2: 4.2 + 0.45 * sin(q + PI) - 0.9 - 0.5 * sin(q + 0.4) }];
    } else if (run && K.glass) { // detective thrusts the magnifier out in front
      pose.arms[0] = { a1: 1.5 + 0.12 * sin(pose.p * 2), a2: 1.85 + 0.15 * sin(pose.p * 2 + 1) };
    }
    var c = scratch("person", PW, PW), s = c.getContext("2d");
    s.save(); s.translate(PAX + (caught && pose.jit ? 1 : 0), PAY);
    var g0 = s, o2 = K.ol;
    var low = max(legFoot(pose.legs[0]), legFoot(pose.legs[1]));
    var hipY = -low - 1 - pose.lift, lean = pose.lean;
    var sy = hipY - 8 + (slump ? 1 : 0), shX = round(lean * 8);
    var hy = sy - 8 + (pose.bob || 0) + (slump ? 2 : 0), cx = shX + (slump ? 1 : 0);
    if (caught) hy -= 1;
    if (run) runFx(g0, pose.p);
    // scarf tail
    if (K.scarf) {
      var tl = run ? 5 : slump ? 4 : 3, pts = [];
      for (var i = 0; i <= tl; i++) {
        if (slump) pts.push(shX - 2 - i * 0.3, sy + i);
        else pts.push(shX - 2 - i, sy + sin(pose.p * 2 - i * 0.8) * (run ? 0.9 : 0.5) + i * (run ? 0.15 : 0.5));
      }
      chain(g0, pts, 1, K.scarf, o2, K.scarfS, 2);
    }
    for (var ai = 0; ai < 2; ai++) { var A0 = pose.arms[ai]; if (A0.to) { var ax = shX + (ai ? -1 : 1); pose.arms[ai] = ik(ax, sy + 1, shX + A0.to[0], sy + A0.to[1], AU, AF, A0.bend); } }
    armDraw(g0, shX - 1, sy + 1, pose.arms[1], K.coatS, o2, shade(K.skin, 0.85));
    legDraw(g0, -1, hipY, pose.legs[1], K.pantsS, o2, shade(K.shoe, 0.8), K.shoe);
    legDraw(g0, 1, hipY, pose.legs[0], K.pants, o2, K.shoe, K.shoeL);
    drawCoat(g0, K, hipY, lean, pose.legs, pose.flap, pose.p, run, sy);
    var mode = caught ? "caught" : slump ? "sad" : (run && K.flail) ? "panic" : "";
    if (K.scarf) { R(g0, shX - 4, sy - 1, 8, 3, o2); R(g0, shX - 3, sy, 6, 1, K.scarf); P(g0, shX - 2, sy, mix(K.scarf, "#ffffff", 0.35)); }
    drawHead(g0, cx, hy, K, mode, frame);
    if (K.collarUp) {
      R(g0, cx - 6, hy + 6, 3, 6, o2); R(g0, cx - 5, hy + 7, 1, 4, K.coatL);
      R(g0, cx, hy + 9, 5, 3, o2); R(g0, cx + 1, hy + 10, 3, 1, K.coatL);
    }
    if (K.glasses && !caught) {
      R(g0, cx, hy + 3, 7, 3, "#0e0c16"); R(g0, cx - 3, hy + 3, 3, 1, "#0e0c16");
      P(g0, cx + 1, hy + 4, "#5a7ab8"); P(g0, cx + 4, hy + 4, "#5a7ab8");
    }
    if (K.hatOn === false) {
      var hc = K.hair, hl = mix(hc, "#ffffff", 0.3);
      R(g0, cx - 5, hy - 1, 10, 3, o2); R(g0, cx - 6, hy, 2, 6, o2);
      R(g0, cx - 4, hy, 8, 1, hc); R(g0, cx - 5, hy + 1, 3, 4, hc); R(g0, cx - 2, hy + 1, 5, 1, hc); R(g0, cx - 3, hy, 3, 1, hl);
      if (caught) { R(g0, cx - 3, hy - 4, 1, 3, o2); R(g0, cx, hy - 5, 1, 4, o2); R(g0, cx + 3, hy - 3, 1, 2, o2); }
    } else {
      var brim = (K.low ? hy + 2 : hy + 1) + (caught ? -3 : slump ? 2 : 0);
      if (run && !caught) brim -= max(0, -(pose.bob || 0));
      drawFedora(g0, cx, brim, K.hat, K.hatS, K.hatL, K.band, o2, K.feather);
    }
    var nearA = armDraw(g0, shX + 1, sy + 1, pose.arms[0], K.coat, o2, K.skin);
    if (K.glass) magnifier(g0, nearA.h, pose.arms[0].a2);
    if (slump) rainCloud(g0, cx, hy - 11, frame);
    s.restore();
    blit2(g, c, evenPx(x), evenPx(y), PAX, PAY, o.flip);
  }
  window.drawDetective = function (g, x, y, frame, opts) { person(g, x, y, frame, DET, opts || {}); };
  window.drawSuspect = function (g, x, y, frame, opts) { opts = opts || {}; person(g, x, y, frame, suspectLook(opts), opts); };

  /* flying hat: the half-res fedora, rotated nearest-neighbour, blitted at 2x */
  var HAT = 20, hatSrc = null, hatRot = {};
  function hatBitmap() {
    if (hatSrc) return hatSrc;
    var c = document.createElement("canvas"); c.width = HAT; c.height = HAT; var g = c.getContext("2d", { willReadFrequently: true }), K = suspectLook({});
    drawFedora(g, HAT / 2, HAT / 2 + 2, K.hat, K.hatS, K.hatL, K.band, K.ol);
    hatSrc = g.getImageData(0, 0, HAT, HAT); return hatSrc;
  }
  window.drawFlyingHat = function (g, x, y, angleStep) {
    var k = (((round((angleStep || 0) * 4)) % 16) + 16) % 16, c = hatRot[k], m = HAT / 2 - 0.5;
    if (!c) {
      var src = hatBitmap(), a = k * PI / 8, ca = cos(a), sa = sin(a);
      c = document.createElement("canvas"); c.width = HAT; c.height = HAT;
      var cg = c.getContext("2d"), out = cg.createImageData(HAT, HAT);
      for (var yy = 0; yy < HAT; yy++) for (var xx = 0; xx < HAT; xx++) {
        var dx = xx - m, dy = yy - m, sx = round(ca * dx + sa * dy + m), sy2 = round(-sa * dx + ca * dy + m);
        if (sx < 0 || sy2 < 0 || sx > HAT - 1 || sy2 > HAT - 1) continue;
        var si = (sy2 * HAT + sx) * 4, di = (yy * HAT + xx) * 4;
        for (var q = 0; q < 4; q++) out.data[di + q] = src.data[si + q];
      }
      cg.putImageData(out, 0, 0); hatRot[k] = c;
    }
    blit2(g, c, evenPx(x), evenPx(y), HAT / 2, HAT / 2, false);
  };
  /* =====================================================================
   * HENCHMAN — a rounded cartoon burglar, ~85px tall in the 400x240 overlay (drawn at half-res, blitted 2x).
   * Pear-shaped striped torso with a hunched back, noodle limbs, big soft shoes,
   * white gloves, round head with beanie + black eye mask, sly eyes, huge grin.
   * Drawn from scanline spans (rows of [y, x0, x1)) so curves stay crisp pixels.
   * ===================================================================== */
  var HC = {
    ol: "#0e0a16", skin: "#f0b892", skinS: "#cf8d68", skinD: "#a8654a", stub: "#b98a78", nose: "#f0866e", noseS: "#c85a4a",
    wht: "#f4f0e6", whtS: "#c4bfd2", blk: "#26222f", blkS: "#18151f", blkF: "#14121a",
    pants: "#2c2a44", pantsS: "#1e1c30", belt: "#5a3a22", buckle: "#f7d046",
    shoe: "#6a4890", shoeS: "#4a3068", shoeL: "#9a7ac0", sole: "#ece2d0",
    glove: "#f8f4ec", gloveS: "#c8c2d6", gloveD: "#a29cb4",
    mask: "#1a1624", maskL: "#3a3450", beanie: "#36324e", beanieL: "#5a5478", rib: "#24212f", pom: "#c8323c", pomL: "#f06a6a",
    brow: "#2a1a14", mouth: "#5a1420", teeth: "#fbf8f0", teethS: "#c9c3d6", tongue: "#e8606e",
    sack: "#c8a060", sackS: "#946e38", sackL: "#e8cc8c", rope: "#7a5a2a", cash: "#1e6a2e"
  };
  function sq(v) { return v * v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeIn(t) { t = clamp(t, 0, 1); return t * t * t; }
  function easeBack(t) { t = clamp(t, 0, 1); var c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function numCmp(a, b) { return a - b; }
  function spPoly(pts, out) {
    out = out || [];
    var n = pts.length >> 1, y0 = 1e9, y1 = -1e9, i, y, xs = [];
    for (i = 0; i < n; i++) { y = pts[2 * i + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (y = Math.ceil(y0 - 0.5); y + 0.5 <= y1; y++) {
      var yc = y + 0.5; xs.length = 0;
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n, ay = pts[2 * i + 1], by = pts[2 * j + 1];
        if ((ay <= yc) !== (by <= yc)) { var ax = pts[2 * i]; xs.push(ax + (yc - ay) / (by - ay) * (pts[2 * j] - ax)); }
      }
      xs.sort(numCmp);
      for (i = 0; i + 1 < xs.length; i += 2) { var a = round(xs[i]), b = round(xs[i + 1]); if (b > a) out.push(y, a, b); }
    }
    return out;
  }
  function spEll(cx, cy, rx, ry, ang, out) {
    out = out || [];
    var c = cos(ang || 0), s = sin(ang || 0), irx = 1 / (rx * rx), iry = 1 / (ry * ry);
    var A = c * c * irx + s * s * iry, Bk = 2 * c * s * (irx - iry), Ck = s * s * irx + c * c * iry, R0 = max(rx, ry);
    for (var y = floor(cy - R0); y <= Math.ceil(cy + R0); y++) {
      var dy = y + 0.5 - cy, B = Bk * dy, C = Ck * dy * dy - 1, D = B * B - 4 * A * C;
      if (D < 0) continue;
      var q = sqrt(D), a = round(cx + (-B - q) / (2 * A)), b = round(cx + (-B + q) / (2 * A));
      if (b > a) out.push(y, a, b);
    }
    return out;
  }
  /* paint spans; w > 0 grows them by a round w-pixel border (used for outlines) */
  function paint(g, sp, c, w) {
    g.fillStyle = c; w = w || 0;
    for (var i = 0; i < sp.length; i += 3) {
      var y = sp[i], a = sp[i + 1], b = sp[i + 2];
      if (!w) { g.fillRect(a, y, b - a, 1); continue; }
      for (var dy = -w; dy <= w; dy++) { var e = round(sqrt(w * w - dy * dy) + 0.3); g.fillRect(a - e, y + dy, b - a + 2 * e, 1); }
    }
  }
  /* paint the part of spans `sp` that lies inside single-row-per-y spans `clip` */
  function paintClip(g, sp, clip, c) {
    var m = {}, i; for (i = 0; i < clip.length; i += 3) m[clip[i]] = [clip[i + 1], clip[i + 2]];
    g.fillStyle = c;
    for (i = 0; i < sp.length; i += 3) { var k = m[sp[i]]; if (!k) continue; var a = max(sp[i + 1], k[0]), b = min(sp[i + 2], k[1]); if (b > a) g.fillRect(a, sp[i], b - a, 1); }
  }
  function bezPts(x0, y0, cx, cy, x1, y1) { // quadratic bezier sampled ~1px apart
    var L = abs(cx - x0) + abs(cy - y0) + abs(x1 - cx) + abs(y1 - cy), n = max(2, Math.ceil(L)), out = [];
    for (var i = 0; i <= n; i++) { var t = i / n, u = 1 - t; out.push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1); }
    return out;
  }
  function thru(x0, y0, mx, my, x1, y1) { return bezPts(x0, y0, 2 * mx - (x0 + x1) / 2, 2 * my - (y0 + y1) / 2, x1, y1); }
  var discMemo = {};
  function discRows(r) {
    var key = r.toFixed(2), d = discMemo[key]; if (d) return d; d = [];
    for (var dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) { var q = r * r - dy * dy; if (q < 0) continue; d.push(dy, floor(sqrt(q) + 0.35)); }
    return (discMemo[key] = d);
  }
  function stamp(g, pts, r, c, stripe, period) {
    var d = discRows(r), len = 0;
    g.fillStyle = c;
    for (var i = 0; i < pts.length; i += 2) {
      if (i) len += sqrt(sq(pts[i] - pts[i - 2]) + sq(pts[i + 1] - pts[i - 1]));
      if (stripe) g.fillStyle = floor(len / period) % 2 ? stripe : c;
      var x = round(pts[i]), y = round(pts[i + 1]);
      for (var j = 0; j < d.length; j += 2) g.fillRect(x - d[j + 1], y + d[j], d[j + 1] * 2 + 1, 1);
    }
  }
  function tube(g, pts, r, c, w, stripe, period) { if (w) stamp(g, pts, r + w, HC.ol); stamp(g, pts, r, c, stripe, period); }
  function seg(x0, y0, x1, y1) { return bezPts(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1); }


  /* ---- small head for the full-body henchman (half-res). cx, cy = skull centre, facing right.
     F: { look -1..1, lids 0..1, wink, brow, t } ---- */
  function hHeadS(g, cx, cy, F) {
    var o = HC.ol, t = F.t || 0, i, dy, hw;
    cx = round(cx); cy = round(cy);
    // mask tails flapping behind
    var f1 = round(sin(t / 70) * 1.2), f2 = round(sin(t / 70 + 1.4) * 1.2);
    chain(g, [cx - 5, cy - 2, cx - 8, cy - 3 + f1, cx - 11, cy - 2 - f2], 1, HC.mask, o);
    chain(g, [cx - 5, cy - 1, cx - 8, cy + 1 - f2, cx - 10, cy + 3 + f1], 1, HC.mask, o);
    // skull + jaw
    disc(g, cx, cy, 7, o); ellipse(g, cx + 1, cy + 3, 6, 4, o);
    disc(g, cx, cy, 6, HC.skinS); ellipse(g, cx + 1, cy + 3, 5, 3, HC.skinS);
    disc(g, cx + 1, cy - 1, 5, HC.skin); ellipse(g, cx + 2, cy + 2, 4, 3, HC.skin);
    // ear
    R(g, cx - 6, cy + 1, 3, 3, o); P(g, cx - 5, cy + 2, HC.skinD);
    // black eye mask band wrapped round the head
    for (dy = -4; dy <= 0; dy++) { hw = floor(sqrt(max(0, 36 - dy * dy)) + 0.35); R(g, cx - hw, cy + dy, hw * 2 + 1, 1, HC.mask); }
    R(g, cx - 4, cy - 4, 3, 1, HC.maskL);
    // eyes: whites, pupils that dart, a sly lid on the inner corner
    var look = F.look || 0, ey = cy - 3, lids = F.lids == null ? 0.45 : F.lids;
    var E = [[cx - 1, 2], [cx + 2, 3]];
    for (i = 0; i < 2; i++) {
      var ex = E[i][0], ew = E[i][1];
      if (F.wink && i === 1) { P(g, ex, ey + 2, HC.wht); P(g, ex + 1, ey + 1, HC.wht); P(g, ex + 2, ey + 2, HC.wht); continue; }
      R(g, ex, ey, ew, 3, HC.wht);
      var px = ew === 3 ? ex + (look < -0.3 ? 0 : look > 0.3 ? 2 : 1) : ex + (look < -0.3 ? 0 : 1);
      R(g, px, ey + 1, 1, 2, o);
      if (lids > 0.3) { R(g, ex, ey, ew, 1, HC.mask); P(g, i ? ex : ex + ew - 1, ey + 1, lids > 0.6 ? HC.mask : HC.wht); }
    }
    // eyebrows on the forehead, just under the beanie
    var bu = F.brow > 1 ? 1 : 0;
    R(g, cx - 1, cy - 5 - bu, 2, 1, HC.brow); R(g, cx + 2, cy - 5 - bu, 3, 1, HC.brow);
    // big round nose
    ellipse(g, cx + 7, cy + 1, 3, 2, o); ellipse(g, cx + 7, cy + 1, 2, 1, HC.nose); P(g, cx + 6, cy, "#ffd8c8"); P(g, cx + 8, cy + 2, HC.noseS);
    // sneaky grin: corners tucked up, one clean row of white teeth
    var my = cy + 4;
    P(g, cx - 1, my - 1, o); P(g, cx, my, o); R(g, cx + 1, my, 4, 1, HC.teeth); P(g, cx + 5, my, o); P(g, cx + 6, my - 1, o);
    R(g, cx + 1, my + 1, 4, 1, o);
    // beanie: dome, ribbed fold, pompom
    disc(g, cx - 1, cy - 13, 2, o); disc(g, cx - 1, cy - 13, 1, HC.pom); P(g, cx - 2, cy - 14, HC.pomL);
    ellTop(g, cx, cy - 7, 8, 6, o, cy - 7); ellTop(g, cx, cy - 7, 7, 5, HC.beanie, cy - 7);
    R(g, cx - 3, cy - 11, 3, 1, HC.beanieL); P(g, cx - 4, cy - 10, HC.beanieL);
    R(g, cx - 8, cy - 9, 17, 4, o); R(g, cx - 7, cy - 8, 15, 2, HC.beanie);
    for (i = -6; i < 8; i += 2) R(g, cx + i, cy - 8, 1, 2, HC.rib);
  }

  /* ---- big head for the peek (half-res, r ~ 11). cx, cy = skull centre, facing right.
     F: { look -1..1, lids 0..1, wink, brow, grinW, t } ---- */
  function hHeadBig(g, cx, cy, F) {
    var o = HC.ol, t = F.t || 0, i, dy, hw;
    cx = round(cx); cy = round(cy);
    var f1 = sin(t / 70) * 1.6, f2 = sin(t / 70 + 1.4) * 1.6;
    chain(g, bezPts(cx - 9, cy - 3, cx - 15, cy - 6 + f1, cx - 21, cy - 2 - f2), 2, HC.mask, o);
    chain(g, bezPts(cx - 9, cy - 1, cx - 14, cy + 2 - f2, cx - 18, cy + 7 + f1), 2, HC.mask, o);
    // skull + jaw
    disc(g, cx, cy, 12, o); ellipse(g, cx + 2, cy + 5, 10, 7, o);
    disc(g, cx, cy, 11, HC.skinS); ellipse(g, cx + 2, cy + 5, 9, 6, HC.skinS);
    disc(g, cx + 1, cy - 1, 10, HC.skin); ellipse(g, cx + 3, cy + 4, 8, 6, HC.skin);
    // ear
    ellipse(g, cx - 10, cy + 3, 3, 4, o); ellipse(g, cx - 10, cy + 3, 2, 3, HC.skinS); R(g, cx - 10, cy + 2, 1, 3, HC.skinD);
    // mask band
    for (dy = -6; dy <= 1; dy++) { hw = floor(sqrt(max(0, 121 - dy * dy)) + 0.35); R(g, cx - hw, cy + dy, hw * 2 + 1, 1, HC.mask); }
    R(g, cx - 7, cy - 6, 6, 1, HC.maskL);
    // eyes
    var look = F.look || 0, lids = F.lids == null ? 0.45 : F.lids, E = [[cx - 1, 4], [cx + 5, 5]], ey = cy - 5;
    for (i = 0; i < 2; i++) {
      var ex = E[i][0], ew = E[i][1];
      if (F.wink && i === 1) { R(g, ex, ey + 3, 1, 1, HC.wht); R(g, ex + 1, ey + 2, 1, 1, HC.wht); R(g, ex + 2, ey + 1, 1, 1, HC.wht); R(g, ex + 3, ey + 2, 1, 1, HC.wht); R(g, ex + 4, ey + 3, 1, 1, HC.wht); continue; }
      R(g, ex, ey + 1, ew, 3, HC.wht); R(g, ex + 1, ey, ew - 2, 5, HC.wht);
      var px = ex + round((ew - 2) / 2 + look * (ew - 2) / 2);
      R(g, px, ey + 1, 2, 3, o); P(g, px, ey + 1, "#ffffff");
      if (lids > 0.3) { R(g, ex, ey, ew, 1, HC.mask); P(g, i ? ex : ex + ew - 1, ey + 1, HC.mask); if (lids > 0.5) P(g, i ? ex + 1 : ex + ew - 2, ey + 1, HC.mask); }
    }
    // big round nose
    ellipse(g, cx + 12, cy + 3, 5, 4, o); ellipse(g, cx + 12, cy + 3, 4, 3, HC.noseS); ellipse(g, cx + 11, cy + 2, 3, 2, HC.nose);
    R(g, cx + 10, cy + 1, 2, 1, "#ffd8c8");
    // sneaky grin: a wide white crescent, outlined, corners tucked up
    var gw = F.grinW > 1 ? 1 : 0, x0 = cx - 3 - gw, x1 = cx + 9, x;
    for (x = x0; x <= x1; x++) {
      var q = (x - x0) / (x1 - x0), top = round(cy + 6 + 2.6 * (1 - sq(2 * q - 1)) + q), bot = round(cy + 6 + q + (2.6 + 3.2) * (1 - sq(2 * q - 1)));
      R(g, x, top - 1, 1, bot - top + 3, o);
      if (bot > top) { R(g, x, top, 1, bot - top, HC.teeth); if (bot - top > 2) R(g, x, bot - 1, 1, 1, HC.mouth); }
    }
    P(g, x0 - 1, cy + 5, o); P(g, x1 + 1, cy + 6, o);
    // beanie: dome, ribbed fold, pompom
    disc(g, cx - 2, cy - 19, 3, o); disc(g, cx - 2, cy - 19, 2, HC.pom); P(g, cx - 3, cy - 20, HC.pomL); P(g, cx - 2, cy - 20, HC.pomL);
    ellTop(g, cx, cy - 11, 13, 8, o, cy - 11); ellTop(g, cx, cy - 11, 12, 7, HC.beanie, cy - 11);
    R(g, cx - 6, cy - 16, 4, 1, HC.beanieL); R(g, cx - 7, cy - 15, 2, 2, HC.beanieL);
    R(g, cx - 14, cy - 13, 29, 6, o); R(g, cx - 13, cy - 12, 27, 4, HC.beanie);
    for (i = -12; i < 14; i += 2) R(g, cx + i, cy - 12, 1, 4, HC.rib);
    R(g, cx - 13, cy - 12, 27, 1, HC.beanieL);
    // eyebrows
    var bu = F.brow || 0;
    if (bu) { R(g, cx - 1, cy - 8 - bu, 4, 1, HC.brow); R(g, cx + 5, cy - 8 - bu, 5, 1, HC.brow); }
    else { R(g, cx - 1, cy - 7, 4, 1, HC.brow); R(g, cx + 5, cy - 7, 5, 1, HC.brow); }
  }

  /* ---- gloves (half-res): x,y = wrist, ang = pointing direction ---- */
  function glove(g, x, y, ang, type, far) {
    var c = far ? HC.gloveS : HC.glove, ca = cos(ang), sa = sin(ang), j, fingers = [];
    var px = x + ca * 1.5, py = y + sa * 1.5;
    if (type === "open" || type === "paw") {
      var spread = type === "paw" ? 0.45 : 0.7;
      for (j = -1; j <= 1; j++) { var fa = ang + j * spread; fingers.push([px, py, px + cos(fa) * 3, py + sin(fa) * 3]); }
    } else if (type === "finger") {
      fingers.push([px, py, px + ca * 4, py + sa * 4]);
    }
    for (j = 0; j < fingers.length; j++) chain(g, fingers[j], 3, HC.ol);
    var pa = spEll(px, py, 2, 2); paint(g, pa, HC.ol, 1);
    for (j = 0; j < fingers.length; j++) chain(g, fingers[j], 1, c);
    paint(g, pa, c); P(g, px - sa, py + ca, far ? HC.gloveD : HC.gloveS);
  }
  /* ---- big soft shoe (half-res): x,y = ankle; a = toe-down tilt ---- */
  function hShoe(g, ax, ay, a, far) {
    var ca = cos(a), sa = sin(a);
    function rv(fx, fy) { return [ax + ca * fx - sa * fy, ay + sa * fx + ca * fy]; }
    var c0 = rv(2.3, 1), sp = spEll(c0[0], c0[1], 4.2, 2.2, a);
    paint(g, sp, HC.ol, 1); paint(g, sp, HC.sole);
    var c1 = rv(2.2, 0.4), up = spEll(c1[0], c1[1], 4, 1.6, a); paint(g, up, far ? HC.shoeS : HC.shoe);
    var c2 = rv(4, -0.4); P(g, c2[0], c2[1], far ? HC.shoe : HC.shoeL);
  }
  function footDrop(a) { return 2.3 * sin(a) + 1 * cos(a) + sqrt(sq(4.2 * sin(a)) + sq(2.2 * cos(a))) + 1.5; }
  function hSack(g, cx, cy, tieX, tieY) {
    var s1 = spEll(cx, cy, 5.5, 5, 0.25); spEll(cx + 1, cy + 2, 4.5, 3.5, 0, s1);
    var nk = spPoly([cx + 1, cy - 3.5, tieX - 1, tieY - 1, tieX + 1, tieY + 1, cx + 3.5, cy - 2]);
    paint(g, nk, HC.ol, 1); paint(g, s1, HC.ol, 1); paint(g, nk, HC.sackS); paint(g, s1, HC.sackS);
    paint(g, spEll(cx - 0.5, cy - 0.5, 4.6, 4.2, 0.25), HC.sack);
    P(g, cx - 3, cy - 3, HC.sackL); P(g, cx - 2, cy - 3, HC.sackL);
    // a dollar sign
    g.fillStyle = HC.cash; R(g, cx - 1, cy - 3, 3, 1); P(g, cx - 1, cy - 2); R(g, cx - 1, cy - 1, 3, 1); P(g, cx + 1, cy); R(g, cx - 1, cy + 1, 3, 1); P(g, cx, cy - 4); P(g, cx, cy + 2);
    R(g, tieX - 1, tieY - 1, 3, 3, HC.ol); P(g, tieX, tieY, HC.rope);
  }

  /* ---- the whole henchman, half-res. Body frame: origin on the ground, facing right.
     P: { x, y, flip, hip:[x,y], lean, hunch, feet:[{x,y,a} near, far], arms:[near, far], face:{...}, t, headBob, sackDy } */
  function hFig(g, Q) {
    var t = Q.t || 0;
    g.save(); g.translate(round(Q.x), round(Q.y)); if (Q.flip) g.scale(-1, 1);
    var B = Q.hip, lean = Q.lean, Ls = 13, hunch = Q.hunch == null ? 3.7 : Q.hunch;
    var u = [sin(lean), -cos(lean)], fw = [cos(lean), sin(lean)];
    var N = [B[0] + u[0] * Ls, B[1] + u[1] * Ls], C = [(B[0] + N[0]) / 2 - fw[0] * hunch, (B[1] + N[1]) / 2 - fw[1] * hunch];
    function S(s) {
      if (s < 0) return [B[0] + 2 * (C[0] - B[0]) * s, B[1] + 2 * (C[1] - B[1]) * s];
      var q = 1 - s; return [q * q * B[0] + 2 * q * s * C[0] + s * s * N[0], q * q * B[1] + 2 * q * s * C[1] + s * s * N[1]];
    }
    function Nb(s) { s = max(0, s); var tx = 2 * (1 - s) * (C[0] - B[0]) + 2 * s * (N[0] - C[0]), ty = 2 * (1 - s) * (C[1] - B[1]) + 2 * s * (N[1] - C[1]), L = sqrt(tx * tx + ty * ty) || 1; return [ty / L, -tx / L]; }
    function wb(s) { s = max(0, s); return (21 - 13 * Math.pow(s, 1.2) + 7 * Math.exp(-sq((s - 0.62) / 0.2))) / 3; }
    function wf(s) { s = max(0, s); return (7 + 16 * Math.pow(1 - s, 1.6)) / 3; }
    function edge(s, side, frac) {
      var p = S(s), n = Nb(s), cp = s < 0 ? sqrt(max(0, 1 - sq(s / 0.24))) : 1, w = (side < 0 ? wb(s) : -wf(s)) * cp * (frac == null ? 1 : frac);
      return [p[0] + n[0] * w, p[1] + n[1] * w];
    }
    function band(sA, sB, fracF) {
      var pts = [], s2, e;
      for (s2 = sA; s2 < sB; s2 += 0.04) { e = edge(s2, -1); pts.push(e[0], e[1]); }
      e = edge(sB, -1); pts.push(e[0], e[1]);
      for (s2 = sB; s2 > sA; s2 -= 0.04) { e = fracF == null ? edge(s2, 1) : lerp2(edge(s2, -1), edge(s2, 1), fracF); pts.push(e[0], e[1]); }
      e = fracF == null ? edge(sA, 1) : lerp2(edge(sA, -1), edge(sA, 1), fracF); pts.push(e[0], e[1]);
      return spPoly(pts);
    }
    var sh = S(0.84), nb = Nb(0.84), shN = [sh[0] - nb[0] * 1, sh[1] - nb[1] * 1 + 0.7], shF = [sh[0] + nb[0] * 1.3, sh[1] + nb[1] * 1.3];
    var hb = Q.headBob || 0, H = [N[0] + u[0] * 4.5 + fw[0] * 3, N[1] + u[1] * 4.5 + fw[1] * 3 + hb];
    var mouth = [round(H[0]) + 3, round(H[1]) + 4];
    function arm(A, shp, far) {
      var hx, hy, el, pts;
      if (A.to === "mouth") { hx = mouth[0] + 4; hy = mouth[1] + 7; } else { hx = A.h[0]; hy = A.h[1]; }
      if (A.ctrl) { el = A.ctrl; pts = bezPts(shp[0], shp[1], el[0], el[1], hx, hy); }
      else { var q = ik(shp[0], shp[1], hx, hy, 6, 6, A.bend || 1); el = pt(shp[0], shp[1], q.a1, 6); pts = thru(shp[0], shp[1], el[0], el[1], hx, hy); }
      chain(g, pts, 1, far ? HC.whtS : HC.wht, HC.ol, far ? HC.blkF : HC.blk, 2);
      var ang = A.ha != null ? A.ha : Math.atan2(hy - el[1], hx - el[0]);
      glove(g, hx, hy, ang, A.hand || "open", far);
    }
    function leg(hp, F, far) {
      var q = ik(hp[0], hp[1], F.x, F.y, 7.3, 7, 1), kn = pt(hp[0], hp[1], q.a1, 7.3);
      chain(g, thru(hp[0], hp[1], kn[0], kn[1], F.x, F.y), 1, far ? HC.pantsS : HC.pants, HC.ol);
      hShoe(g, F.x, F.y, F.a, far);
    }
    arm(Q.arms[1], shF, true);
    leg([B[0] - 2, B[1]], Q.feet[1], true);
    var sp6 = S(0.58), n6 = Nb(0.58), sk = Q.sackDy || 0;
    if (Q.sack !== false) hSack(g, round(sp6[0] + n6[0] * (wb(0.58) + 1.5)), round(sp6[1] + n6[1] * (wb(0.58) + 1.5) + sk), round(shF[0] + nb[0]), round(shF[1] - 1));
    leg([B[0] + 2, B[1] + 1], Q.feet[0], false);
    var whole = band(-0.24, 1); paint(g, whole, HC.ol, 1);
    paint(g, band(-0.24, 0.08), HC.pants); paint(g, band(-0.24, 0.08, 0.35), HC.pantsS);
    var shirt = band(0.15, 1), shirtB = band(0.15, 1, 0.3);
    paint(g, shirt, HC.wht); paint(g, shirtB, HC.whtS);
    var axx = N[0] - B[0], axy = N[1] - B[1], al = sqrt(axx * axx + axy * axy), ux = axx / al, uy = axy / al;
    for (var d = 3.5; d < al + 4; d += 3.5) { // black stripes across the body
      var q0 = [B[0] + ux * d, B[1] + uy * d], q1 = [B[0] + ux * (d + 1.6), B[1] + uy * (d + 1.6)];
      var st = spPoly([q0[0] + uy * 30, q0[1] - ux * 30, q0[0] - uy * 30, q0[1] + ux * 30, q1[0] - uy * 30, q1[1] + ux * 30, q1[0] + uy * 30, q1[1] - ux * 30]);
      paintClip(g, st, shirt, HC.blk); paintClip(g, st, shirtB, HC.blkS);
    }
    paint(g, band(0.06, 0.15), HC.belt);
    var bk = edge(0.105, 1, 0.75); R(g, round(bk[0]) - 1, round(bk[1]) - 1, 3, 3, HC.ol); P(g, round(bk[0]), round(bk[1]), HC.buckle);
    hHeadS(g, H[0], H[1], Q.face || {});
    if (Q.sack !== false) { var rp = seg(shF[0] + nb[0], shF[1] - 1, shN[0] + 2, shN[1] + 5); stamp(g, rp, 0.4, HC.rope); }
    arm(Q.arms[0], shN, false);
    g.restore();
    return { H: H, mouth: mouth };
  }
  function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  /* feet for a moving body: planted foot stays put, swing foot arcs forward. L = travel per step, u = step progress, k = step index */
  function steps(k, u, L, lift, aPlant, aSwing, baseX, gap) {
    var sw = -L / 2 + L * ease(u), pl = L / 2 - L * u, h = lift * sin(PI * u);
    var swing = { x: baseX + sw, y: -footDrop(aSwing) - h, a: aSwing }, plant = { x: baseX + pl, y: -footDrop(aPlant), a: aPlant };
    var near = k % 2 ? plant : swing, far = k % 2 ? swing : plant;
    far = { x: far.x - gap, y: far.y - 1, a: far.a };
    return [near, far];
  }

  /* All henchman scenes draw into a 200x120 half-res canvas (GROUND = 118), blitted at 2x onto the 400x240 overlay. */
  var GROUND = 118;
  /* tiptoe: stiff hunched body glides along; only the feet patter in tiny quick tiptoe steps */
  var TIP_D = 4200, TIP_STEP = 140;
  function sceneTiptoe(g, t) {
    var x0 = -22, x1 = 222, tt = min(t, TIP_D), v = (x1 - x0) / TIP_D, bx = x0 + v * tt;
    var k = floor(tt / TIP_STEP), u = (tt - k * TIP_STEP) / TIP_STEP;
    var feet = steps(k, u, v * TIP_STEP, 2, 0.62, 0.62 + 0.35 * sin(PI * u), 2, 2.5);
    var gl = floor(t / 650) % 6, look = [0, 0.2, 1, 0, -1, 0][gl];
    hFig(g, { x: round(bx), y: GROUND, t: t, hip: [0, -16], lean: 0.5, hunch: 4,
      feet: feet,
      arms: [{ to: "mouth", bend: -1, hand: "finger", ha: -PI / 2 - 0.15 }, { h: [13, -21], bend: -1, hand: "paw", ha: PI / 2 + 0.25 }],
      face: { look: look, lids: 0.5, brow: gl === 3 ? 2 : 0, t: t } });
    // tiny tip-tap marks under the planted toe
    if (u < 0.35) { var px = round(bx + feet[k % 2 ? 0 : 1].x + 4); g.fillStyle = "#f3e9d2"; g.fillRect(px - 2, GROUND - 2, 1, 1); g.fillRect(px + 2, GROUND - 2, 1, 1); g.fillRect(px, GROUND - 3, 1, 1); }
    return t < TIP_D;
  }

  /* scoot (aliases "sneak", "dance"): low crouch, arms windmilling, legs a shuffling blur, right to left */
  var SC_D = 3800, SC_STEP = 115;
  function sceneScoot(g, t) {
    var x0 = 232, x1 = -32, tt = min(t, SC_D), v = (x0 - x1) / SC_D, bx = x0 - v * tt;
    var k = floor(tt / SC_STEP), u = (tt - k * SC_STEP) / SC_STEP, bob = -round(1 * abs(sin(PI * u)));
    var feet = steps(k, u, v * SC_STEP, 2, -0.05, -0.25 + 0.2 * sin(PI * u), 2.5, 4);
    var th = t / 380 * PI * 2, sh = [4.5, -22];
    function wind(a, len, wob) {
      var hx = sh[0] + sin(a) * len, hy = sh[1] - cos(a) * len, mx = (sh[0] + hx) / 2, my = (sh[1] + hy) / 2, px = -(hy - sh[1]), py = hx - sh[0], pl = sqrt(px * px + py * py) || 1;
      return { h: [hx, hy + bob], ctrl: [mx + px / pl * wob, my + py / pl * wob + bob], hand: "open" };
    }
    hFig(g, { x: round(bx), y: GROUND, t: t, flip: true, hip: [0, -13 + bob], lean: 0.72 + 0.08 * sin(t / 70), hunch: 3, headBob: round(sin(t / 60)),
      feet: feet, sackDy: round(sin(t / 55)),
      arms: [wind(th, 10, 3.3 * sin(th * 2)), wind(th + PI, 9.5, -3.3 * sin(th * 2 + 1))],
      face: { look: 1, lids: 0.2, brow: 2 + round(sin(t / 90)), t: t } });
    // speed lines and dust behind him (he runs right-to-left, so "behind" is to the right)
    g.fillStyle = "#f3e9d2";
    for (var i = 0; i < 4; i++) { var w = 4 + ((i * 3 + floor(t / 60)) % 5); g.fillRect(round(bx + 17 + i * 2), 76 + i * 9, w, 1); }
    for (i = 0; i < 3; i++) { var age = ((t / SC_STEP) + i / 3) % 1, r = round(1 + age * 2); if (age < 0.85) disc(g, round(bx + 9 + age * 10 + i * 2), GROUND - 1 - r, r, "#d8d0c4"); }
    return t < SC_D;
  }

  /* peek: big head + gloved fingers come round the screen edge, eyes dart about, sly grin, wink, slip away */
  var pkSrc = null, pkDst = null, PK = 80;
  function canvas2(w) { var c = document.createElement("canvas"); c.width = w; c.height = w; return c; }
  function rotBlit(g, src, cx0, cy0, dx, dy, ang, mirror) {
    var W = src.width, sd = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, W).data;
    if (!pkDst) pkDst = canvas2(W);
    var dg = pkDst.getContext("2d", { willReadFrequently: true }), out = dg.createImageData(W, W), od = out.data, ca = cos(ang), sa = sin(ang);
    for (var y = 0; y < W; y++) for (var x = 0; x < W; x++) {
      var rx = x + 0.5 - cx0, ry = y + 0.5 - cy0, ux = ca * rx + sa * ry, uy = -sa * rx + ca * ry;
      if (mirror) ux = -ux;
      var ix = floor(ux + cx0), iy = floor(uy + cy0);
      if (ix < 0 || iy < 0 || ix >= W || iy >= W) continue;
      var si = (iy * W + ix) * 4; if (!sd[si + 3]) continue;
      var di = (y * W + x) * 4; od[di] = sd[si]; od[di + 1] = sd[si + 1]; od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
    }
    dg.putImageData(out, 0, 0);
    g.drawImage(pkDst, round(dx - cx0), round(dy - cy0));
  }
  /* four gloved fingers curled round a screen edge. (bx,by) first finger base on the edge, d = inward dir, l = along-edge dir */
  function grip(g, bx, by, d, l, amt, t, drum) {
    for (var j = 0; j < 4; j++) {
      var len = amt * (j === 0 || j === 3 ? 5 : 6.5);
      if (drum && floor(t / 85) % 5 === j) len -= 2.5;
      if (len <= 0) continue;
      var x0 = bx + l[0] * j * 4 - d[0] * 3, y0 = by + l[1] * j * 4 - d[1] * 3, x1 = bx + l[0] * j * 4 + d[0] * len, y1 = by + l[1] * j * 4 + d[1] * len;
      var p = seg(x0, y0, x1, y1);
      stamp(g, p, 2.6, HC.ol); stamp(g, p, 1.6, HC.glove);
      stamp(g, seg(x0 + l[0], y0 + l[1], x1 + l[0] - d[0], y1 + l[1] - d[1]), 0.4, HC.gloveS);
    }
  }
  var PEEK_D = 3900, PEEK_SIDES = ["right", "left", "corner"], peekN = 0, peekLastT = 1e9;
  var PEEK_LOOK = [[650, 1], [900, -1], [1120, 1], [1320, -1], [1500, 1], [1700, -1], [1900, 0], [2750, 1]];
  function scenePeek(g, t, side) {
    var r = 12, hin, fin, look = 1, wink = false, brow = 0, i, prevAt = 0;
    hin = t < 650 ? easeBack((t - 180) / 470) : t < 3000 ? 1 : 1 - easeIn((t - 3000) / 420);
    fin = t < 320 ? ease(t / 320) : t < 3350 ? 1 : 1 - ease((t - 3350) / 380);
    for (i = 0; i < PEEK_LOOK.length; i++) if (t >= PEEK_LOOK[i][0]) { look = PEEK_LOOK[i][1]; prevAt = PEEK_LOOK[i][0]; }
    if (t > 2150 && t < 2550) wink = true;
    if (t > 1900 && t < 2750) brow = floor(t / 110) % 2 ? 2 : 0; // eyebrow waggle at the viewer
    var dart = t > 650 && t < 1900 && t - prevAt < 90;
    var tilt = 0, bobY = (dart ? -1 : 0) + (t > 1900 && t < 2750 && floor(t / 220) % 2 ? -1 : 0);
    if (!pkSrc) pkSrc = canvas2(PK);
    var sg = pkSrc.getContext("2d", { willReadFrequently: true }), hc = PK / 2, hcy = PK / 2 + 6;
    sg.clearRect(0, 0, PK, PK);
    hHeadBig(sg, hc, hcy, { look: look, lids: wink ? 0.35 : 0.55, grinW: t > 1900 ? 1.15 : 1, wink: wink, brow: brow, t: t });
    if (dart) { sg.fillStyle = "#f3e9d2"; var zx = look > 0 ? hc + r + 8 : hc - r - 10; for (i = 0; i < 3; i++) sg.fillRect(zx, hcy - 4 + i * 2, 3 - (i % 2), 1); }
    if (hin <= 0 && fin <= 0) return t < PEEK_D;
    var hx, hy, ang, mirror, gone = 1 - clamp(hin, -0.2, 1.2);
    if (side === "left") {
      hx = 8 - gone * 38; hy = 58 + bobY; ang = tilt; mirror = false;
      if (hin > -0.2) rotBlit(g, pkSrc, hc, hcy, hx, hy, ang, mirror);
      grip(g, -1, 10, [1, 0], [0, 1], fin, t, t > 700 && t < 1900);
      grip(g, -1, 76, [1, 0], [0, 1], fin, t + 200, t > 700 && t < 1900);
    } else if (side === "corner") {
      hx = 180 + gone * 14; hy = 106 + bobY + gone * 44; ang = -tilt; mirror = true;
      if (hin > -0.2) rotBlit(g, pkSrc, hc, hcy, hx, hy, ang, mirror);
      grip(g, 140, 121, [0, -1], [-1, 0], fin, t, t > 700 && t < 1900);
      grip(g, 201, 46, [-1, 0], [0, 1], fin, t + 200, false);
    } else {
      hx = 192 + gone * 38; hy = 58 + bobY; ang = -tilt; mirror = true;
      if (hin > -0.2) rotBlit(g, pkSrc, hc, hcy, hx, hy, ang, mirror);
      grip(g, 201, 12, [-1, 0], [0, 1], fin, t, t > 700 && t < 1900);
      grip(g, 201, 80, [-1, 0], [0, 1], fin, t + 200, t > 700 && t < 1900);
    }
    return t < PEEK_D;
  }
  window.henchmanScene = function (g, t, style) {
    g.clearRect(0, 0, 400, 240);
    t = max(0, t || 0);
    var c = scratch("hench", 200, 120), h = c.getContext("2d");
    var s = String(style || "peek"), r;
    if (s === "tiptoe") r = sceneTiptoe(h, t);
    else if (s === "scoot" || s === "sneak" || s === "dance") r = sceneScoot(h, t);
    else {
      var side = s.indexOf("peek-") === 0 ? s.slice(5) : null;
      if (!side) { if (t < peekLastT) peekN++; peekLastT = t; side = PEEK_SIDES[peekN % PEEK_SIDES.length]; }
      r = scenePeek(h, t, side);
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    blit2(g, c, 0, 0, 0, 0, false);
    g.restore();
    return r;
  };
})();
