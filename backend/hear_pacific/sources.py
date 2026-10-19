"""Fetch and parse NOAA climate records."""

import requests

ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
CO2_URL = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv"

# ONI seasons are labeled by their three months; the middle month is the center.
SEASON_CENTER_MONTH = {
    "DJF": 1, "JFM": 2, "FMA": 3, "MAM": 4, "AMJ": 5, "MJJ": 6,
    "JJA": 7, "JAS": 8, "ASO": 9, "SON": 10, "OND": 11, "NDJ": 12,
}


def _get(url: str, timeout: float = 15.0) -> str:
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.text


def parse_oni(text: str) -> list[dict]:
    """Parse CPC's oni.ascii.txt (columns: SEAS YR TOTAL ANOM)."""
    rows = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 4 or parts[0] not in SEASON_CENTER_MONTH:
            continue
        season, year, total, anom = parts
        rows.append({
            "season": season,
            "year": int(year),
            "month": SEASON_CENTER_MONTH[season],
            "sst_c": float(total),
            "anomaly_c": float(anom),
        })
    return rows


def parse_co2(text: str) -> list[dict]:
    """Parse GML's co2_mm_mlo.csv (comment lines start with '#')."""
    rows = []
    for line in text.splitlines():
        if not line or line.startswith("#") or line.startswith("year"):
            continue
        parts = line.split(",")
        ppm = float(parts[3])
        if ppm < 0:  # -99.99 marks missing months
            continue
        rows.append({"year": int(parts[0]), "month": int(parts[1]), "co2_ppm": ppm})
    return rows


def fetch_oni() -> list[dict]:
    return parse_oni(_get(ONI_URL))


def fetch_co2() -> list[dict]:
    return parse_co2(_get(CO2_URL))
