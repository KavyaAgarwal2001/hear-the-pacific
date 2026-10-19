"use strict";

// Annotated events. Positions come from the data: each label sits on the
// largest-magnitude season within its window.
const EVENTS = [
  { label: "1972–73 El Niño", years: [1972, 1973], kind: "warm" },
  { label: "1982–83 El Niño", years: [1982, 1983], kind: "warm" },
  { label: "1988–89 La Niña", years: [1988, 1989], kind: "cool" },
  { label: "1997–98 El Niño", years: [1997, 1998], kind: "warm" },
  { label: "2010–11 La Niña", years: [2010, 2011], kind: "cool" },
  { label: "2015–16 El Niño", years: [2015, 2016], kind: "warm" },
  { label: "2026 El Niño (preliminary)", years: [2026, 2027], kind: "warm" },
];

const Y_RANGE = 3; // °C, matches mapping.ONI_RANGE_C
const LEAD_IN = 18; // seasons of context before a jumped-to peak
const MARGIN = { l: 40, r: 48, t: 30, b: 26 };

const $ = (id) => document.getElementById(id);
const els = {
  canvas: $("chart"), tooltip: $("tooltip"), status: $("status"),
  play: $("play"), speed: $("speed"), volume: $("volume"), jumps: $("jumps"),
  season: $("r-season"), anom: $("r-anom"), phase: $("r-phase"), co2: $("r-co2"),
  generated: $("generated"),
};
const ctx = els.canvas.getContext("2d");
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const COLORS = {
  warm: color("--warm"), cool: color("--cool"), neutral: color("--neutral"),
  co2: color("--co2"), text: color("--text"), muted: color("--muted"),
  line: color("--line"), accent: color("--accent"), panel: color("--panel"),
};

const state = {
  notes: [],
  peaks: [],
  co2Domain: [300, 440],
  idx: 0,        // next season to play
  current: -1,   // season shown in the readout / playhead
  hover: null,
  playing: false,
};

let audio = null;
let audioInit = null; // shared promise so rapid clicks don't build two engines

// ---------- formatting ----------

const fmtAnom = (a) => `${a >= 0 ? "+" : "−"}${Math.abs(a).toFixed(2)} °C`;
const fmtPhase = (p) => ({ warm: "Warm", cool: "Cool", neutral: "Neutral" })[p];
const fmtCo2 = (c) => (c == null ? "no record" : `${c.toFixed(1)} ppm`);

// ---------- data ----------

async function load() {
  const resp = await fetch("public/score.json");
  if (!resp.ok) throw new Error(`score.json: HTTP ${resp.status}`);
  const score = await resp.json();
  state.notes = score.notes;
  state.peaks = findPeaks(score.notes);

  const co2 = score.notes.map((n) => n.co2_ppm).filter((c) => c != null);
  state.co2Domain = [Math.floor(Math.min(...co2) / 20) * 20, Math.ceil(Math.max(...co2) / 20) * 20];

  els.generated.textContent = new Date(score.generated_at).toISOString().slice(0, 10);
  els.status.hidden = true;
  els.play.disabled = false;
  renderJumps();
  renderCo2Range(score.notes);
  renderTiming();
  setCurrent(-1);
}

function findPeaks(notes) {
  return EVENTS.map((ev) => {
    let best = -1;
    notes.forEach((n, i) => {
      if (n.year < ev.years[0] || n.year > ev.years[1]) return;
      const better = ev.kind === "warm" ? n.anomaly_c > (notes[best]?.anomaly_c ?? -Infinity)
                                        : n.anomaly_c < (notes[best]?.anomaly_c ?? Infinity);
      if (better) best = i;
    });
    return { ...ev, index: best };
  }).filter((p) => p.index >= 0);
}

// ---------- chart ----------

