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
            model_dir = Path.home() / ".EasyOCR" / "model"
            has_models = (
                model_dir.exists()
                and any(f.name.endswith((".pth", ".bin")) for f in model_dir.glob("*"))
            )
            if not has_models:
                _OCR_READER = False
                return None
            _OCR_READER = easyocr.Reader(['ru', 'en'], gpu=(torch is not None and torch.cuda.is_available()), verbose=False, download_enabled=False)
        except Exception:
            _OCR_READER = False
    return _OCR_READER if _OCR_READER is not False else None


# Стоп-слова, которые часто встречаются внутри зданий и дают ложные совпадения в OSM
INDOOR_OCR_STOPWORDS = {
    "выход", "шығу", "exit", "вход", "кіру", "enter", "welcome", "қош", "келдіңіздер",
    "касса", "туалет", "wc", "этаж", "қабат", "лифт", "акция", "скидки", "sale",
    "открыто", "ашық", "закрыто", "жабық", "меню", "menu", "coffee", "кофе",
    "чай", "tea", "open", "close", "push", "pull", "на себя", "от себя", "wifi", "wi-fi",
    "гардероб", "зал", "зона", "терминал", "банкомат", "администрация", "информация", "ақпарат",
    "стойка", "паркинг", "parking", "p1", "p2", "p3", "цоколь", "цокольный",
    "осторожно", "внимание", "намазхана", "намаз", "smoking", "курение"
}

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


def enrich_geoclip_gallery(geoclip_model):
    """Алиас для lock_geoclip_to_kazakhstan для обратной совместимости."""
    lock_geoclip_to_kazakhstan(geoclip_model)


def detect_indoor_cv(image_path: str) -> Dict[str, Any]:
    """
    Локальная эвристика OpenCV для определения фото внутри здания:
    проверяет отсутствие открытого неба в верхней части кадра и распределение освещения.
    """
    if cv2 is None:
        return {"is_indoor_heuristic": False, "indoor_prob": 0.0, "sky_ratio": 0.0}
    try:
        img = cv2.imread(image_path)
        if img is None:
            return {"is_indoor_heuristic": False, "indoor_prob": 0.0, "sky_ratio": 0.0}

        h, w, _ = img.shape
        top_crop = img[0:max(1, int(h * 0.3)), :]
        hsv_top = cv2.cvtColor(top_crop, cv2.COLOR_BGR2HSV)

        # Доля пикселей, похожих на дневное голубое или яркое дневное облачное небо
        sky_mask_blue = cv2.inRange(hsv_top, (90, 30, 120), (135, 255, 255))
        sky_mask_bright = cv2.inRange(hsv_top, (0, 0, 215), (180, 40, 255))
        sky_ratio = float(np.count_nonzero(sky_mask_blue | sky_mask_bright)) / float(top_crop.shape[0] * top_crop.shape[1])

        indoor_prob = 0.75 if sky_ratio < 0.03 else (0.45 if sky_ratio < 0.10 else 0.15)
        return {
            "is_indoor_heuristic": indoor_prob >= 0.6,
            "indoor_prob": round(indoor_prob, 2),
            "sky_ratio": round(sky_ratio, 4)
        }
    except Exception:
        return {"is_indoor_heuristic": False, "indoor_prob": 0.0, "sky_ratio": 0.0}


