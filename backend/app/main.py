import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, File, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import distance, exif, geocoder, model
from app.config import settings
from app.routes_edit import router as edit_router
from app.routes_scan import router as scan_router

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".tiff",
    ".tif",
    ".bmp",
    ".heic",
}
ALLOWED_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/tiff",
    "image/bmp",
    "image/heic",
}
MAX_FILE_SIZE = 50 * 1024 * 1024


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    model.load()
    geocoder.init()
    yield


app = FastAPI(title="WhereWasThisTaken?", lifespan=lifespan)
app.include_router(scan_router)
app.include_router(edit_router)

# The API is meant to be reached only from the frontend running on the same
# machine.  CORS is pinned to the single expected origin (127.0.0.1 + localhost
# on the configured port) and limited to the verbs the frontend actually uses.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://localhost:{settings.port}",
        f"http://127.0.0.1:{settings.port}",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422, content={"error": "validation_error", "detail": exc.errors()}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Log with stacktrace for the operator, but never return the raw
    # exception message to the client: it can leak filesystem paths,
    # library internals and other noise that has no business in an
    # HTTP response body.
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred. Check the server logs for details.",
        },
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "model_loaded": model.is_loaded()}


@app.get("/api/system-status")
async def system_status() -> dict:
    """Return memory usage and model state for the header indicator.

    Model states:
      * ``downloaded``: on disk but not loaded in RAM (Free RAM was clicked)
      * ``loaded``: in RAM, ready to answer predictions

    ``not_downloaded`` can't happen here because the backend blocks
    startup until the weights are on disk (see ``model.load``).
    """
    import os
    import psutil

    proc = psutil.Process(os.getpid())
    mem = psutil.virtual_memory()
    proc_rss = proc.memory_info().rss

    loaded = model.is_loaded()
    downloaded = model.is_downloaded() or loaded
    state = "loaded" if loaded else ("downloaded" if downloaded else "not_downloaded")

    return {
        "memory_used_gb": round(mem.used / (1024**3), 1),
        "memory_total_gb": round(mem.total / (1024**3), 1),
        "memory_percent": mem.percent,
        "process_memory_gb": round(proc_rss / (1024**3), 2),
        "model_state": state,
        "model_loaded": loaded,
        "model_downloaded": downloaded,
    }


@app.post("/api/unload-models")
async def unload_models() -> dict:
    was = model.is_loaded()
    model.unload()
    return {"unloaded": True, "was_loaded": was}


def _validate_image_file(file: UploadFile, image_bytes: bytes) -> None:
    if len(image_bytes) > MAX_FILE_SIZE:
        raise StarletteHTTPException(
            400, f"File too large ({len(image_bytes)} bytes). Max: 50 MB."
        )
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    mime = file.content_type or ""
    if ext not in ALLOWED_EXTENSIONS and mime not in ALLOWED_MIMES:
        raise StarletteHTTPException(400, f"Invalid file type '{ext or mime}'.")


def _process_image(image_bytes: bytes, top_k: int) -> dict:
    """Run GeoCLIP inference + EXIF extraction + reverse geocoding."""
    start = time.perf_counter()

    exif_data = exif.extract(image_bytes)
    predictions = model.predict(image_bytes, top_k=top_k)

    for pred in predictions:
        pred["address"] = geocoder.lookup(pred["lat"], pred["lon"])

    real_location = None
    if exif_data["has_gps"]:
        gps = exif_data["gps"]
        real_location = {
            "lat": gps["lat"],
            "lon": gps["lon"],
            "address": geocoder.lookup(gps["lat"], gps["lon"]),
            "source": "exif",
        }

    benchmark = None
    if real_location:
        benchmark = distance.compute_benchmark(
            predictions, real_location["lat"], real_location["lon"]
        )

    elapsed_ms = int((time.perf_counter() - start) * 1000)

    return {
        "predictions": predictions,
        "real_location": real_location,
        "benchmark": benchmark,
        "image_metadata": {
            "camera": exif_data["camera"],
            "date_taken": exif_data["date_taken"],
            "width": exif_data["width"],
            "height": exif_data["height"],
            "has_gps": exif_data["has_gps"],
        },
        "processing_time_ms": elapsed_ms,
    }


@app.post("/api/predict")
async def predict(
    file: UploadFile = File(...),
    top_k: int = Query(default=settings.geoclip_top_k, ge=1, le=100),
) -> dict:
    image_bytes = await file.read()
    _validate_image_file(file, image_bytes)
    return _process_image(image_bytes, top_k)


@app.post("/api/predict/batch")
async def predict_batch(
    files: list[UploadFile] = File(...),
    top_k: int = Query(default=settings.geoclip_top_k, ge=1, le=100),
) -> list[dict]:
    results: list[dict] = []
    for file in files:
        try:
            image_bytes = await file.read()
            _validate_image_file(file, image_bytes)
            result = _process_image(image_bytes, top_k)
            result["filename"] = file.filename
            results.append(result)
        except StarletteHTTPException as exc:
            results.append({"filename": file.filename, "error": exc.detail})
        except Exception as exc:
            logger.exception("Failed to process %s", file.filename)
            results.append({"filename": file.filename, "error": str(exc)})
    return results
