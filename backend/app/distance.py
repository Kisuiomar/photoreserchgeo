import math

_R = 6371.0  # Earth mean radius in km


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in km between two WGS-84 points."""
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2.0) ** 2
    )
    return _R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def compute_benchmark(
    predictions: list[dict],
    real_lat: float,
    real_lon: float,
) -> dict:
    """Build the benchmark object comparing predictions to a known location."""
    distances = [
        round(haversine(real_lat, real_lon, p["lat"], p["lon"]), 3) for p in predictions
    ]

    best_idx = int(min(range(len(distances)), key=lambda i: distances[i]))

    return {
        "top1_distance_km": distances[0],
        "best_distance_km": distances[best_idx],
        "best_prediction_rank": best_idx + 1,
        "distances": distances,
    }
