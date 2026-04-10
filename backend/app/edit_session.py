"""Edit-mode session manager.

Manages the full pipeline: scan → filter (GPS-less only) → double-check →
infer → queue for review → persist state atomically.
"""

import base64
import hashlib
import io
import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from PIL.ExifTags import GPSTAGS

from app import enhancer, exiftool, geocoder
from app.gps_detect import detect_gps, extract_gps_from_tags
from app.library_context import compute_hints
from app.scanner import discover_images

logger = logging.getLogger(__name__)

_SESSIONS_DIR = "/data/sessions"
_TOP_K = 5
_THUMB_WIDTH = 300


# ---------------------------------------------------------------------------
# Double-check GPS (belt AND suspenders)
# ---------------------------------------------------------------------------


def _pillow_has_gps(image_path: str) -> bool:
    """Independent GPS check using Pillow — cross-validates exiftool."""
    try:
        img = Image.open(image_path)
        exif = img._getexif()  # noqa: SLF001
        if exif is None:
            return False
        gps_info = exif.get(34853)  # GPSInfo IFD tag
        if not gps_info or not isinstance(gps_info, dict):
            return False
        tags = {GPSTAGS.get(k, k): v for k, v in gps_info.items()}
        return "GPSLatitude" in tags and "GPSLongitude" in tags
    except Exception:
        return False


def _double_check_gps(image_path: str) -> tuple[bool, str | None]:
    """Return ``(definitely_no_gps, warning_or_none)``.

    Uses exiftool (primary) and Pillow (secondary).
    If the two disagree the image is flagged and must be skipped.
    """
    exiftool_result = detect_gps(image_path)
    pillow_result = _pillow_has_gps(image_path)

    if exiftool_result.has_gps and pillow_result:
        return False, None  # both agree: has GPS
    if not exiftool_result.has_gps and not pillow_result:
        return True, None  # both agree: no GPS
    # Disagreement
    return False, (
        f"GPS check disagreement for {image_path}: "
        f"exiftool={exiftool_result.has_gps}, pillow={pillow_result}. Skipping."
    )


# ---------------------------------------------------------------------------
# Thumbnail
# ---------------------------------------------------------------------------


def _make_thumbnail(image_path: str) -> str:
    """Generate a base64-encoded JPEG thumbnail."""
    try:
        img = Image.open(image_path)
        img.thumbnail((_THUMB_WIDTH, _THUMB_WIDTH), Image.LANCZOS)
        img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ""


