"""
Tests for the spectral engine.

These use synthetic signals with KNOWN frequencies and damping, because that is
the only way to check that the analysis returns the right answer rather than
merely a plausible one.
"""

import math
import unittest

import numpy as np

from shm.spectral import compare_to_baseline, compute_spectrum


def sine(frequency: float, fs: float, seconds: float, amplitude: float = 1.0) -> np.ndarray:
    t = np.arange(0, seconds, 1.0 / fs)
    return amplitude * np.sin(2 * math.pi * frequency * t)


class SpectrumTests(unittest.TestCase):
    def test_a_known_tone_is_found_at_the_right_frequency(self) -> None:
        fs = 200.0
        result = compute_spectrum(sine(12.5, fs, 40), fs)
        self.assertGreater(len(result.peaks), 0)
        dominant = max(result.peaks, key=lambda p: p.magnitude)
        # Within one frequency bin of the truth.
        self.assertAlmostEqual(
            dominant.frequency_hz, 12.5, delta=result.frequency_resolution_hz * 2
        )

    def test_two_separated_tones_are_both_found(self) -> None:
        fs = 200.0
        samples = sine(8.0, fs, 40) + sine(31.0, fs, 40, amplitude=0.8)
        result = compute_spectrum(samples, fs)
        found = sorted(p.frequency_hz for p in result.peaks)
        tolerance = result.frequency_resolution_hz * 3
        self.assertTrue(any(abs(f - 8.0) < tolerance for f in found), found)
        self.assertTrue(any(abs(f - 31.0) < tolerance for f in found), found)

    def test_a_linear_trend_does_not_masquerade_as_a_mode(self) -> None:
        """
        Thermal drift puts a ramp on a strain record. Undetrended, that ramp
        dominates the low-frequency end and buries the structural content.
        """
        fs = 100.0
        t = np.arange(0, 40, 1.0 / fs)
        drifting = sine(10.0, fs, 40) + 0.05 * t

        detrended = compute_spectrum(drifting, fs, detrend="linear")
        dominant = max(detrended.peaks, key=lambda p: p.magnitude)
        self.assertAlmostEqual(
            dominant.frequency_hz, 10.0, delta=detrended.frequency_resolution_hz * 3
        )

    def test_dc_is_never_reported_as_a_peak(self) -> None:
        fs = 100.0
        offset = sine(10.0, fs, 40) + 5.0
        result = compute_spectrum(offset, fs, detrend="none")
        self.assertTrue(all(p.frequency_hz > 0 for p in result.peaks))

    def test_resolution_is_reported_and_matches_the_segment(self) -> None:
        fs = 256.0
        result = compute_spectrum(sine(20.0, fs, 60), fs, segment_length=512)
        self.assertAlmostEqual(result.frequency_resolution_hz, fs / 512, places=9)
        for peak in result.peaks:
            # Every peak carries the precision it was measured at, so nobody
            # can claim a shift smaller than one bin.
            self.assertAlmostEqual(peak.resolution_hz, fs / 512, places=9)

    def test_every_result_states_its_limitations(self) -> None:
        result = compute_spectrum(sine(10.0, 100.0, 20), 100.0)
        joined = " ".join(result.limitations).lower()
        self.assertIn("mode shapes", joined)
        self.assertIn("damping", joined)

    def test_non_finite_samples_are_excluded_and_reported(self) -> None:
        fs = 100.0
        samples = sine(10.0, fs, 20)
        samples[10] = np.nan
        samples[20] = np.inf
        result = compute_spectrum(samples, fs)
        self.assertTrue(any("non-finite" in w for w in result.warnings))

    def test_a_short_record_is_flagged(self) -> None:
        result = compute_spectrum(sine(5.0, 100.0, 1.0), 100.0)
        self.assertTrue(any("short record" in w.lower() for w in result.warnings))

    def test_invalid_input_is_rejected_rather_than_guessed(self) -> None:
        with self.assertRaises(ValueError):
            compute_spectrum([1.0, 2.0], 100.0)
        with self.assertRaises(ValueError):
            compute_spectrum(sine(5.0, 100.0, 5.0), 0)
        with self.assertRaises(ValueError):
            compute_spectrum(sine(5.0, 100.0, 5.0), 100.0, window="triangle")


class BaselineTests(unittest.TestCase):
    def test_a_shift_larger_than_resolution_is_reported_as_such(self) -> None:
        current = [{"frequency_hz": 3.29, "resolution_hz": 0.01}]
        baseline = [{"frequency_hz": 3.42, "resolution_hz": 0.01}]
        result = compare_to_baseline(current, baseline)

        self.assertEqual(len(result["matched"]), 1)
        match = result["matched"][0]
        self.assertAlmostEqual(match["shift_hz"], -0.13, places=6)
        self.assertLess(match["shift_percent"], 0)
        self.assertTrue(match["exceeds_resolution"])

    def test_a_shift_below_resolution_is_not_claimed(self) -> None:
        current = [{"frequency_hz": 3.4201, "resolution_hz": 0.05}]
        baseline = [{"frequency_hz": 3.4200, "resolution_hz": 0.05}]
        result = compare_to_baseline(current, baseline)
        self.assertFalse(result["matched"][0]["exceeds_resolution"])

    def test_unmatched_peaks_are_surfaced_not_dropped(self) -> None:
        current = [{"frequency_hz": 3.4, "resolution_hz": 0.01}, {"frequency_hz": 19.0, "resolution_hz": 0.01}]
        baseline = [{"frequency_hz": 3.4, "resolution_hz": 0.01}, {"frequency_hz": 8.7, "resolution_hz": 0.01}]
        result = compare_to_baseline(current, baseline)
        # A new peak and a vanished peak are both engineering signals.
        self.assertIn(19.0, result["unmatched_current_hz"])
        self.assertIn(8.7, result["unmatched_baseline_hz"])

    def test_the_comparison_refuses_to_diagnose(self) -> None:
        result = compare_to_baseline(
            [{"frequency_hz": 3.0, "resolution_hz": 0.01}],
            [{"frequency_hz": 3.5, "resolution_hz": 0.01}],
        )
        note = result["interpretation"].lower()
        self.assertIn("not diagnosed", note)
        self.assertIn("temperature", note)


if __name__ == "__main__":
    unittest.main()