function layout() {
  const w = els.canvas.clientWidth, h = els.canvas.clientHeight;
  const pw = w - MARGIN.l - MARGIN.r, ph = h - MARGIN.t - MARGIN.b;
  const bw = pw / Math.max(state.notes.length, 1);
  return {
    w, h, pw, ph, bw,
    x: (i) => MARGIN.l + i * bw,
    y: (a) => MARGIN.t + ph / 2 - (Math.max(-Y_RANGE, Math.min(Y_RANGE, a)) / Y_RANGE) * (ph / 2),
    yCo2: (c) => {
      const [lo, hi] = state.co2Domain;
      return MARGIN.t + ph - ((c - lo) / (hi - lo)) * ph;
    },
  };
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  els.canvas.width = Math.round(els.canvas.clientWidth * dpr);
  els.canvas.height = Math.round(els.canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw() {
  const L = layout();
  const { notes, current } = state;
  ctx.clearRect(0, 0, L.w, L.h);
  if (!notes.length) return;
  ctx.font = "11px system-ui, sans-serif";

  // Anomaly gridlines and left axis
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let a = -Y_RANGE; a <= Y_RANGE; a++) {
    ctx.strokeStyle = a === 0 ? COLORS.muted : COLORS.line;
    ctx.globalAlpha = a === 0 ? 0.6 : 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN.l, L.y(a));
    ctx.lineTo(MARGIN.l + L.pw, L.y(a));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(a > 0 ? `+${a}` : `${a}`, MARGIN.l - 8, L.y(a));
  }
  ctx.save();
  ctx.translate(11, MARGIN.t + L.ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("ONI (°C)", 0, 0);
  ctx.restore();

  // ±0.5 °C thresholds
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = COLORS.muted;
  ctx.globalAlpha = 0.5;
  for (const t of [0.5, -0.5]) {
    ctx.beginPath();
    ctx.moveTo(MARGIN.l, L.y(t));
    ctx.lineTo(MARGIN.l + L.pw, L.y(t));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Season bars; unplayed seasons are dimmed once playback has started
  const y0 = L.y(0);
  notes.forEach((n, i) => {
    const ya = L.y(n.anomaly_c);
    ctx.fillStyle = COLORS[n.phase];
    ctx.globalAlpha = current >= 0 && i > current ? 0.25 : 0.95;
    ctx.fillRect(L.x(i), Math.min(y0, ya), L.bw + 0.4, Math.abs(ya - y0) || 0.5);
  });
  ctx.globalAlpha = 1;

  // CO₂ line and right axis
  ctx.strokeStyle = COLORS.co2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  notes.forEach((n, i) => {
    if (n.co2_ppm == null) return;
    const px = L.x(i) + L.bw / 2, py = L.yCo2(n.co2_ppm);
    started ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    started = true;
  });
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.co2;
  const [lo, hi] = state.co2Domain;
  for (let c = lo; c <= hi; c += 40) ctx.fillText(`${c}`, MARGIN.l + L.pw + 8, L.yCo2(c));
  ctx.save();
  ctx.translate(L.w - 6, MARGIN.t + L.ph / 2);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("CO₂ (ppm)", 0, 0);
  ctx.restore();

  // Decade ticks
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  notes.forEach((n, i) => {
    if (n.season === "DJF" && n.year % 10 === 0) ctx.fillText(n.year, L.x(i), MARGIN.t + L.ph + 8);
  });

  // Event annotations
  const compact = L.pw < 620;
  ctx.textBaseline = "bottom";
  for (const p of state.peaks) {
    const n = notes[p.index];
    const px = L.x(p.index) + L.bw / 2;
    const text = compact ? `’${String(p.years[0]).slice(2)}` : p.label.split(" ")[0];
    ctx.fillStyle = COLORS[p.kind];
    ctx.textAlign = px > MARGIN.l + L.pw - 24 ? "right" : "center"; // keep clear of the CO₂ axis
    if (p.kind === "warm") {
      ctx.textBaseline = "bottom";
      haloText(text, px, Math.max(MARGIN.t - 2, L.y(n.anomaly_c) - 4));
    } else {
      ctx.textBaseline = "top";
      haloText(text, px, Math.min(MARGIN.t + L.ph - 12, L.y(n.anomaly_c) + 4));
    }
  }

  // Hover line and playhead
  if (state.hover != null) {
    ctx.strokeStyle = COLORS.text;
    ctx.globalAlpha = 0.35;
    const hx = L.x(state.hover) + L.bw / 2;
    ctx.beginPath();
    ctx.moveTo(hx, MARGIN.t);
    ctx.lineTo(hx, MARGIN.t + L.ph);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (current >= 0) {
    const px = L.x(current) + L.bw / 2;
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, MARGIN.t - 6);
    ctx.lineTo(px, MARGIN.t + L.ph);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function haloText(text, x, y) {
  ctx.strokeStyle = COLORS.panel;
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);
  ctx.lineWidth = 1;
  ctx.fillText(text, x, y);
}

function indexAt(clientX) {
  const L = layout();
  const rect = els.canvas.getBoundingClientRect();
  const i = Math.floor((clientX - rect.left - MARGIN.l) / L.bw);
  return i >= 0 && i < state.notes.length ? i : null;
}

// ---------- readout ----------

function setCurrent(i) {
  state.current = i;
  const n = state.notes[i];
  els.season.textContent = n ? `${n.season} ${n.year}` : "—";
  els.anom.textContent = n ? fmtAnom(n.anomaly_c) : "—";
  els.anom.className = `value ${n ? n.phase : ""}`;
  els.phase.textContent = n ? fmtPhase(n.phase) : "—";
  els.co2.textContent = n ? fmtCo2(n.co2_ppm) : "—";
  draw();
}

function showTooltip(i, clientX) {
  if (i == null) {
    els.tooltip.hidden = true;
    return;
  }
  const n = state.notes[i];
  els.tooltip.innerHTML =
    `<b>${n.season} ${n.year}</b><br>ONI ${fmtAnom(n.anomaly_c)} · ${fmtPhase(n.phase)}<br>CO₂ ${fmtCo2(n.co2_ppm)}` +
    (n.clipped ? "<br><i>outside pitch range, clipped</i>" : "");
  els.tooltip.hidden = false;
  const wrap = els.canvas.parentElement.getBoundingClientRect();
  const tw = els.tooltip.offsetWidth;
  const left = Math.min(Math.max(clientX - wrap.left + 12, 8), wrap.width - tw - 8);
  els.tooltip.style.left = `${left}px`;
}

// ---------- audio ----------

const stepSeconds = () => 1 / Number(els.speed.value);

// Every synthesis parameter lives here. The engine and the "For musicians"
// section both read from it, so the documentation can't drift from the sound.
const SOUND = {
  noteLength: 0.85, // fraction of each season's time slot a note is held
  voices: {
    warm: {
      label: "Warm season", oscillator: "triangle", volumeDb: 0,
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.35, release: 0.5 },
    },
    cool: {
      label: "Cool season", oscillator: "sine", volumeDb: 2,
      envelope: { attack: 0.03, decay: 0.25, sustain: 0.45, release: 0.8 },
    },
    neutral: {
      label: "Neutral season", oscillator: "sine", volumeDb: -8,
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.2, release: 0.4 },
    },
  },
  curves: { attackCurve: "linear", decayCurve: "exponential", releaseCurve: "exponential" },
  reverb: { decay: 3, preDelay: 0.01, wet: 0.22 },
  drone: {
    note: "C2", oscillator: "sawtooth", count: 3, spreadCents: 14, volumeDb: -20,
    level: 0.7, fadeSeconds: 0.4,
    filter: { type: "lowpass", rolloff: -12, Q: 1, minHz: 120, rangeHz: 1600, glideSeconds: 0.3 },
  },
};

const synthOptions = (v) => ({
  oscillator: { type: v.oscillator },
  envelope: { ...v.envelope, ...SOUND.curves },
  volume: v.volumeDb,
});
const droneOptions = () => {
  const d = SOUND.drone;
  return { frequency: d.note, type: d.oscillator, count: d.count, spread: d.spreadCents, volume: d.volumeDb };
};
const droneFilterOptions = (frequency) => {
  const f = SOUND.drone.filter;
  return { type: f.type, rolloff: f.rolloff, Q: f.Q, frequency };
};
const droneCutoff = (level) => SOUND.drone.filter.minHz + level * SOUND.drone.filter.rangeHz;

async function initAudio() {
  await Tone.start();
  const master = new Tone.Volume(Number(els.volume.value)).toDestination();
  const reverb = new Tone.Reverb(SOUND.reverb).connect(master);
  const voices = Object.fromEntries(
    Object.entries(SOUND.voices).map(([k, v]) => [k, new Tone.Synth(synthOptions(v)).connect(reverb)]),
  );

  const droneFilter = new Tone.Filter(droneFilterOptions(droneCutoff(0))).connect(master);
  const droneGain = new Tone.Gain(0).connect(droneFilter);
  new Tone.FatOscillator(droneOptions()).connect(droneGain).start();

  const loop = new Tone.Loop(step, stepSeconds()).start(0);
  audio = { master, voices, droneFilter, droneGain, loop };
}

function step(time) {
  const { notes } = state;
  if (state.idx >= notes.length) {
    Tone.Draw.schedule(pause, time);
    return;
  }
  const i = state.idx++;
  const n = notes[i];
  const freq = Tone.Frequency(n.midi, "midi").toFrequency();
  audio.voices[n.phase].triggerAttackRelease(freq, stepSeconds() * SOUND.noteLength, time);

  const d = SOUND.drone;
  if (n.co2_level == null) {
    audio.droneGain.gain.rampTo(0, d.fadeSeconds, time);
  } else {
    audio.droneGain.gain.rampTo(d.level, d.fadeSeconds, time);
    audio.droneFilter.frequency.rampTo(droneCutoff(n.co2_level), d.filter.glideSeconds, time);
  }
  Tone.Draw.schedule(() => setCurrent(i), time);
}

// iOS routes Web Audio through the ringer channel, so the silent switch mutes
// it. Declaring a playback session (Safari 16.4+) or playing a looping silent
// <audio> element moves the page onto the media channel instead.
let unlockEl = null;

function silentWavUrl(seconds = 0.5, rate = 8000) {
  const n = Math.round(seconds * rate);
  const v = new DataView(new ArrayBuffer(44 + n * 2)); // samples stay zero = silence
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([v.buffer], { type: "audio/wav" }));
}