def analyze_with_gemini_vision(image_path: str) -> Dict[str, Any]:
    """
    Использует GEMINI_API_KEY для:
    1) Распознавания типа сцены (is_indoor vs outdoor).
    2) Определения известных интерьеров (ТРЦ, аэропорты, станции, кафе) или природных объектов/улиц.
    3) Защиты от угадывания случайных координат на типовых интерьерах (ставит lat/lon в null).
    4) Извлечения поисковых запросов и вывесок для OpenStreetMap.
    """
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
            "First, determine if the photo is taken INDOORS (inside a building, mall, cafe, office, room, station, airport) or OUTDOORS (street, park, nature, facade). "
            "If INDOORS: "
            "1. Inspect mall atrium architecture (e.g. MEGA Alma-Ata, MEGA Silk Way, Dostyk Plaza, Khan Shatyr, Esentai Mall, Forum), "
            "storefront brand names, posters, signs, or views out the windows. "
            "2. DO NOT guess random coordinates if the room is generic or unidentifiable — set lat and lon to null if confidence is below 0.65. "
            "If OUTDOORS: "
            "Identify the exact landmark, park, street, building, or nature spot. "
            "Return ONLY valid JSON matching this schema: "
            "{\"is_indoor\": true/false, \"scene_type\": \"mall|cafe|office|residential|station|airport|street|park|nature\", "
            "\"confidence\": 0.85, \"place_name\": \"exact name or null\", \"city\": \"city or null\", \"country\": \"Kazakhstan\", "
            "\"osm_search_query\": \"search query for OpenStreetMap\", \"lat\": 51.1694_or_null, \"lon\": 71.4491_or_null, "
            "\"radius_m\": 30, \"search_queries\": [\"identifiable brand, mall or street\"], \"detected_text\": [\"visible text\"]}"
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
                            has_coords = data.get("lat") is not None and data.get("lon") is not None
                            conf = float(data.get("confidence") or (0.85 if has_coords else 0.0))
                            if has_coords and conf >= 0.65:
                                return {"status": "ok", "data": data}
                            return {"status": "indoor_or_uncertain", "data": data}
                    else:
                        last_err = f"HTTP {r.status_code}: {r.text[:150]}"
                except Exception as ex:
                    last_err = str(ex)

        return {"status": "error", "error": last_err}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def extract_text_from_photo(image_path: str, is_indoor: bool = False) -> List[str]:
    """
    Локальное чтение русского, казахского и английского текста на фото.
    При is_indoor фильтрует бытовые таблички ('выход', 'касса', 'акция').
    """
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
                low = txt.lower()
                if len(txt) >= 3 and low not in seen:
                    # Фильтруем стоп-слова интерьеров
                    if low in INDOOR_OCR_STOPWORDS:
                        continue
                    # Если помещение, игнорируем слишком короткие слова без адресных маркеров
                    if is_indoor and len(txt) < 4:
                        if not any(token in low for token in ["пр", "ул", "к-сі", "д.", "мкр"]):
                            continue
                    seen.add(low)
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
                        if ln.lower() not in INDOOR_OCR_STOPWORDS:
                            clues.append(ln)
    except Exception:
        pass
    return clues[:15]


def geocode_in_kazakhstan(
    candidates: List[str],
    is_indoor: bool = False,
    city_lat: Optional[float] = None,
    city_lon: Optional[float] = None
) -> Optional[Dict[str, Any]]:
    """Ищет адрес, название объекта или ТРЦ по карте Казахстана (Nominatim + Overpass API)."""
    headers = {"User-Agent": "GeoSleuthKZ/3.1 (indoor-protected)"}
    queries: List[str] = []
    for c in candidates:
        clean = re.sub(r"[^\w\s\-\.,№/а-яА-ЯёЁәіңғүұқөһӘІҢҒҮҰҚӨҺ]", " ", str(c)).strip()
        low = clean.lower()
        if len(clean) >= 3 and low not in INDOOR_OCR_STOPWORDS:
            if is_indoor and len(clean) < 4:
                continue
            queries.append(clean)

    if len(queries) >= 2:
        queries.insert(0, f"{queries[0]} {queries[1]}")

    viewbox_params = {}
    if city_lat is not None and city_lon is not None:
        deg = 20.0 / 111.32
        viewbox_params = {
            "viewbox": f"{city_lon - deg},{city_lat + deg},{city_lon + deg},{city_lat - deg}",
            "bounded": 0,
        }

    for q in queries[:12]:
        try:
            params = {
                "q": q,
                "countrycodes": "kz",
                "format": "jsonv2",
                "limit": 3,
                "addressdetails": 1,
                **viewbox_params
            }
            r = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
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
                    "radius_m": 50 if is_indoor else 15,
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
                                "radius_m": 50 if is_indoor else 15,
                            }
            except Exception:
                pass
    return None


