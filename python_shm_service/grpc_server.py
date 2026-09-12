"""
The engine's gRPC face.

Transport only. Every number here comes from shm.spectral, which the HTTP API
also calls — the two faces cannot diverge numerically because neither contains
any mathematics.

Why gRPC at all: the request is a raw array of doubles, and JSON measured
slower than the computation it carries. For a 60,000-sample window, encoding
and parsing JSON cost about 62 ms against 22 ms of actual spectral estimation,
and the payload was 2.4x larger. Packed doubles are a memcpy.

Runs alongside FastAPI rather than replacing it, so the HTTP path stays
available and switching back is an environment variable rather than a deploy.
"""

from __future__ import annotations

import logging
import os
from concurrent import futures

import grpc

from shm.spectral import ENGINE_VERSION, compare_to_baseline, compute_spectrum

from proto import engine_pb2, engine_pb2_grpc

logger = logging.getLogger(__name__)

# proto3 enums carry an UNSPECIFIED zero value, which here means "the caller
# did not choose" — mapped to the same defaults the HTTP API applies.
_WINDOWS = {
    engine_pb2.WINDOW_UNSPECIFIED: "hann",
    engine_pb2.WINDOW_HANN: "hann",
    engine_pb2.WINDOW_HAMMING: "hamming",
    engine_pb2.WINDOW_BLACKMAN: "blackman",
    engine_pb2.WINDOW_BOXCAR: "boxcar",
    engine_pb2.WINDOW_FLATTOP: "flattop",
}

_DETREND = {
    engine_pb2.DETREND_UNSPECIFIED: "linear",
    engine_pb2.DETREND_CONSTANT: "constant",
    engine_pb2.DETREND_LINEAR: "linear",
    engine_pb2.DETREND_NONE: "none",
}


def _peak_to_message(peak: dict) -> engine_pb2.Peak:
    """
    A peak as the wire carries it.

    bandwidth_hz and damping_ratio are optional fields rather than zeros: an
    unresolved damping ratio is UNKNOWN, and a zero would read as "no damping",
    which is a different and false claim.
    """
    message = engine_pb2.Peak(
        frequency_hz=peak["frequency_hz"],
        magnitude=peak["magnitude"],
        prominence=peak["prominence"],
        resolution_hz=peak["resolution_hz"],
    )
    if peak.get("bandwidth_hz") is not None:
        message.bandwidth_hz = peak["bandwidth_hz"]
    if peak.get("damping_ratio") is not None:
        message.damping_ratio = peak["damping_ratio"]
    return message


def _peak_to_dict(message: engine_pb2.Peak) -> dict:
    """The inverse, for the comparison call, which takes peaks back in."""
    return {
        "frequency_hz": message.frequency_hz,
        "magnitude": message.magnitude,
        "prominence": message.prominence,
        "bandwidth_hz": message.bandwidth_hz if message.HasField("bandwidth_hz") else None,
        "damping_ratio": message.damping_ratio if message.HasField("damping_ratio") else None,
        "resolution_hz": message.resolution_hz,
    }


class EngineServicer(engine_pb2_grpc.EngineServicer):
    def Health(self, request, context):
        return engine_pb2.HealthResponse(
            status="ok", service="shm-engine", version=ENGINE_VERSION
        )

    def Spectrum(self, request, context):
        # Optional scalars: absent means "engine default", which is not the
        # same as zero — a segment_length of 0 is invalid, not a default.
        kwargs = {}
        if request.HasField("segment_length"):
            kwargs["segment_length"] = request.segment_length
        if request.HasField("overlap"):
            kwargs["overlap"] = request.overlap
        if request.HasField("max_peaks"):
            kwargs["max_peaks"] = request.max_peaks
        if request.HasField("min_prominence_ratio"):
            kwargs["min_prominence_ratio"] = request.min_prominence_ratio

        try:
            result = compute_spectrum(
                list(request.samples),
                request.sample_rate_hz,
                window=_WINDOWS[request.window],
                detrend=_DETREND[request.detrend],
                **kwargs,
            )
        except ValueError as exc:
            # Data the method cannot be applied to is the caller's mistake, not
            # a server fault — the same distinction the HTTP face draws with
            # 400 rather than 500.
            #
            # abort() raises inside a real gRPC context, so the return below is
            # unreachable in production. It is here so the control flow does not
            # DEPEND on that side effect: without it, any caller holding a
            # context that merely records the abort carries on to use `result`,
            # which is unbound. Explicit beats implicit for an error path.
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
            return engine_pb2.SpectrumResponse()

        payload = result.to_dict()
        return engine_pb2.SpectrumResponse(
            engine_version=payload["engine_version"],
            method=payload["method"],
            sample_rate_hz=payload["sample_rate_hz"],
            window=payload["window"],
            detrend=payload["detrend"],
            segment_length=payload["segment_length"],
            overlap=payload["overlap"],
            frequency_resolution_hz=payload["frequency_resolution_hz"],
            sample_count=payload["sample_count"],
            duration_seconds=payload["duration_seconds"],
            frequencies_hz=payload["frequencies_hz"],
            psd=payload["psd"],
            peaks=[_peak_to_message(p) for p in payload["peaks"]],
            limitations=payload["limitations"],
            warnings=payload["warnings"],
        )

    def CompareToBaseline(self, request, context):
        tolerance = request.tolerance_hz if request.HasField("tolerance_hz") else None
        payload = compare_to_baseline(
            [_peak_to_dict(p) for p in request.current_peaks],
            [_peak_to_dict(p) for p in request.baseline_peaks],
            tolerance_hz=tolerance,
        )
        return engine_pb2.CompareResponse(
            engine_version=payload["engine_version"],
            matched=[engine_pb2.MatchedPeak(**m) for m in payload["matched"]],
            unmatched_current_hz=payload["unmatched_current_hz"],
            unmatched_baseline_hz=payload["unmatched_baseline_hz"],
            interpretation=payload["interpretation"],
        )


def serve(port: int | None = None, block: bool = True) -> grpc.Server:
    port = port or int(os.environ.get("GRPC_PORT", "50051"))

    # A large inbound limit: the point of this service is long sample windows,
    # and gRPC's 4 MB default would refuse exactly the records that motivated
    # moving off JSON. 240,000 samples is ~1.9 MB packed, so 64 MB leaves room.
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=8),
        options=[
            ("grpc.max_receive_message_length", 64 * 1024 * 1024),
            ("grpc.max_send_message_length", 64 * 1024 * 1024),
        ],
    )
    engine_pb2_grpc.add_EngineServicer_to_server(EngineServicer(), server)
    server.add_insecure_port(f"0.0.0.0:{port}")
    server.start()
    logger.info("SHM engine gRPC listening on %s", port)
    if block:
        server.wait_for_termination()
    return server


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    serve()
