from hear_pacific.mapping import anomaly_to_midi, enso_phase


def test_pitch_mapping_is_monotonic():
    anomalies = [x / 10 for x in range(-30, 31)]
    notes = [anomaly_to_midi(a)[0] for a in anomalies]
    assert notes == sorted(notes)


def test_out_of_range_values_are_clipped_and_flagged():
    note_hi, clipped = anomaly_to_midi(3.5)
    assert clipped
    assert note_hi == anomaly_to_midi(3.0)[0]
    assert not anomaly_to_midi(0.0)[1]


def test_enso_phase_thresholds():
    assert enso_phase(0.5) == "warm"
    assert enso_phase(-0.5) == "cool"
    assert enso_phase(0.49) == "neutral"


def test_halfway_values_round_up_like_the_frontend():
    # +0.4 °C sits exactly between steps 8 and 9; JS Math.round picks step 9 (A4).
    assert anomaly_to_midi(0.4)[0] == 69
    assert anomaly_to_midi(-2.0)[0] == 55
