"""Library context: derive location hints from ALL available signals.

Signal sources (strongest → weakest, from Groups B + D):
  B.1  Burst / companion device — within 5 minutes
  D.13 Filename sequence neighbors — sequential shots in same folder
  B.2  Same-day cluster — same calendar day
  B.3  Gap interpolation — GPS before AND after, speed-constrained
  D.12 Folder name geocoding — parse folder path for place names
  D.14 CLIP visual similarity — similar-looking photos share location

For each GPS-less image, ALL sources are tried and the strongest hint wins.
"""

import logging
import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

import torch
from PIL import Image

from app.distance import haversine

logger = logging.getLogger(__name__)

_BURST_SECONDS = 300
_MAX_TRAVEL_SPEED_KMH = 900
_CLIP_SIMILARITY_THRESHOLD = 0.85  # cosine similarity for visual match
_SEQUENCE_GAP_MAX = 5  # max filename number gap for sequence hint


@dataclass
class LocationHint:
    lat: float
    lon: float
    confidence: float
    source: str
    sigma_km: float
    reference_image: str
    time_delta_seconds: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def compute_hints(
    all_images: list[dict],
    target_paths: set[str],
) -> dict[str, dict]:
    """Compute the best location hint for each GPS-less image.

    Tries all signal sources and keeps the strongest per image.
    """
    gps_images = [
        img for img in all_images if img.get("has_gps") and img.get("coordinates")
    ]
    target_images = [img for img in all_images if img["path"] in target_paths]

    if not target_images:
        return {}

    hints: dict[str, dict] = {}
    counts: dict[str, int] = defaultdict(int)

    # Pre-compute per-source hints
    temporal = _temporal_hints(target_images, gps_images)
    sequence = _sequence_hints(target_images, gps_images)
    folder = _folder_hints(target_images)
    visual = _visual_similarity_hints(target_images, gps_images)

    # For each target, pick the strongest hint
    for img in target_images:
        path = img["path"]
        candidates = []
        if path in temporal:
            candidates.append(temporal[path])
        if path in sequence:
            candidates.append(sequence[path])
        if path in folder:
            candidates.append(folder[path])
        if path in visual:
            candidates.append(visual[path])

        if candidates:
            best = max(candidates, key=lambda h: h.confidence)
            hints[path] = best.to_dict()
            counts[best.source] += 1

    parts = ", ".join(f"{c} {s}" for s, c in sorted(counts.items()))
    logger.info(
        "Library context: %d/%d images got hints (%s)",
        len(hints),
        len(target_images),
        parts or "none",
    )
    return hints


# ---------------------------------------------------------------------------
# Group B: Temporal signals
# ---------------------------------------------------------------------------


def _temporal_hints(
    targets: list[dict], gps_images: list[dict]
) -> dict[str, LocationHint]:
    gps_dated = []
    for img in gps_images:
        dt = _parse_dt(img.get("date_taken"))
        if dt:
            gps_dated.append((img, dt))
    if not gps_dated:
        return {}
    gps_dated.sort(key=lambda x: x[1])

    result: dict[str, LocationHint] = {}
    for target in targets:
        dt = _parse_dt(target.get("date_taken"))
        if not dt:
            continue
        hint = _best_temporal_hint(target, dt, gps_dated)
        if hint:
            result[target["path"]] = hint
    return result


