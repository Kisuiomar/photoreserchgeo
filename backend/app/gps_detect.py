"""Bulletproof GPS detection across ALL metadata sources.

Uses exiftool (the Perl-based gold standard) to inspect EXIF, XMP, IPTC,
and MakerNote metadata.  Returns a rich ``GPSDetectionResult`` that tells
the caller exactly where GPS data was found, from which source, and
whether it looks like estimated/null-island data.
"""

import logging
import tempfile
from dataclasses import dataclass, field

from app import exiftool

logger = logging.getLogger(__name__)

_NULL_ISLAND_THRESHOLD = 0.0001  # ~11 m at the equator


@dataclass
class GPSDetectionResult:
    """Comprehensive GPS detection outcome."""

    has_gps: bool = False
    """True if GPS coordinates were found in *any* metadata source."""

    sources: list[str] = field(default_factory=list)
    """Which metadata systems contain GPS (e.g. ``["EXIF", "XMP"]``)."""

    coordinates: dict | None = None
    """``{"lat": float, "lon": float}`` — preference: EXIF > XMP > IPTC."""

    is_estimated: bool = False
    """True if ``GPSProcessingMethod`` contains ``"ESTIMATED"``."""

    processing_method: str | None = None
    """Raw value of ``GPSProcessingMethod``, if present."""

    likely_null_island: bool = False
    """True if coordinates are (0, 0) — almost certainly a default value."""

    raw_gps_tags: dict = field(default_factory=dict)
    """Every GPS-related tag found across all metadata groups."""

    error: str | None = None
    """Non-``None`` if detection itself failed (corrupt file, etc.)."""


# ---- internal helpers --------------------------------------------------------


def _try_float(val: object) -> float | None:
    try:
        return float(val)  # type: ignore[arg-type]
    except (ValueError, TypeError):
        return None


def _is_null_island(lat: float, lon: float) -> bool:
    return abs(lat) < _NULL_ISLAND_THRESHOLD and abs(lon) < _NULL_ISLAND_THRESHOLD


def _record_source(
    result: GPSDetectionResult,
    source_name: str,
    lat: float,
    lon: float,
) -> None:
    """Register a GPS hit from *source_name*."""
    result.has_gps = True
    result.sources.append(source_name)
    if _is_null_island(lat, lon):
        result.likely_null_island = True
    # First valid source wins for .coordinates (EXIF checked first)
    if result.coordinates is None:
        result.coordinates = {"lat": round(lat, 6), "lon": round(lon, 6)}


# ---- core extraction ---------------------------------------------------------


