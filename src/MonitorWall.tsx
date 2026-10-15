import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Monitor, X } from 'lucide-react';
import { fetchStreamUrl } from './api';
import CameraPlayer from './CameraPlayer';
import type { Camera } from './types';

const FEEDS_PER_PAGE = 4;

interface MonitorFeedProps {
  camera: Camera;
}

interface FeedState {
  streamUrl: string | null;
  expiresAt: Date | null;
  isLoading: boolean;
  error: string;
}

const MonitorFeed: React.FC<MonitorFeedProps> = ({ camera }) => {
  const [feed, setFeed] = useState<FeedState>({
    streamUrl: null,
    expiresAt: null,
    isLoading: camera.status === 'online',
    error: camera.status === 'online' ? '' : 'Kamera sedang offline.',
  });

  useEffect(() => {
    if (camera.status !== 'online') {
      setFeed({
        streamUrl: null,
        expiresAt: null,
        isLoading: false,
        error: 'Kamera sedang offline.',
      });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setFeed({ streamUrl: null, expiresAt: null, isLoading: true, error: '' });

    fetchStreamUrl(camera.slug, controller.signal)
      .then(({ wss, expiresAt }) => {
        if (active) {
          setFeed({ streamUrl: wss, expiresAt, isLoading: false, error: '' });
        }
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setFeed({
            streamUrl: null,
            expiresAt: null,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Gagal memuat stream kamera.',
          });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [camera.slug, camera.status]);

  const refreshStream = useCallback(async (slug: string): Promise<unknown> => {
    try {
      const result = await fetchStreamUrl(slug);
      setFeed({
        streamUrl: result.wss,
        expiresAt: result.expiresAt,
        isLoading: false,
        error: '',
      });
      return result;
    } catch (error) {
      setFeed((previous) => ({
        ...previous,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Gagal memuat stream kamera.',
      }));
      return null;
    }
  }, []);

  const playerCamera = useMemo(
    () => ({ ...camera, expiresAt: feed.expiresAt }),
    [camera, feed.expiresAt]
  );

  return (
    <article className="monitor-tile">
      <header className="monitor-tile-head">
        <span className="monitor-camera-name" title={camera.name}>{camera.name}</span>
        <span className={`monitor-camera-status ${camera.status !== 'online' ? 'offline' : feed.error ? 'error' : 'online'}`}>
          {feed.isLoading ? <Loader2 size={12} className="animate-spin" /> : null}
          {feed.isLoading ? 'MEMUAT' : camera.status !== 'online' ? 'OFFLINE' : feed.error ? 'ERROR' : 'ONLINE'}
        </span>
      </header>
      <div className="monitor-player">
        {camera.status === 'online' ? (
          <CameraPlayer
            camera={playerCamera}
            streamUrl={feed.streamUrl}
            isLoadingUrl={feed.isLoading}
            streamError={feed.error}
            showHeader={false}
            onRefreshUrl={refreshStream}
            onClose={() => {}}
            onRetry={() => void refreshStream(camera.slug)}
          />
        ) : (
          <div className="monitor-feed-placeholder">Kamera tidak tersedia</div>
        )}
      </div>
    </article>
  );
};

export interface MonitorWallProps {
  cameras: Camera[];
  onExit: () => void;
}

const MonitorWall: React.FC<MonitorWallProps> = ({ cameras, onExit }) => {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(cameras.length / FEEDS_PER_PAGE));
  const pageCameras = useMemo(
    () => cameras.slice(page * FEEDS_PER_PAGE, (page + 1) * FEEDS_PER_PAGE),
    [cameras, page]
  );
  const feedSlots = Array.from({ length: FEEDS_PER_PAGE }, (_, index) => pageCameras[index] ?? null);

  const closeMonitor = useCallback(() => {
    onExit();
    try {
      screen.orientation?.unlock();
    } catch {
      // Orientation lock is not available in every browser.
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [onExit]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMonitor();
    };
    const handleFullscreenChange = (): void => {
      if (!document.fullscreenElement) {
        try {
          screen.orientation?.unlock();
        } catch {
          // Orientation lock is not available in every browser.
        }
        onExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [closeMonitor, onExit]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pageCount - 1));
  }, [pageCount]);

  const firstCamera = cameras.length ? page * FEEDS_PER_PAGE + 1 : 0;
  const lastCamera = Math.min((page + 1) * FEEDS_PER_PAGE, cameras.length);

  return (
    <section className="monitor-wall" role="dialog" aria-modal="true" aria-label="Monitor CCTV">
      <header className="monitor-toolbar">
        <div className="monitor-toolbar-title">
          <Monitor size={18} />
          <span>Monitor CCTV</span>
          <span className="monitor-range">{firstCamera}-{lastCamera} / {cameras.length}</span>
        </div>
        <nav className="monitor-pagination" aria-label="Halaman kamera" aria-live="polite">
          <button
            type="button"
            className="monitor-control-btn"
            onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
            disabled={page === 0}
            title="Empat CCTV sebelumnya"
            aria-label="Empat CCTV sebelumnya"
          >
            <ChevronLeft size={20} />
          </button>
          <span>{page + 1} / {pageCount}</span>
          <button
            type="button"
            className="monitor-control-btn"
            onClick={() => setPage((currentPage) => Math.min(pageCount - 1, currentPage + 1))}
            disabled={page >= pageCount - 1}
            title="Empat CCTV berikutnya"
            aria-label="Empat CCTV berikutnya"
          >
            <ChevronRight size={20} />
          </button>
        </nav>
        <button
          type="button"
          className="monitor-control-btn monitor-exit-btn"
          onClick={closeMonitor}
          title="Keluar dari monitor"
          aria-label="Keluar dari monitor"
        >
          <X size={20} />
        </button>
      </header>

      {cameras.length ? (
        <div className="monitor-grid">
          {feedSlots.map((camera, index) => camera ? (
            <MonitorFeed key={camera.slug} camera={camera} />
          ) : (
            <div className="monitor-tile monitor-empty-tile" key={`empty-${page}-${index}`} />
          ))}
        </div>
      ) : (
        <div className="monitor-empty-state">Belum ada data CCTV.</div>
      )}
    </section>
  );
};

export default MonitorWall;