def refine_dense_grid(
    geoclip_model,
    image_path: str,
    base_lat: float,
    base_lon: float,
    is_indoor: bool = False
) -> Dict[str, Any]:
    """
    Доводит координаты с шагом 15 метров через GeoCLIP.
    Если снимок сделан внутри здания (или score ниже порога уверенности 0.21),
    блокирует ложное сужение до уличного 25-метрового радиуса.
    """
    if is_indoor:
        return {
            "status": "skipped_indoor",
            "lat": base_lat,
            "lon": base_lon,
            "radius_m": 2500,
            "warning": "Снимок сделан внутри помещения: уличная сетка GeoCLIP отключена во избежание ложной точки."
        }

    model_obj = _unwrap_geoclip(geoclip_model)
    if model_obj is None or torch is None:
        return {"status": "skipped", "lat": base_lat, "lon": base_lon, "radius_m": 250}

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
            best_score = float(scores[idx].item())

            # Защита от галлюцинаций GeoCLIP на интерьерах или неинформативных кадрах
            if best_score < 0.21:
                return {
                    "status": "low_visual_confidence",
                    "lat": base_lat,
                    "lon": base_lon,
                    "score": round(best_score, 4),
                    "radius_m": 2000,
                    "warning": "Низкая уверенность визуальной привязки (возможно, фото внутри помещения или крупный план)."
                }

            return {
                "status": "ok",
                "lat": float(g[idx][0]),
                "lon": float(g[idx][1]),
                "score": round(best_score, 4),
                "radius_m": 15,
            }
    except Exception as e:
        return {"status": "error", "lat": base_lat, "lon": base_lon, "radius_m": 150, "error": str(e)}


