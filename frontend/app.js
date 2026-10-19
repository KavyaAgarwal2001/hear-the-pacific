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

async function initAudio() {
  await Tone.start();
  const master = new Tone.Volume(Number(els.volume.value)).toDestination();
  const reverb = new Tone.Reverb({ decay: 3, wet: 0.22 }).connect(master);

  const synth = (type, envelope, volume = 0) =>
    new Tone.Synth({ oscillator: { type }, envelope, volume }).connect(reverb);
  const voices = {
    warm: synth("triangle", { attack: 0.005, decay: 0.15, sustain: 0.35, release: 0.5 }),
    cool: synth("sine", { attack: 0.03, decay: 0.25, sustain: 0.45, release: 0.8 }, 2),
    neutral: synth("sine", { attack: 0.02, decay: 0.2, sustain: 0.2, release: 0.4 }, -8),
  };

  const droneFilter = new Tone.Filter({ frequency: 150, type: "lowpass", Q: 1 }).connect(master);
  const droneGain = new Tone.Gain(0).connect(droneFilter);
  new Tone.FatOscillator({ frequency: "C2", type: "sawtooth", count: 3, spread: 14, volume: -20 })
    .connect(droneGain)
    .start();

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
  audio.voices[n.phase].triggerAttackRelease(freq, stepSeconds() * 0.85, time);

  if (n.co2_level == null) {
    audio.droneGain.gain.rampTo(0, 0.4, time);
  } else {
    audio.droneGain.gain.rampTo(0.7, 0.4, time);
    audio.droneFilter.frequency.rampTo(120 + n.co2_level * 1600, 0.3, time);
  }
  Tone.Draw.schedule(() => setCurrent(i), time);
}

async function play() {
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

new ResizeObserver(resize).observe(els.canvas);

load().catch((err) => {
  els.status.textContent = `Could not load data: ${err.message}`;
});
