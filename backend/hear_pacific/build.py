"""Build the score file consumed by the frontend player."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from . import mapping, sources

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "score.json"


def build_score(oni: list[dict], co2: list[dict]) -> dict:
    co2_by_month = {(r["year"], r["month"]): r["co2_ppm"] for r in co2}
    co2_values = list(co2_by_month.values())
    co2_min, co2_max = min(co2_values), max(co2_values)

    notes = []
    for r in oni:
        midi, clipped = mapping.anomaly_to_midi(r["anomaly_c"])
        ppm = co2_by_month.get((r["year"], r["month"]))
        notes.append({
            "year": r["year"],
            "season": r["season"],
            "anomaly_c": r["anomaly_c"],
            "midi": midi,
            "clipped": clipped,
            "phase": mapping.enso_phase(r["anomaly_c"]),
            "co2_ppm": ppm,
            "co2_level": None if ppm is None else mapping.scale_linear(ppm, co2_min, co2_max),
        })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": {"oni": sources.ONI_URL, "co2": sources.CO2_URL},
        "mapping": {
            "oni_range_c": mapping.ONI_RANGE_C,
            "threshold_c": mapping.EL_NINO_THRESHOLD_C,
            "scale": "pentatonic",
            "base_midi": mapping.BASE_MIDI_NOTE,
            "octaves": mapping.OCTAVES,
        },
        "notes": notes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    score = build_score(sources.fetch_oni(), sources.fetch_co2())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(score, indent=1))
    print(f"Wrote {len(score['notes'])} notes to {args.out}")


if __name__ == "__main__":
    main()
