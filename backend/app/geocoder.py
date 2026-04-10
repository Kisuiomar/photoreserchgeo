import logging

import pycountry
import reverse_geocoder as rg

logger = logging.getLogger(__name__)


def init() -> None:
    """Pre-load the reverse geocoder dataset so first real query is fast."""
    logger.info("Initializing reverse geocoder...")
    rg.search([(0, 0)])
    logger.info("Reverse geocoder ready")


def lookup(lat: float, lon: float) -> dict | None:
    """Reverse-geocode a coordinate to city / region / country."""
    try:
        results = rg.search([(lat, lon)])
        if not results:
            return None
        r = results[0]
        cc = r.get("cc", "")
        country = pycountry.countries.get(alpha_2=cc)
        return {
            "city": r.get("name"),
            "region": r.get("admin1"),
            "country": country.name if country else cc,
            "country_code": cc,
        }
    except Exception:
        logger.exception("Reverse geocoding failed for (%s, %s)", lat, lon)
        return None
