<div align="center">

# WhereWasThisTaken?

### Find out where any photo was taken. Locally. Privately. In seconds.

<p>
  <img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0-6366f1">
  <img alt="Runs on Docker" src="https://img.shields.io/badge/runs%20on-docker%20compose-0db7ed">
  <img alt="100% local" src="https://img.shields.io/badge/processing-100%25%20local-10b981">
  <img alt="Python" src="https://img.shields.io/badge/backend-FastAPI%20%2B%20PyTorch-3776ab">
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb">
</p>

An AI-powered geolocation workstation that predicts where your photos were taken, benchmarks those predictions against real EXIF GPS when available, and can safely write approximate coordinates into photos that have none &nbsp;— all without a single byte of your library ever leaving your computer.

</div>

---

## Why you might love it

Almost everyone has a folder somewhere full of photos that lost their location data. Scanned film rolls. Screenshots. WhatsApp downloads. Phones with location services off. Old point-and-shoots. They all arrive in your library GPS-less and boring in any map view.

WhereWasThisTaken? fixes that. Drop a photo in and a deep learning model (GeoCLIP, trained on millions of geotagged images) guesses where it was taken. Scan an entire library and see at a glance which photos have GPS and which do not. Or sit down for an afternoon with the Edit mode and batch-fill every missing coordinate, reviewing each prediction one by one, with safe in-place writes that mark the result as AI-predicted so you can always tell real GPS from estimated.

It runs entirely on your own machine. The model downloads once on first launch; after that you can unplug the internet and it still works perfectly.

---

## See it in action

Four example predictions from real photos. The app always shows the model's top guess, its alternatives, and &nbsp;— if the original had GPS &nbsp;— a benchmark comparing prediction to truth.

### A tropical pool in Fiji

<p align="center">
  <img src="docs/screenshots/explore_fiji.png" alt="Explore mode: Nadi, Fiji prediction" width="860">
</p>

> **Photo**: palms, an infinity pool, distant islands. **Prediction**: Nadi, Western, Fiji. **Truth**: Nadi, Fiji. **Distance**: 6.33 km &nbsp;— `Good: City Level`.

### The UN General Assembly Hall, New York

<p align="center">
  <img src="docs/screenshots/explore_un_hall.png" alt="Explore mode: Long Island City, New York prediction" width="860">
</p>

> **Photo**: an interior shot of the UN General Assembly. **Prediction**: Long Island City, New York, USA (all 5 top predictions agree). **Truth**: Long Island City. **Distance**: 79 m &nbsp;— essentially perfect.

### A street in Sydney

<p align="center">
  <img src="docs/screenshots/explore_sydney.png" alt="Explore mode: Sydney, Australia prediction" width="860">
</p>

> **Photo**: a tree-lined street, sandstone buildings. **Prediction**: Sydney, NSW, Australia. **Truth**: Sydney. **Distance**: 0.34 km.

### The Gold Coast at night

<p align="center">
  <img src="docs/screenshots/explore_gold_coast.png" alt="Explore mode: Surfers Paradise, Queensland prediction" width="860">
</p>

> **Photo**: a night skyline with water in foreground. **Prediction**: Surfers Paradise, Queensland. **Truth**: Gold Coast, Queensland. **Distance**: 0.41 km.

### A city-view apartment in Melbourne

<p align="center">
  <img src="docs/screenshots/explore_melbourne.png" alt="Explore mode: Southbank, Melbourne prediction" width="860">
</p>

> **Photo**: an interior with floor-to-ceiling windows over the CBD. **Prediction**: Southbank, Victoria. **Truth**: Docklands, Victoria (1 km apart). **Distance**: 0.80 km &nbsp;— `Excellent`.

---

## Three ways to use it

The app is organized around three tabs. Each one is optional and self-contained.

### 🔍 Explore &nbsp;— single-shot curiosity

The fastest way to use the app. Drop one or many photos into the upload zone and every image gets plotted on a world map with its top predictions, a confidence score, and (if the photo already has GPS) a distance-to-truth benchmark.

<p align="center">
  <img src="docs/screenshots/explore_batch_processing.png" alt="Batch processing in Explore mode" width="860">
</p>

You can feed in dozens of photos at once and watch the world map populate live as the model works through them, with a live progress bar and ETA.

### 🧭 Overview &nbsp;— understand your library

Point it at a folder and it scans every image, classifying each into `Real GPS`, `Estimated GPS` (coordinates previously written by this tool), `No GPS`, `Null Island` (the classic (0, 0) bug), or `Errors`. It then plots the ones with coordinates on a world map so you can spot gaps at a glance.

