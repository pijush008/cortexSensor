"""
The gRPC face, tested without a network.

The servicer is called directly: what is under test is the mapping between
protobuf messages and the engine's own types, not grpc's transport. The
mathematics is covered by test_spectral.py and is deliberately not re-tested
here — if these two files ever disagree about a number, the mapping is wrong.
"""

import math
import unittest
from unittest.mock import Mock

import grpc

from grpc_server import EngineServicer
from proto import engine_pb2
from shm.spectral import compute_spectrum


def sine(n: int, fs: float = 100.0) -> list[float]:
    return [
        math.sin(2 * math.pi * 3.0 * (i / fs)) + 0.3 * math.sin(2 * math.pi * 11.0 * (i / fs))
        for i in range(n)
    ]


class SpectrumOverGrpc(unittest.TestCase):
    def setUp(self) -> None:
        self.servicer = EngineServicer()
        self.context = Mock()

    def test_it_returns_what_the_engine_computed(self) -> None:
        samples = sine(2048)
        expected = compute_spectrum(samples, 100.0).to_dict()

        response = self.servicer.Spectrum(
            engine_pb2.SpectrumRequest(samples=samples, sample_rate_hz=100.0),
            self.context,
        )

        self.assertEqual(response.engine_version, expected["engine_version"])
        self.assertEqual(response.sample_count, expected["sample_count"])
        self.assertEqual(len(response.psd), len(expected["psd"]))
        for got, want in zip(response.psd, expected["psd"]):
            self.assertAlmostEqual(got, want, places=12)
        self.assertEqual(list(response.limitations), expected["limitations"])

    def test_an_unset_option_means_the_engine_default_not_zero(self) -> None:
        # segment_length is absent here. A zero would be invalid, so the
        # servicer must omit it rather than pass one through.
        response = self.servicer.Spectrum(
            engine_pb2.SpectrumRequest(samples=sine(2048), sample_rate_hz=100.0),
            self.context,
        )
        self.assertGreater(response.segment_length, 0)

    def test_a_chosen_option_is_honoured(self) -> None:
        response = self.servicer.Spectrum(
            engine_pb2.SpectrumRequest(
                samples=sine(2048), sample_rate_hz=100.0, segment_length=512
            ),
            self.context,
        )
        self.assertEqual(response.segment_length, 512)

    def test_an_unmeasurable_damping_ratio_is_absent_not_zero(self) -> None:
        """
        proto3 scalars have no null. An unresolved damping ratio must therefore
        be an ABSENT optional field — arriving as 0.0 would read as "no
        damping", which is a different and false claim.
        """
        expected = compute_spectrum(sine(2048), 100.0).to_dict()
        response = self.servicer.Spectrum(
            engine_pb2.SpectrumRequest(samples=sine(2048), sample_rate_hz=100.0),
            self.context,
        )
        for got, want in zip(response.peaks, expected["peaks"]):
            if want["damping_ratio"] is None:
                self.assertFalse(got.HasField("damping_ratio"))
            else:
                self.assertAlmostEqual(got.damping_ratio, want["damping_ratio"], places=12)

    def test_data_the_method_cannot_be_applied_to_is_refused(self) -> None:
        self.servicer.Spectrum(
            engine_pb2.SpectrumRequest(samples=[1.0, 2.0, 3.0], sample_rate_hz=100.0),
            self.context,
        )
        # A caller's mistake, not a server fault — the same distinction the
        # HTTP face draws with 400 rather than 500.
        self.context.abort.assert_called_once()
        self.assertEqual(self.context.abort.call_args[0][0], grpc.StatusCode.INVALID_ARGUMENT)


class CompareOverGrpc(unittest.TestCase):
    def setUp(self) -> None:
        self.servicer = EngineServicer()
        self.context = Mock()

    def test_peaks_survive_the_round_trip_into_a_comparison(self) -> None:
        spectrum = self.servicer.Spectrum(
            engine_pb2.SpectrumRequest(samples=sine(2048), sample_rate_hz=100.0),
            self.context,
        )
        response = self.servicer.CompareToBaseline(
            engine_pb2.CompareRequest(
                current_peaks=spectrum.peaks, baseline_peaks=spectrum.peaks
            ),
            self.context,
        )
        # Compared against itself: every peak matches and nothing has shifted.
        self.assertEqual(len(response.matched), len(spectrum.peaks))
        for match in response.matched:
            self.assertAlmostEqual(match.shift_hz, 0.0, places=12)
            self.assertFalse(match.exceeds_resolution)

    def test_every_comparison_carries_its_caveat(self) -> None:
        response = self.servicer.CompareToBaseline(
            engine_pb2.CompareRequest(), self.context
        )
        # The numbers must never arrive without it.
        self.assertIn("not diagnosed", response.interpretation)


if __name__ == "__main__":
    unittest.main()
