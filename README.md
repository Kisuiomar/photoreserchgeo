<div align="center">

# WhereWasThisTaken?

### Hi! This is a little tool that figures out where any photo was taken, running entirely on your own computer.

<p>
  <img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0-6366f1">
  <img alt="Runs on Docker" src="https://img.shields.io/badge/runs%20on-docker%20compose-0db7ed">
  <img alt="100% local" src="https://img.shields.io/badge/processing-100%25%20local-10b981">
  <img alt="Python" src="https://img.shields.io/badge/backend-FastAPI%20%2B%20PyTorch-3776ab">
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb">
</p>

No uploads, no accounts, no telemetry. Just you, your photos, and a neural network that is surprisingly good at guessing where they were taken.

</div>

---

## Contents

**Part 1. What this is**

- [Meet the tool](#meet-the-tool)
- [See it in action](#see-it-in-action)
- [The three modes, at a glance](#the-three-modes-at-a-glance)
- [Explore: ask the model about a photo](#explore-ask-the-model-about-a-photo)
- [Overview: see your whole library on one map](#overview-see-your-whole-library-on-one-map)
- [Edit: fix missing GPS, one click at a time](#edit-fix-missing-gps-one-click-at-a-time)
- [Privacy](#privacy)

**Part 2. Get started**

- [**▶ Quick start**](#quick-start)
- [Using your own photo library](#using-your-own-photo-library)
- [Configuration](#configuration)

**Part 3. Under the hood**

- [Architecture](#architecture)
- [How the AI works](#how-the-ai-works)
- [Safety model for GPS writes](#safety-model-for-gps-writes)
- [API reference](#api-reference)
- [Code layout](#code-layout)

**The rest**

- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

# Part 1. What this is

## Meet the tool

Almost everyone has a folder somewhere full of photos without location data. Scanned film. Screenshots. WhatsApp downloads. Phones with location turned off. They all land in your library and look a bit sad on any map view.

This tool gives them their place back. Point it at a photo and a deep learning model named GeoCLIP guesses where it was taken, usually accurately enough to recognize the exact neighborhood. Point it at a whole library and it maps out which photos have GPS and which do not. Spend ten minutes with the Edit mode and the AI does the heavy lifting of filling in the missing coordinates, while you just click `accept` or `reject` on its suggestions. You never have to type an address unless you want to.

It runs entirely on your own machine. The model weights download once on first launch. After that you can unplug the internet and it still works.

## See it in action

Five real predictions. Look at the first one carefully. The model identified the right city from the interior of an apartment.

### 1. An apartment in Melbourne

<p align="center">
  <img src="docs/screenshots/explore_melbourne.png" alt="Explore mode: Southbank, Melbourne prediction" width="880">
</p>

> Floor-to-ceiling windows, a dining table, no obvious landmark. The AI predicted **Southbank, Victoria**. The truth was **Docklands, Victoria**, about 800 metres away.

### 2. The UN General Assembly Hall

<p align="center">
  <img src="docs/screenshots/explore_un_hall.png" alt="Explore mode: Long Island City, New York prediction" width="880">
</p>

> All five top predictions landed on **Long Island City, New York**. Off by 79 metres. Essentially perfect.

### 3. A street in Sydney

<p align="center">
  <img src="docs/screenshots/explore_sydney.png" alt="Explore mode: Sydney prediction" width="880">
</p>

> Predicted **Sydney, NSW**. Off by 340 metres.

### 4. An infinity pool in Fiji

<p align="center">
  <img src="docs/screenshots/explore_fiji.png" alt="Explore mode: Nadi, Fiji prediction" width="880">
</p>

> Palms, turquoise water, no street signs. Predicted **Nadi, Western, Fiji**. Off by about 6 kilometres, still in the right area.

### 5. The Gold Coast at night

<p align="center">
  <img src="docs/screenshots/explore_gold_coast.png" alt="Explore mode: Gold Coast prediction" width="880">
</p>

> Predicted **Surfers Paradise, Queensland**. Truth **Gold Coast, Queensland**. Off by 410 metres. Night shots work too.

## The three modes, at a glance

| Mode         | What you do                                                        | When to use it                                                               |
| ------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Explore**  | Drop in photos, read the predictions.                              | You are curious about one photo or a small batch.                            |
| **Overview** | Point at a folder, see what has GPS and what does not.             | You want to understand your library before editing anything.                 |
| **Edit**     | Let the AI fill in missing coordinates. You just accept or reject. | You want to enrich a pile of photos so they show up on your photo app's map. |

## Explore: ask the model about a photo

Drop anywhere from one photo to fifty at once. Every image gets plotted on a world map with its top five predictions, the top pick's address, and a distance-to-truth benchmark if the photo already had GPS. The five examples above were all produced by Explore.

Batch mode. The map fills in live as each photo finishes, with a progress bar and ETA.

<p align="center">
  <img src="docs/screenshots/explore_batch_processing.png" alt="Batch processing with live map" width="880">
</p>

Great for playing around with your own camera roll, sanity checking the AI, or just entertaining yourself on a quiet evening.

## Overview: see your whole library on one map

Point it at a folder. It scans every image and sorts them into five buckets: `Real GPS` (from your camera), `Estimated GPS` (written by this tool earlier), `No GPS`, `Null Island` (the classic (0, 0) bug), and `Errors`. The coordinates go on a world map so you can spot the holes at a glance.

<p align="center">
  <img src="docs/screenshots/overview_library_stats.png" alt="Overview mode library statistics" width="880">
</p>

Read-only. Nothing is modified. It is the natural first step before running the Edit mode.

## Edit: fix missing GPS, one click at a time

The main feature. Edit mode walks you through a guided flow, and for each photo missing GPS it either confirms a good prediction with a single click or skips it. You are the reviewer, the AI is the worker.

### Step 1. Configure, then scan

<p align="center">
  <img src="docs/screenshots/edit_config.png" alt="Edit mode configuration screen" width="880">
</p>

Pick a directory. Optionally filter out low-confidence predictions. Optionally re-process photos that already have AI-predicted coordinates. Press **Scan & Start Session**. Real GPS from your camera is never touched. The editor only sees photos that are missing a location.

### Step 2. Let the AI predict

The model runs through every candidate. Photos taken close in time to GPS-tagged photos get a strong confidence bonus (a photo taken three minutes after a GPS-tagged one is almost certainly in the same place).

### Step 3. Review, very quickly

<p align="center">
  <img src="docs/screenshots/edit_review.png" alt="Edit mode review screen" width="880">
</p>

One photo at a time. Press `A` or `Enter` to accept. `R` or `Esc` to reject. `M` if you want to override with a manual address. Accepted coordinates go straight into the photo's EXIF, tagged `ESTIMATED` so they are always distinguishable from real GPS later. You can rip through a hundred suggestions in a coffee break.

## Privacy

This is the whole point of running it locally. Everything happens on your machine.

- No uploads. Photos are read from your disk, processed in your RAM, written back to your disk. Nothing else.
- No telemetry, no analytics, no accounts.
- One network call on first launch to download the model weights from HuggingFace. After that, works offline. Reverse geocoding (turning coordinates into place names) and forward geocoding (user-typed addresses) use external services when available but are optional.
- Every coordinate written by this tool is tagged `ESTIMATED:GEOCLIP:<version>:<timestamp>` in the photo's EXIF so you (and any future tool) can always tell real GPS from predicted GPS.

---

# Part 2. Get started

## Quick start

You need Docker Engine 24+ and Docker Compose v2. Works on Linux, macOS, and Windows via WSL2. You also want roughly 4 GB of free disk for the model and roughly 4 GB of free RAM while the model is loaded.

```bash
git clone https://github.com/M-Enzinger/where-was-this-taken.git
cd where-was-this-taken
cp .env.example .env
docker compose up
```

Then open [http://localhost:8085](http://localhost:8085) in your browser.

On the very first launch the backend downloads the model weights (around 3.5 GB). You see it happen in the terminal. The frontend is held back until the backend reports ready, so `localhost:8085` does not respond until everything is in place. That is deliberate and avoids a half-loaded UI racing the download.

Subsequent starts are instant. The weights live in a named Docker volume.

To stop:

```bash
docker compose down       # keeps the model cache
docker compose down -v    # wipes the model cache too
```

## Using your own photo library

By default the app serves the small sample folder bundled with the project. To point it at your real library, set the path in `.env`:

```ini
PHOTO_LIBRARY_PATH=/absolute/path/to/your/photos
```

The backend mounts this read-write at `/photos` internally. Only the Edit mode ever writes, and only under the safety guarantees described below.

## Configuration

All settings live in `.env`. Sensible defaults ship in `.env.example`.

| Variable             | Default    | What it does                                                             |
| -------------------- | ---------- | ------------------------------------------------------------------------ |
| `PORT`               | `8085`     | Host port the UI is served on.                                           |
| `PHOTO_LIBRARY_PATH` | `./photos` | Host path mounted at `/photos` in the backend.                           |
| `GEOCLIP_TOP_K`      | `5`        | Number of ranked predictions returned per image.                         |
| `EDIT_MODE_ENABLED`  | `true`     | Guard for GPS-writing endpoints. Set `false` for a read-only deployment. |
| `MODEL_IDLE_TIMEOUT` | `600`      | Reserved. Idle auto-unload is wired but disabled.                        |

---

# Part 3. Under the hood

This section is for the curious and for contributors. If you just want to use the app, you can stop reading here.

## Architecture

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

Two docker services, one named volume for the model cache, one healthcheck that blocks the frontend until the backend has the model in RAM.

## How the AI works

GeoCLIP ([paper and code](https://github.com/VicenteVivan/geo-clip)) is a dual-encoder neural network. One encoder turns an image into a feature vector, a second encoder does the same for latitude/longitude coordinates. At inference the image is matched against a grid of candidate coordinates and the best matches are returned. It was trained on a large dataset of geotagged photos.

On its own it is roughly city-level accurate. Two extra signals tighten that up inside Edit mode:

1. **Temporal proximity.** For a photo without GPS, photos taken within minutes that do have GPS are strong evidence. A match within five minutes can override the raw model output, because people cannot physically teleport.
2. **Filename sequence and folder names.** Burst sequences (IMG_0001 next to IMG_0002), folder names like `Paris 2024`, and GPS-before-and-after ranges all contribute additional hints.

The combined confidence score is `max(model_confidence, temporal_confidence)`. The full logic lives in `backend/app/enhancer.py` and `backend/app/library_context.py`.

## Safety model for GPS writes

Writing EXIF data is irreversible on the original pixel bytes unless you are careful. The app has three independent defences before it touches any file.

1. **Queue filter.** Only images the scanner reports as GPS-less enter the write queue in the first place.
2. **Pre-write double-check.** Right before calling `exiftool`, the file is re-read with both `exiftool` and Pillow. Either a disagreement between them, or a detected GPS tag, aborts the write.
3. **Post-write validation.** The file is re-read after writing, and coordinates must match within floating-point tolerance, otherwise the write is considered failed.

Every accepted coordinate is tagged `ESTIMATED:GEOCLIP:<version>:<timestamp>` in the photo's `GPSProcessingMethod` EXIF tag, so downstream tools (including this one) can always distinguish AI-predicted locations from camera-measured ones.

## API reference

Everything is under `/api`.

| Method | Path                                                        | Purpose                                                                                                                 |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health`                                               | Liveness probe. Returns `{status, model_loaded}`.                                                                       |
| `GET`  | `/api/system-status`                                        | Process RAM, total RAM, model state. Drives the header indicator.                                                       |
| `POST` | `/api/predict`                                              | Single-image prediction. Returns ranked predictions, addresses, EXIF metadata, and a benchmark if EXIF GPS was present. |
| `POST` | `/api/predict/batch`                                        | Up to 50 files at once.                                                                                                 |
| `POST` | `/api/scan`                                                 | Kick off an Overview-mode directory scan.                                                                               |
| `GET`  | `/api/scan/{id}/status`                                     | Scan progress polling.                                                                                                  |
| `GET`  | `/api/scan/{id}/results`                                    | Full scan results.                                                                                                      |
| `POST` | `/api/edit/start`                                           | Create an edit session. Scans and classifies photos.                                                                    |
| `POST` | `/api/edit/{id}/round`                                      | Run prediction over candidate images.                                                                                   |
| `GET`  | `/api/edit/{id}/queue/next`                                 | Fetch the next image awaiting review.                                                                                   |
| `POST` | `/api/edit/{id}/review/{image_id}/{accept\|reject\|manual}` | Record a review decision.                                                                                               |
| `POST` | `/api/edit/{id}/apply/{image_id}`                           | Write the approved GPS to disk.                                                                                         |

## Code layout

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              FastAPI app, single-image endpoints
│   │   ├── model.py             GeoCLIP lifecycle, load/unload
│   │   ├── enhancer.py          Combined scoring, re-ranking
│   │   ├── library_context.py   Temporal, sequence, folder hints
│   │   ├── routes_scan.py       Overview mode API
│   │   ├── routes_edit.py       Edit mode API
│   │   ├── edit_session.py      Session state machine
│   │   ├── gps_detect.py        Bulletproof GPS reader
│   │   ├── gps_writer.py        Safe GPS writer
│   │   └── ...
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx              Shell, header, dark mode, onboarding
│   │   ├── api.ts               Typed API client
│   │   └── components/          Explore, Overview, Edit, shared UI
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── LICENSE
└── README.md
```

---

## Contributing

I wrote this for myself and put it online because I suspected other people might have the same pile of GPS-less photos as me. If you find a bug, open an issue. If you have an idea for a feature, open an issue. If you ship a fix, open a pull request. All of those are welcome and appreciated. I will try to respond quickly and kindly.

If you just want to say thanks, a GitHub star genuinely means a lot to a solo project.

## License

**GNU Affero General Public License v3.0.** See [LICENSE](LICENSE) for the full text.

In plain terms, AGPL-3.0 means you can use, modify, and redistribute this software for any purpose including commercial ones. The one catch is that if you modify it and run your modified version on a public server, you must release your modifications under the same license. Use it, build on it, share it back.

## Acknowledgements

This project stands on a tall stack of open-source giants. The About panel inside the app lists every dependency with its license and a link. A short list of the biggest debts:

- [**GeoCLIP**](https://github.com/VicenteVivan/geo-clip) by Vicente Vivanco Cepeda and coauthors. The model that makes any of this possible.
- [**OpenAI CLIP**](https://github.com/openai/CLIP). The vision encoder GeoCLIP builds on.
- [**PyTorch**](https://pytorch.org), [**Transformers**](https://huggingface.co/docs/transformers), [**FastAPI**](https://fastapi.tiangolo.com), [**Uvicorn**](https://www.uvicorn.org), [**Pillow**](https://python-pillow.org), [**exiftool**](https://exiftool.org). The backend stack.
- [**React**](https://react.dev), [**Vite**](https://vite.dev), [**Tailwind CSS**](https://tailwindcss.com), [**Framer Motion**](https://www.framer.com/motion), [**Leaflet**](https://leafletjs.com), [**React-Leaflet**](https://react-leaflet.js.org). The frontend stack.
- [**OpenStreetMap**](https://www.openstreetmap.org/copyright) contributors and [**CARTO**](https://carto.com/attributions) for the map tiles.
- [**reverse_geocoder**](https://github.com/thampiman/reverse-geocoder), [**geopy**](https://github.com/geopy/geopy), [**pycountry**](https://github.com/pycountry/pycountry). Geocoding utilities.

Thanks to every maintainer and contributor of those projects. Without their work this would not exist.

---

<div align="center">

Built with care by **Maximilian Enzinger**.

If this saves you an afternoon, my job here is done.

</div>
