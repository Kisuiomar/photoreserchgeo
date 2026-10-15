import os
import sys
import re
import json
import math
import base64
import subprocess
import requests
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Optional
from PIL import Image

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
except Exception:
    pass

try:
    import torch
except ImportError:
    torch = None

try:
    import cv2
except ImportError:
    cv2 = None

_OCR_READER = None


def get_ocr_reader():
    global _OCR_READER
    if _OCR_READER is None:
        try:
            import easyocr
            _OCR_READER = easyocr.Reader(['ru', 'en'], gpu=(torch is not None and torch.cuda.is_available()), verbose=False)
        except Exception:
            _OCR_READER = False
    return _OCR_READER if _OCR_READER is not False else None


# Опорная сетка городов, городских парков и природных зон Казахстана
KZ_HUBS = [
    ("Almaty, First President Park", 43.1903, 76.8858, 3000, 40),
    ("Almaty, Central Park (Gorky Park)", 43.2625, 76.9686, 2500, 40),
    ("Almaty, Botanical Garden", 43.2197, 76.9136, 2000, 40),
    ("Almaty, Kok-Tobe & Terrenkur", 43.2330, 76.9760, 4000, 50),
    ("Almaty, Panfilov Park & Arbat", 43.2588, 76.9535, 3000, 40),
    ("Almaty City", 43.2389, 76.8897, 20000, 200),
    ("Almaty, Medeu & Shymbulak", 43.1575, 77.0589, 7000, 80),
    ("Almaty, Big Almaty Lake", 43.0506, 76.9850, 5000, 100),
    ("Astana, Central Park & Botanical Garden", 51.1280, 71.4300, 18000, 180),
    ("Burabay (Borovoe), Zhumbaktas Rock", 53.0837, 70.2709, 8000, 60),
    ("Shymkent, Parks & City", 42.3417, 69.5901, 15000, 200),
    ("Karaganda, Central Park & City", 49.8047, 73.1094, 14000, 200),
    ("Aktobe", 50.2839, 57.1670, 10000, 250),
    ("Taraz", 42.9000, 71.3667, 10000, 250),
    ("Pavlodar", 52.2873, 76.9674, 10000, 250),
    ("Ust-Kamenogorsk", 49.9483, 82.6285, 10000, 250),
    ("Semey", 50.4111, 80.2275, 10000, 250),
    ("Atyrau", 47.0945, 51.9238, 10000, 250),
    ("Aktau", 43.6532, 51.1691, 10000, 250),
    ("Turkestan", 43.2973, 68.2517, 10000, 150),
    ("Kokshetau", 53.2833, 69.3833, 10000, 250),
    ("Kostanay", 53.2144, 63.6246, 10000, 250),
    ("Kyzylorda", 44.8488, 65.4823, 10000, 250),
    ("Uralsk", 51.2333, 51.3667, 10000, 250),
    ("Petropavlovsk", 54.8728, 69.1430, 10000, 250),
    ("Taldykorgan", 45.0156, 78.3739, 10000, 250),
    ("Kolsai & Kaindy Lakes", 42.9897, 78.3256, 8000, 150),
    ("Charyn Canyon", 43.3550, 79.0792, 8000, 150),
]

_KZ_GALLERY_SET = False


def _build_grid(lat: float, lon: float, radius_m: float, step_m: float) -> np.ndarray:
    lat_step = 1.0 / 111320.0
    lon_step = 1.0 / (111320.0 * max(0.1, math.cos(math.radians(lat))))
    n = max(1, int(radius_m / step_m))
    pts = []
    for dy in range(-n, n + 1):
        for dx in range(-n, n + 1):
            if dx * dx + dy * dy <= n * n:
                pts.append([lat + dy * step_m * lat_step, lon + dx * step_m * lon_step])
    return np.array(pts, dtype=np.float32)


def _unwrap_geoclip(geoclip_model):
    for attr in [None, "model", "geoclip", "_model"]:
        obj = geoclip_model if attr is None else getattr(geoclip_model, attr, None)
        if obj is not None and (hasattr(obj, "location_encoder") or hasattr(obj, "gps_gallery") or hasattr(obj, "gps_encoder")):
            return obj
    return None


def lock_geoclip_to_kazakhstan(geoclip_model):
    """Заменяет глобальную сетку GeoCLIP на плотную сетку городов и парков Казахстана."""
    global _KZ_GALLERY_SET
    if _KZ_GALLERY_SET or torch is None:
        return
    model_obj = _unwrap_geoclip(geoclip_model)
    if model_obj is None or not hasattr(model_obj, "gps_gallery"):
        return
    try:
        device = model_obj.gps_gallery.device
        grids = [_build_grid(lat, lon, r, s) for (_, lat, lon, r, s) in KZ_HUBS]
        kz_arr = np.vstack(grids)
        model_obj.gps_gallery = torch.tensor(kz_arr, dtype=torch.float32, device=device)
        _KZ_GALLERY_SET = True
    except Exception:
        pass