function unlockMediaChannel() {
  if ("audioSession" in navigator) navigator.audioSession.type = "playback";
  unlockEl ??= Object.assign(new Audio(silentWavUrl()), { loop: true, playsInline: true });
  unlockEl.play().catch(() => {});
}

async function play() {
  unlockMediaChannel(); // must run synchronously inside the tap
  if (!audio) await (audioInit ??= initAudio());
  if (state.idx >= state.notes.length) state.idx = 0;
  Tone.Transport.start();
  state.playing = true;
  els.play.textContent = "❚❚ Pause";
}

function pause() {
  if (!audio) return;
  Tone.Transport.pause();
  audio.droneGain.gain.rampTo(0, 0.3);
  unlockEl?.pause();
  state.playing = false;
  els.play.textContent = "▶ Play";
}

function seek(i) {
  state.idx = i;
  setCurrent(i);
}

// ---------- controls ----------

function renderJumps() {
  for (const p of state.peaks) {
    const b = document.createElement("button");
    b.textContent = p.label;
    b.className = p.kind;
    b.addEventListener("click", () => {
      seek(Math.max(0, p.index - LEAD_IN));
      play();
    });
    els.jumps.append(b);
  }
}

els.play.addEventListener("click", () => (state.playing ? pause() : play()));
els.speed.addEventListener("change", () => {
  if (audio) audio.loop.interval = stepSeconds();
});
els.volume.addEventListener("input", () => {
  if (audio) audio.master.volume.value = Number(els.volume.value);
});

