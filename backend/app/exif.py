"""Image metadata extraction — refactored to use exiftool internally.

The public ``extract(image_bytes)`` function returns the same dict shape
as the original Pillow-based implementation so that ``/api/predict``
responses are unchanged.
"""

import io
import logging
import tempfile

from PIL import Image

from app import exiftool
from app.gps_detect import extract_gps_from_tags

logger = logging.getLogger(__name__)


def _guess_suffix(data: bytes) -> str:
    """Guess an image file extension from magic bytes."""
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:4] in (b"II*\x00", b"MM\x00*"):
        return ".tiff"
    if len(data) > 11 and data[4:12] in (b"ftypheic", b"ftypmif1", b"ftypheis"):
        return ".heic"
    return ".jpg"


def _int_or_none(val: object) -> int | None:
    if val is None:
        return None
    try:
        return int(val)  # type: ignore[arg-type]
    except (ValueError, TypeError):
        return None


def extract(image_bytes: bytes) -> dict:
    """Extract metadata and GPS from in-memory image bytes.

    Returns::

        {
            "gps": {"lat": float, "lon": float} | None,
            "camera": str | None,
            "date_taken": str | None,   # ISO-ish, e.g. "2019-07-14T15:30:00"
            "width": int | None,
            "height": int | None,
            "has_gps": bool,
        }

    GPS handling: (0, 0) coordinates (null island) are treated as *no GPS*
    for backward compatibility with the Testing-mode predict endpoint.
    """
    result: dict = {
        "gps": None,
        "camera": None,
        "date_taken": None,
        "width": None,
        "height": None,
        "has_gps": False,
    }

    # --- dimensions via PIL (most reliable for actual pixel size) ---
    try:
        img = Image.open(io.BytesIO(image_bytes))
        result["width"], result["height"] = img.size
    except Exception:
        pass

    # --- everything else via exiftool ---
    suffix = _guess_suffix(image_bytes)
    try:
        tmpdir = "/dev/shm"
        try:
            tmp = tempfile.NamedTemporaryFile(dir=tmpdir, suffix=suffix, delete=True)
        except OSError:
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=True)

        with tmp:
            tmp.write(image_bytes)
            tmp.flush()
            tags = exiftool.read_metadata(tmp.name)
    except Exception:
        logger.exception("exiftool metadata extraction failed")
        return result

    if not tags:
        return result

    # Camera model
    model_name = tags.get("EXIF:Model")
    make_name = tags.get("EXIF:Make")
    if model_name:
        result["camera"] = str(model_name).strip()
    elif make_name:
        result["camera"] = str(make_name).strip()

    # Date taken
    date_str = tags.get("EXIF:DateTimeOriginal") or tags.get("EXIF:CreateDate")
    if date_str and isinstance(date_str, str):
        try:
            parts = date_str.strip().split(" ", 1)
            date_part = parts[0].replace(":", "-")
            time_part = parts[1] if len(parts) > 1 else "00:00:00"
            result["date_taken"] = f"{date_part}T{time_part}"
        except (IndexError, ValueError):
            pass

    # Dimensions fallback (if PIL couldn't get them)
    if result["width"] is None:
        result["width"] = _int_or_none(
            tags.get("File:ImageWidth")
            or tags.get("EXIF:ImageWidth")
            or tags.get("EXIF:ExifImageWidth")
        )
    if result["height"] is None:
        result["height"] = _int_or_none(
            tags.get("File:ImageHeight")
            or tags.get("EXIF:ImageHeight")
            or tags.get("EXIF:ExifImageHeight")
        )

    # GPS detection (comprehensive, across EXIF + XMP + IPTC)
    gps_result = extract_gps_from_tags(tags)

    # Backward compat: null-island → treat as no GPS
    if gps_result.has_gps and not gps_result.likely_null_island:
        result["gps"] = gps_result.coordinates
        result["has_gps"] = True

    return result
