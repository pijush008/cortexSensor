"""
SHM engineering service.

Isolated from the web/API tier on purpose (§74): spectral estimation is CPU
bound and belongs in a process that can be scaled, profiled and upgraded
independently of request handling. It holds no database credentials and no
tenant context — it receives samples and returns numbers, and the API decides
who was allowed to ask.
"""

from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from shm.spectral import (
    ENGINE_VERSION,
    compare_to_baseline,
    compute_spectrum,
)

app = FastAPI(
    title="SHM Engineering Service",
    version=ENGINE_VERSION,
    description=(
        "Spectral estimation for structural monitoring. Reports measurements "
        "and their limitations; it does not diagnose structural condition."
    ),
)


class SpectrumRequest(BaseModel):
    samples: list[float] = Field(..., min_length=16)
    # Required, not optional: without it the frequency axis is meaningless, and
    # guessing a default would silently mislabel every peak.
    sample_rate_hz: float = Field(..., gt=0)
    window: Literal["hann", "hamming", "blackman", "boxcar", "flattop"] = "hann"
    detrend: Literal["constant", "linear", "none"] = "linear"
    segment_length: int | None = Field(default=None, gt=0)
    overlap: float = Field(default=0.5, ge=0.0, lt=1.0)
    max_peaks: int = Field(default=8, ge=1, le=64)
    min_prominence_ratio: float = Field(default=0.05, gt=0.0, le=1.0)


class BaselineCompareRequest(BaseModel):
    current_peaks: list[dict[str, Any]]
    baseline_peaks: list[dict[str, Any]]
    tolerance_hz: float | None = Field(default=None, gt=0)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "shm-engine", "version": ENGINE_VERSION}


@app.post("/spectrum")
def spectrum(request: SpectrumRequest) -> dict[str, Any]:
    """Welch PSD with windowing and detrending, plus peak identification."""
    try:
        result = compute_spectrum(
            request.samples,
            request.sample_rate_hz,
            window=request.window,
            detrend=request.detrend,
            segment_length=request.segment_length,
            overlap=request.overlap,
            max_peaks=request.max_peaks,
            min_prominence_ratio=request.min_prominence_ratio,
        )
    except ValueError as exc:
        # A bad request, not a server fault: the caller sent data the method
        # cannot be applied to.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result.to_dict()


@app.post("/baseline/compare")
def baseline_compare(request: BaselineCompareRequest) -> dict[str, Any]:
    return compare_to_baseline(
        request.current_peaks,
        request.baseline_peaks,
        tolerance_hz=request.tolerance_hz,
    )
