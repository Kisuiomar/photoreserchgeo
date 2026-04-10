"""Enhanced prediction: GeoCLIP + library context hints.

Pipeline (lean):
  1. Library hint check — strong hint (burst/companion) → skip inference
  2. GeoCLIP inference (single pass, no TTA)
  3. Weak hint re-ranking (multiplicative, same-day/interpolation/folder)

All removed features (StreetCLIP, CLIP scene priors, VLM, TTA) were
benchmarked on 41 real photos and found to WORSEN median accuracy
(224km → 310km). GeoCLIP alone with library context is optimal.
"""

import logging
import math

from app import model
from app.distance import haversine

logger = logging.getLogger(__name__)

_STRONG_HINT_THRESHOLD = 0.85


def _apply_hint(predictions: list[dict], hint: dict, top_k: int) -> list[dict]:
    """Multiplicative re-ranking from a library context hint."""
    sigma = hint["sigma_km"]
    conf = hint["confidence"]

    for pred in predictions:
        dist = haversine(pred["lat"], pred["lon"], hint["lat"], hint["lon"])
        gaussian = math.exp(-(dist**2) / (2 * sigma**2)) if sigma > 0 else 0
        pred["probability"] *= 1.0 + conf * gaussian

    predictions.sort(key=lambda p: p["probability"], reverse=True)
    total = sum(p["probability"] for p in predictions)
    for i, p in enumerate(predictions):
        p["rank"] = i + 1
        p["probability"] = round(p["probability"] / total, 6) if total > 0 else 0

    return predictions[:top_k]


def predict_enhanced(
    image_bytes: bytes,
    top_k: int = 5,
    hint: dict | None = None,
) -> list[dict]:
    """GeoCLIP prediction with optional library context hint.

    Args:
        image_bytes: Raw image file bytes.
        top_k: Number of predictions to return.
        hint: Optional location hint from library context.
            If confidence >= 0.85, inference is skipped entirely.
    """
    # Stage 1: strong hint → skip inference
    if hint and hint.get("confidence", 0) >= _STRONG_HINT_THRESHOLD:
        logger.info(
            "Strong %s hint (conf=%.2f) — using directly",
            hint["source"],
            hint["confidence"],
        )
        return [
            {
                "rank": 1,
                "lat": round(hint["lat"], 6),
                "lon": round(hint["lon"], 6),
                "probability": round(hint["confidence"], 6),
            }
        ]

    # Stage 2: GeoCLIP inference
    predictions = model.predict(image_bytes, top_k=top_k)

    # Stage 3: weak hint re-ranking (multiplicative only)
    if hint and hint.get("confidence", 0) > 0:
        logger.info(
            "Applying %s hint (conf=%.2f, sigma=%.0fkm)",
            hint["source"],
            hint["confidence"],
            hint["sigma_km"],
        )
        predictions = _apply_hint(predictions, hint, top_k)

    return predictions
