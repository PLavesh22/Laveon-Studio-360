import httpx

client = httpx.Client(base_url='http://127.0.0.1:5174')

# 1. Health check through Vite proxy
health = client.get('/api/health').json()
print('Proxy Health:', health['status'], '| OpenCV:', health['opencv_version'], '| FFmpeg OK:', health['ffmpeg_available'])

# 2. Sample video download
vid_res = client.get('/api/sample-video')
print('Sample video status:', vid_res.status_code, '| Size:', len(vid_res.content), 'bytes')
assert vid_res.status_code == 200

# 3. Post to process-video
files = {'video': ('demo.mp4', vid_res.content, 'video/mp4')}
data = {
    'sample_interval_sec': '0.3',
    'max_frames': '25',
    'scale_width': '1280'
}
print('Sending video to /api/process-video via frontend proxy...')
proc_res = client.post('/api/process-video', files=files, data=data, timeout=45.0)
print('Process status code:', proc_res.status_code)
result = proc_res.json()
print('Stitch status:', result['status'])
print('Panorama Dimensions:', f"{result.get('panorama_width')}x{result.get('panorama_height')}")
print('Aspect ratio:', result.get('panorama_aspect_ratio'))
print('Frames:', result.get('frame_stats'))
print('Download URL:', result.get('download_url'))

# 4. Test download endpoint
dl_res = client.get(result['download_url'])
print('Download endpoint status:', dl_res.status_code, '| Content-Type:', dl_res.headers.get('content-type'), '| Size:', len(dl_res.content), 'bytes')
assert dl_res.status_code == 200
print('=== FULL FRONTEND-TO-BACKEND PIPELINE VERIFIED SUCCESSFULLY ===')
