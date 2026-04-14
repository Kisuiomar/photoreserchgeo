"""GeoCLIP model. Lazy load on first use, auto-unload after idle timeout."""

import gc
import logging
import os
import threading
import time
from io import BytesIO

import torch

from app.config import settings

logger = logging.getLogger(__name__)

_model = None
_loaded = False
_downloaded = False  # becomes True once the model files exist on disk
_in_use_count = 0  # atomic-ish counter for concurrent inference calls
_lock = threading.Lock()
_last_used = 0.0
_timer: threading.Timer | None = None


def is_downloaded() -> bool:
    """Check whether the GeoCLIP model weights exist locally.

    The geoclip package caches weights under the user's home directory.
    We probe a small set of likely cache paths.
    """
    global _downloaded
    if _downloaded:
        return True
    # Check common cache locations
    candidates = [
        os.path.expanduser("~/.cache/huggingface/hub/models--Geolocal--GeoCLIP"),
        os.path.expanduser("~/.cache/geoclip"),
        os.path.expanduser("~/.cache/torch/hub/checkpoints"),
    ]
    for c in candidates:
        if os.path.isdir(c) and os.listdir(c):
            _downloaded = True
            return True
    # If the package's install dir has the weights, count it as downloaded
    try:
        import geoclip

        pkg_dir = os.path.dirname(geoclip.__file__)
        weights_dir = os.path.join(pkg_dir, "weights")
        if os.path.isdir(weights_dir) and os.listdir(weights_dir):
            _downloaded = True
            return True
    except Exception:
        pass
    return False


def is_in_use() -> bool:
    return _in_use_count > 0


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
    global _in_use_count, _downloaded
    _ensure_loaded()
    if _model is None:
        raise RuntimeError("GeoCLIP model failed to load")

    _downloaded = True  # if we got here, weights definitely exist
    _in_use_count += 1
    try:
        with torch.no_grad():
            top_pred_gps, top_pred_prob = _model.predict(
                BytesIO(image_bytes), top_k=top_k
            )

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
    finally:
        _in_use_count = max(0, _in_use_count - 1)
