# Science notes

## Oceanic Niño Index (ONI)

- Source: NOAA Climate Prediction Center, `oni.ascii.txt`.
- Definition: 3-month running mean of ERSSTv5 sea-surface temperature
  anomalies in the Niño-3.4 region (5°N–5°S, 170°W–120°W).
- Anomalies use centered 30-year base periods that NOAA updates every 5 years,
  so a long-term warming trend is partly removed. Check whether NOAA's current
  official index is ONI or the relative ONI (RONI) and support both if needed.

## El Niño / La Niña labels

NOAA's thresholds are ONI ≥ +0.5 °C (El Niño) and ≤ −0.5 °C (La Niña). An
official *episode* requires the threshold to hold for at least 5 consecutive
overlapping seasons. The sonification colors individual seasons by threshold;
the UI must not call a single season an "episode".

## Mauna Loa CO₂

- Source: NOAA Global Monitoring Laboratory, monthly means (`co2_mm_mlo.csv`).
- Single site, representative of the well-mixed background atmosphere.
- Record begins March 1958, so the CO₂ voice starts 8 years after the melody.

## Mapping

| Data | Sound | Rule |
|---|---|---|
| ONI anomaly | Pitch | Linear on [−3.0, +3.0] °C → 3-octave pentatonic scale; values outside are clipped and flagged |
| ONI phase | Timbre | Warm instrument ≥ +0.5, cool ≤ −0.5, neutral otherwise |
| CO₂ (ppm) | Drone filter brightness | Linear over the record's min–max; silent before 1958 |

The pitch mapping is monotonic: a higher anomaly never produces a lower note.

## Limitations

| Limitation | Effect |
|---|---|
| Pitch quantization | Small differences (< ~0.2 °C) can share a note — exact values shown on hover |
| Base-period updates | Historical ONI values can be revised slightly when NOAA updates |
| Recent months | Latest ONI values are preliminary |
| Sonification | Conveys patterns, not statistics; no claims are made from audio alone |
