import torch
from app import model
from app.exact_locator import (
    get_device,
    extract_multiscale_image_embedding,
    refine_dense_grid_gpu,
    search_overpass_brand_cluster,
    locate_exact_spot,
)
from PIL import Image

def run_tests():
    print("=== TEST 1: CUDA & Device ===")
    device = get_device()
    print(f"Device: {device}")
    assert device.type == "cuda", f"Expected cuda, got {device}"
    print(f"GPU: {torch.cuda.get_device_name(0)}")

    print("\n=== TEST 2: Multi-scale Embeddings on GPU ===")
    m = model.get_model()
    test_img = Image.new("RGB", (640, 480), color=(120, 140, 180))
    emb = extract_multiscale_image_embedding(m, test_img, device)
    print(f"Embedding shape: {emb.shape}, device: {emb.device}, norm: {float(emb.norm()):.4f}")
    assert emb.shape == (1, 512), f"Expected (1, 512), got {emb.shape}"
    assert emb.device.type == "cuda", "Embedding must be on CUDA"

    print("\n=== TEST 3: GPU Ultra-Dense Grid (Pass 1: 5km @ 50m, Pass 2: 300m @ 10m) ===")
    test_img.save("/tmp/synthetic_outdoor.jpg")
    res = refine_dense_grid_gpu(m, "/tmp/synthetic_outdoor.jpg", 43.2389, 76.8897, is_indoor=False)
    print(f"Dense grid result: {res}")
    assert res.get("device") == "cuda", "Grid refinement must use CUDA"

    print("\n=== TEST 4: Brand Cluster (Overpass 120m threshold) ===")
    # MEGA Alma-Ata brands: Ramstore/Magnum + Zara / Chaplin / KFC
    cluster = search_overpass_brand_cluster(["Magnum", "KFC"], 43.2030, 76.8920, radius_m=5000, cluster_radius_m=150)
    print(f"Brand cluster result: {cluster}")
    if cluster:
        print(f"Cluster name: {cluster.get('name')}")
        print(f"Cluster method: {cluster.get('method')}")
        print(f"Radius: {cluster.get('radius_m')}m")
        assert cluster.get("radius_m") == 35, "Cluster radius must be 35m"

    print("\n=== TEST 5: Full Pipeline with Real Image ===")
    real_path = "/app/geo_sleuth/docs/case/01-photo.jpg"
    spot = locate_exact_spot(m, real_path, 43.2389, 76.8897)
    print(f"Method: {spot.get('method')}")
    print(f"Radius: {spot.get('radius_m')}m")
    print(f"Coordinates: {spot.get('exact_lat')}, {spot.get('exact_lon')}")
    diag = spot.get("diagnostics", {})
    print(f"Diagnostics: {list(diag.keys())}")
    if "mountain_bearing" in diag:
        print(f"Mountain bearing: {diag['mountain_bearing']}")

    print("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