els.canvas.addEventListener("pointermove", (e) => {
  state.hover = indexAt(e.clientX);
  showTooltip(state.hover, e.clientX);
  draw();
});
els.canvas.addEventListener("pointerleave", () => {
  state.hover = null;
  showTooltip(null);
  draw();
});
els.canvas.addEventListener("click", (e) => {
  const i = indexAt(e.clientX);
  if (i != null) seek(i);
});

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.closest("button, select, input")) return;
  e.preventDefault();
  if (!els.play.disabled) state.playing ? pause() : play();
});

// ---------- explainer ----------

// Mirrors backend/hear_pacific/mapping.py; keep the two in sync.
const PENTATONIC = [0, 2, 4, 7, 9];
const NOTE_STEPS = [...[0, 1, 2].flatMap((o) => PENTATONIC.map((d) => o * 12 + d)), 36];
const BASE_MIDI = 48;
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

const clampAnom = (a) => Math.max(-Y_RANGE, Math.min(Y_RANGE, a));
const stepIndex = (a) => Math.round(((clampAnom(a) + Y_RANGE) / (2 * Y_RANGE)) * (NOTE_STEPS.length - 1));
const stepAnomaly = (k) => -Y_RANGE + (k * 2 * Y_RANGE) / (NOTE_STEPS.length - 1);
const phaseOf = (a) => (a >= 0.5 ? "warm" : a <= -0.5 ? "cool" : "neutral");
const noteName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

