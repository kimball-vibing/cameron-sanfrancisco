/* people.js - pixel-art cartoon portraits for "Where in the World Is Cameron SanFrancisco?"
   Defines window.drawFace(canvas, person, frame) and window.drawFace.boxes(person).

   Revision 4 (style pass, after "it went too far"):
   - Chunky pixels: everything is painted natively into a 48x48 buffer and doubled onto the
     96x96 canvas, so every visible pixel is a crisp 2x2 block (portrait, talk and blink
     frames, the fedora, and every step of the mystery close-up, which is composited at 48).
   - A silly STYLE, not silly people: flat cel shading in bright colours, bold dark outlines
     (each shape gets a 1px outline wherever it sits in front of a different shape), slightly
     big heads with cartoon silhouettes (round, egg, pear, square-jawed, long), neat eyes, a
     small nose and a pleasant mouth. The caricature parts of revision 3 are gone: no googly,
     crossed, wall or mismatched eyes, no buck or gap teeth, no bulb or potato noses.
     Witnesses keep a little mild fun: a quirky eyebrow, a big smile, rosy cheeks.
   - Poses instead of mug shots: front, three-quarter left/right, looking down at a book or a
     map, nose up (snooty, looking down at you), looking up, glancing sideways. Suspects have
     a pose set in POSE_BY_ID; witnesses get one from their seed.
   - Blink and talk frames copy only the eye and mouth boxes out of a re-render, so they can
     never change anything else. drawFace.boxes reports those boxes per pose in 96px space.
   - Traits still come from the same seeded streams as revision 3, so every person keeps
     their hairstyle, outfit, colours and props (penny, anita, kitty, bella, ima, cash and
     justin look the same, only restyled). Per-suspect tweaks live in cartoonTraits():
     polly and reggie are friendlier, barry has normal teeth, fitz looks normal, and
     cameron is a boy with short neat hair, a red trench coat (his grandma is from San Diego) and
     no hat, posed nose-up. In the mystery close-up the fedora is still everyone's disguise.

   Revision 5 ("I just want their photo"):
   - No hobby props for anyone: the tennis racket, chess piece, climbing rope, opera scarf, the
     cane and the singing mouth are gone, and backgrounds are only the plain/patterned wall.
     Job hats and uniforms stay, and so does looking down at something held (a book, a paper,
     Barry's treasure map), which is a pose.
   - Hair follows the pose: on a three-quarter head the part, fringe and temples are measured
     from the face's centre, the face side is trimmed close and the back of the head carries
     the volume (and covers the ear); a ponytail hangs behind. Bella has a side-parted bob that
     sweeps toward the side she faces.
   - Necks are a straight column that tucks into the neckline (no flare); the neckline's inside
     is filled with the garment's shadow. Cameron's neck goes into a high white stock.
   - fitz (now Phil Mypockets) is clean-shaven, red hair kept; rob keeps his red beard.
     cameron's hair is always brown, keyed on his id. */
