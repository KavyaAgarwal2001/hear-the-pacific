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
