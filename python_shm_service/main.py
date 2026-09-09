from typing import List
from fastapi import FastAPI
import numpy as np

app = FastAPI(title="SHM Processing Service")


@app.post("/fft")
async def compute_fft(samples: List[float]):
    """Compute FFT magnitudes for a time-series sample list.

    Request body: JSON array of numbers.
    Response: list of magnitudes (same length as input / 2)
    """
    if not samples:
        return {"error": "no samples provided"}

    arr = np.asarray(samples, dtype=float)
    # compute FFT and return magnitudes for positive frequencies
    fft = np.fft.rfft(arr)
    mags = np.abs(fft).tolist()
    return {"length": len(arr), "magnitudes": mags}