def extract_gps_from_tags(tags: dict) -> GPSDetectionResult:
    """Parse an exiftool tag dict and detect GPS from every metadata group.

    This is the workhorse — called by both ``detect_gps()`` (file-based)
    and ``exif.extract()`` (bytes-based, via shared tmpfile).
    """
    result = GPSDetectionResult()

    # 1. Collect every GPS-related tag for debugging / transparency
    for key, val in tags.items():
        kl = key.lower()
        if "gps" in kl or "latitude" in kl or "longitude" in kl:
            result.raw_gps_tags[key] = val

    # 2. GPSProcessingMethod
    pm = tags.get("GPS:GPSProcessingMethod") or tags.get("EXIF:GPSProcessingMethod")
    if pm is not None:
        result.processing_method = str(pm)
        if "ESTIMATED" in str(pm).upper():
            result.is_estimated = True

    # 3. EXIF GPS (highest priority)
    #    Prefer Composite values (already correctly signed by exiftool).
    #    Fall back to GPS: / EXIF: groups with manual ref-sign application.
    clat = _try_float(tags.get("Composite:GPSLatitude"))
    clon = _try_float(tags.get("Composite:GPSLongitude"))
    if clat is not None and clon is not None:
        _record_source(result, "EXIF", clat, clon)
    else:
        for pfx in ("GPS:", "EXIF:"):
            rlat = _try_float(tags.get(f"{pfx}GPSLatitude"))
            rlon = _try_float(tags.get(f"{pfx}GPSLongitude"))
            if rlat is None or rlon is None:
                continue
            lat_ref = str(
                tags.get(f"{pfx}GPSLatitudeRef")
                or tags.get("GPS:GPSLatitudeRef")
                or tags.get("EXIF:GPSLatitudeRef")
                or "N"
            )
            lon_ref = str(
                tags.get(f"{pfx}GPSLongitudeRef")
                or tags.get("GPS:GPSLongitudeRef")
                or tags.get("EXIF:GPSLongitudeRef")
                or "E"
            )
            if lat_ref.upper().startswith("S"):
                rlat = -abs(rlat)
            if lon_ref.upper().startswith("W"):
                rlon = -abs(rlon)
            _record_source(result, "EXIF", rlat, rlon)
            break

    # 4. XMP GPS (XMP values are typically already signed)
    xlat = _try_float(tags.get("XMP-exif:GPSLatitude"))
    xlon = _try_float(tags.get("XMP-exif:GPSLongitude"))
    if xlat is not None and xlon is not None:
        _record_source(result, "XMP", xlat, xlon)

    # 5. IPTC (rare, but possible)
    for key in tags:
        if not key.startswith("IPTC:"):
            continue
        kl = key.lower()
        if "latitude" not in kl:
            continue
        lon_key = key.replace("Latitude", "Longitude").replace("latitude", "longitude")
        ilat = _try_float(tags.get(key))
        ilon = _try_float(tags.get(lon_key))
        if ilat is not None and ilon is not None:
            _record_source(result, "IPTC", ilat, ilon)
        break  # only one IPTC source expected

    # 6. Any other group containing GPS fields not already caught
    for key, val in tags.items():
        group = key.split(":")[0] if ":" in key else ""
        if group in (
            "GPS",
            "EXIF",
            "Composite",
            "XMP-exif",
            "IPTC",
            "SourceFile",
            "File",
            "ExifTool",
        ):
            continue
        kl = key.lower()
        if "gpslatitude" in kl and "ref" not in kl:
            lon_key_guess = key.replace("Latitude", "Longitude").replace(
                "latitude", "longitude"
            )
            olat = _try_float(val)
            olon = _try_float(tags.get(lon_key_guess))
            if olat is not None and olon is not None:
                _record_source(result, group or "OTHER", olat, olon)

    return result


# ---- public API --------------------------------------------------------------


def detect_gps(image_path: str) -> GPSDetectionResult:
    """Detect GPS in *image_path* by checking all metadata sources."""
    try:
        tags = exiftool.read_metadata(image_path)
        if not tags:
            return GPSDetectionResult(error="No metadata could be read")
        return extract_gps_from_tags(tags)
    except Exception as exc:
        logger.exception("GPS detection failed for %s", image_path)
        return GPSDetectionResult(error=str(exc))


def detect_gps_batch(image_paths: list[str]) -> list[GPSDetectionResult]:
    """Batch-detect GPS across multiple files with minimal subprocess calls."""
    if not image_paths:
        return []
    try:
        all_tags = exiftool.read_metadata_batch(image_paths)
        return [extract_gps_from_tags(t) for t in all_tags]
    except Exception as exc:
        logger.exception("Batch GPS detection failed")
        return [GPSDetectionResult(error=str(exc)) for _ in image_paths]


def detect_gps_from_bytes(
    image_bytes: bytes, suffix: str = ".jpg"
) -> GPSDetectionResult:
    """Detect GPS on in-memory bytes (writes to tmpfs briefly)."""
    try:
        with tempfile.NamedTemporaryFile(
            dir="/dev/shm", suffix=suffix, delete=True
        ) as tmp:
            tmp.write(image_bytes)
            tmp.flush()
            return detect_gps(tmp.name)
    except OSError:
        # /dev/shm unavailable — fall back to default tmpdir
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(image_bytes)
            tmp.flush()
            return detect_gps(tmp.name)
