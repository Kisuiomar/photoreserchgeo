"""FastAPI router for directory scanning and snapshot endpoints."""

import os

from fastapi import APIRouter, Query
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import snapshots
from app.config import settings
from app.scanner import scan_manager

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class ScanRequest(BaseModel):
    directory: str = ""


class SnapshotRequest(BaseModel):
    name: str = ""


# ---------------------------------------------------------------------------
# Path security
# ---------------------------------------------------------------------------


def _resolve_photos_path(directory: str) -> str:
    """Resolve *directory* within /photos and reject traversals."""
    base = os.path.realpath(settings.photos_dir)
    stripped = directory.lstrip("/")
    target = os.path.realpath(os.path.join(base, stripped))

    if not target.startswith(base):
        raise StarletteHTTPException(400, "Path traversal not allowed")
    if not os.path.isdir(target):
        raise StarletteHTTPException(400, f"Directory not found: {directory or '/'}")
    return target


# ---------------------------------------------------------------------------
# Scan endpoints
# ---------------------------------------------------------------------------


@router.post("/scan")
async def start_scan(body: ScanRequest) -> dict:
    target = _resolve_photos_path(body.directory)
    try:
        scan_id = scan_manager.start(target)
    except RuntimeError as exc:
        raise StarletteHTTPException(409, str(exc))
    return {"scan_id": scan_id, "status": "scanning", "directory": target}


@router.get("/scan/{scan_id}/status")
async def scan_status(scan_id: str) -> dict:
    status = scan_manager.get_status(scan_id)
    if status is None:
        raise StarletteHTTPException(404, "Scan not found")
    return status


@router.get("/scan/{scan_id}/results")
async def scan_results(
    scan_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(0, ge=0),
) -> dict:
    results = scan_manager.get_results(scan_id)
    if results is None:
        status = scan_manager.get_status(scan_id)
        if status and status["status"] == "scanning":
            raise StarletteHTTPException(202, "Scan still in progress")
        raise StarletteHTTPException(404, "Scan not found or no results")

    # Optionally paginate the images list
    out = dict(results)
    if limit > 0:
        out["images"] = results["images"][offset : offset + limit]
        out["images_total"] = len(results["images"])
    return out


# ---------------------------------------------------------------------------
# Snapshot endpoints
# ---------------------------------------------------------------------------


@router.post("/scan/{scan_id}/snapshot")
async def save_snapshot(scan_id: str, body: SnapshotRequest) -> dict:
    results = scan_manager.get_results(scan_id)
    if results is None:
        raise StarletteHTTPException(404, "Scan not found or not complete")
    name = body.name or scan_id
    return snapshots.save(name, results)


@router.get("/snapshots")
async def list_snapshots() -> list[dict]:
    return snapshots.list_all()


@router.get("/snapshots/compare")
async def compare_snapshots(
    a: str = Query(..., description="Name of first snapshot"),
    b: str = Query(..., description="Name of second snapshot"),
) -> dict:
    snap_a = snapshots.load(a)
    if snap_a is None:
        raise StarletteHTTPException(404, f"Snapshot '{a}' not found")
    snap_b = snapshots.load(b)
    if snap_b is None:
        raise StarletteHTTPException(404, f"Snapshot '{b}' not found")
    return snapshots.compare(snap_a, snap_b)


@router.get("/snapshots/{name}")
async def get_snapshot(name: str) -> dict:
    snap = snapshots.load(name)
    if snap is None:
        raise StarletteHTTPException(404, f"Snapshot '{name}' not found")
    return snap