def _best_temporal_hint(
    target: dict,
    target_dt: datetime,
    gps_sorted: list[tuple[dict, datetime]],
) -> LocationHint | None:
    # Find closest by time
    closest_img = None
    closest_dt = None
    closest_delta = float("inf")
    for gps_img, gps_dt in gps_sorted:
        delta = abs((target_dt - gps_dt).total_seconds())
        if delta < closest_delta:
            closest_delta = delta
            closest_img = gps_img
            closest_dt = gps_dt

    # Burst
    if closest_img and closest_delta <= _BURST_SECONDS:
        c = closest_img["coordinates"]
        conf = 0.95 - (closest_delta / _BURST_SECONDS) * 0.10
        return LocationHint(
            c["lat"],
            c["lon"],
            round(conf, 3),
            "burst",
            max(1, closest_delta / 60),
            closest_img["path"],
            closest_delta,
        )

    # Same day
    if closest_img and closest_dt and target_dt.date() == closest_dt.date():
        c = closest_img["coordinates"]
        hours = closest_delta / 3600
        conf = max(0.3, 0.7 - hours * 0.033)
        sigma = min(500, 30 + hours * 40)
        return LocationHint(
            c["lat"],
            c["lon"],
            round(conf, 3),
            "same_day",
            round(sigma, 1),
            closest_img["path"],
            closest_delta,
        )

    # Gap interpolation
    before = after = None
    for gps_img, gps_dt in gps_sorted:
        if gps_dt <= target_dt:
            before = (gps_img, gps_dt)
        elif gps_dt > target_dt and after is None:
            after = (gps_img, gps_dt)
            break

    if before and after:
        total_sec = (after[1] - before[1]).total_seconds()
        if total_sec <= 0:
            return None
        elapsed = (target_dt - before[1]).total_seconds()
        ratio = elapsed / total_sec
        bc, ac = before[0]["coordinates"], after[0]["coordinates"]
        dist = haversine(bc["lat"], bc["lon"], ac["lat"], ac["lon"])
        speed = dist / (total_sec / 3600) if total_sec > 0 else 0
        if speed > _MAX_TRAVEL_SPEED_KMH:
            return None
        lat = bc["lat"] + ratio * (ac["lat"] - bc["lat"])
        lon = bc["lon"] + ratio * (ac["lon"] - bc["lon"])
        sigma = max(20, dist * 0.3)
        hours = total_sec / 3600
        conf = max(0.2, 0.6 - hours * 0.02 - dist / 5000 * 0.2)
        return LocationHint(
            round(lat, 6),
            round(lon, 6),
            round(conf, 3),
            "interpolation",
            round(sigma, 1),
            before[0]["path"],
            elapsed,
        )

    return None


# ---------------------------------------------------------------------------
# Group D.12: Folder name geocoding
# ---------------------------------------------------------------------------

_SKIP_WORDS = frozenset(
    {
        "photos",
        "photo",
        "pictures",
        "images",
        "image",
        "img",
        "dcim",
        "camera",
        "misc",
        "other",
        "backup",
        "export",
        "edit",
        "edited",
        "raw",
        "jpeg",
        "jpg",
        "png",
        "originals",
        "downloads",
        "desktop",
        "documents",
        "home",
        "user",
        "users",
        "tmp",
        "temp",
    }
)

_folder_cache: dict[str, tuple[float, float] | None] = {}


