/* Pixel-art sprites for "Where in the World Is Cameron SanFrancisco?"
 * Plain browser script. Defines on window:
 *   drawStreet(g, seed)                 384x188 street backdrop (cached per seed)
 *   drawDetective(g, x, y, frame, opts) player detective; x = body centre, y = feet. opts {run, flip, slump}
 *                                       (slump: head down, hat low, sad 12-frame shuffle with a rain cloud)
 *   drawSuspect(g, x, y, frame, opts)   fleeing suspect; opts {hat, hair, skin, run, flip, caught, glasses}
 *   drawFlyingHat(g, x, y, angleStep)   the suspect's fedora centred on x,y, rotated angleStep * 90deg
 *                                       (fractional steps allowed; snapped to 22.5deg)
 *   henchmanScene(g, t, style)          one frame of the 400x240 overlay; style "tiptoe" | "scoot" | "peek" (aliases:
 *                                       "sneak" = tiptoe, "dance" = scoot, "peek-left/-right/-corner" = peek);
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
   * HENCHMAN — a tiny, simple 8-bit burglar, ~44px tall in the 400x240 overlay
   * (22 half-res pixels, blitted at 2x). Five-ish flat colours, no shading:
   * dark green cap + outfit, white shirt stripes and gloves, black mask/outline,
   * skin, and a plain tan loot sack. Every pose is a hand-drawn character bitmap.
   * ===================================================================== */
  var HPAL = { K: "#15141c", G: "#1e5a32", W: "#f2eee4", S: "#f0b48a", T: "#c89a5a", B: "#8a6230" };
  var bmMemo = {};
  /* draw a bitmap (array of strings, "." = clear) with its top-left at (x, y); flip mirrors it horizontally */
  function bm(h, rows, x, y, flip) {
    var w = 0, i, j, row, c, j0;
    for (i = 0; i < rows.length; i++) w = max(w, rows[i].length);
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      for (j = 0; j < row.length; j = j0) {
        c = row[j]; j0 = j + 1;
        if (c === ".") continue;
        while (j0 < row.length && row[j0] === c) j0++;
        h.fillStyle = HPAL[c];
        h.fillRect(round(x + (flip ? w - j0 : j)), round(y + i), j0 - j, 1);
      }
    }
    return w;
  }
  function px(h, x, y, c) { h.fillStyle = HPAL[c]; h.fillRect(round(x), round(y), 1, 1); }

  /* ---- front view (peek + scoot). Head rows 0..12, eyes are 2x2 whites at cols 1-2 / 7-8, rows 7-8 ---- */
  var H_HEAD = [
    "...KKKK...",
    ".KKGGGGKK.",
    "KGGGGGGGGK",
    "KGGGGGGGGK",
    "KKKKKKKKKK",
    "KSSSSSSSSK",
    "KKKKKKKKKK",
    "KWWKKKKWWK",
    "KWWKKKKWWK",
    "KSSSSSSSSK",
    "KSSSKKSSSK",
    ".KSSSSSSK.",
    "..KKKKKK.."
  ];
  var H_GRIN = [                          // rows 9..11 replaced for a big grin
    "KSKSSSSKSK",
    "KSKWWWWKSK",
    ".KSKKKKSK."
  ];
  var H_TORSO = [                         // rows 13..18 under the front head
    ".KGGGGGGK.",
    "KWWWWWWWWK",
    "KGGGGGGGGK",
    "KWWWWWWWWK",
    "KGGGGGGGGK",
    "KKKKKKKKKK"
  ];
  var H_LEGS = [                          // crouched shuffle, 12 wide (drawn 1px left of the body)
    ["KGGGKKKGGGK.", "KGGK...KGGK.", "KKKK...KKKK."],
    [".KGGGKKGGGK.", "..KGGKKGGK..", ".KKKK..KKKK."],
    [".KGGGKKKGGGK", ".KGGK...KGGK", ".KKKK...KKKK"]
  ];
  /* right-hand arms, 4 wide, drawn so that row 6 sits on body row 13 (the shoulder) */
  var H_ARM = {
    up: [".KK.", "KWWK", "KWWK", "KGGK", ".KGK", ".KGK", "KGK.", "K...", "...."],
    mid: ["....", "....", "....", "....", "....", "..KK", "KGWW", "KGWW", "K.KK"],
    down: ["....", "....", "....", "....", "....", "....", "KGK.", "KGGK", ".KGK", ".KWW", ".KWW", "..KK"]
  };
  function eyes(h, x, y, look) {          // look: -1 left, 0 ahead, 1 right
    var a = look < 0 ? 1 : 2, b = look > 0 ? 8 : 7;
    px(h, x + a, y + 8, "K"); px(h, x + b, y + 8, "K");
  }
  function frontHead(h, x, y, look, grin) {
    bm(h, H_HEAD, x, y);
    if (grin) bm(h, H_GRIN, x, y + 9);
    eyes(h, x, y, look);
  }

  /* ---- side view for the tiptoe: hunched forward, facing right, sack on the back. 21 wide, 22 tall ---- */
  var T_TOP = [
    "...KKKK..............",
    "..KTTTTK.............",
    ".KTTTTTTK....KKKKK...",
    ".KTTTTTTTK..KGGGGGK..",
    "KTTTTTTTTK.KGGGGGGGK.",
    "KTTTTTTTTK.KKKKKKKKKK",
    "KTTTTTTTTK.KSSSSSSSK.",
    "KTTTTTTTTKKKKKKKKKKK.",
    ".KTTTTTTKBKKWWKKKWWK.",
    "..KKKKKKBKKKWKKKKWKK.",
    ".....KGBGKSSSSSSSSSK.",
    "....KWBWWKSSSSSKKKSK.",
    "....KGGBGGKSSSSSSSK..",
    "...KWWWWBWWKKKKKKK...",
    "...KGGGGGBKWWK.......",
    "...KWWWWWWKWWK.......",
    "....KGGGGGGKK........",
    "....KKKKKKKK........."
  ];
  var T_LEGS = [
    ["....KGGKKGGK.........", "...KGGK..KGGK........", "..KGGK....KGK........", "..KK.......KK........"],
    [".....KGGGGK..........", ".....KGKGGK..........", ".....KGKKGK..........", ".....KK.KK..........."],
    ["....KGGKKGGK.........", "....KGGK.KGGK........", "....KGK...KGGK.......", "....KK......KK......."]
  ];
  var T_LOOK = [                          // rows 8..9 with the eyes turned to the viewer (mid-sneak freeze)
    ".KTTTTTTKBKKWWKKKWWK.",
    "..KKKKKKBKKKKWKKKKWK."
  ];

  /* All henchman scenes draw into a 200x120 half-res canvas, blitted at 2x onto the 400x240 overlay.
   * Feet rest on GROUND; the banner (half-res x 6..58, y 95..110) is only ever passed, never stopped at. */
  var GROUND = 116;

  /* tiptoe (alias "sneak"): left to right on tiptoe with the loot sack, freezing once mid-screen to glance at us */
  var TIP_D = 4000;
  function sceneTiptoe(h, t) {
    var walk1 = 1500, freeze = 700, x, k, look = false, legs;
    if (t < walk1) x = -24 + t / walk1 * 130;                          // -24 .. 106
    else if (t < walk1 + freeze) { x = 106; look = t > walk1 + 150 && t < walk1 + freeze - 100; }
    else x = 106 + (t - walk1 - freeze) / (TIP_D - walk1 - freeze) * 120;
    k = floor(t / 170) % 4;                                            // stride, pass, stride, pass
    legs = look || (t >= walk1 && t < walk1 + freeze) ? T_LEGS[0] : T_LEGS[k === 1 || k === 3 ? 1 : k === 0 ? 0 : 2];
    var bob = (k === 1 || k === 3) && !(t >= walk1 && t < walk1 + freeze) ? -1 : 0;
    var X = round(x), Y = GROUND - 22 + bob;
    bm(h, T_TOP, X, Y);
    if (look) bm(h, T_LOOK, X, Y + 8);
    bm(h, legs, X, Y + 18);
    return t < TIP_D;
  }

  /* scoot (alias "dance"): low quick shuffle right to left, both arms pumping up and down in rhythm */
  var SC_D = 3600, SC_BEAT = 160;
  var SC_ARMS = [["up", "down"], ["mid", "mid"], ["down", "up"], ["mid", "mid"], ["up", "up"], ["down", "down"], ["up", "up"], ["down", "down"]];
  function sceneScoot(h, t) {
    var x = 212 - t / SC_D * 248, beat = floor(t / SC_BEAT), arms = SC_ARMS[beat % SC_ARMS.length];
    var X = round(x), Y = GROUND - 22 + (beat % 2 ? 1 : 0), look = -1;
    var legs = H_LEGS[floor(t / 90) % 2 ? 0 : (floor(t / 180) % 2 ? 1 : 2)];
    bm(h, H_ARM[arms[0]], X - 4, Y + 7, true);                          // his right arm (viewer's left)
    bm(h, H_ARM[arms[1]], X + 10, Y + 7);
    frontHead(h, X, Y, look, true);
    bm(h, H_TORSO, X, Y + 13);
    bm(h, legs, X - 1, Y + 19);
    return t < SC_D;
  }

  /* peek: head + gloved hands pop up from the bottom edge, look left, look right, big grin, drop back down */
  var PEEK_D = 3700, PEEK_X = 140;
  function scenePeek(h, t) {
    var up;                                                            // how many rows show above the bottom edge
    if (t < 350) up = ease(t / 350) * 19;
    else if (t < 3100) up = 19;
    else up = (1 - easeIn((t - 3100) / 450)) * 19;
    var look = t < 600 ? 0 : t < 1200 ? -1 : t < 1850 ? 1 : 0, grin = t >= 2050 && t < 3100;
    var hop = grin && floor((t - 2050) / 140) % 2 === 0 ? -1 : 0;     // little chuckle bounce
    var X = PEEK_X, Y = 120 - round(up) + hop;
    frontHead(h, X, Y, look, grin);
    bm(h, H_TORSO, X, Y + 13);
    var gy = Y + 13 - (grin ? 2 : 0);                                  // gloves gripping beside the chin
    bm(h, H_GLOVE, X - 5, gy); bm(h, H_GLOVE, X + 10, gy, true);
    return t < PEEK_D;
  }
  var H_GLOVE = [".KKKK", "KWKWK", "KWWWK", "KWWWK", "KGGGK", "KGGGK", "KGGGK", "KGGGK"];
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeIn(t) { t = clamp(t, 0, 1); return t * t; }

  window.henchmanScene = function (g, t, style) {
    g.clearRect(0, 0, 400, 240);
    t = max(0, t || 0);
    var c = scratch("hench", 200, 120), h = c.getContext("2d");
    var s = String(style || "peek"), r;
    if (s === "tiptoe" || s === "sneak") r = sceneTiptoe(h, t);
    else if (s === "scoot" || s === "dance") r = sceneScoot(h, t);
    else r = scenePeek(h, t);                                          // "peek", "peek-left", "peek-right", "peek-corner"
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    blit2(g, c, 0, 0, 0, 0, false);
    g.restore();
    return r;
  };
})();