const ex = {
  pacific: document.querySelector(".pacific"),
  stateLabel: document.querySelector(".svg-state"),
  scale: $("scale"), slider: $("try"), out: $("try-out"), play: $("try-play"),
  co2Start: $("co2-start"), co2End: $("co2-end"),
};

function setOceanState(s) {
  ex.pacific.dataset.state = s;
  ex.stateLabel.textContent = s === "nino" ? "El Niño: warm water spreads east" : "Normal: warm water piles up in the west";
  ex.pacific.querySelectorAll(".toggle button").forEach((b) => b.classList.toggle("on", b.dataset.state === s));
}

function renderScale() {
  NOTE_STEPS.forEach((_, k) => {
    const cell = document.createElement("div");
    cell.className = `cell ${phaseOf(stepAnomaly(k))}`;
    cell.style.height = `${18 + (k / (NOTE_STEPS.length - 1)) * 74}px`;
    ex.scale.append(cell);
  });
}

function updatePreview() {
  const a = Number(ex.slider.value);
  const k = stepIndex(a);
  const midi = BASE_MIDI + NOTE_STEPS[k];
  const phase = phaseOf(a);
  ex.out.innerHTML = `<b class="${phase}">${fmtAnom(a)}</b> → note <b>${noteName(midi)}</b>, ${fmtPhase(phase).toLowerCase()} voice`;
  [...ex.scale.children].forEach((c, i) => c.classList.toggle("on", i === k));
  return { midi, phase };
}

async function previewNote() {
  const { midi, phase } = updatePreview();
  unlockMediaChannel();
  if (!audio) await (audioInit ??= initAudio());
  audio.voices[phase].triggerAttackRelease(Tone.Frequency(midi, "midi").toFrequency(), 0.6);
}

function renderCo2Range(notes) {
  const withCo2 = notes.filter((n) => n.co2_ppm != null);
  const first = withCo2[0], last = withCo2[withCo2.length - 1];
  ex.co2Start.textContent = `${Math.round(first.co2_ppm)} ppm (${first.year})`;
  ex.co2End.textContent = `${Math.round(last.co2_ppm)} ppm (${last.year})`;
}

ex.pacific.querySelectorAll(".toggle button").forEach((b) =>
  b.addEventListener("click", () => setOceanState(b.dataset.state)));
ex.slider.addEventListener("input", updatePreview);
ex.slider.addEventListener("change", previewNote);
ex.play.addEventListener("click", previewNote);
renderScale();
updatePreview();
setOceanState("normal");

// ---------- for musicians ----------