<p align="center">
  <img src="docs/screenshots/overview_library_stats.png" alt="Overview mode library statistics" width="860">
</p>

A read-only scan &nbsp;— nothing is modified. Useful before you decide whether to run the editor.

### ✏️ Edit &nbsp;— fill in the missing coordinates

The main feature. Edit mode walks you through three steps:

1. **Scan** your library and identify every photo missing GPS data.
2. **Analyze** each candidate with the AI, using nearby GPS-tagged photos as temporal context (a photo taken 3 minutes after a GPS-tagged one inherits a massive confidence bonus).
3. **Review** each prediction yourself &nbsp;— accept, reject, or type a manual address. Accepted coordinates are written into the file with an `ESTIMATED` tag so you can always tell them from real GPS later.

<p align="center">
  <img src="docs/screenshots/edit_config.png" alt="Edit mode configuration screen" width="860">
</p>

Optional filters let you skip low-confidence predictions automatically, or re-process photos that already have AI-predicted coordinates (for instance, if you want to rerun with a better model later). Real GPS data from your camera is **never** touched &nbsp;— three independent safety layers guarantee it.

<p align="center">
  <img src="docs/screenshots/edit_review.png" alt="Edit mode review screen" width="860">
</p>

The review UI is built for speed. Keyboard shortcuts &nbsp;— `A` / `Enter` to accept, `R` / `Esc` to reject, `M` for manual &nbsp;— let you zip through a long list of predictions without touching the mouse. The small green note at the bottom of every action is a permanent reminder: your photos are not going anywhere.

---

## Privacy, by default

This is the whole point.

- **No uploads.** Photos are read from your disk, processed in your RAM, and written back to your disk. Nothing else.
- **No telemetry.** The only outbound network request the app ever makes is the one-time download of the model weights from HuggingFace when you first start the container.
- **Offline after setup.** Once the model is cached, you can unplug the internet and the app still works. Only reverse geocoding (turning coordinates into city/country names) and forward geocoding (user-typed addresses) require network access.
- **Tamper-evident writes.** Every coordinate this app writes is tagged `ESTIMATED:GEOCLIP:<version>:<timestamp>` in the photo's EXIF. You can always tell at a glance which GPS values came from the camera and which came from the model.

---

## Quick start

### Requirements

- Docker Engine 24+ with Docker Compose v2
- Roughly 4 GB of free disk (for the model weights cache)
- Roughly 4 GB of free RAM while the model is loaded
- Any platform Docker supports &nbsp;— Linux, macOS, Windows (WSL2)

### One-command launch

```bash
git clone https://github.com/M-Enzinger/where-was-this-taken.git
cd where-was-this-taken
cp .env.example .env                 # optional: tweak defaults
docker compose up
```

