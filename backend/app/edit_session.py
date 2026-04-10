"""Edit-mode session manager — round-based GPS prediction.

Pipeline:
  1. Scan directory, classify images (real GPS / predicted GPS / no GPS)
  2. Round N: predict locations for unlocated images using:
     - GeoCLIP model inference
     - Temporal proximity to GPS-tagged photos (including accepted predictions)
  3. Compute combined confidence score (model + temporal context)
  4. Filter by threshold: above → queue for review, below → auto-skip
  5. User reviews: accept / reject / manual
  6. Round N+1: recompute with expanded GPS reference set

Key safety invariant: images with REAL GPS are NEVER modified.
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
from app.gps_detect import extract_gps_from_tags
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


def _classify_gps(image_path: str, exiftool_result) -> str:
    """Classify GPS status: 'real', 'predicted', or 'none'.

    Uses both exiftool and Pillow for cross-validation.
    'disagreement' means the two tools disagree — skip for safety.
    """
    pillow_result = _pillow_has_gps(image_path)

    if exiftool_result.has_gps and pillow_result:
        if exiftool_result.is_estimated:
            return "predicted"
        return "real"
    if not exiftool_result.has_gps and not pillow_result:
        return "none"
    # Disagreement — treat as having GPS (safe default)
    return "disagreement"


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def _compute_combined_score(
    predictions: list[dict], hint: dict | None
) -> tuple[float, float, float]:
    """Compute combined confidence from model output + temporal context.

    Returns (combined_score, model_confidence, temporal_confidence).

    - model_confidence: how peaked the GeoCLIP distribution is (top1/sum)
    - temporal_confidence: from library context hint (burst, same-day, etc.)
    - combined_score: max(model_confidence, temporal_confidence)

    This max() approach means a strong temporal hint alone can push a photo
    above the threshold — which is the key mechanism for round-based improvement.
    """
    if not predictions:
        return 0.0, 0.0, 0.0

    total_prob = sum(p["probability"] for p in predictions)
    model_confidence = (
        predictions[0]["probability"] / total_prob if total_prob > 0 else 0
    )

    temporal_confidence = hint.get("confidence", 0) if hint else 0

    combined = max(model_confidence, temporal_confidence)
    return round(combined, 4), round(model_confidence, 4), round(temporal_confidence, 4)


# ---------------------------------------------------------------------------
# Thumbnail
# ---------------------------------------------------------------------------


def _make_thumbnail(image_path: str) -> str:
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


def _parse_date(tags: dict) -> str | None:
    raw = tags.get("EXIF:DateTimeOriginal") or tags.get("EXIF:CreateDate")
    if not raw or not isinstance(raw, str):
        return None
    try:
        parts = raw.strip().split(" ", 1)
        dp = parts[0].replace(":", "-")
        tp = parts[1] if len(parts) > 1 else "00:00:00"
        return f"{dp}T{tp}"
    except (IndexError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Session manager
# ---------------------------------------------------------------------------


class EditSessionManager:
    """Manages round-based edit sessions."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._continue = threading.Event()
        self._continue.set()
        self._active_session: str | None = None
        self._thread: threading.Thread | None = None
        os.makedirs(_SESSIONS_DIR, exist_ok=True)

    # ---- session lifecycle -----------------------------------------------

    def create_session(
        self,
        directory: str,
        threshold: float = 0.3,
        include_predicted: bool = False,
    ) -> dict:
        """Scan directory, classify all images, return session overview."""
        image_paths = discover_images(directory)

        all_tags = exiftool.read_metadata_batch(image_paths)

        all_images: list[dict] = []
        real_gps = 0
        predicted_gps = 0
        no_gps = 0
        disagreements = 0
        warnings: list[str] = []

        for path, tags in zip(image_paths, all_tags):
            gps_result = extract_gps_from_tags(tags)
            classification = _classify_gps(path, gps_result)

            if classification == "disagreement":
                disagreements += 1
                warnings.append(
                    f"GPS check disagreement for {Path(path).name} — skipping for safety"
                )
                continue

            date_taken = _parse_date(tags)

            img_info = {
                "path": path,
                "filename": Path(path).name,
                "image_id": _image_id(path),
                "gps_class": classification,  # "real", "predicted", "none"
                "coordinates": gps_result.coordinates,
                "date_taken": date_taken,
                "is_estimated": gps_result.is_estimated,
            }

            if classification == "real":
                real_gps += 1
            elif classification == "predicted":
                predicted_gps += 1
            else:
                no_gps += 1

            all_images.append(img_info)

        session_id = uuid.uuid4().hex[:8]
        session: dict = {
            "session_id": session_id,
            "directory": directory,
            "threshold": threshold,
            "include_predicted": include_predicted,
            "status": "ready",
            "current_round": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "warnings": warnings,
            "all_images": all_images,
            "total_images": len(all_images),
            "real_gps_count": real_gps,
            "predicted_gps_count": predicted_gps,
            "no_gps_count": no_gps,
            "disagreements": disagreements,
            "rounds": {},
            # Track which image_ids have been accepted across all rounds
            "accepted_ids": [],
        }
        self._save(session)

        return {
            "session_id": session_id,
            "total_images": len(all_images),
            "real_gps_count": real_gps,
            "predicted_gps_count": predicted_gps,
            "no_gps_count": no_gps,
            "disagreements": disagreements,
            "status": "ready",
            "warnings": warnings,
        }

    def start_round(self, session_id: str) -> dict:
        """Prepare and start a new round of inference.

        Each round:
        1. Builds GPS reference set (real + accepted predictions)
        2. Identifies candidate images (no GPS + optionally predicted GPS)
        3. Computes temporal hints from the reference set
        4. Runs inference + scoring in a background thread
        """
        with self._lock:
            if self._active_session and self._active_session != session_id:
                raise RuntimeError("Another session is already running")
            self._active_session = session_id
            self._continue.set()

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        round_num = session["current_round"] + 1
        session["current_round"] = round_num

        # Build reference GPS set
        accepted_ids = set(session.get("accepted_ids", []))
        reference_images = []
        for img in session["all_images"]:
            if img["gps_class"] == "real":
                reference_images.append(img)
            elif img["image_id"] in accepted_ids and img.get("accepted_coordinates"):
                # Include accepted predictions from previous rounds
                ref = dict(img)
                ref["has_gps"] = True
                ref["coordinates"] = img["accepted_coordinates"]
                reference_images.append(ref)

        # Build candidate set (images to process this round)
        candidates = []
        for img in session["all_images"]:
            if img["gps_class"] == "real":
                continue  # NEVER touch real GPS
            if img["image_id"] in accepted_ids:
                continue  # Already accepted in a previous round
            # Check if this was rejected — skip permanently rejected images
            if img.get("permanently_rejected"):
                continue
            if img["gps_class"] == "predicted" and not session["include_predicted"]:
                continue  # Skip predicted unless toggle is on
            candidates.append(img)

        if not candidates:
            session["status"] = "complete"
            self._save(session)
            with self._lock:
                self._active_session = None
            return {
                "round": round_num,
                "candidates": 0,
                "reference_gps": len(reference_images),
                "status": "no_candidates",
            }

        # Compute library context hints using reference set
        all_for_context = []
        for img in session["all_images"]:
            ctx = {
                "path": img["path"],
                "filename": img["filename"],
                "has_gps": img["gps_class"] == "real",
                "coordinates": img["coordinates"],
                "date_taken": img["date_taken"],
            }
            # Include accepted predictions as GPS references
            if img["image_id"] in accepted_ids and img.get("accepted_coordinates"):
                ctx["has_gps"] = True
                ctx["coordinates"] = img["accepted_coordinates"]
            all_for_context.append(ctx)

        target_paths = {c["path"] for c in candidates}
        hints = compute_hints(all_for_context, target_paths)

        # Build round queue
        queue = []
        for img in candidates:
            queue.append(
                {
                    "image_id": img["image_id"],
                    "path": img["path"],
                    "filename": img["filename"],
                    "date_taken": img["date_taken"],
                    "status": "queued",
                    "predictions": None,
                    "thumbnail_base64": None,
                    "combined_score": None,
                    "model_confidence": None,
                    "temporal_confidence": None,
                    "temporal_source": None,
                    "review_decision": None,
                    "review_coordinates": None,
                    "processed_at": None,
                }
            )

        round_data = {
            "round_num": round_num,
            "status": "running",
            "reference_gps_count": len(reference_images),
            "total_candidates": len(queue),
            "above_threshold": 0,
            "below_threshold": 0,
            "processed": 0,
            "queue": queue,
            "hints": {k: v for k, v in hints.items()},  # serializable copy
        }
        session["rounds"][str(round_num)] = round_data
        session["status"] = "processing"
        self._save(session)

        # Start background inference
        self._thread = threading.Thread(
            target=self._inference_loop,
            args=(session_id, round_num),
            daemon=True,
        )
        self._thread.start()

        return {
            "round": round_num,
            "candidates": len(queue),
            "reference_gps": len(reference_images),
            "status": "running",
        }

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

            rnd = session["rounds"].get(str(session["current_round"]))
            if rnd and rnd["status"] == "paused":
                self._active_session = session_id
                self._continue.set()
                rnd["status"] = "running"
                session["status"] = "processing"
                self._save(session)

                self._thread = threading.Thread(
                    target=self._inference_loop,
                    args=(session_id, session["current_round"]),
                    daemon=True,
                )
                self._thread.start()

    def get_status(self, session_id: str) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None

        round_num = session["current_round"]
        rnd = session["rounds"].get(str(round_num)) if round_num > 0 else None

        if not rnd:
            return {
                "session_id": session_id,
                "status": session["status"],
                "current_round": round_num,
                "processed": 0,
                "total": 0,
                "current_image": None,
            }

        processed = sum(1 for q in rnd["queue"] if q["status"] != "queued")
        current = None
        for q in rnd["queue"]:
            if q["status"] == "queued":
                current = q["filename"]
                break

        return {
            "session_id": session_id,
            "status": rnd["status"],
            "current_round": round_num,
            "processed": processed,
            "remaining": len(rnd["queue"]) - processed,
            "total": len(rnd["queue"]),
            "above_threshold": rnd["above_threshold"],
            "below_threshold": rnd["below_threshold"],
            "current_image": current,
        }

    def get_session(self, session_id: str) -> dict | None:
        return self._load(session_id)

    def get_round_summary(self, session_id: str, round_num: int) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None
        rnd = session["rounds"].get(str(round_num))
        if not rnd:
            return None

        queue = rnd["queue"]
        accepted = sum(1 for q in queue if q["status"] in ("accepted", "manual"))
        rejected = sum(1 for q in queue if q["status"] == "rejected")
        pending = sum(1 for q in queue if q["status"] == "pending_review")
        auto_skipped = sum(1 for q in queue if q["status"] == "auto_skipped")

        # Count remaining unlocated images for next round potential
        accepted_ids = set(session.get("accepted_ids", []))
        remaining_unlocated = sum(
            1
            for img in session["all_images"]
            if img["gps_class"] != "real"
            and img["image_id"] not in accepted_ids
            and not img.get("permanently_rejected")
        )

        return {
            "round_num": round_num,
            "status": rnd["status"],
            "total_candidates": rnd["total_candidates"],
            "above_threshold": rnd["above_threshold"],
            "below_threshold": rnd["below_threshold"],
            "accepted": accepted,
            "rejected": rejected,
            "pending_review": pending,
            "auto_skipped": auto_skipped,
            "remaining_unlocated": remaining_unlocated,
            "reference_gps_count": rnd["reference_gps_count"],
        }

    # ---- review queue ---------------------------------------------------

    def get_queue(self, session_id: str, round_num: int | None = None) -> list[dict]:
        session = self._load(session_id)
        if not session:
            return []
        rn = round_num or session["current_round"]
        rnd = session["rounds"].get(str(rn))
        if not rnd:
            return []
        # Strip thumbnails for list view
        return [
            {k: v for k, v in item.items() if k != "thumbnail_base64"}
            for item in rnd["queue"]
            if item["status"] == "pending_review"
        ]

    def get_next_for_review(self, session_id: str) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None
        rnd = session["rounds"].get(str(session["current_round"]))
        if not rnd:
            return None
        for item in rnd["queue"]:
            if item["status"] == "pending_review":
                return item
        return None

    def review_accept(self, session_id: str, image_id: str) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None
        rnd = session["rounds"].get(str(session["current_round"]))
        if not rnd:
            return None

        for item in rnd["queue"]:
            if item["image_id"] != image_id:
                continue
            if item["status"] != "pending_review":
                return None

            item["review_decision"] = "accepted"
            item["status"] = "accepted"
            if item["predictions"]:
                top = item["predictions"][0]
                item["review_coordinates"] = {"lat": top["lat"], "lon": top["lon"]}

            # Record accepted coordinates on the all_images entry
            if image_id not in session.get("accepted_ids", []):
                session.setdefault("accepted_ids", []).append(image_id)
            for img in session["all_images"]:
                if img["image_id"] == image_id and item.get("review_coordinates"):
                    img["accepted_coordinates"] = item["review_coordinates"]

            self._save(session)
            return item
        return None

    def review_reject(self, session_id: str, image_id: str) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None
        rnd = session["rounds"].get(str(session["current_round"]))
        if not rnd:
            return None

        for item in rnd["queue"]:
            if item["image_id"] != image_id:
                continue
            if item["status"] != "pending_review":
                return None
            item["review_decision"] = "rejected"
            item["status"] = "rejected"
            self._save(session)
            return item
        return None

    def review_manual(
        self, session_id: str, image_id: str, lat: float, lon: float
    ) -> dict | None:
        session = self._load(session_id)
        if not session:
            return None
        rnd = session["rounds"].get(str(session["current_round"]))
        if not rnd:
            return None

        for item in rnd["queue"]:
            if item["image_id"] != image_id:
                continue
            item["review_decision"] = "manual"
            item["review_coordinates"] = {"lat": lat, "lon": lon}
            item["status"] = "manual"

            if image_id not in session.get("accepted_ids", []):
                session.setdefault("accepted_ids", []).append(image_id)
            for img in session["all_images"]:
                if img["image_id"] == image_id:
                    img["accepted_coordinates"] = {"lat": lat, "lon": lon}

            self._save(session)
            return item
        return None

    # ---- apply / rollback ------------------------------------------------

    def apply_single(self, session_id: str, image_id: str) -> dict:
        from app.gps_writer import write_gps

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        # Find the item across all rounds
        for rn_key, rnd in session["rounds"].items():
            for item in rnd["queue"]:
                if item["image_id"] != image_id:
                    continue
                decision = item.get("review_decision")
                coords = item.get("review_coordinates")
                if decision not in ("accepted", "manual") or not coords:
                    return {"error": f"Image not ready (status={decision})"}

                source = "geoclip" if decision == "accepted" else "manual"

                # Check if image has predicted GPS that needs overwriting
                allow_overwrite = False
                for img in session["all_images"]:
                    if img["image_id"] == image_id and img["gps_class"] == "predicted":
                        allow_overwrite = True
                        break

                wr = write_gps(
                    item["path"],
                    coords["lat"],
                    coords["lon"],
                    estimated=True,
                    session_id=session_id,
                    allow_overwrite_estimated=allow_overwrite,
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

    def rollback_all(self, session_id: str) -> dict:
        from app.gps_writer import rollback_single as _rollback

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        rolled = 0
        failed = 0
        for rnd in session["rounds"].values():
            for item in rnd["queue"]:
                if not item.get("applied"):
                    continue
                if _rollback(item["path"]):
                    item["applied"] = False
                    item.pop("applied_at", None)
                    item.pop("applied_source", None)
                    rolled += 1
                else:
                    failed += 1

        # Clear accepted ids
        session["accepted_ids"] = []
        for img in session["all_images"]:
            img.pop("accepted_coordinates", None)

        self._save(session)
        return {"rolled_back": rolled, "failed": failed}

    def cleanup_backups(self, session_id: str) -> dict:
        from app.gps_writer import cleanup_backup

        session = self._load(session_id)
        if not session:
            raise ValueError("Session not found")

        cleaned = 0
        for rnd in session["rounds"].values():
            for item in rnd["queue"]:
                if cleanup_backup(item["path"]):
                    cleaned += 1

        return {"cleaned": cleaned}

    # ---- inference loop --------------------------------------------------

    def _inference_loop(self, session_id: str, round_num: int) -> None:
        try:
            session = self._load(session_id)
            if not session:
                return

            rnd = session["rounds"].get(str(round_num))
            if not rnd:
                return

            hints = rnd.get("hints", {})
            threshold = session["threshold"]
            above = 0
            below = 0

            for item in rnd["queue"]:
                if item["status"] != "queued":
                    continue

                # Check pause
                if not self._continue.is_set():
                    rnd["status"] = "paused"
                    session["status"] = "paused"
                    self._save(session)
                    self._continue.wait()
                    session = self._load(session_id)
                    if not session:
                        return
                    rnd = session["rounds"].get(str(round_num))
                    if not rnd or rnd["status"] != "running":
                        return

                try:
                    with open(item["path"], "rb") as f:
                        image_bytes = f.read()

                    hint = hints.get(item["path"])

                    # Run enhanced prediction (GeoCLIP + hint re-ranking)
                    predictions = enhancer.predict_enhanced(
                        image_bytes, top_k=_TOP_K, hint=hint
                    )

                    # Reverse geocode
                    for pred in predictions:
                        pred["address"] = geocoder.lookup(pred["lat"], pred["lon"])

                    # Compute combined score
                    combined, model_conf, temporal_conf = _compute_combined_score(
                        predictions, hint
                    )

                    item["predictions"] = predictions
                    item["combined_score"] = combined
                    item["model_confidence"] = model_conf
                    item["temporal_confidence"] = temporal_conf
                    item["temporal_source"] = hint.get("source") if hint else None
                    item["thumbnail_base64"] = _make_thumbnail(item["path"])
                    item["processed_at"] = datetime.now(timezone.utc).isoformat()

                    # Threshold filtering
                    if combined >= threshold:
                        item["status"] = "pending_review"
                        above += 1
                    else:
                        item["status"] = "auto_skipped"
                        below += 1

                except Exception:
                    logger.exception("Inference failed for %s", item["path"])
                    item["status"] = "auto_skipped"
                    item["predictions"] = []
                    item["processed_at"] = datetime.now(timezone.utc).isoformat()
                    item["combined_score"] = 0
                    below += 1

                rnd["above_threshold"] = above
                rnd["below_threshold"] = below
                rnd["processed"] = above + below
                self._save(session)

            rnd["status"] = "review"
            session["status"] = "reviewing"

            # If nothing above threshold, mark round as done
            if above == 0:
                rnd["status"] = "complete"
                session["status"] = "round_complete"

            self._save(session)

        except Exception:
            logger.exception(
                "Inference loop failed for session %s round %d", session_id, round_num
            )
            session = self._load(session_id)
            if session:
                rnd = session["rounds"].get(str(round_num))
                if rnd:
                    rnd["status"] = "error"
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
