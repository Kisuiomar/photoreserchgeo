<div align="center">

# WhereWasThisTaken?

### A self-hosted tool that predicts where any photo was taken, running entirely on the user's own machine.

<p>
  <img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0-6366f1">
  <img alt="Runs on Docker" src="https://img.shields.io/badge/runs%20on-docker%20compose-0db7ed">
  <img alt="100% local" src="https://img.shields.io/badge/processing-100%25%20local-10b981">
  <img alt="Python" src="https://img.shields.io/badge/backend-FastAPI%20%2B%20PyTorch-3776ab">
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb">
</p>

No uploads, no accounts, no telemetry. A local-first photo geolocation workstation backed by a neural network that is surprisingly good at guessing where images were taken.

</div>

---

## Contents

1. [What this is](#what-this-is)
2. [The three modes](#the-three-modes)
3. [Privacy](#privacy)
4. [**▶ Quick start**](#quick-start)
5. [Configuration](#configuration)
6. [Under the hood](#under-the-hood)
7. [Contributing](#contributing)
8. [License and credits](#license)

---

## What this is

Most photo libraries contain a significant share of images without location data: scanned film, screenshots, messenger downloads, photos taken with location services disabled. These images are missing a useful dimension and appear blank on any map view.

This tool predicts a plausible location for each of them. The underlying model is GeoCLIP, a deep learning network trained on millions of geotagged images, and it is typically accurate enough to identify the neighbourhood rather than just the country. It can be run on a single image, on a small batch, or across an entire library. Everything runs on the host machine. The model weights are downloaded once on first launch; after that the application works offline.

---

## The three modes

| Mode                  | Purpose                                                                 | Typical use case                                                            |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Explore](#explore)   | Upload photos, inspect the predictions.                                 | Investigating a single image or a small batch.                              |
| [Overview](#overview) | Scan a folder, see which photos have GPS and which do not.              | Understanding the state of a library before running the editor.             |
| [Edit](#edit)         | Let the model fill in missing coordinates. The user accepts or rejects. | Enriching a large set of photos so they appear on map views in other tools. |

---

## Explore

Any image uploaded to the drop zone is plotted on a world map together with the top five predictions, the address of the top candidate, and, when the file already contained GPS metadata, a distance-to-truth benchmark.

<p align="center">
  <img src="docs/screenshots/explore_melbourne.png" alt="An apartment interior in Melbourne, predicted as Southbank, off by 800 m" width="880">
</p>

> Floor-to-ceiling windows, a dining table, no obvious landmark. The model predicted **Southbank, Victoria**. The ground truth was **Docklands, Victoria**, about 800 metres away.

<p align="center">
  <img src="docs/screenshots/explore_un_hall.png" alt="The UN General Assembly Hall, predicted as Long Island City, off by 79 m" width="880">
</p>

> All five top predictions landed on **Long Island City, New York**. Deviation from the ground truth: **79 metres**.

<p align="center">
  <img src="docs/screenshots/explore_sydney.png" alt="A street in Sydney, predicted correctly, off by 340 m" width="880">
</p>

> Predicted **Sydney, NSW**. Deviation **340 metres**.

<p align="center">
  <img src="docs/screenshots/explore_fiji.png" alt="An infinity pool in Fiji, predicted as Nadi, off by 6 km" width="880">
</p>

> Palms, turquoise water, no street signs. Predicted **Nadi, Western, Fiji**. Deviation approximately **6 kilometres**, still within the correct region.

<p align="center">
  <img src="docs/screenshots/explore_gold_coast.png" alt="Gold Coast at night, predicted as Surfers Paradise, off by 410 m" width="880">
</p>

> Predicted **Surfers Paradise, Queensland**. Ground truth **Gold Coast, Queensland**. Deviation **410 metres**. Low-light images are handled equally well.

Up to 50 images can be processed per batch. Results appear on the map as each prediction completes.

<p align="center">
  <img src="docs/screenshots/explore_batch_processing.png" alt="Batch processing in Explore mode with a world map filling up live" width="880">
</p>

> A batch of 38 photos in progress. 23 completed, roughly 4 minutes remaining, results streaming onto the world map as they arrive.

---

## Overview

Given a directory, every image in it is classified into one of five categories: `Real GPS`, `Estimated GPS` (coordinates previously written by this application), `No GPS`, `Null Island` (the classic (0, 0) sensor bug), and `Errors`. Coordinates are plotted on a world map so that gaps in coverage become visible at a glance.

<p align="center">
  <img src="docs/screenshots/overview_library_stats.png" alt="Overview mode library statistics with a map" width="880">
</p>

> A minimal example with a single image. For a real camera roll this view becomes a dense heat map that highlights both coverage and the gaps in the library.

Strictly read-only. Nothing on disk is modified. Running this mode first is the recommended way to understand a library before deciding whether to invoke the editor.

---

## Edit

The primary feature. A guided flow for filling in missing GPS coordinates. The model produces the predictions; the user confirms or rejects them one by one. Typing an address is only necessary when overriding the model's suggestion.

**Step 1.** Select a directory, set the optional toggles, start the scan.

<p align="center">
  <img src="docs/screenshots/edit_config.png" alt="Edit mode configuration screen" width="880">
</p>

> Configuration screen: directory path, optional confidence threshold, optional re-processing of previously predicted photos. The safety notice at the bottom is enforced in code: real camera GPS is never modified.

**Step 2.** The model is applied to every candidate image. Photos captured close in time to GPS-tagged photos receive a confidence bonus, since physical proximity in time implies physical proximity in space.

**Step 3.** Each suggestion is reviewed individually. Keyboard shortcuts: `A` or `Enter` to accept, `R` or `Esc` to reject, `M` to supply a manual address.

<p align="center">
  <img src="docs/screenshots/edit_review.png" alt="Edit mode review screen with accept, reject, manual buttons" width="880">
</p>

> Single-image review. The top prediction is shown alongside four alternatives; three buttons drive the decision; the privacy reminder at the bottom restates the guarantee.

Accepted coordinates are written directly into the image's EXIF metadata and tagged `ESTIMATED` so that predicted locations remain distinguishable from camera-recorded ones in the future. Reviewing one hundred images typically takes around ten minutes.

Images that already contain real GPS are never touched.

---

## Privacy

All processing takes place on the host machine.

- Images are read from local disk, processed in local memory, and written back to local disk. No other transfer occurs.
- No telemetry, no analytics, no user accounts.
- A single outbound network call is made on first launch to download the model weights from HuggingFace. Subsequent runs work offline. Reverse geocoding (coordinates to place names) and forward geocoding (address lookup) use external services when available but are not required for core functionality.
- Every coordinate written by the application is tagged `ESTIMATED:GEOCLIP:<version>:<timestamp>` in the image's EXIF metadata so that real GPS and predicted GPS can always be distinguished.

---

## Quick start

Requirements: Docker Engine 24+ and Docker Compose v2. Supported on Linux, macOS, and Windows via WSL2. Approximately 4 GB of free disk is needed for the model cache and 4 GB of free RAM while the model is loaded.

```bash
git clone https://github.com/M-Enzinger/where-was-this-taken.git
cd where-was-this-taken
cp .env.example .env
docker compose up
```

Then open [http://localhost:8085](http://localhost:8085) in a browser.

On the first launch the backend downloads the model weights (approximately 3.5 GB). Progress is visible in the terminal. The frontend container is intentionally held back until the backend reports healthy, so `localhost:8085` remains unreachable until the application is fully ready. This avoids a partially loaded UI racing the download.

Subsequent starts are immediate, as the weights are persisted in a named Docker volume.

To stop:

```bash
docker compose down       # stop containers, preserve the model cache
docker compose down -v    # stop containers and wipe the model cache
```

### Using a custom photo library

The repository ships with **no photos**. On the first `docker compose up` an empty `./photos/` directory is created alongside the project and mounted into the backend as `/photos`. Images placed in this directory, or an existing library configured via `.env`, are the only files the application ever reads:

```ini
PHOTO_LIBRARY_PATH=/absolute/path/to/the/library
```

Files in this folder never leave the machine. Only the Edit mode writes to them, and only under the safety guarantees described in the technical section.

---

## Configuration

All settings live in `.env`. Defaults ship in `.env.example`.

| Variable             | Default    | What it does                                                             |
| -------------------- | ---------- | ------------------------------------------------------------------------ |
| `PORT`               | `8085`     | Host port the UI is served on.                                           |
| `PHOTO_LIBRARY_PATH` | `./photos` | Host path mounted at `/photos` in the backend.                           |
| `GEOCLIP_TOP_K`      | `5`        | Number of ranked predictions returned per image.                         |
| `EDIT_MODE_ENABLED`  | `true`     | Guard for GPS-writing endpoints. Set `false` for a read-only deployment. |
| `MODEL_IDLE_TIMEOUT` | `600`      | Reserved. Idle auto-unload is wired but disabled.                        |

---

## Under the hood

This section is for the curious and for contributors. If you just want to use the app, you can stop reading here.

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

Two docker services, one named volume for the model cache, one healthcheck that blocks the frontend until the backend has the model in RAM.

### How the AI works

GeoCLIP ([paper and code](https://github.com/VicenteVivan/geo-clip)) is a dual-encoder neural network. One encoder turns an image into a feature vector, a second encoder does the same for latitude/longitude coordinates. At inference the image is matched against a grid of candidate coordinates and the best matches are returned. It was trained on a large dataset of geotagged photos.

On its own it is roughly city-level accurate. Two extra signals tighten that up inside Edit mode:

1. **Temporal proximity.** For a photo without GPS, photos taken within minutes that do have GPS are strong evidence. A match within five minutes can override the raw model output, because people cannot physically teleport.
2. **Filename sequence and folder names.** Burst sequences, folder names like `Paris 2024`, and GPS-before-and-after ranges all contribute additional hints.

The combined confidence score is `max(model_confidence, temporal_confidence)`. Full logic in `backend/app/enhancer.py` and `backend/app/library_context.py`.

### Safety model for GPS writes

Three independent defences before any file is touched.

1. **Queue filter.** Only images the scanner reports as GPS-less enter the write queue in the first place.
2. **Pre-write double-check.** Right before calling `exiftool`, the file is re-read with both `exiftool` and Pillow. A disagreement or a detected GPS tag aborts the write.
3. **Post-write validation.** The file is re-read after writing and coordinates must match within floating-point tolerance, otherwise the write is considered failed.

### API reference

Everything is under `/api`.

| Method | Path                                                        | Purpose                                           |
| ------ | ----------------------------------------------------------- | ------------------------------------------------- |
| `GET`  | `/api/health`                                               | Liveness probe. Returns `{status, model_loaded}`. |
| `GET`  | `/api/system-status`                                        | Process RAM, total RAM, model state.              |
| `POST` | `/api/predict`                                              | Single-image prediction.                          |
| `POST` | `/api/predict/batch`                                        | Up to 50 files at once.                           |
| `POST` | `/api/scan`                                                 | Kick off an Overview-mode directory scan.         |
| `GET`  | `/api/scan/{id}/status`                                     | Scan progress polling.                            |
| `GET`  | `/api/scan/{id}/results`                                    | Full scan results.                                |
| `POST` | `/api/edit/start`                                           | Create an edit session.                           |
| `POST` | `/api/edit/{id}/round`                                      | Run prediction over candidate images.             |
| `GET`  | `/api/edit/{id}/queue/next`                                 | Fetch the next image awaiting review.             |
| `POST` | `/api/edit/{id}/review/{image_id}/{accept\|reject\|manual}` | Record a review decision.                         |
| `POST` | `/api/edit/{id}/apply/{image_id}`                           | Write the approved GPS to disk.                   |

### Code layout

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              FastAPI app, single-image endpoints
│   │   ├── model.py             GeoCLIP lifecycle
│   │   ├── enhancer.py          Combined scoring
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
│   │   ├── App.tsx              Shell, header, dark mode
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

Bug reports, feature suggestions, and pull requests are welcome. Issues are the preferred entry point for any of the three. Responses are typically prompt.

A sincere thank you to everyone who takes the time to contribute. Every report, fix, review, translation, and documentation improvement makes the project better for the next person who finds it. A GitHub star is also a meaningful signal for a solo-maintained project.

## License

**GNU Affero General Public License v3.0.** See [LICENSE](LICENSE) for the full text.

In plain terms, AGPL-3.0 means you can use, modify, and redistribute this software for any purpose including commercial ones. The one catch is that if you modify it and run your modified version on a public server, you must release your modifications under the same license.

## Acknowledgements

This project stands on a tall stack of open-source giants. The About panel inside the app lists every dependency with its license and a link. Short version:

[**GeoCLIP**](https://github.com/VicenteVivan/geo-clip) by Vicente Vivanco Cepeda and coauthors (the model),
[**OpenAI CLIP**](https://github.com/openai/CLIP),
[**PyTorch**](https://pytorch.org),
[**Transformers**](https://huggingface.co/docs/transformers),
[**FastAPI**](https://fastapi.tiangolo.com),
[**Uvicorn**](https://www.uvicorn.org),
[**Pillow**](https://python-pillow.org),
[**exiftool**](https://exiftool.org),
[**React**](https://react.dev),
[**Vite**](https://vite.dev),
[**Tailwind CSS**](https://tailwindcss.com),
[**Framer Motion**](https://www.framer.com/motion),
[**Leaflet**](https://leafletjs.com),
[**React-Leaflet**](https://react-leaflet.js.org),
[**OpenStreetMap**](https://www.openstreetmap.org/copyright),
[**CARTO**](https://carto.com/attributions),
[**reverse_geocoder**](https://github.com/thampiman/reverse-geocoder),
[**geopy**](https://github.com/geopy/geopy),
[**pycountry**](https://github.com/pycountry/pycountry).

Thanks to every maintainer and contributor of those projects.

---

<div align="center">

Maintained by **Maximilian Enzinger**.

</div>
