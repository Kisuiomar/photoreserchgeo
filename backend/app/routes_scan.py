"""FastAPI router for directory scanning."""

import os

from fastapi import APIRouter, Query
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.scanner import scan_manager

router = APIRouter(prefix="/api")


class ScanRequest(BaseModel):
    directory: str = ""


def _resolve_photos_path(directory: str) -> str:
    base = os.path.realpath(settings.photos_dir)
    stripped = directory.lstrip("/")
    target = os.path.realpath(os.path.join(base, stripped))
    if not target.startswith(base):
        raise StarletteHTTPException(400, "Path traversal not allowed")
    if not os.path.isdir(target):
        raise StarletteHTTPException(400, f"Directory not found: {directory or '/'}")
    return target


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

    out = dict(results)
    if limit > 0:
        out["images"] = results["images"][offset : offset + limit]
        out["images_total"] = len(results["images"])
    return out