Then open [http://localhost:8085](http://localhost:8085) in your browser.

### What happens on first run

The backend container downloads the GeoCLIP model weights (~3.5 GB) on the very first start. You will see the download happen in your terminal, with HuggingFace's progress bar. The frontend container is deliberately held back until the backend reports healthy &nbsp;— so `localhost:8085` will not respond until the model is ready. This is intentional: it prevents half-loaded UIs and out-of-memory crashes from racing downloads.

Subsequent starts are instant because the model is cached in a named Docker volume.

### Pointing it at your own photos

By default the app serves the `./photos` folder bundled with the project. To scan your real library, override the mount in `.env`:

```ini
# .env
PHOTO_LIBRARY_PATH=/absolute/path/to/your/photo/library
```

Or mount it directly in `docker-compose.yml` &nbsp;— the backend service expects the library at `/photos` inside the container.

### Stopping

```bash
docker compose down       # stop containers, keep the model cache
docker compose down -v    # stop containers and also wipe the model cache
```

---

## Configuration

All knobs live in `.env`. Sensible defaults ship in `.env.example`.

| Variable             | Default    | What it does                                                                 |
| -------------------- | ---------- | ---------------------------------------------------------------------------- |
| `PORT`               | `8085`     | Host port the UI is served on.                                               |
| `PHOTO_LIBRARY_PATH` | `./photos` | Host path mounted read/write at `/photos` in the backend.                    |
| `GEOCLIP_TOP_K`      | `5`        | Number of ranked predictions returned per image.                             |
| `EDIT_MODE_ENABLED`  | `true`     | Guard for the GPS-writing endpoints. Set `false` for a read-only deployment. |
| `MODEL_IDLE_TIMEOUT` | `600`      | Reserved. Planned idle auto-unload is wired but disabled.                    |

---

## Under the hood

The short version: a FastAPI backend wraps GeoCLIP (a CLIP-based geolocation model), a React frontend renders predictions on Leaflet maps, and Docker Compose ties it together.

### How the AI works

GeoCLIP ([paper](https://github.com/VicenteVivan/geo-clip)) is a dual-encoder neural network: one encoder turns an image into a feature vector, a second encoder does the same for latitude/longitude coordinates. At inference time the image is matched against a grid of candidate coordinates and the top-k are returned. Because it was trained on a vast dataset of geotagged photos, it is surprisingly good at identifying cities, regions, and even specific neighborhoods from visual context alone.

On its own it is roughly city-level accurate. To get closer we layer two signals:

1. **Temporal proximity**: for photos without GPS, we look at photos taken within minutes of it that do have GPS. A strong match (within 5 minutes of a GPS-tagged photo) can override the model's raw output entirely, because people physically cannot teleport.
2. **Filename-sequence and folder-name context**: burst sequences (DSC_0001 next to DSC_0002), folder names ("Paris 2024"), and ranges with GPS before-and-after all contribute hints.

The backend computes a **combined score** (`max(model_confidence, temporal_confidence)`) and uses it for optional threshold filtering. Everything is described in detail in `backend/app/enhancer.py` and `backend/app/library_context.py`.

### Architecture

```
┌─────────────────────┐         ┌───────────────────────────────┐
│   React + Vite SPA  │  HTTP   │  FastAPI + Uvicorn            │
│   (frontend:8085)   │ ──────▶ │  GeoCLIP (PyTorch, CPU/GPU)   │
│                     │  /api   │  exiftool (Perl, GPS I/O)     │
│  framer-motion      │         │  reverse-geocoder (offline)   │
│  react-leaflet      │         │  OpenStreetMap tiles (CARTO)  │
└─────────────────────┘         └───────────────────────────────┘
        ▲                                  │
        │ blocked until                    │ mount
        │ backend is healthy               ▼
        │                       ┌──────────────────┐
        └───────────────────────│ host filesystem  │
                                │ /photos library  │
                                └──────────────────┘
```

- **`backend/`**: Python 3.11. FastAPI app, GeoCLIP inference, EXIF reading/writing via `exiftool`, offline reverse geocoding, edit-session state machine.
- **`frontend/`**: React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion + React-Leaflet. Zero build-time network dependencies.
- **`docker-compose.yml`**: Two services with a healthcheck that blocks the frontend until the backend has the model in RAM. One named volume for the model cache.

### Safety model for GPS writes

Writing EXIF data is irreversible on the original pixel data unless you are careful. The app uses three independent defences before touching any file:

1. **Queue filter**: only images the scanner reports as GPS-less ever enter the write queue.
2. **Pre-write double-check**: right before calling `exiftool`, the file is re-read with both `exiftool` and Pillow. Either a disagreement or a detected GPS tag aborts the write.
3. **Post-write validation**: the file is re-read after writing and coordinates must match to within floating-point tolerance, or the write is considered failed.

Predicted coordinates are marked in the `GPSProcessingMethod` EXIF tag with `ESTIMATED:GEOCLIP:<version>:<timestamp>` so downstream tools &nbsp;— including this one &nbsp;— can always distinguish AI-predicted locations from camera-measured ones.

### API surface

All endpoints are under `/api`. They are documented inline in `backend/app/main.py`, `routes_scan.py`, and `routes_edit.py`. A rough tour:

| Method | Path                                                        | Purpose                                                                                                                  |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/health`                                               | Liveness probe. Returns `{status, model_loaded}`.                                                                        |
| `GET`  | `/api/system-status`                                        | Process RAM, total RAM, model state. Drives the header indicator.                                                        |
| `POST` | `/api/predict`                                              | Single-image prediction. Returns ranked predictions, address lookups, EXIF metadata, and a benchmark if GPS was present. |
| `POST` | `/api/predict/batch`                                        | Same as above but for up to 50 files at once.                                                                            |
| `POST` | `/api/scan`                                                 | Kick off a directory scan (Overview mode).                                                                               |
| `GET`  | `/api/scan/{id}/status`                                     | Scan progress polling.                                                                                                   |
| `GET`  | `/api/scan/{id}/results`                                    | Full scan results once complete.                                                                                         |
| `POST` | `/api/edit/start`                                           | Create an edit session. Scans and classifies photos.                                                                     |
| `POST` | `/api/edit/{id}/round`                                      | Run one prediction round over candidate images.                                                                          |
| `GET`  | `/api/edit/{id}/queue/next`                                 | Fetch the next image awaiting review.                                                                                    |
| `POST` | `/api/edit/{id}/review/{image_id}/{accept\|reject\|manual}` | Record a review decision.                                                                                                |
| `POST` | `/api/edit/{id}/apply/{image_id}`                           | Write the approved GPS to disk.                                                                                          |

### Code layout

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, single-image endpoints
│   │   ├── model.py             # GeoCLIP lifecycle, load/unload, predict
│   │   ├── enhancer.py          # Combined scoring, temporal re-ranking
│   │   ├── library_context.py   # Temporal, folder-name, sequence hints
│   │   ├── routes_scan.py       # Overview mode API
│   │   ├── routes_edit.py       # Edit mode API
│   │   ├── edit_session.py      # Session state machine, round manager
│   │   ├── gps_detect.py        # Bulletproof GPS reader (EXIF/XMP/IPTC)
│   │   ├── gps_writer.py        # Safe GPS writer with pre/post validation
│   │   ├── exif.py              # In-memory EXIF extraction
│   │   ├── exiftool.py          # exiftool subprocess wrapper
│   │   ├── geocoder.py          # Offline reverse geocoding
│   │   ├── forward_geocoder.py  # User-typed address → coordinates
│   │   ├── scanner.py           # Async directory scanner
│   │   └── distance.py          # Haversine + benchmark helpers
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Shell, header, dark mode, onboarding
│   │   ├── api.ts               # Typed API client
│   │   ├── components/
│   │   │   ├── TestingMode.tsx  # Explore tab
│   │   │   ├── MonitorMode.tsx  # Overview tab
│   │   │   ├── EditMode.tsx     # Edit tab (state machine)
│   │   │   ├── UploadZone.tsx
│   │   │   ├── ResultCard.tsx
│   │   │   ├── PredictionMap.tsx
│   │   │   ├── OnboardingWizard.tsx
│   │   │   ├── AboutModal.tsx
│   │   │   ├── HelpTip.tsx
│   │   │   ├── Switch.tsx
│   │   │   ├── PrivacyNote.tsx
│   │   │   ├── edit/ReviewCard.tsx
│   │   │   └── monitor/*.tsx
│   │   └── types.ts
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── LICENSE
└── README.md
```

---

## License

Licensed under the **GNU Affero General Public License v3.0**. See [LICENSE](LICENSE) for the full text.

AGPL-3.0 means you are free to use, modify, and redistribute this software for any purpose, including commercially, as long as you publish any modifications you make (including modifications you run on a public server) under the same license. In plain terms: use it, build on it, share it back.

## Acknowledgements

This project stands on the shoulders of many open-source giants. The About panel in the app lists them all with their licenses and links. A short list of the biggest debts:

- [**GeoCLIP**](https://github.com/VicenteVivan/geo-clip) by Vicente Vivanco Cepeda et al. &nbsp;— the geolocation model that makes this possible.
- [**OpenAI CLIP**](https://github.com/openai/CLIP) &nbsp;— the vision encoder GeoCLIP builds on.
- [**PyTorch**](https://pytorch.org), [**Transformers**](https://huggingface.co/docs/transformers), [**FastAPI**](https://fastapi.tiangolo.com), [**Uvicorn**](https://www.uvicorn.org), [**Pillow**](https://python-pillow.org), [**exiftool**](https://exiftool.org) &nbsp;— the backend stack.
- [**React**](https://react.dev), [**Vite**](https://vite.dev), [**Tailwind CSS**](https://tailwindcss.com), [**Framer Motion**](https://www.framer.com/motion), [**Leaflet**](https://leafletjs.com) &nbsp;— the frontend stack.
- [**OpenStreetMap**](https://www.openstreetmap.org/copyright) contributors and [**CARTO**](https://carto.com/attributions) for the map tiles.
- [**reverse_geocoder**](https://github.com/thampiman/reverse-geocoder), [**geopy**](https://github.com/geopy/geopy), [**pycountry**](https://github.com/pycountry/pycountry) &nbsp;— geocoding utilities.

## Author

Built by **Maximilian Enzinger**.

If you find this useful, I would love to hear about it. If you find a bug, open an issue.
