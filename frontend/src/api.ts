import type {
  AnalysisResult,
  ComparisonResult,
  ScanResults,
  ScanStatus,
  SnapshotMeta,
} from "./types";

const API_TIMEOUT = 600_000;

/* ---- Testing mode ---- */

export async function predictSingle(
  file: File,
  topK: number,
): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
  try {
    const res = await fetch(`/api/predict?top_k=${topK}`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(body.error || "Upload failed");
    }
    const data = await res.json();
    return { ...data, filename: file.name, id: "" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError")
      throw new Error("Request timed out.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkHealth(): Promise<{
  status: string;
  model_loaded: boolean;
}> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Backend unreachable");
  return res.json();
}

/* ---- Monitor mode ---- */

export async function startScan(
  directory: string,
): Promise<{ scan_id: string }> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Scan failed" }));
    throw new Error(body.error || "Scan failed");
  }
  return res.json();
}

export async function getScanStatus(scanId: string): Promise<ScanStatus> {
  const res = await fetch(`/api/scan/${scanId}/status`);
  if (!res.ok) throw new Error("Failed to get scan status");
  return res.json();
}

export async function getScanResults(scanId: string): Promise<ScanResults> {
  const res = await fetch(`/api/scan/${scanId}/results`);
  if (!res.ok) throw new Error("Results not ready");
  return res.json();
}

export async function saveSnapshot(
  scanId: string,
  name: string,
): Promise<SnapshotMeta> {
  const res = await fetch(`/api/scan/${scanId}/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to save snapshot");
  return res.json();
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const res = await fetch("/api/snapshots");
  if (!res.ok) throw new Error("Failed to list snapshots");
  return res.json();
}

export async function compareSnapshots(
  a: string,
  b: string,
): Promise<ComparisonResult> {
  const res = await fetch(
    `/api/snapshots/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
  );
  if (!res.ok) throw new Error("Failed to compare snapshots");
  return res.json();
}

/* ---- Edit mode ---- */

export async function editStart(directory: string): Promise<{
  session_id: string;
  total_images: number;
  gps_images_skipped: number;
  to_process: number;
  disagreements: number;
  warnings: string[];
  status: string;
  library_hints_found?: number;
  burst_hints?: number;
}> {
  const res = await fetch("/api/edit/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(body.error || "Failed to start edit session");
  }
  return res.json();
}

export async function editRun(sessionId: string): Promise<void> {
  const res = await fetch(`/api/edit/${sessionId}/run`, { method: "POST" });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(b.error || "Failed to start inference");
  }
}

export async function editPause(sessionId: string): Promise<void> {
  await fetch(`/api/edit/${sessionId}/pause`, { method: "POST" });
}

export async function editResume(sessionId: string): Promise<void> {
  await fetch(`/api/edit/${sessionId}/resume`, { method: "POST" });
}

export async function editStatus(sessionId: string): Promise<{
  session_id: string;
  status: string;
  processed: number;
  remaining: number;
  total: number;
  current_image: string | null;
}> {
  const res = await fetch(`/api/edit/${sessionId}/status`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export async function editQueue(
  sessionId: string,
  offset = 0,
  limit = 200,
): Promise<{
  items: Array<{
    image_id: string;
    path: string;
    filename: string;
    status: string;
    predictions: Array<{
      rank: number;
      lat: number;
      lon: number;
      probability: number;
      address: { city: string; region: string; country: string } | null;
    }> | null;
    review_decision: string | null;
    review_coordinates: { lat: number; lon: number } | null;
    processed_at: string | null;
  }>;
  total: number;
}> {
  const res = await fetch(
    `/api/edit/${sessionId}/queue?offset=${offset}&limit=${limit}`,
  );
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export async function editQueueNext(sessionId: string): Promise<{
  image_id: string;
  filename: string;
  thumbnail_base64: string;
  predictions: Array<{
    rank: number;
    lat: number;
    lon: number;
    probability: number;
    address: { city: string; region: string; country: string } | null;
  }>;
  status: string;
}> {
  const res = await fetch(`/api/edit/${sessionId}/queue/next`);
  if (!res.ok) throw new Error("No items pending review");
  return res.json();
}

export async function editAccept(
  sessionId: string,
  imageId: string,
): Promise<{ coordinates: { lat: number; lon: number } }> {
  const res = await fetch(`/api/edit/${sessionId}/review/${imageId}/accept`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to accept");
  return res.json();
}

export async function editReject(
  sessionId: string,
  imageId: string,
): Promise<void> {
  const res = await fetch(`/api/edit/${sessionId}/review/${imageId}/reject`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reject");
}

export async function editManual(
  sessionId: string,
  imageId: string,
  address: string,
): Promise<{
  coordinates: { lat: number; lon: number };
  address: { city: string; region: string; country: string } | null;
  geocoded_display: string | null;
}> {
  const res = await fetch(`/api/edit/${sessionId}/review/${imageId}/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: "Geocoding failed" }));
    throw new Error(b.error || "Geocoding failed");
  }
  return res.json();
}

export async function editApply(
  sessionId: string,
  imageId: string,
): Promise<{
  success: boolean;
  error?: string;
  coordinates?: { lat: number; lon: number };
}> {
  const res = await fetch(`/api/edit/${sessionId}/apply/${imageId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: "Apply failed" }));
    throw new Error(b.error || "Apply failed");
  }
  return res.json();
}

export async function editRollbackAll(
  sessionId: string,
): Promise<{ rolled_back: number; failed: number }> {
  const res = await fetch(`/api/edit/${sessionId}/rollback-all`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Rollback failed");
  return res.json();
}

export async function editCleanupBackups(
  sessionId: string,
): Promise<{ cleaned: number }> {
  const res = await fetch(`/api/edit/${sessionId}/cleanup-backups`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Cleanup failed");
  return res.json();
}

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lon: number; display_name: string }> {
  const res = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: "Geocoding failed" }));
    throw new Error(b.error || "Geocoding failed");
  }
  return res.json();
}