def _extract_place_candidates(path: str) -> list[str]:
    """Extract potential place names from folder path components."""
    parts = Path(path).parent.parts
    candidates = []
    for part in reversed(parts):
        # Remove year patterns and clean
        cleaned = re.sub(r"\b(19|20)\d{2}\b", "", part).strip(" -_/")
        if not cleaned or cleaned.lower() in _SKIP_WORDS:
            continue
        # Remove common prefixes/suffixes
        cleaned = re.sub(
            r"\b(trip|vacation|holiday|reise|urlaub)\b",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip(" -_")
        if len(cleaned) >= 3:
            candidates.append(cleaned)
    return candidates


def _folder_hints(targets: list[dict]) -> dict[str, LocationHint]:
    from app.forward_geocoder import geocode

    # Group targets by directory
    by_dir: dict[str, list[dict]] = defaultdict(list)
    for img in targets:
        by_dir[str(Path(img["path"]).parent)].append(img)

    result: dict[str, LocationHint] = {}

    for dirpath, images in by_dir.items():
        if dirpath in _folder_cache:
            coords = _folder_cache[dirpath]
        else:
            coords = None
            candidates = _extract_place_candidates(images[0]["path"])
            for candidate in candidates:
                geo = geocode(candidate)
                if geo:
                    coords = (geo["lat"], geo["lon"])
                    break
            _folder_cache[dirpath] = coords

        if coords:
            for img in images:
                result[img["path"]] = LocationHint(
                    coords[0],
                    coords[1],
                    0.5,
                    "folder_name",
                    150,
                    dirpath,
                    0,
                )

    if result:
        logger.info(
            "Folder geocoding: %d hints from %d directories", len(result), len(by_dir)
        )
    return result


# ---------------------------------------------------------------------------
# Group D.13: Filename sequence interpolation
# ---------------------------------------------------------------------------

_NUM_RE = re.compile(r"(\d{3,})")


def _extract_sequence_number(filename: str) -> int | None:
    """Extract the numeric sequence from a camera filename."""
    match = _NUM_RE.search(Path(filename).stem)
    return int(match.group(1)) if match else None


def _sequence_hints(
    targets: list[dict], gps_images: list[dict]
) -> dict[str, LocationHint]:
    # Group ALL images by directory
    by_dir: dict[str, list[dict]] = defaultdict(list)
    for img in gps_images:
        by_dir[str(Path(img["path"]).parent)].append(img)

    target_set = {img["path"] for img in targets}
    result: dict[str, LocationHint] = {}

    for target in targets:
        target_dir = str(Path(target["path"]).parent)
        target_num = _extract_sequence_number(target["filename"])
        if target_num is None:
            continue

        dir_gps = by_dir.get(target_dir, [])
        if not dir_gps:
            continue

        # Find closest GPS image by sequence number
        best_img = None
        best_gap = float("inf")
        for gps_img in dir_gps:
            gps_num = _extract_sequence_number(
                gps_img.get("filename", Path(gps_img["path"]).name)
            )
            if gps_num is None:
                continue
            gap = abs(target_num - gps_num)
            if gap < best_gap and gap <= _SEQUENCE_GAP_MAX:
                best_gap = gap
                best_img = gps_img

        if best_img and best_img.get("coordinates"):
            c = best_img["coordinates"]
            # Confidence decreases with gap: adjacent=0.8, gap=5 → 0.6
            conf = max(0.55, 0.85 - best_gap * 0.05)
            sigma = max(2, best_gap * 5)
            result[target["path"]] = LocationHint(
                c["lat"],
                c["lon"],
                round(conf, 3),
                "filename_sequence",
                round(sigma, 1),
                best_img["path"],
                0,
            )

    if result:
        logger.info("Filename sequence: %d hints", len(result))
    return result


# ---------------------------------------------------------------------------
# Group D.14: CLIP visual similarity
# ---------------------------------------------------------------------------


def _extract_clip_embedding(image_path: str) -> torch.Tensor | None:
    """Extract a CLIP image embedding using GeoCLIP's internal CLIP."""
    try:
        from app.model import _model as geoclip

        if geoclip is None:
            return None

        img = Image.open(image_path).convert("RGB")
        pixel_values = geoclip.image_encoder.image_processor(
            images=img, return_tensors="pt"
        )["pixel_values"]

        with torch.no_grad():
            features = geoclip.image_encoder.CLIP.get_image_features(
                pixel_values=pixel_values
            )
            # Normalize
            features = features / features.norm(dim=-1, keepdim=True)

        return features[0]
    except Exception:
        return None


def _visual_similarity_hints(
    targets: list[dict], gps_images: list[dict]
) -> dict[str, LocationHint]:
    """Find GPS-less images visually similar to GPS-tagged ones."""
    # Only run within same directory to limit computation
    by_dir_gps: dict[str, list[dict]] = defaultdict(list)
    for img in gps_images:
        by_dir_gps[str(Path(img["path"]).parent)].append(img)

    by_dir_target: dict[str, list[dict]] = defaultdict(list)
    for img in targets:
        d = str(Path(img["path"]).parent)
        if d in by_dir_gps:  # only compare if GPS images exist in same dir
            by_dir_target[d].append(img)

    if not by_dir_target:
        return {}

    result: dict[str, LocationHint] = {}

    for dirpath, dir_targets in by_dir_target.items():
        dir_gps = by_dir_gps[dirpath]

        # Limit to avoid excessive computation
        if len(dir_targets) * len(dir_gps) > 500:
            continue

        # Extract embeddings
        gps_embeddings = []
        for img in dir_gps:
            emb = _extract_clip_embedding(img["path"])
            if emb is not None:
                gps_embeddings.append((img, emb))

        if not gps_embeddings:
            continue

        # Stack GPS embeddings for batch cosine similarity
        gps_stack = torch.stack([e for _, e in gps_embeddings])

        for target in dir_targets:
            if target["path"] in result:
                continue
            target_emb = _extract_clip_embedding(target["path"])
            if target_emb is None:
                continue

            # Cosine similarity against all GPS images in this directory
            sims = torch.nn.functional.cosine_similarity(
                target_emb.unsqueeze(0), gps_stack
            )
            best_idx = int(sims.argmax())
            best_sim = float(sims[best_idx])

            if best_sim >= _CLIP_SIMILARITY_THRESHOLD:
                best_img = gps_embeddings[best_idx][0]
                c = best_img["coordinates"]
                # Confidence scales with similarity: 0.85→0.5, 0.95→0.7
                conf = min(0.7, (best_sim - 0.7) * 2.0)
                conf = max(0.3, conf)
                result[target["path"]] = LocationHint(
                    c["lat"],
                    c["lon"],
                    round(conf, 3),
                    "visual_similarity",
                    30,
                    best_img["path"],
                    0,
                )

    if result:
        logger.info("Visual similarity: %d hints", len(result))
    return result