(function () {
  'use strict';
  var S = 48, SN = S * S, W = 96, H = 96;
  var R = new Float32Array(SN), G = new Float32Array(SN), B = new Float32Array(SN);
  var OBJ = new Int32Array(SN), GRP = new Uint8Array(SN), MAT = new Uint8Array(SN), NOL = new Uint8Array(SN), FT = new Uint8Array(SN);
  var BG = 0, SKIN = 1, HAIR = 2, CLOTH = 3, MISC = 4, HAT = 5, EYE = 6;
  /* outline groups: a pixel is outlined when a neighbour belongs to another group painted earlier */
  var GR = { back: 1, neck: 2, cloth: 3, inner: 4, trim: 5, ear: 6, head: 7, hair: 8, beard: 9, hat: 10, brim: 11,
    prop: 12, lapel: 13, hand: 14, book: 15, ear2: 16, collar: 17, page: 18, pony: 20 };
  var OL = [38, 24, 44];
  var cur = { obj: 0, grp: 0, mat: 0, nol: 0 };

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dk(c, k) { return [c[0] * k, c[1] * k * 0.97, c[2] * k + (1 - k) * 34]; }
  function lt(c, k) { return mix(c, [255, 248, 232], k); }
  function hexc(h) {
    h = String(h || '#d9a47c').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16); if (isNaN(n)) n = 0xd9a47c;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lum(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function mulberry(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1013904223)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h = h ^ (h >>> 16); return (h >>> 0) / 4294967296;
  }
  function pick(rng, a) { return a[Math.floor(rng() * a.length) % a.length]; }
  function seedNum(s) {
    if (typeof s === 'string') { var h = 0; for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; }
    s = Number(s) || 0; return (Math.floor(s) ^ Math.floor((s % 1) * 1e6)) | 0;
  }
  /* cel ramp: deep shadow, shadow, base, light */
  function rp(c) { return [dk(c, 0.52), dk(c, 0.76), c, lt(c, 0.34)]; }

  function begin(grp, mat, nol) { cur.obj++; cur.grp = grp; cur.mat = mat; cur.nol = nol ? 1 : 0; }
  function px(x, y, c) {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    var i = y * S + x; R[i] = c[0]; G[i] = c[1]; B[i] = c[2];
    OBJ[i] = cur.obj; GRP[i] = cur.grp; MAT[i] = cur.mat; NOL[i] = cur.nol; FT[i] = 0;
  }
  /* recolour without changing which shape owns the pixel (details, facial features) */
  function tint(x, y, c, feat) {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    var i = y * S + x; R[i] = c[0]; G[i] = c[1]; B[i] = c[2]; if (feat) FT[i] = 1;
  }
  function getc(x, y) { var i = y * S + x; return [R[i], G[i], B[i]]; }
  function matAt(x, y) { return (x < 0 || y < 0 || x >= S || y >= S) ? -1 : MAT[y * S + x]; }
  function area(x0, y0, x1, y1, test, shade) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(S - 1, Math.ceil(x1)); y1 = Math.min(S - 1, Math.ceil(y1));
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var qx = x + 0.5, qy = y + 0.5;
      if (test(qx, qy, x, y)) { var c = shade(qx, qy, x, y); if (c) px(x, y, c); }
    }
  }
  function inPoly(qx, qy, pts) {
    var ins = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > qy) !== (yj > qy)) && (qx < (xj - xi) * (qy - yi) / (yj - yi) + xi)) ins = !ins;
    }
    return ins;
  }
  function poly(pts, shade) {
    var a = [1e9, 1e9, -1e9, -1e9];
    pts.forEach(function (p) { a[0] = Math.min(a[0], p[0]); a[1] = Math.min(a[1], p[1]); a[2] = Math.max(a[2], p[0]); a[3] = Math.max(a[3], p[1]); });
    area(a[0], a[1], a[2], a[3], function (qx, qy) { return inPoly(qx, qy, pts); }, shade);
  }
  /* hand-drawn sprite with its own outline; '.' or ' ' is transparent */
  function sprite(rows, ox, oy, cmap, useTint) {
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) {
      var c = cmap[rows[j][i]]; if (!c) continue;
      if (useTint) tint(ox + i, oy + j, c); else px(ox + i, oy + j, c);
    }
  }
  /* ---------- palettes ---------- */
  var HAIR_R = {
    Black: [[10, 9, 13], [22, 19, 27], [36, 31, 43], [54, 47, 63], [80, 73, 95], [120, 114, 140]],
    Brown: [[32, 17, 10], [56, 31, 16], [84, 51, 26], [114, 73, 40], [150, 104, 60], [192, 148, 98]],
    Red: [[66, 19, 10], [106, 32, 14], [148, 50, 20], [188, 76, 32], [222, 114, 56], [246, 166, 104]],
    Blond: [[104, 72, 32], [146, 106, 50], [186, 146, 76], [218, 184, 108], [240, 214, 150], [253, 241, 200]],
    Gray: [[64, 62, 68], [96, 94, 100], [130, 128, 134], [166, 164, 170], [204, 202, 208], [238, 237, 242]],
    White: [[96, 94, 102], [138, 136, 144], [176, 174, 182], [206, 205, 212], [230, 229, 235], [250, 250, 253]]
  };
  var EYES = [[[66, 38, 20], [118, 72, 36]], [[38, 22, 12], [76, 46, 24]], [[84, 72, 32], [138, 120, 56]],
    [[44, 90, 50], [92, 148, 82]], [[40, 78, 138], [98, 150, 212]], [[76, 92, 108], [140, 158, 172]]];
  var BGS = [[58, 88, 108], [84, 70, 108], [108, 66, 74], [66, 96, 78], [116, 98, 58], [76, 82, 98], [100, 78, 62], [52, 78, 96], [92, 100, 70]];
  var CASUAL = [[54, 90, 150], [160, 52, 52], [62, 120, 96], [196, 150, 60], [120, 70, 140], [70, 70, 80], [200, 110, 70], [90, 120, 170], [150, 90, 60], [46, 110, 120], [180, 80, 110]];
  var GOLD = [[110, 72, 16], [168, 118, 30], [214, 168, 52], [244, 210, 96], [255, 242, 180]];

  function seedNum(s) {
    if (typeof s === 'string') { var h = 0; for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; }
    s = Number(s) || 0; return (Math.floor(s) ^ Math.floor((s % 1) * 1e6)) | 0;
  }

  /* ---------- caricature traits: nose, eyes, brows, mouth, ears, cheeks ---------- */
  function sillyTraits(t, q) {
    var cx = t.cx, cy = t.cy, ry = t.ry, nt = t.noseT;
    var base = cy + ry * (0.36 + q() * 0.05);
    var N = { top: t.ey + 1, tipY: base - 1, r: 2.4, bw: 1.3, off: 0, wing: 0.55, wingX: 1.0, nost: 1, red: 0 };
    if (nt === 'button') { N.r = 3.0 + q() * 0.6; N.tipY = base - 1.5; N.bw = 1.0; N.red = q() < 0.3 ? 0.22 : 0; }
    else if (nt === 'bulb') { N.r = 4.8 + q() * 1.2; N.tipY = base + 0.5; N.bw = 2; N.red = q() < 0.55 ? 0.3 : 0; }
    else if (nt === 'long') { N.r = 3.1; N.tipY = cy + ry * (0.55 + q() * 0.05); N.bw = 2.1; N.wing = 0.6; }
    else if (nt === 'hook') { N.r = 3.5; N.tipY = base + 2; N.off = (q() < 0.5 ? -1 : 1) * 2.2; N.bw = 2.2; N.hook = 1; }
    else if (nt === 'wide') { N.r = 3.4; N.tipY = base + 0.5; N.bw = 2; N.wing = 0.95; N.wingX = 1.5; N.nost = 2; }
    else if (nt === 'pointy') { N.r = 2.6; N.tipY = base + 1; N.bw = 1.5; N.wing = 0.75; N.wingX = 1.35; N.up = 1; }
    else if (nt === 'potato') { N.r = 5.2 + q() * 0.7; N.tipY = base + 1; N.bw = 2; N.lumpy = 1; N.wing = 0.5; }
    N.tipY = Math.max(N.tipY, t.ey + 3 + N.r * 0.9);
    var bot = function () { return N.tipY + 0.5 + N.r * Math.max(0.9, 0.3 + N.wing); };
    t.noseB = Math.round(bot());
    t.my = Math.max(Math.round(cy + ry * 0.62), t.noseB + 5);
    var lim = Math.floor(cy + ry - 4), floorY = t.ey + 3 + N.r * 0.9;
    while (t.my > lim) {
      if (N.tipY - 1 >= floorY) N.tipY -= 1; else if (N.r > 2) { N.r -= 0.5; floorY = t.ey + 3 + N.r * 0.9; } else break;
      t.noseB = Math.round(bot()); t.my = Math.max(Math.round(cy + ry * 0.62), t.noseB + 5);
    }
    t.N = N; t.noseW = Math.max(1, Math.round(N.r * N.wingX * 0.75));
    /* mouth */
    t.mw = 4 + Math.floor(q() * 2) + 1 + pick(q, [0, 0, 1, 2]);
    t.buck = q() < 0.24; t.gap = q() < (t.suspect ? 0.3 : 0.25);
    t.grinQ = q(); t.grin = t.grinQ < (t.suspect ? 0.22 : 0.42);
    /* eyes */
    var et = pick(q, ['normal', 'big', 'googly', 'beady', 'sleepy', 'uneven', 'big', 'googly', 'normal']);
    if (t.suspect && et === 'sleepy') t.sly = true;
    t.eyeT = et; t.eyes = {};
    var gaze = pick(q, ['cross', 'wall', 'rand', 'up', 'side']), gs = q() < 0.5 ? -1 : 1, up = q() < 0.5 ? 1 : 0;
    [-1, 1].forEach(function (o) {
      var E = { type: et, off: 0, px: 0, py: 0, r: 4.3 };
      if (et === 'uneven') { E.type = o === gs ? 'big' : 'normal'; E.off = o === gs ? -1 : 0; }
      if (et === 'googly') {
        E.r = (q() < 0.4 && o === gs) ? 3.5 : 4.3;
        if (gaze === 'cross') E.px = o * -1.7; else if (gaze === 'wall') E.px = o * 1.7;
        else if (gaze === 'up') { E.py = -1.7; E.px = -o * 0.6; } else if (gaze === 'side') E.px = gs * 1.7;
        else { E.px = (q() - 0.5) * 3.6; E.py = (q() - 0.5) * 3.2; }
        if (gaze !== 'up' && up) E.py += 0.6;
      }
      if (E.type === 'big' && et !== 'uneven') E.px = gaze === 'cross' ? o * -1 : 0;
      var ext = { normal: [5, -3, 4], sleepy: [5, -3, 4], big: [6, -4, 5], googly: [6, -5, 6], beady: [4, -3, 4] }[E.type];
      E.ax = ext[0]; E.y0 = ext[1]; E.y1 = ext[2];
      E.topRow = { normal: t.sly ? 0 : -1, sleepy: -1, big: -2, googly: -4, beady: 0 }[E.type];
      if (E.type === 'normal' && !t.sly) E.topRow = -1;
      t.eyes[o] = E;
    });
    t.esp = Math.max(t.esp, et === 'googly' ? 7 : 6) + (q() < 0.25 ? 1 : 0) - (et === 'beady' && q() < 0.5 ? 1 : 0);
    /* brows */
    t.browT = pick(q, ['normal', 'high', 'angry', 'worried', 'wiggly', 'tilted', 'normal']);
    if (t.suspect && q() < 0.4) t.browT = pick(q, ['angry', 'tilted']);
    if (t.worried) t.browT = 'worried';
    t.browTh = pick(q, t.fem ? [1, 2, 2, 2, 3] : [2, 2, 3, 3, 4]);
    if (t.bushy) t.browTh = Math.max(t.browTh, 3);
    t.tiltSide = q() < 0.5 ? -1 : 1;
    if (!t.unibrow && !t.fem && q() < 0.12) t.unibrow = true;
    /* ears & cheeks */
    t.earS = pick(q, t.fem ? [1, 1, 1, 1.25] : [1, 1, 1.3, 1.5, 1.65]);
    t.rosy = q() < 0.4; if (t.rosy) t.blushA = Math.max(t.blushA, 0.42);
    t.freckles = t.sl > 0.5 && q() < 0.3;
  }

  /* ---------- traits (deterministic per person) ---------- */
  function makeTraits(p) {
    var sd = seedNum(p.seed), rng = mulberry(sd ^ 0x5bd1e995);
    rng(); rng();
    var t = { sd: sd, fem: p.sex === 'Female', old: p.age === 'old', young: p.age === 'young', p: p };
    t.cx = 48; t.cy = 44;
    t.rx = (t.fem ? 16.8 : 17.8) + rng() * 2.2 + (t.young ? 0.6 : 0);
    t.ry = (t.fem ? 21.8 : 22.6) + rng() * 1.6 - (t.young ? 0.8 : 0);
    t.jawK = t.fem ? 2.0 + rng() * 0.4 : 2.4 + rng() * 0.9;
    t.jawN = t.fem ? 0.30 + rng() * 0.14 : 0.18 + rng() * 0.16;
    if (t.young) { t.jawK = 2.0; t.jawN = 0.27; }
    /* caricature traits use their own stream so the classic traits above/below stay put */
    var q = mulberry(sd ^ 0x2c1b3c6d); q(); q(); t.q = q;
    var hsh = pick(q, ['egg', 'pear', 'long', 'round', 'square', 'egg', 'round', 'pear', 'long', 'normal']);
    if (hsh === 'square' && t.fem && q() < 0.6) hsh = 'round';
    t.headShape = hsh; t.jawS = 1;
    if (hsh === 'egg') { t.rx += 1.8; t.ry += 1.2; t.jawS = 0.78; t.jawK = 1.8; }
    else if (hsh === 'pear') { t.rx -= 1.6; t.jawS = 1.26; t.jawK = 2.7; t.jawN = 0.1; }
    else if (hsh === 'long') { t.ry += 2.8; t.rx -= 1.8; }
    else if (hsh === 'round') { t.rx += 2.6; t.ry -= 1.4; t.jawK = 1.9; t.jawN = 0.16; }
    else if (hsh === 'square') { t.jawK = 4.4; t.jawN = 0.05; t.rx += 0.8; t.jawS = 1.05; }
    t.ry = Math.min(t.ry, 26);
    var nt = pick(q, ['button', 'bulb', 'long', 'hook', 'wide', 'pointy', 'potato', 'bulb', 'long', 'button', 'hook', 'potato']);
    t.noseT = nt;
    t.ey = t.cy + 1 - ((nt === 'long' || nt === 'potato' || nt === 'bulb') ? 2 : 0);
    t.esp = 7 + Math.floor(rng() * 1.8);
    t.noseW = rng() < 0.5 ? 1 : 2; t.noseB = Math.round(t.cy + t.ry * (0.36 + rng() * 0.05));
    t.my = Math.round(t.cy + t.ry * 0.62); if (t.my <= t.noseB + 3) t.my = t.noseB + 4;
    t.mw = (t.fem ? 4 : 4) + Math.floor(rng() * 2);
    t.lipFull = rng();
    t.nw = t.fem ? 7.5 : 9;
    t.skin = hexc(p.skin); t.sl = lum(t.skin);
    t.skR = [dk(mix(t.skin, [120, 30, 50], 0.18), 0.55), dk(mix(t.skin, [150, 50, 50], 0.12), 0.7),
      mix(mul(t.skin, 0.86), [190, 70, 60], 0.08), t.skin, mix(t.skin, [255, 230, 200], 0.2), mix(t.skin, [255, 244, 228], 0.42)];
    var lipBase = t.sl < 0.42 ? [120, 56, 62] : [196, 92, 96];
    t.lip = mix(mul(t.skin, 0.82), lipBase, t.fem ? 0.42 : 0.26);
    var ec = rng();
    t.eye = t.sl < 0.45 ? (ec < 0.6 ? EYES[1] : ec < 0.9 ? EYES[0] : EYES[2]) : EYES[Math.floor(ec * EYES.length) % EYES.length];
    var hk = p.hair in HAIR_R ? p.hair : 'Brown';
    t.hairR0 = HAIR_R[hk];
    t.hairR = t.old ? (rng() < 0.45 ? HAIR_R.White : HAIR_R.Gray) : t.hairR0;
    t.hairTint = { Black: [70, 80, 130], Brown: [150, 70, 30], Red: [230, 120, 30], Blond: [230, 170, 70] }[hk] || [150, 70, 30];
    t.hairTint2 = { Black: [90, 60, 70], Brown: [200, 160, 110], Red: [255, 200, 140], Blond: [255, 250, 220] }[hk] || [200, 160, 110];
    if (t.old) { t.hairTint = [150, 150, 170]; t.hairTint2 = [255, 255, 255]; }
    t.pepper = t.old ? 0.15 + rng() * 0.3 : 0;
    t.browR = t.old ? HAIR_R.Gray : (hk === 'Blond' ? [t.hairR0[0], t.hairR0[1], t.hairR0[2]] : t.hairR0);
    t.suspect = p.style === 'suspect';
    t.job = p.job; t.feature = p.feature; t.hobby = p.hobby;
    t.sly = t.suspect && rng() < 0.6;
    t.look = t.suspect && rng() < 0.4 ? (rng() < 0.5 ? -1 : 1) : 0;
    t.smile = t.suspect ? (rng() < 0.6 ? 'smirk' : 'flat') : (rng() < 0.75 ? 'smile' : 'flat');
    t.browRaise = t.suspect && rng() < 0.6 ? (rng() < 0.5 ? -1 : 1) : 0;
    t.lipstick = t.fem && (t.suspect ? rng() < 0.7 : rng() < 0.3);
    if (t.lipstick) t.lip = mix(t.lip, pick(rng, [[178, 30, 48], [150, 40, 80], [196, 70, 70]]), 0.6);
    t.blushA = t.young ? 0.32 : t.fem ? 0.27 : 0.19;
    t.mw += 1;
    t.grin = !t.suspect && rng() < 0.3;
    t.gap = rng() < (t.suspect ? 0.3 : 0.2);
    t.unibrow = t.suspect && !t.fem && rng() < 0.35;
    t.bushy = (!t.fem && (t.old || t.suspect) && rng() < 0.6) || t.unibrow;
    t.worried = !t.suspect && rng() < 0.2;
    sillyTraits(t, q);

    /* hairstyle */
    var st;
    if (t.fem) st = pick(rng, ['long', 'long', 'wavy', 'bob', 'ponytail', 'curly', 'bun', 'pixie', 'wavy', 'bob']);
    else st = pick(rng, ['short', 'short', 'buzz', 'slick', 'quiff', 'curlyshort', 'short', 'long', 'buzz', 'slick']);
    if (t.fem && q() < 0.28) st = pick(q, ['ponytail', 'pigtails', 'spacebuns', 'ponytail']);
    if (t.old && !t.fem && rng() < 0.4) st = 'bald';
    if (t.old && t.fem && st === 'pixie' && rng() < 0.5) st = 'bun';
    t.style = st;
    var s = { capH: 2.5, capW: 2, hl: 0.47, bangs: false, part: pick(rng, [-1, 1, 0.5, -0.5]), back: false, locks: false,
      backLen: 0, flare: 0.25, lockIn: 2, lockOut: 3, sideBot: t.cy - 2, burn: t.fem ? 1 : 3, wave: 0, curly: false, buzz: false, slick: false };
    if (st === 'long' || st === 'wavy') {
      s.capH = 3; s.capW = 3; s.back = true; s.locks = true; s.backLen = 82 + rng() * 12; s.lockLen = s.backLen - 2;
      s.bangs = rng() < 0.4; s.bangY = 0.28; s.wave = st === 'wavy' ? 1.3 : 0.3; s.sideBot = t.cy - 6; s.flare = 0.22;
    } else if (st === 'bob') {
      s.capH = 3.2; s.capW = 3.5; s.back = true; s.locks = true; s.backLen = t.cy + t.ry * 0.72; s.lockLen = s.backLen; s.flare = 0.12;
      s.bangs = rng() < 0.55; s.bangY = 0.3; s.sideBot = t.cy - 6; s.lockOut = 3.5;
    } else if (st === 'ponytail' || st === 'bun' || st === 'pigtails' || st === 'spacebuns') {
      s.capH = 1.6; s.capW = 1.4; s.hl = 0.5; s.part = 0; s.sideBot = t.cy - 1; s.pony = st === 'ponytail' ? (rng() < 0.5 ? -1 : 1) : 0; s.bun = st === 'bun';
      s.ponyHigh = s.pony && q() < 0.5; s.pig = st === 'pigtails'; s.buns2 = st === 'spacebuns';
      if (s.pig) s.sideBot = t.cy - 3;
    } else if (st === 'curly') {
      s.curly = true; s.capH = 6; s.capW = 6; s.back = true; s.locks = true; s.backLen = 74 + rng() * 10; s.lockLen = s.backLen; s.flare = 0.3;
      s.sideBot = t.cy - 6; s.lockIn = 1.5; s.lockOut = 4.5; s.hl = 0.45;
    } else if (st === 'pixie') {
      s.capH = 2.8; s.capW = 2.2; s.bangs = true; s.bangY = 0.32; s.sideBot = t.cy + 1; s.burn = 2;
    } else if (st === 'short') {
      s.capH = 2.4 + rng(); s.capW = 1.6; s.hl = 0.44 + rng() * 0.08; s.burn = 3 + Math.floor(rng() * 3);
    } else if (st === 'buzz') {
      s.buzz = true; s.capH = 0.8; s.capW = 0.7; s.hl = 0.5; s.burn = 2;
    } else if (st === 'slick') {
      s.slick = true; s.capH = 2.2; s.capW = 1.4; s.hl = 0.5; s.burn = 3;
    } else if (st === 'quiff') {
      s.capH = 4.8; s.capW = 1.8; s.hl = 0.47; s.burn = 3; s.quiff = true;
    } else if (st === 'curlyshort') {
      s.curly = true; s.capH = 4; s.capW = 3; s.hl = 0.46; s.burn = 2;
    } else if (st === 'bald') {
      s.bald = true; s.capH = 1; s.capW = 1.2; s.hl = 0.2; s.burn = 2;
    }
    /* silly hair volume */
    var vol = pick(q, [1, 1, 1.35, 1.7, 2.1]);
    if (s.buzz || s.slick || s.pony || s.bun || s.pig || s.buns2) vol = 1;
    if (vol > 1) {
      s.capH = s.capH * vol + (vol - 1) * 1.5; s.capW = s.capW * vol + (vol - 1) * (s.bald ? 2.5 : 1);
      if (s.locks) s.lockOut += (vol - 1) * 2.5;
      if (s.back) s.flare *= vol;
    }
    s.capH = Math.min(s.capH, t.cy - 4 - t.ry);
    t.vol = vol;
    t.cowlick = !s.buzz && !s.curly && q() < (s.bald ? 0.7 : 0.3);
    t.hs = s;
    /* beard */
    t.beard = null;
    if (!t.fem && !t.young) {
      var br = rng();
      if (br < 0.13) t.beard = 'full'; else if (br < 0.25) t.beard = 'mustache'; else if (br < 0.33) t.beard = 'goatee'; else if (br < 0.46) t.beard = 'stubble';
    }
    t.wrinkles = t.old; t.lines = !t.young && rng() < 0.3;
    t.glasses = (p.job === 'museum' || p.job === 'library') ? true : t.old ? rng() < 0.55 : rng() < 0.08;
    t.glassStyle = pick(rng, ['round', 'rect', 'rect']); t.glassCol = pick(rng, [[30, 22, 20], [92, 52, 28], [180, 140, 50], [40, 40, 60]]);
    t.bg = pick(rng, BGS); t.bgPat = Math.floor(rng() * 5);
    t.c1 = pick(rng, CASUAL); t.c2 = pick(rng, CASUAL); t.c3 = pick(rng, CASUAL);
    t.casual = pick(rng, t.fem ? ['blouse', 'sweater', 'jacket', 'tee', 'vneck', 'cardi'] : ['sweater', 'jacket', 'tee', 'shirt', 'hoodie', 'vneck']);
    if (t.suspect) t.casual = pick(rng, ['leather', 'velvet', 'turtle', 'leather', 'velvet']);
    t.scarfFem = t.fem && rng() < 0.5;
    t.capVariant = rng();
    t.r2 = rng(); t.r3 = rng(); t.r4 = rng();
    if (t.feature === 'Tattoo' && t.casual === 'turtle') t.casual = 'leather';
    return t;
  }

  /* ---------- cartoon layer: palettes, poses, 48px geometry, per-suspect tweaks ---------- */
  var HAIR48 = {
    Black: [[24, 22, 38], [40, 37, 60], [62, 58, 92], [104, 104, 152]],
    Brown: [[74, 40, 22], [112, 64, 34], [152, 96, 52], [198, 142, 88]],
    Red: [[150, 42, 20], [200, 76, 32], [236, 116, 54], [252, 174, 104]],
    Blond: [[176, 124, 52], [218, 170, 82], [246, 212, 116], [255, 242, 184]],
    Gray: [[100, 100, 114], [146, 146, 160], [190, 190, 204], [230, 230, 240]],
    White: [[150, 150, 168], [198, 198, 212], [234, 234, 242], [255, 255, 255]]
  };
  var BRIGHT_BG = [[104, 182, 238], [124, 208, 164], [250, 180, 112], [246, 150, 184], [178, 158, 242], [250, 210, 98], [92, 198, 206], [244, 132, 118], [172, 216, 104]];
  var WHITE = [238, 238, 232], GOLD4 = [[150, 96, 20], [212, 152, 34], [250, 206, 72], [255, 244, 170]];
  var POSES = {
    front:   { turn: 0, dy: 0, e: 1, n: 5, m: 8, eye: 'open', gx: 0, hl: 0 },
    threeL:  { turn: -1, dy: 0, e: 1, n: 5, m: 8, eye: 'open', gx: -1, hl: 0 },
    threeR:  { turn: 1, dy: 0, e: 1, n: 5, m: 8, eye: 'open', gx: 1, hl: 0 },
    glanceL: { turn: 0, dy: 0, e: 1, n: 5, m: 8, eye: 'open', gx: -1, hl: 0 },
    glanceR: { turn: 0, dy: 0, e: 1, n: 5, m: 8, eye: 'open', gx: 1, hl: 0 },
    down:    { turn: 0, dy: 1, e: 3, n: 6, m: 9, eye: 'down', gx: 0, hl: 1.5, book: true },
    up:      { turn: 0, dy: 0, e: 0, n: 4, m: 7, eye: 'up', gx: 0, hl: -0.5 },
    snooty:  { turn: 0, dy: -1, e: -1, n: 4, m: 7, eye: 'half', gx: 0, hl: -1.6, nostrils: true }
  };
  var POSE_BY_ID = { penny: 'glanceR', anita: 'threeR', polly: 'front', lotta: 'down', ima: 'glanceL', kitty: 'threeL',
    candy: 'up', bella: 'threeR', hugh: 'glanceL', rob: 'front', reggie: 'threeR', cash: 'threeL', justin: 'up',
    barry: 'down', fitz: 'glanceR', cameron: 'snooty', count: 'snooty' };
  var WITNESS_POSES = ['front', 'front', 'threeL', 'threeR', 'threeL', 'threeR', 'down', 'glanceL', 'glanceR', 'up', 'snooty', 'down'];
  /* head silhouettes: [rx+, ry+, upper width, upper exponent, lower width, lower exponent] */
  var SHAPES = { egg: [0.3, 1.0, 1, 2, 0.84, 1.8], pear: [0, 0, 0.86, 2, 1.07, 3.4], long: [-0.8, 1.2, 1, 2, 0.95, 2.7],
    round: [1.0, -0.5, 1, 2, 1, 2.1], square: [0.4, 0, 1, 2.4, 1.0, 4.4], normal: [0, 0, 1, 2, 0.97, 2.6] };

  function cartoonTraits(t, p) {
    var c = mulberry(t.sd ^ 0x7f4a7c15); c(); c();
    var id = p.id || '';
    t.id = id;
    t.outfit = null;
    if (id === 'cameron') {
      t.fem = false; t.old = false; t.young = true; t.beard = null; t.glasses = false; t.style = 'short';
      t.hs = { capH: 3.4, capW: 2, hl: 0.56, bangs: false, part: 0.5, back: false, locks: false, backLen: 0, flare: 0, lockIn: 2, lockOut: 3, sideBot: t.cy - 2, burn: 2, wave: 0 };
      t.hairR = t.hairR0; t.cowlick = false; t.outfit = 'redcoat'; t.headShape = 'egg';
    }
    if (id === 'polly') { t.headShape = 'round'; t.hs.capW = Math.min(t.hs.capW, 4); t.hs.capH = Math.min(t.hs.capH, 4); t.hs.bangs = true; t.hs.bangY = 0.3; }
    if (id === 'reggie') { t.headShape = 'normal'; t.beard = null; }
    if (id === 'barry') t.headShape = 'square';
    if (id === 'fitz') { t.headShape = 'round'; t.beard = null; }
    var pn = POSE_BY_ID[id] || pick(c, WITNESS_POSES);
    t.poseName = pn; t.pose = POSES[pn];
    var sh = SHAPES[t.headShape] || SHAPES.normal;
    t.hx = 24; t.hy = 22 + t.pose.dy;
    t.hrx = (t.fem ? 10 : 10.6) + sh[0] + (hash(t.sd, 1, 2) - 0.5) * 0.8 + (t.young ? 0.3 : 0);
    t.hry = Math.min(13.8, 12.6 + sh[1] + (hash(t.sd, 3, 4) - 0.5) * 0.8 - (t.young ? 0.4 : 0));
    t.us = sh[2]; t.eu = sh[3]; t.ls = sh[4]; t.el = Math.max(1.7, sh[5] - (t.fem ? 0.3 : 0));
    var dir = t.pose.turn; t.dir = dir;
    t.fcx = 24 + dir * 3;
    t.ey = t.hy + t.pose.e; t.ny = t.hy + t.pose.n; t.my = t.hy + t.pose.m;
    t.nw48 = t.fem ? 3.4 : 4.2;
    var wide = !dir && c() < 0.3 ? 1 : 0;
    if (dir < 0) t.eyes48 = [{ x0: t.fcx - 5, x1: t.fcx - 3, side: -1 }, { x0: t.fcx + 2, x1: t.fcx + 5, side: 1 }];
    else if (dir > 0) t.eyes48 = [{ x0: t.fcx - 6, x1: t.fcx - 3, side: -1 }, { x0: t.fcx + 2, x1: t.fcx + 4, side: 1 }];
    else t.eyes48 = [{ x0: t.fcx - 6 - wide, x1: t.fcx - 3 - wide, side: -1 }, { x0: t.fcx + 2 + wide, x1: t.fcx + 5 + wide, side: 1 }];
    t.gx = t.pose.gx; if (dir && c() < 0.5) t.gx = 0;
    t.mcx = t.fcx; t.mw2 = t.mw >= 7 ? 3 : 2;
    if (dir) t.mw2 = 2;
    /* colours */
    var skin = hexc(p.skin);
    t.sk = [dk(mix(skin, [150, 50, 70], 0.2), 0.62), mix(dk(skin, 0.84), [200, 80, 80], 0.1), skin, lt(skin, 0.26)];
    var hk = id === 'cameron' ? 'Brown' : p.hair in HAIR48 ? p.hair : 'Brown';
    t.hR = t.old ? (t.hairR === HAIR_R.White ? HAIR48.White : HAIR48.Gray) : HAIR48[hk];
    t.browC = t.old ? HAIR48.Gray[0] : hk === 'Blond' ? [150, 100, 40] : hk === 'Red' ? [150, 50, 26] : t.hR[0];
    t.iris = t.sl < 0.45 ? [60, 34, 20] : pick(c, [[64, 40, 22], [44, 92, 160], [50, 120, 70], [90, 60, 30], [70, 96, 130]]);
    t.pupil = [26, 16, 30];
    t.lipC = t.lipstick ? pick(c, [[214, 44, 72], [190, 52, 112], [228, 92, 92]]) : null;
    t.bgc = BRIGHT_BG[Math.floor(hash(t.sd, 7, 9) * BRIGHT_BG.length)]; t.bgPat = Math.floor(hash(t.sd, 11, 3) * 5);
    /* expression */
    var mt;
    if (t.suspect) mt = t.smile === 'smirk' ? 'smirk' : 'smile';
    else mt = t.grin ? 'grin' : t.smile === 'smile' ? 'smile' : 'smile';
    if (pn === 'snooty') mt = 'smirk';
    if (id === 'polly' || id === 'reggie') mt = 'grin';
    if (id === 'barry') mt = 'grin';
    if (id === 'cameron') mt = 'smirk';
    t.mouthT = mt;
    var bt = t.browT;
    if (bt === 'wiggly') bt = 'high';
    if (t.suspect && bt === 'worried') bt = 'normal';
    if (id === 'polly' || id === 'reggie') bt = 'normal';
    t.brows = [bt, bt];
    if (bt === 'tilted') t.brows = t.tiltSide < 0 ? ['high', 'angry'] : ['angry', 'high'];
    if (t.browRaise) t.brows[t.browRaise < 0 ? 0 : 1] = 'high';
    if (pn === 'snooty' || pn === 'up') t.brows = ['high', 'high'];
    if (id === 'cameron') t.brows = ['high', 'angry'];
    t.browThick = !t.fem && (t.bushy || t.browTh >= 3);
    t.blush = t.rosy ? 2 : (t.fem || t.young) ? 1 : 0;
    t.earS48 = Math.min(t.earS || 1, 1.15);
    t.bookKind = id === 'barry' ? 'map' : ({ station: 'map', airport: 'map', harbor: 'map', market: 'paper', hotel: 'paper' })[t.job] || 'book';
    t.bookC = pick(c, [[200, 50, 60], [50, 110, 190], [60, 150, 90], [130, 70, 160], [230, 150, 40]]);
    t.h48 = hairParams(t);
    if (id === 'bella') {
      // a side-parted bob: the part sits over her far eye, and the fringe sweeps across to the side she faces
      var hb = t.h48; hb.bangs = false; hb.part = t.dir || 1; hb.hl = 0.42; hb.sweep = 6;
      hb.capW = Math.min(hb.capW, 2.6); hb.capH = Math.min(hb.capH, 2.4); hb.lockOut = Math.min(hb.lockOut, 2.6);
    }
  }

  /* ---------- geometry ---------- */
  function headW(t, py) {
    var v = (py - t.hy) / t.hry; if (v <= -1 || v >= 1) return 0;
    var a = Math.abs(v);
    if (v < 0) return t.hrx * t.us * Math.pow(1 - Math.pow(a, t.eu), 1 / t.eu);
    return t.hrx * t.ls * Math.pow(1 - Math.pow(a, t.el), 1 / t.el);
  }
  function inHead(t, qx, qy) { return Math.abs(qx - t.hx) < headW(t, qy); }
  function shoulderTop(t, qx) { var dx = qx - t.hx; return 38.6 + (t.fem ? 0.0125 : 0.0105) * dx * dx; }

  /* ---------- background ---------- */
  function drawBG(t) {
    var c0 = t.bgc, c1 = lt(c0, 0.2), c2 = dk(c0, 0.9);
    cur.obj = 0; cur.grp = 0; cur.mat = BG; cur.nol = 1;
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var on = false, p = t.bgPat;
      if (p === 0) { var oy = (Math.floor(y / 6) & 1) * 3; on = ((x + oy) % 6 < 2) && (y % 6 < 2); }
      else if (p === 1) on = ((x + y) % 8) < 3;
      else if (p === 2) on = ((x >> 2) + (y >> 2)) & 1;
      else if (p === 3) { var a = Math.atan2(y + 0.5 - 22, x + 0.5 - 24); on = (Math.floor((a + Math.PI) * 12 / (2 * Math.PI)) & 1) === 0; }
      else { var dx = x + 0.5 - 24, dy = y + 0.5 - 22; on = dx * dx + dy * dy < 400; }
      var c = on ? c1 : c0;
      if (y >= 46) c = c2;
      R[y * S + x] = c[0]; G[y * S + x] = c[1]; B[y * S + x] = c[2];
      OBJ[y * S + x] = 0; GRP[y * S + x] = 0; MAT[y * S + x] = BG; NOL[y * S + x] = 1; FT[y * S + x] = 0;
    }
  }

  /* ---------- hair ---------- */
  function hairParams(t) {
    var s0 = t.hs, k = 0.55, Y = function (y) { return t.hy + (y - t.cy) / t.ry * t.hry; };
    var s = { capW: s0.capW * k + 0.5, capH: s0.capH * k + 0.6, hl: s0.hl, bangs: s0.bangs, bangY: s0.bangY || 0.3, part: s0.part, back: s0.back, locks: s0.locks,
      backLen: Y(s0.backLen), lockLen: Y(s0.lockLen || s0.backLen), flare: s0.flare, lockIn: s0.lockIn * 0.5, lockOut: s0.lockOut * 0.55 + 0.3,
      sideBot: Y(s0.sideBot), burn: s0.burn * 0.5, wave: (s0.wave || 0) * 0.7, curly: s0.curly, buzz: s0.buzz, slick: s0.slick, quiff: s0.quiff,
      bald: s0.bald, pony: s0.pony, ponyHigh: s0.ponyHigh, pig: s0.pig, buns2: s0.buns2, bun: s0.bun };
    s.capH = Math.min(s.capH, t.hy - t.hry - 1.2);
    return s;
  }
  /* Hair follows the head's pose. On a turned head (dir -1/+1) the part, the fringe and the
     temples are measured from the face's centre (fcx), not the skull's: the face side of the
     hairline is short, the back of the head carries more hair down over the ear. */
  function hairline(t, s, qx) {
    var d = t.dir, dx = qx - t.fcx, side = dx < 0 ? -1 : 1, span = t.hrx - d * side * (t.fcx - t.hx);
    var a = Math.min(1, Math.abs(dx) / Math.max(4, span)), burn = s.burn + (d && side === -d ? 1.2 : 0), base;
    if (s.bald) base = t.hy - t.hry * 0.38;
    else if (s.bangs) { base = t.hy - t.hry * s.bangY + s.part * dx * 0.15; base += ((Math.floor(qx) + (t.sd & 3)) % 3 === 0) ? 1 : 0; }
    else {
      base = t.hy - t.hry * s.hl;
      if (s.part) { var u = dx + s.part * 3.5; base += u * s.part < 0 ? -0.5 : clamp(u * s.part * (s.sweep ? 0.8 : 0.32), 0, s.sweep || 2.6); }
    }
    base += t.pose.hl;
    return base + Math.pow(a, 2.3) * (t.hy + burn - base);
  }
  function capMask(t, s, qx, qy) {
    if (qy < t.hairCut) return false;
    var dx = qx - t.hx, dy = qy - (t.hy - 0.5), rh = t.hry + s.capH, y0 = t.hy - t.hry * 0.35, d = t.dir;
    var cw = s.capW * (d ? (dx * d > 0 ? 0.7 : 1.25) : 1) + (d && dx * d < 0 ? 0.5 : 0);
    var rw = t.hrx + cw * (s.locks || s.back ? 1 : 1 - 0.7 * clamp((qy - y0) / Math.max(1, s.sideBot - y0), 0, 1));
    var qd = qx - t.fcx;
    if (s.quiff && dy < 0 && qd < 4 && qd > -6) rh += 1.8 * (1 - Math.abs(qd + 1) / 5);
    var e = dx * dx / (rw * rw) + dy * dy / (rh * rh);
    if (s.curly) e -= Math.sin(Math.atan2(dy, dx) * 11 + t.sd) * 0.06;
    if (e > 1) return false;
    if (s.bald) return Math.abs(dx) > headW(t, qy) - 1.8 && qy > t.hy - t.hry * 0.42 && qy < t.hy + 1;
    if (Math.abs(dx) < headW(t, qy)) return qy < hairline(t, s, qx);
    return qy < s.sideBot + (d && dx * d < 0 ? 1 : 0);
  }
  function backMask(t, s, qx, qy) {
    if (!s.back || qy < t.hairCut) return false;
    var sdx = qx - t.hx, dx = Math.abs(sdx), top = t.hy - 0.5, w, d = t.dir;
    var cw = s.capW * (d ? (sdx * d > 0 ? 0.7 : 1.25) : 1) + (d && sdx * d < 0 ? 0.5 : 0);
    if (qy < top) { var e = (qy - top) / (t.hry + s.capH); if (e <= -1) return false; w = (t.hrx + cw) * Math.sqrt(1 - e * e); }
    else w = t.hrx + cw + (qy - top) * s.flare * (d ? (sdx * d > 0 ? 0.7 : 1.2) : 1);
    if (s.curly) w += Math.sin(qy * 1.3 + t.sd) * 0.7;
    var bot = s.backLen - (dx > w - 2 ? 1 : 0) + ((Math.floor(qx) & 1) && s.curly ? -0.6 : 0);
    return qy < bot && dx < w;
  }
  function lockMask(t, s, qx, qy) {
    if (!s.locks || qy < t.hairCut) return false;
    var dx = qx - t.hx, ad = Math.abs(dx), sd = dx < 0 ? -1 : 1, top = t.hy - t.hry * 0.5;
    if (qy < top || qy > s.lockLen) return false;
    var hw = headW(t, Math.min(qy, t.hy + t.hry * 0.3)), d = t.dir, faceSide = d && sd === d, backSide = d && sd === -d;
    var cov = s.lockIn + (sd === (s.part > 0 ? 1 : -1) ? 0.5 : 0), out = s.lockOut, fl = s.flare;
    if (faceSide) { cov *= 0.5; out *= 0.6; fl *= 0.7; }
    if (backSide) { cov += 1.2; out = out * 1.2 + 0.6; fl *= 1.2; }
    var inner = hw - cov * clamp((qy - top) / 4, 0, 1), outer = hw + out + (qy > t.hy ? (qy - t.hy) * fl : 0);
    if (s.wave) { var w = Math.sin(qy * 0.6 + sd) * s.wave; inner += w; outer += w; }
    if (s.curly) outer += Math.sin(qy * 1.2 + sd * 2) * 0.8;
    return ad > inner && ad < outer;
  }
  function hairShade(t, s, layer) {
    var r = t.hR;
    return function (qx, qy, x, y) {
      var dx = qx - t.hx, v = layer ? 1 : 2;
      if (!layer && dx > t.hrx * 0.4 + (qy - t.hy) * 0.15) v = 1;
      // a fringe lying over the face keeps the base colour, so it reads against the forehead
      if (!layer && v === 1 && qy > t.hy - t.hry * 0.6 && Math.abs(dx) < headW(t, qy) - 2) v = 2;
      var sx = qx - (t.hx - 3 + t.dir * 2), sy = qy - (t.hy + 1), d = Math.sqrt(sx * sx + sy * sy), R0 = t.hry + s.capH * 0.55 - 2.2;
      if (!layer && !s.curly && Math.abs(d - R0) < 0.85 && dx < 1 && dx > -t.hrx + 1 && qy < t.hy - 3) v = 3;
      if (s.curly) {
        var cx3 = x % 3, cy3 = (y + (Math.floor(x / 3) & 1)) % 3;
        if (cx3 === 0 && cy3 === 0) v = Math.min(3, v + 1); else if (cx3 === 2 && cy3 === 2) v = Math.max(0, v - 1);
      } else if (qy > t.hy - 2 && (s.locks || s.back)) {
        var w = Math.round(Math.sin(qy * 0.5) * s.wave * 1.5);
        if (((x + w + 40) % 4) === 0) v = Math.max(0, v - 1);
      }
      if (s.slick && !layer && qy < t.hy - 2 && ((x - y + 40) % 4 === 0)) v = Math.max(0, v - 1);
      if (s.buzz) v = Math.min(v, 1);
      return r[v];
    };
  }
  function drawBackHair(t) {
    var s = t.h48; if (!s.back) return;
    begin(GR.hair, HAIR);
    area(0, 0, 47, 47, function (qx, qy) { return backMask(t, s, qx, qy); }, hairShade(t, s, 1));
  }
  function bez(p0, p1, p2, k) { var a = 1 - k; return [a * a * p0[0] + 2 * a * k * p1[0] + k * k * p2[0], a * a * p0[1] + 2 * a * k * p1[1] + k * k * p2[1]]; }
  function tube(t, p0, p1, p2, wfn, tieAt, tieC, braid) {
    var n = 30, pts = [], bb = [1e9, 1e9, -1e9, -1e9];
    for (var i = 0; i <= n; i++) { var p = bez(p0, p1, p2, i / n); pts.push(p); bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); }
    var info = function (qx, qy) {
      var best = 1e9, bs = 0, side = 1;
      for (var i = 0; i < n; i++) {
        var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-6;
        var u = clamp(((qx - a[0]) * dx + (qy - a[1]) * dy) / L2, 0, 1), ex = a[0] + dx * u - qx, ey = a[1] + dy * u - qy, d = ex * ex + ey * ey;
        if (d < best) { best = d; bs = (i + u) / n; side = (dx * (qy - a[1]) - dy * (qx - a[0])) > 0 ? 1 : -1; }
      }
      return [Math.sqrt(best), bs, side];
    };
    var r = t.hR, tr = tieC ? rp(tieC) : null;
    area(bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4, function (qx, qy) { if (qy < t.hairCut) return false; var q = info(qx, qy); return q[0] < wfn(q[1]); }, function (qx, qy, x, y) {
      var q = info(qx, qy), d = q[0] / wfn(q[1]) * q[2];
      if (tr && Math.abs(q[1] - tieAt) < 0.06) return tr[2];
      var v = d < -0.2 ? 3 : d > 0.45 ? 1 : 2;
      if (braid && Math.floor(q[1] * 9 + (d > 0 ? 0.5 : 0)) % 2) v = Math.max(1, v - 1);
      return r[v];
    });
  }
  function bunBall(t, bx, by, br) {
    var r = t.hR;
    area(bx - br - 1, by - br - 1, bx + br + 1, by + br + 1, function (qx, qy) { return qy >= t.hairCut && (qx - bx) * (qx - bx) + (qy - by) * (qy - by) < br * br; }, function (qx, qy) {
      var l = (qx - bx) + (qy - by); return l < -br * 0.6 ? r[3] : l > br * 0.5 ? r[1] : r[2];
    });
  }
  function drawBackPieces(t) {
    var s = t.h48, hx = t.hx - t.dir * 1.5, hy = t.hy, rx = t.hrx, ry = t.hry, rw = rx + s.capW, top = hy - 0.5 - ry - s.capH;
    var hatted = t.hairCut > 0;
    var tieC = pick(mulberry(t.sd + 401), [[236, 60, 100], [60, 130, 230], [250, 200, 40], [90, 190, 90], [170, 80, 200]]);
    begin(GR.pony, HAIR);
    if (s.pony) {
      var o = t.dir ? -t.dir : s.pony; // a turned head shows its ponytail behind it
      if (s.ponyHigh && !hatted) tube(t, [hx + o * 2, top + 2], [hx + o * (rx + 6), top - 4.5], [hx + o * (rx + 6), hy + 2],
        function (k) { return 2.3 + Math.sin(Math.min(1, k * 1.4) * Math.PI) * 1.3 - k * 0.5; }, 0.12, tieC);
      else {
        var y0 = Math.max(hy - ry * 0.5, t.hairCut + 1);
        tube(t, [hx + o * (rw - 2), y0], [hx + o * (rw + 8.5), y0 - 1], [hx + o * (rw + 6), 42],
          function (k) { return 1.7 + Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.9 - k * 0.6; }, 0.12, tieC);
      }
    }
    if (s.pig) [-1, 1].forEach(function (o) {
      tube(t, [hx + o * (rw - 1), hy - 2], [hx + o * (rw + 4.5), hy - 2.5], [hx + o * (rw + 6.5), hy + 5],
        function (k) { return k > 0.86 ? 1.6 + (k - 0.86) * 5 : 1.6 - k * 0.3; }, 0.78, tieC, true);
    });
    if (s.bun && !hatted) bunBall(t, hx + 0.5, top + 0.8, 3.4 + (t.sd & 1) * 0.6);
    if (s.buns2 && !hatted) [-1, 1].forEach(function (o) { bunBall(t, hx + o * (rx * 0.68), top + 2.6, 3.3); });
  }
  function drawFrontHair(t) {
    var s = t.h48;
    begin(GR.hair, HAIR);
    area(0, 0, 47, 47, function (qx, qy) { return capMask(t, s, qx, qy) || lockMask(t, s, qx, qy); }, hairShade(t, s, 0));
    if (t.cowlick && t.hairCut < 0 && !s.buzz && !s.curly) {
      var x = Math.round(t.fcx + 1 + (t.sd & 1)), y = 0;
      while (y < S - 1 && MAT[y * S + x] !== HAIR) y++;
      if (y > 2 && y < 20) { px(x, y - 1, t.hR[2]); px(x, y - 2, t.hR[2]); px(x + ((t.sd & 2) ? 1 : -1), y - 3, t.hR[2]); }
    }
  }

  /* ---------- body & clothes ---------- */
  /* the neck is a plain column: no flare at the bottom, it tucks into the collar */
  function neckW(t) { return t.nw48 - 0.7; }
  function drawNeck(t) {
    var nw = t.nw48, top = t.hy + t.hry * 0.3;
    begin(GR.neck, SKIN);
    area(t.hx - 16, top, t.hx + 16, 47, function (qx, qy) { return Math.abs(qx - t.hx) < neckW(t); }, function (qx, qy) {
      if (qy < t.hy + t.hry + 1.6 || qx - t.hx > nw * 0.3) return t.sk[1];
      return t.sk[2];
    });
  }
  function paintBody(t, c, hole, grp) {
    var r = rp(c), cx = t.hx;
    begin(grp || GR.cloth, CLOTH);
    if (hole) area(0, 33, 47, 47, function (qx, qy) {
      return hole(qx, qy) && Math.abs(qx - cx) >= neckW(t) && qy >= shoulderTop(t, qx) - 3.5 && qy < 41.5 && Math.abs(qx - cx) < t.nw48 + 3;
    }, function () { return r[0]; });
    area(0, 34, 47, 47, function (qx, qy) { return qy >= shoulderTop(t, qx) && !(hole && hole(qx, qy)); }, function (qx, qy) {
      var dx = qx - cx, top = shoulderTop(t, qx);
      if (qy - top < 1 && dx < 3 && dx > -21) return r[3];
      if (qy > 41.5 && Math.abs(Math.abs(dx) - 14.5 - (qy - 41) * 0.3) < 0.5) return r[1];
      if (dx > 15 + (qy - 40) * 0.3) return r[1];
      return r[2];
    });
    return r;
  }
  function crewOpen(t, qx, qy, extra) {
    var dx = Math.abs(qx - t.hx), w = neckW(t) + 0.6 + (extra || 0) * 0.6;
    return dx < w && qy < 39.2 + 1.6 * (1 - (dx / w) * (dx / w));
  }
  function vOpen(t, qx, qy, top, slope, bot) { var dx = Math.abs(qx - t.hx); return crewOpen(t, qx, qy) || (qy < bot && dx < (qy - top) * slope); }
  function shirtFill(t, c, test, grp) {
    var r = rp(c);
    begin(grp || GR.inner, CLOTH);
    area(0, 33, 47, 47, test, function (qx) { return qx - t.hx > 1.5 ? r[1] : r[2]; });
  }
  function collarPoints(t, c, spread) {
    var r = rp(c), cx = t.hx, nw = t.nw48;
    [-1, 1].forEach(function (s) {
      begin(GR.trim, CLOTH);
      poly([[cx + s * (nw - 0.8), 36.6], [cx + s * (nw + 2.4 + spread), 38.4], [cx + s * (1.8 + spread * 0.4), 42.2], [cx + s * 0.1, 39.4]], function () { return s < 0 ? r[3] : r[2]; });
    });
  }
  function tie(t, c, bow) {
    var r = rp(c), cx = t.hx;
    begin(GR.trim, MISC);
    if (bow) {
      area(cx - 5, 36, cx + 5, 42, function (qx, qy) { var dx = Math.abs(qx - cx); return dx < 3.6 && Math.abs(qy - 39.2) < 0.7 + dx * 0.45; }, function (qx) { return Math.abs(qx - cx) < 1 ? r[1] : qx < cx ? r[3] : r[2]; });
      return;
    }
    area(cx - 3, 38, cx + 3, 47, function (qx, qy) { var dx = Math.abs(qx - cx); return qy < 40 ? dx < 1.2 : dx < 1.1 + (qy - 40) * 0.12; }, function (qx, qy, x, y) {
      return qy < 40 ? r[3] : (y % 3 === 0 ? r[3] : r[2]);
    });
  }
  function dots(t, xs, ys, c) { xs.forEach(function (x) { ys.forEach(function (y) { tint(x, y, c); }); }); }
  function bandCollar(t, c, trim) {
    var r = rp(c), cx = t.hx, top = t.feature === 'Tattoo' ? 37 : 35.6;
    begin(GR.collar, CLOTH);
    area(cx - 10, top, cx + 10, 40, function (qx, qy) { return Math.abs(qx - cx) < t.nw48 + 1.6 && qy < 39.4; }, function (qx, qy) {
      if (trim && qy > 38.4) return GOLD4[2];
      return qx > cx + 1 ? r[1] : r[2];
    });
  }
  function lapels(t, c, top, slope, bot) {
    var r = rp(c), cx = t.hx, nw = t.nw48;
    [-1, 1].forEach(function (s) {
      begin(GR.lapel, CLOTH);
      area(0, top, 47, bot, function (qx, qy) {
        var d = (qx - cx) * s; if (d < 0) return false;
        var inner = Math.max(0, (qy - top) * slope), w = 2.4 + Math.min(qy - top, 4) * 0.3;
        if (qy > top + 3.6 && qy < top + 4.6) w -= 1.2;
        if (qy < 39 && d > nw - 0.6 && d < nw + 2.2) return true;
        return qy > top + 0.6 && d >= inner && d < inner + w && qy < bot;
      }, function () { return s < 0 ? r[3] : r[2]; });
    });
  }
  var CASUAL48 = [[64, 120, 220], [220, 64, 70], [60, 170, 120], [246, 184, 60], [150, 90, 210], [84, 92, 120], [244, 130, 70], [100, 160, 230], [190, 110, 70], [40, 160, 170], [230, 96, 150]];
  function bright(c) { for (var i = 0; i < CASUAL.length; i++) if (CASUAL[i] === c) return CASUAL48[i]; return c; }
  function drawClothes(t) {
    var cx = t.hx, nw = t.nw48, kind;
    var fam = { bank: 'suit', hotel: 'bellhop', sports: 'track', palace: 'guard', museum: 'cardigan', airport: 'pilot', library: 'cardigan', market: 'apron', station: 'conductor', harbor: 'sailor' };
    kind = t.outfit || fam[t.job] || t.casual;
    var c1 = bright(t.c1), c2 = bright(t.c2), c3 = bright(t.c3);
    switch (kind) {
      case 'suit': case 'pilot': case 'conductor': {
        var jc = kind === 'pilot' ? [40, 56, 110] : kind === 'conductor' ? pick(mulberry(t.sd + 5), [[40, 110, 80], [50, 70, 150], [170, 50, 60]]) : pick(mulberry(t.sd + 3), [[60, 80, 140], [90, 96, 110], [130, 90, 64], [50, 64, 100]]);
        var shc = kind === 'pilot' || t.r3 < 0.6 ? WHITE : [200, 222, 248];
        paintBody(t, jc, function (qx, qy) { return vOpen(t, qx, qy, 36.5, 0.42, 48); });
        shirtFill(t, shc, function (qx, qy) { return qy >= shoulderTop(t, qx) - 3 && vOpen(t, qx, qy, 36.5, 0.42, 48) && !crewOpen(t, qx, qy, -1.4) && qy > 35; });
        collarPoints(t, shc, 0);
        tie(t, kind === 'pilot' ? [40, 40, 54] : kind === 'conductor' ? [200, 40, 50] : c3, false);
        lapels(t, jc, 36.5, 0.42, 48);
        if (kind === 'pilot') {
          [-1, 1].forEach(function (s) { for (var k = 0; k < 2; k++) { var x = Math.round(cx + s * (16 + k * 3) - 0.5); tint(x, Math.floor(shoulderTop(t, x + 0.5)) + 1, GOLD4[2]); tint(x + s, Math.floor(shoulderTop(t, x + 0.5)) + 1, GOLD4[2]); } });
          sprite(['G.G', '.W.'], cx + 9, 42, { G: GOLD4[2], W: GOLD4[3] }, true);
        }
        if (kind === 'conductor') { dots(t, [cx - 9, cx + 8], [42, 45], GOLD4[2]); sprite(['GG', 'GG'], cx + 10, 41, { G: GOLD4[2] }, true); }
        break;
      }
      case 'bellhop': case 'guard': {
        var red = [214, 44, 52];
        paintBody(t, red);
        bandCollar(t, kind === 'guard' ? [40, 50, 120] : red, true);
        if (kind === 'guard') { for (var yy = 40; yy < 48; yy++) tint(cx - 1, yy, WHITE); dots(t, [cx], [41, 44, 47], GOLD4[2]); }
        else { dots(t, [cx - 4, cx + 3], [41, 44, 47], GOLD4[2]); }
        break;
      }
      case 'track': {
        var tc = pick(mulberry(t.sd + 9), [[50, 110, 220], [220, 60, 60], [40, 170, 110], [100, 80, 200], [250, 150, 40]]);
        paintBody(t, tc);
        bandCollar(t, tc, false);
        area(0, 38, 47, 47, function (qx, qy) { var d = Math.abs(qx - cx) - (13 + (qy - 39) * 0.5); return qy >= shoulderTop(t, qx) + 0.5 && ((d > 0 && d < 1) || (d > 2 && d < 3)); }, function (qx, qy, x, y) { tint(x, y, WHITE); return null; });
        for (var zy = 40; zy < 48; zy++) tint(cx - 1, zy, [200, 204, 214]);
        sprite(['SSS', 'SSW'], cx + 2, 43, { S: [200, 206, 216], W: [255, 255, 255] }, true);
        for (var k2 = 0; k2 < 4; k2++) { tint(cx - 3 + Math.round(k2 * 0.8), 39 + k2, [40, 40, 50]); tint(cx + 3 - Math.round(k2 * 0.3), 39 + k2, [40, 40, 50]); }
        break;
      }
      case 'cardigan': case 'cardi': {
        var cc = pick(mulberry(t.sd + 13), [[160, 150, 70], [190, 70, 80], [230, 170, 70], [60, 150, 150], [130, 110, 180], [180, 130, 90]]);
        var sh = t.r3 < 0.5 ? WHITE : [204, 222, 244];
        paintBody(t, cc, function (qx, qy) { return vOpen(t, qx, qy, 36.5, 0.55, 48); });
        shirtFill(t, sh, function (qx, qy) { return vOpen(t, qx, qy, 36.5, 0.55, 48) && !crewOpen(t, qx, qy, -1.5) && qy > 35 && qy >= shoulderTop(t, qx) - 3; });
        collarPoints(t, sh, 0.5);
        if (t.job === 'museum') tie(t, c3, true); else if (t.r2 < 0.5 && !t.fem) tie(t, c3, false);
        [-1, 1].forEach(function (s) { for (var by = 42; by < 48; by += 3) tint(Math.round(cx + s * ((by - 36.5) * 0.55 + 1.2) - 0.5), by, [250, 240, 210]); });
        break;
      }
      case 'apron': {
        var shc2 = t.r2 < 0.5 ? [220, 80, 70] : [80, 140, 210];
        paintBody(t, shc2, function (qx, qy) { return crewOpen(t, qx, qy, 0.4); });
        var ac = pick(mulberry(t.sd + 17), [[90, 170, 90], [240, 230, 200], [170, 110, 70], [70, 110, 170]]), ar = rp(ac);
        begin(GR.trim, CLOTH);
        area(cx - 8, 41, cx + 8, 47, function (qx) { return Math.abs(qx - cx) < 6.6; }, function (qx, qy) { return qy < 42 ? ar[3] : qx > cx + 2 ? ar[1] : ar[2]; });
        [-1, 1].forEach(function (s) { for (var y = 39; y < 42; y++) tint(Math.round(cx + s * (6 + (41 - y) * 0.7) - (s > 0 ? 1 : 0)), y, ar[2]); });
        tint(cx - 3, 44, ar[1]); tint(cx + 2, 44, ar[1]);
        break;
      }
      case 'sailor': {
        var nv = [40, 60, 140];
        paintBody(t, WHITE, function (qx, qy) { return crewOpen(t, qx, qy, 1.6); });
        area(0, 36, 47, 47, function (qx, qy, x, y) { return MAT[y * S + x] === CLOTH && GRP[y * S + x] === GR.cloth && y % 3 === 0; }, function (qx, qy, x, y) { tint(x, y, qx - cx > 15 ? dk(nv, 0.8) : nv); return null; });
        if (t.r2 < 0.55) { begin(GR.trim, MISC); poly([[cx - 4, 39], [cx + 4, 39], [cx + 0.5, 44.5], [cx - 0.5, 44.5]], function (qx) { return qx > cx + 1 ? [180, 30, 40] : [226, 50, 56]; }); }
        break;
      }
      case 'leather': {
        var lc = t.r2 < 0.5 ? [52, 52, 70] : [140, 78, 44];
        paintBody(t, lc, function (qx, qy) { return vOpen(t, qx, qy, 35, 0.6, 48); });
        var inner = pick(mulberry(t.sd + 19), [[226, 50, 60], [240, 240, 232], [60, 60, 70], [240, 196, 60]]);
        shirtFill(t, inner, function (qx, qy) { return vOpen(t, qx, qy, 35, 0.6, 48) && !crewOpen(t, qx, qy, 0) && qy >= shoulderTop(t, qx) - 2; });
        lapels(t, lc, 35, 0.6, 48);
        tint(cx - 8, 44, [210, 210, 224]); tint(cx + 7, 45, [210, 210, 224]);
        break;
      }
      case 'velvet': {
        var vc = pick(mulberry(t.sd + 23), [[140, 50, 180], [30, 140, 110], [200, 40, 70], [50, 70, 180]]);
        paintBody(t, vc, function (qx, qy) { return vOpen(t, qx, qy, 36.5, 0.45, 48); });
        var silk = pick(mulberry(t.sd + 29), [[246, 230, 190], [60, 60, 70], [240, 200, 80]]);
        shirtFill(t, silk, function (qx, qy) { return vOpen(t, qx, qy, 36.5, 0.45, 48) && !crewOpen(t, qx, qy, -1); });
        lapels(t, dk(vc, 0.8), 36.5, 0.45, 48);
        sprite(['P.P', 'PPP'], cx - 11, 42, { P: lt(c3, 0.35) }, true);
        break;
      }
      case 'turtle': {
        var tcol = t.r2 < 0.5 ? [56, 56, 72] : pick(mulberry(t.sd + 31), [[180, 50, 64], [230, 220, 200], [60, 90, 150]]);
        var tr = paintBody(t, tcol);
        begin(GR.collar, CLOTH);
        area(cx - 9, 30, cx + 9, 40, function (qx, qy) { return Math.abs(qx - cx) < t.nw48 + 1.3 && qy > t.hy + t.hry - 1.6 && qy < 39.5; }, function (qx, qy, x) {
          return x % 2 ? tr[1] : (qx > cx + 1 ? tr[1] : tr[2]);
        });
        break;
      }
      case 'blouse': {
        var bc = lt(c1, 0.3);
        paintBody(t, bc, function (qx, qy) { return vOpen(t, qx, qy, 37, 0.35, 43); });
        collarPoints(t, lt(bc, 0.25), 1);
        dots(t, [cx - 1], [44, 47], [255, 255, 255]);
        break;
      }
      case 'shirt': {
        var sr0 = paintBody(t, c1, function (qx, qy) { return vOpen(t, qx, qy, 37, 0.35, 42); });
        if (t.r3 < 0.5) area(0, 38, 47, 47, function (qx, qy, x, y) { return MAT[y * S + x] === CLOTH && GRP[y * S + x] === GR.cloth && ((x + 1) % 4 === 0 || y % 4 === 0); }, function (qx, qy, x, y) { tint(x, y, mix(getc(x, y), lt(c2, 0.4), 0.6)); return null; });
        collarPoints(t, c1, 0.8);
        dots(t, [cx - 1], [43, 46], lt(sr0[2], 0.6));
        break;
      }
      case 'jacket': {
        paintBody(t, dk(c1, 0.85), function (qx, qy) { return vOpen(t, qx, qy, 36.5, 0.5, 48); });
        shirtFill(t, c2, function (qx, qy) { return vOpen(t, qx, qy, 36.5, 0.5, 48) && !crewOpen(t, qx, qy, 0) && qy >= shoulderTop(t, qx) - 2; });
        lapels(t, dk(c1, 0.85), 36.5, 0.5, 48);
        break;
      }
      case 'hoodie': {
        var hr2 = paintBody(t, c1, function (qx, qy) { return crewOpen(t, qx, qy, 0.4); });
        begin(GR.collar, CLOTH);
        area(cx - 12, 34, cx + 12, 42, function (qx, qy) { var dx = Math.abs(qx - cx); return dx > t.nw48 + 0.6 && dx < t.nw48 + 4.4 && qy > 36.4 - (dx - t.nw48) * 0.2 && qy < 40.6 + (dx - t.nw48) * 0.15; }, function (qx) { return qx > cx ? hr2[1] : hr2[2]; });
        for (var dy = 41; dy < 46; dy++) { tint(cx - 2, dy, WHITE); if (dy < 45) tint(cx + 1, dy, WHITE); }
        break;
      }
      case 'vneck': {
        var vr = paintBody(t, c1, function (qx, qy) { return vOpen(t, qx, qy, 37, 0.45, 43); });
        area(0, 36, 47, 46, function (qx, qy, x, y) { return MAT[y * S + x] === CLOTH && GRP[y * S + x] === GR.cloth && vOpen(t, qx, qy, 35.6, 0.45, 44.6); }, function (qx, qy, x, y) { tint(x, y, vr[3]); return null; });
        break;
      }
      case 'tee': {
        var tr2 = paintBody(t, c1, function (qx, qy) { return crewOpen(t, qx, qy, 0.4); });
        area(0, 36, 47, 44, function (qx, qy, x, y) { return MAT[y * S + x] === CLOTH && GRP[y * S + x] === GR.cloth && crewOpen(t, qx, qy, 1.6); }, function (qx, qy, x, y) { tint(x, y, tr2[1]); return null; });
        break;
      }
      case 'redcoat': {
        // his red trench coat, worn over a white shirt and stock
        drawTrench(t, WHITE);
        // a high white stock: the neck tucks straight into it
        begin(GR.collar, CLOTH);
        area(cx - 8, 34, cx + 8, 40, function (qx, qy) { return Math.abs(qx - cx) < neckW(t) + 0.9 && qy > 35.2 && qy < 39; }, function (qx) { return qx > cx + 1.5 ? [214, 214, 226] : WHITE; });
        begin(GR.trim, CLOTH);
        area(cx - 4, 37, cx + 4, 44, function (qx, qy) { return Math.abs(qx - cx) < 2.4 - Math.abs(qy - 40) * 0.25 && qy > 37.6; }, function (qx, qy, x, y) { return (y % 2) ? [214, 214, 226] : WHITE; });
        break;
      }
      default: { // sweater
        var sw = paintBody(t, c1, function (qx, qy) { return crewOpen(t, qx, qy, 0); });
        area(0, 36, 47, 44, function (qx, qy, x, y) { return MAT[y * S + x] === CLOTH && GRP[y * S + x] === GR.cloth && crewOpen(t, qx, qy, 1.4); }, function (qx, qy, x, y) { tint(x, y, sw[1]); return null; });
        if (t.r4 < 0.4) area(0, 43, 47, 45, function (qx, qy, x, y) { return MAT[y * S + x] === CLOTH && GRP[y * S + x] === GR.cloth && (y === 44); }, function (qx, qy, x, y) { tint(x, y, (x % 3) ? lt(c2, 0.2) : sw[3]); return null; });
      }
    }
  }
  // Cameron's trench coat is red (a nod to his grandma from San Diego); everyone else's is tan.
  function drawTrench(t, shirt) {
    var cx = t.hx, nw = t.nw48, tan = t.id === 'cameron' ? [204, 36, 50] : [214, 176, 112], r = rp(tan);
    paintBody(t, tan, function (qx, qy) { return vOpen(t, qx, qy, 36.5, 0.5, 48); });
    shirtFill(t, shirt || [70, 60, 56], function (qx, qy) { return vOpen(t, qx, qy, 36.5, 0.5, 48) && !crewOpen(t, qx, qy, -1) && qy > 35; });
    [-1, 1].forEach(function (s) {
      begin(GR.lapel, CLOTH);
      poly([[cx + s * (nw - 0.6), 32.6], [cx + s * (nw + 4.2), 35], [cx + s * (nw + 6.2), 40], [cx + s * (nw + 3), 41], [cx + s * (nw + 4.6), 44], [cx + s * 5.6, 48], [cx + s * 3.4, 48], [cx + s * (nw - 0.2), 38]],
        function () { return s < 0 ? r[3] : r[2]; });
    });
    dots(t, [cx - 7, cx + 6], [45], [90, 60, 36]);
  }

  /* ---------- head ---------- */
  function earAt(t, ex, grp) {
    var ey = t.ey + 2.3, a = 1.9 * t.earS48, b = 2.7;
    begin(grp, SKIN);
    area(ex - 3, ey - 4, ex + 3, ey + 4, function (qx, qy) { var u = (qx - ex) / a, v = (qy - ey) / b; return u * u + v * v < 1; }, function (qx, qy) {
      return (Math.abs(qx - ex) < 0.8 && Math.abs(qy - ey) < 1.1) ? t.sk[1] : t.sk[2];
    });
    t.earPts.push([Math.floor(ex), Math.floor(ey + b - 0.4)]);
  }
  function drawHead(t, f) {
    var sk = t.sk, snoot = t.poseName === 'snooty';
    begin(GR.head, SKIN);
    area(t.hx - 16, t.hy - t.hry - 1, t.hx + 16, t.hy + t.hry + 1, function (qx, qy) { return inHead(t, qx, qy); }, function (qx, qy) {
      var hw = headW(t, qy), rel = (qx - t.hx) / hw;
      if (snoot && qy > t.hy + t.hry * 0.74) return sk[1];
      if (rel > 0.64 - (qy - t.hy) / t.hry * 0.12) return sk[1];
      var lx = qx - (t.hx - hw * 0.5), ly = qy - (t.hy - t.hry * 0.5);
      if (lx * lx + ly * ly < 4) return sk[3];
      return sk[2];
    });
    // cheeks, freckles, scar, age lines
    var blushC = mix(sk[2], [255, 104, 124], t.blush > 1 ? 0.42 : 0.3);
    if (t.blush) t.eyes48.forEach(function (e) {
      var bx = e.side < 0 ? e.x0 : e.x1 - 1, w = e.x1 - e.x0 + 1 >= 4 ? 2 : 1;
      for (var k = 0; k < w; k++) tint(bx + k, t.ey + 3, blushC);
    });
    if (t.freckles && !t.suspect) t.eyes48.forEach(function (e) { tint(e.side < 0 ? e.x0 + 2 : e.x1 - 2, t.ey + 4, mix(sk[2], [150, 80, 50], 0.3)); });
    if (t.feature === 'Scar') {
      var e0 = t.eyes48[0], sx = e0.x0 + 1, sy = t.ey + 2;
      for (var k2 = 0; k2 < 4; k2++) tint(sx + Math.floor(k2 / 2), sy + k2, [232, 136, 150]);
      tint(sx - 1, sy + 1, [170, 70, 84]); tint(sx + 2, sy + 2, [170, 70, 84]);
    }
    if (t.old) t.eyes48.forEach(function (e) { tint(e.side < 0 ? e.x0 - 1 : e.x1 + 1, t.ey + 1, sk[1]); });
    if (f.hat) for (var y = t.fedBy + 1; y < t.fedBy + 3; y++) for (var x = 0; x < S; x++) if (MAT[y * S + x] === SKIN) tint(x, y, sk[1]);
    // skin colours under the eyes, for lids drawn by the blink frame
    t.skc = {};
    t.eyes48.forEach(function (e) { for (var y2 = t.ey - 2; y2 <= t.ey + 1; y2++) for (var x2 = e.x0 - 1; x2 <= e.x1 + 1; x2++) t.skc[y2 * S + x2] = getc(x2, y2); });
  }
  function drawBeard(t) {
    if (!t.beard) return;
    var cx = t.mcx, my = t.my, ny = t.ny, mw = t.mw2, kind = t.beard, r = t.old ? t.hR : t.hR;
    var must = function (qx, qy) { return qy > my - 2 && qy < my && Math.abs(qx - cx) < mw + 1; };
    if (kind === 'stubble') {
      area(t.hx - 14, ny, t.hx + 14, t.hy + t.hry, function (qx, qy, x, y) { return MAT[y * S + x] === SKIN && GRP[y * S + x] === GR.head && qy > t.hy + t.hry * 0.25 + (t.hrx - Math.abs(qx - t.hx)) * 0.4 && qy > ny + 1; }, function (qx, qy, x, y) {
        tint(x, y, mix(getc(x, y), r[0], 0.22)); return null;
      });
      return;
    }
    if (kind === 'mustache' || kind === 'goatee') {
      begin(GR.beard, HAIR, true);
      area(cx - 5, my - 2, cx + 5, my, must, function (qx, qy) { return qy > my - 1 ? r[1] : r[2]; });
      if (kind === 'goatee') {
        begin(GR.beard, HAIR);
        area(cx - 4, my + 1, cx + 4, t.hy + t.hry + 1, function (qx, qy) { return qy > my + 1 && Math.abs(qx - cx) < 2.4 - Math.max(0, qy - my - 3) * 0.4 && inHead(t, qx, qy - 0.6); }, function () { return r[2]; });
      }
      return;
    }
    begin(GR.beard, HAIR);
    area(t.hx - 15, t.ey, t.hx + 15, t.hy + t.hry + 2, function (qx, qy) {
      if (!inHead(t, qx, qy - 1.2) && !inHead(t, qx, qy)) return false;
      var dx = Math.abs(qx - t.hx);
      return must(qx, qy) || (qy > t.hy + t.hry * 0.15 + (t.hrx - dx) * 0.42 && qy > ny) || (qy > my + 1 && Math.abs(qx - cx) < mw + 1);
    }, function (qx, qy, x, y) { return (qx - t.hx) > t.hrx * 0.45 ? r[1] : ((x + y) % 4 === 0 ? r[3] : r[2]); });
  }

  /* ---------- face features (drawn as tints, so they never change outlines) ---------- */
  function drawEyes(t, f) {
    var ey = t.ey, sc = [252, 250, 244], P = t.pupil, I = t.iris;
    var mode = f.blink ? 'blink' : t.pose.eye;
    t.eyes48.forEach(function (e) {
      var x0 = e.x0, x1 = e.x1, w = x1 - x0 + 1, outer = e.side < 0 ? x0 - 1 : x1 + 1;
      var gx = t.gx, ix = w >= 4 ? x0 + 1 + gx : x0 + (gx > 0 ? 1 : gx < 0 ? 0 : (e.side < 0 ? 1 : 0)), x;
      ix = clamp(ix, x0, x1 - 1);
      var lid = function (y, c) { for (x = x0; x <= x1; x++) tint(x, y, c, 1); };
      var skin = function (y) { for (x = x0; x <= x1; x++) { var c = t.skc[y * S + x]; if (c) tint(x, y, c, 1); } };
      if (mode === 'blink') {
        skin(ey - 1); skin(ey + 1); lid(ey, OL);
        if (t.fem) tint(outer, ey - 1, OL, 1);
        return;
      }
      if (mode === 'open') {
        lid(ey - 1, OL); lid(ey, sc); lid(ey + 1, sc);
        tint(ix, ey, P, 1); tint(ix + 1, ey, P, 1); tint(ix, ey + 1, I, 1); tint(ix + 1, ey + 1, I, 1);
        tint(e.side < 0 ? x0 : x1, ey + 1, t.skc[(ey + 1) * S + (e.side < 0 ? x0 : x1)] || sc, 1);
      } else if (mode === 'half') {
        lid(ey - 1, mix(t.sk[1], t.sk[2], 0.3)); lid(ey, OL); lid(ey + 1, sc);
        tint(ix, ey + 1, P, 1); tint(ix + 1, ey + 1, P, 1);
      } else if (mode === 'down') {
        lid(ey, OL);
        for (x = x0 + 1; x < x1; x++) tint(x, ey + 1, mix(P, t.sk[1], 0.25), 1);
      } else if (mode === 'up') {
        lid(ey - 1, OL); lid(ey, sc); lid(ey + 1, sc);
        tint(ix, ey, P, 1); tint(ix + 1, ey, P, 1);
        tint(e.side < 0 ? x0 : x1, ey + 1, t.skc[(ey + 1) * S + (e.side < 0 ? x0 : x1)] || sc, 1);
      }
      if (t.fem) { tint(outer, ey - 1 + (mode === 'down' || mode === 'half' ? 1 : 0), OL, 1); tint(outer, ey - 2 + (mode === 'down' || mode === 'half' ? 1 : 0), OL, 1); }
    });
  }
  var BROW = { normal: [0, -1, -1, 0, 0], high: [-1, -2, -2, -1, -1], angry: [1, 0, 0, -1, -1], worried: [-1, -1, 0, 0, 0] };
  function drawBrows(t) {
    var by = t.ey - 3;
    t.eyes48.forEach(function (e, i) {
      var shape = BROW[t.brows[i]] || BROW.normal, len = e.x1 - e.x0 + 2;
      for (var k = 0; k < len; k++) {
        var u = Math.min(4, Math.round(k * 4 / (len - 1))), x = e.side < 0 ? e.x1 - k : e.x0 + k, y = by + shape[u];
        tint(x, y, t.browC, 1);
        if (t.browThick && k < len - 1) tint(x, y + 1, t.browC, 1);
      }
    });
  }
  function drawNose(t) {
    var sk = t.sk, cx = t.fcx, ny = t.ny, d = t.dir;
    if (d) {
      var tx = d < 0 ? cx - 2 : cx + 1;
      tint(tx - d, ny - 2, sk[1]); tint(tx - d, ny - 1, sk[1]); tint(tx, ny - 1, sk[3]);
      tint(tx - d, ny, sk[0]); tint(tx, ny, sk[1]);
      return;
    }
    if (t.pose.nostrils) {
      tint(cx - 1, ny - 2, sk[3]); tint(cx - 1, ny - 1, sk[3]); tint(cx, ny - 1, sk[2]);
      tint(cx - 2, ny, sk[0]); tint(cx - 1, ny, sk[1]); tint(cx, ny, sk[1]); tint(cx + 1, ny, sk[0]);
      return;
    }
    tint(cx - 1, ny - 1, sk[3]); tint(cx, ny - 1, sk[1]);
    tint(cx - 1, ny, sk[1]); tint(cx, ny, sk[0]);
  }
  function drawMouth(t, f) {
    var cx = t.mcx, my = t.my, mw = t.mw2, x0 = cx - mw, x1 = cx + mw - 1, x;
    var line = t.lipC ? dk(t.lipC, 0.55) : [96, 34, 44], lip = t.lipC, D = [80, 20, 34], tooth = [255, 252, 244];
    if (f.talk) {
      for (x = x0 + 1; x < x1; x++) { tint(x, my - 1, line, 1); tint(x, my, tooth, 1); tint(x, my + 1, D, 1); tint(x, my + 2, line, 1); }
      tint(x0, my, line, 1); tint(x1, my, line, 1); tint(x0, my + 1, line, 1); tint(x1, my + 1, line, 1);
      tint(cx - 1, my + 1, [226, 96, 110], 1); if (mw > 2) tint(cx, my + 1, [226, 96, 110], 1);
      return;
    }
    var mt = t.mouthT;
    if (mt === 'grin') {
      for (x = x0; x <= x1; x++) tint(x, my - 1, line, 1);
      tint(x0 - 1, my - 2, line, 1); tint(x1 + 1, my - 2, line, 1);
      tint(x0, my, line, 1); tint(x1, my, line, 1);
      for (x = x0 + 1; x < x1; x++) { tint(x, my, tooth, 1); tint(x, my + 1, line, 1); }
      return;
    }
    if (mt === 'o') {
      tint(cx - 1, my - 1, line, 1); tint(cx, my - 1, line, 1); tint(cx - 1, my + 1, line, 1); tint(cx, my + 1, line, 1);
      tint(cx - 2, my, line, 1); tint(cx + 1, my, line, 1); tint(cx - 1, my, D, 1); tint(cx, my, D, 1);
      return;
    }
    for (x = x0 + 1; x < x1; x++) tint(x, my, line, 1);
    if (mt === 'smile') { tint(x0, my - 1, line, 1); tint(x1, my - 1, line, 1); }
    else if (mt === 'smirk') { var up = t.dir > 0 ? x0 : x1; tint(up, my - 1, line, 1); tint(up === x0 ? x1 : x0, my, line, 1); }
    if (lip) for (x = x0 + 1; x < x1; x++) tint(x, my + 1, mix(lip, t.sk[2], 0.25), 1);
  }
  function drawGlasses(t) {
    if (!t.glasses) return;
    var c = mix(t.glassCol, [40, 20, 30], 0.2), ey = t.ey, round = t.glassStyle === 'round';
    t.eyes48.forEach(function (e) {
      var a = e.x0 - 1, b = e.x1 + 1;
      for (var x = a; x <= b; x++) { if (!(round && (x === a || x === b))) { tint(x, ey - 2, c); tint(x, ey + 2, c); } }
      for (var y = ey - 1; y <= ey + 1; y++) { tint(a, y, c); tint(b, y, c); }
      var arm = e.side < 0 ? a - 1 : b + 1;
      while (arm > 0 && arm < S - 1 && MAT[(ey - 1) * S + arm] === SKIN) { tint(arm, ey - 1, c); arm += e.side; }
    });
    var l = t.eyes48[0].x1 + 2, r = t.eyes48[1].x0 - 2;
    for (var bx = l; bx <= r; bx++) tint(bx, ey - 1, c);
  }

  /* ---------- hats ---------- */
  function fedoraAt(cx, by, rx, ch, ba, bb) {
    var r = rp([150, 104, 64]), ct = by - ch;
    var crown = function (qx, qy) {
      if (qy > by + 0.5 || qy < ct) return false;
      var k = (qy - ct) / (by - ct), hw = rx - 0.6 + k * 1.6, dx = Math.abs(qx - cx);
      if (qy < ct + 1.2 * Math.max(0, 1 - dx / (rx * 0.45)) + (dx > hw - 1.4 ? 0.8 : 0)) return false;
      return dx < hw;
    };
    begin(GR.hat, HAT);
    area(cx - rx - 3, ct, cx + rx + 3, by + 1, crown, function (qx, qy) {
      var dx = qx - cx;
      if (qy > by - 2.2) return [64, 40, 30];
      if (Math.abs(dx + 0.3) < 0.6 && qy < ct + (by - ct) * 0.5) return r[1];
      return dx > rx * 0.35 ? r[1] : dx < -rx * 0.5 ? r[3] : r[2];
    });
    begin(GR.brim, HAT);
    area(cx - ba - 1, by - bb - 1, cx + ba + 1, by + bb + 1, function (qx, qy) { var a = (qx - cx) / ba, b = (qy - by - 0.6) / bb; return a * a + b * b < 1 && !(qy < by && crown(qx, qy)); }, function (qx, qy) {
      return qy > by + 0.8 ? r[1] : (qx - cx) > ba * 0.4 ? r[1] : r[2];
    });
  }
  function drawJobHat(t) {
    var job = t.job, cx = t.hx, hy = t.hy, ry = t.hry, rx = t.hrx, bandY = t.bandY;
    if (job === 'hotel') {
      var r = rp([220, 44, 60]), hx = cx + 3, top = hy - ry - 3, bot = hy - ry + 2;
      begin(GR.hat, HAT);
      area(hx - 6, top - 2, hx + 6, bot + 2, function (qx, qy) { var tl = (qx - hx) * 0.15; return Math.abs(qx - hx) < 4.6 && qy > top + tl && qy < bot + tl; }, function (qx, qy) {
        var tl = (qx - hx) * 0.15; return qy > bot + tl - 1.2 ? GOLD4[2] : qx > hx + 1.5 ? r[1] : r[2];
      });
      return;
    }
    if (job === 'palace') {
      var low = bandY + 1;
      begin(GR.hat, HAT);
      area(cx - rx - 5, 0, cx + rx + 5, low + 3, function (qx, qy) {
        var dx = qx - cx, e = dx * dx / Math.pow(rx + 2.4, 2) + Math.pow((qy - (hy - ry - 2)) / (ry + 5), 2);
        e -= Math.sin(Math.atan2(qy - hy, dx) * 13) * 0.04;
        return e < 1 && qy < low + (Math.abs(dx) > rx - 1 ? 2 : 0);
      }, function (qx, qy, x, y) { var dx = qx - cx; return dx > rx * 0.3 ? [24, 22, 32] : ((x * 3 + y * 5) % 7 === 0 ? [74, 72, 96] : [44, 42, 58]); });
      return;
    }
    if (job === 'sports') {
      var cc = pick(mulberry(t.sd + 9), [[50, 110, 220], [220, 60, 60], [40, 170, 110], [100, 80, 200], [250, 150, 40]]), r2 = rp(cc);
      begin(GR.hat, HAT);
      area(cx - rx - 3, bandY - ry, cx + rx + 3, bandY + 2, function (qx, qy) { var a = (qx - cx) / (rx + 1.2), b = (qy - bandY - 0.5) / (ry * 0.62 + 1); return a * a + b * b < 1 && qy < bandY + 0.8; }, function (qx) {
        var dx = qx - cx; return Math.abs(dx + 0.3) < 0.6 ? r2[1] : dx > rx * 0.35 ? r2[1] : dx < -rx * 0.4 ? r2[3] : r2[2];
      });
      begin(GR.brim, HAT);
      area(cx - rx - 4, bandY - 1, cx + rx + 4, bandY + 4, function (qx, qy) { var a = (qx - cx + 1) / (rx + 2.4), b = (qy - bandY - 0.8) / 2.2; return a * a + b * b < 1 && qy > bandY + 0.3; }, function (qx) { return qx > cx + 3 ? r2[1] : r2[2]; });
      return;
    }
    if (job === 'airport' || job === 'station') {
      var col = job === 'airport' ? (t.capVariant < 0.4 ? [240, 240, 236] : [40, 56, 110]) : pick(mulberry(t.sd + 5), [[40, 110, 80], [50, 70, 150], [170, 50, 60]]);
      var r3 = rp(col), flat = job === 'station', topY = Math.round(Math.min(bandY - 5, hy - ry - 0.5));
      begin(GR.hat, HAT);
      area(cx - rx - 4, topY - 1, cx + rx + 4, bandY + 1, function (qx, qy) {
        var dx = Math.abs(qx - cx), hw = flat ? rx + 0.6 : rx + 2;
        if (qy < topY || qy > bandY + 0.5) return false;
        if (qy < topY + 2) { var a = dx / hw, b = (qy - topY - 2) / 2; return a * a + b * b < 1; }
        return dx < (qy < bandY - 2 ? hw : rx + 0.6);
      }, function (qx, qy) {
        var dx = qx - cx;
        if (qy > bandY - 2) return qy > bandY - 1.4 && qy < bandY - 0.4 ? GOLD4[2] : dk(job === 'airport' ? [40, 44, 70] : col, 0.8);
        return dx > rx * 0.4 ? r3[1] : r3[2];
      });
      begin(GR.brim, HAT);
      area(cx - rx, bandY, cx + rx, bandY + 3, function (qx, qy) { var a = (qx - cx) / (rx - 0.5), b = (qy - bandY - 0.4) / 1.8; return a * a + b * b < 1 && qy > bandY + 0.4; }, function () { return [36, 36, 44]; });
      sprite(job === 'airport' ? ['G.G.G', '.GWG.'] : ['GGG', 'GKG'], job === 'airport' ? cx - 3 : cx - 2, bandY - 5, { G: GOLD4[2], W: GOLD4[3], K: GOLD4[1] }, true);
      return;
    }
    if (job === 'harbor') {
      if (t.capVariant < 0.5) {
        var r4 = rp(WHITE);
        begin(GR.hat, HAT);
        area(cx - rx - 2, bandY - ry, cx + rx + 2, bandY + 1, function (qx, qy) { var a = (qx - cx) / (rx + 0.6), b = (qy - bandY) / (ry * 0.6 + 0.5); return a * a + b * b < 1 && qy < bandY + 0.5; }, function (qx) { return qx > cx + rx * 0.35 ? r4[1] : r4[2]; });
        begin(GR.brim, HAT);
        area(cx - rx - 3, bandY - 3, cx + rx + 3, bandY + 2, function (qx, qy) { var a = (qx - cx) / (rx + 1.8), b = (qy - bandY + 0.4) / 1.6; return a * a + b * b < 1; }, function (qx) { return qx > cx + 4 ? r4[1] : r4[3]; });
      } else {
        var r5 = rp([50, 70, 140]);
        begin(GR.hat, HAT);
        area(cx - rx - 2, bandY - ry, cx + rx + 2, bandY + 2, function (qx, qy) { var a = (qx - cx) / (rx + 1), b = (qy - bandY - 0.5) / (ry * 0.66); return a * a + b * b < 1 && qy < bandY + 1.2; }, function (qx, qy, x) {
          if (qy > bandY - 2) return x % 2 ? r5[1] : r5[2];
          return qx > cx + rx * 0.35 ? r5[1] : r5[2];
        });
      }
      return;
    }
    if (job === 'market' && t.scarfFem) {
      var sc = pick(mulberry(t.sd + 81), [[230, 70, 80], [60, 140, 210], [246, 190, 60], [160, 80, 170]]), r6 = rp(sc), hl = Math.round(hy - ry * 0.45);
      begin(GR.hat, HAT);
      area(cx - rx - 3, hy - ry - 3, cx + rx + 3, hy + 4, function (qx, qy) {
        var dx = qx - cx, a = dx / (rx + 1.6), b = (qy - hy + 0.5) / (ry + 1.6); if (a * a + b * b > 1) return false;
        if (Math.abs(dx) < headW(t, qy) - 0.6) return qy < hl + Math.pow(Math.abs(dx) / rx, 3) * 5;
        return qy < hy + 3;
      }, function (qx, qy, x, y) { return ((x + (y % 4 < 2 ? 2 : 0)) % 4 === 0 && y % 2 === 0) ? lt(sc, 0.7) : qx > cx + rx * 0.35 ? r6[1] : r6[2]; });
    }
  }

  /* ---------- features & props ---------- */
  function drawTattoo(t) {
    if (t.feature !== 'Tattoo') return;
    var x0 = t.hx + 1, y0 = Math.round(t.hy + t.hry) + 1, ink = t.sl < 0.42 ? [90, 200, 220] : [40, 70, 160], red = [220, 50, 70];
    sprite(['R.R', 'RRR', '.R.'], x0, y0, { R: red }, true);
    if (MAT[(y0 + 3) * S + x0 + 1] === SKIN) tint(x0 + 1, y0 + 3, ink);
  }
  function drawJewelry(t) {
    if (t.feature !== 'Jewelry') return;
    var cx = t.hx;
    if (t.id === 'cameron') {
      // a single red feather pinned to the lapel, with a gold pin
      sprite(['...OO', '..ORO', '.ORRO', 'ORRO.', 'GOO..'], cx - 14, 40, { O: OL, R: [255, 120, 110], G: GOLD4[3] }, true);
      return;
    }
    t.earPts.forEach(function (p) { if (MAT[p[1] * S + p[0]] !== SKIN) return; tint(p[0], p[1] + 1, GOLD4[2]); tint(p[0], p[1] + 2, GOLD4[3]); });
    for (var dx = -5; dx <= 4; dx++) {
      var y = Math.round(37.6 + 2.6 * (1 - Math.pow((dx + 0.5) / 5.5, 2)));
      if (MAT[y * S + cx + dx] !== BG) tint(cx + dx, y, GOLD4[(dx & 1) ? 2 : 3]);
    }
    sprite(['GG', 'RR'], cx - 1, 41, { G: GOLD4[2], R: [220, 40, 80] }, true);
  }
  function drawBook(t) {
    var cx = t.hx, k = t.bookKind, y0 = 39;
    var cover = k === 'book' ? t.bookC : k === 'map' ? [180, 140, 80] : [170, 170, 176];
    var page = k === 'map' ? [246, 226, 168] : k === 'paper' ? [236, 236, 230] : [252, 246, 228];
    begin(GR.book, MISC);
    area(cx - 11, y0, cx + 11, 47, function (qx) { return Math.abs(qx - cx) < 10.6; }, function (qx, qy) { return qy > 46 ? dk(cover, 0.8) : cover; });
    begin(GR.page, MISC);
    area(cx - 10, y0, cx + 10, 46, function (qx, qy) { return Math.abs(qx - cx) < 9.6 && qy < 46.2 - Math.abs(qx - cx) * 0.06 && qy > y0 + 0.2 + (Math.abs(qx - cx) < 1.2 ? 0.8 : 0); }, function (qx, qy, x, y) {
      var dx = qx - cx;
      if (Math.abs(dx) < 1) return dk(page, 0.82);
      if (k === 'book' && y % 2 === 0 && y > y0 + 1 && y < 46 && Math.abs(dx) > 2 && Math.abs(dx) < 8.5) return mix(page, [90, 80, 90], 0.45);
      if (k === 'paper' && y === y0 + 2 && Math.abs(dx) > 2 && Math.abs(dx) < 8) return [50, 50, 60];
      if (k === 'paper' && y > y0 + 3 && y % 2 === 1 && Math.abs(dx) > 2 && Math.abs(dx) < 8.5) return [150, 150, 158];
      if (k === 'map') {
        if (Math.abs((qy - y0) - (qx - cx + 8) * 0.35) < 0.5) return [220, 70, 60];
        if (Math.abs(qx - cx - 4 + (qy - y0) * 0.3) < 0.5) return [70, 130, 220];
        if (Math.abs(dx - 5) < 0.6 && Math.abs(qy - 43) < 1.6) return [80, 170, 90];
      }
      return dx > 0 ? dk(page, 0.94) : page;
    });
    if (k === 'map') sprite(['R.R', '.R.', 'R.R'], cx - 7, 42, { R: [220, 30, 40] }, true);
    [-1, 1].forEach(function (s) {
      begin(GR.hand, SKIN);
      var hx = cx + s * 10.2, hy = 44.5;
      area(hx - 3, hy - 3, hx + 3, hy + 4, function (qx, qy) { var a = (qx - hx) / 2.4, b = (qy - hy) / 2.8; return a * a + b * b < 1; }, function (qx) { return (qx - hx) * s > 0.5 ? t.sk[1] : t.sk[2]; });
    });
  }

  /* ---------- post: cast shadows under hair/hats, then the bold outline ---------- */
  function post(t) {
    for (var y = S - 1; y > 0; y--) for (var x = 0; x < S; x++) {
      var i = y * S + x; if (MAT[i] !== SKIN || FT[i] || GRP[i] === GR.hand) continue;
      var u = i - S;
      if ((MAT[u] === HAIR || MAT[u] === HAT) && OBJ[u] > OBJ[i]) { R[i] = t.sk[1][0]; G[i] = t.sk[1][1]; B[i] = t.sk[1][2]; }
    }
    var mark = new Uint8Array(SN);
    for (var j = 0; j < SN; j++) {
      if (OBJ[j] <= 0 || NOL[j]) continue;
      var xx = j % S, yy = (j / S) | 0, o = OBJ[j], g = GRP[j];
      if ((xx > 0 && GRP[j - 1] !== g && OBJ[j - 1] < o) || (xx < S - 1 && GRP[j + 1] !== g && OBJ[j + 1] < o) ||
          (yy > 0 && GRP[j - S] !== g && OBJ[j - S] < o) || (yy < S - 1 && GRP[j + S] !== g && OBJ[j + S] < o)) mark[j] = 1;
    }
    for (var k = 0; k < SN; k++) if (mark[k]) { R[k] = OL[0]; G[k] = OL[1]; B[k] = OL[2]; }
  }

  function render(p, f) {
    var t = getTraits(p);
    t.earPts = [];
    t.fedBy = Math.round(t.hy - t.hry * 0.3);
    t.bandY = Math.round(t.hy - t.hry * 0.42);
    var trench = f.hat || f.trench;
    var jobHat = !trench && (({ sports: 1, airport: 1, station: 1, harbor: 1, palace: 1, hotel: 0 }[t.job]) || (t.job === 'market' && t.scarfFem));
    t.hairCut = f.hat ? t.fedBy + 1 : jobHat ? t.bandY + 1 : -99;
    cur.obj = 0;
    OBJ.fill(0); GRP.fill(0); MAT.fill(0); NOL.fill(0); FT.fill(0);
    if (f.black) { R.fill(0); G.fill(0); B.fill(0); } else drawBG(t);
    drawBackHair(t);
    drawBackPieces(t);
    drawNeck(t);
    if (trench) drawTrench(t); else drawClothes(t);
    if (!t.dir) [-1, 1].forEach(function (s) { earAt(t, t.hx + s * (headW(t, t.ey + 2) + 0.5), GR.ear); });
    drawHead(t, f);
    if (t.dir) earAt(t, t.hx - t.dir * (headW(t, t.ey + 2) - 1.4), GR.ear2);
    drawTattoo(t);
    drawBeard(t);
    drawEyes(t, f);
    drawBrows(t);
    drawNose(t);
    drawMouth(t, f);
    drawFrontHair(t);
    drawGlasses(t);
    if (f.hat) fedoraAt(t.hx, t.fedBy, t.hrx + 0.4, 8, t.hrx + 5.6, 1.9); else if (!f.trench) drawJobHat(t);
    if (!trench) drawJewelry(t);
    if (t.pose.book && !trench) drawBook(t);
    post(t);
    return toBytes();
  }
  function toBytes() {
    var d = new Uint8ClampedArray(SN * 4);
    for (var i = 0; i < SN; i++) { d[i * 4] = Math.round(R[i]); d[i * 4 + 1] = Math.round(G[i]); d[i * 4 + 2] = Math.round(B[i]); d[i * 4 + 3] = 255; }
    return d;
  }
  function upscale(d48) {
    var out = new Uint8ClampedArray(W * H * 4);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var j = ((y >> 1) * S + (x >> 1)) * 4, i = (y * W + x) * 4;
      out[i] = d48[j]; out[i + 1] = d48[j + 1]; out[i + 2] = d48[j + 2]; out[i + 3] = 255;
    }
    return out;
  }

  var tcache = {}, tcount = 0, icache = {}, icount = 0;
  function pkey(p) { return [p.id, p.seed, p.sex, p.hair, p.skin, p.age, p.feature, p.hobby, p.job, p.style].join('|'); }
  function getTraits(p) {
    var k = pkey(p); if (tcache[k]) return tcache[k];
    if (++tcount > 300) { tcache = {}; tcount = 1; }
    var t = makeTraits(p); cartoonTraits(t, p);
    return (tcache[k] = t);
  }
  function cacheGet(k, make) {
    if (icache[k]) return icache[k];
    if (++icount > 400) { icache = {}; icount = 1; }
    return (icache[k] = make());
  }
  /* mode 0: normal portrait, 1: fedora + trench coat, 2: trench coat on black (mystery reveal) */
  function modeOpts(mode, blink, talk) { return { hat: mode === 1, trench: mode === 2, black: mode === 2, blink: blink, talk: talk }; }
  function baseData(person, mode) {
    return cacheGet(pkey(person) + '|00' + mode, function () { return render(person, modeOpts(mode, false, false)); });
  }
  /* [x0,y0,x1,y1] inclusive boxes in the 48px buffer */
  function boxes48(t) {
    var e = t.eyes48, ey = t.ey, my = t.my;
    return { eyeL: [e[0].x0 - 1, ey - 2, e[0].x1 + 1, ey + 1], eyeR: [e[1].x0 - 1, ey - 2, e[1].x1 + 1, ey + 1],
      mouth: [t.mcx - t.mw2 - 1, my - 2, t.mcx + t.mw2, my + 2] };
  }
  /* Animation frames: copy the base portrait and repaint only the eye / mouth boxes,
     so nothing else can ever change between frames. */
  function frameData(person, blink, talk, mode) {
    var base = baseData(person, mode);
    if (!blink && !talk) return base;
    return cacheGet(pkey(person) + '|' + (blink ? 1 : 0) + (talk ? 1 : 0) + mode, function () {
      var v = render(person, modeOpts(mode, blink, talk)), out = new Uint8ClampedArray(base), b = boxes48(getTraits(person));
      if (blink) { copyBox(out, v, b.eyeL); copyBox(out, v, b.eyeR); }
      if (talk) copyBox(out, v, b.mouth);
      return out;
    });
  }
  function copyBox(dst, src, b) {
    for (var y = Math.max(0, b[1]); y <= Math.min(S - 1, b[3]); y++) for (var x = Math.max(0, b[0]); x <= Math.min(S - 1, b[2]); x++) {
      var i = (y * S + x) * 4; dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2];
    }
  }

  /* ---------- mystery close-up: black, a dark collar and a big fedora that lifts off ---------- */
  function silhouetteData(person) {
    return cacheGet(pkey(person) + '|sil', function () {
      var lit = baseData(person, 2);
      render(person, modeOpts(2, false, false)); // refresh the material map for this person
      var mat = new Uint8Array(MAT), grp = new Uint8Array(GRP), out = new Uint8ClampedArray(SN * 4);
      for (var i = 0; i < SN; i++) {
        out[i * 4 + 3] = 255;
        var y = (i / S) | 0, x = i % S;
        if (mat[i] !== CLOTH || y < 30) continue;
        var rim = (y > 0 && mat[i - S] !== CLOTH) || (x > 0 && mat[i - 1] !== CLOTH) || (x < S - 1 && mat[i + 1] !== CLOTH) || grp[i] === GR.lapel;
        var k = rim ? 0.3 : 0.13;
        out[i * 4] = Math.round(lit[i * 4] * k + 2); out[i * 4 + 1] = Math.round(lit[i * 4 + 1] * k + 2); out[i * 4 + 2] = Math.round(lit[i * 4 + 2] * k + 5);
      }
      return out;
    });
  }
  function bigHatData() {
    return cacheGet('bighat', function () {
      cur.obj = 0; OBJ.fill(0); GRP.fill(0); MAT.fill(0); NOL.fill(0); FT.fill(0); R.fill(0); G.fill(0); B.fill(0);
      fedoraAt(24, 22, 10.5, 15, 18.5, 3.1);
      post({ sk: [[0, 0, 0], [0, 0, 0]] });
      var out = new Uint8ClampedArray(SN * 4);
      for (var i = 0; i < SN; i++) {
        if (MAT[i] !== HAT) continue;
        out[i * 4] = R[i]; out[i * 4 + 1] = G[i]; out[i * 4 + 2] = B[i]; out[i * 4 + 3] = 255;
      }
      return out;
    });
  }
  function mysteryData(person, f) {
    var L = clamp(Number(f.hatLift) || 0, 0, 1);
    var lit = frameData(person, !!f.blink, !!f.talk, 2), sil = silhouetteData(person), hat = bigHatData();
    var out = new Uint8ClampedArray(SN * 4);
    // the brim's shadow lifts with the hat: lit from the bottom up
    var Sy = 50 - 58 * Math.pow(L, 0.62), light = clamp(L / 0.18, 0, 1);
    var ang = -0.55 * Math.pow(L, 0.8), ca = Math.cos(ang), sa = Math.sin(ang);
    var hdx = 6 * L, hdy = -56 * Math.pow(L, 1.25), pvx = 24, pvy = 23, showHat = L < 1;
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var i = (y * S + x) * 4, src = sil, k = 1;
      if (showHat) {
        var X = x + 0.5 - pvx - hdx, Y = y + 0.5 - pvy - hdy;
        var lx = Math.floor(X * ca + Y * sa + pvx), ly = Math.floor(-X * sa + Y * ca + pvy);
        if (lx >= 0 && ly >= 0 && lx < S && ly < S && hat[(ly * S + lx) * 4 + 3]) {
          var j = (ly * S + lx) * 4; out[i] = hat[j]; out[i + 1] = hat[j + 1]; out[i + 2] = hat[j + 2]; out[i + 3] = 255; continue;
        }
      }
      var r = light * clamp((y + 0.5 - Sy) / 6, 0, 1);
      if (r > 0) { src = lit; k = r * r * (3 - 2 * r); }
      out[i] = src[i] * k; out[i + 1] = src[i + 1] * k; out[i + 2] = src[i + 2] * k; out[i + 3] = 255;
    }
    return out;
  }

  var off = null;
  window.drawFace = function (canvas, person, f) {
    if (!canvas || !canvas.getContext) return;
    person = person || {}; f = f || {};
    var data;
    try {
      data = upscale(f.mystery ? mysteryData(person, f) : frameData(person, !!f.blink, !!f.talk, f.hat ? 1 : 0));
    } catch (e) { if (window.console) console.warn('drawFace failed', e); return; }
    var ctx = canvas.getContext('2d'), img = new ImageData(data, W, H);
    if (canvas.width === W && canvas.height === H) { ctx.putImageData(img, 0, 0); return; }
    if (!off) { off = document.createElement('canvas'); off.width = W; off.height = H; }
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  };
  /* [x0,y0,x1,y1] inclusive boxes (96px canvas space) that animation frames may change */
  window.drawFace.boxes = function (person) {
    var b = boxes48(getTraits(person || {})), s = function (q) { return [q[0] * 2, q[1] * 2, q[2] * 2 + 1, q[3] * 2 + 1]; };
    return { eyeL: s(b.eyeL), eyeR: s(b.eyeR), mouth: s(b.mouth) };
  };
})();
