/* ---- Testing mode types ---- */

export interface Address {
  city: string;
  region: string;
  country: string;
  country_code: string;
}

export interface Prediction {
  rank: number;
  lat: number;
  lon: number;
  probability: number;
  address: Address | null;
}

export interface ImageMetadata {
  camera: string | null;
  date_taken: string | null;
  width: number | null;
  height: number | null;
  has_gps: boolean;
}

export interface RealLocation {
  lat: number;
  lon: number;
  address: Address | null;
  source: string;
}

export interface Benchmark {
  top1_distance_km: number;
  best_distance_km: number;
  best_prediction_rank: number;
  distances: number[];
}

export interface AnalysisResult {
  predictions: Prediction[];
  real_location: RealLocation | null;
  benchmark: Benchmark | null;
  image_metadata: ImageMetadata;
  processing_time_ms: number;
  filename: string;
  error?: string;
  imageUrl?: string;
  id: string;
}

export type FileStatus = "pending" | "processing" | "done" | "error";

export interface SelectedFile {
  file: File;
  id: string;
  previewUrl: string;
  status: FileStatus;
  error?: string;
}

/* ---- Monitor mode types ---- */

export interface ScanStatus {
  scan_id: string;
  status: "scanning" | "complete" | "error";
  directory: string;
  total: number;
  processed: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ScanImage {
  path: string;
  relative_path: string;
  filename: string;
  has_gps: boolean;
  is_estimated: boolean;
  coordinates: { lat: number; lon: number } | null;
  sources: string[];
  format: string;
  file_size: number;
  date_taken: string | null;
  likely_null_island: boolean;
  error: string | null;
}

export interface DirBreakdown {
  directory: string;
  total: number;
  with_gps: number;
  without_gps: number;
}

export interface GpsImage {
  path: string;
  filename: string;
  lat: number | null;
  lon: number | null;
  is_estimated: boolean;
}

export interface ScanResults {
  total_images: number;
  with_gps: number;
  without_gps: number;
  with_estimated_gps: number;
  null_island: number;
  errors: number;
  by_format: Record<string, number>;
  by_directory: DirBreakdown[];
  images: ScanImage[];
  gps_images: GpsImage[];
}

export type AppMode = "testing" | "monitor" | "edit";
