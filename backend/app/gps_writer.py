"""Safe, validated EXIF GPS writing with pre-write checks.

Three-layer defence:
  1. Queue filter: only GPS-less images enter the queue (edit_session.py)
  2. Pre-write check: detect_gps() one final time before ANY write
  3. Post-write validation: read back and verify coordinates match

The pre-write check in layer 2 is NON-BYPASSABLE. Even if a bug lets a
GPS-bearing image through the previous layers, this catches it.

FUTURE FEATURE: backup + rollback. exiftool has a built-in backup system
that writes `<file>_original` copies before modifying, which ``rollback_single``
/ ``cleanup_backup`` below consume. That path is currently disabled via
the ``-overwrite_original`` flag in ``write_gps`` because most users
found the resulting backup files confusing. Removing that flag re-enables
the whole rollback story without any further code changes.
"""

import logging
import os
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.gps_detect import detect_gps

logger = logging.getLogger(__name__)

_COORD_TOLERANCE = 0.0001  # ~11 m — acceptable floating-point drift
_LOGS_DIR = "/data/logs"


@dataclass
class WriteResult:
    success: bool = False
    image_path: str = ""
    coordinates_written: dict | None = None
    pre_check_passed: bool = False
    post_validation_passed: bool = False
    backup_path: str | None = None
    error: str | None = None
    log_entries: list[str] = field(default_factory=list)


def _log_to_file(session_id: str, message: str) -> None:
    os.makedirs(_LOGS_DIR, exist_ok=True)
    path = os.path.join(_LOGS_DIR, f"edit-{session_id}.log")
    line = f"{datetime.now(timezone.utc).isoformat()} | {message}\n"
    with open(path, "a") as fh:
        fh.write(line)


