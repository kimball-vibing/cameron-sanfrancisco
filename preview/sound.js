/* Sound effects and music, synthesized with Web Audio (no sound files).
   Voices use formant filters, strings are plucked (Karplus-Strong), and everything runs through a small room reverb. */
(function () {
  let ac = null, out = null, verb = null;
  const SFX = { muted: false };
  function ctx() {
    if (SFX.muted) return null;
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        out = ac.createGain(); out.gain.value = 0.75;
        const lim = ac.createDynamicsCompressor(); lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
        out.connect(lim).connect(ac.destination);
        verb = ac.createConvolver(); verb.buffer = impulse(1.6, 2.5);
        const wet = ac.createGain(); wet.gain.value = 0.22; verb.connect(wet).connect(out);
      }
      if (ac.state === "suspended") ac.resume();
    } catch (e) { return null; }
    return ac;
  }
  function impulse(sec, decay) {
    const len = ac.sampleRate * sec, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  // Send a node to the dry output and, optionally, to the reverb.
  const send = (node, wet = true) => { node.connect(out); if (wet) node.connect(verb); };
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };

  const NOTE = n => {
    const m = /^([A-G])(#|b)?(\d)$/.exec(n), base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    return 440 * Math.pow(2, (base + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (+m[3] + 1) * 12 - 69) / 12);
  };

  let noiseBuf = null;
  function noise(t, len, { vol = 0.2, type = "bandpass", freq = 1000, q = 1, sweep = 0, attack = 0.002, wet = true } = {}) {
    t = Math.max(t, ac.currentTime);
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + len);
    env(g, t, attack, vol, len);
    s.connect(f).connect(g); send(g, wet); s.start(t, Math.random()); s.stop(t + attack + len + 0.05);
  }
  function osc(t, freq, len, { type = "sine", vol = 0.2, glide = 0, attack = 0.003, wet = true, filter = 0 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + len);
    env(g, t, attack, vol, len);
    let node = o;
    if (filter) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); send(g, wet); o.start(t); o.stop(t + attack + len + 0.05);
  }

  /* Plucked string (Karplus-Strong), cached per pitch. */
  const plucks = {};
  function pluck(t, freq, { vol = 0.4, bright = 0.5, len = 1.2 } = {}) {
    const key = Math.round(freq) + ":" + bright;
    if (!plucks[key]) {
      const sr = ac.sampleRate, N = Math.max(2, Math.round(sr / freq)), b = ac.createBuffer(1, sr * len, sr), d = b.getChannelData(0);
      for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
      for (let i = N; i < d.length; i++) d[i] = 0.997 * ((1 - bright) * 0.5 * (d[i - N] + d[i - N + 1]) + bright * d[i - N]);
      plucks[key] = b;
    }
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = plucks[key]; g.gain.value = vol; s.connect(g); send(g); s.start(t);
  }

  /* A voice: sawtooth "vocal cords" through vowel formant filters. */
  const VOWELS = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [300, 2200, 2900], o: [570, 840, 2410], u: [320, 870, 2240] };
  function syllable(t, pitch, len, vowel, { cons = "", vol = 0.5, bend = 1 } = {}) {
    const src = ac.createOscillator(), vib = ac.createOscillator(), vibG = ac.createGain(), mix = ac.createGain();
    src.type = "sawtooth"; src.frequency.setValueAtTime(pitch, t); src.frequency.linearRampToValueAtTime(pitch * bend, t + len);
    vib.frequency.value = 5.5; vibG.gain.value = pitch * 0.02; vib.connect(vibG).connect(src.frequency);
    env(mix, t, 0.02, vol, len);
    VOWELS[vowel].forEach((f, k) => {
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * (pitch > 250 ? 1.15 : 1); bp.Q.value = 9;
      const g = ac.createGain(); g.gain.value = [1, 0.6, 0.25][k]; src.connect(bp).connect(g).connect(mix);
    });
    send(mix); src.start(t); vib.start(t); src.stop(t + len + 0.1); vib.stop(t + len + 0.1);
    if (cons === "h") noise(t - 0.04, 0.06, { vol: 0.08, freq: 2500, q: 0.8 });
    if (cons === "b" || cons === "d") noise(t, 0.02, { vol: 0.12, freq: cons === "b" ? 500 : 2000, q: 1 });
  }

  SFX.click = () => { if (ctx()) noise(ac.currentTime, 0.015, { vol: 0.15, freq: 3500, q: 2, wet: false }); };

  SFX.step = (soft) => { if (!ctx()) return; const t = ac.currentTime, v = soft ? 0.5 : 0.8;
    noise(t, 0.05, { vol: 0.35 * v, freq: 1400 + Math.random() * 600, q: 1.5, wet: false }); // heel click
    noise(t + 0.01, 0.09, { vol: 0.3 * v, type: "lowpass", freq: 300, wet: false });            // scuff
    osc(t, 70 + Math.random() * 20, 0.08, { vol: 0.25 * v, glide: 0.6, wet: false }); };          // body

  SFX.pop = () => { if (!ctx()) return; const t = ac.currentTime;
    osc(t, 400, 0.08, { vol: 0.3, glide: 2.5 }); noise(t, 0.04, { vol: 0.2, freq: 1500 }); };

  SFX.compute = () => { if (!ctx()) return; const t = ac.currentTime;
    osc(t, 60, 0.9, { type: "sawtooth", vol: 0.03, filter: 300, attack: 0.1 });          // machine hum
    for (let i = 0; i < 14; i++) noise(t + i * 0.055 + Math.random() * 0.02, 0.02, { vol: 0.25, freq: 2500 + Math.random() * 1500, q: 3, wet: false }); // relays
    [1, 2.76, 5.4].forEach((h, k) => osc(t + 0.85, 880 * h, 1.2 / (k + 1), { vol: 0.12 / (k + 1) })); }; // bell

  SFX.fly = (sec) => { if (!ctx()) return; const t = ac.currentTime;
    noise(t, sec, { vol: 0.25, type: "lowpass", freq: 300, sweep: 1600, attack: 0.4 });
    noise(t, sec, { vol: 0.08, freq: 3000, q: 4, sweep: 5000, attack: 0.6 }); };

  /* Witness gibberish: "bunna danananana". */
  SFX.mumble = (sec, high) => { if (!ctx()) return;
    let t = ac.currentTime + 0.05; const end = t + sec, base = high ? 230 : 125;
    const cons = ["b", "d", "", "n", "d", ""], vow = ["a", "u", "a", "e", "o", "a", "i"];
    while (t < end) {
      const len = 0.09 + Math.random() * 0.08, p = base * (0.85 + Math.random() * 0.35);
      syllable(t, p, len, vow[Math.floor(Math.random() * vow.length)], { cons: cons[Math.floor(Math.random() * cons.length)], vol: 0.35, bend: 0.9 + Math.random() * 0.2 });
      t += len + (Math.random() < 0.18 ? 0.16 : 0.02);
    } };

  /* Henchman: a quick snicker, then a short, silly tiptoe: plinky pizzicato creeping up, woodblock ticks, and a boing. */
  SFX.henchman = () => { if (!ctx()) return; const t = ac.currentTime + 0.06;
    [0, 0.11, 0.22].forEach((d, i) => syllable(t + d, 300 - i * 20, 0.08, "e", { cons: "h", vol: 0.35, bend: 0.85 }));
    const t1 = t + 0.5, e = 0.16;
    [["C5", 0], ["E5", 1], ["G5", 2], ["F#5", 4], ["G5", 5], ["C6", 7]].forEach(([n, k]) => {
      pluck(t1 + k * e, NOTE(n), { vol: 0.35, bright: 0.65, len: 0.4 });
      noise(t1 + k * e, 0.02, { vol: 0.12, freq: 1800, q: 6, wet: false });              // woodblock tick
    });
    [0, 2, 4, 5].forEach(k => pluck(t1 + k * e, NOTE("C3"), { vol: 0.35, bright: 0.2, len: 0.3 }));
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain(), at = t1 + 8 * e; // boing
    o.type = "triangle"; o.frequency.setValueAtTime(330, at); o.frequency.exponentialRampToValueAtTime(520, at + 0.35);
    lfo.frequency.value = 18; lg.gain.value = 25; lfo.connect(lg).connect(o.frequency);
    env(g, at, 0.005, 0.18, 0.45); o.connect(g); send(g); o.start(at); lfo.start(at); o.stop(at + 0.6); lfo.stop(at + 0.6); };

  SFX.gun = () => { if (!ctx()) return; const t = ac.currentTime;
    noise(t, 0.5, { vol: 1.0, type: "lowpass", freq: 9000, sweep: 250 });
    osc(t, 90, 0.35, { vol: 0.6, glide: 0.35 });
    noise(t + 0.04, 0.9, { vol: 0.1, freq: 3000, q: 6, sweep: 6000 }); }; // ricochet

  SFX.knife = () => { if (!ctx()) return; const t = ac.currentTime;
    noise(t, 0.38, { vol: 0.25, freq: 500, q: 3, sweep: 3500, attack: 0.25 });          // whoosh
    noise(t + 0.38, 0.08, { vol: 0.6, freq: 450, q: 2 }); osc(t + 0.38, 170, 0.15, { vol: 0.5, glide: 0.5 }); // thunk in wood
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();   // boing
    o.type = "triangle"; o.frequency.value = 210; lfo.frequency.value = 22; lg.gain.value = 18; lfo.connect(lg).connect(o.frequency);
    env(g, t + 0.42, 0.005, 0.15, 0.6); o.connect(g); send(g); o.start(t + 0.42); lfo.start(t + 0.42); o.stop(t + 1.1); lfo.stop(t + 1.1); };

  /* Sad trombone, "wah wah wah waaah". */
  SFX.sad = () => { if (!ctx()) return; const t = ac.currentTime;
    ["G3", "F#3", "F3", "E3"].forEach((n, i) => {
      const at = t + i * 0.45, len = i === 3 ? 1.2 : 0.4, o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(NOTE(n), at); if (i === 3) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 6; lg.gain.value = 4; l.connect(lg).connect(o.frequency); l.start(at); l.stop(at + len); }
      f.type = "lowpass"; f.Q.value = 6; f.frequency.setValueAtTime(400, at); f.frequency.linearRampToValueAtTime(1400, at + 0.15); f.frequency.linearRampToValueAtTime(500, at + len);
      env(g, at, 0.04, 0.25, len); o.connect(f).connect(g); send(g); o.start(at); o.stop(at + len + 0.1);
    }); };

  /* Sax-like voice, used for the slow sad tune. */
  function sax(t, freq, len, vol) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), vib = ac.createOscillator(), vg = ac.createGain();
    o.type = "sawtooth"; o2.type = "square"; o.frequency.value = freq; o2.frequency.value = freq * 1.003;
    vib.frequency.value = 5; vg.gain.value = freq * 0.012; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    f.type = "lowpass"; f.Q.value = 2; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(2200, t + 0.06); f.frequency.linearRampToValueAtTime(1200, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol * 0.8, t + len * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + len);
    o.connect(f); o2.connect(f); f.connect(g); send(g);
    [o, o2, vib].forEach(x => { x.start(t); x.stop(t + len + 0.05); });
    noise(t, 0.05, { vol: vol * 0.4, freq: 2500, q: 1 }); // breath
  }
  /* Bright, bouncy lead: two slightly detuned square waves with a quick decay. */
  function lead(t, freq, len, vol = 0.09) {
    const g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = "lowpass"; f.frequency.setValueAtTime(4500, t); f.frequency.exponentialRampToValueAtTime(1800, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(vol * 0.45, t + len * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    f.connect(g); send(g);
    [1, 1.006].forEach(d => { const o = ac.createOscillator(); o.type = "square"; o.frequency.value = freq * d; o.connect(f); o.start(t); o.stop(t + len + 0.05); });
  }
  const kick = t => osc(t, 130, 0.16, { vol: 0.7, glide: 0.35, wet: false });
  const snare = t => { noise(t, 0.12, { vol: 0.28, freq: 2000, q: 0.6 }); osc(t, 190, 0.07, { vol: 0.2, glide: 0.7 }); };
  const clap = t => [0, 0.012, 0.024].forEach(d => noise(t + d, 0.05, { vol: 0.18, freq: 1500, q: 1.2 }));
  const hat = (t, open) => noise(t, open ? 0.12 : 0.03, { vol: 0.06, type: "highpass", freq: 8000, wet: false });
  /* Play a melody written as [note, eighths] pairs. */
  const melody = (t0, e, notes, fn) => { let i = 0; for (const [n, len] of notes) { if (n) fn(t0 + i * e, NOTE(n), len * e); i += len; } return i; };

  /* Brassy lead: two detuned saws through a soft lowpass, held notes. */
  function brass(t, freq, len, vol = 0.08) {
    const g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = "lowpass"; f.Q.value = 1; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(2400, t + 0.06); f.frequency.linearRampToValueAtTime(1500, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol * 0.85, t + len * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + len);
    f.connect(g); send(g);
    [0.997, 1.003].forEach(d => { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq * d; o.connect(f); o.start(t); o.stop(t + len + 0.05); });
  }
  /* Soft sustained chord underneath. */
  function pad(t, notes, len, vol = 0.025) {
    notes.forEach(n => { const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = "triangle"; o.frequency.value = NOTE(n); f.type = "lowpass"; f.frequency.value = 1200;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + len - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(f).connect(g); send(g); o.start(t); o.stop(t + len + 0.05); });
  }

  /* "Gotcha!": a short brassy rise when the right thief is caught (about 1.5 s). */
  SFX.gotcha = () => { if (!ctx()) return;
    const t0 = ac.currentTime + 0.05, e = 0.16;
    melody(t0, e, [["A4", 1], ["D5", 1], ["F#5", 1], ["A5", 5]], (t, f, l) => brass(t, f, l * 0.95, 0.09));
    pluck(t0, NOTE("D2"), { vol: 0.6, bright: 0.2 }); pluck(t0 + 3 * e, NOTE("D2"), { vol: 0.7, bright: 0.2 });
    kick(t0 + 3 * e); };

  /* Jail theme: an original adventurous detective tune in D minor (about 14 s).
     It starts with the bass alone, then a brassy lead over a steady beat, and ends on a bright D major chord. */
  SFX.victory = () => { if (!ctx()) return;
    const t0 = ac.currentTime + 0.1, e = 0.2, BAR = 8 * e;
    const bars = [["Dm", "D2"], ["Dm", "D2"], ["Bb", "Bb1"], ["C", "C2"], ["A", "A1"], ["Dm", "D2"], ["Bb", "Bb1"], ["A", "A1"], ["D", "D2"]];
    const PAD = { Dm: ["D4", "F4", "A4"], Bb: ["D4", "F4", "Bb4"], C: ["E4", "G4", "C5"], A: ["C#4", "E4", "A4"], D: ["D4", "F#4", "A4"] };
    const up = (n, k) => NOTE(n) * Math.pow(2, k / 12);
    bars.forEach(([ch, root], b) => {
      const bt = t0 + b * BAR, last = b === bars.length - 1;
      // Bass ostinato: root, root, octave, root, fifth, root, octave, fifth.
      if (!last) [0, 0, 12, 0, 7, 0, 12, 7].forEach((k, i) => pluck(bt + i * e, up(root, k), { vol: 0.6, bright: 0.2, len: 0.5 }));
      if (b > 0 && !last) pad(bt, PAD[ch], BAR);
      if (b > 0 && !last) for (let k = 0; k < 8; k++) {
        if (k % 4 === 0) kick(bt + k * e);
        if (k % 4 === 2) snare(bt + k * e);
        if (k % 2 === 0) hat(bt + k * e);
      }
    });
    const tune = [
      ["A4", 2], ["D5", 2], ["E5", 1], ["F5", 1], ["G5", 2],
      ["F5", 3], ["E5", 1], ["D5", 2], ["C5", 2],
      ["E5", 2], ["G5", 2], ["A5", 2], ["G5", 1], ["E5", 1],
      ["A5", 4], [null, 2], ["C#5", 1], ["E5", 1],
      ["D6", 3], ["A5", 1], ["F5", 2], ["D5", 2],
      ["F5", 2], ["G5", 1], ["A5", 1], ["Bb5", 2], ["A5", 1], ["G5", 1],
      ["A5", 2], ["G5", 1], ["F5", 1], ["E5", 2], ["C#5", 2],
    ];
    melody(t0 + BAR, e, tune, (t, f, l) => brass(t, f, l * 0.92));
    const end = t0 + 8 * BAR; kick(end); snare(end);
    ["D2", "D3", "F#3", "A3", "D4"].forEach(n => pluck(end, NOTE(n), { vol: 0.3, bright: 0.4, len: 2 }));
    brass(end, NOTE("D5"), 1.6, 0.08); brass(end, NOTE("F#5"), 1.6, 0.05); brass(end, NOTE("A5"), 1.6, 0.05);
  };

  /* Slow, sad shuffle home after a failed arrest (about 5 s). */
  SFX.sadWalk = () => { if (!ctx()) return;
    const t0 = ac.currentTime + 0.05, e = 0.32;
    melody(t0, e, [["E4", 2], ["D4", 1], ["C4", 1], ["B3", 2], ["A3", 2], ["C4", 1], ["B3", 1], ["A3", 1], ["G#3", 1], ["A3", 4]], (t, f, l) => sax(t, f, l * 0.95, 0.11));
    ["A1", "E2", "D2", "A1", "F1", "E1", "A1"].forEach((n, k) => pluck(t0 + k * 2 * e, NOTE(n), { vol: 0.7, bright: 0.1 }));
  };

  window.SFX = SFX;
})();
