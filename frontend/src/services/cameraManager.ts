/**
 * CameraManager
 * Modular service managing live camera video streams, device enumeration,
 * multi-tier resolution fallback, and clean resource teardown.
 */

export interface CameraStreamResult {
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
  deviceId?: string;
  label?: string;
  width?: number;
  height?: number;
}

export class CameraManager {
  private currentStream: MediaStream | null = null;
  private currentDeviceId: string = '';

  /**
   * Checks if MediaDevices API is supported in the current environment
   */
  public isSupported(): boolean {
    return Boolean(
      typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  /**
   * Retrieves all available video input devices
   */
  public async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    if (!this.isSupported() || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput');
    } catch (err) {
      console.warn('Failed to enumerate cameras:', err);
      return [];
    }
  }

  /**
   * Starts a camera stream with multi-tier fallback (environment HD -> basic environment -> default)
   */
  public async startStream(preferredDeviceId?: string): Promise<CameraStreamResult> {
    if (!this.isSupported()) {
      throw new Error(
        'In-browser camera access requires HTTPS or localhost. If testing over Wi-Fi IP, use HTTPS or use "Snap with Device Camera".'
      );
    }

    // Stop existing stream if any
    this.stopStream();

    let stream: MediaStream | null = null;
    const targetDeviceId = preferredDeviceId || this.currentDeviceId;

    if (targetDeviceId) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: targetDeviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        // Fall back to targetDeviceId without resolution constraint
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: targetDeviceId } },
          audio: false,
        });
      }
    } else {
      // Tier 1: Rear environment camera with 1080p
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        // Tier 2: Rear environment camera basic
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
        } catch {
          // Tier 3: Universal fallback (default webcam / laptop camera)
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }
    }

    if (!stream) {
      throw new Error('Could not initialize video stream.');
    }

    this.currentStream = stream;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error('Video stream contains no active video tracks.');
    }

    const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
    if (settings.deviceId) {
      this.currentDeviceId = settings.deviceId;
    }

    return {
      stream,
      videoTrack,
      deviceId: settings.deviceId,
      label: videoTrack.label,
      width: settings.width,
      height: settings.height,
    };
  }

  /**
   * Safely stops all active tracks on the camera stream
   */
  public stopStream(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
      this.currentStream = null;
    }
  }

  public getActiveStream(): MediaStream | null {
    return this.currentStream;
  }

  public getSelectedDeviceId(): string {
    return this.currentDeviceId;
  }

  public setSelectedDeviceId(id: string): void {
    this.currentDeviceId = id;
  }
}

export const globalCameraManager = new CameraManager();
