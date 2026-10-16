import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from sample_generator import generate_synthetic_panoramic_video, generate_failed_test_video

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app_name"] == "Laveon Studio 360"
    assert "opencv_version" in data
    assert "ffmpeg_available" in data
    assert isinstance(data["ffmpeg_available"], bool)

def test_invalid_extension_upload():
    # Attempt to upload a text file instead of MP4/MOV/AVI
    files = {"video": ("malicious.txt", b"Hello world this is not a video", "text/plain")}
    response = client.post("/api/process-video", files=files)
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]

def test_empty_video_upload():
    files = {"video": ("empty.mp4", b"", "video/mp4")}
    response = client.post("/api/process-video", files=files)
    assert response.status_code == 400
    assert "Uploaded file is empty" in response.json()["detail"]

def test_path_traversal_guards():
    # Non-UUID string pattern returns 400 Bad Request
    response = client.get("/api/results/illegal..path..id")
    assert response.status_code == 400
    assert "Invalid result ID" in response.json()["detail"]

    response2 = client.get("/api/results/00000000-0000-0000-0000-000000000000")
    assert response2.status_code == 404

def test_end_to_end_video_processing(tmp_path: Path):
    # 1. Generate realistic synthetic rotating video
    test_video_path = tmp_path / "test_rotating_cam.mp4"
    generate_synthetic_panoramic_video(
        output_mp4_path=test_video_path,
        canvas_width=2000,
        canvas_height=500,
        frame_width=500,
        frame_height=400,
        num_frames=30,
        fps=10
    )
    assert test_video_path.exists()
    assert test_video_path.stat().st_size > 0

    # 2. Post to /api/process-video
    with open(test_video_path, "rb") as f_vid:
        files = {"video": ("test_rotating_cam.mp4", f_vid, "video/mp4")}
        data = {
            "sample_interval_sec": 0.2,
            "max_frames": 25,
            "similarity_threshold": 0.99
        }
        res = client.post("/api/process-video", files=files, data=data)

    assert res.status_code == 200, res.text
    result = res.json()

    assert result["status"] == "success"
    result_id = result["result_id"]
    assert result["panorama_width"] > 500
    assert result["panorama_height"] > 300
    assert result["is_360_complete"] is False  # Honest reporting
    assert result["frame_stats"]["extracted_count"] > 0
    assert result["frame_stats"]["selected_count"] >= 2

    # 3. Retrieve metadata via GET /api/results/{result_id}
    meta_res = client.get(f"/api/results/{result_id}")
    assert meta_res.status_code == 200
    assert meta_res.json()["result_id"] == result_id

    # 4. Preview endpoint GET /api/results/{result_id}/preview
    prev_res = client.get(f"/api/results/{result_id}/preview")
    assert prev_res.status_code == 200
    assert prev_res.headers["content-type"] == "image/jpeg"
    assert len(prev_res.content) > 1000

    # 5. Download endpoint GET /api/results/{result_id}/download
    dl_res = client.get(f"/api/results/{result_id}/download")
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "image/jpeg"
    assert "attachment" in dl_res.headers["content-disposition"]

def test_featureless_video_stitching_failure(tmp_path: Path):
    # Video with plain white frames that has no visual features
    bad_video_path = tmp_path / "bad_featureless.mp4"
    generate_failed_test_video(bad_video_path)

    with open(bad_video_path, "rb") as f_vid:
        files = {"video": ("bad_featureless.mp4", f_vid, "video/mp4")}
        data = {
            "sample_interval_sec": 0.5,
            "max_frames": 10
        }
        res = client.post("/api/process-video", files=files, data=data)

    assert res.status_code == 200
    result = res.json()
    assert result["status"] == "failed"
    assert result["error_code"] is not None
    assert len(result["troubleshooting_tips"]) > 0
    # Crucial rule: Never substitute a fake image
    assert result["download_url"] is None


def test_sample_photos_endpoint():
    res = client.get("/api/sample-photos")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["count"] >= 10
    assert len(data["files"]) >= 10

    # Stream first sample photo
    first_file = data["files"][0]
    file_res = client.get(f"/api/sample-photos/{first_file}")
    assert file_res.status_code == 200
    assert file_res.headers["content-type"] == "image/jpeg"
    assert len(file_res.content) > 1000


def test_check_photos_endpoint(tmp_path: Path):
    from sample_generator import generate_synthetic_360_photos
    photo_paths = generate_synthetic_360_photos(tmp_path / "check_photos")
    assert len(photo_paths) >= 10

    files = [("photos", (p.name, open(p, "rb"), "image/jpeg")) for p in photo_paths[:6]]
    res = client.post("/api/check-photos", files=files, data={"min_blur_threshold": "15.0"})

    # Close file handles
    for _, (_, f, _) in files:
        f.close()

    assert res.status_code == 200
    data = res.json()
    assert data["total_photos"] == 6
    assert data["average_blur_score"] > 0
    assert "photos" in data
    assert len(data["photos"]) == 6


def test_process_photos_endpoint_and_download(tmp_path: Path):
    from sample_generator import generate_synthetic_360_photos
    photo_paths = generate_synthetic_360_photos(tmp_path / "stitch_photos")
    assert len(photo_paths) >= 10

    files = [("photos", (p.name, open(p, "rb"), "image/jpeg")) for p in photo_paths]
    data = {
        "min_blur_threshold": "10.0",
        "scale_width": "1920",
        "stitching_mode": "full_sphere"
    }

    res = client.post("/api/process-photos", files=files, data=data)

    # Close file handles
    for _, (_, f, _) in files:
        f.close()

    assert res.status_code == 200
    stitch_res = res.json()
    assert stitch_res["status"] == "success"
    assert stitch_res["is_equirectangular"] is True
    assert stitch_res["panorama_width"] == 1920
    assert stitch_res["panorama_height"] == 960  # Exact 2:1 ratio
    assert stitch_res["panorama_aspect_ratio"] == 2.0

    result_id = stitch_res["result_id"]

    # Verify download matches exact output
    dl_res = client.get(f"/api/results/{result_id}/download")
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "image/jpeg"
    assert len(dl_res.content) > 1000

