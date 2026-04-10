import type { AnalysisResult, ScanResults, ScanStatus } from "./types";

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

/* ---- Overview / Monitor mode ---- */

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

/* ---- Edit mode ---- */

export async function editInfo(sessionId: string): Promise<{
  session_id: string;
  directory: string;
  threshold: number;
  include_predicted: boolean;
  status: string;
  current_round: number;
  total_images: number;
  real_gps_count: number;
  predicted_gps_count: number;
  no_gps_count: number;
  round_status: string | null;
  round_above_threshold: number;
  round_pending_review: number;
}> {
  const res = await fetch(`/api/edit/${sessionId}/info`);
  if (!res.ok) throw new Error("Session not found");
  return res.json();
}

export async function editStart(
  directory: string,
  threshold: number,
  includePredicted: boolean,
): Promise<{
  session_id: string;
  total_images: number;
  real_gps_count: number;
  predicted_gps_count: number;
  no_gps_count: number;
  disagreements: number;
  status: string;
  warnings: string[];
}> {
  const res = await fetch("/api/edit/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directory,
      threshold,
      include_predicted: includePredicted,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(body.error || "Failed to start edit session");
  }
  return res.json();
}

export async function editStartRound(sessionId: string): Promise<{
  round: number;
  candidates: number;
  reference_gps: number;
  status: string;
}> {
  const res = await fetch(`/api/edit/${sessionId}/round`, { method: "POST" });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(b.error || "Failed to start round");
  }
  return res.json();
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
  current_round: number;
  processed: number;
  remaining: number;
  total: number;
  above_threshold: number;
  below_threshold: number;
  current_image: string | null;
}> {
  const res = await fetch(`/api/edit/${sessionId}/status`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export async function editRoundSummary(
  sessionId: string,
  roundNum: number,
): Promise<{
  round_num: number;
  status: string;
  total_candidates: number;
  above_threshold: number;
  below_threshold: number;
  accepted: number;
  rejected: number;
  pending_review: number;
  auto_skipped: number;
  remaining_unlocated: number;
  reference_gps_count: number;
}> {
  const res = await fetch(`/api/edit/${sessionId}/round/${roundNum}/summary`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export async function editQueue(sessionId: string): Promise<{
  items: Array<{
    image_id: string;
    path: string;
    filename: string;
    status: string;
    combined_score: number | null;
    model_confidence: number | null;
    temporal_confidence: number | null;
    temporal_source: string | null;
    predictions: Array<{
      rank: number;
      lat: number;
      lon: number;
      probability: number;
      address: { city: string; region: string; country: string } | null;
    }> | null;
    review_decision: string | null;
    review_coordinates: { lat: number; lon: number } | null;
  }>;
  total: number;
}> {
  const res = await fetch(`/api/edit/${sessionId}/queue`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export async function editQueueNext(sessionId: string): Promise<{
  image_id: string;
  filename: string;
  thumbnail_base64: string;
  combined_score: number;
  model_confidence: number;
  temporal_confidence: number;
  temporal_source: string | null;
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
