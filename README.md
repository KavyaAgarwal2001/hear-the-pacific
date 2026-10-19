# Hear the Pacific

75 years of El Niño and La Niña, played as music.

Each season's Pacific temperature anomaly becomes a note: El Niño warmth rises
in pitch, La Niña cold falls. Atmospheric CO₂ from Mauna Loa plays as a slowly
rising drone underneath. A synced visualization scrolls through the record so
you can see and hear 1982, 1997, 2015 — and 2026.

**▶ Listen: https://kavyaagarwal2001.github.io/hear-the-pacific/**

[![Tests](https://github.com/KavyaAgarwal2001/hear-the-pacific/actions/workflows/tests.yml/badge.svg)](https://github.com/KavyaAgarwal2001/hear-the-pacific/actions/workflows/tests.yml)

## Data

| Voice | Variable | Source | Coverage |
|---|---|---|---|
| Melody | Oceanic Niño Index (ONI), 3-month running mean | NOAA CPC (ERSSTv5) | 1950 → present |
| Drone | Monthly mean atmospheric CO₂ | NOAA GML, Mauna Loa | 1958 → present |
| (planned) | Arctic sea-ice extent | NSIDC Sea Ice Index | 1979 → present |

## Honest sonification

Every note maps to exactly one data value, and the mapping is documented in
[`docs/SCIENCE.md`](docs/SCIENCE.md). The score file stores the original value
with each note so the UI can show exact numbers on hover. Pitch is quantized
to a pentatonic scale for listenability — that rounding is aesthetic, never
used for any numeric claim.

## Project layout

```
backend/hear_pacific/   Python package
  sources.py            Fetch + parse NOAA ONI and Mauna Loa CO₂
  mapping.py            Data → notes (documented, monotonic)
  build.py              CLI: writes frontend/public/score.json
frontend/               Static site: Tone.js player + canvas chart (GitHub Pages)
docs/SCIENCE.md         Data, mapping, limitations
docs/SOUND.md           Synthesis: waveforms, envelopes, tuning, signal chain
tests/                  Unit tests
```

## Getting started

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run pytest
uv run python -m hear_pacific.build   # writes frontend/public/score.json
python3 -m http.server -d frontend 8000   # open http://localhost:8000
```

Pushing to `main` deploys `frontend/` to GitHub Pages.

## Roadmap

- [x] ONI and CO₂ loaders, pitch mapping, score builder
- [x] Frontend player (Tone.js / Web Audio) with synced chart
- [x] Event annotations and jump-to buttons
- [x] Deploy to GitHub Pages
- [ ] Monthly scheduled data refresh (GitHub Actions)
- [ ] Sea-ice voice

## License

MIT
