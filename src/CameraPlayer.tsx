import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera as CameraIcon,
  CircleDot,
  Square,
  Radio,
  Loader2,
  AlertCircle,
  MapPin,
  RotateCcw,
  Cctv,
  X,
} from 'lucide-react';
import { VideoRTC } from './vendor/video-rtc.js';
import type {
  Camera,
  PlayerPhase,
  VideoRTCElement,
  HTMLVideoElementWithCaptureStream,
} from './types';

function ensureVideoRTCElement(): void {
  if (typeof window !== 'undefined' && !customElements.get('video-rtc')) {
    customElements.define('video-rtc', class extends VideoRTC {});
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface CameraPlayerProps {
  camera: Camera;
  streamUrl: string | null;
  isLoadingUrl?: boolean;
  streamError?: string;
  onRefreshUrl: (slug: string) => Promise<unknown>;
  onClose: () => void;
  onRetry?: () => void;
}

export const CameraPlayer: React.FC<CameraPlayerProps> = ({
  camera,
  streamUrl,
  isLoadingUrl = false,
  streamError = '',
  onRefreshUrl,
  onClose,
  onRetry,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<VideoRTCElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<PlayerPhase>('loading');
  const [error, setError] = useState<string>('');
  const [mode, setMode] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isReloading, setIsReloading] = useState<boolean>(false);

  const stopRecording = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') {
      recRef.current.stop();
    }
    recRef.current = null;
    setIsRecording(false);
    if (recTimerRef.current !== null) {
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
  }, []);

  // Mount player + sambungkan ke stream WebSocket go2rtc
  useEffect(() => {
    if (streamError) {
      setPhase('error');
      setError(streamError);
      return;
    }

    if (isLoadingUrl || !streamUrl) {
      setPhase('connecting');
      setError('');
      return;
    }

    let cancelled = false;
    let pollInterval: number | null = null;

    ensureVideoRTCElement();
    if (cancelled || !containerRef.current) return;

    const el = document.createElement('video-rtc') as unknown as VideoRTCElement;
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(el);

    el.mode = 'mse';
    el.media = 'video,audio';
    el.src = streamUrl;

    playerRef.current = el;
    setPhase('connecting');
    setError('');

    // Monitor WebSocket status
    pollInterval = window.setInterval(() => {
      if (!el.wsState) return;
      if (el.wsState === WebSocket.OPEN) {
        setPhase((prev) => (prev === 'connecting' ? 'live' : prev));
        if (el.pcState === WebSocket.OPEN) {
          setMode('RTC');
        }
      } else if (el.wsState === WebSocket.CLOSED) {
        setPhase('error');
        setError('Koneksi WebSocket ke server stream terputus.');
      }
    }, 300);

    return () => {
      cancelled = true;
      if (pollInterval !== null) window.clearInterval(pollInterval);
      stopRecording();

      const activePlayer = playerRef.current;
      if (activePlayer) {
        try {
          activePlayer.ondisconnect();
        } catch {
          // Cleanup internal
        }
        activePlayer.remove();
      }
      playerRef.current = null;
      if (containerRef.current) {
        containerRef.current.replaceChildren();
      }
    };
  }, [streamUrl, isLoadingUrl, streamError, stopRecording]);

  // Auto-refresh signed URL sebelum kedaluwarsa (~5 menit)
  useEffect(() => {
    if (!camera?.expiresAt) return;
    const remainingMs = camera.expiresAt.getTime() - Date.now();
    const delay = Math.max(5000, remainingMs - 30000);

    const timer = window.setTimeout(() => {
      onRefreshUrl(camera.slug).catch(() => {});
    }, delay);

    return () => window.clearTimeout(timer);
  }, [camera, onRefreshUrl]);

  // Snapshot PNG
  const takeSnapshot = useCallback(() => {
    const video = playerRef.current?.video;
    if (!video || video.readyState < 2) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `sipedas-snapshot-${camera.slug}-${Date.now()}.png`);
      }
    }, 'image/png');
  }, [camera.slug]);

  // Rekam WebM
  const startRecording = useCallback(() => {
    const video = playerRef.current?.video as HTMLVideoElementWithCaptureStream | undefined;
    if (!video || video.readyState < 2) return;

    const stream = video.captureStream?.(30);
    if (!stream) {
      setError('Browser tidak mendukung perekaman langsung dari stream video.');
      return;
    }

    const preferredMimes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const supportedMime = preferredMimes.find((m) =>
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
    );

    try {
      const recorder = new MediaRecorder(
        stream,
        supportedMime ? { mimeType: supportedMime, videoBitsPerSecond: 2_500_000 } : undefined
      );

      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
        downloadBlob(blob, `sipedas-rekaman-${camera.slug}-${Date.now()}.webm`);
      };

      recorder.start(1000);
      recRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setError(`Gagal memulai perekaman: ${(err as Error).message}`);
    }
  }, [camera.slug]);

  const handleManualReload = useCallback(async () => {
    setIsReloading(true);
    try {
      await onRefreshUrl(camera.slug);
    } finally {
      setIsReloading(false);
    }
  }, [camera.slug, onRefreshUrl]);

  return (
    <div className="player">
      {/* Header Player Rapi: Judul Kiri, Semua Tombol Sejajar di Kanan */}
      <div className="player-head">
        <div className="player-title-block">
          <div className="player-channel-pill">
            <Cctv size={14} />
            <span>{camera.channel ? `CH ${camera.channel}` : 'CCTV'}</span>
          </div>
          <div className="player-title-info">
            <h3 className="player-title">{camera.name}</h3>
            <div className="player-location">
              <MapPin size={12} className="loc-icon" />
              <span>{camera.location}</span>
            </div>
          </div>
        </div>

        {/* Action Controls & Tombol Close Sejajar */}
        <div className="player-actions">
          <div className={`status-indicator-pill ${phase}`}>
            {phase === 'live' && <Radio size={13} className="live-pulse" />}
            {phase === 'connecting' && <Loader2 size={13} className="animate-spin" />}
            {phase === 'error' && <AlertCircle size={13} />}
            <span>
              {phase === 'live' ? 'LIVE' : phase === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
              {mode ? ` · ${mode}` : ''}
            </span>
          </div>

          <div className="btn-group">
            <button
              type="button"
              className="player-btn"
              onClick={takeSnapshot}
              disabled={phase !== 'live'}
              title="Ambil Foto Snapshot (PNG)"
            >
              <CameraIcon size={14} />
              <span className="btn-label">Snapshot</span>
            </button>

            {isRecording ? (
              <button
                type="button"
                className="player-btn btn-danger"
                onClick={stopRecording}
                title="Hentikan Perekaman"
              >
                <Square size={13} />
                <span>Stop ({formatDuration(recordingSeconds)})</span>
              </button>
            ) : (
              <button
                type="button"
                className="player-btn"
                onClick={startRecording}
                disabled={phase !== 'live'}
                title="Mulai Rekam Video (WebM)"
              >
                <CircleDot size={14} className="text-rose" />
                <span className="btn-label">Rekam</span>
              </button>
            )}

            <button
              type="button"
              className="player-btn btn-icon-only"
              onClick={() => void handleManualReload()}
              title="Segarkan Koneksi Stream"
            >
              <RotateCcw size={14} className={isReloading ? 'is-spinning' : ''} />
            </button>

            {/* Tombol X Tutup Sejajar Rapi di Ujung Kanan */}
            <button
              type="button"
              className="player-btn btn-icon-only btn-close-x"
              onClick={onClose}
              title="Tutup Pemutar (Esc)"
              aria-label="Tutup pemutar"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Video Stream Frame 16:9 yang Presisi Sejak Awal */}
      <div className="player-body" ref={containerRef} />

      {error && (
        <div className="player-error">
          <AlertCircle size={15} />
          <span>{error}</span>
          {onRetry && (
            <button
              type="button"
              className="player-btn btn-retry-in-frame"
              onClick={onRetry}
              style={{ marginLeft: 'auto' }}
            >
              <RotateCcw size={13} />
              <span>Coba Hubungkan Ulang</span>
            </button>
          )}
        </div>
      )}

    </div>
  );
};

export default CameraPlayer;
