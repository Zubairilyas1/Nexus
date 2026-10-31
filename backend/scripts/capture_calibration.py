import cv2
import os
import time
import yt_dlp

def _resolve_youtube_url(youtube_url: str) -> str:
    ydl_opts = {
        'format': 'best[ext=mp4]/best',
        'quiet': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=False)
        return info['url']

def capture_frames(url: str, output_dir: str, num_frames: int = 100, interval_sec: float = 0.5):
    os.makedirs(output_dir, exist_ok=True)
    
    if "youtube.com" in url or "youtu.be" in url:
        print(f"Resolving youtube URL {url}...")
        url = _resolve_youtube_url(url)
        
    cap = cv2.VideoCapture(url)
    if not cap.isOpened():
        print(f"Failed to open {url}")
        return
        
    count = 0
    print(f"Capturing {num_frames} frames to {output_dir}...")
    
    while count < num_frames:
        ret, frame = cap.read()
        if not ret:
            break
            
        path = os.path.join(output_dir, f"calib_{count:04d}.jpg")
        cv2.imwrite(path, frame)
        count += 1
        print(f"Captured {count}/{num_frames}")
        
        # skip frames based on FPS
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frames_to_skip = int(fps * interval_sec)
        for _ in range(frames_to_skip):
            cap.read()
        
    cap.release()
    print("Done!")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    url = os.environ.get("YOUTUBE_FALLBACK_URL", "https://www.youtube.com/watch?v=1EiC9bvVGnk")
    capture_frames(url, "backend/calib_images", num_frames=100, interval_sec=0.2)