def analyze_with_gemini_vision(image_path: str) -> Dict[str, Any]:
    """Использует GEMINI_API_KEY для чтения вывесок/адресов на фото и точного определения парка, улицы или природного объекта."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
    if not api_key:
        for p in [".env", "../.env", "../../.env"]:
            if os.path.isfile(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.strip().startswith("GEMINI_API_KEY="):
                                api_key = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                                os.environ["GEMINI_API_KEY"] = api_key
                                break
                except Exception:
                    pass
            if api_key:
                break

    if not api_key:
        return {"status": "skipped", "reason": "No GEMINI_API_KEY"}

    try:
        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")

        prompt = (
            "You are an expert OSINT geolocator specializing in Kazakhstan (Almaty, Astana, Shymkent, Burabay, Karaganda, city parks, streets, buildings) and CIS. "
            "1. Read ALL visible text, addresses, street names, shop signs, plaques, or watermarks on the photo (in Russian, Kazakh, or English). "
            "2. Identify the exact place, park, street, building, or natural landmark (e.g. Zhumbaktas rock in Burabay Lake, First President Park Almaty, etc.). "
            "Return ONLY valid JSON without markdown formatting: "
            "{\"detected_text\": [\"...\"], \"place_name\": \"exact name of spot/park/building\", \"city\": \"city\", \"country\": \"Kazakhstan\", \"osm_search_query\": \"best query to find this in OpenStreetMap\", \"lat\": 53.0837, \"lon\": 70.2709, \"radius_m\": 15}"
        )
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}}
                ]
            }],
            "generationConfig": {"temperature": 0.1, "response_mime_type": "application/json"}
        }

        # Пробуем доступные модели: gemini-3.5-flash-lite (проверен со статусом 200), gemini-3.8-flash, gemini-2.5-flash
        models_to_try = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"]
        last_err = ""

        for model_name in models_to_try:
            endpoints = [
                (f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}", {}),
                (f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent", {"Authorization": f"Bearer {api_key}"}),
                (f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent", {"x-goog-api-key": api_key}),
            ]
            for url, headers in endpoints:
                try:
                    r = requests.post(url, json=payload, headers=headers, timeout=15)
                    if r.ok:
                        candidate = r.json().get("candidates", [{}])[0]
                        parts = candidate.get("content", {}).get("parts", [])
                        txt = "\n".join([p.get("text", "") for p in parts if "text" in p])
                        m = re.search(r"\{.*\}", txt, re.S)
                        if m:
                            data = json.loads(m.group(0))
                            if data.get("lat") and data.get("lon"):
                                return {"status": "ok", "data": data}
                    else:
                        last_err = f"HTTP {r.status_code}: {r.text[:150]}"
                except Exception as ex:
                    last_err = str(ex)

        return {"status": "error", "error": last_err}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def extract_text_from_photo(image_path: str) -> List[str]:
    """Локальное чтение русского, казахского и английского текста на фото (адреса, таблички, названия)."""
    reader = get_ocr_reader()
    if reader is None or cv2 is None:
        return []
    found: List[str] = []
    try:
        img = cv2.imread(image_path)
        if img is None:
            return []
        h, w = img.shape[:2]
        crops = [
            img,
            cv2.resize(img[0:int(h * 0.35), :], None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC),
            cv2.resize(img[int(h * 0.65):h, :], None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC),
        ]
        seen = set()
        for crop in crops:
            for item in reader.readtext(crop, detail=1, paragraph=True):
                txt = item[1].strip() if len(item) > 1 else ""
                txt = re.sub(r"[^\w\s\-\.,№/а-яА-ЯёЁәіңғүұқөһӘІҢҒҮҰҚӨҺ]", " ", txt)
                txt = re.sub(r"\s+", " ", txt).strip()
                if len(txt) >= 3 and txt.lower() not in seen:
                    seen.add(txt.lower())
                    found.append(txt)
    except Exception:
        pass
    return found


def run_geosleuth_reverse_search(image_path: str) -> List[str]:
    sleuth_dir = Path(__file__).resolve().parent.parent / "geo_sleuth" / "skills" / "geo-sleuth" / "scripts"
    if not sleuth_dir.exists():
        sleuth_dir = Path(__file__).resolve().parent.parent / "geo-sleuth" / "skills" / "geo-sleuth" / "scripts"
    revimg_script = sleuth_dir / "revimg.py"
    if not revimg_script.exists():
        return []

    out_dir = Path(image_path).parent / "sleuth_rev"
    out_dir.mkdir(parents=True, exist_ok=True)
    clues: List[str] = []
    try:
        cmd = [sys.executable, str(revimg_script), str(image_path), "--out-dir", str(out_dir)]
        subprocess.run(cmd, timeout=35, capture_output=True, text=True)
        for f in out_dir.rglob("*"):
            if f.suffix.lower() in {".json", ".md", ".txt"}:
                content = f.read_text(encoding="utf-8", errors="ignore")
                for ln in content.splitlines():
                    ln = ln.strip(" #*-•\t\"'")
                    if len(ln) >= 4 and not ln.startswith("http"):
                        clues.append(ln)
    except Exception:
        pass
    return clues[:15]


def geocode_in_kazakhstan(candidates: List[str]) -> Optional[Dict[str, Any]]:
    """Ищет адрес, название парка, улицы или местности по карте Казахстана (Nominatim + Overpass API)."""
    headers = {"User-Agent": "GeoSleuthKZ/3.0 (local-osint)"}
    queries: List[str] = []
    for c in candidates:
        clean = re.sub(r"[^\w\s\-\.,№/а-яА-ЯёЁәіңғүұқөһӘІҢҒҮҰҚӨҺ]", " ", str(c)).strip()
        if len(clean) >= 3:
            queries.append(clean)

    if len(queries) >= 2:
        queries.insert(0, f"{queries[0]} {queries[1]}")

    for q in queries[:12]:
        try:
            r = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q, "countrycodes": "kz", "format": "jsonv2", "limit": 3, "addressdetails": 1},
                headers=headers,
                timeout=6,
            )
            if r.ok and r.json():
                hit = r.json()[0]
                return {
                    "lat": float(hit["lat"]),
                    "lon": float(hit["lon"]),
                    "name": hit.get("display_name", q),
                    "matched_query": q,
                    "radius_m": 15,
                }
        except Exception:
            pass

        if len(q) >= 4:
            overpass_q = f"""
            [out:json][timeout:8];
            area["ISO3166-1"="KZ"]->.kz;
            (
              node["name"~"{q}",i](area.kz);
              way["name"~"{q}",i](area.kz);
              relation["name"~"{q}",i](area.kz);
            );
            out center 3;
            """
            try:
                r = requests.post("https://overpass-api.de/api/interpreter", data={"data": overpass_q}, timeout=8)
                if r.ok:
                    els = r.json().get("elements", [])
                    if els:
                        el = els[0]
                        lat = el.get("lat") or el.get("center", {}).get("lat")
                        lon = el.get("lon") or el.get("center", {}).get("lon")
                        if lat and lon:
                            return {
                                "lat": float(lat),
                                "lon": float(lon),
                                "name": f"{el.get('tags', {}).get('name', q)}, Казахстан",
                                "matched_query": q,
                                "radius_m": 15,
                            }
            except Exception:
                pass
    return None


def refine_dense_grid(geoclip_model, image_path: str, base_lat: float, base_lon: float) -> Dict[str, Any]:
    """Доводит координаты внутри найденного парка/квартала с шагом 15 метров."""
    model_obj = _unwrap_geoclip(geoclip_model)
    if model_obj is None or torch is None:
        return {"status": "skipped", "lat": base_lat, "lon": base_lon, "radius_m": 25}
    try:
        device = next(model_obj.parameters()).device
        img = Image.open(image_path).convert("RGB")
        img_tensor = model_obj.image_encoder.preprocess_image(img).unsqueeze(0).to(device)

        with torch.no_grad():
            img_emb = model_obj.image_encoder(img_tensor)
            img_emb = img_emb / img_emb.norm(dim=-1, keepdim=True)

            g = _build_grid(base_lat, base_lon, radius_m=450, step_m=15)
            t = torch.tensor(g, dtype=torch.float32, device=device)
            loc_enc = getattr(model_obj, "location_encoder", getattr(model_obj, "gps_encoder", None))
            loc_emb = loc_enc(t)
            loc_emb = loc_emb / loc_emb.norm(dim=-1, keepdim=True)
            scores = (img_emb @ loc_emb.T).squeeze(0)
            idx = int(torch.argmax(scores).item())

            return {
                "status": "ok",
                "lat": float(g[idx][0]),
                "lon": float(g[idx][1]),
                "score": round(float(scores[idx].item()), 4),
                "radius_m": 15,
            }
    except Exception as e:
        return {"status": "error", "lat": base_lat, "lon": base_lon, "radius_m": 30, "error": str(e)}


def locate_exact_spot(geoclip_model, image_path: str, city_lat: float, city_lon: float) -> Dict[str, Any]:
    lock_geoclip_to_kazakhstan(geoclip_model)

    # 1. Пробуем Gemini Vision (узнает парки, скалу Жумбактас в Бурабае, улицы и читает любой текст на фото)
    vlm = analyze_with_gemini_vision(image_path)
    if vlm.get("status") == "ok":
        d = vlm["data"]
        v_lat, v_lon = float(d["lat"]), float(d["lon"])
        osm_q = [q for q in [d.get("osm_search_query"), d.get("place_name")] + d.get("detected_text", []) if q]
        osm_hit = geocode_in_kazakhstan(osm_q)
        if osm_hit:
            v_lat, v_lon = osm_hit["lat"], osm_hit["lon"]
        label = f"{d.get('place_name', '')}, {d.get('city', 'Kazakhstan')}".strip(", ")
        return {
            "exact_lat": v_lat,
            "exact_lon": v_lon,
            "radius_m": int(d.get("radius_m", 15)),
            "matched_label": label,
            "method": f"Gemini Vision + OSM Pinpoint: {label}",
            "diagnostics": {"gemini_vision": d, "osm_refined": osm_hit},
        }

    # 2. Локальный OCR (EasyOCR: русский/казахский/английский) -> ищем адрес или название в Казахстане
    ocr_texts = extract_text_from_photo(image_path)
    ocr_hit = geocode_in_kazakhstan(ocr_texts)
    if ocr_hit:
        return {
            "exact_lat": ocr_hit["lat"],
            "exact_lon": ocr_hit["lon"],
            "radius_m": 15,
            "matched_label": ocr_hit["name"],
            "method": f"OCR Text/Address Match: «{ocr_hit['matched_query']}»",
            "diagnostics": {"ocr_texts": ocr_texts, "matched_place": ocr_hit, "gemini_status": vlm},
        }

    # 3. Обратный поиск фото из интернета через Oldcircle/geo-sleuth (revimg.py)
    rev_clues = run_geosleuth_reverse_search(image_path)
    rev_hit = geocode_in_kazakhstan(rev_clues)
    if rev_hit:
        return {
            "exact_lat": rev_hit["lat"],
            "exact_lon": rev_hit["lon"],
            "radius_m": 20,
            "matched_label": rev_hit["name"],
            "method": f"Geo-Sleuth Internet Search Match: «{rev_hit['matched_query']}»",
            "diagnostics": {"ocr_texts": ocr_texts, "reverse_image_clues": rev_clues, "matched_place": rev_hit},
        }

    # 4. Если точка за пределами Казахстана — принудительно выбираем лучший парк/город внутри Казахстана
    if not (40.0 <= city_lat <= 56.0 and 46.0 <= city_lon <= 88.0):
        model_obj = _unwrap_geoclip(geoclip_model)
        if model_obj is not None and torch is not None:
            try:
                device = next(model_obj.parameters()).device
                img = Image.open(image_path).convert("RGB")
                img_tensor = model_obj.image_encoder.preprocess_image(img).unsqueeze(0).to(device)
                with torch.no_grad():
                    img_emb = model_obj.image_encoder(img_tensor)
                    img_emb = img_emb / img_emb.norm(dim=-1, keepdim=True)
                    loc_enc = getattr(model_obj, "location_encoder", getattr(model_obj, "gps_encoder", None))
                    loc_emb = loc_enc(model_obj.gps_gallery)
                    loc_emb = loc_emb / loc_emb.norm(dim=-1, keepdim=True)
                    scores = (img_emb @ loc_emb.T).squeeze(0)
                    best_idx = int(torch.argmax(scores).item())
                    city_lat = float(model_obj.gps_gallery[best_idx][0].item())
                    city_lon = float(model_obj.gps_gallery[best_idx][1].item())
            except Exception:
                pass

    # 5. Доводка по 15-метровой сетке внутри парка/города Казахстана
    grid_res = refine_dense_grid(geoclip_model, image_path, city_lat, city_lon)
    return {
        "exact_lat": grid_res.get("lat", city_lat),
        "exact_lon": grid_res.get("lon", city_lon),
        "radius_m": grid_res.get("radius_m", 20),
        "matched_label": None,
        "method": "Kazakhstan Park/City Grid (15m)",
        "diagnostics": {
            "gemini_status": vlm,
            "ocr_texts": ocr_texts,
            "reverse_image_clues": rev_clues,
            "dense_grid": grid_res,
        },
    }
