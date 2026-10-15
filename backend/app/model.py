"""GeoCLIP model.

The model is downloaded and loaded synchronously during backend startup
(see ``load()``). Once started, it stays resident in RAM for the life of
the process; ``unload()`` is exposed for the "Free RAM" button in the UI.

FUTURE FEATURE: idle auto-unload. The timer plumbing below (``_schedule_unload``,
``_check_idle``, ``settings.model_idle_timeout``) is retained so the model can
be automatically evicted after a period of inactivity. We keep it disabled for
now since the app is typically run on a personal machine where holding the
weights resident is fine.
"""

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
_in_use_count = 0  # concurrent inference counter, for future "in use" dot
_lock = threading.Lock()
_last_used = 0.0
_timer: threading.Timer | None = None

_HF_CACHE_ROOT = os.path.expanduser("~/.cache/huggingface")


def _dir_size(path: str) -> int:
    if not os.path.isdir(path):
        return 0
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                continue
    return total


def is_downloaded() -> bool:
    """Return True when the GeoCLIP + CLIP-L backbone weights are fully cached.

    GeoCLIP's own tensors ship with the pip package; the CLIP-L backbone is
    pulled from HuggingFace on first use and lands in
    ``~/.cache/huggingface/hub``. We require at least 1 GB so a partial
    download in progress isn't misreported as complete.
    """
    if _loaded:
        return True

    have_geoclip_weights = False
    try:
        import geoclip

        pkg_dir = os.path.dirname(geoclip.__file__)
        for candidate in (
            os.path.join(pkg_dir, "model", "weights"),
            os.path.join(pkg_dir, "weights"),
        ):
            if os.path.isdir(candidate):
                files = [
                    f
                    for f in os.listdir(candidate)
                    if f.endswith((".pt", ".pth", ".bin", ".safetensors"))
                ]
                if files:
                    have_geoclip_weights = True
                    break
    except Exception:
        pass

    _MIN_BACKBONE_BYTES = 1_000_000_000
    hf_candidates = [
        os.path.expanduser(
            "~/.cache/huggingface/hub/models--openai--clip-vit-large-patch14"
        ),
        os.path.expanduser(
            "~/.cache/huggingface/hub/models--openai--clip-vit-base-patch32"
        ),
    ]
    have_clip_backbone = any(
        os.path.isdir(c) and _dir_size(c) >= _MIN_BACKBONE_BYTES for c in hf_candidates
    )

    return have_geoclip_weights and have_clip_backbone


def is_loaded() -> bool:
    return _loaded


def is_in_use() -> bool:
    return _in_use_count > 0


def get_model():
    """Return the loaded GeoCLIP instance."""
    _ensure_loaded()
    return _model


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


def _schedule_unload() -> None:
    # FUTURE FEATURE: idle auto-unload. Disabled: see module docstring.
    return


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
            return
        logger.info("Loading GeoCLIP model into RAM...")
        try:
            from geoclip import GeoCLIP

            _model = GeoCLIP()
            _loaded = True
            try:
                from app.exact_locator import lock_geoclip_to_kazakhstan

                lock_geoclip_to_kazakhstan(_model)
                logger.info("GeoCLIP gallery locked to Kazakhstan grid")
            except Exception:
                logger.exception("Failed to lock GeoCLIP gallery on load")
            logger.info("GeoCLIP loaded and ready")
        except Exception:
            logger.exception("Failed to load GeoCLIP")
            _loaded = False
            raise


def unload() -> None:
    """Unload model to free RAM. Re-load is blocking on next predict call."""
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
    """Download + load the model during server startup.

    This call is **synchronous** and **blocking**. HuggingFace's ``tqdm``
    progress bars write to stderr and appear in the container logs, so the
    user sees download progress while running ``docker compose up``.
    Uvicorn does not accept connections until this function returns, so
    the frontend cannot reach the API until the model is ready.
    """
    if _loaded:
        return
    print(
        "[startup] Preparing GeoCLIP model "
        "(first run will download ~3.5 GB from HuggingFace)...",
        flush=True,
    )
    _ensure_loaded()
    print("[startup] GeoCLIP model ready.", flush=True)


def predict(image_bytes: bytes, top_k: int = 5) -> list[dict]:
    global _in_use_count
    _ensure_loaded()
    if _model is None:
        raise RuntimeError("GeoCLIP model failed to load")

    try:
        from app.exact_locator import lock_geoclip_to_kazakhstan

        lock_geoclip_to_kazakhstan(_model)
    except Exception:
        pass

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
