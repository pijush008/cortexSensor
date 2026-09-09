"""
Spectral analysis for structural monitoring.

Scope, stated plainly
---------------------
This module estimates a power spectral density, identifies peaks in it, and
produces a damping estimate per peak from the half-power bandwidth. That is a
legitimate and widely used approach for ambient vibration data.

It is NOT operational modal analysis. Peak-picking assumes well-separated,
lightly-damped modes and a broadband excitation; it cannot resolve closely
spaced modes, it cannot produce mode shapes from a single channel, and the
half-power damping estimate is biased by leakage and by averaging. Every result
carries these limitations so an engineer reading a number knows what produced
it (§35, §36, §88).

Nothing here decides whether a structure is damaged. A frequency shift has many
ordinary causes — temperature, traffic mass, support conditions, sensor
mounting — and separating those from structural change requires baseline and
environmental context that lives above this layer (§37, §103).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict, field
from typing import Any

import numpy as np
from scipy import signal

# Bumped when the numerical behaviour of this module changes, so a stored
# result can always be traced to the code that produced it (§38, §103).
ENGINE_VERSION = "1.0.0"

SUPPORTED_WINDOWS = ("hann", "hamming", "blackman", "boxcar", "flattop")
SUPPORTED_DETREND = ("constant", "linear", "none")


@dataclass
class Peak:
    frequency_hz: float
    magnitude: float
    """Prominence relative to the local spectrum — how much the peak stands out."""
    prominence: float
    """Half-power (-3 dB) bandwidth, the basis of the damping estimate."""
    bandwidth_hz: float | None
    """Damping ratio from bandwidth / (2 * f). None when bandwidth is unresolved."""
    damping_ratio: float | None
    """Frequency resolution of the estimate: one FFT bin. A peak cannot be
    located more precisely than this, and reporting it prevents a spurious
    claim of a 0.001 Hz shift when bins are 0.05 Hz wide."""
    resolution_hz: float


@dataclass
class SpectrumResult:
    engine_version: str
    method: str
    sample_rate_hz: float
    window: str
    detrend: str
    segment_length: int
    overlap: float
    frequency_resolution_hz: float
    sample_count: int
    duration_seconds: float
    frequencies_hz: list[float]
    psd: list[float]
    peaks: list[Peak]
    limitations: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["peaks"] = [asdict(p) if not isinstance(p, dict) else p for p in self.peaks]
        return payload


def _validate(samples: np.ndarray, sample_rate_hz: float) -> list[str]:
    warnings: list[str] = []

    if sample_rate_hz <= 0:
        raise ValueError("sample_rate_hz must be positive")
    if samples.size < 16:
        raise ValueError(
            "At least 16 samples are required to estimate a spectrum"
        )

    finite = np.isfinite(samples)
    if not finite.all():
        # Non-finite values would poison the whole transform. They are counted
        # and reported rather than silently zero-filled, because "we replaced
        # 40% of your data" is something the engineer must know.
        warnings.append(
            f"{int((~finite).sum())} non-finite sample(s) were excluded"
        )

    if samples.size < 256:
        warnings.append(
            "Short record: frequency resolution is coarse and damping estimates "
            "are unreliable below a few hundred samples"
        )

    return warnings


def compute_spectrum(
    samples: list[float] | np.ndarray,
    sample_rate_hz: float,
    *,
    window: str = "hann",
    detrend: str = "linear",
    segment_length: int | None = None,
    overlap: float = 0.5,
    max_peaks: int = 8,
    min_prominence_ratio: float = 0.05,
) -> SpectrumResult:
    """
    Welch power spectral density plus peak identification.

    Welch rather than a single periodogram: averaging overlapping segments
    trades frequency resolution for a large reduction in variance, and a raw
    periodogram of ambient data is far too noisy for peaks to be picked
    reliably.

    Detrending defaults to linear because thermal drift puts a ramp on a strain
    record, and an untreated ramp dominates the low-frequency end of the
    spectrum and buries the structural content.
    """
    values = np.asarray(samples, dtype=float)
    warnings = _validate(values, sample_rate_hz)

    values = values[np.isfinite(values)]
    if values.size < 16:
        raise ValueError("Too few finite samples remain to estimate a spectrum")

    if window not in SUPPORTED_WINDOWS:
        raise ValueError(f"window must be one of {SUPPORTED_WINDOWS}")
    if detrend not in SUPPORTED_DETREND:
        raise ValueError(f"detrend must be one of {SUPPORTED_DETREND}")
    if not 0.0 <= overlap < 1.0:
        raise ValueError("overlap must be in [0, 1)")

    # Default to 8 averaging segments, a common compromise between variance
    # and resolution, clamped so a short record still yields something.
    nperseg = segment_length or min(values.size, max(256, values.size // 8))
    nperseg = int(min(nperseg, values.size))
    noverlap = int(nperseg * overlap)

    frequencies, psd = signal.welch(
        values,
        fs=sample_rate_hz,
        window=window,
        nperseg=nperseg,
        noverlap=noverlap,
        detrend=False if detrend == "none" else detrend,
        scaling="density",
    )

    resolution = float(sample_rate_hz / nperseg)
    peaks = _find_peaks(frequencies, psd, resolution, max_peaks, min_prominence_ratio)

    limitations = [
        "Peak-picking assumes well-separated, lightly damped modes under "
        "broadband excitation; closely spaced modes may appear as one peak.",
        "Damping is estimated from the half-power bandwidth and is biased by "
        "spectral leakage and by Welch averaging; treat it as indicative.",
        "A single channel cannot yield mode shapes. Frequencies alone do not "
        "identify a mode.",
        f"Frequencies are resolved to +/- {resolution:.4f} Hz; differences "
        "smaller than one bin are not measurable.",
    ]

    return SpectrumResult(
        engine_version=ENGINE_VERSION,
        method="welch-psd+peak-picking",
        sample_rate_hz=float(sample_rate_hz),
        window=window,
        detrend=detrend,
        segment_length=nperseg,
        overlap=float(overlap),
        frequency_resolution_hz=resolution,
        sample_count=int(values.size),
        duration_seconds=float(values.size / sample_rate_hz),
        frequencies_hz=[float(f) for f in frequencies],
        psd=[float(p) for p in psd],
        peaks=peaks,
        limitations=limitations,
        warnings=warnings,
    )


def _find_peaks(
    frequencies: np.ndarray,
    psd: np.ndarray,
    resolution: float,
    max_peaks: int,
    min_prominence_ratio: float,
) -> list[Peak]:
    if psd.size == 0 or not np.isfinite(psd).any():
        return []

    # The DC bin is excluded: a residual mean or an unremoved trend always
    # produces a large peak at 0 Hz that is an artefact, not a mode.
    search = psd.copy()
    search[0] = 0.0

    peak_span = float(np.nanmax(search))
    if peak_span <= 0:
        return []

    indices, properties = signal.find_peaks(
        search,
        prominence=peak_span * min_prominence_ratio,
    )
    if indices.size == 0:
        return []

    # Half-power width, measured at the -3 dB point (half the power).
    widths, _, left_ips, right_ips = signal.peak_widths(
        search, indices, rel_height=0.5
    )

    order = np.argsort(properties["prominences"])[::-1][:max_peaks]

    results: list[Peak] = []
    for rank in order:
        index = int(indices[rank])
        frequency = float(frequencies[index])
        if frequency <= 0:
            continue

        bandwidth = float(widths[rank] * resolution)
        # Damping from the half-power bandwidth: zeta ~= dF / (2 * f0).
        # Only meaningful when the peak is wider than a single bin — below that
        # the "width" is an artefact of the grid, not of the structure.
        damping = (
            float(bandwidth / (2.0 * frequency))
            if bandwidth > resolution and frequency > 0
            else None
        )

        results.append(
            Peak(
                frequency_hz=frequency,
                magnitude=float(search[index]),
                prominence=float(properties["prominences"][rank]),
                bandwidth_hz=bandwidth if bandwidth > resolution else None,
                damping_ratio=damping,
                resolution_hz=resolution,
            )
        )

    results.sort(key=lambda p: p.frequency_hz)
    return results


def compare_to_baseline(
    current_peaks: list[dict[str, Any]],
    baseline_peaks: list[dict[str, Any]],
    *,
    tolerance_hz: float | None = None,
) -> dict[str, Any]:
    """
    Matches current peaks to a baseline and reports the shift in each.

    Reports a change; it does NOT interpret one. A drop in natural frequency is
    consistent with reduced stiffness, but it is equally consistent with a
    temperature rise, added mass from traffic, or a changed support condition.
    The output therefore states the shift, the resolution it was measured at,
    and whether that shift exceeds measurement resolution — and stops there
    (§35, §88).
    """
    matched: list[dict[str, Any]] = []
    unmatched_current: list[float] = []
    baseline_used: set[int] = set()

    for current in current_peaks:
        f_current = float(current["frequency_hz"])
        resolution = float(current.get("resolution_hz") or 0.0)
        # Default matching window: 5% of frequency, but never finer than the
        # measurement resolution, since a tighter window would claim precision
        # the data does not have.
        window = tolerance_hz if tolerance_hz is not None else max(
            f_current * 0.05, resolution * 2
        )

        best_index: int | None = None
        best_delta = float("inf")
        for index, base in enumerate(baseline_peaks):
            if index in baseline_used:
                continue
            delta = abs(float(base["frequency_hz"]) - f_current)
            if delta < best_delta and delta <= window:
                best_delta = delta
                best_index = index

        if best_index is None:
            unmatched_current.append(f_current)
            continue

        baseline_used.add(best_index)
        f_base = float(baseline_peaks[best_index]["frequency_hz"])
        shift = f_current - f_base
        percent = (shift / f_base * 100.0) if f_base else None

        matched.append(
            {
                "baseline_frequency_hz": f_base,
                "current_frequency_hz": f_current,
                "shift_hz": shift,
                "shift_percent": percent,
                "resolution_hz": resolution,
                # The only judgement made here: is the change larger than what
                # the measurement can resolve? Anything smaller is noise.
                "exceeds_resolution": abs(shift) > max(resolution, 1e-12),
            }
        )

    return {
        "engine_version": ENGINE_VERSION,
        "matched": matched,
        "unmatched_current_hz": unmatched_current,
        "unmatched_baseline_hz": [
            float(b["frequency_hz"])
            for i, b in enumerate(baseline_peaks)
            if i not in baseline_used
        ],
        "interpretation": (
            "Frequency shifts are reported, not diagnosed. A shift is "
            "consistent with a stiffness change but also with temperature, "
            "mass loading, support conditions or sensor mounting. Correlate "
            "with environmental data and inspection before drawing an "
            "engineering conclusion."
        ),
    }