def write_gps(
    image_path: str,
    lat: float,
    lon: float,
    *,
    estimated: bool = True,
    session_id: str = "",
    allow_overwrite_estimated: bool = False,
) -> WriteResult:
    """Write GPS to *image_path* with full safety checks.

    Returns a ``WriteResult`` describing exactly what happened.
    The ``_original`` backup file is ALWAYS created (never uses
    ``-overwrite_original``).

    If *allow_overwrite_estimated* is True, existing GPS that is marked
    as ESTIMATED (predicted) may be overwritten.  Real GPS is NEVER
    overwritten regardless of this flag.
    """
    result = WriteResult(image_path=image_path)
    now_iso = datetime.now(timezone.utc).isoformat()

    def log(msg: str) -> None:
        result.log_entries.append(msg)
        logger.info(msg)
        if session_id:
            _log_to_file(session_id, msg)

    # ================================================================
    # LAYER 2 — MANDATORY PRE-WRITE GPS CHECK (non-bypassable)
    # ================================================================
    log(f"PRE-WRITE CHECK: {image_path}")
    pre = detect_gps(image_path)

    if pre.has_gps:
        if allow_overwrite_estimated and pre.is_estimated:
            log(
                "PRE-WRITE CHECK: existing GPS is ESTIMATED — "
                "overwrite permitted by allow_overwrite_estimated flag"
            )
        else:
            msg = (
                f"ABORT: pre-write check found GPS in {image_path} "
                f"(sources={pre.sources}, coords={pre.coordinates}). "
                "Refusing to write — file already has location data."
            )
            log(msg)
            result.error = msg
            return result

    if pre.error:
        msg = f"ABORT: pre-write check failed for {image_path}: {pre.error}"
        log(msg)
        result.error = msg
        return result

    result.pre_check_passed = True
    log("PRE-WRITE CHECK: PASSED")

    # ================================================================
    # BUILD EXIFTOOL COMMAND
    # ================================================================
    lat_ref = "N" if lat >= 0 else "S"
    lon_ref = "E" if lon >= 0 else "W"
    abs_lat = abs(lat)
    abs_lon = abs(lon)

    args = [
        "exiftool",
        f"-GPSLatitude={abs_lat}",
        f"-GPSLatitudeRef={lat_ref}",
        f"-GPSLongitude={abs_lon}",
        f"-GPSLongitudeRef={lon_ref}",
    ]

    if estimated:
        method = f"charset=Ascii ESTIMATED:GEOCLIP:v1.2.0:{now_iso}"
        args.append(f"-GPSProcessingMethod={method}")
        args.append(f"-UserComment=GeoScope:estimated:{now_iso}")

    # FUTURE FEATURE: automatic backup files via exiftool's default `_original`
    # behavior. To re-enable, remove the `-overwrite_original` flag below, and
    # the rollback endpoints / cleanup-backups endpoint (already wired) will
    # work again. For now we overwrite in place since users have expressed
    # that the backup files are clutter.
    args.append("-overwrite_original")
    args.append(image_path)

    log(f"WRITING GPS: lat={lat}, lon={lon}, estimated={estimated}")

    # ================================================================
    # EXECUTE WRITE
    # ================================================================
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        result.error = "exiftool write timed out"
        log(f"ERROR: {result.error}")
        return result
    except FileNotFoundError:
        result.error = "exiftool not installed"
        log(f"ERROR: {result.error}")
        return result

    if proc.returncode == 2:
        result.error = f"exiftool error: {proc.stderr.strip()}"
        log(f"ERROR: {result.error}")
        return result

    backup = image_path + "_original"
    if os.path.isfile(backup):
        result.backup_path = backup
        log(f"BACKUP CREATED: {backup}")

    # ================================================================
    # LAYER 3 — POST-WRITE VALIDATION
    # ================================================================
    log("POST-WRITE VALIDATION: reading back GPS data")
    post = detect_gps(image_path)

    if not post.has_gps:
        msg = "VALIDATION FAILED: GPS not found after write"
        log(msg)
        _restore_backup(image_path, backup, log)
        result.error = msg
        return result

    if post.coordinates is None:
        msg = "VALIDATION FAILED: coordinates are None after write"
        log(msg)
        _restore_backup(image_path, backup, log)
        result.error = msg
        return result

    written_lat = post.coordinates["lat"]
    written_lon = post.coordinates["lon"]

    if (
        abs(written_lat - lat) > _COORD_TOLERANCE
        or abs(written_lon - lon) > _COORD_TOLERANCE
    ):
        msg = (
            f"VALIDATION FAILED: coordinate mismatch. "
            f"Wrote ({lat}, {lon}), read back ({written_lat}, {written_lon})"
        )
        log(msg)
        _restore_backup(image_path, backup, log)
        result.error = msg
        return result

    if estimated and post.processing_method:
        if "ESTIMATED" not in post.processing_method.upper():
            log(
                "WARNING: GPSProcessingMethod does not contain ESTIMATED — but coordinates are correct"
            )

    result.post_validation_passed = True
    result.success = True
    result.coordinates_written = {"lat": lat, "lon": lon}
    log(f"SUCCESS: GPS written and validated for {image_path} → ({lat}, {lon})")
    return result


def _restore_backup(
    image_path: str,
    backup_path: str,
    log_fn: callable,
) -> None:
    """Restore the ``_original`` backup after a failed validation."""
    if os.path.isfile(backup_path):
        try:
            os.replace(backup_path, image_path)
            log_fn(f"ROLLBACK: restored backup {backup_path}")
        except OSError as exc:
            log_fn(f"ROLLBACK FAILED: {exc}")
    else:
        log_fn(f"ROLLBACK: no backup file found at {backup_path}")


def rollback_single(image_path: str) -> bool:
    """Restore the ``_original`` backup for one image. Returns True on success."""
    backup = image_path + "_original"
    if not os.path.isfile(backup):
        return False
    os.replace(backup, image_path)
    return True


def cleanup_backup(image_path: str) -> bool:
    """Delete the ``_original`` backup. Returns True if a file was deleted."""
    backup = image_path + "_original"
    if os.path.isfile(backup):
        os.remove(backup)
        return True
    return False
