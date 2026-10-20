/* Pixel-art landmark & building painter for "Where in the World Is Cameron SanFrancisco?"
   Defines window.drawLandmark(canvas, id)  (240x147) and window.drawBuilding(canvas, type) (120x100),
   plus window.drawApproach(canvas, type) (384x188) for the detective's walk-up to a building.
   Everything is drawn with crisp integer spans + gradients, then quantized with a 4x4 Bayer dither.
   Deterministic: seeded PRNG per id, never Math.random. */
(function () {
  'use strict';
  var c, W, H, rnd, nzA;
  var BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* ---------------- core ---------------- */
  function mb(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hs(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mkNoise(seed) { var r = mb(seed), t = []; for (var i = 0; i < 256; i++) t.push(r()); return function (x) { var i = Math.floor(x), f = x - i, a = t[i & 255], b = t[(i + 1) & 255]; f = f * f * (3 - 2 * f); return a + (b - a) * f; }; }
  var OFF = {};
  function begin(cv, key) {
    W = cv.width || 1; H = cv.height || 1;
    var k = W + 'x' + H, o = OFF[k];
    if (!o) { o = document.createElement('canvas'); o.width = W; o.height = H; OFF[k] = o; o._c = o.getContext('2d', { willReadFrequently: true }); }
    c = o._c; rnd = mb(hs(key)); nzA = mkNoise(hs(key + '#n'));
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, H);
  }
  function fbm(x, o) { o = o || 4; var s = 0, a = 0.5, f = 1, n = 0; for (var i = 0; i < o; i++) { s += a * nzA(x * f + i * 37.1); n += a; a *= 0.5; f *= 2; } return s / n; }
  function rf(a, b) { return a + rnd() * (b - a); }
  function ri(a, b) { return Math.floor(a + rnd() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  var HC = {};
  function hx(h) { var v = HC[h]; if (v) return v; var s = h.charAt(0) === '#' ? h.slice(1) : h; v = [parseInt(s.substr(0, 2), 16), parseInt(s.substr(2, 2), 16), parseInt(s.substr(4, 2), 16)]; HC[h] = v; return v; }
  function th(r, g, b) { function q(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); } return '#' + q(r) + q(g) + q(b); }
  function mix(a, b, t) { var A = hx(a), B = hx(b); return th(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  function lt(a, t) { return t >= 0 ? mix(a, '#ffffff', t) : mix(a, '#000000', -t); }
  function rgba(h, a) { var v = hx(h); return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + a + ')'; }
  function LG(x0, y0, x1, y1, st) { var g = c.createLinearGradient(x0, y0, x1, y1); for (var i = 0; i < st.length; i++) g.addColorStop(st[i][0], st[i][1]); return g; }
  function RG(x, y, r0, r1, st) { var g = c.createRadialGradient(x, y, r0, x, y, r1); for (var i = 0; i < st.length; i++) g.addColorStop(st[i][0], st[i][1]); return g; }
  function R(x, y, w, h, col) { if (col) c.fillStyle = col; var x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h); if (x1 > x0 && y1 > y0) c.fillRect(x0, y0, x1 - x0, y1 - y0); }
  function px(x, y, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1); }
  // crisp scanline polygon (flat [x,y,x,y...])
  function spans(p, cb) {
    var n = p.length / 2, mn = 1e9, mx = -1e9, i;
    for (i = 0; i < n; i++) { mn = Math.min(mn, p[2 * i + 1]); mx = Math.max(mx, p[2 * i + 1]); }
    var y0 = Math.max(0, Math.floor(mn)), y1 = Math.min(H - 1, Math.ceil(mx));
    for (var y = y0; y <= y1; y++) {
      var yc = y + 0.5, xs = [];
      for (i = 0; i < n; i++) { var j = (i + 1) % n, ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j], by = p[2 * j + 1]; if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax)); }
      xs.sort(function (a, b) { return a - b; });
      for (var k = 0; k + 1 < xs.length; k += 2) { var a = Math.round(xs[k]), b = Math.round(xs[k + 1]); if (b > a) cb(a, y, b - a); }
    }
  }
  function P(p, col) { c.fillStyle = col; spans(p, function (x, y, w) { c.fillRect(x, y, w, 1); }); }
  // run fn with drawing clipped (crisply) to polygon p
  function clipTo(p, fn) { c.save(); c.beginPath(); spans(p, function (x, y, w) { c.rect(x, y, w, 1); }); c.clip(); fn(); c.restore(); }
  function E(x, y, rx, ry, col) {
    c.fillStyle = col;
    for (var yy = Math.floor(y - ry); yy <= Math.ceil(y + ry); yy++) {
      var dy = (yy + 0.5 - y) / ry; if (dy < -1 || dy > 1) continue;
      var hw = rx * Math.sqrt(1 - dy * dy), a = Math.round(x - hw), b = Math.round(x + hw);
      if (b <= a) { if (hw > 0.3) { a = Math.floor(x); b = a + 1; } else continue; }
      c.fillRect(a, yy, b - a, 1);
    }
  }
  function L(x0, y0, x1, y1, col) {
    c.fillStyle = col; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    for (var k = 0; k < 1000; k++) { c.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  // symmetric profile: wf(u) half-width, u=0 at base yb, u=1 at top
  function prof(cx, yb, h, wf, col) {
    c.fillStyle = col;
    for (var y = Math.floor(yb - h); y < Math.ceil(yb); y++) {
      var u = (yb - (y + 0.5)) / h; if (u < 0 || u > 1) continue;
      var w = wf(u); if (!(w > 0)) continue;
      var a = Math.round(cx - w), b = Math.round(cx + w);
      if (b <= a) { if (w > 0.2) { a = Math.floor(cx); b = a + 1; } else continue; }
      c.fillRect(a, y, b - a, 1);
    }
  }
  function bez(x0, y0, x1, y1, x2, y2, n, out) { out = out || []; for (var i = 0; i <= n; i++) { var t = i / n, m = 1 - t; out.push(m * m * x0 + 2 * m * t * x1 + t * t * x2, m * m * y0 + 2 * m * t * y1 + t * t * y2); } return out; }

  /* ---------------- scenery helpers ---------------- */
  function sky(st, y1) { c.fillStyle = LG(0, 0, 0, y1 || H, st); c.fillRect(0, 0, W, H); }
  function sun(x, y, r, core, glow, gr) {
    c.fillStyle = RG(x, y, 0, gr || r * 6, [[0, rgba(glow, 0.9)], [0.18, rgba(glow, 0.45)], [0.5, rgba(glow, 0.12)], [1, rgba(glow, 0)]]); c.fillRect(0, 0, W, H);
    E(x, y, r + 1, r + 1, mix(core, glow, 0.5)); E(x, y, r, r, core);
  }
  function stars(n, y1, cols) { cols = cols || ['#ffffff', '#cfd8ff', '#fff2c0']; for (var i = 0; i < n; i++) { var x = rf(0, W), y = rf(0, y1), col = pick(cols); px(x, y, col); if (rnd() < 0.12) { px(x - 1, y, rgba(col, 0.5)); px(x + 1, y, rgba(col, 0.5)); px(x, y - 1, rgba(col, 0.5)); px(x, y + 1, rgba(col, 0.5)); } } }
  function bird(x, y, col) { px(x - 2, y + 1, col); px(x - 1, y, col); px(x, y + 1, col); px(x + 1, y, col); px(x + 2, y + 1, col); }
  function birds(n, x0, x1, y0, y1, col) { for (var i = 0; i < n; i++) { var x = rf(x0, x1), y = rf(y0, y1); if (rnd() < 0.5) { px(x - 1, y, col); px(x, y + 1, col); px(x + 1, y, col); } else bird(x, y, col); } }
  // cumulus: flat bottom, lit from ld (-1 left, 1 right)
  function cumulus(x, y, w, h, cols, ld) {
    ld = ld || -1; var n = Math.max(3, Math.round(w / 5)), pf = [], i;
    for (i = 0; i < n; i++) { var t = n === 1 ? 0.5 : i / (n - 1), rr = h * (0.35 + 0.65 * Math.sin(Math.PI * (0.1 + 0.8 * t))) * rf(0.75, 1.1) + 1.5; pf.push([x + t * w + rf(-2, 2), y - rr * 0.55, rr]); }
    c.save(); c.beginPath(); c.rect(x - w, y - h * 4, w * 3, h * 4 + 1.5); c.clip();
    for (i = 0; i < n; i++) E(pf[i][0], pf[i][1] + 1, pf[i][2] * 1.15, pf[i][2] * 0.85, cols[0]);
    for (i = 0; i < n; i++) E(pf[i][0] + ld * 0.6, pf[i][1] - 0.3, pf[i][2] * 1.02, pf[i][2] * 0.74, cols[1]);
    for (i = 0; i < n; i++) E(pf[i][0] + ld * pf[i][2] * 0.3, pf[i][1] - pf[i][2] * 0.25, pf[i][2] * 0.66, pf[i][2] * 0.48, cols[2]);
    if (cols[3]) for (i = 0; i < n; i++) E(pf[i][0] + ld * pf[i][2] * 0.45, pf[i][1] - pf[i][2] * 0.42, pf[i][2] * 0.3, pf[i][2] * 0.22, cols[3]);
    c.restore();
  }
  // stratus streak lit from below (sunset)
  function strato(x, y, w, h, shd, mid, lit) { E(x + w / 2, y, w / 2, h, shd); E(x + w / 2 + 1, y + h * 0.25, w / 2 - 2, h * 0.7, mid); E(x + w / 2 + 2, y + h * 0.55, w * 0.32, h * 0.38, lit); }
  function haze(y0, y1, col, a0, a1) { c.fillStyle = LG(0, y0, 0, y1, [[0, rgba(col, a0)], [1, rgba(col, a1)]]); c.fillRect(0, y0, W, y1 - y0); }
  // mountain ridge via columns; returns heights
  function ridge(base, amp, scale, col, o) {
    o = o || {}; var hts = [], off = o.off || rf(0, 100);
    for (var x = 0; x < W; x++) {
      var y = base - amp * Math.pow(fbm(x / scale + off, o.oct || 5), o.pw || 1.2) + (o.f ? o.f(x) : 0);
      y = Math.round(y); hts.push(y);
      c.fillStyle = col; c.fillRect(x, y, 1, (o.bottom || H) - y);
      if (o.rim) { c.fillStyle = o.rim; c.fillRect(x, y, 1, 1); }
    }
    return hts;
  }
  function speck(x, y, w, h, cols, n) { for (var i = 0; i < n; i++) px(x + rf(0, w), y + rf(0, h), pick(cols)); }
  function reflect(y0, y1, o) {
    o = o || {}; var id = c.getImageData(0, 0, W, H), d = id.data, tn = hx(o.tint || '#204060'), st = o.str == null ? 0.55 : o.str;
    var x0 = o.x0 || 0, x1 = o.x1 == null ? W : o.x1, sc = o.scale || 1, src = o.src == null ? y0 : o.src, wv = o.wave == null ? 1 : o.wave;
    for (var y = y0; y < y1; y++) {
      var k = y - y0, sy = Math.max(0, Math.round(src - 1 - k * sc)), a = st * (1 - (k / (y1 - y0)) * (o.fade == null ? 0.6 : o.fade));
      var wob = Math.round(Math.sin(y * 1.9 + Math.sin(y * 0.37) * 2) * wv * (0.6 + k * 0.05));
      for (var x = x0; x < x1; x++) {
        if (o.mask && !o.mask(x, y)) continue;
        var sx = Math.min(W - 1, Math.max(0, x + wob)), si = (sy * W + sx) * 4, di = (y * W + x) * 4;
        for (var ch = 0; ch < 3; ch++) d[di + ch] = d[di + ch] * (1 - a) + (d[si + ch] * 0.82 + tn[ch] * 0.18) * a;
      }
    }
    c.putImageData(id, 0, 0);
  }
  function ripples(y0, y1, n, col, a, x0, x1) { x0 = x0 || 0; x1 = x1 == null ? W : x1; for (var i = 0; i < n; i++) { var y = ri(y0, y1 - 1), t = (y - y0) / Math.max(1, y1 - y0); R(rf(x0, x1), y, rf(2, 6) * (0.6 + t * 1.6), 1, rgba(col, a)); } }
  function glitter(x, y0, y1, col, spread) { for (var y = y0; y < y1; y++) { var t = (y - y0) / (y1 - y0), w = 2 + t * spread; for (var k = 0; k < 2; k++) if (rnd() < 0.8) R(x + rf(-w, w), y, rf(1, 4 + t * 4), 1, rgba(col, 0.55 + 0.4 * rnd())); } }
  function post(o) {
    o = o || {}; var lv = o.lv || 14, st = 255 / (lv - 1), nz = o.nz == null ? 3 : o.nz, sat = o.sat || 1.12, dt = o.dt == null ? 0.85 : o.dt, ct = o.ct || 1.04;
    var id = c.getImageData(0, 0, W, H), d = id.data;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = (y * W + x) * 4, b = (BAY[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * st * dt, n = (rnd() - 0.5) * nz;
      var r = d[i], g = d[i + 1], bl = d[i + 2], l = r * 0.3 + g * 0.59 + bl * 0.11;
      r = (l + (r - l) * sat - 128) * ct + 128; g = (l + (g - l) * sat - 128) * ct + 128; bl = (l + (bl - l) * sat - 128) * ct + 128;
      d[i] = q(r + n + b); d[i + 1] = q(g + n + b); d[i + 2] = q(bl + n + b); d[i + 3] = 255;
    }
    c.putImageData(id, 0, 0);
    function q(v) { v = Math.round(v / st) * st; return v < 0 ? 0 : v > 255 ? 255 : v; }
  }
  function tree(x, y, r, cols, ld) {
    ld = ld || -1; var i;
    R(x - Math.max(0.5, r * 0.12), y - r * 0.8, Math.max(1, r * 0.25), r * 0.8, cols[3] || '#3b2a1e');
    for (i = 0; i < 6; i++) E(x + rf(-r * 0.55, r * 0.55), y - r * 1.15 + rf(-r * 0.45, r * 0.35), r * rf(0.45, 0.75), r * rf(0.4, 0.62), cols[0]);
    for (i = 0; i < 4; i++) E(x + ld * r * 0.25 + rf(-r * 0.35, r * 0.35), y - r * 1.35 + rf(-r * 0.3, r * 0.15), r * rf(0.3, 0.5), r * rf(0.25, 0.42), cols[1]);
    for (i = 0; i < r * 2.5; i++) px(x + ld * r * 0.3 + rf(-r * 0.5, r * 0.5), y - r * 1.45 + rf(-r * 0.4, r * 0.4), cols[2]);
  }
  function cypress(x, y, h, w, cols, ld) { ld = ld || -1; E(x, y - h / 2, w, h / 2, cols[0]); E(x + ld * w * 0.3, y - h / 2 - 1, w * 0.55, h / 2 - 1.5, cols[1]); for (var i = 0; i < h / 3; i++) px(x + ld * w * 0.4 + rf(-1, 1), y - rf(2, h - 2), cols[2]); }
  function pine(x, y, h, w, cols, ld) { // umbrella pine
    ld = ld || -1; L(x, y, x + rf(-2, 2), y - h * 0.7, cols[3]); L(x + 1, y, x + rf(-2, 2) + 1, y - h * 0.7, cols[3]);
    var ty = y - h * 0.75; E(x, ty, w, h * 0.22, cols[0]); for (var i = 0; i < 5; i++) E(x + rf(-w * 0.7, w * 0.7), ty - rf(0, h * 0.1), w * rf(0.25, 0.4), h * 0.12, cols[1]);
    for (i = 0; i < w; i++) px(x + rf(-w * 0.8, w * 0.8), ty - rf(1, h * 0.18), cols[2]);
  }
  function palm(x, y, h, lean, cols) {
    var tx = x, ty = y, i;
    for (i = 0; i < h; i++) { var t = i / h, xx = x + lean * Math.sin(t * 1.3) * h * 0.22, w = t > 0.7 ? 2 : 3; R(xx - 1, y - i, w, 1, i % 3 === 0 ? cols[1] : cols[0]); px(xx - 1, y - i, cols[1]); tx = xx; ty = y - i; }
    for (var f = 0; f < 11; f++) {
      var ang = -Math.PI * 1.02 + f * (Math.PI * 1.04 / 10) + rf(-0.08, 0.08), len = h * 0.36 * rf(0.85, 1.15);
      for (var s2 = 0; s2 < len; s2++) {
        var u = s2 / len, ax = Math.cos(ang) * s2, ay = Math.sin(ang) * s2 * 0.75 + u * u * len * 0.6;
        px(tx + ax, ty + ay, u < 0.5 ? cols[3] : cols[2]);
        if (s2 > 2) { px(tx + ax, ty + ay + 1, cols[2]); if (s2 % 2 === 0) px(tx + ax + (Math.cos(ang) > 0 ? 1 : -1), ty + ay + 2, u < 0.6 ? cols[3] : cols[2]); }
      }
    }
    E(tx, ty + 1, 2, 1.4, '#5a3a1a'); px(tx - 1, ty, '#8a6a2a');
  }
  function person(x, y, col, skin) { px(x, y - 4, skin || '#e0b090'); R(x - 0.5, y - 3, 2, 2, col); px(x, y - 1, '#2a2a3a'); px(x + 1, y - 1, '#2a2a3a'); }
  function people(n, x0, x1, y0, y1, cols) { for (var i = 0; i < n; i++) person(rf(x0, x1), rf(y0, y1), pick(cols || ['#c03030', '#3050c0', '#f0f0f0', '#e0a020', '#40a050', '#a040a0', '#202020']), pick(['#f0c8a0', '#c89060', '#8a5a3a', '#e8b890'])); }
  function grass(y0, y1, cols, n) { for (var i = 0; i < n; i++) { var x = rf(0, W), y = rf(y0, y1), t = (y - y0) / Math.max(1, y1 - y0), h = 1 + t * 3; R(x, y - h, 1, h, pick(cols)); } }
  var FONT = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '111101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', Y: '101101010010010', G: '011100101101011', '$': '011110010011110', '*': '000101010101000' };
  FONT.N = '1001/1101/1011/1001/1001'; FONT.M = '10001/11011/10101/10001/10001';
  function glyph(ch) { var g = FONT[ch]; if (!g) return null; return g.indexOf('/') >= 0 ? g.split('/') : [g.substr(0, 3), g.substr(3, 3), g.substr(6, 3), g.substr(9, 3), g.substr(12, 3)]; }
  function textW(s) { var w = 0; for (var i = 0; i < s.length; i++) { var g = glyph(s.charAt(i)); w += (g ? g[0].length : 3) + 1; } return w - 1; }
  function text(s, x, y, col, sh) { for (var i = 0; i < s.length; i++) { var g = glyph(s.charAt(i)); if (!g) { x += 4; continue; } for (var r = 0; r < 5; r++) for (var q = 0; q < g[r].length; q++) if (g[r].charAt(q) === '1') { if (sh) px(x + q + 1, y + r + 1, sh); px(x + q, y + r, col); } x += g[0].length + 1; } }
  function starShape(x, y, col) { px(x, y - 1, col); R(x - 1, y, 3, 1, col); px(x - 1, y + 1, col); px(x + 1, y + 1, col); }
  function windows(x, y, w, h, cw, ch, gx, gy, fn) { for (var yy = y; yy + ch <= y + h; yy += ch + gy) for (var xx = x; xx + cw <= x + w; xx += cw + gx) { var col = fn(xx, yy); if (col) R(xx, yy, cw, ch, col); } }
  function skyline(o) {
    var x = o.x0 == null ? -2 : o.x0;
    while (x < (o.x1 || W)) {
      var w = ri(o.wMin, o.wMax), h = ri(o.hMin, o.hMax), top = o.y - h;
      if (o.hf) { h = Math.round(h * o.hf(x)); top = o.y - h; }
      R(x, top, w, h, o.col);
      if (o.mansard) { R(x, top - 2, w, 2, o.roof); R(x + 1, top - 3, w - 2, 1, o.roof); if (rnd() < 0.6) R(x + ri(1, w - 2), top - 5, 1, 2, o.roof); }
      if (o.lit) R(x + (o.litLeft ? 0 : w - 1), top, 1, h, o.lit);
      if (o.winP) for (var yy = top + 2; yy < o.y - 1; yy += 2) for (var xx = x + 1; xx < x + w - 1; xx += 2) if (rnd() < o.winP) px(xx, yy, o.win);
      if (o.spire && rnd() < o.spire) R(x + Math.floor(w / 2), top - ri(3, 7), 1, 7, o.col);
      x += w + (o.gap ? ri(0, o.gap) : 0);
    }
  }

  /* ================= LANDMARKS ================= */
  var LM = {};

  LM.paris = function () {
    sky([[0, '#1b2456'], [0.28, '#3c4788'], [0.52, '#9a6290'], [0.72, '#e8946a'], [0.9, '#ffcf80'], [1, '#ffe3a2']], 118);
    stars(28, 34);
    sun(206, 107, 7, '#fff8d8', '#ffb060', 90);
    for (var i = 0; i < 12; i++) { var y = rf(18, 100), x = rf(-30, 225), w = rf(24, 80), t = (y - 18) / 82; strato(x, y, w, rf(1.4, 3), mix('#3d3672', '#a8607a', t), mix('#7a5290', '#e8987a', t), mix('#c27a9a', '#ffe0a8', t)); }
    birds(7, 20, 110, 28, 62, '#2a1e3a');
    // far city
    skyline({ y: 117, hMin: 5, hMax: 12, wMin: 6, wMax: 14, col: '#8a6890', roof: '#78588a', win: '#ffe0a0', winP: 0.05, mansard: true });
    R(24, 93, 7, 24, '#76587f'); R(24, 93, 7, 1, '#e8a078'); for (i = 0; i < 10; i++) px(25 + ri(0, 5), 95 + ri(0, 20), '#ffd890');
    E(212, 104, 7, 4, '#86668e'); R(205, 104, 14, 13, '#86668e'); R(211, 97, 2, 4, '#86668e'); // dome (Invalides-ish)
    haze(92, 120, '#f0a888', 0, 0.45);
    skyline({ y: 121, hMin: 4, hMax: 9, wMin: 7, wMax: 15, col: '#5e4468', roof: '#4c3858', win: '#ffd070', winP: 0.12, mansard: true, lit: '#b07070' });
    // ground: Champ de Mars
    R(0, 119, W, 28, LG(0, 119, 0, 147, [[0, '#3e5a34'], [1, '#2a4a24']]));
    var cx = 120;
    P([cx - 22, 121, cx + 22, 121, cx + 80, 147, cx - 80, 147], LG(0, 121, 0, 147, [[0, '#6f8a3e'], [1, '#55782e']]));
    for (y = 123; y < 147; y += 4) { var t2 = (y - 121) / 26; R(cx - 22 - 58 * t2, y, 116 * t2 + 44, 1, rgba('#9ab858', 0.35)); }
    P([cx - 22, 121, cx - 27, 121, cx - 105, 147, cx - 80, 147], '#c9a678'); P([cx + 22, 121, cx + 27, 121, cx + 105, 147, cx + 80, 147], '#d8b488');
    speck(0, 121, W, 26, ['#b89668', '#e8c898'], 160);
    // tree rows in perspective
    for (var s = 0; s < 1; s += 0.08) {
      var yy = 120 + s * s * 30, r = 3 + s * s * 9;
      tree(cx - 32 - s * s * 110, yy, r, ['#2a4428', '#4e6e34', '#e8a050'], 1);
      tree(cx + 32 + s * s * 110, yy, r, ['#2a4428', '#5a7a38', '#ffc070'], 1);
    }
    eiffel(cx, 6, 124);
    people(26, cx - 70, cx + 70, 126, 147);
    // lamp posts
    for (i = 0; i < 4; i++) { var lx = [52, 76, 164, 188][i], ly = [140, 130, 130, 140][i], lh = [14, 9, 9, 14][i]; R(lx, ly - lh, 1, lh, '#1e1a22'); E(lx + 0.5, ly - lh - 1, 1.5, 1.5, '#ffe7a0'); c.fillStyle = RG(lx, ly - lh, 0, 6, [[0, 'rgba(255,220,140,0.5)'], [1, 'rgba(255,220,140,0)']]); c.fillRect(lx - 6, ly - lh - 6, 12, 12); }
    // flower beds
    for (i = 0; i < 60; i++) px(rf(0, 40), rf(134, 147), pick(['#e04060', '#ffd040', '#ffffff', '#c050c0']));
    for (i = 0; i < 60; i++) px(rf(200, 240), rf(134, 147), pick(['#e04060', '#ffd040', '#ffffff', '#c050c0']));
    post({ lv: 14 });
  };
  function eiffel(cx, T, B) {
    var yp1 = Math.round(T + 0.8 * (B - T)), yp2 = Math.round(T + 0.6 * (B - T)), yp3 = T + 12;
    function hwf(y) { var t = (y - T) / (B - T); return 1.0 + 45 * Math.pow(t, 2.45); }
    var archTop = yp1 + 5, inBase = hwf(B) - 11;
    var dark = '#2e1c1e', base = '#5a3428', mid = '#965436', lit = '#e5945e', hl = '#ffc488';
    for (var y = T; y <= B; y++) {
      var hw = hwf(y), inner = -1;
      if (y > archTop) { var q = (B - y) / (B - archTop); inner = inBase * Math.sqrt(Math.max(0, 1 - q * q)); }
      else if (y > yp1 + 2) inner = -1;
      else if (y > yp2 + 2) inner = hw * 0.42 * (y - yp2) / (yp1 - yp2);
      var per = y > yp1 ? 4 : (y > yp2 ? 3 : 2);
      for (var x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
        var dx = Math.abs(x + 0.5 - cx); if (dx > hw) continue; if (inner >= 0 && dx < inner) continue;
        var edge = dx > hw - 1.3 || (inner >= 0 && dx < inner + 1.3);
        var band = (y > yp2 && (y - yp2) % 8 === 0) || (y <= yp2 && (y - T) % 6 === 0);
        var on = edge || band || ((x + y) % per === 0) || ((x - y + 400) % per === 0) || (hw < 3.2);
        if (!on) continue;
        var f = (x + 0.5 - cx) / Math.max(hw, 1), col;
        if (f > 0.25) col = edge ? (dx > hw - 1.3 ? hl : lit) : mid; else if (f < -0.35) col = edge ? base : dark; else col = edge ? mid : base;
        px(x, y, col);
      }
    }
    // platforms
    function plat(y, hw, h) { R(cx - hw, y, hw * 2, h, base); R(cx, y, hw, h, mid); R(cx - hw, y, hw * 2, 1, hl); R(cx - hw, y + h, hw * 2, 1, dark); for (var x = cx - hw + 1; x < cx + hw; x += 2) px(x, y + 1, '#ffe2a0'); }
    plat(yp1 - 1, hwf(yp1) + 3, 4); plat(yp2 - 1, hwf(yp2) + 2, 3);
    R(cx - 2, yp3 - 4, 4, 5, base); R(cx, yp3 - 4, 2, 5, lit); px(cx - 1, yp3 - 2, '#ffe2a0'); px(cx + 1, yp3 - 2, '#ffe2a0');
    R(cx - 3, yp3, 6, 1, hl);
    R(cx - 0.5, T - 5, 1, 6, mid); px(cx - 0.5, T - 6, '#ff5050');
    // arch rim highlight
    for (var k = 0; k <= 40; k++) { var a = k / 40 * Math.PI, ax = cx - Math.cos(a) * inBase, ay = B - Math.sin(a) * (B - archTop); px(ax, ay, k > 20 ? lit : base); }
  }

  LM.tokyo = function () {
    sky([[0, '#2a64c0'], [0.45, '#78b2ea'], [0.8, '#cfe4f4'], [1, '#f6e6de']], 104);
    sun(30, 18, 5, '#ffffff', '#fff2c8', 55);
    var i;
    for (i = 0; i < 4; i++) cumulus(rf(0, 220), rf(70, 92), rf(18, 40), rf(5, 9), ['#b8c8e0', '#e6eef8', '#ffffff', '#ffffff'], -1);
    for (i = 0; i < 6; i++) strato(rf(-20, 220), rf(10, 40), rf(30, 60), 1.2, rgba('#ffffff', 0.25), rgba('#ffffff', 0.35), rgba('#ffffff', 0.45));
    // Fuji
    var fx = 152, fy = 26, gl = LG(0, fy, 0, 108, [[0, '#4e5e9c'], [0.5, '#5f72ae'], [1, '#8aa0c8']]), gr = LG(0, fy, 0, 108, [[0, '#3a4682'], [0.5, '#4a5a96'], [1, '#7488b8']]);
    for (var x = 0; x < W; x++) {
      var d = Math.max(0, Math.abs(x + 0.5 - fx) - 6), top = Math.round(fy + 1.3 * Math.pow(d, 0.86) + (d < 1 ? (fbm(x * 0.7) > 0.55 ? 1 : 0) : fbm(x * 0.2) * 2));
      if (top > 108) continue;
      c.fillStyle = x < fx ? gl : gr; c.fillRect(x, top, 1, 108 - top);
      var gully = Math.pow(Math.max(0, Math.sin(x * 0.42 + fbm(x * 0.3) * 6)), 6) * 13 * (fbm(x * 0.17 + 5) > 0.48 ? 1 : 0.25) * Math.max(0, 1 - Math.abs(x - fx) / 70);
      var sb = fy + 22 + 9 * fbm(x * 0.13 + 3) + gully;
      if (sb > top) {
        R(x, top, 1, sb - top, x < fx ? '#ffffff' : '#c6d2f0');
        if (x < fx) R(x, top, 1, Math.min(3, sb - top), '#ffffff'); else R(x, sb - 2, 1, 2, '#aebde4');
        if (gully > 6) for (var yy = sb; yy < sb + gully * 0.6; yy += 2) px(x, yy, x < fx ? '#dfe8ff' : '#a8b6e0');
      }
    }
    haze(80, 108, '#d0e0f0', 0, 0.5);
    // forest hills
    ridge(104, 12, 22, '#3f6a5a', { off: 3, bottom: 112, rim: '#6a9a7a' });
    ridge(108, 8, 14, '#2e5a3a', { off: 9, bottom: 114, rim: '#5e8e4a' });
    for (i = 0; i < 40; i++) { x = rf(110, 240); R(x, 106 + rf(0, 3), 2, 1, pick(['#ffffff', '#e8e0d0', '#c03030'])); }
    // lake
    R(0, 112, W, 16, LG(0, 112, 0, 128, [[0, '#7aa6d0'], [1, '#3a6a9a']]));
    reflect(112, 128, { str: 0.6, tint: '#3a6ea0', src: 112, wave: 1 });
    ripples(112, 128, 50, '#ffffff', 0.35);
    // left hill with pagoda
    var hill = []; hill = hill.concat([0, 147, 0, 72]); bez(0, 72, 50, 82, 120, 128, 16, hill); hill.push(120, 147);
    P(hill, LG(0, 70, 0, 147, [[0, '#4e7a3a'], [1, '#26401e']]));
    for (i = 0; i < 14; i++) tree(rf(0, 100), rf(84, 130), rf(3, 6), ['#244a26', '#3e6e34', '#7aa04a']);
    pagoda(56, 98);
    // cherry blossoms
    var pk = ['#c8607e', '#f2a6bc', '#ffd6e2', '#fff0f4'];
    function blossom(bx, by, r) { R(bx - 0.5, by, 2, r * 1.2, '#4a2a2a'); L(bx, by + 2, bx - r * 0.6, by - r * 0.2, '#4a2a2a'); L(bx, by + 2, bx + r * 0.6, by - r * 0.3, '#4a2a2a'); for (var k = 0; k < 7; k++) E(bx + rf(-r, r), by - rf(0, r * 0.7), r * rf(0.35, 0.6), r * rf(0.3, 0.45), pk[0]); for (k = 0; k < 6; k++) E(bx + rf(-r * 0.9, r * 0.6), by - rf(r * 0.2, r * 0.8), r * rf(0.25, 0.45), r * rf(0.2, 0.35), pk[1]); for (k = 0; k < r * 4; k++) px(bx + rf(-r, r * 0.6), by - rf(r * 0.3, r), pick([pk[2], pk[3]])); }
    blossom(28, 96, 10); blossom(84, 110, 9); blossom(10, 126, 12); blossom(100, 132, 9);
    // branch from top-left
    L(0, 4, 40, 14, '#3a2222'); L(0, 5, 40, 15, '#3a2222'); L(22, 9, 34, 2, '#3a2222'); L(36, 13, 58, 18, '#3a2222');
    for (i = 0; i < 26; i++) { var t = rnd(), bx2 = t * 58, by2 = 5 + t * 12 + rf(-5, 5); E(bx2, by2, rf(2, 4), rf(1.5, 3), pick([pk[0], pk[1], pk[1], pk[2]])); }
    for (i = 0; i < 40; i++) px(rf(0, 160), rf(10, 140), pick([pk[1], pk[2]]));
    // shore and torii
    P([120, 128, 240, 124, 240, 147, 110, 147], LG(0, 124, 0, 147, [[0, '#7a9a4a'], [1, '#4a6a2e']]));
    R(120, 127, 120, 1, '#c8c0a8');
    grass(128, 147, ['#5a8a3a', '#8aba5a', '#3a6a2a'], 160);
    torii(205, 128, 34, 30);
    for (i = 0; i < 2; i++) { var lx = [150, 178][i]; R(lx, 126, 3, 2, '#9a968a'); R(lx - 1, 122, 5, 1, '#8a8678'); R(lx, 123, 3, 3, '#b8b4a6'); px(lx + 1, 124, '#ffd070'); R(lx - 1, 121, 5, 1, '#6a665a'); }
    people(3, 140, 190, 134, 144);
    post({ lv: 14 });
  };
  function pagoda(cx, base) {
    var red = '#c8382a', rsh = '#7e2018', roof = '#3a3236', rl = '#6a6066', y = base, w = 16;
    R(cx - 11, base - 3, 22, 3, '#8a8478'); R(cx - 11, base - 3, 22, 1, '#b8b2a4');
    y = base - 3;
    for (var t = 0; t < 5; t++) {
      var bh = 6 - t * 0.4; R(cx - w / 2, y - bh, w, bh, red); R(cx + w / 2 - w * 0.3, y - bh, w * 0.3, bh, rsh); R(cx - w / 2, y - bh, 1, bh, '#ff7a5a');
      for (var k = cx - w / 2 + 2; k < cx + w / 2 - 1; k += 3) R(k, y - bh + 1, 1, bh - 2, '#5a1a14');
      var ew = w / 2 + 6 - t * 0.6, ry = y - bh;
      P([cx - ew, ry, cx - ew + 2, ry - 3, cx + ew - 2, ry - 3, cx + ew, ry, cx + ew - 3, ry + 0.5, cx - ew + 3, ry + 0.5], roof);
      R(cx - ew + 2, ry - 3, ew * 2 - 4, 1, rl); px(cx - ew, ry - 1, rl); px(cx + ew - 1, ry - 1, rl);
      y = ry - 3; w *= 0.84;
    }
    R(cx - 0.5, y - 12, 1.5, 12, '#b89040'); for (k = 0; k < 5; k++) R(cx - 1.5, y - 2 - k * 2, 3, 1, '#d8b050');
  }
  function torii(cx, base, w, h) {
    var red = '#d83a24', rsh = '#8a2016', blk = '#221a1e', top = base - h;
    R(cx - w / 2 + 3, top + 4, 3, h - 4, red); R(cx - w / 2 + 5, top + 4, 1, h - 4, rsh); R(cx + w / 2 - 6, top + 4, 3, h - 4, red); R(cx + w / 2 - 4, top + 4, 1, h - 4, rsh);
    R(cx - w / 2 + 2, base - 2, 5, 2, blk); R(cx + w / 2 - 7, base - 2, 5, 2, blk);
    R(cx - w / 2 + 1, top + 9, w - 2, 2, red); R(cx - w / 2 + 1, top + 10, w - 2, 1, rsh); // nuki
    R(cx - w / 2, top + 3, w, 2, red); R(cx - w / 2, top + 4, w, 1, rsh);
    P([cx - w / 2 - 4, top - 1, cx - w / 2 - 1, top + 1, cx + w / 2 + 1, top + 1, cx + w / 2 + 4, top - 1, cx + w / 2 + 3, top + 2, cx - w / 2 - 3, top + 2], blk);
    R(cx - 1, top + 2, 2, 8, red); R(cx - 2, top + 5, 4, 3, '#2a1a10'); px(cx - 1, top + 6, '#e0c060');
    // reflection in lake behind? torii stands on shore: shadow
    R(cx - w / 2, base, w, 1, rgba('#203010', 0.4));
  }

  LM.cairo = function () {
    sky([[0, '#2a6cc0'], [0.5, '#7ab4e4'], [0.85, '#e6dcc0'], [1, '#f4dcaa']], 104);
    sun(44, 20, 6, '#ffffff', '#fff4d0', 70);
    var i;
    for (i = 0; i < 5; i++) strato(rf(60, 230), rf(14, 50), rf(30, 70), 1.3, rgba('#ffffff', 0.3), rgba('#ffffff', 0.4), rgba('#ffffff', 0.5));
    // horizon city haze
    skyline({ y: 102, hMin: 2, hMax: 6, wMin: 4, wMax: 9, col: '#c8b8a8', x0: 0, x1: 240, spire: 0.1 });
    haze(90, 104, '#f0e0c0', 0, 0.6);
    R(0, 101, W, 46, LG(0, 101, 0, 147, [[0, '#e6c48a'], [0.4, '#dcae6e'], [1, '#c48a4a']]));
    pyramid(26, 70, 4, 52, 32, 104, 0.6);
    pyramid(84, 30, 28, 140, 96, 104, 0.35, true);
    pyramid(160, 22, 92, 232, 172, 106, 0);
    // dunes & ripples
    for (var y = 108; y < 147; y += 2) { var t = (y - 108) / 39; for (var k = 0; k < 6; k++) { var x0 = rf(-20, 240); L(x0, y, x0 + rf(10, 30) * (1 + t), y + rf(-1, 1), rgba('#a8723a', 0.35 + t * 0.2)); } }
    P([0, 128, 60, 120, 120, 126, 180, 118, 240, 124, 240, 147, 0, 147], LG(0, 118, 0, 147, [[0, '#e8bc78'], [1, '#c88a48']]));
    for (y = 124; y < 147; y += 2) for (k = 0; k < 8; k++) { x0 = rf(0, 240); R(x0, y, rf(4, 12), 1, rgba(k % 2 ? '#fff0c8' : '#9a6a34', 0.35)); }
    sphinx(30, 124);
    // camels
    camel(170, 132, 1, '#6a4a2e'); camel(186, 134, 1, '#7a5634'); camel(204, 133, 1, '#5e3e26');
    for (i = 0; i < 3; i++) R([166, 182, 200][i], [133, 135, 134][i], 14, 1, rgba('#6a4020', 0.5));
    people(9, 132, 165, 112, 124); people(5, 0, 22, 112, 126);
    birds(4, 120, 200, 30, 50, '#3a3040');
    post({ lv: 14 });
  };
  function pyramid(ax, ay, lx, rx, cxp, by, hz, cap) {
    var cy = by + 2, litC = mix('#eac080', '#e8dcc8', hz), shC = mix('#a06c40', '#c8b8a4', hz), ln = mix('#b88850', '#d4c4ac', hz), ls = mix('#7a4e2c', '#b4a490', hz);
    P([ax, ay, lx, by, cxp, cy], litC); P([ax, ay, cxp, cy, rx, by], shC);
    for (var y = Math.ceil(ay) + 2; y < cy; y += 2) {
      var t = (y - ay) / (by - ay), xl = ax + (lx - ax) * t, xc = ax + (cxp - ax) * ((y - ay) / (cy - ay)), xr = ax + (rx - ax) * t;
      R(xl, y, xc - xl, 1, ln); R(xc, y, xr - xc, 1, ls);
      if (hz < 0.5 && rnd() < 0.7) { px(xl + rf(0, xc - xl), y - 1, lt(litC, 0.25)); px(xc + rf(0, xr - xc), y + 1, lt(shC, -0.2)); }
      // ragged silhouette steps
      if (y % 4 === 0) { px(xl - 1, y, ln); px(xr, y, ls); }
    }
    L(ax, ay, cxp, cy, lt(litC, 0.35));
    if (cap) { var ch = (by - ay) * 0.18; P([ax, ay, ax + (lx - ax) * 0.18, ay + ch, ax + (cxp - ax) * 0.18, ay + ch * 1.0], '#f4e2c0'); P([ax, ay, ax + (cxp - ax) * 0.18, ay + ch, ax + (rx - ax) * 0.18, ay + ch], '#c8a888'); }
  }
  function sphinx(x, y) {
    var k = 1.5, s = '#c89058', sd = '#7a4e2c', sl = '#f0c27e', dk = '#4a2c16';
    function Q(a) { var o = []; for (var i = 0; i < a.length; i += 2) o.push(x + a[i] * k, y + a[i + 1] * k); return o; }
    function RR(a, b, w, h, col) { R(x + a * k, y + b * k, w * k, h * k, col); }
    E(x + 30 * k, y + 1, 40 * k, 3, rgba('#6a3a14', 0.45));
    P(Q([-6, 2, -4, -8, 4, -12, 40, -13, 52, -10, 54, 2]), sd);
    var bp = [0, 0]; bez(0, -12, 6, -17, 14, -15, 6, bp); bez(14, -15, 30, -13, 40, -15, 6, bp); bp.push(46, -12, 48, 0);
    P(Q(bp), s); E(x + 6 * k, y - 8 * k, 6 * k, 6 * k, s); E(x + 5 * k, y - 10 * k, 4 * k, 3.5 * k, sl);
    RR(2, -12, 44, 1, sl); for (var j = 0; j < 7; j++) RR(4, -10 + j * 1.5, 40, 0.7, rgba('#7a4a20', 0.5));
    RR(10, -15, 26, 1.2, sl);
    RR(44, -4, 22, 4, s); RR(44, -4, 22, 1, sl); RR(44, -1, 22, 1, sd); RR(64, -3, 2, 3, sd);
    P(Q([38, -10, 40, -22, 44, -31, 52, -31, 56, -22, 58, -10]), s); P(Q([38, -10, 40, -22, 44, -23, 44, -10]), sd);
    for (j = 0; j < 6; j++) RR(41, -28 + j * 2.5, 15, 0.8, rgba('#6a3a18', 0.7));
    P(Q([49, -29, 56, -28, 57, -18, 52, -15, 49, -18]), sl);
    RR(52.5, -25.5, 2.5, 1, dk); RR(55, -22, 2, 2, sd); RR(53, -18.5, 3, 0.8, dk); RR(48, -28, 1, 12, sd);
    RR(40, -14, 3, 12, sd); RR(56, -14, 1, 13, sd);
  }
  function camel(x, y, s, col) {
    var lc = lt(col, 0.2);
    E(x, y - 8, 5, 2.5, col); E(x - 1, y - 10, 2.5, 2, col); R(x + 4, y - 12, 1.5, 5, col); R(x + 4, y - 13, 3, 1.5, col);
    for (var i = 0; i < 4; i++) R(x - 4 + i * 2.6, y - 6, 1, 6, col);
    R(x - 2, y - 14, 2, 3, '#e8e0d0'); px(x - 1, y - 15, '#c8a080'); R(x - 5, y - 9, 10, 1, '#b03030'); px(x - 2, y - 11, lc);
  }

  LM.rio = function () {
    sky([[0, '#1e78d0'], [0.55, '#6cbcee'], [0.85, '#c8ecf6'], [1, '#e8f6f4']], 96);
    sun(210, 18, 6, '#ffffff', '#fffad8', 60);
    var i;
    cumulus(4, 40, 46, 14, ['#a8bcd4', '#dce8f4', '#ffffff', '#ffffff'], 1); cumulus(96, 28, 30, 9, ['#a8bcd4', '#dce8f4', '#ffffff', '#ffffff'], 1); cumulus(130, 82, 60, 10, ['#a8bcd4', '#dce8f4', '#ffffff', '#ffffff'], 1);
    for (i = 0; i < 4; i++) strato(rf(100, 230), rf(10, 30), rf(20, 50), 1.2, rgba('#ffffff', 0.3), rgba('#ffffff', 0.4), rgba('#ffffff', 0.5));
    // far mountains across bay
    ridge(94, 10, 18, '#7a9cbc', { off: 5, bottom: 96, pw: 1.5 });
    // Sugarloaf + Urca
    var sl = LG(160, 0, 230, 0, [[0, '#9aa08a'], [0.5, '#7a7c70'], [1, '#4e5248']]);
    prof(204, 98, 50, function (u) { return 17 * Math.pow(Math.max(0, 1 - u * u), 0.55) + (u < 0.3 ? (0.3 - u) * 30 : 0); }, sl);
    prof(170, 98, 22, function (u) { return 14 * Math.pow(Math.max(0, 1 - u * u), 0.6) + (u < 0.3 ? (0.3 - u) * 20 : 0); }, '#5e6e52');
    for (i = 0; i < 70; i++) { var a = rnd(), xx = 204 + rf(-22, 22) * (0.5 + a * 0.5), yy = 98 - a * 22; px(xx, yy, pick(['#3e6a34', '#2e5a2a', '#5a8a3e'])); }
    for (i = 0; i < 40; i++) px(170 + rf(-16, 16), rf(80, 98), pick(['#3e6a34', '#2e5a2a', '#5a8a3e']));
    for (i = 0; i < 12; i++) L(196 + rf(-10, 6), 52 + rf(0, 30), 196 + rf(-10, 6), 60 + rf(0, 30), rgba('#ffffff', 0.18));
    L(170, 76, 204, 48, '#3a3a3a'); R(186, 61, 3, 2, '#e04030');
    // Corcovado
    var cg = LG(0, 0, 120, 0, [[0, '#3a7a3a'], [0.45, '#2e6a30'], [0.7, '#2a5228'], [1, '#1e3e22']]);
    var corc = [0, 70, 30, 64, 52, 50, 60, 44, 66, 44, 72, 52, 80, 62, 92, 78, 110, 92, 130, 100, 130, 120, 0, 120];
    P(corc, cg);
    P([60, 44, 66, 44, 72, 52, 80, 62, 76, 70, 68, 60, 62, 52], '#7a786a'); P([66, 44, 72, 52, 80, 62, 78, 64, 70, 54], '#5a5a50');
    clipTo(corc, function () {
    for (i = 0; i < 700; i++) { var tx = rf(0, 128), ty = rf(46, 118); if (ty > 46 + Math.abs(tx - 63) * 0.62 && !(tx > 60 && tx < 80 && ty < 66)) { var cc = tx < 63 ? ['#5aa848', '#3e8a3a', '#78c058', '#2e6a30'] : ['#2e6a30', '#1e4a22', '#3e7a34', '#4e8a3e']; if (rnd() < 0.5) E(tx, ty, rf(1, 2.2), rf(0.8, 1.6), pick(cc)); else px(tx, ty, pick(cc)); } }
    for (i = 0; i < 10; i++) { var gx2 = rf(84, 120), gy2 = rf(72, 100); P([gx2, gy2, gx2 + rf(3, 6), gy2 + rf(2, 5), gx2 + rf(-1, 2), gy2 + rf(6, 10)], pick(['#6a6a60', '#5a5a52'])); }
    });
    christ(63, 18, 1);
    // bay
    R(0, 98, W, 30, LG(0, 98, 0, 128, [[0, '#4a9ac8'], [1, '#1e6aa0']]));
    reflect(98, 116, { str: 0.45, tint: '#2a7ab0', src: 98, x0: 130 });
    ripples(98, 128, 80, '#ffffff', 0.4);
    for (i = 0; i < 4; i++) { var bx = [140, 158, 112, 226][i], by = [108, 116, 104, 112][i]; R(bx, by, 5, 1.5, '#ffffff'); px(bx + 2, by - 3, '#ffffff'); R(bx + 2, by - 2, 2, 2, '#f0f0f0'); R(bx - 6, by + 1, 6, 1, rgba('#ffffff', 0.5)); }
    // city strip
    for (i = 0; i < 26; i++) { var bw = ri(4, 8), bh = ri(6, 16), x0 = i * 5 - 4; R(x0, 118 - bh, bw, bh, pick(['#f0ece0', '#e0d8c8', '#d8e0e8', '#f4e8d0'])); R(x0 + bw - 1, 118 - bh, 1, bh, '#a8a8a8'); for (var yy2 = 120 - bh; yy2 < 116; yy2 += 2) for (var xw = x0 + 1; xw < x0 + bw - 1; xw += 2) px(xw, yy2, '#6a8aa8'); }
    // beach + waves
    R(0, 128, W, 6, '#6ec4d8'); for (i = 0; i < 30; i++) R(rf(0, 240), rf(127, 133), rf(4, 14), 1, '#ffffff');
    P([0, 133, 240, 131, 240, 147, 0, 147], LG(0, 131, 0, 147, [[0, '#f8e2b0'], [1, '#e2bc80']]));
    // Copacabana wave pattern sidewalk
    R(0, 141, W, 6, '#f0ece4'); for (var x = 0; x < W; x++) { var wy = 143 + Math.round(Math.sin(x * 0.35) * 1.5); px(x, wy, '#2a2a2a'); px(x, wy + 1, '#2a2a2a'); }
    people(18, 0, 240, 134, 140, ['#ff4060', '#ffd030', '#30c0e0', '#f07020', '#40c060']);
    for (i = 0; i < 5; i++) { var ux = rf(10, 230); E(ux, 133, 4, 1.5, pick(['#ff5050', '#ffd040', '#40a0ff'])); R(ux, 133, 1, 4, '#5a4a3a'); }
    palm(10, 146, 40, 1, ['#7a5a3a', '#a07a50', '#2e6a2a', '#5aa040']); palm(224, 146, 44, -1, ['#7a5a3a', '#a07a50', '#2e6a2a', '#5aa040']); palm(196, 146, 30, 1, ['#7a5a3a', '#a07a50', '#2e6a2a', '#5aa040']);
    birds(5, 90, 180, 30, 56, '#2a3a4a');
    post({ lv: 14 });
  };
  function christ(cx, top, s) {
    var w = '#f4f2ea', sh = '#a8b0c0', md = '#d4d6d8';
    R(cx - 3, top + 25, 6, 4, '#c8c4b8'); R(cx + 1, top + 25, 2, 4, '#8a8a86'); R(cx - 4, top + 28, 8, 2, '#a8a49a');
    P([cx - 2.5, top + 6, cx + 2.5, top + 6, cx + 3.5, top + 25, cx - 3.5, top + 25], w);
    P([cx + 0.5, top + 6, cx + 2.5, top + 6, cx + 3.5, top + 25, cx + 0.5, top + 25], sh);
    R(cx - 0.5, top + 12, 1, 13, md);
    P([cx - 13, top + 6, cx + 13, top + 6, cx + 13, top + 8, cx + 3, top + 10, cx - 3, top + 10, cx - 13, top + 8], w);
    P([cx, top + 8, cx + 13, top + 7.5, cx + 13, top + 8, cx + 3, top + 10, cx, top + 10], sh);
    R(cx - 13, top + 6, 26, 1, '#ffffff'); px(cx - 14, top + 7, md); px(cx + 13, top + 7, sh);
    E(cx, top + 3.5, 1.8, 2.3, w); px(cx + 1, top + 4, sh);
  }

  LM.mumbai = function () {
    sky([[0, '#5e8ccc'], [0.45, '#a8b8dc'], [0.75, '#f0c4bc'], [1, '#ffe2c0']], 92);
    sun(30, 76, 7, '#fff6e0', '#ffc8a0', 70);
    var i, cx = 120;
    for (i = 0; i < 8; i++) strato(rf(-20, 230), rf(10, 70), rf(30, 70), rf(1.2, 2.4), rgba('#b8a0c8', 0.6), rgba('#f0c0c0', 0.6), rgba('#ffe8d8', 0.7));
    birds(6, 150, 230, 20, 50, '#4a3a5a');
    // side red sandstone buildings
    for (var sd = -1; sd <= 1; sd += 2) {
      var bx = cx + sd * 98; R(bx - 22, 70, 44, 22, '#a8503e'); R(bx - 22, 70, 44, 1, '#d88a6a');
      for (var k = -16; k <= 16; k += 8) { P([bx + k - 2, 90, bx + k - 2, 78, bx + k, 75, bx + k + 2, 78, bx + k + 2, 90], '#5a2420'); }
      prof(bx, 70, 12, function (u) { return 8 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.3) / 0.7, 2))) * (u > 0.85 ? (1 - u) / 0.15 : 1); }, LG(bx - 8, 0, bx + 8, 0, [[0, '#ffffff'], [1, '#c8c0d0']]));
      R(bx - 0.5, 56, 1, 3, '#d0a040');
    }
    // plinth
    R(cx - 72, 84, 144, 8, LG(0, 84, 0, 92, [[0, '#f6ecea'], [1, '#c8c0cc']])); R(cx - 72, 84, 144, 1, '#ffffff');
    for (k = cx - 70; k < cx + 70; k += 6) P([k, 92, k, 87, k + 2, 86, k + 4, 87, k + 4, 92], '#b0a6b8');
    // minarets
    var mf = function (u) { return 2.6 - u * 0.8; };
    [cx - 64, cx - 50, cx + 50, cx + 64].forEach(function (mx, j) {
      var tp = j === 0 || j === 3 ? 28 : 34, hgt = 86 - tp;
      prof(mx, 86, hgt, mf, LG(mx - 3, 0, mx + 3, 0, [[0, '#ffffff'], [0.5, '#f0e8ec'], [1, '#b8b0c8']]));
      for (var b = 0; b < 3; b++) { var by = 86 - hgt * (0.3 + b * 0.3); R(mx - 3.5, by, 7, 1.5, '#e8e0e8'); R(mx - 3.5, by + 1.5, 7, 0.8, '#9a90a8'); }
      R(mx - 3, tp - 1, 6, 2, '#f4eef0'); prof(mx, tp - 1, 5, function (u) { return 3 * Math.sqrt(Math.max(0, 1 - u * u)); }, '#f8f4f4'); R(mx - 0.5, tp - 8, 1, 3, '#d0a040');
    });
    // main building
    var mg = LG(cx - 34, 0, cx + 34, 0, [[0, '#ffffff'], [0.45, '#f8eeee'], [0.7, '#e4dae4'], [1, '#b8aec8']]);
    R(cx - 34, 52, 68, 33, mg);
    // chamfer edges darker
    R(cx - 34, 52, 6, 33, '#f0e4ea'); R(cx + 28, 52, 6, 33, '#a8a0bc');
    // central iwan
    function iwan(x, y, w, h, deep) { P([x - w, y + h, x - w, y + w * 0.9, x, y, x + w, y + w * 0.9, x + w, y + h], '#d8ccd8'); P([x - w + 2, y + h, x - w + 2, y + w * 0.9 + 1, x, y + 2.5, x + w - 2, y + w * 0.9 + 1, x + w - 2, y + h], deep); }
    R(cx - 12, 52, 24, 33, '#fbf6f6'); R(cx - 12, 52, 24, 1, '#ffffff'); R(cx - 13, 52, 1, 33, '#cfc4d4'); R(cx + 12, 52, 1, 33, '#a8a0b8');
    iwan(cx, 56, 8, 29, '#5a5878'); P([cx - 4, 85, cx - 4, 72, cx, 68, cx + 4, 72, cx + 4, 85], '#3a3a58'); R(cx - 1, 76, 2, 9, '#a08868');
    for (k = 0; k < 2; k++) for (var s2 = -1; s2 <= 1; s2 += 2) { iwan(cx + s2 * 21, 55 + k * 15, 4.5, 12, s2 < 0 ? '#7a7898' : '#5a5878'); }
    R(cx - 34, 54, 68, 1, '#d8cede'); for (k = cx - 11; k < cx + 11; k += 2) px(k, 54, '#6a6080');
    // chhatris
    [cx - 26, cx + 26].forEach(function (hx2) { R(hx2 - 5, 44, 10, 8, '#f4ecf0'); for (var q = -4; q <= 4; q += 3) R(hx2 + q, 46, 1, 6, '#9a90aa'); prof(hx2, 44, 9, function (u) { return 5.5 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.3) / 0.7, 2))) * (u > 0.8 ? (1 - u) / 0.2 : 1); }, LG(hx2 - 6, 0, hx2 + 6, 0, [[0, '#ffffff'], [1, '#bab0c8']])); R(hx2 - 0.5, 32, 1, 3, '#d0a040'); });
    // drum + main dome
    R(cx - 16, 42, 32, 10, LG(cx - 16, 0, cx + 16, 0, [[0, '#ffffff'], [1, '#c0b6cc']])); R(cx - 16, 50, 32, 2, '#e0d6e2');
    prof(cx, 43, 36, function (u) { var u0 = 0.36, w = u < 0.72 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - u0) / 0.62, 2))) : Math.sqrt(1 - Math.pow((0.72 - u0) / 0.62, 2)) * Math.pow((1 - u) / 0.28, 1.5); return 19 * w; }, LG(cx - 20, 0, cx + 20, 0, [[0, '#ffffff'], [0.4, '#fbf4f2'], [0.75, '#e0d4e0'], [1, '#a89ebc']]));
    E(cx - 8, 26, 3, 6, rgba('#ffffff', 0.7));
    R(cx - 0.5, 1, 1.5, 7, '#d8a838'); px(cx, 3, '#fff0a0'); E(cx + 0.2, 5, 1.5, 1, '#d8a838');
    // garden
    R(0, 92, W, 55, LG(0, 92, 0, 147, [[0, '#5a8a48'], [1, '#2e5a28']]));
    P([cx - 9, 92, cx + 9, 92, cx + 44, 147, cx - 44, 147], '#e8d4c0');
    var pool = function (x, y) { var t = (y - 94) / 53; var hw = 5 + t * 30; return y >= 94 && Math.abs(x + 0.5 - cx) < hw; };
    for (var y = 94; y < 147; y++) { var t = (y - 94) / 53, hw = 5 + t * 30; R(cx - hw, y, hw * 2, 1, mix('#7aa8d8', '#3a70a8', t)); }
    reflect(94, 147, { str: 0.75, tint: '#5a88c0', src: 92, scale: 1.3, mask: pool, wave: 0.6, fade: 0.4 });
    for (y = 100; y < 147; y += 7) { R(cx - 0.5, y, 1, 2, '#ffffff'); }
    // cypress rows
    for (var s3 = 0; s3 < 1.0; s3 += 0.1) {
      var yy = 94 + s3 * s3 * 60, hh = 6 + s3 * s3 * 30, off = 14 + s3 * s3 * 60;
      cypress(cx - off, yy, hh, 1.5 + s3 * s3 * 5, ['#1e4228', '#2e6a36', '#6aa050'], -1);
      cypress(cx + off, yy, hh, 1.5 + s3 * s3 * 5, ['#1e4228', '#2a5e32', '#5a9048'], -1);
    }
    for (i = 0; i < 80; i++) px(rf(0, 240), rf(96, 147), pick(['#7ab050', '#3a6a30', '#e8c060', '#ff8080']));
    people(10, 70, 170, 100, 147, ['#e04060', '#f0a020', '#40a0d0', '#ffffff', '#a040c0']);
    post({ lv: 14 });
  };

  LM.sydney = function () {
    sky([[0, '#2c3478'], [0.35, '#7a4a88'], [0.6, '#e06a6a'], [0.82, '#ffa858'], [1, '#ffe090']], 96);
    sun(40, 86, 8, '#fff6d0', '#ffb050', 90);
    var i;
    for (i = 0; i < 12; i++) { var y = rf(10, 84), t = (y - 10) / 74; strato(rf(-20, 230), y, rf(30, 80), rf(1.3, 3), mix('#3e2e6a', '#b85a6a', t), mix('#7a4a80', '#f08a6a', t), mix('#c87a90', '#ffd8a0', t)); }
    // CBD skyline
    for (i = 0; i < 26; i++) { var bw = ri(5, 10), bh = ri(10, 38), bx = 60 + i * 5 + ri(-2, 2); R(bx, 94 - bh, bw, bh, mix('#4a3a6a', '#6a4a7a', rnd())); R(bx, 94 - bh, 1, bh, '#c87a7a'); for (var yy = 96 - bh; yy < 92; yy += 2) for (var xx = bx + 1; xx < bx + bw - 1; xx += 2) if (rnd() < 0.3) px(xx, yy, pick(['#ffd880', '#fff0c0', '#ffb860'])); if (rnd() < 0.2) R(bx + bw / 2, 94 - bh - 5, 1, 5, '#4a3a6a'); }
    R(118, 48, 3, 46, '#4a3a6a'); E(119.5, 56, 4, 2.5, '#5a4a7a'); px(119, 46, '#ff4040'); // tower
    haze(70, 98, '#ff9a70', 0, 0.35);
    // Harbour Bridge
    harbourBridge(-10, 112, 86);
    // water
    R(0, 96, W, 51, LG(0, 96, 0, 147, [[0, '#d88a7a'], [0.3, '#7a5a8a'], [1, '#2a2e5e']]));
    reflect(96, 147, { str: 0.6, tint: '#3a3a6a', src: 96, wave: 1.2, fade: 0.7 });
    glitter(40, 97, 147, '#ffd890', 22);
    ripples(96, 147, 120, '#ffc890', 0.3);
    // opera house podium
    P([126, 106, 240, 102, 240, 116, 120, 116], '#c8a088'); R(120, 115, 120, 2, '#8a6a6a'); P([126, 106, 240, 102, 240, 104, 126, 108], '#e8c0a0');
    for (i = 0; i < 12; i++) R(130 + i * 9, 109, 6, 4, '#4a3048');
    // shells (back to front)
    shell(206, 104, 238, 104, 202, 70, 0.7); shell(190, 104, 226, 104, 186, 58, 0.8);
    shell(172, 105, 212, 105, 167, 48, 1.0); shell(154, 106, 190, 106, 149, 58, 0.95);
    shell(138, 107, 168, 107, 134, 70, 0.9); shell(127, 108, 150, 108, 124, 82, 0.85);
    // ferry
    R(70, 120, 18, 4, '#2e7a3a'); R(72, 117, 14, 3, '#f0d040'); R(74, 116, 10, 1, '#2e7a3a'); for (i = 0; i < 6; i++) px(74 + i * 2, 118, '#3a3a3a'); R(64, 124, 30, 1, rgba('#ffffff', 0.6));
    R(30, 132, 10, 2, '#ffffff'); P([34, 131, 34, 116, 40, 130], '#fff4e0'); P([33, 131, 33, 120, 29, 130], '#f8e0c8'); R(22, 134, 22, 1, rgba('#ffffff', 0.4));
    birds(6, 100, 200, 20, 50, '#2a1e3a');
    post({ lv: 14 });
  };
  function harbourBridge(x0, x1, deck) {
    var mid = (x0 + x1) / 2, half = (x1 - x0) / 2, st = '#3a3450', lit = '#e89870', dk = '#241e34';
    function bot(x) { var q = (x - mid) / half; return deck + 8 - 46 * (1 - q * q); }
    function top(x) { var q = (x - mid) / half; return deck - 12 - 26 * (1 - q * q); }
    for (var x = Math.max(0, x0); x <= x1; x++) {
      var yb = Math.round(bot(x)), yt = Math.round(top(x));
      if (yt > yb) { var tmp = yt; yt = yb; yb = tmp; }
      px(x, yt, lit); px(x, yt + 1, st); px(x, yb, st); px(x, yb - 1, lit);
      if ((x - x0) % 6 === 0) { R(x, yt, 1, yb - yt, st); }
      if ((x - x0) % 6 === 3) { L(x - 3, top(x - 3) + 1, x, bot(x)); }
      if ((x - x0) % 3 === 0 && yb < deck) R(x, yb, 1, deck - yb, dk);
    }
    // diagonals
    for (x = x0; x < x1; x += 6) { L(x, top(x) + 1, x + 6, bot(x + 6) - 1, st); }
    R(Math.max(0, x0), deck, x1 + 14 - Math.max(0, x0), 2, '#2a2440'); R(Math.max(0, x0), deck, x1 + 14 - Math.max(0, x0), 1, '#c87a6a');
    // pylons
    [x1 + 2].forEach(function (pxl) { R(pxl, deck - 16, 12, 22, '#8a6a6a'); R(pxl, deck - 16, 4, 22, '#d8a080'); R(pxl + 9, deck - 16, 3, 22, '#5a4050'); R(pxl - 1, deck - 17, 14, 2, '#b88a7a'); for (var k = 0; k < 3; k++) R(pxl + 5, deck - 12 + k * 5, 2, 3, '#3a2a3a'); });
    for (x = Math.max(0, x0); x < x1; x += 4) px(x, deck - 1, '#ffd890');
  }
  function shell(xa, ya, xb, yb, tx, ty, lt2) {
    var pts = [xa, ya], i;
    bez(xa + 2, ya - (ya - ty) * 0.45, xa + 1, ty + (ya - ty) * 0.3, tx, ty, 10, pts);
    bez(tx, ty, tx + (xb - tx) * 0.75, ty + (yb - ty) * 0.08, xb, yb, 14, pts);
    P(pts, LG(tx, ty, xb, yb, [[0, '#fff6e6'], [0.45, mix('#f4e6d6', '#ffd2a8', 1 - lt2)], [1, '#b0a0b0']]));
    for (var k = 1; k < 5; k++) { var f = k / 5, pp = bez(tx, ty, tx + (xb - tx) * 0.75 * (1 - f * 0.5), ty + (yb - ty) * 0.08 + (ya - ty) * f * 0.5, xa + (xb - xa) * f, ya, 14); for (i = 0; i < pp.length; i += 2) if ((i / 2) % 2 === 0) px(pp[i], pp[i + 1], '#cbb8b8'); }
    var fp = [xa, ya]; bez(xa + 2, ya - (ya - ty) * 0.45, xa + 1, ty + (ya - ty) * 0.3, tx, ty, 8, fp).length; fp = fp.slice(0, 2 + 2 * 5); fp.push(xa + (xb - xa) * 0.42, ya);
    P(fp, '#5a3a4e'); for (i = 2; i < fp.length - 2; i += 2) px(fp[i] + 1, fp[i + 1] + 1, '#ffb070');
    for (var y = ya - 2; y > ya - (ya - ty) * 0.35; y -= 3) R(xa + 2, y, (xb - xa) * 0.3 * (1 - (ya - y) / (ya - ty)), 1, rgba('#ffc890', 0.5));
    var ep = bez(tx, ty, tx + (xb - tx) * 0.75, ty + (yb - ty) * 0.08, xb, yb, 16); for (i = 0; i < 12; i += 2) px(ep[i], ep[i + 1], '#ffffff');
  }

  LM.reykjavik = function () {
    sky([[0, '#040818'], [0.5, '#0a1838'], [0.85, '#183058'], [1, '#2a4468']], 104);
    stars(140, 90);
    var i, x;
    // aurora
    c.globalCompositeOperation = 'lighter';
    for (var band = 0; band < 2; band++) {
      for (x = 0; x < W; x++) {
        var yc = (band ? 44 : 30) + 14 * Math.sin(x * 0.026 + band * 2) + 6 * Math.sin(x * 0.071 + 1 + band), it = Math.pow(fbm(x / 14 + band * 9, 3), 2) * (band ? 0.7 : 1.1), len = 22 + 34 * fbm(x / 9 + 40);
        c.fillStyle = LG(0, yc + 4, 0, yc - len, [[0, 'rgba(120,255,170,' + Math.min(1, it * 0.9) + ')'], [0.15, 'rgba(60,240,140,' + it * 0.7 + ')'], [0.6, 'rgba(40,160,150,' + it * 0.35 + ')'], [1, 'rgba(160,60,200,0)']]);
        c.fillRect(x, yc - len, 1, len + 5);
        if (x % 3 === 0 && rnd() < it) c.fillRect(x, yc - len * 1.2, 1, len * 0.6);
      }
    }
    c.globalCompositeOperation = 'source-over';
    // Esja
    ridge(98, 22, 40, '#1a2840', { off: 2, bottom: 110, pw: 0.8, rim: '#5a8a8a' });
    for (i = 0; i < 260; i++) { x = rf(0, 240); var yy = rf(78, 104); px(x, yy, rgba(pick(['#a8d8d0', '#d8f0f0', '#8ab8c0']), 0.6)); }
    haze(90, 112, '#2a4a6a', 0, 0.6);
    // town
    var cols = ['#c83a30', '#e8b830', '#3a6ab0', '#ffffff', '#3a9a6a', '#e86a30', '#6a4aa0'];
    for (var row = 0; row < 2; row++) {
      for (x = -4; x < W; ) {
        var w = ri(9, 15), h = ri(6, 10), by = 112 + row * 14 + ri(-1, 1); if (Math.abs(x + w / 2 - 120) < 32 && row === 0) { x += w; continue; }
        var col = pick(cols); R(x, by - h, w, h, mix(col, '#1a2a4a', 0.35)); R(x, by - h, 1, h, mix(col, '#ffffff', 0.1));
        P([x - 1, by - h, x + w / 2, by - h - 5, x + w + 1, by - h], '#e8f0ff'); P([x + w / 2, by - h - 5, x + w + 1, by - h, x + w / 2, by - h], '#a8b8d8');
        for (var k = x + 2; k < x + w - 2; k += 4) { R(k, by - h + 2, 2, 2, '#ffd070'); c.fillStyle = RG(k + 1, by - h + 3, 0, 4, [[0, 'rgba(255,200,100,0.35)'], [1, 'rgba(255,200,100,0)']]); c.fillRect(k - 3, by - h - 1, 8, 8); }
        x += w + ri(1, 3);
      }
    }
    hallgrim(120, 112);
    // snow ground
    P([0, 128, 80, 122, 160, 122, 240, 128, 240, 147, 0, 147], LG(0, 122, 0, 147, [[0, '#c8d8f0'], [1, '#7a8ab8']]));
    for (i = 0; i < 120; i++) px(rf(0, 240), rf(124, 147), pick(['#ffffff', '#a8c8e8', '#d8f0e8']));
    // statue
    R(118, 122, 5, 8, '#3a4256'); R(119, 116, 3, 6, '#2a3040'); px(120, 115, '#2a3040'); R(117, 129, 7, 2, '#5a6278');
    // lamps
    [60, 180, 22, 216].forEach(function (lx, j) { var ly = j < 2 ? 130 : 138, lh = j < 2 ? 12 : 18; R(lx, ly - lh, 1, lh, '#1a1e2a'); c.fillStyle = RG(lx, ly - lh, 0, 12, [[0, 'rgba(255,190,90,0.7)'], [1, 'rgba(255,190,90,0)']]); c.fillRect(lx - 12, ly - lh - 12, 24, 24); R(lx - 1, ly - lh - 1, 3, 2, '#ffd890'); E(lx, ly + 1, 8, 2, rgba('#ffc080', 0.35)); });
    people(4, 70, 170, 132, 146, ['#c03030', '#2a2a3a', '#e8b830']);
    for (i = 0; i < 30; i++) px(rf(0, 240), rf(0, 147), rgba('#ffffff', 0.7));
    post({ lv: 14, sat: 1.1 });
  };
  function hallgrim(cx, base) {
    var cl = '#d8dce8', cs = '#7e86a0', cm = '#aeb4c8', glow = '#9af0c0';
    // stepped wings (basalt columns)
    for (var s = -1; s <= 1; s += 2) {
      for (var k = 0; k < 11; k++) {
        var x = cx + s * (6 + k * 3.4), hgt = 72 * Math.pow(1 - k / 12, 1.6) + 6, top = base - hgt;
        R(x - (s < 0 ? 3.4 : 0), top, 3.4, hgt, cm);
        R(x - (s < 0 ? 3.4 : 0), top, 1, hgt, cl); R(x - (s < 0 ? 3.4 : 0) + 2.4, top, 1, hgt, cs);
        px(x - (s < 0 ? 2 : -1), top, glow);
      }
    }
    // central tower
    R(cx - 6, 22, 12, base - 22, LG(cx - 6, 0, cx + 6, 0, [[0, '#f0f4ff'], [0.5, '#c8cede'], [1, '#7a82a0']]));
    P([cx - 6, 23, cx, 6, cx + 6, 23], LG(cx - 6, 0, cx + 6, 0, [[0, '#e8f0ff'], [1, '#7a82a0']]));
    R(cx - 0.5, 1, 1, 6, '#c8d0e0'); R(cx - 2, 3, 4, 1, '#c8d0e0');
    for (var y = 30; y < base - 6; y += 6) { R(cx - 3, y, 1, 3, '#3a4258'); R(cx + 2, y, 1, 3, '#3a4258'); }
    E(cx, 27, 2.5, 2.5, '#f8f0d0'); px(cx, 26, '#3a3a3a'); px(cx + 1, 27, '#3a3a3a');
    for (y = 34; y < 48; y += 2) R(cx - 1, y, 2, 1, '#ffd890');
    P([cx - 3, base, cx - 3, base - 10, cx, base - 14, cx + 3, base - 10, cx + 3, base], '#3a3040'); R(cx - 2, base - 9, 4, 9, '#ffcf80');
    c.fillStyle = RG(cx, base - 5, 0, 14, [[0, 'rgba(255,200,120,0.5)'], [1, 'rgba(255,200,120,0)']]); c.fillRect(cx - 14, base - 19, 28, 28);
  }

  LM.mexico = function () {
    sky([[0, '#164fae'], [0.5, '#5aa0e0'], [0.85, '#bcdcf0'], [1, '#e6eef0']], 92);
    sun(206, 16, 6, '#ffffff', '#fffad8', 60);
    var i;
    cumulus(-6, 46, 60, 18, ['#8aa0c0', '#d0dcec', '#ffffff', '#ffffff'], 1);
    cumulus(150, 40, 70, 20, ['#8aa0c0', '#d0dcec', '#ffffff', '#ffffff'], 1);
    cumulus(70, 26, 30, 8, ['#9ab0d0', '#dce6f4', '#ffffff'], 1);
    ridge(84, 26, 50, '#7890b8', { off: 1, bottom: 96, pw: 1.4 });
    ridge(90, 14, 26, '#6a7e88', { off: 7, bottom: 100 });
    haze(70, 100, '#d8e4ec', 0, 0.55);
    R(0, 96, W, 51, LG(0, 96, 0, 147, [[0, '#b0a068'], [0.5, '#a08850'], [1, '#7a6a3a']]));
    // pyramid of the sun
    var cx = 126, lv = [114, 97, 82, 69, 58, 50], hw = [96, 74, 56, 42, 30, 20];
    for (var t = 0; t < 5; t++) {
      var y0 = lv[t], y1 = lv[t + 1] + 2, wb = hw[t], wt = wb - (y0 - y1) * 0.62;
      P([cx - wb, y0, cx - wt, y1, cx + wt, y1, cx + wb, y0], LG(cx - wb, 0, cx + wb, 0, [[0, '#d8b080'], [0.5, '#b48c64'], [0.8, '#8e6a4c'], [1, '#664834']]));
      for (var yy = y1 + 3; yy < y0; yy += 3) { var f = (yy - y1) / (y0 - y1), h2 = wt + (wb - wt) * f; R(cx - h2 + 1, yy, h2 * 2 - 2, 1, rgba('#5a3e28', 0.28)); }
      for (var k = 0; k < (y0 - y1) * wb * 0.12; k++) { var ry = rf(y1 + 1, y0), f2 = (ry - y1) / (y0 - y1), rh = wt + (wb - wt) * f2; px(cx + rf(-rh, rh), ry, pick(['#7a5a40', '#e2c094', '#9a7656', '#c8a47a'])); }
      R(cx - wt, y1, wt * 2, 2, rgba('#3a2818', 0.45));
      var nw = hw[t + 1];
      P([cx - wt, y1, cx - nw, y1 - 2, cx + nw, y1 - 2, cx + wt, y1], '#e6c898'); R(cx - nw, y1 - 2, nw * 2, 1, '#f4dcae');
      for (k = 0; k < wt * 0.5; k++) px(cx + rf(-wt, wt), y1 - rf(0, 2), pick(['#6a8a3a', '#8aa84a', '#4a6a2a']));
    }
    R(cx - 14, 44, 28, 5, LG(cx - 14, 0, cx + 14, 0, [[0, '#e0c090'], [1, '#8a6a4a']])); R(cx - 14, 44, 28, 1, '#f4dcae');
    // staircase
    for (var y = 48; y < 114; y++) { var f3 = (y - 48) / 66, sw = 3.5 + f3 * 6; R(cx - sw - 1, y, 1, 1, '#6a4a34'); R(cx + sw, y, 1, 1, '#4a3424'); R(cx - sw, y, sw * 2, 1, (y % 2) ? '#e6c89a' : '#a8845e'); }
    for (t = 1; t < 5; t++) R(cx - 6 - (5 - t), lv[t] - 1, 12 + (5 - t) * 2, 2, '#f0d8a8');
    for (i = 0; i < 14; i++) { var py = rf(52, 112), f4 = (py - 48) / 66; person(cx + rf(-3, 3) * (1 + f4), py, pick(['#e03030', '#3060e0', '#ffffff', '#ffc020', '#20a060']), '#c89060'); }
    // avenue + small platforms
    P([0, 122, 100, 112, 160, 112, 240, 120, 240, 147, 0, 147], LG(0, 112, 0, 147, [[0, '#a89070'], [1, '#806a4a']]));
    for (i = 0; i < 4; i++) { var bx = 8 + i * 26, bw = 18 - i * 2.5, bh = 10 - i * 1.6, by = 128 - i * 4; R(bx, by - bh, bw, bh, '#a07a56'); R(bx, by - bh, bw, 2, '#d0aa7a'); R(bx + bw * 0.4, by - bh, bw * 0.2, bh, '#c8a078'); R(bx + bw - 2, by - bh, 2, bh, '#6a4a34'); }
    for (i = 0; i < 300; i++) px(rf(0, 240), rf(114, 147), pick(['#6a5a3a', '#c8b088', '#8a7a4a', '#9a8a5a']));
    // cacti and agave
    function nopal(x, y, s) { var g = '#3a7a3a', gl = '#6aaa4a'; E(x, y - 6 * s, 3 * s, 5 * s, g); E(x - 4 * s, y - 12 * s, 2.5 * s, 4 * s, g); E(x + 4 * s, y - 13 * s, 2.5 * s, 4 * s, g); E(x - 1, y - 7 * s, 1.2 * s, 3 * s, gl); E(x - 4.5 * s, y - 13 * s, 1, 2.5 * s, gl); E(x + 3.5 * s, y - 14 * s, 1, 2.5 * s, gl); px(x - 4 * s, y - 16 * s, '#e83a5a'); px(x + 4 * s, y - 17 * s, '#ffd040'); }
    function organ(x, y, h) { for (var k = -1; k <= 1; k++) { var hh = h - Math.abs(k) * h * 0.3; R(x + k * 4, y - hh, 3, hh, '#3a6a3a'); R(x + k * 4, y - hh, 1, hh, '#6a9a4a'); E(x + k * 4 + 1.5, y - hh, 1.5, 1, '#3a6a3a'); } }
    function agave(x, y, s) { for (var k = 0; k < 9; k++) { var a = -Math.PI + k * Math.PI / 8; L(x, y, x + Math.cos(a) * 9 * s, y + Math.sin(a) * 8 * s - 1, k % 2 ? '#5a8a8a' : '#8abaaa'); } }
    organ(20, 146, 26); nopal(214, 146, 1.4); nopal(186, 144, 1); agave(52, 146, 1.2); agave(160, 146, 0.8); agave(236, 140, 1);
    grass(130, 147, ['#c8b070', '#8a8a4a', '#a89858'], 200);
    birds(3, 60, 200, 20, 40, '#2a2a3a');
    post({ lv: 14 });
  };

  LM.istanbul = function () {
    sky([[0, '#232a66'], [0.35, '#6a3e78'], [0.62, '#d86a5a'], [0.85, '#ffa850'], [1, '#ffd480']], 100);
    sun(40, 88, 9, '#fff2c0', '#ffa040', 100);
    var i;
    for (i = 0; i < 12; i++) { var y = rf(10, 86), t = (y - 10) / 76; strato(rf(-20, 230), y, rf(30, 80), rf(1.3, 3), mix('#3a2a66', '#b0505a', t), mix('#6a3e7a', '#f07a5a', t), mix('#b06a88', '#ffd090', t)); }
    // far shore hills with houses
    ridge(100, 10, 30, '#6a4a6a', { off: 4, bottom: 102 });
    for (i = 0; i < 120; i++) px(rf(0, 240), rf(92, 101), pick(['#ffd890', '#8a5a6a', '#a87a7a']));
    haze(84, 102, '#ff9a6a', 0, 0.4);
    blueMosque(150, 100);
    // Hagia Sophia smaller left
    var hx0 = 56; R(hx0 - 16, 82, 32, 18, '#c87a6a'); R(hx0 - 16, 82, 32, 1, '#ffb080'); prof(hx0, 82, 12, function (u) { return 12 * Math.sqrt(Math.max(0, 1 - u * u)); }, LG(hx0 - 12, 0, hx0 + 12, 0, [[0, '#ffb080'], [1, '#6a4a6a']]));
    [hx0 - 20, hx0 + 20].forEach(function (mx) { R(mx - 1, 66, 2, 34, '#d88a7a'); P([mx - 1.5, 66, mx, 58, mx + 1.5, 66], '#6a4a6a'); R(mx - 2, 76, 4, 1, '#ffb080'); });
    for (i = 0; i < 8; i++) R(hx0 - 14 + i * 4, 88, 2, 3, '#ffd070');
    // water
    R(0, 102, W, 45, LG(0, 102, 0, 147, [[0, '#e08060'], [0.4, '#7a4a6a'], [1, '#2a2a5a']]));
    reflect(102, 147, { str: 0.62, tint: '#4a3060', src: 102, wave: 1.3, fade: 0.6 });
    glitter(40, 103, 147, '#ffd890', 26);
    ripples(102, 147, 100, '#ffc080', 0.3);
    // ferry
    R(160, 124, 30, 4, '#f0f0f0'); R(160, 127, 30, 2, '#2a2a3a'); R(164, 120, 22, 4, '#e8e8e8'); for (i = 0; i < 9; i++) px(166 + i * 2, 122, '#3a4a6a'); R(176, 116, 3, 4, '#c83030'); R(176, 116, 3, 1, '#2a2a2a'); R(150, 129, 46, 1, rgba('#ffffff', 0.5));
    R(96, 136, 10, 2, '#5a3a2a'); R(100, 132, 1, 4, '#3a2a2a');
    for (i = 0; i < 10; i++) bird(rf(80, 230), rf(14, 70), i % 2 ? '#f0e0e0' : '#2a1e3a');
    post({ lv: 14 });
  };
  function blueMosque(cx, base) {
    var wall = '#d0a088', wsh = '#7a5a6a', dome = LG(cx - 30, 0, cx + 30, 0, [[0, '#ffc090'], [0.35, '#a8889a'], [1, '#4a4466']]);
    function d(x, y, r) { R(x - r - 1, y - 2, r * 2 + 2, 3, '#a87a7a'); prof(x, y - 1, r * 0.9, function (u) { return r * Math.sqrt(Math.max(0, 1 - u * u)); }, LG(x - r, 0, x + r, 0, [[0, '#ffc898'], [0.4, '#a08aa0'], [1, '#4a4466']])); R(x - 0.5, y - r * 0.9 - 3, 1, 3, '#e8c060'); }
    R(cx - 44, base - 22, 88, 22, LG(cx - 44, 0, cx + 44, 0, [[0, '#ffc8a0'], [0.5, wall], [1, wsh]]));
    for (var k = -40; k <= 36; k += 6) { P([cx + k, base - 2, cx + k, base - 14, cx + k + 2, base - 17, cx + k + 4, base - 14, cx + k + 4, base - 2], '#4a3048'); if ((k / 6 | 0) % 2 === 0) R(cx + k + 1, base - 12, 2, 4, '#ffd070'); }
    R(cx - 44, base - 22, 88, 1, '#ffd8b0');
    d(cx - 36, base - 22, 5); d(cx + 36, base - 22, 5);
    R(cx - 30, base - 30, 60, 8, LG(cx - 30, 0, cx + 30, 0, [[0, '#ffc8a0'], [1, wsh]]));
    d(cx - 24, base - 30, 9); d(cx + 24, base - 30, 9);
    d(cx - 13, base - 38, 7); d(cx + 13, base - 38, 7);
    R(cx - 18, base - 44, 36, 6, LG(cx - 18, 0, cx + 18, 0, [[0, '#ffc8a0'], [1, wsh]])); for (k = -16; k < 16; k += 3) R(cx + k, base - 43, 1, 3, '#4a3048');
    prof(cx, base - 44, 18, function (u) { return 21 * Math.sqrt(Math.max(0, 1 - u * u)); }, dome);
    E(cx - 9, base - 56, 3, 2, rgba('#ffe0c0', 0.5));
    R(cx - 0.5, base - 68, 1, 6, '#e8c060'); px(cx, base - 69, '#ffe080');
    // minarets
    [[cx - 52, 18], [cx - 40, 24], [cx + 40, 24], [cx + 52, 18], [cx - 74, 34], [cx + 74, 34]].forEach(function (m) {
      var mx = m[0], tp = m[1]; R(mx - 1.5, tp + 8, 3, base - tp - 8, LG(mx - 2, 0, mx + 2, 0, [[0, '#ffd0a8'], [1, '#8a6a7a']]));
      for (var b = 0; b < 3; b++) { var by = tp + 14 + b * (base - tp - 30) / 3; R(mx - 2.5, by, 5, 1, '#f0b890'); R(mx - 2.5, by + 1, 5, 1, '#5a4060'); }
      P([mx - 1.8, tp + 8, mx, tp - 2, mx + 1.8, tp + 8], '#5a5070'); px(mx - 1, tp + 5, '#c8a0a0'); R(mx - 0.5, tp - 4, 1, 2, '#e8c060');
    });
    R(cx - 80, base - 4, 160, 4, '#5a3a4a');
    for (var t = 0; t < 30; t++) tree(cx - 90 + t * 6 + rf(-2, 2), base + 1, rf(2.5, 4), ['#2a2a3a', '#4a3a4a', '#a06a5a']);
  }

  LM.nairobi = function () {
    sky([[0, '#3a74c0'], [0.45, '#90b0d0'], [0.75, '#f4c080'], [1, '#ffd890']], 96);
    sun(196, 80, 9, '#fff4c0', '#ffb040', 100);
    var i, x;
    for (i = 0; i < 9; i++) { var y = rf(10, 70), t = y / 70; strato(rf(-20, 220), y, rf(30, 70), rf(1.4, 2.6), mix('#6a7aa8', '#c08a7a', t), mix('#b0b8d0', '#f0b080', t), mix('#e8e0e8', '#ffe0a0', t)); }
    // Kilimanjaro
    var kx = 80, kb = 98;
    for (x = 0; x < W; x++) {
      var d = Math.abs(x - kx), top = kb - 40 * Math.max(0, 1 - Math.pow(Math.max(0, d - 18) / 70, 0.85)) - (d < 18 ? fbm(x * 0.3) * 2 : 0);
      if (top >= kb) continue; top = Math.round(top);
      R(x, top, 1, kb - top + 4, x < kx + 10 ? '#7a6a98' : '#5a4e7e');
      var sn = top + 5 + 5 * fbm(x * 0.35 + 7) + (d < 30 ? 4 : -2) - d * 0.05;
      if (sn > top && d < 50) { R(x, top, 1, sn - top, x < kx + 10 ? '#ffffff' : '#c8c0e0'); if (fbm(x * 0.6) > 0.5) R(x, sn, 1, 3, x < kx + 10 ? '#e0dcf0' : '#a8a0c8'); }
    }
    ridge(98, 6, 18, '#8a6a6a', { off: 3, bottom: 100 });
    haze(70, 100, '#ffcf90', 0, 0.5);
    // savanna
    R(0, 98, W, 49, LG(0, 98, 0, 147, [[0, '#d8a858'], [0.4, '#c89040'], [1, '#8a6024']]));
    for (i = 0; i < 30; i++) { x = rf(0, 240); E(x, 100 + rf(0, 4), rf(3, 8), 1.5, '#6a5a2a'); }
    for (i = 0; i < 20; i++) { x = rf(0, 240); var tx = x; acacia(tx, 101 + rf(0, 3), rf(3, 5), '#4a4a24'); }
    grass(102, 147, ['#e8c070', '#b88838', '#a07028', '#f0d090', '#8a6a2a'], 1100);
    // zebras far
    for (i = 0; i < 6; i++) { var zx = 30 + i * 7 + rf(-2, 2), zy = 112 + rf(-1, 1); R(zx, zy - 3, 5, 2, '#f0f0f0'); px(zx + 1, zy - 3, '#202020'); px(zx + 3, zy - 3, '#202020'); px(zx + 2, zy - 2, '#202020'); R(zx + 4, zy - 5, 1, 3, '#f0f0f0'); px(zx + 4, zy - 4, '#202020'); px(zx + 5, zy - 5, '#202020'); px(zx, zy - 1, '#202020'); px(zx + 4, zy - 1, '#202020'); }
    acacia(176, 124, 16, '#2a3a1a'); acacia(30, 132, 11, '#2e3e1c');
    giraffe(150, 136, 1.2); giraffe(198, 130, 0.9); giraffe(126, 118, 0.6);
    // elephants silhouette far right
    for (i = 0; i < 3; i++) { var ex = 214 + i * 9, ey = 108; E(ex, ey - 3, 3.5, 2.5, '#5a4a4a'); E(ex + 3, ey - 4, 1.8, 1.6, '#5a4a4a'); R(ex + 4, ey - 4, 1, 4, '#5a4a4a'); R(ex - 2, ey - 1, 1, 2, '#5a4a4a'); R(ex + 1, ey - 1, 1, 2, '#5a4a4a'); }
    birds(7, 100, 230, 30, 70, '#3a2a2a');
    post({ lv: 14 });
  };
  function acacia(x, y, s, col) {
    var tr = '#3a2a1a'; L(x, y, x - s * 0.1, y - s * 0.9, tr); L(x + 1, y, x + 1 - s * 0.1, y - s * 0.9, tr); L(x, y - s * 0.6, x - s * 0.6, y - s * 1.1, tr); L(x, y - s * 0.6, x + s * 0.7, y - s * 1.15, tr);
    E(x, y - s * 1.2, s * 1.3, s * 0.22 + 1, col); for (var i = 0; i < 6; i++) E(x + rf(-s, s), y - s * 1.25 - rf(0, s * 0.1), s * rf(0.3, 0.5), s * 0.15 + 0.6, lt(col, 0.1));
    for (i = 0; i < s * 3; i++) px(x + rf(-s * 1.2, s * 1.2), y - s * 1.32, pick([lt(col, 0.35), '#c8b058']));
    if (s > 8) E(x + 4, y + 1, s * 1.3, 2, rgba('#5a3a14', 0.45));
  }
  function giraffe(x, y, s) { giraffeBody(x + 1, y, s, '#3a1e0a', '#3a1e0a', '#3a1e0a', false); giraffeBody(x, y, s, '#f4cc80', '#8a3e12', '#fff0b8', true); }
  function giraffeBody(x, y, s, b, sp, l, det) {
    function S(v) { return v * s; }
    for (var k = 0; k < 4; k++) R(x + S(-6 + k * 3.6), y - S(14), Math.max(1, S(1.4)), S(14), k % 2 ? lt(b, -0.15) : b);
    P([x - S(8), y - S(14), x - S(7), y - S(20), x + S(6), y - S(22), x + S(8), y - S(16), x + S(6), y - S(13), x - S(7), y - S(13)], b);
    P([x + S(4), y - S(20), x + S(8), y - S(46), x + S(11), y - S(46), x + S(8), y - S(18)], b);
    P([x + S(8), y - S(46), x + S(9), y - S(50), x + S(16), y - S(46), x + S(15), y - S(44), x + S(10), y - S(43)], b);
    R(x + S(9), y - S(53), 1, S(3), sp); R(x + S(11), y - S(53), 1, S(3), sp);
    if (!det) return;
    for (var i = 0; i < 30 * s; i++) { var u = rnd(), sx, sy; if (u < 0.55) { sx = x + rf(S(-7), S(6)); sy = y - rf(S(14), S(20)); } else { var t = rnd(); sx = x + S(5 + t * 3.5) + rf(0, S(1.5)); sy = y - S(20 + t * 24); } R(sx, sy, Math.max(1, S(1.7)), Math.max(1, S(1.5)), sp); }
    L(x + S(8.5), y - S(45), x + S(5), y - S(21), l); R(x - S(7), y - S(20), S(10), 1, l); px(x + S(13), y - S(47.5), '#1a0a00'); R(x + S(14), y - S(45), S(2), 1, '#c08a4a');
    for (k = 0; k < 4; k++) R(x + S(-6 + k * 3.6), y - 1, Math.max(1, S(1.4)), 1, '#2a1a0a');
    E(x, y + 1, S(10), S(1.6), rgba('#4a2a0a', 0.45));
  }

  LM.london = function () {
    sky([[0, '#4a82c8'], [0.5, '#94bce4'], [1, '#e2ecf2']], 98);
    sun(40, 20, 6, '#ffffff', '#fff6e0', 50);
    var i;
    cumulus(0, 30, 50, 12, ['#8a9ab8', '#c8d4e4', '#f4f8fc', '#ffffff'], -1); cumulus(84, 22, 64, 14, ['#8a9ab8', '#c8d4e4', '#f4f8fc', '#ffffff'], -1); cumulus(206, 50, 40, 10, ['#8a9ab8', '#c8d4e4', '#f4f8fc'], -1);
    skyline({ y: 84, hMin: 4, hMax: 12, wMin: 5, wMax: 10, col: '#9aaac0', x0: 0, x1: 240 });
    haze(60, 90, '#e0e8f0', 0, 0.6);
    // Parliament
    var st = '#d4b478', stl = '#f0d8a0', sts = '#8a7050';
    R(0, 70, 176, 30, LG(0, 70, 0, 100, [[0, stl], [1, st]]));
    for (var x = 0; x < 176; x += 4) { R(x, 66, 1, 34, stl); P([x - 1, 66, x + 0.5, 61, x + 2, 66], '#c8a868'); R(x + 2, 70, 1, 30, sts); }
    for (var y = 74; y < 98; y += 6) for (x = 1; x < 176; x += 4) R(x, y, 1, 3, '#4a4a5a');
    R(0, 70, 176, 1, '#fff0c0'); R(0, 82, 176, 1, '#b89860');
    R(0, 64, 176, 2, '#6a7a7a');
    // Victoria tower
    R(14, 30, 20, 70, LG(14, 0, 34, 0, [[0, stl], [0.6, st], [1, sts]])); for (y = 34; y < 96; y += 8) { R(18, y, 2, 5, '#4a4a5a'); R(23, y, 2, 5, '#4a4a5a'); R(28, y, 2, 5, '#4a4a5a'); } for (x = 14; x <= 34; x += 5) P([x - 1, 30, x + 0.5, 24, x + 2, 30], stl); R(24, 14, 1, 10, '#3a3a3a'); R(25, 14, 5, 3, '#c83030'); R(25, 15, 5, 1, '#ffffff');
    // central spire
    R(98, 50, 8, 20, st); P([97, 50, 102, 30, 107, 50], '#8a8a6a');
    // Big Ben
    bigBen(196, 100);
    // Thames
    R(0, 100, W, 47, LG(0, 100, 0, 147, [[0, '#7a9ab0'], [1, '#3a5a70']]));
    reflect(100, 112, { str: 0.55, tint: '#4a6a80', src: 100, wave: 0.8 });
    ripples(100, 112, 30, '#ffffff', 0.25);
    // bridge
    R(0, 112, W, 6, '#3a6a4a'); R(0, 112, W, 1, '#6aa070'); for (x = 0; x < W; x += 3) R(x, 109, 1, 3, '#2a5a3a'); R(0, 109, W, 1, '#3a7a50');
    for (x = 10; x < W; x += 36) { R(x, 100, 1, 12, '#1e3a2a'); R(x - 1, 99, 3, 2, '#2a4a3a'); px(x, 98, '#fff0b0'); c.fillStyle = RG(x, 99, 0, 5, [[0, 'rgba(255,240,180,0.5)'], [1, 'rgba(255,240,180,0)']]); c.fillRect(x - 5, 94, 10, 10); }
    R(0, 118, W, 3, '#d8c8a8'); R(0, 118, W, 1, '#f0e0c0'); R(0, 121, W, 9, LG(0, 121, 0, 130, [[0, '#4a7a58'], [1, '#2a5a3a']]));
    for (x = -10; x < W; x += 40) { E(x + 20, 131, 16, 8, '#22323e'); E(x + 20, 131, 15, 7, '#3a5262'); R(x + 1, 121, 2, 9, '#d8c8a8'); R(x + 1, 121, 1, 9, '#f0e0c0'); }
    for (x = 0; x < W; x += 2) px(x, 122, '#8ac090');
    R(0, 130, W, 17, LG(0, 130, 0, 147, [[0, '#5a7a90'], [1, '#2a4a60']]));
    reflect(130, 147, { str: 0.6, tint: '#3a5a70', src: 130, wave: 1.2 });
    ripples(130, 147, 50, '#d0e0f0', 0.25);
    // bus
    var bx = 70; R(bx, 98, 30, 12, '#d0201a'); R(bx, 98, 30, 1, '#ff5a40'); R(bx, 103, 30, 1, '#8a1010'); for (i = 0; i < 6; i++) { R(bx + 2 + i * 4.6, 99.5, 3, 2.5, '#2a3a4a'); R(bx + 2 + i * 4.6, 104.5, 3, 2.5, '#2a3a4a'); px(bx + 2 + i * 4.6, 99.5, '#8ab0d0'); } R(bx + 27, 104, 3, 5, '#e8e8e8'); E(bx + 6, 110, 2, 2, '#1a1a1a'); E(bx + 24, 110, 2, 2, '#1a1a1a'); R(bx + 8, 102, 14, 1, '#ffd040');
    var cxb = 130; R(cxb, 104, 12, 4, '#1a1a22'); R(cxb + 2, 101, 7, 3, '#1a1a22'); R(cxb + 3, 102, 2, 1, '#6a8aa0'); R(cxb + 6, 102, 2, 1, '#6a8aa0'); E(cxb + 2, 108, 1.5, 1.5, '#0a0a0a'); E(cxb + 10, 108, 1.5, 1.5, '#0a0a0a'); px(cxb + 11, 105, '#ffd060');
    people(12, 0, 240, 108, 111, ['#2a2a3a', '#c03030', '#3050a0', '#e8e8e8', '#8a5a3a']);
    birds(5, 110, 170, 20, 40, '#3a3a4a');
    post({ lv: 14 });
  };
  function bigBen(cx, base) {
    var st = '#d8b878', stl = '#f4dca0', sts = '#8a6e48', w = 16, top = 40;
    R(cx - w / 2, top, w, base - top, LG(cx - w / 2, 0, cx + w / 2, 0, [[0, stl], [0.55, st], [1, sts]]));
    for (var x = cx - w / 2 + 2; x < cx + w / 2 - 1; x += 3) R(x, top + 2, 1, base - top - 2, x > cx ? '#7a5e40' : '#b89a60');
    for (var y = top + 6; y < base; y += 7) R(cx - w / 2, y, w, 1, '#a88a58');
    for (y = top + 8; y < base - 4; y += 7) { R(cx - 4, y, 2, 4, '#3a3a4a'); R(cx + 2, y, 2, 4, '#3a3a4a'); }
    // clock stage
    R(cx - w / 2 - 1, 26, w + 2, 15, LG(cx - 9, 0, cx + 9, 0, [[0, stl], [1, sts]]));
    E(cx, 33, 6, 6, '#c8a040'); E(cx, 33, 5, 5, '#f8f4e4'); for (var k = 0; k < 12; k++) { var a = k / 12 * Math.PI * 2; px(cx - 0.5 + Math.cos(a) * 4, 32.5 + Math.sin(a) * 4, '#2a2a2a'); }
    L(cx, 33, cx, 29.5, '#1a1a1a'); L(cx, 33, cx + 2.5, 34, '#1a1a1a');
    R(cx - w / 2 - 2, 25, w + 4, 2, '#f0d8a0'); px(cx - w / 2 - 2, 24, stl); px(cx + w / 2 + 1, 24, st);
    // belfry
    R(cx - w / 2, 16, w, 9, LG(cx - 8, 0, cx + 8, 0, [[0, stl], [1, sts]])); for (x = cx - 6; x < cx + 6; x += 3) P([x, 25, x, 19, x + 1, 17.5, x + 2, 19, x + 2, 25], '#3a3a4a');
    // spire
    P([cx - w / 2, 16, cx, -2, cx + w / 2, 16], LG(cx - 8, 0, cx + 8, 0, [[0, '#7a8a8a'], [0.5, '#4a5a64'], [1, '#2a3440']]));
    for (y = 2; y < 16; y += 3) R(cx - (16 - y) * 0.42, y, (16 - y) * 0.84, 1, '#c8a040');
    [cx - w / 2, cx + w / 2 - 1].forEach(function (p) { R(p, 10, 1, 7, '#c8a040'); px(p, 9, '#ffe080'); });
  }

  LM.newyork = function () {
    sky([[0, '#26306e'], [0.4, '#7a4a86'], [0.65, '#e66e7a'], [0.88, '#ffae6a'], [1, '#ffd890']], 102);
    sun(150, 98, 7, '#fff4c8', '#ffa050', 90);
    var i;
    for (i = 0; i < 10; i++) { var y = rf(10, 90), t = (y - 10) / 80; strato(rf(-20, 230), y, rf(30, 80), rf(1.4, 3), mix('#3a2a66', '#b0506a', t), mix('#6a3e80', '#f0806a', t), mix('#b06a90', '#ffd090', t)); }
    // skyline
    var sx0 = 84;
    for (var x = sx0; x < 240; ) {
      var w = ri(4, 9), h = ri(12, 38) * (1 - Math.abs(x - 170) / 160), col = mix('#3a2e5a', '#5a3e6a', rnd());
      R(x, 102 - h, w, h, col); R(x, 102 - h, 1, h, '#e08a7a');
      for (var yy = 104 - h; yy < 100; yy += 2) for (var xx = x + 1; xx < x + w - 1; xx += 2) if (rnd() < 0.35) px(xx, yy, pick(['#ffd880', '#fff0c0', '#ffb860']));
      x += w;
    }
    // One WTC
    P([116, 102, 118, 50, 126, 50, 128, 102], '#4a4878'); P([118, 50, 122, 46, 126, 50], '#5a5888'); R(121.5, 30, 1, 16, '#8a8aa8'); L(118, 50, 116, 102, '#f0a080'); for (i = 0; i < 20; i++) px(rf(118, 127), rf(52, 100), '#ffd890');
    // Empire State
    var ex = 196; R(ex - 6, 72, 12, 30, '#4a3a6a'); R(ex - 4, 62, 8, 10, '#4a3a6a'); R(ex - 2, 54, 4, 8, '#4a3a6a'); R(ex - 1, 48, 2, 6, '#5a4a7a'); R(ex - 0.5, 40, 1, 8, '#8a7aa0'); R(ex - 6, 72, 1, 30, '#e8907a'); R(ex - 4, 62, 1, 10, '#e8907a'); for (i = 0; i < 30; i++) px(ex + rf(-5, 5), rf(64, 100), '#ffd070');
    haze(80, 104, '#ff9a7a', 0, 0.3);
    // water
    R(0, 102, W, 45, LG(0, 102, 0, 147, [[0, '#d07a7a'], [0.4, '#6a4a7a'], [1, '#22264e']]));
    reflect(102, 147, { str: 0.6, tint: '#3a3060', src: 102, wave: 1.2 });
    glitter(150, 103, 147, '#ffd890', 24);
    ripples(102, 147, 100, '#ffc8a0', 0.3);
    // ferry
    R(176, 126, 26, 4, '#f0a020'); R(178, 122, 22, 4, '#f4f0e0'); for (i = 0; i < 8; i++) px(180 + i * 2.5, 124, '#3a3a5a'); R(170, 130, 38, 1, rgba('#ffffff', 0.5));
    // Liberty Island
    P([0, 118, 20, 112, 80, 112, 104, 118, 104, 124, 0, 124], '#3a4a3a'); R(0, 112, 104, 1, '#6a8a5a'); for (i = 0; i < 18; i++) tree(rf(2, 100), 116 + rf(0, 4), rf(2, 3.5), ['#1e3a28', '#2e5a34', '#e8a060'], 1);
    // star fort
    P([24, 112, 36, 104, 64, 104, 76, 112], '#a8988a'); R(26, 104, 48, 1, '#e8c8a8');
    // pedestal
    var cx = 50; R(cx - 10, 80, 20, 25, LG(cx - 10, 0, cx + 10, 0, [[0, '#7a6a6a'], [0.5, '#b0988a'], [1, '#f0c8a0']]));
    R(cx - 12, 78, 24, 3, '#d8b8a0'); R(cx - 7, 86, 4, 6, '#4a3a4a'); R(cx + 3, 86, 4, 6, '#4a3a4a'); R(cx - 12, 102, 24, 3, '#a8908a'); R(cx - 8, 72, 16, 7, LG(cx - 8, 0, cx + 8, 0, [[0, '#7a6a6a'], [1, '#e8c0a0']]));
    liberty(cx, 72);
    birds(5, 60, 120, 20, 50, '#2a1e3a');
    post({ lv: 14 });
  };
  function liberty(cx, base) {
    var g = '#5aa08e', gl = '#a8e0c4', gs = '#2e6a62', gw = '#f0c8a0';
    // robe
    P([cx - 6, base, cx - 5, base - 20, cx - 4, base - 34, cx + 4, base - 34, cx + 5, base - 20, cx + 7, base], LG(cx - 7, 0, cx + 7, 0, [[0, gs], [0.5, g], [0.85, gl], [1, gw]]));
    for (var k = 0; k < 4; k++) L(cx - 4 + k * 2.5, base - 30, cx - 5 + k * 3, base - 1, gs);
    // head
    E(cx + 0.5, base - 37, 2.2, 2.8, g); px(cx + 2, base - 37, gl); px(cx + 1, base - 36, gs);
    for (k = 0; k < 7; k++) { var a = -Math.PI + k * Math.PI / 6; L(cx + 0.5 + Math.cos(a) * 2, base - 39 + Math.sin(a) * 2, cx + 0.5 + Math.cos(a) * 5, base - 39 + Math.sin(a) * 4.5, k > 3 ? gl : g); }
    // right arm raised (statue's right = viewer's left)
    P([cx - 4, base - 33, cx - 2, base - 33, cx - 4, base - 52, cx - 6, base - 52], g); P([cx - 3, base - 33, cx - 2, base - 33, cx - 4, base - 52, cx - 5, base - 52], gl);
    R(cx - 6.5, base - 55, 3, 3, '#c8a040'); R(cx - 6, base - 55, 1, 3, '#ffe080');
    P([cx - 7, base - 55, cx - 5, base - 63, cx - 3, base - 55], '#ffb030'); P([cx - 6, base - 55, cx - 5, base - 60, cx - 4, base - 55], '#fff0a0');
    c.fillStyle = RG(cx - 5, base - 58, 0, 12, [[0, 'rgba(255,200,90,0.6)'], [1, 'rgba(255,200,90,0)']]); c.fillRect(cx - 17, base - 70, 24, 24);
    // left arm with tablet
    R(cx + 3, base - 30, 3, 10, g); R(cx + 5, base - 30, 1, 10, gl); P([cx + 4, base - 30, cx + 9, base - 32, cx + 10, base - 21, cx + 5, base - 20], gs); L(cx + 9, base - 32, cx + 10, base - 21, gl);
  }

  LM.beijing = function () {
    sky([[0, '#5a94d8'], [0.55, '#a8cce8'], [1, '#f0f0ea']], 70);
    sun(196, 18, 6, '#ffffff', '#fff6e0', 55);
    var i;
    for (i = 0; i < 6; i++) strato(rf(-20, 220), rf(8, 40), rf(30, 70), 1.6, rgba('#ffffff', 0.3), rgba('#ffffff', 0.45), rgba('#ffffff', 0.6));
    var r1 = ridge(62, 22, 30, '#9ab0cc', { off: 1, pw: 1.3 });
    haze(30, 80, '#e8f0f4', 0, 0.5);
    var r2 = ridge(80, 28, 36, '#6a8a9a', { off: 5, pw: 1.2, rim: '#9ab8b8' });
    wallOn(r2, 2, '#b8b0a0', '#7a7468', 0.5);
    haze(50, 100, '#e0e8f0', 0, 0.4);
    var r3 = ridge(104, 34, 44, '#4a6a3a', { off: 11, pw: 1.1, rim: '#8aa860' });
    for (i = 0; i < 900; i++) { var x = ri(0, 239), y = r3[x] + rf(1, 147 - r3[x]); px(x, y, pick(['#3a5a2a', '#5a7a34', '#c87a2a', '#e8a040', '#a83a2a', '#2e4a26', '#7a9a44'])); }
    wallOn(r3, 4, '#c8b89a', '#8a7a62', 1);
    // foreground slope with wall coming at viewer
    var fp = []; fp.push(240, 147, 240, 92); bez(240, 92, 196, 100, 140, 147, 12, fp);
    P(fp, '#3a5a2a');
    for (i = 0; i < 400; i++) { x = rf(140, 240); y = rf(92, 147); px(x, y, pick(['#2e4a22', '#5a7a34', '#d8882a', '#b8402a', '#e8b040', '#3a6a2a'])); }
    var wp = bez(132, 158, 186, 112, 240, 98, 30);
    for (var k = 0; k + 3 < wp.length; k += 2) {
      var x0 = wp[k], y0 = wp[k + 1], x1 = wp[k + 2], y1 = wp[k + 3], t0 = k / (wp.length - 2);
      var wt0 = 16 - t0 * 12, wt1 = 16 - (t0 + 2 / (wp.length - 2)) * 12, hs0 = 16 - t0 * 12, hs1 = hs0;
      P([x0, y0 - wt0, x1 + 0.6, y1 - wt1, x1 + 0.6, y1, x0, y0], mix('#d8c8a6', '#c8b898', t0));
      P([x0, y0, x1 + 0.6, y1, x1 + 0.6, y1 + hs1, x0, y0 + hs0], mix('#9a8a6e', '#8a7c64', t0));
      for (var b2 = 1; b2 < 6; b2++) px(x0, y0 + hs0 * b2 / 6, '#6a5e4a');
      var m = Math.max(1, 4 - t0 * 3); if ((k / 2) % 2 === 0) { R(x0, y0 - wt0 - m, x1 - x0 + 1, m, '#b8a886'); px(x0, y0 - wt0 - m, '#e8dcc0'); }
      R(x0, y0 - wt0, x1 - x0 + 1, 1, '#a89878'); px(x0, y0 - 1, '#e8dcc0');
      if (rnd() < 0.5) px(x0 + rf(0, 2), y0 - rf(1, wt0 - 1), pick(['#bcae90', '#e8dcc0', '#a89a7c']));
    }
    // tower on foreground wall
    var j, tx = 206, ty = 102; R(tx - 10, ty - 18, 20, 18, LG(tx - 10, 0, tx + 10, 0, [[0, '#e8d8b8'], [0.6, '#c0b090'], [1, '#7a6a52']]));
    for (j = 0; j < 4; j++) R(tx - 9 + j * 5, ty - 21, 3, 3, '#b8a888'); R(tx - 10, ty - 18, 20, 1, '#f0e0c0');
    P([tx - 5, ty, tx - 5, ty - 7, tx - 3, ty - 10, tx - 1, ty - 7, tx - 1, ty], '#3a3028'); P([tx + 2, ty - 8, tx + 2, ty - 12, tx + 4, ty - 14, tx + 6, ty - 12, tx + 6, ty - 8], '#3a3028');
    for (j = 0; j < 30; j++) px(tx + rf(-9, 9), ty - rf(1, 17), pick(['#a89878', '#f0e0c0']));
    people(6, 160, 230, 100, 130, ['#e03030', '#3060d0', '#ffd020', '#ffffff']);
    // foreground autumn foliage
    P([0, 118, 40, 122, 100, 134, 140, 147, 0, 147], '#4a3a1a');
    for (i = 0; i < 150; i++) { var fx2 = rf(-4, 130), fy2 = 118 + (fx2 / 130) * 20 + rf(0, 30), rr = rf(1.5, 4); if (fy2 > 150) continue; var cl = pick([['#8a2a1a', '#d84a2a'], ['#a85a1a', '#e8a030'], ['#6a3a1a', '#c86a2a'], ['#5a5a1a', '#a8a030']]); E(fx2, fy2, rr, rr * 0.8, cl[0]); E(fx2 - rr * 0.3, fy2 - rr * 0.3, rr * 0.6, rr * 0.45, cl[1]); if (rnd() < 0.3) px(fx2 - rr * 0.4, fy2 - rr * 0.5, '#ffd870'); }
    birds(5, 40, 160, 12, 40, '#3a3a4a');
    post({ lv: 14 });
  };
  function wallOn(hts, th, lit, sh, sc) {
    var towers = 0;
    for (var x = 1; x < W - 1; x++) {
      var y = hts[x]; R(x, y - th, 1, th, x % 2 ? lit : sh);
      if (x % 2 === 0) px(x, y - th - 1, lit);
      if (hts[x] < hts[x - 1] && hts[x] <= hts[x + 1] && x - towers > 18) { towers = x; var tw = 3 + sc * 4; R(x - tw / 2, y - th - tw, tw, tw, lit); R(x + tw / 2 - 1, y - th - tw, 1, tw, sh); R(x - tw / 2, y - th - tw - 1, tw, 1, sh); if (sc > 0.6) px(x, y - th - tw / 2, '#3a3028'); }
    }
  }

  LM.buenosaires = function () {
    sky([[0, '#2a7ad0'], [0.6, '#8ac4ee'], [1, '#d8eef8']], 96);
    sun(40, 16, 6, '#ffffff', '#fffad8', 55);
    var i, vx = 120, vy = 94, G = 52;
    cumulus(150, 30, 50, 12, ['#9ab0cc', '#d8e4f0', '#ffffff', '#ffffff'], -1); cumulus(10, 50, 36, 9, ['#9ab0cc', '#d8e4f0', '#ffffff'], -1);
    // buildings via pixel columns
    var cols = ['#e8d8c0', '#d0b8a0', '#c8c8d0', '#f0e4d0', '#b8a090', '#e0c8b0', '#a8b0c0'];
    for (var side = -1; side <= 1; side += 2) {
      for (var sxp = 0; sxp < 112; sxp++) {
        var x = side < 0 ? sxp : W - 1 - sxp, dx = Math.abs(x + 0.5 - vx), z = 120 / dx; if (z > 9) continue;
        var seg = Math.floor(z * 1.6 + (side > 0 ? 7 : 0)), hW = 70 + ((seg * 37) % 5) * 18, col = cols[seg % cols.length];
        var yb = vy + G / z, yt = vy - (hW - G) / z;
        var shade = side < 0 ? 0.1 : -0.15, fc = lt(col, shade - (z / 9) * 0.15);
        c.fillStyle = mix(fc, '#c0d4e8', Math.min(0.7, z / 9 * 0.8)); c.fillRect(x, Math.round(yt), 1, Math.round(yb - yt));
        if (z < 6 && (z * 3) % 1 < 0.55) for (var y = Math.round(yt) + 2; y < yb - 3; y++) { var hy = (vy - y) * z + G; if ((hy % 9) > 4 && (hy % 9) < 8) px(x, y, z < 3 ? (seg % 3 === 0 ? '#ffe8a0' : '#3a4a6a') : '#6a7a9a'); }
        px(x, Math.round(yt), lt(fc, 0.3));
        if (((z * 1.6) % 1) < 0.08) { c.fillStyle = rgba('#000000', 0.25); c.fillRect(x, Math.round(yt), 1, Math.round(yb - yt)); }
      }
    }
    // road
    for (y = vy; y < H; y++) {
      var zz = G / (y + 0.5 - vy), sc = 1 / zz;
      R(0, y, W, 1, mix('#6a6a72', '#4a4a52', Math.min(1, sc * 0.4)));
      var med = function (a, b, col2) { R(vx + a * sc * 120 / G * 0.9, y, (b - a) * sc * 120 / G * 0.9, 1, col2); };
      med(-112, -95, '#c8c0b0'); med(95, 112, '#c8c0b0');
      med(-62, -48, '#4a8a3a'); med(48, 62, '#4a8a3a'); med(-8, 8, '#5a9a44');
      if ((zz % 3) < 1.4) { med(-30, -28.5, '#f0f0f0'); med(28.5, 30, '#f0f0f0'); med(-80, -78.5, '#f0f0f0'); med(78.5, 80, '#f0f0f0'); }
    }
    // obelisco
    var ob = 120; prof(ob, 100, 84, function (u) { return u > 0.94 ? 4.5 * (1 - u) / 0.06 : 4.5 - u * 1.2; }, LG(ob - 5, 0, ob + 5, 0, [[0, '#ffffff'], [0.5, '#f0ece4'], [1, '#a8a8b8']]));
    R(ob - 0.5, 26, 1.5, 2, '#3a3a4a'); R(ob - 6, 98, 12, 3, '#d8d0c8');
    // trees on medians
    for (i = 14; i >= 0; i--) {
      var z2 = 1.2 + i * 0.55, s2 = 1 / z2, ty = vy + G / z2;
      [-55, 55].forEach(function (lx) { var tx = vx + lx * s2 * 120 / G * 0.9, r = 26 * s2; tree(tx, ty, r, ['#6a3a9a', '#9a6ad0', '#d8b0ff', '#3a2a1e'], -1); });
      [-104, 104].forEach(function (lx) { var tx = vx + lx * s2 * 120 / G * 0.9, r = 22 * s2; tree(tx, ty, r, ['#2a5a2a', '#4a8a3a', '#9ad060', '#3a2a1e'], -1); });
    }
    // cars
    var cc = ['#f0d020', '#e03030', '#ffffff', '#3060c0', '#202020', '#40a060'];
    for (i = 0; i < 26; i++) {
      var z3 = rf(1.3, 8), s3 = 1 / z3, lane = pick([-40, -20, -70, 20, 40, 70, -88, 88]), cxp = vx + lane * s3 * 120 / G * 0.9, cy = vy + G / z3, cw = 14 * s3 * 1.6, ch = 8 * s3 * 1.6, col3 = pick(cc);
      if (col3 === '#f0d020') { R(cxp - cw / 2, cy - ch, cw, ch, '#1a1a1a'); R(cxp - cw / 2, cy - ch * 0.5, cw, ch * 0.4, '#f0d020'); }
      else if (rnd() < 0.15) { R(cxp - cw * 0.7, cy - ch * 1.8, cw * 1.4, ch * 1.8, pick(['#e8a020', '#3a8ac0', '#c03a4a'])); R(cxp - cw * 0.6, cy - ch * 1.5, cw * 1.2, ch * 0.4, '#2a3a4a'); }
      else { R(cxp - cw / 2, cy - ch, cw, ch, col3); R(cxp - cw / 2 + 1, cy - ch * 0.9, cw - 2, ch * 0.35, '#2a3a4a'); }
      if (cw > 4) { px(cxp - cw / 2, cy - ch * 0.4, '#ff3030'); px(cxp + cw / 2 - 1, cy - ch * 0.4, '#ff3030'); }
    }
    // crosswalk
    for (i = -12; i < 12; i++) P([vx + i * 10, 138, vx + i * 10 + 6, 138, vx + i * 11 + 7, 146, vx + i * 11, 146], '#f0f0f0');
    people(10, 20, 220, 136, 147);
    post({ lv: 14 });
  };

  LM.rome = function () {
    sky([[0, '#3a74c0'], [0.5, '#9ab8d8'], [0.82, '#f2c890'], [1, '#ffe0b0']], 104);
    sun(214, 70, 7, '#fff6d0', '#ffc070', 90);
    var i;
    for (i = 0; i < 8; i++) { var y = rf(10, 70), t = y / 70; strato(rf(-20, 220), y, rf(30, 70), rf(1.3, 2.4), mix('#8a9ac0', '#d0a090', t), mix('#c8d4e8', '#f8c898', t), mix('#ffffff', '#fff0c8', t)); }
    birds(6, 20, 120, 16, 40, '#3a3040');
    skyline({ y: 106, hMin: 4, hMax: 10, wMin: 6, wMax: 12, col: '#c8a890', x0: 0, x1: 240, spire: 0.08 });
    haze(80, 108, '#ffd8b0', 0, 0.5);
    colosseum(120, 112);
    // road & ground
    R(0, 112, W, 35, LG(0, 112, 0, 147, [[0, '#a89880'], [1, '#6a5e50']]));
    for (y = 114; y < 147; y += 3) for (var x = (y % 2) * 2; x < W; x += 4 + (y - 112) / 8) R(x, y, 2 + (y - 112) / 12, 1, rgba('#4a3e34', 0.35));
    R(0, 128, W, 1, '#f0e8d8');
    // umbrella pines
    pine(14, 128, 50, 20, ['#2e4a28', '#4a6e34', '#e0b060', '#4a3020'], 1); pine(224, 130, 54, 22, ['#2e4a28', '#4a6e34', '#ffd080', '#4a3020'], 1);
    cypress(40, 116, 26, 3, ['#1e3a22', '#2e5a30', '#e8b060'], 1); cypress(200, 116, 22, 3, ['#1e3a22', '#2e5a30', '#e8b060'], 1);
    // vespa
    var vx = 150, vy = 140; E(vx, vy, 2, 2, '#1a1a1a'); E(vx + 9, vy, 2, 2, '#1a1a1a'); P([vx - 2, vy - 1, vx + 2, vy - 5, vx + 8, vy - 5, vx + 10, vy - 1], '#d82a2a'); R(vx + 8, vy - 9, 1, 5, '#3a3a3a'); R(vx + 7, vy - 9, 3, 1, '#3a3a3a'); person(vx + 4, vy - 5, '#2a6ac0', '#e8b890');
    people(22, 20, 220, 116, 140);
    post({ lv: 14 });
  };
  function colosseum(cx, base) {
    var rx = 100, tierH = [17, 17, 17, 14], N = 30;
    function topAt(u, xq) { if (u > 0.47) { var k = (u - 0.47) / 0.53; return Math.max(0.8, 3.35 - k * 3.6 - fbm(xq * 0.31) * 0.7); } return 4; }
    var id = c.getImageData(0, 0, W, H), d = id.data;
    function setp(x, y, rgb) { if (x < 0 || y < 0 || x >= W || y >= H) return; var i = (y * W + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; }
    var stone = hx('#e2b888'), dark = hx('#4a3428'), inner = hx('#8a6a52');
    for (var x = Math.ceil(cx - rx); x < cx + rx; x++) {
      var u = (x + 0.5 - cx) / rx, th3 = Math.asin(Math.max(-1, Math.min(1, u))), bow = Math.sqrt(1 - u * u);
      var light = 0.62 + 0.38 * Math.cos(th3 - 0.7), xq = Math.floor(x / 3) * 3, tiers = topAt(((xq + 0.5 - cx) / rx + 1) / 2, xq);
      var ph = ((th3 / Math.PI + 0.5) * N * 2) % 1, ph2 = ((th3 / Math.PI + 0.5) * N * 2 + 0.5) % 1;
      var y0 = base, yTop = base;
      for (var t = 0; t < 4; t++) {
        var hT = tierH[t] * (0.92 + 0.08 * bow), full = tiers - t; if (full <= 0) break;
        var hh = full >= 1 ? hT : hT * full; yTop = y0 - hh;
        for (var y = Math.round(y0) - 1; y >= Math.round(yTop); y--) {
          var ry = (y0 - y) / hT, col;
          if (t < 3) {
            var archW = 0.62, inA = Math.abs(ph - 0.5) < archW / 2, aTop = 0.68 + 0.2 * Math.sqrt(Math.max(0, 1 - Math.pow((ph - 0.5) / (archW / 2), 2)));
            if (ry < 0.12 || ry > 0.88) col = 1.08;
            else if (inA && ry < aTop - 0.12 && ry > 0.12) col = -1;
            else col = (Math.abs(ph - 0.5) > 0.45 ? 1.05 : 0.95);
          } else { col = (ry > 0.3 && ry < 0.55 && Math.abs(ph2 - 0.5) < 0.12) ? -2 : 0.98; if (ry > 0.9) col = 1.1; }
          var rgb;
          if (col === -1) { var dp = 1 - Math.abs(ph - 0.5) * 1.6; rgb = (full < 1.6 && t >= 1) ? [inner[0] * light, inner[1] * light, inner[2] * light] : [dark[0] * (0.8 + dp * 0.4), dark[1] * (0.8 + dp * 0.4), dark[2] * (0.8 + dp * 0.4)]; if (t === 2 && ry > 0.5 && full >= 1) { rgb = [200 * light, 150 * light, 110 * light]; } }
          else if (col === -2) rgb = [dark[0], dark[1], dark[2]];
          else { var nn = (fbm(x * 0.9 + y * 1.7) - 0.5) * 0.18; rgb = [stone[0] * light * (col + nn), stone[1] * light * (col + nn), stone[2] * light * (col + nn)]; }
          setp(x, y, rgb);
        }
        y0 = yTop;
      }
      // inner tiers visible through the broken part
      if (tiers < 3.5) {
        var iy = base - 47 * (0.9 + 0.1 * bow), iph = ((th3 / Math.PI + 0.5) * N * 1.7) % 1;
        for (y = Math.round(yTop) - 1; y >= Math.round(iy); y--) {
          var ir = ((base - y) / 15) % 1, op = ir > 0.18 && ir < 0.78 && Math.abs(iph - 0.5) < 0.27 - (ir > 0.62 ? (ir - 0.62) * 1.2 : 0), lf = light * 0.82;
          if (y === Math.round(iy)) { setp(x, y, [235 * light, 200 * light, 160 * light]); continue; }
          setp(x, y, op ? [70 * lf, 48 * lf, 40 * lf] : [stone[0] * lf * 0.92, stone[1] * lf * 0.85, stone[2] * lf * 0.85]);
        }
      }
    }
    c.putImageData(id, 0, 0);
    R(cx - rx, base - 1, rx * 2, 1, '#6a4a34');
  }

  LM.bangkok = function () {
    sky([[0, '#2e3270'], [0.35, '#7a4a88'], [0.62, '#e8705a'], [0.85, '#ffb058'], [1, '#ffd890']], 100);
    sun(204, 86, 8, '#fff4c8', '#ffa040', 100);
    var i;
    for (i = 0; i < 11; i++) { var y = rf(10, 86), t = (y - 10) / 76; strato(rf(-20, 230), y, rf(30, 80), rf(1.3, 3), mix('#3a2a66', '#b0505a', t), mix('#6a3e7a', '#f07a5a', t), mix('#b06a88', '#ffd090', t)); }
    // trees on bank
    for (i = 0; i < 40; i++) tree(rf(-4, 244), 100 + rf(0, 2), rf(3, 6), ['#2a2a3a', '#3a3a3e', '#e08a5a'], 1);
    for (i = 0; i < 4; i++) palm([18, 66, 178, 226][i], 102, ri(16, 22), rf(-1, 1), ['#3a2a2a', '#5a3a2a', '#2a2a2e', '#4a3a3a']);
    watArun(120, 100);
    R(0, 98, W, 4, '#4a3040'); R(0, 98, W, 1, '#e8a070');
    R(0, 102, W, 45, LG(0, 102, 0, 147, [[0, '#e08a60'], [0.4, '#8a5070'], [1, '#2a2a5a']]));
    reflect(102, 147, { str: 0.62, tint: '#5a3a60', src: 99, wave: 1.3, fade: 0.55 });
    glitter(204, 103, 147, '#ffd890', 26);
    ripples(102, 147, 110, '#ffb880', 0.3);
    // long-tail boats
    function boat(x, y, s, flip) { P([x - 10 * s, y - 2 * s, x + 10 * s, y - 2 * s, x + 8 * s, y, x - 7 * s, y], '#5a2a2a'); P([x + 8 * s * flip, y - 2 * s, x + 13 * s * flip, y - 5 * s, x + 11 * s * flip, y - 1.5 * s], '#7a3a2a'); R(x - 6 * s, y - 3 * s, 8 * s, 1, '#e8c040'); person(x - 2 * s, y - 2 * s, '#e04040', '#c89060'); person(x + 3 * s, y - 2 * s, '#4060e0', '#e8b890'); R(x - 18 * s * flip, y, 12 * s, 1, rgba('#ffffff', 0.5)); }
    boat(60, 120, 1, 1); boat(170, 134, 1.4, -1); boat(30, 140, 0.8, 1);
    // pavilion foreground right
    var sx = 222; R(sx - 16, 128, 32, 3, '#c8a070'); for (i = -14; i <= 14; i += 7) R(sx + i, 112, 2, 16, '#c83a2a');
    P([sx - 20, 113, sx - 12, 102, sx + 12, 102, sx + 20, 113], '#c84a2a'); P([sx - 12, 102, sx - 6, 92, sx + 6, 92, sx + 12, 102], '#2a6a4a'); R(sx - 20, 113, 40, 1, '#ffd040'); R(sx - 12, 102, 24, 1, '#ffd040'); px(sx - 21, 111, '#ffd040'); px(sx + 20, 111, '#ffd040'); px(sx - 7, 90, '#ffd040'); px(sx + 6, 90, '#ffd040');
    for (i = 0; i < 8; i++) bird(rf(40, 200), rf(14, 60), '#2a1e3a');
    post({ lv: 14 });
  };
  function watArun(cx, base) {
    var ivory = '#f0dcc8', mid = '#c8a8a0', shd = '#6a4a6a', dots = ['#3a8ad0', '#e8504a', '#f0c040', '#40b080', '#ffffff', '#c060c0'];
    function prang(x, b, h, w) {
      var g = LG(x - w, 0, x + w, 0, [[0, '#ffe0c0'], [0.35, ivory], [0.7, mid], [1, shd]]);
      prof(x, b, h, function (u) { if (u < 0.22) return w * (1 - Math.floor(u / 0.055) * 0.06); if (u < 0.85) { var v = (u - 0.22) / 0.63; return w * 0.62 * Math.pow(1 - v, 0.55) * (0.93 + 0.07 * Math.cos(v * 40)) + 1; } return 1.1 * (1 - (u - 0.85) / 0.15) + 0.3; }, g);
      for (var k = 1; k < 16; k++) { var u = 0.22 + k * 0.04; if (u > 0.85) break; var y = b - u * h, v = (u - 0.22) / 0.63, hw = w * 0.62 * Math.pow(1 - v, 0.55) + 1; for (var xx = x - hw + 1; xx < x + hw - 1; xx += 2) px(xx, y, pick(dots)); }
      for (k = 0; k < 4; k++) { var yy = b - k * 0.055 * h - 1; R(x - w * (1 - k * 0.06), yy, w * 2 * (1 - k * 0.06), 1, '#a87a7a'); for (xx = x - w + 2; xx < x + w - 2; xx += 4) px(xx, yy - 2, pick(dots)); }
      R(x - 0.5, b - h - 4, 1, 5, '#ffd040');
    }
    prang(cx - 74, base, 30, 9); prang(cx + 74, base, 30, 9);
    prang(cx - 46, base, 48, 13); prang(cx + 46, base, 48, 13);
    prang(cx, base, 92, 30);
    // windows/niches on main prang
    for (var k = 0; k < 4; k++) { var y = base - 30 - k * 12; R(cx - 2, y, 4, 4, '#4a2a4a'); px(cx - 1, y + 1, '#ffd070'); }
    c.fillStyle = RG(cx - 10, base - 40, 0, 40, [[0, 'rgba(255,190,120,0.25)'], [1, 'rgba(255,190,120,0)']]); c.fillRect(cx - 50, base - 80, 100, 80);
  }

  /* ================= BUILDINGS ================= */
  var BD = {};
  function daySky() { sky([[0, '#3a80d0'], [0.7, '#9ccbee'], [1, '#e0f0f8']], 80); }
  function bClouds(cols) { cumulus(rf(0, 20), rf(14, 22), rf(18, 28), rf(5, 7), cols || ['#a8bcd8', '#e0eaf4', '#ffffff', '#ffffff'], -1); cumulus(rf(70, 95), rf(10, 18), rf(16, 24), rf(4, 6), cols || ['#a8bcd8', '#e0eaf4', '#ffffff', '#ffffff'], -1); }
  function sidewalk(y) { R(0, y, W, H - y, '#a8a8b0'); R(0, y, W, 1, '#e0e0e8'); for (var x = 0; x < W; x += 8) R(x, y + 1, 1, H - y - 1, '#8a8a94'); for (var yy = y + 5; yy < H; yy += 5) R(0, yy, W, 1, '#90909a'); R(0, H - 5, W, 5, '#4a4a54'); for (x = 2; x < W; x += 12) R(x, H - 3, 6, 1, '#e8e0a0'); }
  function columns(x0, x1, y0, y1, n, cw, cols) {
    var gap = (x1 - x0 - cw) / (n - 1);
    for (var i = 0; i < n; i++) {
      var x = x0 + i * gap; R(x, y0, cw, y1 - y0, LG(x, 0, x + cw, 0, [[0, cols[0]], [0.4, cols[1]], [1, cols[2]]]));
      for (var k = 1; k < cw - 1; k += 2) R(x + k, y0 + 2, 1, y1 - y0 - 4, rgba('#000000', 0.12));
      R(x - 1, y0, cw + 2, 2, cols[0]); R(x - 1, y0 + 2, cw + 2, 1, cols[2]); R(x - 1, y1 - 2, cw + 2, 2, cols[1]);
    }
  }

  BD.bank = function () {
    daySky(); bClouds();
    skyline({ y: 70, hMin: 20, hMax: 50, wMin: 8, wMax: 16, col: '#a8b8cc', x0: 0, x1: W, winP: 0.25, win: '#c8d8e8' });
    var st = '#c8ccd0', sl = '#f0f2f4', sd = '#7a8088';
    R(10, 36, 100, 48, '#5a5e66');
    R(14, 40, 92, 44, '#3a3e48'); // recess
    R(52, 58, 16, 26, '#8a6a3a'); R(53, 59, 6, 25, '#b88a4a'); R(61, 59, 6, 25, '#a87a3a'); px(59, 72, '#ffe080'); px(61, 72, '#ffe080');
    for (var i = 0; i < 2; i++) { R([24, 82][i], 56, 12, 16, '#2a3448'); R([24, 82][i], 56, 12, 1, '#8aa0c0'); R([30, 88][i], 56, 1, 16, '#5a6a80'); }
    columns(14, 106, 40, 82, 6, 7, [sl, st, sd]);
    // entablature + pediment
    R(8, 30, 104, 10, LG(0, 30, 0, 40, [[0, sl], [1, st]])); R(8, 39, 104, 1, sd); R(6, 29, 108, 2, sl);
    R(44, 31, 32, 8, '#3a3e48'); R(44, 31, 32, 1, '#1e222a'); text('BANK', 60 - textW('BANK') / 2, 32, '#ffd860', '#7a5a10');
    P([4, 29, 60, 8, 116, 29], sl); P([12, 27, 60, 12, 108, 27], '#a8acb4'); P([60, 12, 108, 27, 60, 27], '#9a9ea8');
    E(60, 21, 5, 5, '#d8a830'); E(60, 21, 4, 4, '#f0c840'); text('$', 59, 19, '#8a6010');
    // steps
    for (var s = 0; s < 4; s++) { R(6 - s * 2, 82 + s * 2, 108 + s * 4, 2, s % 2 ? st : sl); }
    sidewalk(90);
    // lamps
    [3, 116].forEach(function (lx) { R(lx, 64, 1, 26, '#2a2a2a'); E(lx + 0.5, 63, 2, 2, '#ffe8a0'); });
    // armored truck
    R(82, 86, 22, 9, '#3a5a3a'); R(98, 84, 8, 11, '#3a5a3a'); R(99, 85, 5, 4, '#8ab0c8'); R(84, 88, 10, 2, '#e8c040'); E(86, 95, 2, 2, '#1a1a1a'); E(100, 95, 2, 2, '#1a1a1a');
    person(30, 92, '#2a2a3a'); person(40, 94, '#c03030');
    post({ lv: 14 });
  };

  BD.hotel = function () {
    sky([[0, '#2a2a6a'], [0.5, '#8a4a7a'], [0.85, '#f08a6a'], [1, '#ffc080']], 90);
    stars(20, 30);
    skyline({ y: 84, hMin: 14, hMax: 40, wMin: 7, wMax: 14, col: '#3a2e5a', x0: 0, x1: W, winP: 0.3, win: '#ffd070' });
    // wings
    R(8, 44, 26, 44, '#c8b098'); R(86, 44, 26, 44, '#a89080'); R(8, 44, 26, 1, '#f0d8c0'); R(86, 44, 26, 1, '#d8c0a8');
    windows(11, 48, 22, 34, 3, 3, 2, 2, function () { return rnd() < 0.55 ? pick(['#ffd880', '#ffe8a0', '#ffc060']) : '#3a3a6a'; });
    windows(89, 48, 22, 34, 3, 3, 2, 2, function () { return rnd() < 0.55 ? pick(['#ffd880', '#ffe8a0', '#ffc060']) : '#3a3a6a'; });
    // tower
    R(32, 12, 56, 76, LG(32, 0, 88, 0, [[0, '#f0dcc0'], [0.6, '#d8c0a0'], [1, '#9a8070']]));
    windows(35, 18, 52, 52, 4, 4, 2, 2, function (x) { return rnd() < 0.6 ? pick(['#ffd880', '#ffe8a0', '#ffc060', '#fff4c8']) : (x > 70 ? '#2a2a5a' : '#4a4a7a'); });
    for (var x = 34; x < 88; x += 6) R(x, 16, 1, 56, rgba('#ffffff', 0.25));
    R(30, 10, 60, 3, '#e8d0b0'); R(30, 12, 60, 1, '#8a7060');
    // roof sign
    R(38, 1, 44, 8, '#2a1a2a'); c.fillStyle = RG(60, 5, 0, 30, [[0, 'rgba(255,60,80,0.45)'], [1, 'rgba(255,60,80,0)']]); c.fillRect(30, 0, 60, 20);
    text('HOTEL', 60 - textW('HOTEL') / 2, 3, '#ff5a6a', '#8a1a2a'); R(38, 1, 44, 1, '#ff8a9a');
    // stars above canopy
    for (var i = 0; i < 5; i++) starShape(46 + i * 7, 70, '#ffd040');
    // canopy
    P([40, 74, 80, 74, 84, 80, 36, 80], '#c82a2a'); for (x = 38; x < 84; x += 4) P([x, 80, x + 2, 80, x + 1, 82], x % 8 < 4 ? '#c82a2a' : '#f0f0f0'); for (x = 40; x < 80; x += 8) R(x, 74, 4, 6, '#f0f0f0');
    R(48, 80, 24, 8, '#ffe8a0'); R(48, 80, 24, 1, '#c8a040'); for (x = 50; x < 72; x += 5) R(x, 81, 1, 7, '#c8a040');
    R(38, 80, 2, 8, '#8a6a3a'); R(80, 80, 2, 8, '#8a6a3a');
    // palms + flags
    palm(16, 92, 26, 1, ['#6a4a3a', '#8a6a4a', '#1e4a2a', '#3a7a3a']); palm(104, 92, 28, -1, ['#6a4a3a', '#8a6a4a', '#1e4a2a', '#3a7a3a']);
    sidewalk(88); R(36, 88, 48, 3, '#a02a2a');
    // taxi
    R(84, 90, 20, 5, '#f0c020'); R(87, 87, 13, 3, '#f0c020'); R(88, 88, 5, 2, '#5a6a8a'); R(94, 88, 5, 2, '#5a6a8a'); R(91, 86, 4, 1, '#ffffff'); E(88, 95, 2, 2, '#1a1a1a'); E(100, 95, 2, 2, '#1a1a1a'); px(103, 92, '#fff0a0');
    person(44, 92, '#a02a2a', '#c89060'); px(44, 87, '#1a1a1a'); person(66, 93, '#3a3aa0'); person(72, 92, '#e0a020');
    post({ lv: 14 });
  };

  BD.sports = function () {
    sky([[0, '#3a80d0'], [1, '#c8e4f4']], 26);
    skyline({ y: 24, hMin: 4, hMax: 12, wMin: 5, wMax: 10, col: '#8aa0b8', x0: 0, x1: W });
    R(0, 24, W, 76, LG(0, 24, 0, 100, [[0, '#5a8a4a'], [1, '#3a6a30']]));
    for (var i = 0; i < 20; i++) tree(rf(0, 120), rf(28, 36), rf(2, 3), ['#2a5a2a', '#3a7a34', '#8ac060']);
    var cx = 60, cy = 58;
    E(cx, cy + 4, 56, 30, '#5a5e6a'); // outer shadow
    E(cx, cy, 56, 30, LG(0, cy - 30, 0, cy + 30, [[0, '#f0f0f4'], [1, '#a8aab8']]));
    for (var a = 0; a < Math.PI * 2; a += 0.12) { var x = cx + Math.cos(a) * 55, y = cy + Math.sin(a) * 29; if (Math.sin(a) > -0.2) L(x, y, x, y + 6, '#8a8c9a'); }
    // stands
    E(cx, cy, 50, 25, '#3a3e4a');
    var crowd = ['#e83a3a', '#3a6ae8', '#ffffff', '#ffd040', '#2a2a3a', '#e88a3a', '#40c060'];
    for (var r = 0; r < 9; r++) { var rx = 49 - r * 1.8, ry = 24 - r * 1.2; for (a = 0; a < Math.PI * 2; a += 1 / rx) if (rnd() < 0.8) px(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, pick(crowd)); }
    // pitch
    E(cx, cy, 33, 13, '#2e7a2e');
    for (var k = -32; k < 32; k += 6) R(cx + k, cy - 13, 3, 26, rgba('#5ab04a', 0.6));
    E(cx, cy, 33, 13, rgba('#000000', 0)); R(cx - 26, cy - 9, 52, 1, '#ffffff'); R(cx - 26, cy + 9, 52, 1, '#ffffff'); R(cx - 26, cy - 9, 1, 18, '#ffffff'); R(cx + 26, cy - 9, 1, 19, '#ffffff'); R(cx, cy - 9, 1, 18, '#ffffff');
    for (a = 0; a < Math.PI * 2; a += 0.2) px(cx + Math.cos(a) * 5, cy + Math.sin(a) * 3, '#ffffff');
    R(cx - 26, cy - 4, 5, 8, rgba('#ffffff', 0)); L(cx - 26, cy - 4, cx - 21, cy - 4, '#ffffff'); L(cx - 21, cy - 4, cx - 21, cy + 4, '#ffffff'); L(cx - 21, cy + 4, cx - 26, cy + 4, '#ffffff');
    L(cx + 26, cy - 4, cx + 21, cy - 4, '#ffffff'); L(cx + 21, cy - 4, cx + 21, cy + 4, '#ffffff'); L(cx + 21, cy + 4, cx + 26, cy + 4, '#ffffff');
    // players
    for (i = 0; i < 10; i++) px(cx + rf(-24, 24), cy + rf(-8, 8), i % 2 ? '#ff3030' : '#3050ff');
    px(cx + 3, cy + 1, '#ffffff');
    // roof canopy back
    for (a = Math.PI * 1.05; a < Math.PI * 1.95; a += 0.01) { var xx = cx + Math.cos(a) * 52, yy = cy + Math.sin(a) * 27; R(xx, yy, 1, 4, '#e8eef4'); px(xx, yy + 4, '#9aa4b4'); }
    // floodlights
    [[8, 30], [112, 30], [10, 84], [110, 84]].forEach(function (f) { R(f[0], f[1] - 26, 1, 26, '#4a4a54'); R(f[0] - 3, f[1] - 30, 7, 4, '#2a2a34'); for (var j = 0; j < 3; j++) px(f[0] - 2 + j * 2, f[1] - 29, '#fff8c0'); c.fillStyle = RG(f[0], f[1] - 28, 0, 10, [[0, 'rgba(255,250,200,0.6)'], [1, 'rgba(255,250,200,0)']]); c.fillRect(f[0] - 10, f[1] - 38, 20, 20); });
    // big screen
    R(50, 86, 20, 10, '#1a1a2a'); R(51, 87, 18, 8, '#2a4a8a'); text('*', 52, 88, '#ffd040'); px(60, 89, '#ff4040'); px(62, 90, '#ffffff'); R(59, 96, 2, 4, '#4a4a54');
    post({ lv: 14 });
  };

  BD.palace = function () {
    daySky(); bClouds();
    var w = '#f4ead8', wl = '#ffffff', ws = '#c8b4a0', gold = '#e8b030', gl = '#fff090', gd = '#a06a10';
    function onion(x, b, r, h) { prof(x, b, h, function (u) { var w2 = u < 0.7 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.35) / 0.6, 2))) : Math.sqrt(1 - Math.pow(0.35 / 0.6, 2)) * Math.pow((1 - u) / 0.3, 1.4); return r * w2; }, LG(x - r, 0, x + r, 0, [[0, gl], [0.35, gold], [1, gd]])); R(x - 0.5, b - h - 5, 1, 5, gd); }
    function flag(x, y, col) { R(x, y - 8, 1, 8, '#4a4a4a'); P([x + 1, y - 8, x + 8, y - 6.5, x + 1, y - 5], col); P([x + 1, y - 7, x + 8, y - 6.5, x + 5, y - 6], lt(col, 0.3)); }
    // wings
    R(4, 46, 112, 40, LG(0, 46, 0, 86, [[0, wl], [1, w]])); R(4, 44, 112, 3, ws); R(4, 44, 112, 1, wl);
    for (var x = 8; x < 112; x += 8) { if (x > 40 && x < 80) continue; R(x, 52, 4, 9, '#5a7aa0'); E(x + 2, 52, 2, 2, '#5a7aa0'); R(x, 52, 1, 9, '#a8c0d8'); R(x - 1, 61, 6, 1, ws); R(x, 68, 4, 9, '#5a7aa0'); E(x + 2, 68, 2, 2, '#5a7aa0'); R(x - 1, 77, 6, 1, ws); }
    R(4, 63, 112, 1, ws);
    // center
    R(38, 30, 44, 56, LG(38, 0, 82, 0, [[0, wl], [0.6, w], [1, ws]])); R(36, 28, 48, 3, gold); R(36, 30, 48, 1, gd);
    for (x = 42; x < 80; x += 9) { R(x, 36, 5, 12, '#4a6a98'); E(x + 2.5, 36, 2.5, 2.5, '#4a6a98'); R(x, 36, 1, 12, '#a8c0d8'); }
    R(40, 50, 40, 2, gold); for (x = 41; x < 80; x += 3) R(x, 52, 1, 3, gd);
    P([52, 86, 52, 66, 60, 58, 68, 66, 68, 86], '#6a3a2a'); P([54, 86, 54, 67, 60, 61, 66, 67, 66, 86], '#a8642a'); R(59.5, 62, 1, 24, '#5a2a1a');
    onion(60, 28, 14, 26); onion(20, 44, 7, 14); onion(100, 44, 7, 14); onion(40, 30, 4, 9); onion(80, 30, 4, 9);
    flag(60.5, 0, '#d82a2a'); flag(20.5, 30, '#2a5ad8'); flag(100.5, 30, '#2a5ad8');
    // fence
    sidewalk(88); R(0, 86, W, 3, '#c8c0b0');
    for (x = 0; x < W; x += 3) { R(x, 79, 1, 9, gd); px(x, 78, gl); } R(0, 82, W, 1, gold);
    R(56, 76, 8, 12, '#d8c8a8');
    // guards
    [48, 72].forEach(function (gx) { R(gx - 1, 84, 3, 8, '#c82a2a'); R(gx - 1, 80, 3, 4, '#1a1a1a'); px(gx, 84, '#f0c8a0'); R(gx - 1, 92, 1, 3, '#1a1a2a'); R(gx + 1, 92, 1, 3, '#1a1a2a'); R(gx + 2, 82, 1, 10, '#8a8a8a'); });
    // hedges
    for (var i = 0; i < 6; i++) { E(8 + i * 20, 96, 5, 3, '#2e6a2e'); E(7 + i * 20, 95, 3, 1.5, '#5aa04a'); }
    post({ lv: 14 });
  };

  BD.museum = function () {
    daySky(); bClouds();
    var m = '#f2eee6', ml = '#ffffff', ms = '#a8a49c';
    // dome behind
    prof(60, 22, 16, function (u) { return 18 * Math.sqrt(Math.max(0, 1 - u * u)); }, LG(42, 0, 78, 0, [[0, '#a8d0c8'], [0.5, '#6aa898'], [1, '#3a6a64']]));
    R(40, 18, 40, 6, LG(40, 0, 80, 0, [[0, ml], [1, ms]])); for (var x = 42; x < 80; x += 4) R(x, 19, 1, 4, '#8a8680'); R(59, 2, 2, 5, '#c8a040');
    R(4, 40, 112, 44, '#4a4640'); R(8, 42, 104, 42, '#2e2c2a');
    R(54, 60, 12, 24, '#3a2a1e'); R(55, 61, 10, 23, '#6a4a2a');
    columns(10, 110, 40, 82, 8, 6, [ml, m, ms]);
    // banners
    var bc = [['#c82a3a', '#ffd040'], ['#2a5ac8', '#ffffff'], ['#2a9a5a', '#ffd040'], ['#8a2ac8', '#ffffff']];
    [16.2, 29.6, 83.4, 96.8].forEach(function (bx, i) {
      R(bx - 1, 45, 10, 1, '#c8a040');
      R(bx, 46, 8, 22, bc[i][0]); P([bx, 68, bx + 4, 65, bx + 8, 68, bx + 8, 70, bx, 70], bc[i][0]); R(bx + 7, 46, 1, 22, lt(bc[i][0], -0.3));
      if (i === 0) { R(bx + 2, 52, 4, 2, bc[i][1]); px(bx + 5, 50, bc[i][1]); px(bx + 5, 51, bc[i][1]); px(bx + 2, 54, bc[i][1]); px(bx + 5, 54, bc[i][1]); px(bx + 1, 51, bc[i][1]); } // dino
      if (i === 1) { E(bx + 4, 55, 2.5, 3.5, bc[i][1]); R(bx + 3, 50, 2, 2, bc[i][1]); } // vase
      if (i === 2) { E(bx + 4, 52, 2, 2, bc[i][1]); R(bx + 2, 55, 4, 5, bc[i][1]); } // bust
      if (i === 3) { R(bx + 1, 50, 6, 6, bc[i][1]); R(bx + 2, 51, 4, 4, '#4a2a8a'); px(bx + 3, 52, '#ffd040'); } // painting
    });
    R(2, 30, 116, 10, LG(0, 30, 0, 40, [[0, ml], [1, m]])); R(2, 39, 116, 1, ms); R(0, 29, 120, 2, ml);
    text('MUSEUM', 60 - textW('MUSEUM') / 2, 32, '#5a5048', '#c8c0b0');
    P([0, 29, 60, 10, 120, 29], ml); P([8, 27, 60, 14, 112, 27], '#d8d2c8'); P([60, 14, 112, 27, 60, 27], '#c4beb4');
    for (var k = 0; k < 7; k++) { var fx = 30 + k * 10, fy = 25 - (k < 3 ? k * 2.5 : (6 - k) * 2.5) * 0.9; R(fx, fy - 2, 2, 4, '#b0aaa0'); px(fx + 0.5, fy - 3, '#b0aaa0'); }
    for (var s = 0; s < 5; s++) R(2 - s * 2, 82 + s * 2, 116 + s * 4, 2, s % 2 ? m : ml);
    sidewalk(92);
    // statue
    R(14, 84, 8, 8, '#c8c4bc'); R(14, 84, 8, 1, '#ffffff'); R(16, 76, 4, 8, '#7a9a8a'); E(18, 75, 1.5, 1.5, '#7a9a8a'); R(19, 72, 1, 4, '#7a9a8a');
    people(6, 30, 110, 90, 99);
    post({ lv: 14 });
  };

  BD.airport = function () {
    sky([[0, '#2a70c8'], [0.8, '#a8d4f4'], [1, '#e8f4fa']], 66);
    bClouds();
    // plane taking off
    var pxp = 74, pyp = 20;
    R(pxp - 30, pyp + 10, 24, 1, rgba('#ffffff', 0.7)); R(pxp - 26, pyp + 12, 20, 1, rgba('#ffffff', 0.5));
    P([pxp - 10, pyp + 6, pxp + 12, pyp - 2, pxp + 15, pyp - 1, pxp - 7, pyp + 8], '#f4f6f8'); P([pxp - 10, pyp + 7, pxp + 14, pyp - 1, pxp - 7, pyp + 8], '#a8b0c0');
    P([pxp - 2, pyp + 3, pxp - 8, pyp - 3, pxp - 5, pyp - 3, pxp + 3, pyp + 1], '#d8dce4'); P([pxp, pyp + 4, pxp + 2, pyp + 10, pxp + 5, pyp + 9, pxp + 4, pyp + 2], '#c0c6d0');
    P([pxp - 9, pyp + 6, pxp - 12, pyp, pxp - 9, pyp + 1, pxp - 6, pyp + 5], '#d83a3a');
    for (var i = 0; i < 6; i++) px(pxp - 2 + i * 2, pyp + 2 - i * 0.7, '#3a4a6a');
    // tower
    R(98, 24, 6, 60, LG(98, 0, 104, 0, [[0, '#f0f0f4'], [1, '#9aa0b0']])); P([93, 24, 109, 24, 106, 16, 96, 16], '#2a5a6a'); R(94, 16, 14, 1, '#8ad0e0'); R(92, 24, 18, 2, '#d8dce4'); R(95, 13, 12, 3, '#e8e8ec'); R(100.5, 5, 1, 8, '#4a4a54'); px(100, 4, '#ff3030');
    for (var y = 30; y < 82; y += 6) R(100, y, 2, 2, '#3a4a6a');
    // terminal
    var tp = []; tp.push(0, 84, 0, 56); bez(0, 56, 46, 44, 96, 58, 16, tp); tp.push(96, 84);
    P(tp, LG(0, 50, 0, 84, [[0, '#2a5a8a'], [0.3, '#5a9ac8'], [1, '#2a4a6a']]));
    var rp = []; bez(-2, 56, 46, 43, 98, 58, 16, rp); for (i = 0; i < rp.length; i += 2) { R(rp[i], rp[i + 1] - 2, 2, 3, '#f4f4f8'); px(rp[i], rp[i + 1] + 1, '#8a90a0'); }
    for (var x = 4; x < 96; x += 6) R(x, 54, 1, 30, rgba('#d8e8f8', 0.6)); R(0, 68, 96, 1, '#d8e8f4');
    for (i = 0; i < 40; i++) px(rf(2, 94), rf(58, 82), rgba('#ffffff', 0.6));
    R(0, 82, W, 2, '#d8d8e0');
    text('AIRPORT', 48 - textW('AIRPORT') / 2, 72, '#ffffff', '#1a3a5a');
    // apron + runway
    R(0, 84, W, 16, '#5a5e66'); R(0, 84, W, 1, '#8a8e98'); for (x = 2; x < W; x += 10) R(x, 92, 6, 1, '#f0f0f0'); for (x = 0; x < W; x += 6) px(x, 98, x % 12 ? '#ffd040' : '#40ff60');
    // parked plane
    R(10, 86, 30, 4, '#f4f4f8'); P([40, 86, 44, 88, 40, 90], '#f4f4f8'); P([12, 86, 8, 80, 14, 86], '#2a6ad8'); R(20, 89, 12, 2, '#c8ccd4'); for (i = 0; i < 9; i++) px(16 + i * 2.5, 87, '#3a4a6a'); R(42, 84, 4, 2, '#d8d8e0');
    // windsock
    R(112, 76, 1, 8, '#4a4a54'); P([113, 76, 119, 77, 119, 78, 113, 79], '#ff7020'); R(115, 76, 1, 3, '#ffffff');
    post({ lv: 14 });
  };

  BD.library = function () {
    daySky(); bClouds();
    var brick = '#a8483a';
    R(0, 70, W, 20, '#3a6a3a');
    // roof
    P([4, 28, 14, 16, 106, 16, 116, 28], '#4a5260'); for (var y = 18; y < 28; y += 2) R(10, y, 100, 1, '#3a404c'); R(14, 16, 92, 1, '#7a8494');
    [30, 60, 90].forEach(function (dx) { R(dx - 4, 12, 8, 8, '#e8e0d0'); P([dx - 5, 12, dx, 7, dx + 5, 12], '#4a5260'); R(dx - 2, 14, 4, 5, '#ffd880'); });
    // brick body
    R(4, 28, 112, 56, brick);
    for (y = 29; y < 84; y += 3) { R(4, y, 112, 1, '#7a3028'); for (var x = 4 + ((y / 3 | 0) % 2) * 3; x < 116; x += 6) px(x, y + 1, '#7a3028'); }
    for (var i = 0; i < 160; i++) px(rf(4, 116), rf(29, 84), pick(['#c8604a', '#8a3a30', '#b85440']));
    R(2, 26, 116, 3, '#e8e0d0'); R(4, 52, 112, 2, '#e8e0d0');
    // windows with books
    var books = ['#c83a3a', '#3a6ac8', '#e8b030', '#3a9a5a', '#8a3ac8', '#e87a3a', '#f0f0e0', '#5a3a2a'];
    function bwin(x, y, w, h) { R(x - 1, y - w / 2 - 1, w + 2, h + w / 2 + 2, '#e8e0d0'); E(x + w / 2, y, w / 2, w / 2, '#ffe0a0'); R(x, y, w, h, '#ffe0a0'); for (var sh = y + 2; sh < y + h; sh += 5) { for (var bx = x; bx < x + w; bx++) R(bx, sh, 1, 4 - (bx % 3 === 0 ? 1 : 0), pick(books)); R(x, sh + 4, w, 1, '#6a4a2a'); } R(x + w / 2, y - w / 2, 1, h + w / 2, '#5a4a3a'); }
    [12, 28, 80, 96].forEach(function (wx) { bwin(wx, 36, 10, 14); bwin(wx, 61, 10, 16); });
    // entrance
    R(44, 30, 32, 54, '#d8d0c0'); R(44, 30, 32, 1, '#ffffff'); R(74, 30, 2, 54, '#a8a090');
    R(46, 36, 28, 6, '#2a2a3a'); text('LIBRARY', 60 - textW('LIBRARY') / 2, 37, '#ffd060');
    P([50, 84, 50, 56, 60, 48, 70, 56, 70, 84], '#5a3a24'); P([52, 84, 52, 57, 60, 51, 68, 57, 68, 84], '#8a5a30'); R(59.5, 51, 1, 33, '#4a2a18'); px(58, 70, '#ffd040'); px(61, 70, '#ffd040');
    E(60, 56, 5, 3, '#ffe0a0'); for (var k = -4; k <= 4; k += 2) L(60, 58, 60 + k, 54, '#5a3a24');
    for (var s = 0; s < 4; s++) R(36 - s * 3, 84 + s * 2, 48 + s * 6, 2, s % 2 ? '#c8c0b0' : '#e8e0d0');
    sidewalk(92);
    // lions
    [26, 94].forEach(function (lx) { R(lx - 6, 82, 12, 6, '#d8d0c0'); R(lx - 6, 82, 12, 1, '#ffffff'); E(lx, 79, 5, 3, '#c8c0b0'); E(lx + (lx < 60 ? 4 : -4), 76, 2.5, 3, '#c8c0b0'); px(lx + (lx < 60 ? 5 : -5), 75, '#5a5a5a'); });
    tree(4, 92, 8, ['#2a5a2a', '#4a8a3a', '#9ad060']); tree(116, 92, 8, ['#2a5a2a', '#4a8a3a', '#9ad060']);
    people(4, 30, 90, 92, 99);
    post({ lv: 14 });
  };

  BD.market = function () {
    sky([[0, '#4a8ad8'], [1, '#f0e0c8']], 50);
    // old town backdrop
    var hc = ['#e8b878', '#d88a6a', '#f0d8a8', '#c8a0a0', '#a8c0a0'];
    for (var x = 0; x < W; ) { var w = ri(14, 22), h = ri(26, 40), col = pick(hc); R(x, 58 - h, w, h + 4, col); P([x - 1, 58 - h, x + w / 2, 58 - h - 8, x + w + 1, 58 - h], '#a84a3a'); for (var yy = 62 - h; yy < 56; yy += 7) for (var xx = x + 3; xx < x + w - 3; xx += 5) { R(xx, yy, 3, 4, '#4a5a7a'); R(xx - 1, yy + 4, 5, 1, '#f0f0e0'); if (rnd() < 0.3) R(xx - 1, yy + 4, 5, 2, pick(['#e83a5a', '#ffd040'])); } x += w; }
    // bunting
    for (x = 0; x < W; x += 4) { var by = 14 + Math.sin(x / W * Math.PI) * 6; P([x, by, x + 3, by, x + 1.5, by + 3], pick(['#e83a3a', '#ffd040', '#3a8ae8', '#40c060'])); } L(0, 14, 120, 14, '#4a4a4a');
    R(0, 60, W, 40, '#b8a890'); for (yy = 61; yy < 100; yy += 3) for (xx = (yy % 2) * 3; xx < W; xx += 6) R(xx, yy, 5, 2, (xx + yy) % 4 ? '#a89880' : '#c8b8a0');
    // stalls
    var aw = [['#d82a2a', '#ffffff'], ['#2a9a4a', '#ffffff'], ['#2a5ad8', '#ffd040']];
    var fruit = [['#ff8a20', '#ffb040'], ['#d82a2a', '#ff6a5a'], ['#f0d020', '#fff080'], ['#7a2a9a', '#a85ac8'], ['#3a9a2a', '#7ad04a']];
    for (var s = 0; s < 3; s++) {
      var sx = 4 + s * 39, sw = 34;
      R(sx + 1, 46, 1, 36, '#6a4a2a'); R(sx + sw - 2, 46, 1, 36, '#6a4a2a');
      P([sx - 2, 52, sx + 2, 40, sx + sw - 2, 40, sx + sw + 2, 52], aw[s][0]);
      for (var k = 0; k < 6; k++) { var kx = sx + k * (sw / 6); P([kx + 2 - (k - 3) * 0.6, 40, kx + 2 + sw / 12 - (k - 3) * 0.6, 40, kx + sw / 12 + 0.6 * (k - 2.5) + 1, 52, kx + 0.6 * (k - 2.5) - 1 + 2, 52], aw[s][1]); }
      for (k = 0; k < 7; k++) E(sx - 1 + k * 5.4 + 2.5, 52, 2.6, 2, k % 2 ? aw[s][1] : aw[s][0]);
      R(sx + 2, 54, sw - 4, 10, '#3a2a2a'); // shadow inside
      person(sx + sw / 2, 64, pick(['#e8e0d0', '#3a6ac8', '#c83a3a']), '#c89060'); R(sx + sw / 2 - 2, 61, 4, 3, '#ffffff');
      // table + crates
      R(sx, 64, sw, 3, '#8a5a30'); R(sx, 64, sw, 1, '#c88a4a');
      for (k = 0; k < 3; k++) {
        var cx = sx + 1 + k * 11, f = fruit[(s * 3 + k) % 5];
        R(cx, 67, 10, 8, '#a87a40'); R(cx, 70, 10, 1, '#6a4a20'); R(cx, 67, 10, 1, '#d8a860');
        for (var j = 0; j < 14; j++) { var fx = cx + 1 + (j % 5) * 2, fy = 63 - Math.floor(j / 5) * 1.5 + (j % 2) * 0.5; if (f[0] === '#f0d020') { R(fx, fy + 2, 2, 1, f[0]); px(fx, fy + 1, f[1]); } else { E(fx + 0.5, fy + 2, 1.2, 1.2, f[0]); px(fx, fy + 1, f[1]); } }
        R(cx + 2, 72, 6, 2, '#ffffff'); px(cx + 3, 72, '#2a2a2a'); px(cx + 5, 73, '#2a2a2a');
      }
      R(sx + 2, 75, sw - 4, 7, '#6a4a2a');
    }
    // watermelons
    E(14, 88, 5, 3, '#2a6a2a'); E(13, 87, 2, 1, '#5aa04a'); P([22, 90, 30, 90, 26, 85], '#e83a4a'); R(22, 90, 8, 1, '#3a8a2a'); px(25, 88, '#2a2a2a'); px(27, 88, '#2a2a2a');
    people(10, 4, 116, 86, 100);
    // basket
    E(96, 92, 5, 2.5, '#c8904a'); for (var b = 0; b < 4; b++) E(94 + b * 1.6, 90, 1.2, 1.2, pick(['#ff8a20', '#d82a2a', '#3a9a2a']));
    post({ lv: 14 });
  };

  BD.station = function () {
    daySky(); bClouds();
    var st = '#c87a5a', sl = '#e8a07a', sd = '#7a4a3a', stone = '#e8dcc4';
    // side towers
    [4, 96].forEach(function (tx) { R(tx, 18, 20, 70, LG(tx, 0, tx + 20, 0, [[0, sl], [0.6, st], [1, sd]])); for (var y = 20; y < 88; y += 3) R(tx, y, 20, 1, rgba('#5a2a1a', 0.35)); P([tx - 1, 18, tx + 10, 6, tx + 21, 18], '#4a5a6a'); R(tx - 1, 18, 22, 2, stone); for (var k = 0; k < 3; k++) { R(tx + 4, 26 + k * 18, 4, 9, '#3a4a6a'); R(tx + 12, 26 + k * 18, 4, 9, '#3a4a6a'); E(tx + 6, 26 + k * 18, 2, 2, '#3a4a6a'); E(tx + 14, 26 + k * 18, 2, 2, '#3a4a6a'); } });
    // central facade
    R(24, 22, 72, 66, LG(24, 0, 96, 0, [[0, sl], [0.6, st], [1, sd]])); for (var y = 24; y < 88; y += 3) R(24, y, 72, 1, rgba('#5a2a1a', 0.3));
    R(22, 20, 76, 3, stone);
    // big arch glass
    var ax = 60, ay = 58, ar = 30;
    E(ax, ay, ar + 3, ar + 3, stone); R(ax - ar - 3, ay, ar * 2 + 6, 30, stone);
    for (var yy = ay - ar; yy < 88; yy++) { var dy = yy < ay ? (ay - yy) : 0, hw = yy < ay ? Math.sqrt(Math.max(0, ar * ar - dy * dy)) : ar; R(ax - hw, yy, hw * 2, 1, mix('#8ac0e0', '#2a4a6a', (yy - (ay - ar)) / 60)); }
    for (var a = 0; a <= Math.PI; a += Math.PI / 10) L(ax, ay, ax - Math.cos(a) * ar, ay - Math.sin(a) * ar, '#3a3a44');
    E(ax, ay, 10, 10, '#3a3a44'); E(ax, ay, 9, 9, '#a8d0e8'); for (a = 0; a <= Math.PI; a += Math.PI / 6) L(ax, ay, ax - Math.cos(a) * 9, ay - Math.sin(a) * 9, '#5a5a64');
    R(ax - ar, ay, ar * 2, 1, '#3a3a44'); for (var x = ax - ar; x < ax + ar; x += 6) R(x, ay, 1, 30, '#3a3a44');
    // train inside
    R(ax - 14, 70, 28, 18, '#d8d8e0'); R(ax - 14, 70, 28, 3, '#c82a2a'); R(ax - 10, 74, 20, 6, '#2a3a5a'); R(ax - 9, 74, 8, 2, '#6a8ab0'); E(ax - 9, 84, 2, 2, '#fff8c0'); E(ax + 9, 84, 2, 2, '#fff8c0'); R(ax - 14, 86, 28, 2, '#3a3a3a');
    for (x = ax - 28; x < ax + 28; x += 2) px(x, 66, rgba('#ffffff', 0.4));
    // clock
    E(60, 14, 9, 9, stone); E(60, 14, 7, 7, '#fffaf0'); for (var k = 0; k < 12; k++) { a = k / 12 * Math.PI * 2; px(59.5 + Math.cos(a) * 5.5, 13.5 + Math.sin(a) * 5.5, '#2a2a2a'); } L(60, 14, 60, 9, '#1a1a1a'); L(60, 14, 63, 15, '#1a1a1a'); px(60, 3, '#c8a040'); R(59.5, 2, 1, 3, '#c8a040');
    R(36, 24, 48, 6, '#2a3a4a'); text('STATION', 60 - textW('STATION') / 2, 25, '#ffe080');
    sidewalk(88);
    // taxis & people
    R(4, 90, 18, 5, '#f0c020'); R(7, 87, 11, 3, '#f0c020'); R(8, 88, 4, 2, '#5a6a8a'); R(13, 88, 4, 2, '#5a6a8a'); E(8, 95, 2, 2, '#1a1a1a'); E(18, 95, 2, 2, '#1a1a1a');
    people(9, 30, 116, 90, 99);
    post({ lv: 14 });
  };

  BD.harbor = function () {
    sky([[0, '#3a7ad0'], [0.8, '#b0d8f4'], [1, '#f0e8d8']], 58);
    bClouds();
    for (var i = 0; i < 6; i++) bird(rf(10, 110), rf(8, 30), i % 2 ? '#ffffff' : '#3a4a5a');
    ridge(58, 8, 20, '#7a9ab0', { off: 2, bottom: 60 });
    // crane + containers
    var cc = ['#d83a2a', '#2a6ad8', '#e8a020', '#2a9a5a', '#8a3a8a', '#e8e8e8'];
    for (var r = 0; r < 4; r++) for (var k = 0; k < 6; k++) { var x = 54 + k * 8 - r * 1, y = 56 - r * 5; var col = pick(cc); R(x, y, 8, 5, col); R(x, y, 8, 1, lt(col, 0.3)); for (var j = 1; j < 8; j += 2) px(x + j, y + 2, lt(col, -0.25)); }
    var gx = 94; R(gx, 14, 2, 46, '#e85a20'); R(gx + 14, 14, 2, 46, '#c84a18'); R(gx - 22, 12, 42, 3, '#e85a20'); R(gx - 22, 12, 42, 1, '#ff8a50'); for (x = gx - 20; x < gx + 18; x += 4) L(x, 15, x + 2, 12, '#a83a10'); L(gx + 2, 22, gx + 14, 14, '#c84a18'); L(gx + 2, 14, gx + 14, 22, '#c84a18'); R(gx - 10, 15, 4, 3, '#4a4a54'); R(gx - 8.5, 18, 1, 14, '#2a2a2a'); R(gx - 11, 32, 6, 4, '#2a9a5a');
    // water
    R(0, 60, W, 40, LG(0, 60, 0, 100, [[0, '#4a90c0'], [1, '#1e5a8a']]));
    reflect(60, 100, { str: 0.5, tint: '#2a6aa0', src: 60, wave: 1 });
    ripples(60, 100, 60, '#ffffff', 0.35);
    R(46, 60, 74, 4, '#8a8c94'); R(46, 60, 74, 1, '#c8cad0'); R(46, 63, 74, 1, '#4a4c54'); R(gx, 50, 2, 10, '#e85a20'); R(gx + 14, 50, 2, 10, '#c84a18');
    // lighthouse
    R(4, 50, 18, 10, '#8a8a8a'); R(4, 50, 18, 1, '#c8c8c8');
    prof(13, 50, 30, function (u) { return 4 - u * 1.5; }, '#f4f4f4'); for (var s = 0; s < 3; s++) R(9 + s * 0.5, 44 - s * 9, 8 - s, 4, '#d82a2a');
    R(10, 16, 6, 4, '#ffe880'); R(9, 15, 8, 1, '#2a2a2a'); P([9, 15, 13, 11, 17, 15], '#d82a2a'); c.fillStyle = RG(13, 18, 0, 12, [[0, 'rgba(255,250,180,0.6)'], [1, 'rgba(255,250,180,0)']]); c.fillRect(1, 6, 24, 24);
    // container ship
    P([30, 70, 92, 70, 88, 78, 34, 78], '#2a3a5a'); R(30, 76, 60, 2, '#c83a2a'); for (k = 0; k < 7; k++) { R(38 + k * 6, 64, 6, 6, pick(cc)); R(38 + k * 6, 64, 6, 1, rgba('#ffffff', 0.3)); } R(80, 58, 8, 12, '#f0f0f0'); R(81, 60, 6, 1, '#3a4a6a'); R(83, 54, 2, 4, '#2a2a2a');
    // sailboat
    R(10, 82, 14, 3, '#ffffff'); R(16, 66, 1, 16, '#5a4a3a'); P([17, 67, 17, 81, 25, 81], '#fff8f0'); P([15, 69, 15, 81, 9, 81], '#f0d8c8'); R(6, 86, 22, 1, rgba('#ffffff', 0.5));
    // pier foreground
    P([60, 100, 72, 84, 120, 84, 120, 100], '#8a6a4a'); for (y = 85; y < 100; y += 2) R(60 + (100 - y) * 0.5, y, 70, 1, '#6a4a30'); R(72, 84, 48, 1, '#c8a070');
    for (x = 74; x < 120; x += 10) { R(x, 84, 2, 16, '#5a3a24'); R(x, 82, 2, 2, '#3a3a3a'); }
    // fishing boat
    P([40, 88, 68, 88, 64, 96, 44, 96], '#e8e0d0'); R(40, 88, 28, 2, '#2a6ad8'); R(48, 82, 10, 6, '#ffffff'); R(50, 83, 2, 2, '#3a5a7a'); R(54, 83, 2, 2, '#3a5a7a'); R(56, 74, 1, 8, '#5a4a3a'); L(56, 74, 66, 88, '#5a4a3a'); R(38, 97, 32, 1, rgba('#ffffff', 0.5));
    person(90, 84, '#e8a020'); person(100, 84, '#c83a3a');
    for (i = 0; i < 2; i++) { E(108 + i * 6, 88, 2, 1.5, '#e8e8e8'); px(107 + i * 6, 87, '#3a3a3a'); }
    post({ lv: 14 });
  };

  /* ================= APPROACH SCENES (384x188) =================
     Wide shots of each building for the walk-up. One shared camera: eye 2.9 m up, horizon at y=72,
     focal 400 px, centred on x=192. Ground point (X m sideways, Z m ahead, Y m up) -> gx(X,Z), gy(Z,Y).
     Detective scale at depth Z is 12/Z (1.17 at the bottom edge, ~0.5 at a door 24 m away). */
  var AP = {}, FRONT = null, HZ = 72, EYE = 2.9, FL = 400, CX = 192;
  function gy(Z, Y) { return HZ + (EYE - (Y || 0)) * FL / Z; }
  function gx(X, Z) { return CX + X * FL / Z; }
  function wp(X, Z, Y) { return [Math.round(gx(X, Z)), Math.round(gy(Z, Y)), Math.round(1200 / Z) / 100]; }
  function gq(X0, X1, Z0, Z1, col, Y) { P([gx(X0, Z0), gy(Z0, Y), gx(X1, Z0), gy(Z0, Y), gx(X1, Z1), gy(Z1, Y), gx(X0, Z1), gy(Z1, Y)], col); }
  // foreground piece: drawn now, and re-drawn later as a mask for the front() layer (same seed, same shape)
  function fore(fn) { var sd = (rnd() * 4294967296) >>> 0; rnd = mb(sd); fn(); if (FRONT) FRONT.push([sd, fn]); }
  var XF = { F: '111100110100100', W: '10001/10001/10101/11011/10001', V: '101101101101010' };
  function glyph2(ch) { var g = XF[ch]; if (g) return g.indexOf('/') >= 0 ? g.split('/') : [g.substr(0, 3), g.substr(3, 3), g.substr(6, 3), g.substr(9, 3), g.substr(12, 3)]; return glyph(ch); }
  function tW(s, k) { var w = 0; for (var i = 0; i < s.length; i++) { var g = glyph2(s.charAt(i)); w += (g ? g[0].length : 3) + 1; } return (w - 1) * (k || 1); }
  function tx(s, x, y, col, sh, k) {
    k = k || 1; x = Math.round(x);
    for (var i = 0; i < s.length; i++) { var g = glyph2(s.charAt(i)); if (!g) { x += 4 * k; continue; } for (var r = 0; r < 5; r++) for (var q = 0; q < g[r].length; q++) if (g[r].charAt(q) === '1') { if (sh) R(x + q * k + 1, y + r * k + 1, k, k, sh); R(x + q * k, y + r * k, k, k, col); } x += (g[0].length + 1) * k; }
  }
  function txc(s, cx, y, col, sh, k) { tx(s, cx - tW(s, k) / 2, y, col, sh, k); }
  function apSky(st, y1) { sky(st || [[0, '#3a7ccc'], [0.62, '#9ccbee'], [1, '#e4f2f8']], y1 || 124); }
  function apClouds(n, cols, y0, y1) { for (var i = 0; i < n; i++) cumulus((i + rf(0, 0.5)) * W / n - 16, rf(y0 || 16, y1 || 44), rf(26, 50), rf(6, 10), cols || ['#a8bcd8', '#e0eaf4', '#ffffff', '#ffffff'], -1); }
  // perspective paving on the ground plane (or a raised plane Y)
  function pave(X0, X1, Z0, Z1, tX, tZ, base, joint, o) {
    o = o || {}; var Y = o.Y || 0, z, x, last = 1e9;
    gq(X0, X1, Z0, Z1, base, Y);
    if (o.vary) for (z = Z0; z < Z1; z += tZ) for (x = X0; x < X1; x += tX) if (rnd() < 0.45) gq(x, x + tX, z, Math.min(Z1, z + tZ), rgba(pick(o.vary), 0.45), Y);
    for (z = Z0; z <= Z1 + 1e-6; z += tZ) { var yy = Math.round(gy(z, Y)); if (last - yy < 2) continue; last = yy; R(gx(X0, z), yy, gx(X1, z) - gx(X0, z), 1, joint); }
    if (!o.noLong) for (x = X0; x <= X1 + 1e-6; x += tX) L(gx(x, Z0), gy(Z0, Y), gx(x, Z1), gy(Z1, Y), joint);
  }
  // flight of steps facing the camera: n steps of rise r, tread d, bottom front edge at Zs
  function stairs(Ws, Zs, n, r, d, tread, riser, edge) {
    for (var i = n - 1; i >= 0; i--) {
      var Z0 = Zs + i * d, Z1 = Z0 + d, yA = gy(Z0, i * r), yB = gy(Z0, (i + 1) * r), xl = gx(-Ws, Z0), xr = gx(Ws, Z0);
      P([gx(-Ws, Z1), gy(Z1, (i + 1) * r), gx(Ws, Z1), gy(Z1, (i + 1) * r), xr, yB, xl, yB], tread);
      R(xl, yB, xr - xl, yA - yB, riser); R(xl, yB, xr - xl, 1, edge); R(xl, yA - 1, xr - xl, 1, rgba('#000000', 0.18));
    }
  }
  function colm(x, y0, y1, cw, cols) {
    R(x, y0, cw, y1 - y0, LG(x, 0, x + cw, 0, [[0, cols[0]], [0.4, cols[1]], [1, cols[2]]]));
    for (var k = 2; k < cw - 1; k += 3) R(x + k, y0 + 5, 1, y1 - y0 - 10, rgba('#000000', 0.1));
    R(x - 2, y0, cw + 4, 3, cols[0]); R(x - 2, y0 + 3, cw + 4, 1, cols[2]); R(x - 1, y0 + 4, cw + 2, 1, cols[1]);
    R(x - 2, y1 - 3, cw + 4, 3, cols[1]); R(x - 2, y1 - 3, cw + 4, 1, cols[0]); R(x - 2, y1 - 1, cw + 4, 1, cols[2]);
  }
  // a pedestrian, feet at (x,y); s=1 is about 48 px tall
  function man(x, y, s, o) {
    o = o || {}; var coat = o.coat || '#3a5a8a', cs = lt(coat, -0.3), cl = lt(coat, 0.2), lg = o.legs || '#2a2a3a', sk = o.skin || '#e8b890';
    if (!o.noShadow) E(x, y, 7 * s, Math.max(1, 1.6 * s), rgba('#000000', 0.22));
    R(x - 3.5 * s, y - 17 * s, 3 * s, 16 * s, lg); R(x + 0.5 * s, y - 17 * s, 3 * s, 16 * s, lt(lg, -0.2));
    R(x - 4.2 * s, y - 2 * s, 3.8 * s, 2 * s, '#141418'); R(x + 0.4 * s, y - 2 * s, 3.8 * s, 2 * s, '#141418');
    R(x - 6 * s, y - 37 * s, 12 * s, 21 * s, coat); R(x + 2 * s, y - 37 * s, 4 * s, 21 * s, cs); R(x - 6 * s, y - 37 * s, 1.5 * s, 21 * s, cl);
    R(x - 8 * s, y - 36 * s, 2 * s, 17 * s, cs); R(x + 6 * s, y - 36 * s, 2 * s, 17 * s, cs);
    E(x - 7 * s, y - 18.5 * s, 1.2 * s, 1.2 * s, sk); E(x + 7 * s, y - 18.5 * s, 1.2 * s, 1.2 * s, sk);
    R(x - 1.5 * s, y - 39 * s, 3 * s, 3 * s, sk); E(x, y - 43 * s, 4.2 * s, 4.8 * s, sk);
    if (o.hair) E(x - 0.5 * s, y - 46 * s, 4.4 * s, 2.6 * s, o.hair);
    if (o.cap) { R(x - 4.5 * s, y - 49 * s, 9 * s, 3.5 * s, o.cap); R(x - 5.5 * s, y - 46 * s, 11 * s, 1.2 * s, lt(o.cap, -0.3)); }
    if (o.bag) { R(x + 8 * s, y - 13 * s, 7 * s, 11 * s, o.bag); R(x + 8 * s, y - 13 * s, 7 * s, 1.2 * s, lt(o.bag, 0.3)); R(x + 10 * s, y - 16 * s, 3 * s, 3 * s, '#2a2a2a'); }
    if (o.scarf) R(x - 6 * s, y - 37 * s, 12 * s, 3 * s, o.scarf);
  }
  function manAt(X, Z, o) { man(gx(X, Z), gy(Z, o && o.Y), 14 / Z, o); }
  function guardFig(x, y, s) {
    man(x, y, s, { coat: '#c82a2a', legs: '#1a1a2a', skin: '#f0c8a0' });
    R(x - 6 * s, y - 23 * s, 12 * s, 1.8 * s, '#f4f4f4'); for (var k = 0; k < 4; k++) R(x - 0.5 * s, y - 35 * s + k * 4 * s, 1.2 * s, 1.2 * s, '#ffd040');
    R(x - 1.5 * s, y - 37 * s, 3 * s, 1.5 * s, '#1a1a2a');
    E(x, y - 51 * s, 5.2 * s, 8.5 * s, '#121214'); E(x - 1.8 * s, y - 54 * s, 2 * s, 3.5 * s, '#2e2e34');
    R(x + 7.2 * s, y - 52 * s, 1.5 * s, 34 * s, '#5a4a3a'); R(x + 7 * s, y - 56 * s, 1.5 * s, 4 * s, '#d0d0d8');
  }
  function lamp(x, y, s, glow) {
    var d = '#24262e', l = '#565a68'; glow = glow || '#fff2c0';
    R(x - 5 * s, y - 12 * s, 10 * s, 12 * s, d); R(x - 4 * s, y - 12 * s, 2 * s, 12 * s, l); R(x - 6 * s, y - 2 * s, 12 * s, 2 * s, d);
    R(x - 3 * s, y - 17 * s, 6 * s, 5 * s, d);
    R(x - 1.5 * s, y - 104 * s, 3 * s, 88 * s, d); R(x - 1.5 * s, y - 104 * s, 1 * s, 88 * s, l);
    R(x - 15 * s, y - 100 * s, 30 * s, 2 * s, d);
    [-13, 13].forEach(function (k) { R(x + k * s - 0.5 * s, y - 100 * s, 1 * s, 3 * s, d); R(x + k * s - 4 * s, y - 97 * s, 8 * s, 2 * s, d); E(x + k * s, y - 91 * s, 3.5 * s, 4.5 * s, glow); R(x + k * s - 3 * s, y - 86.5 * s, 6 * s, 1.5 * s, d); });
    R(x - 4.5 * s, y - 117 * s, 9 * s, 2 * s, d); E(x, y - 110 * s, 4 * s, 5.5 * s, glow); R(x - 4 * s, y - 105 * s, 8 * s, 1.5 * s, d); R(x - 0.5 * s, y - 121 * s, 1.5 * s, 4 * s, d);
  }
  function car(x, y, s, col, o) { // side view, ~60 units long, x = left end, y = ground
    o = o || {}; var dk = lt(col, -0.35), li = lt(col, 0.3);
    function r(a, b, w, h, cc) { R(x + a * s, y - b * s, w * s, h * s, cc); }
    E(x + 30 * s, y, 32 * s, 2.2 * s, rgba('#000000', 0.3));
    r(1, 15, 58, 10, col); r(1, 15, 58, 1.5, li); r(1, 7, 58, 2, dk);
    P([x + 13 * s, y - 15 * s, x + 19 * s, y - 23 * s, x + 41 * s, y - 23 * s, x + 49 * s, y - 15 * s], col);
    P([x + 15 * s, y - 15.5 * s, x + 20 * s, y - 21.5 * s, x + 29 * s, y - 21.5 * s, x + 29 * s, y - 15.5 * s], '#2a3a5a');
    P([x + 31 * s, y - 15.5 * s, x + 31 * s, y - 21.5 * s, x + 40 * s, y - 21.5 * s, x + 46 * s, y - 15.5 * s], '#3a4e70');
    P([x + 20 * s, y - 21 * s, x + 23 * s, y - 21 * s, x + 19 * s, y - 16 * s, x + 16.5 * s, y - 16 * s], rgba('#ffffff', 0.35));
    r(29.5, 15, 1.2, 9, dk); r(30, 9, 1, 8, dk); r(24, 12, 3, 1, '#d8d8e0'); r(38, 12, 3, 1, '#d8d8e0');
    [13, 47].forEach(function (wx) { E(x + wx * s, y - 4 * s, 5 * s, 5 * s, '#18181c'); E(x + wx * s, y - 4 * s, 2.4 * s, 2.4 * s, '#9a9aa4'); });
    r(57, 13, 2, 2.5, '#fff4b0'); r(1, 13, 1.5, 2.5, '#e83030'); r(0, 7, 60, 1.2, '#2a2a30');
    if (o.taxi) { r(26, 26, 8, 3, '#2a2a2a'); r(27, 25.5, 6, 2, '#fff8c0'); for (var k = 0; k < 8; k++) r(14 + k * 4, 11, 2, 1.2, k % 2 ? '#1a1a1a' : col); }
  }
  function flagPole(x, y, h, col, dir) {
    R(x, y - h, 1, h, '#5a5a64'); px(x, y - h - 1, '#ffd040'); dir = dir || 1;
    for (var k = 0; k < 14; k++) { var fy = y - h + 1 + Math.round(Math.sin(k * 0.6) * 1.2); R(x + dir * (k + 1), fy, 1, 8, k % 4 < 2 ? col : lt(col, -0.15)); }
  }

  /* ---- bank: up the granite steps between the columns to the bronze doors ---- */
  AP.bank = function () {
    apSky(); apClouds(5);
    skyline({ y: 121, hMin: 24, hMax: 74, wMin: 14, wMax: 30, col: '#aebdd0', x0: 0, x1: W, winP: 0.18, win: '#d4e0ec' });
    haze(50, 122, '#e4f0f8', 0, 0.4);
    var st = '#c8ccd0', sl = '#f0f2f4', sd = '#7a8088', gold = '#e8b830', Zf = 24, Zs = Zf - 3.6, yb = Math.round(gy(Zf, 1.02)), yg = Math.round(gy(Zf)), x, y;
    [[12, 50], [334, 372]].forEach(function (wg) {
      var w = wg[1] - wg[0];
      R(wg[0], 60, w, yg - 60, LG(0, 60, 0, yg, [[0, '#c4c8ce'], [1, '#9ea2aa']]));
      for (var yy = 64; yy < yg; yy += 6) R(wg[0], yy, w, 1, '#8a8e96');
      R(wg[0] - 2, 56, w + 4, 4, sl); R(wg[0] - 2, 59, w + 4, 1, sd);
      for (var xx = wg[0] + 6; xx + 10 <= wg[1] - 4; xx += 16) { E(xx + 5, 72, 5, 4, '#2a3448'); R(xx, 72, 10, 20, '#2a3448'); R(xx, 82, 10, 1, '#5a6a80'); R(xx + 5, 68, 1, 24, '#5a6a80'); R(xx - 1, 92, 12, 2, sl); }
    });
    R(48, 32, 288, yg - 32, '#b4b8c0'); for (y = 36; y < yg; y += 6) R(48, y, 288, 1, '#a2a6ae');
    R(62, 50, 260, yb - 50, '#3a3e48'); R(62, 50, 260, 3, '#22262e'); for (y = 56; y < yb; y += 5) R(62, y, 260, 1, '#343842');
    [86, 124, 246, 284].forEach(function (wx) { R(wx - 2, yb - 44, 18, 3, st); R(wx, yb - 41, 14, 31, '#1e2636'); R(wx, yb - 41, 14, 1, '#8aa0c0'); R(wx + 7, yb - 41, 1, 31, '#4a5a70'); for (var k = yb - 35; k < yb - 10; k += 6) R(wx, k, 14, 1, '#4a5a70'); R(wx - 2, yb - 10, 18, 2, st); });
    // bronze doors
    R(166, yb - 54, 52, 54, sl); R(168, yb - 52, 48, 52, st); R(172, yb - 48, 40, 48, '#20242c');
    R(174, yb - 46, 36, 10, '#262a34'); for (x = 176; x < 210; x += 4) R(x, yb - 46, 1, 10, '#c8a040'); R(174, yb - 37, 36, 1, '#c8a040');
    R(174, yb - 35, 17, 35, LG(174, 0, 191, 0, [[0, '#d0a256'], [1, '#8a6a30']])); R(193, yb - 35, 17, 35, LG(193, 0, 210, 0, [[0, '#b88a40'], [1, '#6a4a1e']]));
    [176, 195].forEach(function (dx) { R(dx, yb - 32, 13, 13, rgba('#000000', 0.16)); R(dx, yb - 16, 13, 13, rgba('#000000', 0.16)); R(dx, yb - 32, 13, 1, rgba('#ffffff', 0.25)); R(dx, yb - 16, 13, 1, rgba('#ffffff', 0.25)); });
    R(191, yb - 35, 2, 35, '#2a1a08'); R(187, yb - 20, 2, 4, '#ffe080'); R(195, yb - 20, 2, 4, '#ffe080');
    R(52, yb, 280, yg - yb, '#a4a8b0'); R(52, yb, 280, 1, sl); for (y = yb + 5; y < yg; y += 5) R(52, y, 280, 1, '#90949c');
    // plaza
    pave(-24, 24, 9.4, Zf, 1.6, 1.1, '#b6b6be', '#94949e', { vary: ['#cacad2', '#9c9ca6', '#c0bcb4'] });
    // stair cheeks + steps
    [-1, 1].forEach(function (sg) {
      var a = sg * 8, b = sg * 9.4, t = 1.2;
      P([gx(a, Zs), gy(Zs, t), gx(a, Zf), gy(Zf, t), gx(a, Zf), gy(Zf, 0), gx(a, Zs), gy(Zs, 0)], sd);
      P([gx(a, Zs), gy(Zs, t), gx(b, Zs), gy(Zs, t), gx(b, Zf), gy(Zf, t), gx(a, Zf), gy(Zf, t)], sl);
      var x0 = Math.min(gx(a, Zs), gx(b, Zs)), x1 = Math.max(gx(a, Zs), gx(b, Zs));
      R(x0, gy(Zs, t), x1 - x0, gy(Zs, 0) - gy(Zs, t), st); R(x0, gy(Zs, t), x1 - x0, 1, '#ffffff');
      // urn on cheek
      var ux = gx(sg * 8.7, Zs + 0.6), uy = gy(Zs + 0.6, t), m = FL / (Zs + 0.6);
      E(ux, uy - 0.5 * m, 0.42 * m, 0.42 * m, st); R(ux - 0.15 * m, uy - 0.2 * m, 0.3 * m, 0.2 * m, st); E(ux - 0.1 * m, uy - 0.6 * m, 0.2 * m, 0.2 * m, sl); E(ux, uy - 0.95 * m, 0.4 * m, 0.3 * m, '#3a7a3a'); E(ux - 0.1 * m, uy - 1.05 * m, 0.25 * m, 0.18 * m, '#5aa04a');
    });
    stairs(8, Zs, 6, 0.17, 0.6, sl, st, '#ffffff');
    R(gx(-8, Zf), yb - 1, gx(8, Zf) - gx(-8, Zf), 2, sl);
    // portico columns (in front of the doors)
    var xs = [70, 108, 146, 222, 260, 298];
    fore(function () { xs.forEach(function (cx) { colm(cx, 50, yb - 1, 16, [sl, st, sd]); }); });
    // entablature + pediment
    R(52, 37, 280, 13, LG(0, 37, 0, 50, [[0, sl], [1, st]])); R(52, 49, 280, 1, sd); R(48, 34, 288, 3, sl); R(48, 37, 288, 1, sd);
    R(148, 38, 88, 11, '#3a3e48'); R(148, 38, 88, 1, '#1e222a'); txc('BANK', 192, 39, '#ffd860', '#7a5a10', 2);
    for (x = 56; x < 330; x += 6) if (x < 146 || x > 238) R(x, 40, 3, 6, rgba('#7a8088', 0.45));
    P([46, 34, 192, 6, 338, 34], sl); P([60, 32, 192, 11, 324, 32], '#a8acb4'); P([192, 11, 324, 32, 192, 32], '#9a9ea8');
    E(192, 24, 8, 7, '#a07a18'); E(192, 24, 7, 6, gold); E(191, 23, 4, 3, '#fff0a0'); tx('$', 191, 22, '#7a5410');
    for (x = 70; x < 320; x += 12) R(x, 30, 4, 2, rgba('#ffffff', 0.4));
    R(190, 3, 4, 4, sl); R(46, 30, 6, 4, sl); R(332, 30, 6, 4, sl);
    // people
    manAt(3.4, 23.85, { Y: 1.02, coat: '#2a3448', cap: '#1a2030' });
    manAt(-6.2, 15.5, { coat: '#a03030', hair: '#3a2a1a' }); manAt(5.6, 13.2, { coat: '#3a6a4a', hair: '#1a1a1a', bag: '#4a3a2a' });
    manAt(-9, 19, { coat: '#d8c8a0', hair: '#8a5a2a' });
    fore(function () { lamp(30, 188, 1.0); lamp(354, 188, 1.0); });
    post({ lv: 14 });
    return [wp(-1.3, 10.3), wp(-0.5, 14.5), wp(0, Zs - 0.25), wp(0, Zs + 1.9, 0.51), wp(0, Zf - 0.2, 1.02)];
  };

  /* ---- museum: wide marble steps up through the colonnade to the great doors ---- */
  AP.museum = function () {
    apSky(); apClouds(4);
    skyline({ y: 118, hMin: 20, hMax: 60, wMin: 14, wMax: 30, col: '#b0c0d2', x0: 0, x1: W, winP: 0.15, win: '#d8e2ee' });
    haze(40, 120, '#e6f2fa', 0, 0.4);
    var m = '#f2eee6', ml = '#ffffff', ms = '#aaa69e', Zf = 25, n = 9, r = 0.15, d = 0.5, Zs = Zf - n * d, yb = Math.round(gy(Zf, n * r)), yg = Math.round(gy(Zf)), x, y;
    // dome
    prof(192, 26, 24, function (u) { return 46 * Math.sqrt(Math.max(0, 1 - u * u)); }, LG(146, 0, 238, 0, [[0, '#b8e0d4'], [0.4, '#6aa898'], [1, '#2e5e58']]));
    for (var a = -0.8; a <= 0.81; a += 0.2) { var rx = 46 * Math.sin(a * 1.3); L(192 + rx * 0.98, 25, 192 + rx * 0.4, 6, rgba('#2e5e58', 0.6)); }
    R(186, 0, 12, 4, '#e8e4dc'); R(189, 0, 6, 2, '#c8a040');
    R(140, 22, 104, 6, LG(140, 0, 244, 0, [[0, ml], [1, ms]])); for (x = 142; x < 244; x += 5) R(x, 23, 2, 4, '#9a968e');
    // wings with statues in niches
    [[6, 48], [336, 378]].forEach(function (wg) {
      var w = wg[1] - wg[0];
      R(wg[0], 46, w, yg - 46, LG(0, 46, 0, yg, [[0, ml], [1, '#d8d2c8']])); R(wg[0] - 2, 42, w + 4, 4, ml); R(wg[0] - 2, 45, w + 4, 1, ms);
      for (var k = 0; k < 2; k++) { var nx = wg[0] + 6 + k * 19; E(nx + 6, 62, 6, 5, '#8a8478'); R(nx, 62, 12, 30, '#8a8478'); R(nx + 4, 68, 4, 18, '#d8d4cc'); E(nx + 6, 65, 2, 2.4, '#d8d4cc'); R(nx + 3, 72, 6, 10, '#e8e4dc'); R(nx - 1, 92, 14, 3, ml); }
    });
    // facade behind colonnade
    R(44, 30, 296, yb - 30, '#d8d2c8'); R(52, 42, 280, yb - 42, '#3a3632'); for (y = 48; y < yb; y += 6) R(52, y, 280, 1, '#34302c');
    // doors
    R(170, yb - 56, 44, 56, ms); E(192, yb - 56, 22, 12, ms); E(192, yb - 56, 18, 10, '#2a2420'); R(174, yb - 56, 36, 56, '#2a2420');
    for (var k2 = -16; k2 <= 16; k2 += 4) L(192, yb - 52, 192 + k2, yb - 64, '#c8a040');
    R(176, yb - 50, 15, 50, LG(176, 0, 191, 0, [[0, '#7a5232'], [1, '#4a2e18']])); R(193, yb - 50, 15, 50, LG(193, 0, 208, 0, [[0, '#6a4428'], [1, '#3a2412']]));
    [178, 195].forEach(function (dx) { for (var q = 0; q < 4; q++) R(dx, yb - 47 + q * 12, 11, 9, rgba('#000000', 0.18)); });
    R(188, yb - 26, 2, 4, '#e8c860'); R(194, yb - 26, 2, 4, '#e8c860');
    // banners between columns
    var bc = [['#c82a3a', '#ffd040'], ['#2a5ac8', '#ffffff'], ['#2a9a5a', '#ffd040'], ['#8a2ac8', '#ffffff'], ['#d87a20', '#ffffff'], ['#1a6a8a', '#ffd040']];
    [69, 103, 137, 233, 267, 301].forEach(function (bx, i) {
      R(bx - 1, 46, 14, 1, '#c8a040'); R(bx, 47, 12, 30, bc[i][0]); P([bx, 77, bx + 6, 73, bx + 12, 77, bx + 12, 80, bx, 80], bc[i][0]); R(bx + 11, 47, 1, 30, lt(bc[i][0], -0.3));
      var f = bc[i][1];
      if (i === 0) { R(bx + 3, 56, 6, 3, f); R(bx + 8, 52, 2, 4, f); R(bx + 2, 59, 1, 3, f); R(bx + 8, 59, 1, 3, f); R(bx + 1, 55, 2, 1, f); }
      if (i === 1) { E(bx + 6, 60, 3.5, 5, f); R(bx + 4, 52, 4, 3, f); }
      if (i === 2) { E(bx + 6, 55, 2.5, 3, f); R(bx + 3, 59, 6, 7, f); }
      if (i === 3) { R(bx + 2, 52, 8, 9, f); R(bx + 3, 53, 6, 7, '#4a2a8a'); px(bx + 5, 55, '#ffd040'); }
      if (i === 4) { R(bx + 5, 52, 2, 12, f); E(bx + 6, 52, 3, 2, f); }
      if (i === 5) { E(bx + 6, 57, 4, 4, f); E(bx + 6, 57, 2, 2, bc[i][0]); }
    });
    // plaza + steps
    pave(-24, 24, 9.4, Zf, 1.5, 1.2, '#cfc8bc', '#aaa296', { vary: ['#e0dace', '#bab2a4'] });
    stairs(9.6, Zs, n, r, d, ml, m, '#ffffff');
    R(gx(-9.6, Zf), yb - 1, gx(9.6, Zf) - gx(-9.6, Zf), 2, ml);
    var xs = [52, 86, 120, 154, 216, 250, 284, 318];
    fore(function () { xs.forEach(function (cx) { colm(cx, 42, yb - 1, 14, [ml, m, ms]); }); });
    // entablature with name, attic
    R(40, 28, 304, 14, LG(0, 28, 0, 42, [[0, ml], [1, m]])); R(40, 41, 304, 1, ms); R(36, 26, 312, 3, ml); R(36, 29, 312, 1, ms);
    txc('MUSEUM', 192, 30, '#5a5048', '#c8c0b0', 2);
    for (x = 46; x < 340; x += 8) if (x < 150 || x > 232) { R(x, 31, 4, 7, rgba('#8a8478', 0.35)); }
    R(130, 20, 124, 7, m); R(128, 19, 128, 2, ml);
    // statues flanking the steps, on plinths
    fore(function () {
      [-1, 1].forEach(function (sg) {
        var Zp = Zs - 0.6, mm = FL / Zp, x0 = gx(sg * 5.2, Zp), y0 = gy(Zp);
        R(x0 - 0.8 * mm, y0 - 1.6 * mm, 1.6 * mm, 1.6 * mm, LG(x0 - mm, 0, x0 + mm, 0, [[0, ml], [1, ms]])); R(x0 - 0.9 * mm, y0 - 1.7 * mm, 1.8 * mm, 0.15 * mm, ml); R(x0 - 0.9 * mm, y0 - 0.15 * mm, 1.8 * mm, 0.15 * mm, ms);
        man(x0, y0 - 1.7 * mm, mm / 33, { coat: '#5a8a7a', legs: '#4a7a6a', skin: '#6a9a8a', noShadow: true });
        R(x0 + sg * 0.3 * mm, y0 - 3.4 * mm, 0.12 * mm, 0.9 * mm, '#5a8a7a');
      });
    });
    manAt(-6.4, Zs + 1.7, { Y: 0.6, coat: '#e8a020', hair: '#2a1a10' }); manAt(6.8, Zs + 0.75, { Y: 0.3, coat: '#4a4a8a', hair: '#8a5a2a' });
    manAt(-4.8, 13.5, { coat: '#c83a5a', hair: '#1a1a1a' }); manAt(-4.0, 13.8, { coat: '#3a8ac8', hair: '#d8a040' }); manAt(6.5, 17, { coat: '#6a4a3a', hair: '#2a2a2a' });
    post({ lv: 14 });
    return [wp(1.2, 10.3), wp(0.5, 14), wp(0, Zs - 0.25), wp(0, Zs + 2.25, 0.75), wp(0, Zf - 0.2, n * r)];
  };

  /* ---- library: brick front, short flight of steps between two stone lions ---- */
  AP.library = function () {
    apSky(); apClouds(4);
    for (var i = 0; i < 9; i++) tree(rf(0, W), 122, rf(10, 16), ['#4a7a5a', '#6a9a6a', '#9ac08a', '#4a3a2a']);
    var brick = '#a8483a', trim = '#e8e0d0', Zf = 23, n = 4, r = 0.18, d = 0.5, Zs = Zf - n * d, yb = Math.round(gy(Zf, n * r)), yg = Math.round(gy(Zf)), x, y;
    var books = ['#c83a3a', '#3a6ac8', '#e8b030', '#3a9a5a', '#8a3ac8', '#e87a3a', '#f0f0e0', '#5a3a2a'];
    // roof
    P([22, 36, 40, 14, 344, 14, 362, 36], '#4a5260'); for (y = 16; y < 36; y += 3) R(30, y, 324, 1, '#3a404c'); R(40, 14, 304, 1, '#7a8494');
    [80, 120, 264, 304].forEach(function (dx) { R(dx - 7, 16, 14, 14, trim); P([dx - 9, 17, dx, 8, dx + 9, 17], '#4a5260'); R(dx - 4, 19, 8, 9, '#ffd880'); R(dx, 19, 1, 9, '#8a7a5a'); });
    // brick body
    R(24, 36, 336, yg - 36, brick);
    for (y = 37; y < yg; y += 4) { R(24, y, 336, 1, '#7a3028'); for (x = 24 + ((y >> 2) % 2) * 4; x < 360; x += 8) R(x, y + 1, 1, 3, '#8a3a30'); }
    for (i = 0; i < 500; i++) px(rf(24, 360), rf(37, yg), pick(['#c8604a', '#8a3a30', '#b85440']));
    R(20, 33, 344, 4, trim); R(20, 36, 344, 1, '#a8a090'); R(24, 72, 336, 3, trim);
    function bwin(wx, wy, w, h) {
      R(wx - 2, wy - w / 2 - 2, w + 4, h + w / 2 + 4, trim); E(wx + w / 2, wy, w / 2, w / 2, '#ffe0a0'); R(wx, wy, w, h, '#ffe0a0');
      for (var sh = wy + 2; sh < wy + h - 3; sh += 6) { for (var bx = wx; bx < wx + w; bx++) R(bx, sh, 1, 5 - (bx % 3 === 0 ? 1 : 0), pick(books)); R(wx, sh + 5, w, 1, '#6a4a2a'); }
      R(wx + w / 2, wy - w / 2, 1, h + w / 2, '#5a4a3a'); R(wx - 3, wy + h + 1, w + 6, 2, trim);
    }
    [40, 70, 100, 266, 296, 326].forEach(function (wx) { bwin(wx, 48, 16, 18); bwin(wx, 86, 16, 24); });
    // entrance pavilion
    R(140, 20, 104, yg - 20, LG(140, 0, 244, 0, [[0, '#ece4d4'], [0.7, '#d8d0c0'], [1, '#b0a898']])); for (y = 24; y < yg; y += 6) R(140, y, 104, 1, rgba('#9a9282', 0.5));
    P([134, 22, 192, 2, 250, 22], trim); P([146, 20, 192, 6, 238, 20], '#c8c0b0'); R(134, 20, 116, 3, '#f4ecdc'); E(192, 14, 5, 5, '#ffe0a0'); E(192, 14, 4, 4, '#5a4a3a'); px(192, 12, '#ffe0a0');
    R(150, 30, 84, 14, '#2a2a3a'); R(150, 30, 84, 1, '#5a5a6a'); txc('LIBRARY', 192, 32, '#ffd060', '#6a4a10', 2);
    [146, 228].forEach(function (px2) { R(px2, 46, 10, yb - 46, '#f0e8d8'); R(px2 + 7, 46, 3, yb - 46, '#c0b8a8'); R(px2 - 1, 46, 12, 3, '#fff8ec'); });
    E(192, 66, 22, 16, trim); R(170, 66, 44, yb - 66, trim);
    E(192, 66, 18, 13, '#3a2416'); R(174, 66, 36, yb - 66, '#3a2416');
    E(192, 66, 15, 10, '#ffe0a0'); R(177, 66, 30, 2, '#ffe0a0'); for (var k = -14; k <= 14; k += 4) L(192, 67, 192 + k, 57, '#5a3a24');
    R(176, 68, 15, yb - 68, LG(176, 0, 191, 0, [[0, '#9a6234'], [1, '#6a3e1e']])); R(193, 68, 15, yb - 68, LG(193, 0, 208, 0, [[0, '#8a5a30'], [1, '#5a3418']]));
    [178, 195].forEach(function (dx) { R(dx, 71, 11, 16, rgba('#000000', 0.18)); R(dx, 90, 11, 16, rgba('#000000', 0.18)); });
    R(191, 68, 2, yb - 68, '#3a2010'); R(188, 89, 2, 3, '#ffd040'); R(194, 89, 2, 3, '#ffd040');
    // lawn, hedges, walk
    gq(-30, 30, 9.4, Zf, '#4a8a3a'); for (var z = 9.4; z < Zf; z += 1.2) gq(-30, 30, z, z + 0.6, rgba('#6aa84a', 0.35));
    grass(yg, H, ['#3a7a2a', '#6aaa4a', '#5a9a3a', '#2e6a24'], 700);
    for (x = 26; x < 358; x += 9) { if (x > 134 && x < 250) continue; E(x + 4, yg - 2, 6, 4, '#2e6a2e'); E(x + 3, yg - 4, 4, 2, '#4a9a3e'); }
    pave(-2.3, 2.3, 9.4, Zs, 1.15, 0.9, '#d0c8b4', '#a49c88', { vary: ['#e0d8c4', '#bcb4a0'] });
    gq(-2.3, -2.15, 9.4, Zs, '#8a8270'); gq(2.15, 2.3, 9.4, Zs, '#8a8270');
    gq(-2.9, 2.9, Zs, Zf, '#cfc7b4');
    stairs(2.9, Zs, n, r, d, '#efe7d6', '#d0c8b4', '#ffffff');
    // reading bench + reader
    var bxx = gx(-5.2, 15), byy = gy(15), mb2 = FL / 15;
    R(bxx - 0.9 * mb2, byy - 0.45 * mb2, 1.8 * mb2, 0.12 * mb2, '#8a5a30'); R(bxx - 0.9 * mb2, byy - 0.85 * mb2, 1.8 * mb2, 0.3 * mb2, '#8a5a30'); R(bxx - 0.8 * mb2, byy - 0.45 * mb2, 0.08 * mb2, 0.45 * mb2, '#2a2a2a'); R(bxx + 0.72 * mb2, byy - 0.45 * mb2, 0.08 * mb2, 0.45 * mb2, '#2a2a2a');
    man(bxx, byy - 0.3 * mb2, 14 / 15 * 0.75, { coat: '#3a6a9a', hair: '#5a3a1a', noShadow: true }); R(bxx - 6, byy - 30, 9, 6, '#c83a3a'); R(bxx - 2, byy - 30, 1, 6, '#f0f0e0');
    manAt(5.6, 17.5, { coat: '#8a3a6a', hair: '#1a1a1a', bag: '#3a3a6a' });
    fore(function () {
      [-1, 1].forEach(function (sg) {
        var Zp = Zs - 0.2, mm = FL / Zp, cx = gx(sg * 3.6, Zp), cy = gy(Zp), w = 1.1 * mm, h = 1.0 * mm;
        R(cx - w, cy - h, 2 * w, h, LG(cx - w, 0, cx + w, 0, [[0, '#f4ecdc'], [1, '#b8b0a0']])); R(cx - w - 1, cy - h - 2, 2 * w + 2, 3, '#fff8ec'); R(cx - w, cy - 2, 2 * w, 2, '#9a9282');
        var ly = cy - h - 2, lc = '#d8d0be', ld = '#a8a090', ll = '#f0e8d8';
        E(cx + sg * 0.25 * mm, ly - 0.3 * mm, 0.75 * mm, 0.3 * mm, '#c4bcaa'); E(cx + sg * 0.3 * mm, ly - 0.42 * mm, 0.6 * mm, 0.16 * mm, lc);
        R(cx - 0.36 * mm, ly - 0.55 * mm, 0.22 * mm, 0.55 * mm, lc); R(cx + 0.14 * mm, ly - 0.55 * mm, 0.22 * mm, 0.55 * mm, lc); R(cx - 0.36 * mm, ly - 0.55 * mm, 1, 0.55 * mm, ll);
        R(cx - 0.4 * mm, ly - 0.1 * mm, 0.3 * mm, 0.1 * mm + 1, ld); R(cx + 0.1 * mm, ly - 0.1 * mm, 0.3 * mm, 0.1 * mm + 1, ld);
        E(cx, ly - 0.95 * mm, 0.5 * mm, 0.52 * mm, ld); E(cx - 0.05 * mm, ly - 1.0 * mm, 0.42 * mm, 0.44 * mm, '#beb6a4');
        E(cx, ly - 0.92 * mm, 0.27 * mm, 0.3 * mm, lc); E(cx - 0.06 * mm, ly - 1.0 * mm, 0.14 * mm, 0.12 * mm, ll);
        px(cx - 0.12 * mm, ly - 1.0 * mm, '#4a4a44'); px(cx + 0.12 * mm, ly - 1.0 * mm, '#4a4a44');
        E(cx, ly - 0.8 * mm, 0.11 * mm, 0.08 * mm + 0.5, ld); px(cx, ly - 0.84 * mm, '#5a5448');
      });
      [-1, 1].forEach(function (sg) { lamp(gx(sg * 3.2, 12.2), gy(12.2), 0.62, '#fff2c0'); });
    });
    post({ lv: 14 });
    return [wp(-0.8, 10.3), wp(-0.2, 15), wp(0, Zs - 0.25), wp(0, Zs + 1.25, 0.54), wp(0, Zf - 0.2, n * r)];
  };

  /* ---- hotel: along the red carpet, under the canopy, to the revolving door ---- */
  AP.hotel = function () {
    sky([[0, '#26265e'], [0.45, '#7a4a7e'], [0.8, '#ee8a6a'], [1, '#ffc080']], 124);
    stars(40, 40);
    for (var i = 0; i < 5; i++) strato(rf(-20, 360), rf(30, 80), rf(40, 90), rf(1.4, 2.6), '#5a3a6a', '#a8607a', '#ffb088');
    skyline({ y: 124, hMin: 20, hMax: 70, wMin: 12, wMax: 26, col: '#3a2e5a', x0: 0, x1: W, winP: 0.25, win: '#ffd070' });
    var Zf = 22, yg = Math.round(gy(Zf)), x, y, lit = ['#ffd880', '#ffe8a0', '#ffc060', '#fff4c8'];
    // wings
    [[22, 112], [272, 362]].forEach(function (wg, j) {
      var w = wg[1] - wg[0];
      R(wg[0], 50, w, yg - 50, j ? '#a89080' : '#c8b098'); R(wg[0], 50, w, 2, '#f0d8c0'); R(wg[0], 52, w, 1, '#7a6050');
      windows(wg[0] + 5, 56, w - 8, 24, 5, 5, 3, 3, function () { return rnd() < 0.55 ? pick(lit) : '#3a3a6a'; });
      R(wg[0], 84, w, yg - 84, '#5a3a3a'); R(wg[0], 84, w, 2, '#e8c890');
      for (x = wg[0] + 4; x < wg[1] - 8; x += 14) { R(x, 90, 10, yg - 92, '#ffd890'); R(x + 5, 90, 1, yg - 92, '#c89850'); }
    });
    // tower
    R(112, 12, 160, yg - 12, LG(112, 0, 272, 0, [[0, '#f0dcc0'], [0.6, '#d8c0a0'], [1, '#9a8070']]));
    windows(116, 20, 154, 58, 6, 6, 4, 3, function (wx) { return rnd() < 0.6 ? pick(lit) : (wx > 220 ? '#2a2a5a' : '#4a4a7a'); });
    for (x = 114; x < 272; x += 10) R(x, 16, 1, 66, rgba('#ffffff', 0.22));
    R(108, 10, 168, 3, '#e8d0b0'); R(108, 12, 168, 1, '#8a7060');
    // rooftop neon
    R(150, 0, 2, 10, '#2a1a2a'); R(232, 0, 2, 10, '#2a1a2a');
    c.fillStyle = RG(192, 4, 0, 50, [[0, 'rgba(255,60,90,0.5)'], [1, 'rgba(255,60,90,0)']]); c.fillRect(130, 0, 124, 40);
    R(152, 0, 80, 10, '#2a1a2a'); txc('HOTEL', 192, 0, '#ff5a6a', '#8a1a2a', 2);
    // ground floor lobby, stars, door
    R(112, 80, 160, yg - 80, '#4a2a2a'); R(110, 78, 164, 3, '#e8c890');
    for (x = 116; x < 268; x += 16) { if (x > 160 && x < 216) continue; R(x, 86, 12, yg - 88, LG(0, 86, 0, yg, [[0, '#ffe8b0'], [1, '#ffc870']])); R(x + 6, 86, 1, yg - 88, '#c89850'); R(x, 100, 12, 1, '#c89850'); }
    for (i = 0; i < 5; i++) starShape(176 + i * 8, 72, '#ffd040');
    // revolving door
    var dl = 172, dr = 212, dt = yg - 46;
    R(dl - 4, dt - 6, dr - dl + 8, 7, '#c8a040'); R(dl - 4, dt - 6, dr - dl + 8, 2, '#ffe08a'); R(dl - 4, dt, dr - dl + 8, 1, '#7a5a20');
    R(dl, dt + 1, dr - dl, yg - dt - 1, LG(dl, 0, dr, 0, [[0, '#a8783a'], [0.25, '#ffe6a8'], [0.6, '#ffd890'], [1, '#8a5a2a']]));
    R(dl, dt + 1, 2, yg - dt - 1, '#c8a040'); R(dr - 2, dt + 1, 2, yg - dt - 1, '#7a5a20');
    R(181, dt + 1, 2, yg - dt - 1, '#c8a040'); R(197, dt + 1, 2, yg - dt - 1, '#9a7a30'); R(190, dt + 1, 1, yg - dt - 1, '#e8c860');
    R(181, dt + 8, 16, 1, rgba('#ffffff', 0.5)); P([184, dt + 4, 188, dt + 4, 186, yg - 6, 182, yg - 6], rgba('#ffffff', 0.35));
    R(dl - 2, yg - 2, dr - dl + 4, 2, '#7a5a20');
    // pavement, carpet
    pave(-20, 20, 9.4, Zf, 1.2, 1.2, '#8e8296', '#6e6276', { vary: ['#a296a8', '#7e7286'] });
    c.fillStyle = RG(192, yg, 0, 90, [[0, 'rgba(255,210,140,0.55)'], [1, 'rgba(255,210,140,0)']]); c.fillRect(100, yg - 10, 184, 70);
    gq(-1.05, 1.05, 9.4, Zf, '#b01c28'); gq(-0.9, 0.9, 9.4, Zf, '#c8222e');
    gq(-1.1, -1.0, 9.4, Zf, '#e8c050'); gq(1.0, 1.1, 9.4, Zf, '#e8c050');
    for (var z = 10; z < Zf; z += 1.4) gq(-0.9, 0.9, z, z + 0.05, rgba('#801018', 0.6));
    // topiaries, palms, doorman, guests
    [-1, 1].forEach(function (sg) {
      var Zp = 21.6, mm = FL / Zp, tx2 = gx(sg * 2.3, Zp), ty = gy(Zp);
      R(tx2 - 0.35 * mm, ty - 0.6 * mm, 0.7 * mm, 0.6 * mm, '#3a2a3a'); R(tx2 - 0.4 * mm, ty - 0.65 * mm, 0.8 * mm, 0.12 * mm, '#c8a040');
      R(tx2 - 1, ty - 1.2 * mm, 2, 0.6 * mm, '#4a3020'); E(tx2, ty - 1.45 * mm, 0.5 * mm, 0.55 * mm, '#2e5a2e'); E(tx2 - 1, ty - 1.55 * mm, 0.3 * mm, 0.3 * mm, '#4a8a3e');
    });
    palm(gx(-6.2, 15.5), gy(15.5), 84, 1, ['#5a3a3a', '#7a5a4a', '#1e3a2a', '#3a6a3a']); palm(gx(6.2, 15.5), gy(15.5), 88, -1, ['#5a3a3a', '#7a5a4a', '#1e3a2a', '#3a6a3a']);
    manAt(1.55, 21.9, { coat: '#8a1a2a', legs: '#1a1a2a', cap: '#8a1a2a', hair: '#1a1a1a' });
    manAt(-3.8, 17.5, { coat: '#e8e0d0', hair: '#c89040', bag: '#c83a6a' }); manAt(-4.5, 17.8, { coat: '#2a2a3a', hair: '#2a1a10' });
    var cx3 = gx(4.7, 19.8), cy3 = gy(19.8), m3 = FL / 19.8;
    R(cx3 - 0.7 * m3, cy3 - 0.5 * m3, 1.4 * m3, 0.08 * m3, '#c8a040'); R(cx3 - 0.7 * m3, cy3 - 1.9 * m3, 0.08 * m3, 1.9 * m3, '#c8a040'); R(cx3 + 0.62 * m3, cy3 - 1.9 * m3, 0.08 * m3, 1.9 * m3, '#c8a040'); R(cx3 - 0.7 * m3, cy3 - 1.95 * m3, 1.4 * m3, 0.1 * m3, '#ffe08a');
    R(cx3 - 0.55 * m3, cy3 - 1.2 * m3, 0.5 * m3, 0.7 * m3, '#3a6ac8'); R(cx3 + 0.0 * m3, cy3 - 1.0 * m3, 0.5 * m3, 0.5 * m3, '#8a5a30'); R(cx3 - 0.3 * m3, cy3 - 1.5 * m3, 0.6 * m3, 0.3 * m3, '#c83a3a');
    E(cx3 - 0.5 * m3, cy3, 2, 2, '#1a1a1a'); E(cx3 + 0.5 * m3, cy3, 2, 2, '#1a1a1a');
    // canopy, poles and the velvet-rope stanchions stand in front of the detective
    fore(function () {
      var Zc = 18, mc = FL / Zc, yt = gy(Zc, 3.75), yv = gy(Zc, 3.2), xl = gx(-3, Zc), xr = gx(3, Zc), xfl = gx(-3, Zf), xfr = gx(3, Zf), yf = gy(Zf, 3.3);
      P([xl, yv, xr, yv, xfr, yf, xfl, yf], '#5a1414');
      for (var q = 0; q < 7; q++) { var bx = xl + 8 + q * (xr - xl - 16) / 6; E(bx, yv + 0.5, 1.5, 1, '#fff4c0'); }
      R(xl, yt, xr - xl, yv - yt, '#c82a2a'); R(xl, yt, xr - xl, 2, '#ff6a5a'); R(xl, yt + 2, xr - xl, 1, '#e8c050');
      for (var sx = xl; sx < xr; sx += 8) { R(sx, yt + 3, 4, yv - yt - 3, '#f4ece0'); P([sx, yv, sx + 4, yv, sx + 2, yv + 3], '#f4ece0'); P([sx + 4, yv, sx + 8, yv, sx + 6, yv + 3], '#c82a2a'); }
      txc('HOTEL', (xl + xr) / 2, yt + 3, '#ffd040', '#5a1414', 1);
      [xl + 2, xr - 4].forEach(function (pxx) { R(pxx, yv + 2, 3, gy(Zc) - yv - 2, '#c8a040'); R(pxx, yv + 2, 1, gy(Zc) - yv - 2, '#ffe08a'); R(pxx - 1, gy(Zc) - 3, 5, 3, '#8a6a20'); });
      [-1, 1].forEach(function (sg) {
        var prev = null;
        [11, 13.4, 15.8].forEach(function (Zq) {
          var mq = FL / Zq, sx2 = gx(sg * 1.45, Zq), sy2 = gy(Zq);
          if (prev) for (var t = 0; t <= 1; t += 0.02) { var X = sg * 1.45, Zt = prev + (Zq - prev) * t, Yt = 0.82 - 0.22 * Math.sin(Math.PI * t), ww = Math.max(1, 0.06 * FL / Zt); R(gx(X, Zt) - ww / 2, gy(Zt, Yt), ww, ww, '#8a1020'); }
          R(sx2 - 0.05 * mq, sy2 - 0.9 * mq, 0.1 * mq + 1, 0.9 * mq, '#c8a040'); R(sx2 - 0.05 * mq, sy2 - 0.9 * mq, 1, 0.9 * mq, '#ffe08a');
          E(sx2, sy2 - 0.95 * mq, 0.08 * mq + 0.5, 0.08 * mq + 0.5, '#ffe08a'); E(sx2, sy2 - 0.04 * mq, 0.18 * mq, 0.05 * mq + 0.5, '#8a6a20');
          prev = Zq;
        });
      });
    });
    post({ lv: 14 });
    return [wp(-0.5, 10.3), wp(-0.2, 14), wp(0, 18.4), wp(0, Zf - 0.2)];
  };

  /* ---- airport: across the drop-off lane on the zebra crossing, up the curb, to the sliding doors ---- */
  AP.airport = function () {
    apSky([[0, '#2a6ec4'], [0.7, '#a8d4f4'], [1, '#e8f4fa']], 124); apClouds(4, null, 14, 30);
    // plane climbing out
    var pxp = 96, pyp = 16;
    R(pxp - 90, pyp + 24, 70, 1, rgba('#ffffff', 0.7)); R(pxp - 84, pyp + 27, 64, 1, rgba('#ffffff', 0.5));
    P([pxp - 20, pyp + 12, pxp + 24, pyp - 4, pxp + 30, pyp - 2, pxp - 14, pyp + 16], '#f4f6f8'); P([pxp - 20, pyp + 14, pxp + 28, pyp - 2, pxp - 14, pyp + 16], '#a8b0c0');
    P([pxp - 4, pyp + 6, pxp - 16, pyp - 6, pxp - 10, pyp - 6, pxp + 6, pyp + 2], '#d8dce4'); P([pxp, pyp + 8, pxp + 4, pyp + 20, pxp + 10, pyp + 18, pxp + 8, pyp + 4], '#c0c6d0');
    P([pxp - 18, pyp + 12, pxp - 24, pyp, pxp - 18, pyp + 2, pxp - 12, pyp + 10], '#d83a3a');
    for (var i = 0; i < 9; i++) px(pxp - 6 + i * 3, pyp + 5 - i * 1.1, '#3a4a6a');
    // control tower behind
    R(334, 22, 10, 80, LG(334, 0, 344, 0, [[0, '#f0f0f4'], [1, '#9aa0b0']])); P([326, 22, 352, 22, 348, 12, 330, 12], '#2a5a6a'); R(328, 12, 22, 1, '#8ad0e0'); R(324, 22, 30, 3, '#d8dce4'); R(330, 8, 18, 4, '#e8e8ec'); R(338, 0, 2, 8, '#4a4a54'); px(338, 0, '#ff3030');
    var Zf = 24, yg = Math.round(gy(Zf)), Zc = 19.2, Zr = 13, x, y;
    // terminal: glass wall under a sweeping roof
    R(0, 46, W, yg - 46, LG(0, 46, 0, yg, [[0, '#3a6a9a'], [0.35, '#6aa8d4'], [1, '#2a4a6a']]));
    for (x = 0; x < W; x += 24) P([x, yg, x + 14, 46, x + 22, 46, x + 8, yg], rgba('#ffffff', 0.12));
    for (x = 4; x < W; x += 12) R(x, 46, 1, yg - 46, '#c8d8e8'); R(0, 64, W, 1, '#d8e8f4'); R(0, 82, W, 2, '#d8e8f4');
    for (i = 0; i < 18; i++) { var ix = rf(10, 370); if (Math.abs(ix - 192) < 30) continue; R(ix, yg - 14, 3, 12, rgba('#1a2a3a', 0.55)); E(ix + 1.5, yg - 16, 1.5, 2, rgba('#1a2a3a', 0.55)); }
    R(60, 68, 40, 12, '#1a1a2a'); for (y = 70; y < 79; y += 2) R(62, y, 36, 1, rgba('#ffd040', 0.7));
    var rp = []; bez(-4, 30, 192, 18, 388, 30, 24, rp);
    for (i = 0; i < rp.length; i += 2) { R(rp[i], rp[i + 1], 18, 18, '#f4f4f8'); R(rp[i], rp[i + 1] + 14, 18, 2, '#a8aebc'); R(rp[i], rp[i + 1] + 16, 18, 2, rgba('#1a2a3a', 0.4)); }
    R(0, 46, W, 3, rgba('#1a2a3a', 0.35));
    for (x = 20; x < W; x += 60) { L(x, 47, x + 10, 82, '#e8eef4'); L(x + 1, 47, x + 11, 82, '#a8b0c0'); }
    txc('AIRPORT', 192, 22, '#1a3a6a', '#a8b8d0', 3);
    // entrance bay + sliding doors
    var dl = 168, dr = 216, dt = yg - 42;
    R(dl - 4, dt - 14, dr - dl + 8, yg - dt + 14, '#d8dce4'); R(dl - 4, dt - 14, dr - dl + 8, 1, '#ffffff');
    R(dl - 1, dt - 12, dr - dl + 2, 10, '#1a2a1a'); txc('DEPARTURES', 192, dt - 10, '#ffd040', null, 1);
    R(dl, dt, dr - dl, yg - dt, '#ffe8b8'); for (i = 0; i < 6; i++) R(dl + 4 + i * 7, yg - 12, 3, 10, rgba('#5a4a3a', 0.5));
    R(dl, dt, 21, yg - dt, rgba('#8ac0e0', 0.55)); R(dr - 21, dt, 21, yg - dt, rgba('#8ac0e0', 0.55));
    R(dl, dt, 21, 2, '#9aa0ac'); R(dr - 21, dt, 21, 2, '#9aa0ac'); R(dl + 20, dt, 1, yg - dt, '#9aa0ac'); R(dr - 21, dt, 1, yg - dt, '#9aa0ac');
    P([dl + 3, dt + 4, dl + 7, dt + 4, dl + 4, yg - 4, dl + 1, yg - 4], rgba('#ffffff', 0.4)); P([dr - 17, dt + 4, dr - 13, dt + 4, dr - 16, yg - 4, dr - 19, yg - 4], rgba('#ffffff', 0.4));
    R(dl + 2, dt + 20, 16, 1, '#d8d8e0'); R(dr - 18, dt + 20, 16, 1, '#d8d8e0');
    // far curb sidewalk (raised), road with zebra crossing, near sidewalk
    pave(-24, 24, Zc, Zf, 1.5, 1.0, '#c8c8cc', '#a8a8b0', { Y: 0.15, vary: ['#d8d8dc', '#b8b8c0'] });
    R(0, gy(Zc, 0.15), W, gy(Zc, 0) - gy(Zc, 0.15), '#8a8a92'); R(0, gy(Zc, 0.15), W, 1, '#ececf0');
    gq(-24, 24, Zr, Zc, '#4a4c54'); for (i = 0; i < 260; i++) { var Zq = rf(Zr, Zc); px(gx(rf(-14, 14), Zq), gy(Zq), pick(['#5a5c64', '#3e4048'])); }
    for (x = -24; x < 24; x += 2.4) if (Math.abs(x + 0.6) > 2.2) gq(x, x + 1.2, 16.05, 16.25, '#e8e8e8');
    for (x = -1.6; x < 1.6; x += 0.7) gq(x, x + 0.4, Zr + 0.2, Zc - 0.2, '#ececec');
    gq(-24, 24, Zc - 0.3, Zc - 0.12, '#e8c020');
    pave(-24, 24, 9.4, Zr, 1.5, 1.0, '#c0c0c6', '#a0a0a8', { Y: 0.15, vary: ['#d0d0d6', '#b0b0b8'] });
    R(0, gy(Zr, 0.15), W, gy(Zr, 0) - gy(Zr, 0.15) + 1, '#8a8a92'); R(0, gy(Zr, 0.15), W, 1, '#ececf0');
    // bollards along the far curb
    fore(function () {
      for (var X = -12; X <= 12.01; X += 1.5) { if (Math.abs(X) < 2) continue; var Zb = Zc + 0.35, mm = FL / Zb, bx = gx(X, Zb), by = gy(Zb, 0.15), w = Math.max(2, 0.22 * mm);
        R(bx - w / 2, by - 0.85 * mm, w, 0.85 * mm, '#8a909c'); R(bx - w / 2, by - 0.85 * mm, 1, 0.85 * mm, '#d8dce4'); R(bx - w / 2, by - 0.7 * mm, w, 0.12 * mm + 1, '#e8c020'); E(bx, by - 0.86 * mm, w / 2, w / 4 + 0.5, '#c8ccd4'); }
    });
    // cars stopped in the lane, travellers on the curb
    var m1 = FL / 17.6; car(gx(3.2, 17.6), gy(17.6), 4.4 * m1 / 60, '#f0c020', { taxi: true });
    var m2 = FL / 15.2; car(gx(-8.6, 15.2), gy(15.2), 4.4 * m2 / 60, '#c8ccd4');
    manAt(-3.4, 21, { Y: 0.15, coat: '#3a6ac8', hair: '#2a1a10', bag: '#2a5ac8' }); manAt(4.4, 22.4, { Y: 0.15, coat: '#c83a3a', hair: '#e0b050', bag: '#4a4a4a' });
    manAt(7.6, 20.2, { Y: 0.15, coat: '#e8e0d0', hair: '#1a1a1a', bag: '#e8a020' });
    var tcx = gx(-6.2, 21.6), tcy = gy(21.6, 0.15), tm = FL / 21.6;
    for (i = 0; i < 4; i++) { var ox = tcx + i * 0.25 * tm; R(ox, tcy - 0.9 * tm, 0.9 * tm, 0.5 * tm, '#9aa0ac'); R(ox, tcy - 0.95 * tm, 1, 0.95 * tm, '#5a5e68'); }
    post({ lv: 14 });
    return [wp(-0.7, 10.3, 0.15), wp(-0.25, Zr + 0.35), wp(0, 16.4), wp(0, Zc + 0.5, 0.15), wp(0, Zf - 0.2, 0.15)];
  };

  /* ---- palace: the long gravel avenue between the guards, up to the golden gate ---- */
  AP.palace = function () {
    apSky(); apClouds(5, null, 12, 36);
    var w = '#f4ead8', wl = '#ffffff', ws = '#c8b4a0', gold = '#e8b030', gl = '#fff090', gd = '#a06a10', Zp = 40, Zg = 26, yp = Math.round(gy(Zp)), yfg = Math.round(gy(Zg)), x, i;
    function onion(ox, b, r, h) { prof(ox, b, h, function (u) { var w2 = u < 0.7 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.35) / 0.6, 2))) : Math.sqrt(1 - Math.pow(0.35 / 0.6, 2)) * Math.pow((1 - u) / 0.3, 1.4); return r * w2; }, LG(ox - r, 0, ox + r, 0, [[0, gl], [0.35, gold], [1, gd]])); R(ox - 0.5, b - h - 5, 1, 5, gd); }
    function flag(fx, fy, col) { R(fx, fy - 10, 1, 10, '#4a4a4a'); P([fx + 1, fy - 10, fx + 10, fy - 8, fx + 1, fy - 6], col); P([fx + 1, fy - 9, fx + 10, fy - 8, fx + 6, fy - 7.5], lt(col, 0.3)); }
    skyline({ y: yp - 30, hMin: 4, hMax: 12, wMin: 8, wMax: 18, col: '#b8c8d8', x0: 0, x1: W });
    // palace
    R(30, 52, 324, yp - 52, LG(0, 52, 0, yp, [[0, wl], [1, w]])); R(28, 49, 328, 3, ws); R(28, 49, 328, 1, wl);
    for (x = 36; x < 350; x += 10) { if (x > 144 && x < 236) continue; R(x, 58, 5, 11, '#5a7aa0'); E(x + 2.5, 58, 2.5, 2.5, '#5a7aa0'); R(x, 58, 1, 11, '#a8c0d8'); R(x - 1, 69, 7, 1, ws); R(x, 77, 5, 11, '#5a7aa0'); E(x + 2.5, 77, 2.5, 2.5, '#5a7aa0'); R(x - 1, 88, 7, 1, ws); }
    R(30, 72, 324, 1, ws); R(30, yp - 3, 324, 3, ws);
    R(146, 34, 92, yp - 34, LG(146, 0, 238, 0, [[0, wl], [0.6, w], [1, ws]])); R(143, 31, 98, 4, gold); R(143, 34, 98, 1, gd);
    for (x = 152; x < 234; x += 12) { R(x, 40, 6, 14, '#4a6a98'); E(x + 3, 40, 3, 3, '#4a6a98'); R(x, 40, 1, 14, '#a8c0d8'); }
    R(148, 58, 88, 2, gold); for (x = 149; x < 236; x += 3) R(x, 60, 1, 3, gd);
    for (x = 158; x < 230; x += 14) { R(x, 66, 5, 18, '#4a6a98'); E(x + 2.5, 66, 2.5, 2.5, '#4a6a98'); }
    P([180, yp, 180, 76, 192, 68, 204, 76, 204, yp], '#6a3a2a'); P([183, yp, 183, 77, 192, 71, 201, 77, 201, yp], '#a8642a');
    onion(192, 31, 22, 28); onion(54, 49, 11, 18); onion(330, 49, 11, 18); onion(150, 31, 6, 12); onion(234, 31, 6, 12);
    flag(192.5, 0 + 10, '#d82a2a'); flag(54.5, 26, '#2a5ad8'); flag(330.5, 26, '#2a5ad8');
    // courtyard and lawns
    gq(-40, 40, Zg, Zp, '#d8ccb0'); for (i = 0; i < 300; i++) { var Zq = rf(Zg, Zp); px(gx(rf(-16, 16), Zq), gy(Zq), pick(['#e8dcc0', '#c4b898'])); }
    for (var z = 9.4; z < Zg; z += 1.6) { gq(-40, -1.5, z, Math.min(Zg, z + 1.6), (Math.round(z * 10) % 32 < 16) ? '#4a8a3a' : '#559844'); gq(1.5, 40, z, Math.min(Zg, z + 1.6), (Math.round(z * 10) % 32 < 16) ? '#559844' : '#4a8a3a'); }
    grass(yfg, H, ['#3a7a2a', '#6aaa4a', '#2e6a24'], 400);
    // avenue
    gq(-1.5, 1.5, 9.4, Zg, '#e0d0aa'); for (i = 0; i < 900; i++) { var Za = rf(9.4, Zg); px(gx(rf(-1.45, 1.45), Za), gy(Za), pick(['#f0e2c0', '#c8b48c', '#b8a47c'])); }
    gq(-1.62, -1.5, 9.4, Zg, '#f4ecdc'); gq(1.5, 1.62, 9.4, Zg, '#f4ecdc');
    // flower beds + topiary cones along the avenue
    [11, 14.5, 18, 21.5, 24.5].forEach(function (Zt) {
      [-1, 1].forEach(function (sg) {
        var mm = FL / Zt, tx2 = gx(sg * 3.6, Zt), ty = gy(Zt);
        E(tx2, ty, 0.9 * mm, 0.22 * mm, '#2a5a2a'); for (var k = 0; k < 8; k++) px(tx2 + rf(-0.8, 0.8) * mm, ty + rf(-0.15, 0.15) * mm, pick(['#e83a5a', '#ffd040', '#ffffff']));
        prof(tx2, ty, 2.2 * mm, function (u) { return 0.55 * mm * (1 - u) + 0.3; }, LG(tx2 - 0.6 * mm, 0, tx2 + 0.6 * mm, 0, [[0, '#4a9a3e'], [0.5, '#2e6a2e'], [1, '#1e4a1e']]));
      });
    });
    // fence and gate
    var mg = FL / Zg, fTop = gy(Zg, 2.3), wallT = gy(Zg, 0.45);
    R(0, wallT, W, yfg - wallT, '#e8dcc4'); R(0, wallT, W, 1, '#fff4dc'); R(0, yfg - 1, W, 1, '#a89878');
    for (x = 0; x < W; x += 4) { var gxl = gx(-2.1, Zg), gxr = gx(2.1, Zg); if (x > gxl - 2 && x < gxr + 2) continue; R(x, fTop, 1, wallT - fTop, gd); px(x, fTop - 1, gl); px(x, fTop - 2, gold); }
    R(0, fTop + 3, gx(-2.1, Zg), 1, gold); R(gx(2.1, Zg), fTop + 3, W, 1, gold); R(0, wallT - 6, gx(-2.1, Zg), 1, gold); R(gx(2.1, Zg), wallT - 6, W, 1, gold);
    // gate leaves swung open (inward)
    [-1, 1].forEach(function (sg) {
      var X0 = sg * 1.45, X1 = sg * 0.95, Z0 = Zg, Z1 = Zg + 1.35;
      for (var t = 0; t <= 1; t += 0.06) { var Xt = X0 + (X1 - X0) * t, Zt = Z0 + (Z1 - Z0) * t; R(gx(Xt, Zt), gy(Zt, 2.4), 1, gy(Zt, 0) - gy(Zt, 2.4), gd); px(gx(Xt, Zt), gy(Zt, 2.4) - 1, gl); }
      L(gx(X0, Z0), gy(Z0, 2.2), gx(X1, Z1), gy(Z1, 2.2), gold); L(gx(X0, Z0), gy(Z0, 1.1), gx(X1, Z1), gy(Z1, 1.1), gold); L(gx(X0, Z0), gy(Z0, 0.2), gx(X1, Z1), gy(Z1, 0.2), gold);
    });
    // sentry boxes beside the gate
    [-1, 1].forEach(function (sg) {
      var Zb = Zg - 0.6, mm = FL / Zb, bx = gx(sg * 3.3, Zb), by = gy(Zb);
      R(bx - 0.55 * mm, by - 2.6 * mm, 1.1 * mm, 2.6 * mm, '#f4f0e8'); for (var k = 0; k < 5; k++) R(bx - 0.55 * mm, by - 2.6 * mm + k * 0.5 * mm, 1.1 * mm, 0.25 * mm, k % 2 ? '#2a5ad8' : '#d82a2a');
      R(bx - 0.4 * mm, by - 2.0 * mm, 0.8 * mm, 2.0 * mm, '#2a2a34'); P([bx - 0.7 * mm, by - 2.6 * mm, bx, by - 3.2 * mm, bx + 0.7 * mm, by - 2.6 * mm], '#2a5ad8');
      guardFig(bx, by, 14 / Zb);
    });
    // guards lining the avenue + gate pillars: all stand in front of the detective once he passes them
    fore(function () {
      [-1, 1].forEach(function (sg) {
        var mm = FL / Zg, x0 = gx(sg * 1.5, Zg), x1 = gx(sg * 2.2, Zg), a = Math.min(x0, x1), b = Math.max(x0, x1), top = gy(Zg, 3.3);
        R(a, top, b - a, yfg - top, LG(a, 0, b, 0, [[0, '#fff8ec'], [1, '#c8b8a0']])); R(a - 2, top - 2, b - a + 4, 3, '#fff8ec'); R(a - 1, top + 6, b - a + 2, 1, '#c8b8a0');
        E((a + b) / 2, top - 5, 4, 4, gold); E((a + b) / 2 - 1, top - 6, 2, 2, gl); R((a + b) / 2 - 0.5, top - 12, 1, 4, gd);
      });
      [12.5, 16, 19.5, 23].forEach(function (Zq) { [-1, 1].forEach(function (sg) { guardFig(gx(sg * 2.05, Zq), gy(Zq), 14 / Zq); }); });
    });
    post({ lv: 14 });
    return [wp(0, 10.3), wp(0, 13.6), wp(0, 18), wp(0, 22), wp(0, Zg + 0.15)];
  };

  /* ---- station: across the forecourt to the big centre arch ---- */
  AP.station = function () {
    apSky(); apClouds(4, null, 10, 30);
    var st = '#c87a5a', sl = '#e8a07a', sd = '#7a4a3a', stone = '#e8dcc4', Zf = 24, yg = Math.round(gy(Zf)), x, y, i;
    skyline({ y: 110, hMin: 10, hMax: 40, wMin: 12, wMax: 24, col: '#b4c4d4', x0: 0, x1: W });
    // side towers
    [[40, 84], [300, 344]].forEach(function (tw) {
      var tx0 = tw[0], w = tw[1] - tw[0];
      R(tx0, 18, w, yg - 18, LG(tx0, 0, tx0 + w, 0, [[0, sl], [0.6, st], [1, sd]])); for (var yy = 21; yy < yg; yy += 4) R(tx0, yy, w, 1, rgba('#5a2a1a', 0.3));
      P([tx0 - 3, 18, tx0 + w / 2, 0, tx0 + w + 3, 18], '#4a5a6a'); P([tx0 + w / 2, 0, tx0 + w + 3, 18, tx0 + w / 2, 18], '#3a4858'); R(tx0 - 3, 18, w + 6, 3, stone);
      for (var k = 0; k < 3; k++) { [10, 26].forEach(function (o) { E(tx0 + o + 4, 30 + k * 26, 4, 4, '#3a4a6a'); R(tx0 + o, 30 + k * 26, 8, 14, '#3a4a6a'); R(tx0 + o, 30 + k * 26, 1, 14, '#8aa0c0'); }); }
    });
    // wings beyond towers
    R(0, 50, 40, yg - 50, st); R(344, 50, 40, yg - 50, sd); for (y = 52; y < yg; y += 4) { R(0, y, 40, 1, rgba('#5a2a1a', 0.3)); R(344, y, 40, 1, rgba('#3a1a0a', 0.3)); }
    R(0, 48, 40, 3, stone); R(344, 48, 40, 3, stone);
    // central facade
    R(84, 24, 216, yg - 24, LG(84, 0, 300, 0, [[0, sl], [0.6, st], [1, sd]])); for (y = 26; y < yg; y += 4) R(84, y, 216, 1, rgba('#5a2a1a', 0.28));
    R(80, 22, 224, 3, stone); for (x = 86; x < 300; x += 8) R(x, 18, 4, 4, stone);
    // gable with clock
    P([152, 22, 192, 2, 232, 22], st); P([192, 2, 232, 22, 192, 22], sd); E(192, 14, 9, 9, stone); E(192, 14, 7, 7, '#fffaf0');
    for (var k2 = 0; k2 < 12; k2++) { var a = k2 / 12 * Math.PI * 2; px(191.5 + Math.cos(a) * 5.5, 13.5 + Math.sin(a) * 5.5, '#2a2a2a'); } L(192, 14, 192, 9, '#1a1a1a'); L(192, 14, 195, 15, '#1a1a1a');
    // lunette window
    var ax = 192, ay = 62, ar = 32;
    E(ax, ay, ar + 3, ar + 3, stone); R(ax - ar - 3, ay, 2 * ar + 6, 2, stone);
    for (y = ay - ar; y < ay; y++) { var dy = ay - y, hw = Math.sqrt(Math.max(0, ar * ar - dy * dy)); R(ax - hw, y, hw * 2, 1, mix('#a8d4ec', '#3a5a7a', (y - (ay - ar)) / ar)); }
    for (a = 0; a <= Math.PI; a += Math.PI / 8) L(ax, ay, ax - Math.cos(a) * ar, ay - Math.sin(a) * ar, '#3a3a44');
    E(ax, ay, 9, 9, '#3a3a44'); E(ax, ay, 8, 8, '#c8e0f0'); R(ax - ar, ay - 1, 2 * ar, 1, '#3a3a44');
    R(156, 64, 72, 12, '#2a3a4a'); R(156, 64, 72, 1, '#5a6a7a'); txc('STATION', 192, 65, '#ffe080', '#6a4a10', 2);
    // three entrance arches
    function arch(cx, half, top, deep) {
      E(cx, top + half, half + 3, half + 3, stone); R(cx - half - 3, top + half, 2 * half + 6, yg - top - half, stone);
      E(cx, top + half, half, half, deep); R(cx - half, top + half, 2 * half, yg - top - half, deep);
    }
    arch(192, 21, 78, '#3a2a2a'); arch(130, 16, 88, '#3a2a2a'); arch(254, 16, 88, '#3a2a2a');
    // concourse glimpsed through the arches
    [[192, 21, 78], [130, 16, 88], [254, 16, 88]].forEach(function (A) {
      var cx = A[0], h = A[1], t = A[2];
      c.fillStyle = RG(cx, t + h, 0, h * 1.8, [[0, 'rgba(255,220,150,0.55)'], [1, 'rgba(255,220,150,0)']]); c.fillRect(cx - h, t, 2 * h, yg - t);
      for (var q = -h + 3; q < h - 2; q += 6) px(cx + q, t + h - 4, '#fff0b0');
      R(cx - h, yg - 8, 2 * h, 1, rgba('#c8a070', 0.6));
    });
    R(178, 106, 28, yg - 106, '#d8d8e0'); R(178, 106, 28, 3, '#c82a2a'); R(182, 110, 20, 6, '#2a3a5a'); R(183, 110, 7, 2, '#6a8ab0'); E(183, yg - 4, 2, 2, '#fff8c0'); E(201, yg - 4, 2, 2, '#fff8c0');
    for (i = 0; i < 6; i++) { var sx = [174, 206, 118, 140, 246, 262][i]; R(sx, yg - 12, 3, 11, rgba('#2a1a1a', 0.7)); E(sx + 1.5, yg - 14, 1.5, 2, rgba('#2a1a1a', 0.7)); }
    // pilasters
    [100, 158, 222, 280].forEach(function (pxx) { R(pxx, 80, 6, yg - 80, sl); R(pxx + 4, 80, 2, yg - 80, sd); R(pxx - 1, 78, 8, 3, stone); });
    // forecourt
    pave(-24, 24, 9.4, Zf, 1.3, 1.3, '#c4b4a0', '#9c8c78', { vary: ['#d4c4ae', '#ae9e88', '#c8a890'] });
    gq(-6.5, 6.5, Zf - 0.45, Zf, '#d8ccb8', 0.15); R(gx(-6.5, Zf - 0.45), gy(Zf - 0.45, 0.15), gx(6.5, Zf - 0.45) - gx(-6.5, Zf - 0.45), gy(Zf - 0.45) - gy(Zf - 0.45, 0.15) + 1, '#9a8e7a');
    // travellers + pigeons
    manAt(-4.6, 18, { coat: '#3a5a8a', hair: '#2a1a10', bag: '#c83a3a' }); manAt(5.2, 15.6, { coat: '#8a6a3a', hair: '#1a1a1a', bag: '#2a2a2a' });
    manAt(3.4, 21.5, { coat: '#c8c8c0', hair: '#d8a040' }); manAt(-7.5, 21, { coat: '#6a2a2a', hair: '#3a2a1a' });
    for (i = 0; i < 9; i++) { var Zq = rf(12, 16), X = rf(1.2, 3.2) * (i % 2 ? 1 : -1), bx = gx(X, Zq), by = gy(Zq); E(bx, by - 2, 2.5, 1.6, '#7a7a8a'); px(bx + 2, by - 4, '#5a5a6a'); px(bx - 2, by - 2, '#9a9aaa'); px(bx, by, '#d87a5a'); }
    fore(function () { [-1, 1].forEach(function (sg) { lamp(gx(sg * 3.7, 13.4), gy(13.4), 0.75); }); });
    post({ lv: 14 });
    return [wp(-1.4, 10.3), wp(-0.7, 14), wp(-0.1, 19), wp(0, Zf - 0.55), wp(0, Zf - 0.2, 0.15)];
  };

  /* ---- sports: across the lawn to the stadium's main gate ---- */
  AP.sports = function () {
    apSky([[0, '#2e74c8'], [0.7, '#9ccbee'], [1, '#d8eef8']], 120); apClouds(4, null, 8, 26);
    var x, y, i, Zg = 25.8, yg = Math.round(gy(Zg));
    function ub(px2) { var u = (px2 - 192) / 212; return Math.sqrt(Math.max(0, 1 - u * u)); }
    // floodlight masts
    [44, 340].forEach(function (fx) { R(fx, 4, 3, 60, '#5a5e6a'); R(fx + 2, 4, 1, 60, '#3a3e4a'); R(fx - 9, 0, 21, 8, '#2a2e3a'); for (var j = 0; j < 4; j++) { R(fx - 7 + j * 5, 2, 3, 2, '#fff8c0'); R(fx - 7 + j * 5, 5, 3, 2, '#fff8c0'); } c.fillStyle = RG(fx + 1, 4, 0, 24, [[0, 'rgba(255,250,200,0.55)'], [1, 'rgba(255,250,200,0)']]); c.fillRect(fx - 24, 0, 50, 30); });
    // roof canopy + bowl wall
    for (x = 0; x < W; x++) {
      var q = ub(x), yT = Math.round(52 - 20 * q), yB = Math.round(101 + 16 * q), yR = Math.round(yT - 10 - 6 * q), t = (x - 192) / 212;
      R(x, yR, 1, yT - yR, mix('#f4f6fa', '#b8c0cc', Math.max(0, t) * 0.8)); px(x, yR, '#ffffff'); R(x, yT - 2, 1, 2, '#8a92a0');
      R(x, yT, 1, yB - yT, mix(mix('#d8dce4', '#8a90a0', (t + 1) / 2), '#c8ccd4', 0.2));
    }
    for (x = 4; x < W; x += 14) { var q2 = ub(x), yT2 = Math.round(52 - 20 * q2), yR2 = Math.round(yT2 - 10 - 6 * q2); L(x, yR2, x + 7, yT2 - 2, '#a8b0bc'); L(x + 7, yT2 - 2, x + 14, yR2, '#a8b0bc'); }
    // upper openings with crowd, lower arcade
    var crowd = ['#e83a3a', '#3a6ae8', '#ffffff', '#ffd040', '#2a2a3a', '#e88a3a'];
    for (var th = -1.25; th < 1.25; th += 0.075) {
      var xa = 192 + 212 * Math.sin(th), xb = 192 + 212 * Math.sin(th + 0.075), wv = xb - xa; if (xb < -5 || xa > W + 5) continue;
      var qq = ub((xa + xb) / 2), top = Math.round(52 - 20 * qq), bot = Math.round(101 + 16 * qq), hh = bot - top;
      R(xa, top + 1, Math.max(1, wv * 0.22), hh - 1, '#f0f2f6'); R(xa + Math.max(1, wv * 0.22), top + 1, 1, hh - 1, '#8a909c');
      var oy = top + Math.round(hh * 0.12), oh = Math.round(hh * 0.28), ox = xa + wv * 0.3, ow = wv * 0.6;
      if (ow >= 2) { R(ox, oy, ow, oh, '#2a2e3a'); for (var k = 0; k < ow * oh * 0.5; k++) px(ox + rf(0, ow), oy + rf(1, oh), pick(crowd)); }
      var ly = top + Math.round(hh * 0.52), lh = bot - ly - 1;
      if (ow >= 2 && Math.abs((xa + xb) / 2 - 192) > 30) { E(ox + ow / 2, ly + ow / 2, ow / 2, ow / 2, '#4a4e5a'); R(ox, ly + ow / 2, ow, lh - ow / 2, '#4a4e5a'); }
    }
    for (x = 0; x < W; x++) { var q3 = ub(x); px(x, Math.round(52 - 20 * q3 + (101 + 16 * q3 - 52 + 20 * q3) * 0.47), '#b8bcc8'); }
    // main gate
    R(162, 60, 60, 14, '#1a2a5a'); R(162, 60, 60, 1, '#4a6aaa'); txc('STADIUM', 192, 62, '#ffffff', '#0a1a3a', 2);
    R(166, 76, 52, yg - 76, '#d8dce4'); R(170, 80, 44, yg - 80, '#20242e');
    c.fillStyle = RG(192, yg - 10, 0, 30, [[0, 'rgba(120,200,120,0.5)'], [1, 'rgba(120,200,120,0)']]); c.fillRect(170, 80, 44, yg - 80);
    for (x = 172; x < 212; x += 3) R(x, 80, 1, 10, '#8a90a0'); R(170, 90, 44, 1, '#8a90a0');
    for (i = 0; i < 4; i++) { var tx2 = 175 + i * 10; R(tx2, yg - 9, 5, 9, '#7a808c'); R(tx2, yg - 9, 5, 1, '#c8ccd4'); R(tx2 + 5, yg - 7, 4, 1, '#c8ccd4'); px(tx2 + 1, yg - 7, '#40e060'); }
    // banners on the facade
    [[96, '#d82a2a'], [128, '#2a5ad8'], [256, '#2a5ad8'], [288, '#d82a2a']].forEach(function (b) { var by = Math.round(101 + 16 * ub(b[0])) - 44; R(b[0], by, 10, 28, b[1]); P([b[0], by + 28, b[0] + 5, by + 24, b[0] + 10, by + 28], b[1]); R(b[0] + 3, by + 6, 4, 4, '#ffffff'); R(b[0] - 1, by - 1, 12, 1, '#4a4a54'); });
    // flags on the roof rim
    for (i = 0; i < 9; i++) { var fx2 = 40 + i * 38, fy = Math.round(52 - 20 * ub(fx2) - 10 - 6 * ub(fx2)); flagPole(fx2, fy, 10, pick(['#d82a2a', '#2a5ad8', '#ffd040', '#2a9a5a']), 1); }
    // apron, ticket booths
    var Za = 23.2;
    pave(-30, 30, Za, Zg + 3, 1.4, 0.9, '#c4c4c8', '#a0a0a8', { vary: ['#d0d0d4', '#b0b0b8'] });
    [-1, 1].forEach(function (sg) {
      var Zb = 24.4, mm = FL / Zb, bx = gx(sg * 3.6, Zb), by = gy(Zb);
      R(bx - 0.9 * mm, by - 2.4 * mm, 1.8 * mm, 2.4 * mm, '#2a5ad8'); R(bx - 0.9 * mm, by - 2.4 * mm, 1.8 * mm, 0.3 * mm, '#ffffff');
      R(bx - 0.7 * mm, by - 1.8 * mm, 1.4 * mm, 0.7 * mm, '#ffe8a0'); R(bx - 1.0 * mm, by - 1.1 * mm, 2.0 * mm, 0.12 * mm, '#d8dce4');
      txc('TICKETS', bx, by - 2.32 * mm, '#1a2a5a', null, 1);
    });
    // lawn
    for (var z = 9.4; z < Za; z += 1.2) gq(-40, 40, z, Math.min(Za, z + 1.2), (Math.round(z * 10) % 24 < 12) ? '#4a9a3a' : '#5aaa48');
    for (var X = -40; X < 40; X += 3) gq(X, X + 1.5, 9.4, Za, rgba('#2e7a2a', 0.18));
    grass(gy(Za), H, ['#3a8a2a', '#6aba4a', '#5aaa3a', '#2e6a24'], 900);
    for (i = 0; i < 40; i++) { var Zd = rf(10, 20), dx2 = gx(rf(-8, 8), Zd), dy2 = gy(Zd); px(dx2, dy2, '#ffffff'); px(dx2, dy2 - 1, '#ffe040'); }
    var bxb = gx(2.4, 12.2), byb = gy(12.2); E(bxb, byb - 3, 4, 4, '#ffffff'); px(bxb - 1, byb - 4, '#1a1a1a'); px(bxb + 1, byb - 2, '#1a1a1a'); px(bxb + 2, byb - 5, '#1a1a1a'); E(bxb + 1, byb, 4, 1, rgba('#000000', 0.25));
    // fans heading in
    manAt(3.4, 16.5, { coat: '#d82a2a', hair: '#1a1a1a', scarf: '#ffffff' }); manAt(4.1, 17, { coat: '#ffffff', hair: '#8a5a2a', scarf: '#d82a2a' });
    manAt(-5.4, 21, { coat: '#2a5ad8', hair: '#d8a040', scarf: '#ffd040' }); manAt(2.2, 23.9, { coat: '#d82a2a', cap: '#2a2a3a' });
    fore(function () { flagPole(Math.round(gx(-3.7, 11.6)), Math.round(gy(11.6)), 90, '#d82a2a', 1); flagPole(Math.round(gx(3.9, 11.6)), Math.round(gy(11.6)), 90, '#2a5ad8', -1); });
    post({ lv: 14 });
    return [wp(-2.2, 10.3), wp(-1.4, 13.5), wp(-0.5, 18), wp(0, 22.4), wp(0, Zg - 0.15)];
  };

  /* ---- market: into the alley between the stalls, toward the market hall ---- */
  AP.market = function () {
    sky([[0, '#4a8ad8'], [0.7, '#b8d8f0'], [1, '#f0e0c8']], 112);
    var Zh = 30, yh = Math.round(gy(Zh)), x, y, i, z;
    var hc = ['#e8b878', '#d88a6a', '#f0d8a8', '#c8a0a0', '#a8c0a0', '#e8c8a0'];
    // market hall at the far end
    var mh = FL / Zh, hl = gx(-5.4, Zh), hr = gx(5.4, Zh);
    R(hl, yh - 6.4 * mh, hr - hl, 6.4 * mh, '#e0c8a0'); for (y = yh - 6.4 * mh; y < yh; y += 4) R(hl, y, hr - hl, 1, rgba('#a88a60', 0.4));
    P([hl - 3, yh - 6.4 * mh, 192, yh - 8.6 * mh, hr + 3, yh - 6.4 * mh], '#a84a3a'); P([192, yh - 8.6 * mh, hr + 3, yh - 6.4 * mh, 192, yh - 6.4 * mh], '#8a3a2a');
    E(192, yh - 7.1 * mh, 6, 6, '#f4ecdc'); E(192, yh - 7.1 * mh, 5, 5, '#fffaf0'); L(192, yh - 7.1 * mh, 192, yh - 7.1 * mh - 4, '#2a2a2a'); L(192, yh - 7.1 * mh, 195, yh - 7.1 * mh, '#2a2a2a');
    R(166, yh - 5.4 * mh, 52, 13, '#6a2a1a'); txc('MARKET', 192, yh - 5.4 * mh + 2, '#ffe080', '#2a0a00', 2);
    E(192, yh - 3.0 * mh, 1.6 * mh, 1.4 * mh, '#c8a878'); R(192 - 1.6 * mh, yh - 3.0 * mh, 3.2 * mh, 3.0 * mh, '#c8a878');
    E(192, yh - 3.0 * mh, 1.35 * mh, 1.2 * mh, '#5a3a24'); R(192 - 1.35 * mh, yh - 3.0 * mh, 2.7 * mh, 3.0 * mh, '#5a3a24');
    c.fillStyle = RG(192, yh - 1.2 * mh, 0, 20, [[0, 'rgba(255,210,140,0.7)'], [1, 'rgba(255,210,140,0)']]); c.fillRect(192 - 1.35 * mh, yh - 4.2 * mh, 2.7 * mh, 4.2 * mh);
    for (i = 0; i < 4; i++) { R(176 + i * 9, yh - 14, 6, 3, pick(['#d82a2a', '#2a9a4a', '#2a5ad8'])); R(176 + i * 9, yh - 11, 6, 6, '#8a5a30'); }
    [-1, 1].forEach(function (sg) { for (var k = 0; k < 2; k++) { var wx = 192 + sg * (2.8 + k * 1.4) * mh - 3; R(wx, yh - 5.6 * mh, 6, 8, '#4a5a7a'); R(wx - 1, yh - 5.6 * mh + 8, 8, 1, '#f0f0e0'); R(wx, yh - 2.6 * mh, 6, 8, '#4a5a7a'); } });
    // houses lining the alley (walls at X = +-5.4, receding)
    [-1, 1].forEach(function (sg) {
      var Xw = sg * 5.4, zz = 9.4;
      while (zz < Zh) {
        var len = rf(2.6, 4.2), z1 = Math.min(Zh, zz + len), hgt = rf(7.5, 10.5), col = pick(hc), dk = lt(col, sg > 0 ? -0.12 : 0.05);
        P([gx(Xw, zz), gy(zz, hgt), gx(Xw, z1), gy(z1, hgt), gx(Xw, z1), gy(z1, 0), gx(Xw, zz), gy(zz, 0)], dk);
        P([gx(Xw, zz), gy(zz, hgt), gx(Xw, z1), gy(z1, hgt), gx(Xw - sg * 0.6, z1), gy(z1, hgt + 0.9), gx(Xw - sg * 0.6, zz), gy(zz, hgt + 0.9)], '#a84a3a');
        L(gx(Xw, zz), gy(zz, hgt), gx(Xw, z1), gy(z1, hgt), '#6a2a1a'); L(gx(Xw, zz), gy(zz, 0), gx(Xw, zz), gy(zz, hgt), lt(dk, -0.2));
        for (var wy = 3.6; wy < hgt - 1.2; wy += 2.4) for (var wz = zz + 0.6; wz + 1.0 < z1; wz += 1.6) {
          P([gx(Xw, wz), gy(wz, wy + 1.4), gx(Xw, wz + 0.9), gy(wz + 0.9, wy + 1.4), gx(Xw, wz + 0.9), gy(wz + 0.9, wy), gx(Xw, wz), gy(wz, wy)], '#3a4a6a');
          L(gx(Xw, wz - 0.15), gy(wz - 0.15, wy), gx(Xw, wz + 1.05), gy(wz + 1.05, wy), '#f0f0e0');
          if (rnd() < 0.4) for (var f = 0; f < 4; f++) { var fz = wz + rf(0, 0.9); px(gx(Xw, fz), gy(fz, wy) - 1, pick(['#e83a5a', '#ffd040', '#ffffff'])); }
        }
        zz = z1;
      }
    });
    // cobbles
    gq(-5.4, 5.4, 9.4, Zh, '#a89880');
    for (z = 9.4; z < Zh; z += 0.45) { var yy0 = gy(z), yy1 = gy(z + 0.45); if (yy0 - yy1 < 1.2) { gq(-5.4, 5.4, z, z + 0.45, rgba(pick(['#b8a890', '#988870']), 0.5)); continue; } var off = (Math.round(z / 0.45) % 2) * 0.3; for (x = -5.4 - off; x < 5.4; x += 0.6) gq(Math.max(-5.4, x + 0.04), Math.min(5.4, x + 0.56), z + 0.04, z + 0.41, pick(['#b8a890', '#c8b8a0', '#a89880', '#bcae94'])); }
    // bunting across the alley
    [[11.5, 4.9, 0.5], [15, 5.0, 0.5], [19, 5.6, 0.4]].forEach(function (bs) {
      var Zb = bs[0], Ye = bs[1], sag = bs[2];
      for (var t = 0; t < 1; t += 0.01) { var X = -5.4 + 10.8 * t, Yb = Ye - sag * Math.sin(Math.PI * t); px(gx(X, Zb), gy(Zb, Yb), '#4a4a4a'); }
      var mm = FL / Zb, fl = Math.max(2, 0.3 * mm);
      for (t = 0.04; t < 0.98; t += 0.06) { var X2 = -5.4 + 10.8 * t, Y2 = Ye - sag * Math.sin(Math.PI * t), fxx = gx(X2, Zb), fyy = gy(Zb, Y2); P([fxx - fl / 2, fyy, fxx + fl / 2, fyy, fxx, fyy + fl * 1.2], pick(['#e83a3a', '#ffd040', '#3a8ae8', '#40c060', '#ffffff'])); }
    });
    // stalls, far to near
    var aw = [['#d82a2a', '#ffffff'], ['#2a9a4a', '#ffffff'], ['#2a5ad8', '#ffd040'], ['#e8a020', '#ffffff'], ['#8a2a8a', '#ffd040']];
    var fruit = [['#ff8a20', '#ffb040'], ['#d82a2a', '#ff6a5a'], ['#f0d020', '#fff080'], ['#7a2a9a', '#a85ac8'], ['#3a9a2a', '#7ad04a'], ['#e85a8a', '#ff9ab8']];
    function stall(sg, Za2, Zb2, ci) {
      var Xi = sg * 1.9, Xo = sg * 5.2, aI = sg * 1.45, cols = aw[ci % aw.length];
      P([gx(Xo, Za2), gy(Za2, 2.5), gx(Xo, Zb2), gy(Zb2, 2.5), gx(Xo, Zb2), gy(Zb2, 0), gx(Xo, Za2), gy(Za2, 0)], '#3a2a2a');
      P([gx(Xi, Za2), gy(Za2, 2.4), gx(Xo, Za2), gy(Za2, 2.4), gx(Xo, Za2), gy(Za2, 0), gx(Xi, Za2), gy(Za2, 0)], '#4a3a32');
      var vz = (Za2 + Zb2) / 2; man(gx(sg * 3.2, vz), gy(vz), 14 / vz, { coat: pick(['#e8e0d0', '#3a6ac8', '#c83a3a', '#6a8a3a']), hair: '#2a1a10', noShadow: true });
      P([gx(Xi, Za2), gy(Za2, 0.95), gx(Xi, Zb2), gy(Zb2, 0.95), gx(Xi, Zb2), gy(Zb2, 0), gx(Xi, Za2), gy(Za2, 0)], '#8a5a30');
      L(gx(Xi, Za2), gy(Za2, 0.95), gx(Xi, Zb2), gy(Zb2, 0.95), '#c88a4a');
      P([gx(Xi, Za2), gy(Za2, 0.95), gx(Xi, Za2), gy(Za2, 0), gx(Xi + sg * 0.9, Za2), gy(Za2, 0), gx(Xi + sg * 0.9, Za2), gy(Za2, 0.95)], '#6a4422');
      for (var cz = Za2 + 0.1; cz + 0.7 < Zb2; cz += 0.85) {
        var fr = pick(fruit), m0 = FL / cz;
        P([gx(Xi, cz), gy(cz, 0.95), gx(Xi, cz + 0.7), gy(cz + 0.7, 0.95), gx(Xi, cz + 0.7), gy(cz + 0.7, 0.55), gx(Xi, cz), gy(cz, 0.55)], '#a87a40');
        L(gx(Xi, cz), gy(cz, 0.75), gx(Xi, cz + 0.7), gy(cz + 0.7, 0.75), '#6a4a20');
        var nf = Math.max(3, Math.round(0.7 * m0 / 2.4));
        for (var j = 0; j < nf * 3; j++) { var fz = cz + rf(0.02, 0.68), fX = Xi + sg * rf(0.05, 0.9), rr = Math.max(0.8, 0.09 * FL / fz); E(gx(fX, fz), gy(fz, 1.0), rr, rr, fr[0]); px(gx(fX, fz) - 0.4 * rr, gy(fz, 1.0) - 0.4 * rr, fr[1]); }
        var tagx = gx(Xi, cz + 0.3), tagy = gy(cz + 0.3, 0.7); R(tagx - 0.12 * m0, tagy, 0.24 * m0, 0.12 * m0, '#ffffff');
      }
      [Za2, Zb2].forEach(function (pz) { L(gx(Xi, pz), gy(pz, 0), gx(Xi, pz), gy(pz, 2.3), '#5a3a1a'); if (FL / pz > 26) L(gx(Xi, pz) + sg, gy(pz, 0), gx(Xi, pz) + sg, gy(pz, 2.3), '#5a3a1a'); });
      var n2 = 6;
      for (var k = 0; k < n2; k++) {
        var z0 = Za2 + (Zb2 - Za2) * k / n2, z1 = Za2 + (Zb2 - Za2) * (k + 1) / n2;
        P([gx(Xo, z0), gy(z0, 2.75), gx(Xo, z1), gy(z1, 2.75), gx(aI, z1), gy(z1, 2.25), gx(aI, z0), gy(z0, 2.25)], k % 2 ? cols[1] : cols[0]);
        var zm = (z0 + z1) / 2, rr2 = Math.max(1, 0.5 * (gx(aI, z0) - gx(aI, z1)) * sg);
        P([gx(aI, z0), gy(z0, 2.25), gx(aI, z1), gy(z1, 2.25), gx(aI, zm), gy(zm, 2.0)], k % 2 ? cols[1] : cols[0]);
      }
      L(gx(aI, Za2), gy(Za2, 2.25), gx(aI, Zb2), gy(Zb2, 2.25), lt(cols[0], -0.3));
      P([gx(Xo, Za2), gy(Za2, 2.75), gx(aI, Za2), gy(Za2, 2.25), gx(aI, Za2), gy(Za2, 2.05), gx(Xo, Za2), gy(Za2, 2.55)], lt(cols[0], -0.25));
    }
    var segs = [[9.0, 12.6], [12.9, 15.9], [16.2, 19.2], [19.5, 22.5], [22.8, 25.8], [26.1, 29.0]];
    for (i = segs.length - 1; i >= 1; i--) { stall(-1, segs[i][0], segs[i][1], i * 2); stall(1, segs[i][0], segs[i][1], i * 2 + 1); }
    // shoppers along the counters
    manAt(-1.35, 15.2, { coat: '#c83a5a', hair: '#1a1a1a', bag: '#c8904a' }); manAt(1.3, 20.5, { coat: '#3a6ac8', hair: '#d8a040' });
    manAt(-1.25, 24.6, { coat: '#e8e0d0', hair: '#5a3a1a' }); manAt(1.25, 27.2, { coat: '#6a8a3a', hair: '#2a2a2a' });
    // the nearest pair of stalls frames the shot and stays in front of the detective
    fore(function () { stall(-1, segs[0][0], segs[0][1], 0); stall(1, segs[0][0], segs[0][1], 1); });
    post({ lv: 14 });
    return [wp(0.3, 10.3), wp(0, 14), wp(-0.2, 18.5), wp(0, 23), wp(0, 26.6)];
  };

  /* ---- harbor: out along the wooden pier over the water to the harbor office ---- */
  AP.harbor = function () {
    apSky([[0, '#3a7ad0'], [0.7, '#b0d8f4'], [1, '#f0ece0']], 74); apClouds(4, null, 10, 30);
    for (var i = 0; i < 7; i++) bird(rf(20, 360), rf(8, 40), i % 2 ? '#ffffff' : '#3a4a5a');
    var x, y, z;
    // far shore: hills, lighthouse, cranes and containers
    ridge(70, 10, 30, '#8aa8c0', { off: 4, bottom: 73 });
    R(28, 64, 30, 9, '#7a8a8a'); prof(43, 64, 26, function (u) { return 4 - u * 1.4; }, '#f4f4f4'); for (var s = 0; s < 3; s++) R(39 + s * 0.4, 58 - s * 8, 8 - s * 0.8, 3, '#d82a2a');
    R(40, 37, 6, 4, '#ffe880'); R(39, 36, 8, 1, '#2a2a2a'); P([39, 36, 43, 32, 47, 36], '#d82a2a');
    var cc = ['#d83a2a', '#2a6ad8', '#e8a020', '#2a9a5a', '#8a3a8a', '#e8e8e8'];
    for (var r = 0; r < 3; r++) for (var k = 0; k < 9; k++) { x = 270 + k * 8 - r; y = 68 - r * 4; var col = pick(cc); R(x, y, 8, 4, col); R(x, y, 8, 1, lt(col, 0.3)); }
    [300, 336].forEach(function (gx0) { R(gx0, 34, 2, 38, '#e85a20'); R(gx0 + 10, 34, 2, 38, '#c84a18'); R(gx0 - 18, 32, 36, 3, '#e85a20'); for (var q = gx0 - 16; q < gx0 + 16; q += 4) L(q, 35, q + 2, 32, '#a83a10'); R(gx0 - 8, 35, 1, 12, '#2a2a2a'); });
    R(0, 71, W, 2, '#9ab0a8');
    // water
    R(0, 73, W, H - 73, LG(0, 73, 0, H, [[0, '#6aa8d4'], [0.3, '#3a80b8'], [1, '#1a4a7a']]));
    reflect(73, 104, { str: 0.45, tint: '#2a6aa0', src: 73, wave: 1, scale: 1 });
    for (i = 0; i < 260; i++) { var zr = rf(11, 60), yr = gy(zr, -0.8); if (yr > H) continue; R(rf(0, W), yr, rf(2, 4) * 26 / zr + 1, 1, rgba('#ffffff', 0.18 + 0.25 * rnd())); }
    for (i = 0; i < 120; i++) { var zr2 = rf(11, 40), yr2 = gy(zr2, -0.8); R(rf(0, W), yr2, rf(3, 8) * 20 / zr2 + 1, 1, rgba('#123a62', 0.4)); }
    // distant sailboats
    [[96, 80, 1], [236, 77, 0.7]].forEach(function (b) { var bx = b[0], by = b[1], sc = b[2]; R(bx - 7 * sc, by, 14 * sc, 2, '#ffffff'); R(bx, by - 14 * sc, 1, 14 * sc, '#5a4a3a'); P([bx + 1, by - 13 * sc, bx + 1, by - 1, bx + 8 * sc, by - 1], '#fff8f0'); P([bx - 1, by - 11 * sc, bx - 1, by - 1, bx - 6 * sc, by - 1], '#f0d8c8'); R(bx - 6 * sc, by + 3, 12 * sc, 1, rgba('#ffffff', 0.4)); });
    var Zo = 26, Zpl = 24.4, mo = FL / Zo, yo = Math.round(gy(Zo));
    // fishing boat moored off the right side of the pier
    var Zfb = 17, mf = FL / Zfb, wl = gy(Zfb, -0.8), bl = gx(2.4, Zfb), br = gx(7.4, Zfb);
    R(bl - 2, wl + 1, br - bl + 6, 3, rgba('#0a2a4a', 0.5));
    P([bl, wl - 1.1 * mf, br + 0.4 * mf, wl - 1.4 * mf, br, wl + 0.2 * mf, bl + 0.5 * mf, wl + 0.2 * mf], '#e8e0d0');
    R(bl, wl - 1.1 * mf, br - bl + 0.3 * mf, 0.25 * mf, '#2a6ad8'); R(bl + 0.3 * mf, wl - 0.1 * mf, br - bl, 0.2 * mf, '#c83a2a');
    R(bl + 1.4 * mf, wl - 2.6 * mf, 1.6 * mf, 1.5 * mf, '#ffffff'); R(bl + 1.4 * mf, wl - 2.75 * mf, 1.7 * mf, 0.2 * mf, '#2a6ad8');
    R(bl + 1.6 * mf, wl - 2.3 * mf, 0.45 * mf, 0.4 * mf, '#3a5a7a'); R(bl + 2.3 * mf, wl - 2.3 * mf, 0.45 * mf, 0.4 * mf, '#3a5a7a');
    R(bl + 3.6 * mf, wl - 4.6 * mf, 2, 3.5 * mf, '#5a4a3a'); L(bl + 3.6 * mf, wl - 4.6 * mf, br + 0.3 * mf, wl - 1.4 * mf, '#5a4a3a'); L(bl + 3.6 * mf, wl - 4.2 * mf, bl + 0.2 * mf, wl - 1.1 * mf, '#5a4a3a');
    for (i = 0; i < 30; i++) px(bl + 3.7 * mf + rf(0, 1.0 * mf), wl - rf(1.2, 3.8) * mf, rgba('#3a5a3a', 0.8));
    for (i = 0; i < 14; i++) R(rf(bl, br), wl + rf(3, 14), rf(3, 8), 1, rgba('#ffffff', 0.35));
    L(bl + 0.2 * mf, wl - 1.0 * mf, gx(1.75, 16.2), gy(16.2, 0.9), '#d8c8a0');
    // rowboat off the left side
    var Zrb = 13.4, mr = FL / Zrb, wr = gy(Zrb, -0.8), rl = gx(-5.6, Zrb), rr = gx(-2.4, Zrb);
    P([rl, wr - 0.5 * mr, rr, wr - 0.6 * mr, rr - 0.3 * mr, wr + 0.1 * mr, rl + 0.3 * mr, wr + 0.1 * mr], '#3a8a5a'); R(rl + 0.2 * mr, wr - 0.5 * mr, rr - rl - 0.4 * mr, 0.18 * mr, '#5a3a24');
    R(rl, wr + 0.2 * mr, rr - rl, 2, rgba('#0a2a4a', 0.45)); L(rl + 0.4 * mr, wr - 0.55 * mr, rr - 0.6 * mr, wr - 0.95 * mr, '#c8a060');
    L(rr - 0.1 * mr, wr - 0.5 * mr, gx(-1.75, 12.4), gy(12.4, 0.9), '#d8c8a0');
    // office platform on piles
    [-1, 1].forEach(function (sg) { var a = gx(sg * 1.6, Zpl), b = gx(sg * 3.6, Zpl), lo = Math.min(a, b), hi = Math.max(a, b); R(lo, gy(Zpl, 0), hi - lo, gy(Zpl, -0.35) - gy(Zpl, 0), '#4a3424'); for (var q = lo + 2; q < hi; q += 9) R(q, gy(Zpl, -0.35), 3, gy(Zpl, -0.8) - gy(Zpl, -0.35) + 2, '#3a2a1a'); });
    gq(-3.6, 3.6, Zpl, Zo + 2, '#a8865a'); for (z = Zpl; z < Zo + 2; z += 0.3) gq(-3.6, 3.6, z, z + 0.05, '#7a5a3a');
    // harbor office
    var ol = gx(-3, Zo), or2 = gx(3, Zo), ot = gy(Zo, 3.0);
    R(ol, ot, or2 - ol, yo - ot, '#4a7aa8'); for (y = ot + 2; y < yo; y += 3) R(ol, y, or2 - ol, 1, '#3a6290');
    R(ol, ot, 2, yo - ot, '#f4f4f0'); R(or2 - 2, ot, 2, yo - ot, '#f4f4f0');
    P([ol - 6, ot + 1, 192, ot - 1.5 * mo, or2 + 6, ot + 1], '#c83a2a'); P([192, ot - 1.5 * mo, or2 + 6, ot + 1, 192, ot + 1], '#9a2a1e'); R(ol - 6, ot, or2 - ol + 12, 2, '#f4f4f0');
    E(192, ot - 0.6 * mo, 4, 4, '#f4f4f0'); E(192, ot - 0.6 * mo, 3, 3, '#3a5a7a');
    R(191, ot - 1.5 * mo - 22, 1, 22, '#5a5a64'); P([192, ot - 1.5 * mo - 22, 204, ot - 1.5 * mo - 19, 192, ot - 1.5 * mo - 16], '#2a5ad8');
    R(166, ot + 3, 52, 13, '#f4f4f0'); R(167, ot + 4, 50, 11, '#1a3a5a'); txc('HARBOR', 192, ot + 5, '#ffffff', null, 2);
    var dl = gx(-0.55, Zo), dr = gx(0.55, Zo), dtp = gy(Zo, 2.1);
    R(dl - 2, dtp - 2, dr - dl + 4, yo - dtp + 2, '#f4f4f0'); R(dl, dtp, dr - dl, yo - dtp, '#7a4a2a'); R(dl + 2, dtp + 2, dr - dl - 4, 8, '#ffe8a0'); R(dl + 2, dtp + 14, dr - dl - 4, 10, rgba('#000000', 0.18)); px(dr - 3, dtp + 16, '#ffd040');
    [-1, 1].forEach(function (sg) { var wx = gx(sg * 2.0, Zo) - 7; R(wx - 1, gy(Zo, 2.0) - 1, 16, 14, '#f4f4f0'); R(wx + 1, gy(Zo, 2.0) + 1, 12, 10, '#ffe8a0'); R(wx + 6, gy(Zo, 2.0) + 1, 1, 10, '#f4f4f0'); R(wx + 1, gy(Zo, 2.0) + 6, 12, 1, '#f4f4f0'); });
    E(gx(-1.3, Zo), gy(Zo, 1.6), 5, 5, '#ff7020'); E(gx(-1.3, Zo), gy(Zo, 1.6), 3, 3, '#4a7aa8'); for (k = 0; k < 4; k++) { var aa = k * Math.PI / 2 + 0.78; px(gx(-1.3, Zo) + Math.cos(aa) * 4, gy(Zo, 1.6) + Math.sin(aa) * 4, '#ffffff'); }
    var bxo = gx(1.3, Zo), byo = gy(Zo, 2.0); R(bxo - 1, byo - 4, 3, 2, '#3a3a3a'); E(bxo, byo, 3, 3, '#e8b830'); px(bxo - 1, byo - 1, '#fff0a0');
    for (i = 0; i < 3; i++) { var crx = gx(2.4 + i * 0.4, 25.4), cry = gy(25.4); R(crx - 4, cry - 6, 8, 6, '#8a5a30'); R(crx - 4, cry - 6, 8, 1, '#c88a4a'); }
    E(gx(-2.4, 25.3), gy(25.3) - 2, 5, 2.5, '#d8c8a0'); E(gx(-2.4, 25.3), gy(25.3) - 2, 2.5, 1.2, '#a89870');
    // the pier, planks and posts, drawn far to near so posts sink behind nearer deck
    var Zn = 9.0, Zfar = Zpl, segs = [];
    for (z = Zfar; z > Zn; z -= 2.2) segs.push([Math.max(Zn, z - 2.2), z]);
    segs.forEach(function (sgm) {
      var z0 = sgm[0], z1 = sgm[1];
      [-1, 1].forEach(function (sg) { gq(sg * 1.6, sg * 2.2, z0, z1, rgba('#0a2a4a', 0.35), -0.8); });
      gq(-1.6, 1.6, z0, z1, '#a8865a');
      for (var pz = z0; pz < z1; pz += 0.28) { var yy = gy(pz), yy2 = gy(pz + 0.28); gq(-1.6, 1.6, pz, pz + 0.28, rnd() < 0.5 ? '#b08e62' : '#9e7c52'); if (yy - yy2 >= 2) gq(-1.6, 1.6, pz, pz + 0.04, '#6a4a2e'); }
      gq(-0.55, -0.52, z0, z1, rgba('#5a3a22', 0.5)); gq(0.52, 0.55, z0, z1, rgba('#5a3a22', 0.5));
      gq(-1.6, -1.45, z0, z1, '#c8a274'); gq(1.45, 1.6, z0, z1, '#c8a274');
      if (z0 > Zn + 0.01) [-1, 1].forEach(function (sg) { var bx = gx(sg * 1.62, z0), w = Math.max(2, 0.22 * FL / z0); R(bx - w / 2, gy(z0, 0), w, gy(z0, -0.8) - gy(z0, 0), '#4a3020'); R(bx - w / 2, gy(z0, -0.8), w, 2, rgba('#ffffff', 0.35)); });
      if (z0 > Zn + 0.01) fore(function () { [-1, 1].forEach(function (sg) { var mm = FL / z0, bx = gx(sg * 1.62, z0), w = Math.max(2, 0.22 * mm); R(bx - w / 2, gy(z0, 1.0), w, gy(z0, 0) - gy(z0, 1.0), '#5a3a24'); R(bx - w / 2, gy(z0, 1.0), 1, gy(z0, 0) - gy(z0, 1.0), '#8a6a44'); R(bx - w / 2 - 1, gy(z0, 1.0), w + 2, Math.max(1, 0.06 * mm), '#3a2a1a'); }); });
    });
    // rope rails between posts (start of pier hidden at the bottom edge)
    fore(function () {
      [-1, 1].forEach(function (sg) {
        for (var q = 0; q + 1 < segs.length; q++) {
          var za = segs[q][0], zb = segs[q + 1][0];
          for (var t = 0; t <= 1; t += 0.01) { var Zt = za + (zb - za) * t, Yt = 0.92 - 0.2 * Math.sin(Math.PI * t), ww = Math.max(1, 0.05 * FL / Zt); R(gx(sg * 1.62, Zt) - ww / 2, gy(Zt, Yt), ww, ww, '#d8c8a0'); }
        }
      });
    });
    // gull on a post, coil of rope and a lantern by the walkway
    var gp = segs[1][0]; var gxp = gx(1.62, gp), gyp = gy(gp, 1.0); E(gxp, gyp - 3, 3, 2, '#ffffff'); E(gxp + 2, gyp - 5, 1.5, 1.5, '#ffffff'); px(gxp + 3, gyp - 5, '#e8a020'); R(gxp - 3, gyp - 3, 3, 1, '#8a9aa8');
    var ck = gx(-1.1, 11.4), cy2 = gy(11.4); E(ck, cy2 - 2, 7, 3, '#c8b88a'); E(ck, cy2 - 2, 4, 1.6, '#8a7a5a'); E(ck, cy2 - 2, 2, 0.8, '#c8b88a');
    post({ lv: 14 });
    return [wp(0.25, 10.3), wp(0.1, 14.5), wp(0, 19.5), wp(0, Zo - 0.2)];
  };

  // builds the front() layer: final pixels wherever a fore() piece was painted
  function frontLayer() {
    if (!FRONT || !FRONT.length) return null;
    var main = c, keep = rnd, mk = document.createElement('canvas'); mk.width = W; mk.height = H;
    var mc = mk.getContext('2d', { willReadFrequently: true }); mc.imageSmoothingEnabled = false;
    c = mc;
    try { for (var i = 0; i < FRONT.length; i++) { rnd = mb(FRONT[i][0]); FRONT[i][1](); } } finally { c = main; rnd = keep; }
    var md = mc.getImageData(0, 0, W, H), sd = main.getImageData(0, 0, W, H), out = mc.createImageData(W, H), a = md.data, s = sd.data, d = out.data;
    for (var j = 0; j < a.length; j += 4) if (a[j + 3] > 100) { d[j] = s[j]; d[j + 1] = s[j + 1]; d[j + 2] = s[j + 2]; d[j + 3] = 255; }
    mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, W, H); mc.putImageData(out, 0, 0);
    return mk;
  }

  /* ================= API ================= */
  function blit(canvas) { var t = canvas.getContext('2d'); t.save(); t.setTransform(1, 0, 0, 1, 0, 0); t.globalAlpha = 1; t.globalCompositeOperation = 'source-over'; t.imageSmoothingEnabled = false; t.clearRect(0, 0, canvas.width, canvas.height); t.drawImage(c.canvas, 0, 0); t.restore(); }
  window.drawLandmark = function (canvas, id) {
    if (!canvas) return;
    var f = LM[id] || LM.paris;
    begin(canvas, 'lm-' + id);
    try { f(); } catch (e) { if (window.console) console.error('drawLandmark ' + id, e); }
    blit(canvas);
  };
  window.drawBuilding = function (canvas, type) {
    if (!canvas) return;
    var f = BD[type] || BD.bank;
    begin(canvas, 'bd-' + type);
    try { f(); } catch (e) { if (window.console) console.error('drawBuilding ' + type, e); }
    blit(canvas);
  };
  /* drawApproach(canvas 384x188, type) -> { pts: [[x, feetY, scale], ...], front: function (g) }
     pts: the detective's feet from the bottom front to the entrance (scale 1 = the 64x72 sprite).
     front(g): paints the foreground pieces (columns, railings, stalls...) over him; same 384x188 space. */
  window.drawApproach = function (canvas, type) {
    var f = AP[type] || AP.bank, pts = null, fl = null;
    begin({ width: 384, height: 188 }, 'ap-' + type); FRONT = [];
    try { pts = f(); } catch (e) { if (window.console) console.error('drawApproach ' + type, e); }
    try { fl = frontLayer(); } catch (e) { fl = null; if (window.console) console.error('drawApproach front ' + type, e); }
    FRONT = null;
    if (canvas) {
      if (canvas.width === W && canvas.height === H) blit(canvas);
      else { var t = canvas.getContext('2d'); t.save(); t.setTransform(1, 0, 0, 1, 0, 0); t.imageSmoothingEnabled = false; t.clearRect(0, 0, canvas.width, canvas.height); t.drawImage(c.canvas, 0, 0, canvas.width, canvas.height); t.restore(); }
    }
    var out = { pts: pts && pts.length ? pts : [[150, 186, 1.2], [176, 150, 0.8], [192, 122, 0.5]] };
    if (fl) out.front = function (g, ox, oy) { var s = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false; g.drawImage(fl, ox || 0, oy || 0); g.imageSmoothingEnabled = s; };
    return out;
  };
})();
