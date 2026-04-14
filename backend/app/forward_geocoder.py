"""Forward geocoding: address string → GPS coordinates via Nominatim."""

import logging
import threading
import time

from geopy.geocoders import Nominatim

logger = logging.getLogger(__name__)

_geolocator = Nominatim(user_agent="findmyphoto-edit-mode/1.0")
_rate_lock = threading.Lock()
_last_request = 0.0


def geocode(address: str) -> dict | None:
    """Convert *address* to ``{"lat", "lon", "display_name"}``.

    Rate-limited to 1 request/sec per Nominatim usage policy.
    Returns ``None`` if the address cannot be resolved.
    """
    global _last_request

    with _rate_lock:
        elapsed = time.time() - _last_request
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        _last_request = time.time()

    try:
        location = _geolocator.geocode(address, timeout=10)
    except Exception:
        logger.exception("Nominatim geocode failed for '%s'", address)
        return None

    if location is None:
        return None

    return {
        "lat": round(location.latitude, 6),
        "lon": round(location.longitude, 6),
        "display_name": location.address,
    }
