"""GeoCLIP model — lazy load on first use, auto-unload after idle timeout."""

import gc
import logging
import threading
import time
from io import BytesIO

import torch

from app.config import settings

logger = logging.getLogger(__name__)

_model = None
_loaded = False
_lock = threading.Lock()
_last_used = 0.0
_timer: threading.Timer | None = None


def _schedule_unload() -> None:
    global _timer
    if _timer:
        _timer.cancel()
    _timer = threading.Timer(settings.model_idle_timeout, _check_idle)
    _timer.daemon = True
    _timer.start()


def _check_idle() -> None:
    elapsed = time.time() - _last_used
    if elapsed < settings.model_idle_timeout:
        _schedule_unload()
        return
    unload()


def _ensure_loaded() -> None:
    global _model, _loaded, _last_used
    with _lock:
        _last_used = time.time()
        if _loaded and _model is not None:
            _schedule_unload()
            return
        logger.info("Loading GeoCLIP model...")
        try:
            from geoclip import GeoCLIP

            _model = GeoCLIP()
            _loaded = True
            logger.info("GeoCLIP loaded and ready")
            _schedule_unload()
        except Exception:
            logger.exception("Failed to load GeoCLIP")
            _loaded = False


def unload() -> None:
    """Unload model to free RAM."""
    global _model, _loaded
    with _lock:
        if not _loaded:
            return
        logger.info("Unloading GeoCLIP to free RAM")
        _model = None
        _loaded = False
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def load() -> None:
    """Called at startup — lazy, actual load on first predict."""
    logger.info("GeoCLIP will load on first use (lazy)")


def is_loaded() -> bool:
    return _loaded


def predict(image_bytes: bytes, top_k: int = 5) -> list[dict]:
    _ensure_loaded()
    if _model is None:
        raise RuntimeError("GeoCLIP model failed to load")

    with torch.no_grad():
        top_pred_gps, top_pred_prob = _model.predict(BytesIO(image_bytes), top_k=top_k)

    results: list[dict] = []
    for i in range(len(top_pred_gps)):
        results.append(
            {
                "rank": i + 1,
                "lat": round(float(top_pred_gps[i][0]), 6),
                "lon": round(float(top_pred_gps[i][1]), 6),
                "probability": round(float(top_pred_prob[i]), 6),
            }
        )
    return results
