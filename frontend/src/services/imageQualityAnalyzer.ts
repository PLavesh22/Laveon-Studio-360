/** Lightweight browser-side blur and exposure checks for captured frames. */
export interface QualityReport {
  blurScore: number;
  isBlurry: boolean;
  exposureScore: number;
  exposureStatus: 'good' | 'underexposed' | 'overexposed';
  overlapScore: null;
  overlapStatus: 'unverified' | 'first_frame';
  warnings: string[];
}

export class ImageQualityAnalyzer {
  private hasAnalyzedFrame = false;
  private readonly minBlurThreshold = 14;
  private readonly minLuminance = 32;
  private readonly maxLuminance = 232;

  public reset(): void {
    this.hasAnalyzedFrame = false;
  }

  public analyzeFrame(canvas: HTMLCanvasElement, overlapFraction = 0.33): QualityReport {
    const warnings: string[] = [];
    const ctx = canvas.getContext('2d');
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 160;
    tempCanvas.height = 120;
    const tempCtx = tempCanvas.getContext('2d');
    if (!ctx || !tempCtx) {
      return {
        blurScore: 0, isBlurry: false, exposureScore: 0, exposureStatus: 'good',
        overlapScore: null, overlapStatus: this.hasAnalyzedFrame ? 'unverified' : 'first_frame',
        warnings: ['Image quality could not be analyzed in this browser.'],
      };
    }

    tempCtx.drawImage(canvas, 0, 0, 160, 120);
    const pixels = tempCtx.getImageData(0, 0, 160, 120).data;
    const gray = new Float32Array(160 * 120);
    let totalLuma = 0;
    for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
      const luma = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      gray[j] = luma;
      totalLuma += luma;
    }

    const exposureScore = Math.round(totalLuma / gray.length);
    const exposureStatus = exposureScore < this.minLuminance
      ? 'underexposed' : exposureScore > this.maxLuminance ? 'overexposed' : 'good';
    if (exposureStatus === 'underexposed') warnings.push('Image looks too dark. Point towards better lighting.');
    if (exposureStatus === 'overexposed') warnings.push('Image looks too bright. Avoid direct glare.');

    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    for (let y = 1; y < 119; y++) {
      for (let x = 1; x < 159; x++) {
        const i = y * 160 + x;
        const laplacian = -4 * gray[i] + gray[i - 160] + gray[i + 160] + gray[i - 1] + gray[i + 1];
        sum += laplacian;
        sumSquares += laplacian * laplacian;
        count++;
      }
    }
    const mean = sum / count;
    const blurScore = Math.round(sumSquares / count - mean * mean);
    const isBlurry = blurScore < this.minBlurThreshold;
    if (isBlurry) warnings.push('Image may be blurry. Hold the camera steady and retake if needed.');

    const overlapStatus = this.hasAnalyzedFrame ? 'unverified' : 'first_frame';
    if (overlapStatus === 'unverified') {
      warnings.push(`Visual overlap was not verified. Keep adjacent views about ${Math.round(overlapFraction * 100)}% overlapping.`);
    }
    this.hasAnalyzedFrame = true;
    return { blurScore, isBlurry, exposureScore, exposureStatus, overlapScore: null, overlapStatus, warnings };
  }
}

export const imageQualityAnalyzer = new ImageQualityAnalyzer();