def locate_exact_spot(geoclip_model, image_path: str, city_lat: float, city_lon: float) -> Dict[str, Any]:
    """
    Главный конвейер геолокации с защитой от ошибок на интерьерах:
    1. Проверка интерьера через OpenCV (отсутствие неба / дневного света).
    2. Анализ через Gemini Vision: определение is_indoor, атриумов ТРЦ, вокзалов, брендов или природных зон.
    3. Локальный OCR (EasyOCR) с фильтрацией интерьерных стоп-слов ('касса', 'выход' и др.) -> поиск в OSM.
    4. Geo-Sleuth (обратный поиск по фото в интернете).
    5. Защита от ошибок GeoCLIP на интерьерах (отключение 25-метрового радиуса).
    """
    lock_geoclip_to_kazakhstan(geoclip_model)

    # 0. Локальная эвристика интерьера
    cv_indoor = detect_indoor_cv(image_path)
    is_indoor = cv_indoor.get("is_indoor_heuristic", False)

    # 1. Gemini Vision (определение места, чтения вывесок, проверка indoor/outdoor)
    vlm = analyze_with_gemini_vision(image_path)
    vlm_data = vlm.get("data", {}) if isinstance(vlm.get("data"), dict) else {}

    if vlm_data.get("is_indoor") is not None:
        is_indoor = bool(vlm_data.get("is_indoor"))

    # Если Gemini Vision с высокой уверенностью определил место (включая конкретные ТРЦ или достопримечательности)
    if vlm.get("status") == "ok" and vlm_data.get("lat") and vlm_data.get("lon"):
        v_lat, v_lon = float(vlm_data["lat"]), float(vlm_data["lon"])
        osm_q = [
            q for q in [vlm_data.get("osm_search_query"), vlm_data.get("place_name")]
            + vlm_data.get("search_queries", [])
            + vlm_data.get("detected_text", [])
            if q and str(q).lower() not in INDOOR_OCR_STOPWORDS
        ]
        osm_hit = geocode_in_kazakhstan(osm_q, is_indoor=is_indoor, city_lat=v_lat, city_lon=v_lon)
        if osm_hit:
            v_lat, v_lon = osm_hit["lat"], osm_hit["lon"]

        label = f"{vlm_data.get('place_name', '')}, {vlm_data.get('city', 'Kazakhstan')}".strip(", ")
        rad = int(vlm_data.get("radius_m", 50 if is_indoor else 15))
        return {
            "exact_lat": v_lat,
            "exact_lon": v_lon,
            "radius_m": rad,
            "is_indoor": is_indoor,
            "scene_type": vlm_data.get("scene_type", "indoor" if is_indoor else "outdoor"),
            "matched_label": label,
            "method": f"Gemini Vision + OSM: {label}",
            "diagnostics": {"gemini_vision": vlm_data, "osm_refined": osm_hit, "cv_indoor": cv_indoor}
        }

    # Если это интерьер ТРЦ/аэропорта/станции без прямых координат, но есть поисковые запросы (бренды, имя молла)
    if is_indoor and vlm_data.get("search_queries"):
        indoor_osm_hit = geocode_in_kazakhstan(
            vlm_data.get("search_queries"),
            is_indoor=True,
            city_lat=city_lat,
            city_lon=city_lon
        )
        if indoor_osm_hit:
            return {
                "exact_lat": indoor_osm_hit["lat"],
                "exact_lon": indoor_osm_hit["lon"],
                "radius_m": 50,
                "is_indoor": True,
                "scene_type": vlm_data.get("scene_type", "indoor"),
                "matched_label": indoor_osm_hit["name"],
                "method": f"Indoor Landmark Search: «{indoor_osm_hit['matched_query']}»",
                "diagnostics": {"gemini_vision": vlm_data, "matched_poi": indoor_osm_hit, "cv_indoor": cv_indoor}
            }

    # 2. Локальный OCR (EasyOCR) с отсечением бытовых стоп-слов интерьеров
    ocr_texts = extract_text_from_photo(image_path, is_indoor=is_indoor)
    ocr_hit = geocode_in_kazakhstan(ocr_texts, is_indoor=is_indoor, city_lat=city_lat, city_lon=city_lon)
    if ocr_hit:
        return {
            "exact_lat": ocr_hit["lat"],
            "exact_lon": ocr_hit["lon"],
            "radius_m": 50 if is_indoor else 15,
            "is_indoor": is_indoor,
            "matched_label": ocr_hit["name"],
            "method": f"OCR Text/Address Match: «{ocr_hit['matched_query']}»",
            "diagnostics": {"ocr_texts": ocr_texts, "matched_place": ocr_hit, "is_indoor": is_indoor, "gemini_status": vlm}
        }

    # 3. Обратный поиск фото из интернета через Oldcircle/geo-sleuth (revimg.py)
    rev_clues = []
    rev_hit = None
    if not is_indoor:
        rev_clues = run_geosleuth_reverse_search(image_path)
        if rev_clues:
            rev_hit = geocode_in_kazakhstan(rev_clues, is_indoor=is_indoor, city_lat=city_lat, city_lon=city_lon)
    if rev_hit:
        return {
            "exact_lat": rev_hit["lat"],
            "exact_lon": rev_hit["lon"],
            "radius_m": 50 if is_indoor else 20,
            "is_indoor": is_indoor,
            "matched_label": rev_hit["name"],
            "method": f"Geo-Sleuth Internet Match: «{rev_hit['matched_query']}»",
            "diagnostics": {"reverse_image_clues": rev_clues, "matched_place": rev_hit, "is_indoor": is_indoor}
        }

    # 4. Если точка за пределами Казахстана — принудительно выбираем лучший город Казахстана
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

    # 5. GeoCLIP доводка с защитой от ошибок на интерьерах
    grid_res = refine_dense_grid(geoclip_model, image_path, city_lat, city_lon, is_indoor=is_indoor)

    # Формируем итоговый вердикт
    if is_indoor:
        method_name = "Indoor Scene Detected (City Anchor)"
        warning_msg = grid_res.get("warning", "Снимок внутри помещения: уличный радиус 25м заблокирован.")
    elif grid_res.get("status") == "low_visual_confidence":
        method_name = "Low Confidence Visual Anchor (City Level)"
        warning_msg = grid_res.get("warning")
    else:
        method_name = "Kazakhstan Outdoor Grid (15m)"
        warning_msg = None

    return {
        "exact_lat": grid_res.get("lat", city_lat),
        "exact_lon": grid_res.get("lon", city_lon),
        "radius_m": grid_res.get("radius_m", 2500 if is_indoor else 20),
        "is_indoor": is_indoor,
        "matched_label": None,
        "method": method_name,
        "warning": warning_msg,
        "diagnostics": {
            "is_indoor": is_indoor,
            "cv_indoor": cv_indoor,
            "gemini_status": vlm,
            "ocr_texts": ocr_texts,
            "reverse_image_clues": rev_clues,
            "dense_grid": grid_res,
        },
    }