def _image_id(path: str) -> str:
    return hashlib.sha256(path.encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Session manager
# ---------------------------------------------------------------------------


class EditSessionManager:
    """Manages edit sessions with inference, review queue, and persistence."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._continue = threading.Event()
        self._continue.set()
        self._active_session: str | None = None
        self._thread: threading.Thread | None = None
        os.makedirs(_SESSIONS_DIR, exist_ok=True)

    # ---- session lifecycle -----------------------------------------------

    def create_session(self, directory: str) -> dict:
        """Scan *directory*, filter GPS-less images, return session overview."""
        image_paths = discover_images(directory)

        queue: list[dict] = []
        gps_skipped = 0
        disagreements = 0
        warnings: list[str] = []

        # Batch-read metadata for library context (one exiftool call)
        all_tags = exiftool.read_metadata_batch(image_paths)
        all_images_for_context: list[dict] = []

        for path, tags in zip(image_paths, all_tags):
            no_gps, warn = _double_check_gps(path)
            if warn:
                warnings.append(warn)
                disagreements += 1
                logger.warning(warn)
                continue

            # Extract date for library context
            gps_result = extract_gps_from_tags(tags)
            date_raw = tags.get("EXIF:DateTimeOriginal") or tags.get("EXIF:CreateDate")
            date_taken = None
            if date_raw and isinstance(date_raw, str):
                try:
                    parts = date_raw.strip().split(" ", 1)
                    dp = parts[0].replace(":", "-")
                    tp = parts[1] if len(parts) > 1 else "00:00:00"
                    date_taken = f"{dp}T{tp}"
                except (IndexError, ValueError):
                    pass

            all_images_for_context.append(
                {
                    "path": path,
                    "filename": Path(path).name,
                    "has_gps": gps_result.has_gps,
                    "coordinates": gps_result.coordinates,
                    "date_taken": date_taken,
                }
            )

            if not no_gps:
                gps_skipped += 1
                continue

            queue.append(
                {
                    "image_id": _image_id(path),
                    "path": path,
                    "filename": Path(path).name,
                    "status": "queued",
                    "predictions": None,
                    "thumbnail_base64": None,
                    "review_decision": None,
                    "review_coordinates": None,
                    "processed_at": None,
                    "date_taken": date_taken,
                }
            )

        # Compute library context hints
        target_paths = {item["path"] for item in queue}
        library_hints = compute_hints(all_images_for_context, target_paths)
        hints_count = len(library_hints)
        burst_hints = sum(
            1 for h in library_hints.values() if h.get("source") == "burst"
        )

        session_id = uuid.uuid4().hex[:8]
        session: dict = {
            "session_id": session_id,
            "directory": directory,
            "status": "ready",
            "total_images": len(image_paths),
            "gps_images_skipped": gps_skipped,
            "disagreements": disagreements,
            "to_process": len(queue),
            "processed": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "warnings": warnings,
            "library_hints": library_hints,
            "queue": queue,
        }
        self._save(session)
        return {
            "session_id": session_id,
            "total_images": session["total_images"],
            "gps_images_skipped": gps_skipped,
            "disagreements": disagreements,
            "to_process": len(queue),
            "library_hints_found": hints_count,
            "burst_hints": burst_hints,
            "status": "ready",
            "warnings": warnings,
        }

    def start_inference(self, session_id: str) -> None:
        with self._lock:
            if self._active_session and self._active_session != session_id:
                raise RuntimeError("Another session is already running inference")
            self._active_session = session_id
            self._continue.set()

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")
        session["status"] = "running"
        self._save(session)

        self._thread = threading.Thread(
            target=self._inference_loop, args=(session_id,), daemon=True
        )
        self._thread.start()

    def pause(self, session_id: str) -> None:
        with self._lock:
            if self._active_session != session_id:
                raise ValueError("Session is not running")
        self._continue.clear()

    def resume(self, session_id: str) -> None:
        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        with self._lock:
            if self._active_session and self._active_session != session_id:
                raise RuntimeError("Another session is already running")

            if session["status"] == "paused":
                self._active_session = session_id
                self._continue.set()
                session["status"] = "running"
                self._save(session)

                self._thread = threading.Thread(
                    target=self._inference_loop, args=(session_id,), daemon=True
                )
                self._thread.start()

    def get_status(self, session_id: str) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None
        processed = sum(1 for q in session["queue"] if q["status"] != "queued")
        remaining = sum(1 for q in session["queue"] if q["status"] == "queued")
        current = None
        for q in session["queue"]:
            if q["status"] == "queued":
                current = q["filename"]
                break
        return {
            "session_id": session_id,
            "status": session["status"],
            "processed": processed,
            "remaining": remaining,
            "total": len(session["queue"]),
            "current_image": current,
        }

    def get_session(self, session_id: str) -> dict | None:
        return self._load(session_id)

    def list_sessions(self) -> list[dict]:
        results: list[dict] = []
        for fname in sorted(os.listdir(_SESSIONS_DIR)):
            if not fname.endswith(".json"):
                continue
            s = self._load(fname.replace(".json", ""))
            if s:
                results.append(
                    {
                        "session_id": s["session_id"],
                        "directory": s["directory"],
                        "status": s["status"],
                        "to_process": s["to_process"],
                        "processed": sum(
                            1 for q in s["queue"] if q["status"] != "queued"
                        ),
                        "created_at": s["created_at"],
                    }
                )
        return results

    # ---- review actions --------------------------------------------------

    def get_queue(self, session_id: str, offset: int = 0, limit: int = 0) -> list[dict]:
        session = self._load(session_id)
        if not session:
            return []
        items = session["queue"]
        if limit > 0:
            items = items[offset : offset + limit]
        # Strip heavy thumbnail data for list view — frontend fetches per-item
        return [
            {k: v for k, v in item.items() if k != "thumbnail_base64"} for item in items
        ]

    def get_next_for_review(self, session_id: str) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None
        for item in session["queue"]:
            if item["status"] == "pending_review":
                return item
        return None

    def review_accept(self, session_id: str, image_id: str) -> dict | None:
        return self._set_review(session_id, image_id, "accepted")

    def review_reject(self, session_id: str, image_id: str) -> dict | None:
        return self._set_review(session_id, image_id, "rejected")

    def review_manual(
        self, session_id: str, image_id: str, lat: float, lon: float
    ) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None
        for item in session["queue"]:
            if item["image_id"] == image_id:
                item["review_decision"] = "manual"
                item["review_coordinates"] = {"lat": lat, "lon": lon}
                item["status"] = "manual"
                self._save(session)
                return item
        return None

    def _set_review(self, session_id: str, image_id: str, decision: str) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None
        for item in session["queue"]:
            if item["image_id"] == image_id:
                if item["status"] == "queued":
                    return None  # not yet processed by inference
                item["review_decision"] = decision
                item["status"] = decision
                if decision == "accepted" and item["predictions"]:
                    top = item["predictions"][0]
                    item["review_coordinates"] = {
                        "lat": top["lat"],
                        "lon": top["lon"],
                    }
                self._save(session)
                return item
        return None

    # ---- apply / rollback ------------------------------------------------

    def apply_all(self, session_id: str) -> dict:
        """Apply GPS writes for all accepted/manual items in the queue."""
        from app.gps_writer import write_gps

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        applied = 0
        skipped = 0
        errors: list[dict] = []

        for item in session["queue"]:
            decision = item.get("review_decision")
            coords = item.get("review_coordinates")

            if decision not in ("accepted", "manual") or not coords:
                skipped += 1
                continue

            source = "geoclip" if decision == "accepted" else "manual"
            wr = write_gps(
                item["path"],
                coords["lat"],
                coords["lon"],
                estimated=True,
                session_id=session_id,
            )
            if wr.success:
                item["applied"] = True
                item["applied_at"] = datetime.now(timezone.utc).isoformat()
                item["applied_source"] = source
                applied += 1
            else:
                errors.append({"path": item["path"], "error": wr.error})

        self._save(session)
        return {
            "applied": applied,
            "skipped": skipped,
            "errors": len(errors),
            "error_details": errors,
        }

    def apply_single(self, session_id: str, image_id: str) -> dict:
        """Apply GPS write for a single reviewed image."""
        from app.gps_writer import write_gps

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        for item in session["queue"]:
            if item["image_id"] != image_id:
                continue
            decision = item.get("review_decision")
            coords = item.get("review_coordinates")
            if decision not in ("accepted", "manual") or not coords:
                return {"error": f"Image not ready for apply (status={decision})"}

            source = "geoclip" if decision == "accepted" else "manual"
            wr = write_gps(
                item["path"],
                coords["lat"],
                coords["lon"],
                estimated=True,
                session_id=session_id,
            )
            if wr.success:
                item["applied"] = True
                item["applied_at"] = datetime.now(timezone.utc).isoformat()
                item["applied_source"] = source
                self._save(session)
                return {
                    "success": True,
                    "path": item["path"],
                    "coordinates": wr.coordinates_written,
                    "source": source,
                }
            else:
                return {"success": False, "path": item["path"], "error": wr.error}

        return {"error": "Image not found in queue"}

    def rollback_single(self, session_id: str, image_id: str) -> dict:
        """Rollback GPS write for a single image."""
        from app.gps_writer import rollback_single as _rollback
        from app.gps_detect import detect_gps as _detect

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        for item in session["queue"]:
            if item["image_id"] != image_id:
                continue
            if not item.get("applied"):
                return {"error": "Image was not applied"}

            ok = _rollback(item["path"])
            if not ok:
                return {"error": "No backup file found"}

            # Verify rollback
            post = _detect(item["path"])
            item["applied"] = False
            item.pop("applied_at", None)
            item.pop("applied_source", None)
            self._save(session)
            return {"success": True, "has_gps_after_rollback": post.has_gps}

        return {"error": "Image not found"}

    def rollback_all(self, session_id: str) -> dict:
        """Rollback all applied images in this session."""
        from app.gps_writer import rollback_single as _rollback

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        rolled = 0
        failed = 0
        for item in session["queue"]:
            if not item.get("applied"):
                continue
            if _rollback(item["path"]):
                item["applied"] = False
                item.pop("applied_at", None)
                item.pop("applied_source", None)
                rolled += 1
            else:
                failed += 1

        self._save(session)
        return {"rolled_back": rolled, "failed": failed}

    def cleanup_backups(self, session_id: str) -> dict:
        """Delete all _original backup files for this session."""
        from app.gps_writer import cleanup_backup

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        cleaned = 0
        for item in session["queue"]:
            if cleanup_backup(item["path"]):
                cleaned += 1

        return {"cleaned": cleaned}

    # ---- inference loop --------------------------------------------------

    def _inference_loop(self, session_id: str) -> None:
        try:
            session = self._load(session_id)
            if not session:
                return

            for item in session["queue"]:
                if item["status"] != "queued":
                    continue

                # Check pause
                if not self._continue.is_set():
                    session["status"] = "paused"
                    self._save(session)
                    self._continue.wait()
                    # After resume, re-check — might have been stopped
                    session = self._load(session_id)
                    if not session or session["status"] != "running":
                        return

                # Run inference
                try:
                    with open(item["path"], "rb") as f:
                        image_bytes = f.read()

                    # Look up library context hint for this image
                    hint = session.get("library_hints", {}).get(item["path"])

                    # Enhanced: TTA + centroid + library hint re-ranking
                    predictions = enhancer.predict_enhanced(
                        image_bytes, top_k=_TOP_K, hint=hint
                    )

                    # Reverse geocode top predictions
                    for pred in predictions:
                        pred["address"] = geocoder.lookup(pred["lat"], pred["lon"])

                    item["predictions"] = predictions
                    item["thumbnail_base64"] = _make_thumbnail(item["path"])
                    item["status"] = "pending_review"
                    item["processed_at"] = datetime.now(timezone.utc).isoformat()

                except Exception:
                    logger.exception("Inference failed for %s", item["path"])
                    item["status"] = "pending_review"
                    item["predictions"] = []
                    item["processed_at"] = datetime.now(timezone.utc).isoformat()

                session["processed"] = sum(
                    1 for q in session["queue"] if q["status"] != "queued"
                )
                self._save(session)

            session["status"] = "complete"
            self._save(session)

        except Exception:
            logger.exception("Inference loop failed for session %s", session_id)
            session = self._load(session_id)
            if session:
                session["status"] = "error"
                self._save(session)
        finally:
            with self._lock:
                if self._active_session == session_id:
                    self._active_session = None

    # ---- persistence (atomic) --------------------------------------------

    def _save(self, session: dict) -> None:
        path = os.path.join(_SESSIONS_DIR, f"{session['session_id']}.json")
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(session, f)
        os.replace(tmp, path)

    def _load(self, session_id: str) -> dict | None:
        path = os.path.join(_SESSIONS_DIR, f"{session_id}.json")
        if not os.path.isfile(path):
            return None
        with open(path) as f:
            return json.load(f)


# Module singleton
edit_manager = EditSessionManager()
