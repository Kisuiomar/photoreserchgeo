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
_downloading = False  # True while the HuggingFace download is in progress
_in_use_count = 0  # atomic-ish counter for concurrent inference calls
_lock = threading.Lock()
_last_used = 0.0
_timer: threading.Timer | None = None

# Expected total download size (HuggingFace CLIP-ViT-L/14 ~= 1.7 GB + some overhead).
# Used only for estimating progress percentage; not a hard cap.
_EXPECTED_DOWNLOAD_BYTES = int(1.75 * 1024 * 1024 * 1024)

# Paths we monitor to estimate download progress.
_HF_CACHE_ROOT = os.path.expanduser("~/.cache/huggingface/hub")


def _dir_size(path: str) -> int:
    """Sum of all file sizes under *path*. Returns 0 if the path is missing."""
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


def is_downloading() -> bool:
    return _downloading


def download_progress() -> dict:
    """Report approximate download progress for the HF model weights.

    When ``is_downloaded`` returns True the download is done.  Otherwise this
    reports the current cache size so the UI can render a progress bar.
    """
    bytes_on_disk = _dir_size(_HF_CACHE_ROOT)
    if is_downloaded():
        return {
            "bytes": bytes_on_disk,
            "total_bytes": max(bytes_on_disk, _EXPECTED_DOWNLOAD_BYTES),
            "percent": 100,
            "downloading": False,
        }
    percent = min(99, int(bytes_on_disk * 100 / _EXPECTED_DOWNLOAD_BYTES))
    return {
        "bytes": bytes_on_disk,
        "total_bytes": _EXPECTED_DOWNLOAD_BYTES,
        "percent": percent,
        "downloading": _downloading,
    }


def is_downloaded() -> bool:
    """Check whether GeoCLIP weights are cached locally.

    GeoCLIP ships some weights inside its package directory
    (``geoclip/model/weights``) but also pulls the backbone CLIP vision
    encoder from HuggingFace hub on first use.  We consider the model
    "downloaded" when both the GeoCLIP weights and the HF CLIP snapshot
    exist on disk.
    """
    global _downloaded
    if _downloaded:
        return True

    have_geoclip_weights = False
    have_clip_backbone = False

    # 1. GeoCLIP's own weights (ship with the package or in user cache)
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

    # 2. HuggingFace CLIP backbone snapshot.  Require a substantial size
    # so a partial download in progress isn't misreported as complete.
    # The CLIP ViT-L/14 weights are ~1.6 GB; we require at least 1 GB to
    # avoid false positives but stay tolerant of reasonable file variations.
    _MIN_BACKBONE_BYTES = 1_000_000_000
    hf_candidates = [
        os.path.expanduser(
            "~/.cache/huggingface/hub/models--openai--clip-vit-large-patch14"
        ),
        os.path.expanduser(
            "~/.cache/huggingface/hub/models--openai--clip-vit-base-patch32"
        ),
    ]
    for c in hf_candidates:
        if os.path.isdir(c) and _dir_size(c) >= _MIN_BACKBONE_BYTES:
            have_clip_backbone = True
            break

    if have_geoclip_weights and have_clip_backbone:
        _downloaded = True
        return True
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
    global _model, _loaded, _last_used, _downloading, _downloaded
    with _lock:
        _last_used = time.time()
        if _loaded and _model is not None:
            _schedule_unload()
            return
        needs_download = not is_downloaded()
        if needs_download:
            _downloading = True
            logger.info("Downloading GeoCLIP backbone (first-run, ~1.7 GB)...")
        else:
            logger.info("Loading GeoCLIP model into RAM...")
        try:
            from geoclip import GeoCLIP

            _model = GeoCLIP()
            _loaded = True
            _downloaded = True
            logger.info("GeoCLIP loaded and ready")
            _schedule_unload()
        except Exception:
            logger.exception("Failed to load GeoCLIP")
            _loaded = False
        finally:
            _downloading = False


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
