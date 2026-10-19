"""Data-to-sound mapping. See docs/SCIENCE.md for the rules."""

import math

PENTATONIC = (0, 2, 4, 7, 9)
ONI_RANGE_C = (-3.0, 3.0)
EL_NINO_THRESHOLD_C = 0.5
BASE_MIDI_NOTE = 48  # C3
OCTAVES = 3

_STEPS = [o * 12 + d for o in range(OCTAVES) for d in PENTATONIC] + [OCTAVES * 12]


def anomaly_to_midi(anomaly_c: float) -> tuple[int, bool]:
    """Map an ONI anomaly to a MIDI note. Returns (note, clipped)."""
    lo, hi = ONI_RANGE_C
    clipped = not lo <= anomaly_c <= hi
    frac = (min(max(anomaly_c, lo), hi) - lo) / (hi - lo)
    # Round half up (not Python's half-to-even) to match the frontend's Math.round.
    return BASE_MIDI_NOTE + _STEPS[math.floor(frac * (len(_STEPS) - 1) + 0.5)], clipped


def enso_phase(anomaly_c: float) -> str:
    """Per-season threshold label (not an official episode classification)."""
    if anomaly_c >= EL_NINO_THRESHOLD_C:
        return "warm"
    if anomaly_c <= -EL_NINO_THRESHOLD_C:
        return "cool"
    return "neutral"


def scale_linear(value: float, vmin: float, vmax: float) -> float:
    """Normalize to [0, 1] for drone parameters."""
    return (value - vmin) / (vmax - vmin) if vmax > vmin else 0.0
