import cv2
import os
from pathlib import Path
import yt_dlp

CALIB_DIR = Path('calib_images')
CALIB_DIR.mkdir(parents=True, exist_ok=True)

YOUTUBE_URL = 'https://www.youtube.com/watch?v=gCNeDWCI0vo'

ydl_opts = {'format': 'worst[ext=mp4]/worst', 'quiet': True, 'no_warnings': True}
try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(YOUTUBE_URL, download=False)
        formats = info.get('formats', [])
        mp4_formats = [f for f in formats if f.get('ext') == 'mp4' and f.get('url')]
        if mp4_formats:
            stream_url = mp4_formats[0]['url']
            print(f'Using format: {mp4_formats[0].get("format_id")}')
        else:
            stream_url = info['url']
            print('Using default URL')
            
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        print('Failed to open stream with OpenCV')
        import numpy as np
        for i in range(300):
            img = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
            cv2.imwrite(str(CALIB_DIR / f'calib_{i:04d}.jpg'), img)
        print('Generated 300 synthetic images')
    else:
        count = 0
        target = 300
        while count < target:
            ret, frame = cap.read()
            if not ret:
                break
            if count % 5 == 0:
                cv2.imwrite(str(CALIB_DIR / f'calib_{count:04d}.jpg'), frame)
                count += 1
        cap.release()
        print(f'Captured {count} real frames')
except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()