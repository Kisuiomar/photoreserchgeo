"""FastAPI router for Edit Mode endpoints."""

import os

from fastapi import APIRouter, Query
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import forward_geocoder, geocoder
from app.config import settings
from app.edit_session import edit_manager

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class EditStartRequest(BaseModel):
    directory: str = ""


class ManualReviewRequest(BaseModel):
    address: str = ""
    lat: float | None = None
    lon: float | None = None


class GeocodeRequest(BaseModel):
    address: str


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------


def _resolve_path(directory: str) -> str:
    base = os.path.realpath(settings.photos_dir)
    stripped = directory.lstrip("/")
    target = os.path.realpath(os.path.join(base, stripped))
    if not target.startswith(base):
        raise StarletteHTTPException(400, "Path traversal not allowed")
    if not os.path.isdir(target):
        raise StarletteHTTPException(400, f"Directory not found: {directory or '/'}")
    return target


def _require_edit_mode() -> None:
    """Raise 403 if edit mode is disabled."""
    if not settings.edit_mode_enabled:
        raise StarletteHTTPException(
            403,
            "Edit mode is disabled. Set EDIT_MODE_ENABLED=true in .env and restart.",
        )


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------


@router.post("/edit/start")
async def start_edit(body: EditStartRequest) -> dict:
    target = _resolve_path(body.directory)
    return edit_manager.create_session(target)


@router.post("/edit/{session_id}/run")
async def run_inference(session_id: str) -> dict:
    try:
        edit_manager.start_inference(session_id)
        return {"status": "running", "session_id": session_id}
    except (RuntimeError, ValueError) as exc:
        raise StarletteHTTPException(409, str(exc))


@router.post("/edit/{session_id}/pause")
async def pause_inference(session_id: str) -> dict:
    try:
        edit_manager.pause(session_id)
        return {"status": "pausing", "session_id": session_id}
    except ValueError as exc:
        raise StarletteHTTPException(400, str(exc))


@router.post("/edit/{session_id}/resume")
async def resume_inference(session_id: str) -> dict:
    try:
        edit_manager.resume(session_id)
        return {"status": "running", "session_id": session_id}
    except (RuntimeError, ValueError) as exc:
        raise StarletteHTTPException(409, str(exc))


@router.get("/edit/{session_id}/status")
async def edit_status(session_id: str) -> dict:
    status = edit_manager.get_status(session_id)
    if status is None:
        raise StarletteHTTPException(404, "Session not found")
    return status


@router.get("/edit/sessions")
async def list_sessions() -> list[dict]:
    return edit_manager.list_sessions()


@router.get("/edit/{session_id}")
async def get_session(session_id: str) -> dict:
    session = edit_manager.get_session(session_id)
    if session is None:
        raise StarletteHTTPException(404, "Session not found")
    summary = {k: v for k, v in session.items() if k != "queue"}
    summary["queue_length"] = len(session["queue"])
    return summary


# ---------------------------------------------------------------------------
# Review queue
# ---------------------------------------------------------------------------


@router.get("/edit/{session_id}/queue")
async def get_queue(
    session_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
) -> dict:
    items = edit_manager.get_queue(session_id, offset, limit)
    session = edit_manager.get_session(session_id)
    total = len(session["queue"]) if session else 0
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/edit/{session_id}/queue/next")
async def next_for_review(session_id: str) -> dict:
    item = edit_manager.get_next_for_review(session_id)
    if item is None:
        raise StarletteHTTPException(404, "No items pending review")
    return item


# ---------------------------------------------------------------------------
# Review decisions
# ---------------------------------------------------------------------------


@router.post("/edit/{session_id}/review/{image_id}/accept")
async def accept_review(session_id: str, image_id: str) -> dict:
    item = edit_manager.review_accept(session_id, image_id)
    if item is None:
        raise StarletteHTTPException(404, "Image not found in queue")
    return {
        "status": "accepted",
        "image_id": image_id,
        "coordinates": item.get("review_coordinates"),
    }


@router.post("/edit/{session_id}/review/{image_id}/reject")
async def reject_review(session_id: str, image_id: str) -> dict:
    item = edit_manager.review_reject(session_id, image_id)
    if item is None:
        raise StarletteHTTPException(404, "Image not found in queue")
    return {"status": "rejected", "image_id": image_id}


@router.post("/edit/{session_id}/review/{image_id}/manual")
async def manual_review(
    session_id: str, image_id: str, body: ManualReviewRequest
) -> dict:
    lat, lon = body.lat, body.lon
    display = None

    if body.address and lat is None:
        result = forward_geocoder.geocode(body.address)
        if result is None:
            raise StarletteHTTPException(
                400, f"Could not geocode address: '{body.address}'"
            )
        lat, lon = result["lat"], result["lon"]
        display = result["display_name"]
    elif lat is None or lon is None:
        raise StarletteHTTPException(
            400, "Provide either an address or lat/lon coordinates"
        )

    item = edit_manager.review_manual(session_id, image_id, lat, lon)
    if item is None:
        raise StarletteHTTPException(404, "Image not found in queue")

    addr = geocoder.lookup(lat, lon)
    return {
        "status": "manual",
        "image_id": image_id,
        "coordinates": {"lat": lat, "lon": lon},
        "address": addr,
        "geocoded_display": display,
    }


# ---------------------------------------------------------------------------
# Apply (write GPS) — requires edit mode enabled
# ---------------------------------------------------------------------------


@router.post("/edit/{session_id}/apply")
async def apply_all(session_id: str) -> dict:
    _require_edit_mode()
    try:
        return edit_manager.apply_all(session_id)
    except ValueError as exc:
        raise StarletteHTTPException(404, str(exc))


@router.post("/edit/{session_id}/apply/{image_id}")
async def apply_single(session_id: str, image_id: str) -> dict:
    _require_edit_mode()
    try:
        return edit_manager.apply_single(session_id, image_id)
    except ValueError as exc:
        raise StarletteHTTPException(404, str(exc))


# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------


@router.post("/edit/{session_id}/rollback/{image_id}")
async def rollback_single(session_id: str, image_id: str) -> dict:
    _require_edit_mode()
    try:
        return edit_manager.rollback_single(session_id, image_id)
    except ValueError as exc:
        raise StarletteHTTPException(404, str(exc))


@router.post("/edit/{session_id}/rollback-all")
async def rollback_all(session_id: str) -> dict:
    _require_edit_mode()
    try:
        return edit_manager.rollback_all(session_id)
    except ValueError as exc:
        raise StarletteHTTPException(404, str(exc))


# ---------------------------------------------------------------------------
# Backup cleanup
# ---------------------------------------------------------------------------


@router.post("/edit/{session_id}/cleanup-backups")
async def cleanup_backups(session_id: str) -> dict:
    _require_edit_mode()
    try:
        return edit_manager.cleanup_backups(session_id)
    except ValueError as exc:
        raise StarletteHTTPException(404, str(exc))


# ---------------------------------------------------------------------------
# Forward geocoding (standalone)
# ---------------------------------------------------------------------------


@router.post("/geocode")
async def geocode_address(body: GeocodeRequest) -> dict:
    result = forward_geocoder.geocode(body.address)
    if result is None:
        raise StarletteHTTPException(400, f"Could not geocode: '{body.address}'")
    return result
