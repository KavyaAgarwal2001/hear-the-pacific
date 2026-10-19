# Sound design

Everything is synthesized live in the browser with Tone.js 14.8.49 (Web Audio
API). There are no samples. All parameters live in the `SOUND` object in
`frontend/app.js`, which drives both the audio engine and the "For musicians"
section of the site, so this page and the sound cannot drift apart. If you
change a value there, update this file too.

## Signal chain

```
Melody:  anomaly → pentatonic note → Synth (oscillator + ADSR) → Reverb → Master volume → out
Hum:     FatOscillator (3 × sawtooth, C2) → Gain → Low-pass filter (cutoff ← CO₂) → Master volume → out
```

The hum bypasses the reverb.

## Voices

One note per season, on one of three monophonic voices chosen by NOAA's ±0.5 °C
thresholds. Envelope curves: linear attack, exponential decay and release.

| Voice | Waveform | Attack | Decay | Sustain | Release | Level |
|---|---|---|---|---|---|---|
| Warm (≥ +0.5 °C) | triangle | 5 ms | 150 ms | 35% | 500 ms | 0 dB |
| Cool (≤ −0.5 °C) | sine | 30 ms | 250 ms | 45% | 800 ms | +2 dB |
| Neutral | sine | 20 ms | 200 ms | 20% | 400 ms | −8 dB |

## Scale and tuning

C major pentatonic (C D E G A), three octaves from C3 (MIDI 48, 130.8 Hz) to
C6 (MIDI 84, 1046.5 Hz): 16 notes. 12-tone equal temperament, A4 = 440 Hz.
The anomaly range −3 °C to +3 °C maps linearly onto the 16 notes, 0.4 °C per
note, rounding half up. The A4 band (+0.4 to +0.8 °C) and D4 band (−0.8 to
−0.4 °C) straddle the voice thresholds, so those notes can sound in two voices.

## Timing and dynamics

- 12 notes per year (one per overlapping three-month season).
- Speeds 4 / 8 / 16 seasons per second = 240 / 480 / 960 notes per minute.
- Each note is held for 85% of its slot, then released. A new note in the same
  voice cuts the previous tail; different voices can overlap.
- Fixed velocity for every note. No dynamics are derived from the data.

## Effects

- **Reverb**: Tone.Reverb, convolution with a generated decaying-noise
  impulse response. Decay 3 s, pre-delay 10 ms, wet 22%.
- **Hum**: Tone.FatOscillator, 3 sawtooth oscillators on C2 (65.4 Hz), detuned
  −7 / 0 / +7 cents. Level −20 dB, gain 0.7, 0.4 s fades. Silent before
  March 1958.
- **Hum filter**: 12 dB/oct low-pass, Q 1. Cutoff = 120 Hz + CO₂ level × 1600 Hz
  (CO₂ level is the record scaled 0–1), with a 300 ms glide.
- **Master**: Volume slider, −40 to 0 dB, default −10 dB.

Tone.js defaults relied on above (envelope curves, 12 dB/oct filter slope,
10 ms reverb pre-delay, FatOscillator detune layout) were confirmed against
the Tone.js 14.8.49 source.
