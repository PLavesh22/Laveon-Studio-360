import React, { useState, useEffect } from 'react';
import { Play, AlertCircle, RefreshCw } from 'lucide-react';
import { Header } from './components/Header';
import { PhotoStudio } from './components/PhotoStudio';
import { VideoUpload } from './components/VideoUpload';
import { ProcessingSettings } from './components/ProcessingSettings';
import { ProgressTracker } from './components/ProgressTracker';
import { PanoramaViewer } from './components/PanoramaViewer';
import { CameraGuideModal } from './components/CameraGuideModal';
import { RecordingGuideModal } from './components/RecordingGuideModal';
import { FFmpegGuideModal } from './components/FFmpegGuideModal';
import type {
  HealthData,
  ProcessingSettings as SettingsType,
  StitchResult,
  PhotoCheckResult
} from './types';
import {
  fetchHealth,
  processPhotos,
  checkPhotos,
  loadSamplePhotos,
  processVideo,
  loadSampleVideoFile
} from './services/api';

const DEFAULT_SETTINGS: SettingsType = {
  sample_interval_sec: 1.0,
  max_frames: 30,
  scale_width: 1920,
  similarity_threshold: 0.985,
  min_blur_threshold: 12.0,
  stitching_mode: 'full_sphere',
};

export const App: React.FC = () => {
  // Workflow Tab Switcher: 'photo' is the primary 360 photo workflow
  const [activeTab, setActiveTab] = useState<'photo' | 'video'>('photo');

  // Backend Health state
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // Photo Workflow State
  const [photos, setPhotos] = useState<File[]>([]);
  const [checkResult, setCheckResult] = useState<PhotoCheckResult | null>(null);
  const [isCheckingQuality, setIsCheckingQuality] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);

  // Video Workflow State (Preserved secondary tab)
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);

  // Common Processing & Viewer State
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [result, setResult] = useState<StitchResult | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Modals
  const [guideOpen, setGuideOpen] = useState(false);
  const [ffmpegModalOpen, setFFmpegModalOpen] = useState(false);

  // Fetch backend health on mount
  const loadHealth = async () => {
    try {
      setHealthLoading(true);
      const data = await fetchHealth();
      setHealth(data);
    } catch (err: any) {
      console.error('Health check error:', err);
      setHealth({
        status: 'error',
        app_name: 'Laveon Studio 360',
        version: '1.0.0',
        ffmpeg_available: false,
        opencv_version: 'Unknown',
        message: 'Could not connect to FastAPI backend on http://127.0.0.1:8000. Ensure the backend server is running.',
      });
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    void loadHealth();
  }, []);

  // Pre-check photos for blur and overlap
  const handleRunQualityCheck = async () => {
    if (photos.length === 0) return;
    try {
      setIsCheckingQuality(true);
      setGlobalError(null);
      const res = await checkPhotos(photos, settings.min_blur_threshold);
      setCheckResult(res);
    } catch (err: any) {
      console.error('Photo check error:', err);
      setGlobalError(err.message || 'Quality check failed.');
    } finally {
      setIsCheckingQuality(false);
    }
  };

  // 1-Click Load 360 Demo Photos
  const handleLoadSamplePhotos = async () => {
    try {
      setIsLoadingSample(true);
      setGlobalError(null);
      const sampleFiles = await loadSamplePhotos();
      setPhotos(sampleFiles);
      setSettings((prev) => ({
        ...prev,
        stitching_mode: 'full_sphere',
        scale_width: 1920,
      }));
      setResult(null);

      // Trigger automatic quality check on sample photos
      const checkRes = await checkPhotos(sampleFiles, settings.min_blur_threshold);
      setCheckResult(checkRes);
    } catch (err: any) {
      setGlobalError(err.message || 'Failed to load sample photos.');
    } finally {
      setIsLoadingSample(false);
    }
  };

  // 1-Click Load Sample Rotating Video (for video tab)
  const handleLoadSampleVideo = async () => {
    try {
      setIsLoadingSample(true);
      setGlobalError(null);
      const sampleFile = await loadSampleVideoFile();
      setSelectedVideoFile(sampleFile);
      setSettings((prev) => ({
        ...prev,
        sample_interval_sec: 0.2,
        max_frames: 30,
        scale_width: 1280,
      }));
      setResult(null);
    } catch (err: any) {
      setGlobalError(err.message || 'Failed to load sample video.');
    } finally {
      setIsLoadingSample(false);
    }
  };

  // Main Stitching Handler
  const handleStartStitching = async () => {
    setGlobalError(null);
    setIsProcessing(true);
    setCurrentStepIndex(0);
    setResult(null);

    // Simulated progress stepper
    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev < 4 ? prev + 1 : prev));
    }, 1800);

    try {
      if (activeTab === 'photo') {
        if (photos.length < 2) {
          throw new Error('Please select or capture at least 2 photos to stitch.');
        }
        const data = await processPhotos(photos, settings);
        clearInterval(stepInterval);
        setCurrentStepIndex(4);
        setResult(data);
      } else {
        if (!selectedVideoFile) {
          throw new Error('Please select a rotational video to stitch.');
        }
        const data = await processVideo(selectedVideoFile, settings);
        clearInterval(stepInterval);
        setCurrentStepIndex(4);
        setResult(data);
      }
    } catch (err: any) {
      clearInterval(stepInterval);
      console.error('Stitching error:', err);
      setGlobalError(err.message || 'Panorama stitching failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = () => {
    setResult(null);
    setGlobalError(null);
    void handleStartStitching();
  };

  const canStitch = activeTab === 'photo' ? photos.length >= 2 : selectedVideoFile !== null;

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setResult(null);
          setGlobalError(null);
        }}
        health={health}
        healthLoading={healthLoading}
        onRefreshHealth={loadHealth}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenLiveCamera={() => setCameraModalOpen(true)}
        isProcessing={isProcessing}
      />

      {/* Global Notice / Error Banner */}
      {globalError && (
        <div className="coverage-notice-card alert">
          <AlertCircle size={20} color="#f43f5e" style={{ flexShrink: 0 }} />
          <div>
            <div className="notice-title" style={{ color: '#f43f5e' }}>Notice</div>
            <div className="notice-body">{globalError}</div>
          </div>
        </div>
      )}

      {/* Studio Workspace Grid */}
      <div className="studio-grid">
        {/* Left Column: Media Inputs & Parameters */}
        <div className="controls-column">
          {/* Workflow 1: Photo Studio (Primary) */}
          {activeTab === 'photo' && (
            <PhotoStudio
              photos={photos}
              onPhotosChange={(newPhotos) => {
                setPhotos(newPhotos);
                setResult(null);
                setGlobalError(null);
                setCheckResult(null);
              }}
              onOpenLiveCamera={() => setCameraModalOpen(true)}
              onLoadSamplePhotos={handleLoadSamplePhotos}
              isLoadingSample={isLoadingSample}
              isProcessing={isProcessing}
              checkResult={checkResult}
              onRunQualityCheck={handleRunQualityCheck}
              isCheckingQuality={isCheckingQuality}
            />
          )}

          {/* Workflow 2: Video Sweep (Preserved secondary tab) */}
          {activeTab === 'video' && (
            <VideoUpload
              selectedFile={selectedVideoFile}
              onFileSelect={(file) => {
                setSelectedVideoFile(file);
                setResult(null);
                setGlobalError(null);
              }}
              onClearFile={() => {
                setSelectedVideoFile(null);
                setResult(null);
              }}
              isProcessing={isProcessing}
              onLoadDemoVideo={handleLoadSampleVideo}
              isLoadingDemo={isLoadingSample}
            />
          )}

          {/* Parameters Panel */}
          <ProcessingSettings
            settings={settings}
            onChange={setSettings}
            disabled={isProcessing}
            mode={activeTab}
          />

          {/* Main Action Trigger */}
          <div className="glass-panel" style={{ padding: '20px 24px' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: '1.02rem' }}
              onClick={handleStartStitching}
              disabled={!canStitch || isProcessing}
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Stitching in Progress...</span>
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" />
                  <span>
                    {activeTab === 'photo'
                      ? `Stitch ${photos.length} Photos into 360° Panorama`
                      : 'Start Video Panorama Stitching'}
                  </span>
                </>
              )}
            </button>

            {!canStitch && (
              <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#64748b', marginTop: '10px' }}>
                {activeTab === 'photo'
                  ? 'Please add or capture at least 2 photos to begin.'
                  : 'Please select a rotational video to begin.'}
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Progress & Interactive Panorama Viewer */}
        <div className="canvas-column">
          <ProgressTracker
            isProcessing={isProcessing}
            currentStepIndex={currentStepIndex}
            mode={activeTab}
          />

          <PanoramaViewer
            result={result}
            onRetry={handleRetry}
            isProcessing={isProcessing}
          />
        </div>
      </div>

      {/* Guided In-Browser Camera Capture Modal */}
      <CameraGuideModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onAddCapturedPhotos={(captured) => {
          setPhotos((prev) => [...prev, ...captured]);
          setResult(null);
          setCheckResult(null);
        }}
      />

      {/* Capture Guide Modal */}
      <RecordingGuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
      />

      {/* FFmpeg Setup Modal (for video mode if opened) */}
      <FFmpegGuideModal
        isOpen={ffmpegModalOpen}
        onClose={() => setFFmpegModalOpen(false)}
        health={health}
      />
    </div>
  );
};

export default App;
