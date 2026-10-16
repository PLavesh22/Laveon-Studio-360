/**
 * ImageQualityAnalyzer
 * Analyzes live camera frames for motion blur, lighting/exposure, and real visual overlap
 * with the previous captured frame for seamless 360° panorama stitching.
 */

export interface QualityReport {
  blurScore: number;
  isBlurry: boolean;
  exposureScore: number; // 0 to 255
  exposureStatus: 'good' | 'underexposed' | 'overexposed';
  overlapScore: number | null; // 0 to 100%, null for first photo
  overlapStatus: 'good' | 'acceptable' | 'insufficient' | 'first_frame';
  warnings: string[];
}

export class ImageQualityAnalyzer {
  private prevFrameThumbnail: ImageData | null = null;
  private readonly minBlurThreshold = 14;
  private readonly minLuminance = 32;
  private readonly maxLuminance = 232;

  /**
   * Resets stored frame history (e.g., when restarting capture)
   */
  public reset(): void {
    this.prevFrameThumbnail = null;
  }

  /**
   * Evaluates quality of a newly captured video frame
   */
  public analyzeFrame(
    canvas: HTMLCanvasElement,
    overlapFraction: number = 0.33
  ): QualityReport {
    const warnings: string[] = [];
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        blurScore: 30,
        isBlurry: false,
        exposureScore: 128,
        exposureStatus: 'good',
        overlapScore: null,
        overlapStatus: 'first_frame',
        warnings: [],
      };
    }

    // 1. Analyze Blur & Exposure using a fast downscaled analysis canvas (160x120)
    const analysisW = 160;
    const analysisH = 120;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = analysisW;
    tempCanvas.height = analysisH;
    const tempCtx = tempCanvas.getContext('2d');

    if (!tempCtx) {
      return {
        blurScore: 30,
        isBlurry: false,
        exposureScore: 128,
        exposureStatus: 'good',
        overlapScore: null,
        overlapStatus: 'first_frame',
        warnings: [],
      };
    }

    tempCtx.drawImage(canvas, 0, 0, analysisW, analysisH);
    const imgData = tempCtx.getImageData(0, 0, analysisW, analysisH);
    const data = imgData.data;

    // Convert to grayscale and compute mean luminance
    const gray = new Float32Array(analysisW * analysisH);
    let totalLuma = 0;

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[j] = luma;
      totalLuma += luma;
    }

    const meanLuma = Math.round(totalLuma / gray.length);
    let exposureStatus: 'good' | 'underexposed' | 'overexposed' = 'good';

    if (meanLuma < this.minLuminance) {
      exposureStatus = 'underexposed';
      warnings.push(`Image is too dark (light level: ${meanLuma}/255). Point towards better lighting.`);
    } else if (meanLuma > this.maxLuminance) {
      exposureStatus = 'overexposed';
      warnings.push(`Image is overexposed (light level: ${meanLuma}/255). Avoid direct harsh glare.`);
    }

    // 2. Compute Laplacian variance for motion blur estimation
    let laplacianSum = 0;
    let laplacianCount = 0;
    const laplacianVals = new Float32Array((analysisW - 2) * (analysisH - 2));

    let idx = 0;
    for (let y = 1; y < analysisH - 1; y++) {
      const yOffset = y * analysisW;
      for (let x = 1; x < analysisW - 1; x++) {
        const val =
          -4 * gray[yOffset + x] +
          gray[yOffset - analysisW + x] +
          gray[yOffset + analysisW + x] +
          gray[yOffset + (x - 1)] +
          gray[yOffset + (x + 1)];
        laplacianVals[idx++] = val;
        laplacianSum += val;
        laplacianCount++;
      }
    }

    const meanLaplacian = laplacianSum / laplacianCount;
    let varianceSum = 0;
    for (let i = 0; i < laplacianCount; i++) {
      varianceSum += Math.pow(laplacianVals[i] - meanLaplacian, 2);
    }
    const blurScore = Math.round(varianceSum / laplacianCount);
    const isBlurry = blurScore < this.minBlurThreshold;

    if (isBlurry) {
      warnings.push(`Motion blur detected (score: ${blurScore}). Hold the camera steady when capturing.`);
    }

    // 3. Mathematical Overlap Verification with Previous Frame
    let overlapScore: number | null = null;
    let overlapStatus: 'good' | 'acceptable' | 'insufficient' | 'first_frame' = 'first_frame';

    if (this.prevFrameThumbnail) {
      overlapScore = this.computeOverlapScore(this.prevFrameThumbnail, imgData, overlapFraction);

      if (overlapScore >= 45) {
        overlapStatus = 'good';
      } else if (overlapScore >= 25) {
        overlapStatus = 'acceptable';
      } else {
        overlapStatus = 'insufficient';
        warnings.push(
          `Low visual overlap (${overlapScore}%) with previous photo. Rotate more gradually to prevent stitching seams.`
        );
      }
    }

    // Store current frame thumbnail for subsequent frame comparison
    this.prevFrameThumbnail = imgData;

    return {
      blurScore,
      isBlurry,
      exposureScore: meanLuma,
      exposureStatus,
      overlapScore,
      overlapStatus,
      warnings,
    };
  }

  /**
   * Computes normalized visual correlation between the overlapping stripe of
   * previous frame (right side in clockwise rotation) and current frame (left side).
   */
  private computeOverlapScore(
    prev: ImageData,
    curr: ImageData,
    overlapFraction: number
  ): number {
    const w = prev.width;
    const h = prev.height;
    const stripeWidth = Math.max(10, Math.round(w * overlapFraction));

    // Previous frame right stripe: x from (w - stripeWidth) to w
    // Current frame left stripe: x from 0 to stripeWidth
    const prevStartX = w - stripeWidth;
    let sumDiff = 0;
    let samplePoints = 0;

    for (let y = 0; y < h; y += 2) {
      for (let s = 0; s < stripeWidth; s += 2) {
        const prevIdx = (y * w + (prevStartX + s)) * 4;
        const currIdx = (y * w + s) * 4;

        // Luminance difference
        const prevLuma =
          0.299 * prev.data[prevIdx] + 0.587 * prev.data[prevIdx + 1] + 0.114 * prev.data[prevIdx + 2];
        const currLuma =
          0.299 * curr.data[currIdx] + 0.587 * curr.data[currIdx + 1] + 0.114 * curr.data[currIdx + 2];

        sumDiff += Math.abs(prevLuma - currLuma);
        samplePoints++;
      }
    }

    if (samplePoints === 0) return 50;

    const avgLumaDiff = sumDiff / samplePoints; // 0 (identical) to 255 (completely different)
    // Convert to percentage similarity score [0, 100]
    const similarityScore = Math.max(0, Math.min(100, Math.round((1 - avgLumaDiff / 100) * 100)));
    return similarityScore;
  }
}

export const imageQualityAnalyzer = new ImageQualityAnalyzer();
