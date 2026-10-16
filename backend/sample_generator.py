import cv2
import numpy as np
from pathlib import Path
from typing import List

def generate_synthetic_panoramic_video(
    output_mp4_path: Path,
    canvas_width: int = 2400,
    canvas_height: int = 600,
    frame_width: int = 640,
    frame_height: int = 480,
    num_frames: int = 45,
    fps: int = 15
) -> Path:
    """
    Synthesizes a realistic textured panoramic scene and simulates a camera
    rotating horizontally (pure yaw) across the scene.
    Each frame has ~60-70% visual overlap with the subsequent frame,
    providing ample distinct keypoints for OpenCV's Stitcher.
    """
    output_mp4_path.parent.mkdir(parents=True, exist_ok=True)

    # 1. Create a rich background canvas (gradient sky + textured landscape)
    canvas = np.zeros((canvas_height, canvas_width, 3), dtype=np.uint8)

    # Sky gradient (blue to warm orange/pink)
    for y in range(canvas_height // 2):
        alpha = y / (canvas_height // 2)
        color = np.array([220 * (1 - alpha * 0.5), 160 * (1 - alpha * 0.3), 80 + 140 * alpha], dtype=np.uint8)
        canvas[y, :] = color

    # Ground (green-gray textured terrain)
    for y in range(canvas_height // 2, canvas_height):
        alpha = (y - canvas_height // 2) / (canvas_height // 2)
        color = np.array([30 + int(30 * alpha), 80 + int(40 * alpha), 20 + int(20 * alpha)], dtype=np.uint8)
        canvas[y, :] = color

    # 2. Add visual landmarks and high-contrast geometric features across the panoramic canvas
    np.random.seed(42)

    # Add distinct "buildings", landmarks, and structures every 150-250 pixels
    for x in range(100, canvas_width - 200, 180):
        b_w = np.random.randint(70, 130)
        b_h = np.random.randint(180, 260)
        b_top = canvas_height // 2 - b_h + 50
        b_color = (
            int(np.random.randint(120, 220)),
            int(np.random.randint(100, 200)),
            int(np.random.randint(140, 230))
        )
        # Building body
        cv2.rectangle(canvas, (x, b_top), (x + b_w, canvas_height // 2 + 50), b_color, -1)
        cv2.rectangle(canvas, (x, b_top), (x + b_w, canvas_height // 2 + 50), (40, 40, 40), 2)

        # Windows (creating dense SIFT/ORB keypoint clusters)
        for wy in range(b_top + 15, canvas_height // 2 + 40, 30):
            for wx in range(x + 10, x + b_w - 15, 25):
                cv2.rectangle(canvas, (wx, wy), (wx + 15, wy + 18), (250, 240, 120), -1)
                cv2.rectangle(canvas, (wx, wy), (wx + 15, wy + 18), (20, 20, 20), 1)

        # Add text labels as recognizable landmarks
        label = f"Station {x // 200 + 1}"
        cv2.putText(canvas, label, (x + 5, b_top - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 2)

    # Add decorative foreground trees / lampposts
    for x in range(50, canvas_width - 50, 90):
        # Tree trunk
        cv2.line(canvas, (x, canvas_height // 2 + 50), (x, canvas_height // 2 + 130), (30, 45, 75), 4)
        # Tree foliage
        cv2.circle(canvas, (x, canvas_height // 2 + 40), 25, (30, 130, 40), -1)
        cv2.circle(canvas, (x - 8, canvas_height // 2 + 35), 18, (40, 160, 50), -1)

    # 3. Simulate camera rotation by panning a frame window across the canvas
    max_pan_x = canvas_width - frame_width
    pan_positions = np.linspace(0, max_pan_x, num_frames, dtype=int)

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(output_mp4_path), fourcc, fps, (frame_width, frame_height))

    for x_offset in pan_positions:
        # Crop frame with slight vertical centering
        y_offset = (canvas_height - frame_height) // 2
        frame = canvas[y_offset:y_offset + frame_height, x_offset:x_offset + frame_width]
        out.write(frame)

    out.release()
    return output_mp4_path

def generate_failed_test_video(output_mp4_path: Path) -> Path:
    """
    Creates a video that will intentionally fail feature matching
    (blank featureless white wall) to test error handling.
    """
    output_mp4_path.parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(output_mp4_path), fourcc, 10, (320, 240))

    for _ in range(20):
        # Blank white frame without keypoints
        frame = np.full((240, 320, 3), 255, dtype=np.uint8)
        out.write(frame)

    out.release()
    return output_mp4_path

if __name__ == "__main__":
    test_dir = Path(__file__).resolve().parent / "test_media"
    test_dir.mkdir(parents=True, exist_ok=True)

    good_video = test_dir / "rotating_panorama_sample.mp4"
    generate_synthetic_panoramic_video(good_video)
    print(f"Generated sample rotating video at: {good_video}")

    bad_video = test_dir / "featureless_fail_sample.mp4"
    generate_failed_test_video(bad_video)
    print(f"Generated sample failure video at: {bad_video}")


def generate_synthetic_360_photos(
    output_dir: Path,
    num_horizon_shots: int = 8,
    canvas_width: int = 2400,
    canvas_height: int = 1200,
    photo_w: int = 640,
    photo_h: int = 480
) -> List[Path]:
    """
    Generates a set of multi-tier overlapping photos (Horizon ring, Upper Sky,
    Lower Ground, Zenith, Nadir) from a rich 360-degree cylindrical/equirectangular scene.
    Adjacent photos have >50% visual overlap for robust OpenCV feature matching.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    generated_paths: List[Path] = []

    # 1. Synthesize a 360-degree scene canvas
    canvas = np.zeros((canvas_height, canvas_width, 3), dtype=np.uint8)

    # Sky gradient (top half)
    for y in range(canvas_height // 2):
        t = y / (canvas_height // 2)
        # Deep sky blue to warm sunset horizon
        b = int(220 * (1 - t * 0.4))
        g = int(160 * (1 - t * 0.2))
        r = int(70 + 150 * t)
        canvas[y, :] = (b, g, r)

    # Ground gradient (bottom half)
    for y in range(canvas_height // 2, canvas_height):
        t = (y - canvas_height // 2) / (canvas_height // 2)
        b = int(40 + 30 * t)
        g = int(80 + 40 * t)
        r = int(30 + 20 * t)
        canvas[y, :] = (b, g, r)

    # Visual landmarks and high-contrast features for keypoint matching
    np.random.seed(101)
    for x in range(60, canvas_width - 80, 140):
        b_w = np.random.randint(60, 110)
        b_h = np.random.randint(160, 260)
        b_top = canvas_height // 2 - b_h + 40
        b_color = (
            int(np.random.randint(110, 210)),
            int(np.random.randint(90, 190)),
            int(np.random.randint(130, 220))
        )
        cv2.rectangle(canvas, (x, b_top), (x + b_w, canvas_height // 2 + 60), b_color, -1)
        cv2.rectangle(canvas, (x, b_top), (x + b_w, canvas_height // 2 + 60), (30, 30, 30), 2)

        # Windows
        for wy in range(b_top + 15, canvas_height // 2 + 40, 28):
            for wx in range(x + 8, x + b_w - 12, 22):
                cv2.rectangle(canvas, (wx, wy), (wx + 12, wy + 16), (250, 240, 100), -1)
                cv2.rectangle(canvas, (wx, wy), (wx + 12, wy + 16), (20, 20, 20), 1)

        label = f"Sector {x // 200 + 1}"
        cv2.putText(canvas, label, (x + 4, b_top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 2)

    # Wrap the scene horizontally so the 360-degree loop closes seamlessly
    wrap_margin = photo_w
    extended_canvas = np.hstack([canvas, canvas[:, :wrap_margin]])

    # 2. Extract Horizon Ring Photos (Level view 0 deg)
    step_x = canvas_width // num_horizon_shots
    horizon_y = (canvas_height - photo_h) // 2

    for i in range(num_horizon_shots):
        x = i * step_x
        crop = extended_canvas[horizon_y:horizon_y + photo_h, x:x + photo_w]
        p = output_dir / f"photo_01_horizon_{i+1:02d}_{i * 45}deg.jpg"
        cv2.imwrite(str(p), crop, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        generated_paths.append(p)

    # 3. Extract Upper Sky Ring (+35 deg tilt)
    upper_y = max(0, horizon_y - 200)
    for i in range(0, num_horizon_shots, 2):
        x = i * step_x
        crop = extended_canvas[upper_y:upper_y + photo_h, x:x + photo_w]
        p = output_dir / f"photo_02_upper_{i+1:02d}_{i * 45}deg.jpg"
        cv2.imwrite(str(p), crop, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        generated_paths.append(p)

    # 4. Extract Lower Ground Ring (-35 deg tilt)
    lower_y = min(canvas_height - photo_h, horizon_y + 200)
    for i in range(0, num_horizon_shots, 2):
        x = i * step_x
        crop = extended_canvas[lower_y:lower_y + photo_h, x:x + photo_w]
        p = output_dir / f"photo_03_lower_{i+1:02d}_{i * 45}deg.jpg"
        cv2.imwrite(str(p), crop, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        generated_paths.append(p)

    # 5. Extract Zenith (+75 deg straight up into sky)
    zenith_crop = extended_canvas[0:photo_h, 0:photo_w]
    p_zenith = output_dir / "photo_04_zenith_sky.jpg"
    cv2.imwrite(str(p_zenith), zenith_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    generated_paths.append(p_zenith)

    # 6. Extract Nadir (-75 deg straight down onto ground)
    nadir_crop = extended_canvas[canvas_height - photo_h:canvas_height, 0:photo_w]
    p_nadir = output_dir / "photo_05_nadir_ground.jpg"
    cv2.imwrite(str(p_nadir), nadir_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    generated_paths.append(p_nadir)

    return generated_paths

