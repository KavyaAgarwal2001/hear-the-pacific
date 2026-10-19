from hear_pacific.sources import parse_co2, parse_oni

ONI_SAMPLE = """\
 SEAS  YR   TOTAL   ANOM
  DJF 1950  24.72  -1.53
  JFM 1950  25.17  -1.34
  OND 2015  29.26   2.64
"""

CO2_SAMPLE = """\
# comment line
year,month,decimal date,average,deseasonalized,ndays,sdev,unc
1958,3,1958.2027,315.71,314.44,-1,-9.99,-0.99
1958,6,1958.4548,-99.99,317.10,-1,-9.99,-0.99
2015,12,2015.9583,401.85,401.39,30,0.55,0.19
"""


def test_parse_oni_skips_header_and_maps_season_center():
    rows = parse_oni(ONI_SAMPLE)
    assert len(rows) == 3
    assert rows[0] == {"season": "DJF", "year": 1950, "month": 1, "sst_c": 24.72, "anomaly_c": -1.53}
    assert rows[2]["month"] == 11


def test_parse_co2_drops_missing_values():
    rows = parse_co2(CO2_SAMPLE)
    assert [(r["year"], r["month"]) for r in rows] == [(1958, 3), (2015, 12)]
