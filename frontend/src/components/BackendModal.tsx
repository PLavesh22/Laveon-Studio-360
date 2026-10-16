import React, { useState } from 'react';
import {
  Server,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Terminal,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { getApiBase, setCustomApiBase, fetchHealth } from '../services/api';
import type { HealthData } from '../types';

interface BackendModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: HealthData | null;
  onHealthUpdate: (health: HealthData) => void;
}

export const BackendModal: React.FC<BackendModalProps> = ({
  isOpen,
  onClose,
  health,
  onHealthUpdate,
}) => {
  const [urlInput, setUrlInput] = useState<string>(() => getApiBase());
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isOnline = health && health.status === 'ok';
  const isCloudHost =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  const handleTestAndSave = async (targetUrl?: string) => {
    const urlToTest = (targetUrl !== undefined ? targetUrl : urlInput).trim();
    setIsTesting(true);
    setTestResult(null);

    try {
      setCustomApiBase(urlToTest);
      const data = await fetchHealth();
      onHealthUpdate(data);
      setTestResult({
        success: true,
        message: `Connected successfully to ${data.app_name} (OpenCV ${data.opencv_version})!`,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message:
          err.message ||
          'Failed to reach backend at this address. Ensure the server is running and CORS is enabled.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleReset = () => {
    setUrlInput('');
    setCustomApiBase(null);
    void handleTestAndSave('');
  };

  const copyCommand = () => {
    navigator.clipboard.writeText('cd backend; .\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '640px', width: '92vw' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="icon-badge">
              <Server size={20} color="#00d4ff" />
            </div>
            <div>
              <h2 className="modal-title">Backend Connection Status</h2>
              <p className="modal-subtitle">FastAPI, OpenCV & FFmpeg Processing Engine</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Current Connection Status Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            borderRadius: '10px',
            background: isOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
            border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'}`,
            margin: '14px 0',
          }}
        >
          {isOnline ? (
            <CheckCircle2 size={24} color="#10b981" style={{ flexShrink: 0 }} />
          ) : (
            <AlertCircle size={24} color="#f43f5e" style={{ flexShrink: 0 }} />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: isOnline ? '#34d399' : '#fda4af' }}>
              {isOnline ? 'Backend Online & Ready' : 'Backend Server Offline'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '2px' }}>
              {isOnline
                ? `${health?.message || 'Ready for photo and video panoramic stitching.'}`
                : isCloudHost
                ? 'You are viewing Laveon Studio on a cloud host (Netlify/Vercel). The Python backend must be running to process panoramas.'
                : 'Could not connect to FastAPI server. Ensure your backend process is running on port 8000.'}
            </div>
          </div>
        </div>

        {/* Cloud Host Explanation if on Netlify/Vercel */}
        {isCloudHost && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'rgba(0, 212, 255, 0.08)',
              border: '1px solid rgba(0, 212, 255, 0.25)',
              fontSize: '0.82rem',
              color: '#93c5fd',
              marginBottom: '16px',
              lineHeight: 1.5,
            }}
          >
            <strong>Why does it show offline on Netlify/Vercel?</strong>
            <p style={{ margin: '4px 0 0' }}>
              Netlify and Vercel host the frontend user interface. Panoramic stitching requires Python, OpenCV, and
              FFmpeg, which run on a backend server. If you want full stitching on your computer, open{' '}
              <a
                href="http://localhost:5173"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#38bdf8', textDecoration: 'underline', fontWeight: 600 }}
              >
                http://localhost:5173 <ExternalLink size={12} style={{ display: 'inline' }} />
              </a>{' '}
              where the local backend is connected automatically!
            </p>
          </div>
        )}

        {/* Backend Endpoint URL Configurator */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
            Backend API URL
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="input-field"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="e.g. http://localhost:8000 or https://your-backend.railway.app"
              style={{ flex: 1, padding: '10px 12px', fontSize: '0.85rem' }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleTestAndSave()}
              disabled={isTesting}
              style={{ padding: '10px 16px', flexShrink: 0 }}
            >
              {isTesting ? <RefreshCw size={16} className="animate-spin" /> : <span>Test & Save</span>}
            </button>
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', color: '#94a3b8', alignSelf: 'center' }}>Presets:</span>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={() => {
                setUrlInput('http://localhost:8000');
                void handleTestAndSave('http://localhost:8000');
              }}
            >
              http://localhost:8000
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={() => {
                setUrlInput('http://127.0.0.1:8000');
                void handleTestAndSave('http://127.0.0.1:8000');
              }}
            >
              http://127.0.0.1:8000
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={handleReset}
            >
              Reset to Default Proxy
            </button>
          </div>

          {testResult && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                background: testResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                color: testResult.success ? '#34d399' : '#fda4af',
                border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
              }}
            >
              {testResult.message}
            </div>
          )}
        </div>

        {/* How to Start Backend Locally */}
        <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, color: '#f1f5f9' }}>
              <Terminal size={14} color="#00d4ff" />
              <span>How to Run Backend Locally</span>
            </div>
            <button
              type="button"
              onClick={copyCommand}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.72rem', padding: '3px 8px', gap: '4px' }}
              title="Copy terminal command"
            >
              {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <code
            style={{
              display: 'block',
              background: '#040711',
              padding: '8px 10px',
              borderRadius: '6px',
              fontSize: '0.76rem',
              color: '#38bdf8',
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            cd backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
          </code>
        </div>

        <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