const mu = {
  chain: $("mu-chain"), gate: $("mu-gate"), voices: $("mu-voices"),
  notes: document.querySelector("#mu-notes tbody"), timing: $("mu-timing"),
};
const AUDITION_HZ = 440; // A4: every voice is pictured and auditioned on the same pitch
const fmtMs = (s) => `${Math.round(s * 1000)} ms`;
const fmtDb = (db) => `${db > 0 ? "+" : db < 0 ? "−" : ""}${Math.abs(db)} dB`;
const fmtSigned = (a) => {
  const r = Math.round(a * 10) / 10; // avoid "+0.0" from float noise
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}`;
};
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

function renderChain() {
  const { reverb, drone } = SOUND;
  const f = drone.filter;
  const row = (label, boxes) =>
    `<div class="chain-row"><span class="row-label">${label}</span>` +
    boxes.map(([t, d]) => `<div class="chain-box"><b>${t}</b><span>${d}</span></div>`)
      .join('<span class="chain-arrow" aria-hidden="true">→</span>') +
    "</div>";
  mu.chain.innerHTML =
    row("Melody (one note per season)", [
      ["Pitch", "anomaly → pentatonic note"],
      ["Synth voice", "oscillator + ADSR envelope"],
      ["Reverb", `${reverb.decay} s decay, ${Math.round(reverb.wet * 100)}% wet`],
      ["Master volume", "Volume slider"],
      ["Output", "stereo"],
    ]) +
    row("Hum (CO₂)", [
      ["Drone", `${drone.count} × ${drone.oscillator} on ${drone.note}`],
      ["Gain", `${drone.fadeSeconds} s fades, level ${drone.level}`],
      ["Low-pass filter", `cutoff ${f.minHz}–${f.minHz + f.rangeHz} Hz ← CO₂`],
      ["Master volume", "Volume slider"],
      ["Output", "stereo"],
    ]);
}

function renderCards() {
  const voiceCards = Object.entries(SOUND.voices).map(([key, v]) => {
    const e = v.envelope;
    return `<article class="mu-card">
      <div class="mu-head"><i class="sw ${key}"></i><b>${v.label}</b>
        <button type="button" data-audition="${key}">▶ A4</button></div>
      <canvas class="mu-env" data-env="${key}" aria-label="${v.label} amplitude envelope"></canvas>
      <canvas class="mu-zoom" data-zoom="${key}" aria-label="${v.label} waveform close-up"></canvas>
      <p class="mu-caption">Top: one A4 note, start to finish. Bottom: 3 cycles, zoomed in.</p>
      <dl>
        <dt>Waveform</dt><dd>${v.oscillator}</dd>
        <dt>Attack</dt><dd>${fmtMs(e.attack)}, ${SOUND.curves.attackCurve}</dd>
        <dt>Decay</dt><dd>${fmtMs(e.decay)} to sustain, ${SOUND.curves.decayCurve}</dd>
        <dt>Sustain</dt><dd>${Math.round(e.sustain * 100)}% of peak</dd>
        <dt>Release</dt><dd>${fmtMs(e.release)}, ${SOUND.curves.releaseCurve}</dd>
        <dt>Level</dt><dd>${fmtDb(v.volumeDb)}</dd>
      </dl>
    </article>`;
  });

  const d = SOUND.drone, f = d.filter;
  const spreadEach = d.spreadCents / (d.count - 1);
  const detunes = Array.from({ length: d.count }, (_, i) => -d.spreadCents / 2 + i * spreadEach)
    .map((c) => `${c > 0 ? "+" : c < 0 ? "−" : ""}${Math.abs(c)}`).join(", ");
  const droneCard = `<article class="mu-card">
    <div class="mu-head"><i class="sw co2"></i><b>CO₂ hum</b>
      <button type="button" data-audition="drone">▶ 1958 → today</button></div>
    <canvas class="mu-zoom" data-drone="0" aria-label="Drone waveform at the 1958 filter setting"></canvas>
    <p class="mu-caption">Lowest CO₂ (1958): cutoff ${f.minHz} Hz, a dark, rounded wave.</p>
    <canvas class="mu-zoom" data-drone="1" aria-label="Drone waveform at today's filter setting"></canvas>
    <p class="mu-caption">Highest CO₂ (today): cutoff ${f.minHz + f.rangeHz} Hz, more of the sawtooth's edge gets through. Both scaled to the same height.</p>
    <dl>
      <dt>Oscillators</dt><dd>${d.count} × ${d.oscillator}, ${d.note} (${midiHz(36).toFixed(1)} Hz)</dd>
      <dt>Detune</dt><dd>${detunes} cents (slow beating)</dd>
      <dt>Filter</dt><dd>${f.type}, ${-f.rolloff} dB/oct, Q ${f.Q}</dd>
      <dt>Cutoff</dt><dd>${f.minHz} Hz + CO₂ level × ${f.rangeHz} Hz, ${fmtMs(f.glideSeconds)} glide</dd>
      <dt>Level</dt><dd>${fmtDb(d.volumeDb)}, no reverb</dd>
    </dl>
  </article>`;

  mu.voices.innerHTML = voiceCards.join("") + droneCard;
  mu.voices.querySelectorAll("[data-audition]").forEach((b) =>
    b.addEventListener("click", () => audition(b.dataset.audition)));
}

function renderNoteTable() {
  const last = NOTE_STEPS.length - 1;
  mu.notes.innerHTML = NOTE_STEPS.map((s, k) => {
    const midi = BASE_MIDI + s, center = stepAnomaly(k);
    // A band can straddle the ±0.5 °C thresholds, so check both of its ends.
    const lowPhase = phaseOf(k === 0 ? -Infinity : center - 0.2);
    const highPhase = phaseOf(k === last ? Infinity : center + 0.2 - 1e-9);
    const voice = lowPhase === highPhase ? fmtPhase(lowPhase) : `${fmtPhase(lowPhase)} or ${fmtPhase(highPhase).toLowerCase()}`;
    const band = k === 0 ? `≤ ${fmtSigned(center + 0.2)} °C`
      : k === last ? `≥ ${fmtSigned(center - 0.2)} °C`
      : `${fmtSigned(center - 0.2)} to ${fmtSigned(center + 0.2)} °C`;
    return `<tr><td>${noteName(midi)}</td><td>${midi}</td><td>${midiHz(midi).toFixed(1)} Hz</td>` +
      `<td>${band}</td><td class="${highPhase === "neutral" ? lowPhase : highPhase}">${voice}</td></tr>`;
  }).reverse().join("");
}

function renderTiming() {
  const speeds = [...els.speed.options].map((o) => Number(o.value));
  const list = (fn) => speeds.map(fn).join(" / ");
  const { reverb } = SOUND;
  mu.timing.innerHTML = [
    `One note per overlapping three-month season: 12 notes per year, ${state.notes.length || "~920"} in all.`,
    `Speeds ${list((v) => v)} seasons per second = ${list((v) => v * 60)} notes per minute; one year of data lasts ${list((v) => +(12 / v).toFixed(2))} s.`,
    `Each note is held for ${Math.round(SOUND.noteLength * 100)}% of its slot, then released. Each voice is monophonic: a new note in the same voice cuts the previous tail, while different voices can overlap.`,
    "Every note is played at the same velocity. Loudness differences come only from the voice levels; no dynamics are taken from the data.",
    `Reverb is a convolution reverb with a generated impulse response (decaying noise): ${reverb.decay} s decay, ${fmtMs(reverb.preDelay)} pre-delay, ${Math.round(reverb.wet * 100)}% wet. It is applied to the melody voices only.`,
    "Master level is the Volume slider: −40 to 0 dB (default −10 dB).",
  ].map((t) => `<li>${t}</li>`).join("");
}

function prepCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(c.clientWidth * dpr);
  c.height = Math.round(c.clientHeight * dpr);
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [g, c.clientWidth, c.clientHeight];
}

function drawEnvelope(c, r, peak, maxDur, col) {
  const [g, w, h] = prepCanvas(c);
  const mid = h / 2, scale = (mid - 4) / peak, total = maxDur * r.sr;
  g.fillStyle = col;
  for (let x = 0; x < w; x++) {
    const i0 = Math.floor((x / w) * total), i1 = Math.min(r.data.length, Math.floor(((x + 1) / w) * total));
    if (i0 >= r.data.length) break;
    let lo = 0, hi = 0;
    for (let i = i0; i < i1; i++) {
      if (r.data[i] < lo) lo = r.data[i];
      if (r.data[i] > hi) hi = r.data[i];
    }
    g.fillRect(x, mid - hi * scale, 1, Math.max(1, (hi - lo) * scale));
  }
  const gx = (r.gate / maxDur) * w;
  g.strokeStyle = COLORS.muted;
  g.setLineDash([3, 3]);
  g.beginPath();
  g.moveTo(gx, 0);
  g.lineTo(gx, h);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = COLORS.muted;
  g.font = "10px system-ui, sans-serif";
  g.fillText("note off", gx + 4, 11);
  g.fillText("0", 3, h - 4);
  g.textAlign = "right";
  g.fillText(fmtMs(maxDur), w - 3, h - 4);
}

function drawWave(c, data, sr, t0, span, col) {
  const [g, w, h] = prepCanvas(c);
  const i0 = Math.floor(t0 * sr), m = Math.floor(span * sr);
  let peak = 1e-9;
  for (let i = 0; i <= m; i++) peak = Math.max(peak, Math.abs(data[i0 + i]));
  g.strokeStyle = COLORS.line;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  g.strokeStyle = col;
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i <= m; i++) {
    const x = (i / m) * w, y = h / 2 - (data[i0 + i] / peak) * (h / 2 - 4);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
}

let muToken = 0;

// Render each voice offline with the player's exact settings, then draw it.
async function renderWaveforms() {
  const token = ++muToken;
  const gate = stepSeconds() * SOUND.noteLength;
  mu.gate.textContent = `At ${els.speed.value} seasons per second, each note gets a ${fmtMs(stepSeconds())} slot ` +
    `and is held for ${fmtMs(gate)} before release. Change the speed above and these pictures update.`;

  const renders = {};
  for (const [key, v] of Object.entries(SOUND.voices)) {
    const dur = gate + v.envelope.release * 1.2 + 0.02;
    const buf = await Tone.Offline(() => {
      new Tone.Synth(synthOptions(v)).toDestination().triggerAttackRelease(AUDITION_HZ, gate, 0);
    }, dur);
    renders[key] = { data: buf.getChannelData(0), sr: buf.sampleRate, gate, attack: v.envelope.attack };
  }
  const drones = [];
  for (const level of [0, 1]) {
    const buf = await Tone.Offline(() => {
      const filter = new Tone.Filter(droneFilterOptions(droneCutoff(level))).toDestination();
      new Tone.FatOscillator(droneOptions()).connect(filter).start(0);
    }, 0.3);
    drones.push({ data: buf.getChannelData(0), sr: buf.sampleRate });
  }
  if (token !== muToken) return;

  // One amplitude scale across voices so their relative levels are visible.
  const peak = Math.max(...Object.values(renders).map((r) => r.data.reduce((m, x) => Math.max(m, Math.abs(x)), 0)));
  const maxDur = Math.max(...Object.values(renders).map((r) => r.data.length / r.sr));
  for (const [key, r] of Object.entries(renders)) {
    drawEnvelope(mu.voices.querySelector(`[data-env="${key}"]`), r, peak, maxDur, COLORS[key]);
    drawWave(mu.voices.querySelector(`[data-zoom="${key}"]`), r.data, r.sr, r.attack + 0.01, 3 / AUDITION_HZ, COLORS[key]);
  }
  const droneSpan = 2 / midiHz(36);
  drones.forEach((r, level) =>
    drawWave(mu.voices.querySelector(`[data-drone="${level}"]`), r.data, r.sr, 0.2, droneSpan, COLORS.co2));
}

async function audition(key) {
  unlockMediaChannel();
  if (!audio) await (audioInit ??= initAudio());
  if (key !== "drone") {
    audio.voices[key].triggerAttackRelease(AUDITION_HZ, 0.6);
    return;
  }
  if (state.playing) pause();
  const d = SOUND.drone, t = Tone.now() + 0.4, sweep = 4;
  audio.droneFilter.frequency.cancelScheduledValues(t);
  audio.droneFilter.frequency.setValueAtTime(droneCutoff(0), t);
  audio.droneFilter.frequency.linearRampToValueAtTime(droneCutoff(1), t + sweep);
  audio.droneGain.gain.rampTo(d.level, d.fadeSeconds, t);
  audio.droneGain.gain.rampTo(0, d.fadeSeconds, t + sweep);
}

renderChain();
renderCards();
renderNoteTable();
renderTiming();
let muResize = null;
new ResizeObserver(() => {
  clearTimeout(muResize);
  muResize = setTimeout(() => renderWaveforms().catch(console.error), 150);
}).observe(mu.voices);
els.speed.addEventListener("change", () => renderWaveforms().catch(console.error));

new ResizeObserver(resize).observe(els.canvas);

load().catch((err) => {
  els.status.textContent = `Could not load data: ${err.message}`;
});
