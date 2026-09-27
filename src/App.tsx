import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cctv,
  Video,
  VideoOff,
  Wifi,
  Search,
  X,
  MapPin,
  Loader2,
  RotateCcw,
  Layers,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Sun,
  Moon,
  WifiOff,
  CloudOff,
} from 'lucide-react';
import MapView from './MapView';
import CameraPlayer from './CameraPlayer';
import {
  fetchCameras,
  fetchWifiPoints,
  fetchStreamUrl,
  getCachedCameras,
  getCachedWifi,
  getLastSyncTime,
  saveOfflineData,
  formatApiErrorMessage,
} from './api';
import type { Camera, StreamInfo, WifiPoint } from './types';

type TabFilter = 'all' | 'cctv' | 'wifi';
type StatusFilter = 'all' | 'active' | 'inactive';
type ThemeMode = 'dark' | 'light';

function isWifiActive(status?: string): boolean {
  if (!status) return true;
  return !['offline', 'inactive', 'nonaktif', 'disconnected', 'down', 'false', '0'].includes(
    status.trim().toLowerCase()
  );
}

function formatSyncTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sipedas_theme') as ThemeMode;
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'dark';
  });

  // Inisialisasi awal dengan data cache offline agar UI langsung tampil cepat (0ms)
  const [cameras, setCameras] = useState<Camera[]>(() => getCachedCameras());
  const [wifiPoints, setWifiPoints] = useState<WifiPoint[]>(() => getCachedWifi());
  const [isUsingCache, setIsUsingCache] = useState<boolean>(() => getCachedCameras().length > 0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => getLastSyncTime());
  const [isOffline, setIsOffline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));

  const [loading, setLoading] = useState<boolean>(() => getCachedCameras().length === 0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [cameraStatusFilter, setCameraStatusFilter] = useState<StatusFilter>('all');
  const [wifiStatusFilter, setWifiStatusFilter] = useState<StatusFilter>('all');
  const [isLegalOpen, setIsLegalOpen] = useState<boolean>(false);

  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [selectedCameraSlug, setSelectedCameraSlug] = useState<string | null>(null);
  const [selectedWifiId, setSelectedWifiId] = useState<number | null>(null);
  const [wifiFocusKey, setWifiFocusKey] = useState<number>(0);
  const [focusedLocation, setFocusedLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [streamBusy, setStreamBusy] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string>('');

  const refreshKeyRef = useRef<number>(0);

  // Terapkan tema ke document root & simpan ke localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sipedas_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback((): void => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Muat daftar kamera & WiFi dari API dengan ketahanan offline
  const loadData = useCallback(async (isManualRefresh = false): Promise<void> => {
    if (isManualRefresh) setIsRefreshing(true);
    try {
      const [cams, wifi] = await Promise.all([
        fetchCameras(),
        fetchWifiPoints(),
      ]);
      setCameras(cams);
      setWifiPoints(wifi);
      setApiError('');
      setIsUsingCache(false);
      saveOfflineData(cams, wifi);
      setLastSyncTime(new Date().toISOString());
    } catch (err) {
      const friendlyMsg = formatApiErrorMessage(err);
      setApiError(friendlyMsg);

      // Fallback ke cache jika data memori kosong
      const cachedCams = getCachedCameras();
      if (cachedCams.length > 0) {
        setCameras((prev) => (prev.length === 0 ? cachedCams : prev));
        setIsUsingCache(true);
      }
      const cachedWifi = getCachedWifi();
      if (cachedWifi.length > 0) {
        setWifiPoints((prev) => (prev.length === 0 ? cachedWifi : prev));
      }
    } finally {
      setLoading(false);
      if (isManualRefresh) setIsRefreshing(false);
    }
  }, []);

  // Deteksi status koneksi internet perangkat secara real-time
  useEffect(() => {
    const handleOnline = (): void => {
      setIsOffline(false);
      void loadData();
    };
    const handleOffline = (): void => {
      setIsOffline(true);
      setApiError('Perangkat Anda sedang offline. Menampilkan data tersimpan.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadData]);

  // Polling otomatis setiap 30 detik jika tidak sedang offline
  useEffect(() => {
    void loadData();
    const interval = window.setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        void loadData();
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadData]);

  // Buka kamera dan minta signed stream URL
  const openCamera = useCallback(async (cam: Camera): Promise<void> => {
    setSelectedCameraSlug(cam.slug);
    setSelectedCamera(cam);
    setStreamBusy(true);
    setStreamError('');
    setStreamInfo(null);

    const key = ++refreshKeyRef.current;
    try {
      const info = await fetchStreamUrl(cam.slug);
      if (refreshKeyRef.current !== key) return;

      setStreamInfo({
        wss: info.wss,
        mode: info.mode,
        expiresAt: info.expiresAt,
        camera: { ...cam, expiresAt: info.expiresAt },
      });
    } catch (err) {
      if (refreshKeyRef.current === key) {
        setStreamError((err as Error).message);
      }
    } finally {
      if (refreshKeyRef.current === key) {
        setStreamBusy(false);
      }
    }
  }, []);

  // Perbarui token stream URL sebelum kedaluwarsa (~5 mnt)
  const refreshStreamUrl = useCallback(
    async (slug: string): Promise<StreamInfo | null> => {
      const info = await fetchStreamUrl(slug);
      let updatedInfo: StreamInfo | null = null;

      setStreamInfo((prev) => {
        if (!prev) return null;
        updatedInfo = {
          ...prev,
          wss: info.wss,
          mode: info.mode,
          expiresAt: info.expiresAt,
          camera: {
            ...prev.camera,
            expiresAt: info.expiresAt,
          },
        };
        return updatedInfo;
      });

      return updatedInfo;
    },
    []
  );

  const closePlayer = useCallback((): void => {
    refreshKeyRef.current++;
    setSelectedCamera(null);
    setSelectedCameraSlug(null);
    setStreamInfo(null);
    setStreamError('');
  }, []);

  const focusOfflineCamera = useCallback((cam: Camera): void => {
    refreshKeyRef.current++;
    setSelectedCamera(null);
    setSelectedCameraSlug(cam.slug);
    setStreamInfo(null);
    setStreamError('');
    setFocusedLocation({ latitude: cam.latitude, longitude: cam.longitude });
  }, []);

  const handleSidebarCameraClick = useCallback((cam: Camera): void => {
    if (cam.status === 'online') {
      void openCamera(cam);
      return;
    }

    focusOfflineCamera(cam);
  }, [focusOfflineCamera, openCamera]);

  // Tutup player dengan tombol Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && selectedCamera) {
        closePlayer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCamera, closePlayer]);

  // Filter kamera & WiFi berdasarkan tab aktif ('all' | 'cctv' | 'wifi') & pencarian
  const filteredCameras = useMemo(() => {
    if (activeTab === 'wifi') return [];

    const q = searchQuery.trim().toLowerCase();
    return cameras.filter((camera) => {
      const matchesSearch = !q ||
        camera.name.toLowerCase().includes(q) ||
        camera.location.toLowerCase().includes(q) ||
        camera.slug.toLowerCase().includes(q);
      const matchesStatus = cameraStatusFilter === 'all' ||
        (cameraStatusFilter === 'active' ? camera.status === 'online' : camera.status !== 'online');
      return matchesSearch && matchesStatus;
    });
  }, [cameras, activeTab, searchQuery, cameraStatusFilter]);

  const filteredWifi = useMemo(() => {
    if (activeTab === 'cctv') return [];

    const q = searchQuery.trim().toLowerCase();
    return wifiPoints.filter((wifi) => {
      const matchesSearch = !q ||
        wifi.name.toLowerCase().includes(q) ||
        wifi.location.toLowerCase().includes(q);
      const matchesStatus = wifiStatusFilter === 'all' ||
        (wifiStatusFilter === 'active' ? isWifiActive(wifi.status) : !isWifiActive(wifi.status));
      return matchesSearch && matchesStatus;
    });
  }, [wifiPoints, activeTab, searchQuery, wifiStatusFilter]);

  return (
    <div className="app">
      {/* ── Top Navigation Bar ── */}
      <header className="topbar">
        {/* Brand Kiri */}
        <div className="brand">
          <img
            src="/assets/icon-512.png"
            alt="Logo SIPEDAS"
            className="brand-logo-img"
          />
          <div className="brand-text">
            <div className="brand-title">
              SIPEDAS <span className="accent">VIEW</span>
            </div>
            <div className="brand-subtitle">
              Sistem Informasi & Pemantauan Digital Kabupaten Ponorogo
            </div>
          </div>
        </div>

        {/* Aksi Kanan (Hanya Tombol Reload & Toggle Tema Mentok Kanan) */}
        <div className="topbar-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={() => void loadData(true)}
            title="Refresh data"
            disabled={isRefreshing}
          >
            <RotateCcw size={16} className={isRefreshing ? 'is-spinning' : ''} />
          </button>

          {/* Toggle Light / Dark Mode (Mentok Kanan) */}
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-label="Toggle tema"
          >
            {theme === 'dark' ? (
              <Sun size={17} className="theme-icon sun-icon" />
            ) : (
              <Moon size={17} className="theme-icon moon-icon" />
            )}
          </button>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <main className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Header Tetap di Sidebar (Tidak ikut terscroll) */}
          <div className="sidebar-sticky-top">
            {/* Search Bar */}
            <div className="sidebar-search">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Cari CCTV atau WiFi publik…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  title="Hapus pencarian"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Tabs Kategori: Semua, CCTV, WiFi */}
            <div className="filter-tabs">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <Layers size={13} />
                <span>Semua</span>
                <span className="tab-counter">{cameras.length + wifiPoints.length}</span>
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-cctv ${activeTab === 'cctv' ? 'active' : ''}`}
                onClick={() => setActiveTab('cctv')}
              >
                <Cctv size={13} />
                <span>CCTV</span>
                <span className="tab-counter count-cctv">{cameras.length}</span>
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-wifi ${activeTab === 'wifi' ? 'active' : ''}`}
                onClick={() => setActiveTab('wifi')}
              >
                <Wifi size={13} />
                <span>WiFi</span>
                <span className="tab-counter count-wifi">{wifiPoints.length}</span>
              </button>
            </div>
          </div>

          {apiError && (
            <div className={`network-alert-card ${isUsingCache ? 'is-warning' : 'is-error'}`}>
              <div className="alert-icon-wrap">
                {isOffline ? <WifiOff size={16} /> : <CloudOff size={16} />}
              </div>
              <div className="alert-body">
                <div className="alert-header-row">
                  <span className="alert-badge">
                    {isOffline ? 'Offline' : 'Gangguan Server'}
                  </span>
                  {lastSyncTime && isUsingCache && (
                    <span className="alert-sync-time">
                      Tersimpan {formatSyncTime(lastSyncTime)}
                    </span>
                  )}
                </div>
                <div className="alert-message">{apiError}</div>
                {isUsingCache && (
                  <div className="alert-subtext">
                    Menampilkan data CCTV & WiFi dari memori tersimpan agar lokasi di peta tetap dapat diakses.
                  </div>
                )}
              </div>
              <button
                type="button"
                className="alert-retry-btn"
                onClick={() => void loadData(true)}
                disabled={isRefreshing}
                title="Coba hubungkan kembali sekarang"
              >
                <RotateCcw size={12} className={isRefreshing ? 'is-spinning' : ''} />
                <span>{isRefreshing ? 'Menghubungkan…' : 'Coba Lagi'}</span>
              </button>
            </div>
          )}

          {/* Area Scroll Khusus dengan Scrollbar Custom & Sticky Headers Rapi */}
          <div className="sidebar-scroll-area custom-scrollbar">
            {/* List Kamera dengan Sticky Section Header Opaque Rapi */}
            {activeTab !== 'wifi' && (
              <div className="section-block">
                <div className="section-sticky-header">
                  <div className="section-title">
                    <Cctv size={15} className="text-sky" />
                    <span>Kamera CCTV ({filteredCameras.length})</span>
                  </div>
                  {loading && <Loader2 size={13} className="animate-spin text-muted" />}
                </div>

                <div className="status-filter" role="group" aria-label="Filter status CCTV">
                  {(['all', 'active', 'inactive'] as StatusFilter[]).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`status-filter-btn ${cameraStatusFilter === filter ? 'active' : ''}`}
                      onClick={() => setCameraStatusFilter(filter)}
                    >
                      {filter === 'all' ? 'Semua' : filter === 'active' ? 'Aktif' : 'Nonaktif'}
                    </button>
                  ))}
                </div>

                <ul className="cam-list">
                  {filteredCameras.map((cam) => {
                    const isSelected = selectedCamera?.slug === cam.slug;
                    const isOnline = cam.status === 'online';

                    return (
                      <li key={cam.slug}>
                        <button
                          type="button"
                          className={`cam-card ${isSelected ? 'active' : ''}`}
                          onClick={() => handleSidebarCameraClick(cam)}
                        >
                          <div className={`cam-status-pill ${isOnline ? 'online' : 'offline'}`}>
                            {isOnline ? <Video size={14} /> : <VideoOff size={14} />}
                          </div>

                          <div className="cam-info">
                            <div className="cam-name">{cam.name}</div>
                            <div className="cam-loc">
                              <MapPin size={11} className="loc-icon" />
                              <span>{cam.location}</span>
                            </div>
                          </div>

                          {cam.channel && (
                            <span className="cam-channel-tag">CH {cam.channel}</span>
                          )}

                          <ChevronRight size={15} className="cam-chevron" />
                        </button>
                      </li>
                    );
                  })}

                  {filteredCameras.length === 0 && !loading && (
                    <li className="empty-state-box">
                      {apiError && !isUsingCache ? (
                        <>
                          <CloudOff size={28} className="empty-icon text-rose" />
                          <div className="empty-state-title">Tidak Dapat Mengambil Data CCTV</div>
                          <div className="empty-state-desc">
                            Server pusat Nawasara sedang tidak dapat dijangkau atau perangkat sedang offline.
                          </div>
                          <button
                            type="button"
                            className="alert-retry-btn"
                            onClick={() => void loadData(true)}
                            disabled={isRefreshing}
                            style={{ marginTop: 6 }}
                          >
                            <RotateCcw size={12} className={isRefreshing ? 'is-spinning' : ''} />
                            <span>Hubungkan Kembali</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <VideoOff size={22} className="empty-icon" />
                          <div>Tidak ada CCTV yang cocok</div>
                        </>
                      )}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* List WiFi dengan Sticky Section Header Opaque Rapi */}
            {activeTab !== 'cctv' && (
              <div className="section-block wifi-section-block">
                <div className="section-sticky-header">
                  <div className="section-title">
                    <Wifi size={15} className="text-purple" />
                    <span>Hotspot WiFi ({filteredWifi.length})</span>
                  </div>
                </div>

                <div className="status-filter" role="group" aria-label="Filter status WiFi">
                  {(['all', 'active', 'inactive'] as StatusFilter[]).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`status-filter-btn ${wifiStatusFilter === filter ? 'active' : ''}`}
                      onClick={() => setWifiStatusFilter(filter)}
                    >
                      {filter === 'all' ? 'Semua' : filter === 'active' ? 'Aktif' : 'Nonaktif'}
                    </button>
                  ))}
                </div>

                <ul className="wifi-list">
                  {filteredWifi.map((wifi) => {
                    const isSelected = selectedWifiId === wifi.id;
                    return (
                      <li key={wifi.id}>
                        <button
                          type="button"
                          className={`wifi-card-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedWifiId(wifi.id);
                            setWifiFocusKey((prev) => prev + 1);
                            setFocusedLocation({ latitude: wifi.latitude, longitude: wifi.longitude });
                          }}
                          title="Klik untuk membuka lokasi & info WiFi di peta"
                        >
                          <div className="wifi-icon-wrap">
                            <Wifi size={14} />
                          </div>
                          <div className="cam-info">
                            <div className="cam-name">{wifi.name}</div>
                            <div className="cam-loc">
                              <MapPin size={11} className="loc-icon" />
                              <span>{wifi.location}</span>
                            </div>
                          </div>
                          <ChevronRight size={15} className="cam-chevron" />
                        </button>
                      </li>
                    );
                  })}

                  {filteredWifi.length === 0 && !loading && (
                    <li className="empty-state-box">
                      {apiError && !isUsingCache ? (
                        <>
                          <WifiOff size={28} className="empty-icon text-purple" />
                          <div className="empty-state-title">Tidak Dapat Memuat Hotspot WiFi</div>
                          <div className="empty-state-desc">
                            Gagal menghubungi server publik Nawasara.
                          </div>
                          <button
                            type="button"
                            className="alert-retry-btn"
                            onClick={() => void loadData(true)}
                            disabled={isRefreshing}
                            style={{ marginTop: 6 }}
                          >
                            <RotateCcw size={12} className={isRefreshing ? 'is-spinning' : ''} />
                            <span>Hubungkan Kembali</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <Wifi size={22} className="empty-icon" />
                          <div>Tidak ada hotspot WiFi yang cocok</div>
                        </>
                      )}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Sidebar Footer (Collapsible) */}
            <footer className="sidebar-foot">
              <button
                type="button"
                className="foot-toggle-btn"
                onClick={() => setIsLegalOpen((prev) => !prev)}
                aria-expanded={isLegalOpen}
                title={isLegalOpen ? 'Tutup informasi layanan' : 'Buka informasi layanan & legalitas'}
              >
                <div className="foot-brand">
                  <ShieldCheck size={14} className="text-sky" />
                  <span>SIPEDAS VIEW</span>
                  <span className="foot-info-tag">Info Layanan</span>
                </div>
                <ChevronDown
                  size={14}
                  className={`foot-chevron ${isLegalOpen ? 'is-open' : ''}`}
                />
              </button>

              {isLegalOpen && (
                <div className="foot-legal-content">
                  <p>
                    Platform ini dikelola oleh Satgas Linmas Kabupaten Ponorogo bekerja sama dengan Diskominfo Kab ponorogo untuk kepentingan keamanan dan transparansi publik. Hanya menampilkan ruang publik yang telah mendapat persetujuan pejabat berwenang. Tunduk pada UU No. 27/2022 tentang Perlindungan Data Pribadi dan Perpres No. 95/2018 tentang SPBE.
                  </p>
                </div>
              )}
            </footer>
          </div>
        </aside>

        {/* Interactive Map */}
        <section className="map-wrap">
          <MapView
            cameras={filteredCameras}
            wifiPoints={filteredWifi}
            selectedSlug={selectedCameraSlug}
            selectedCamera={selectedCamera}
            selectedWifiId={selectedWifiId}
            wifiFocusKey={wifiFocusKey}
            focusedLocation={focusedLocation}
            theme={theme}
            onSelect={(cam) => void openCamera(cam)}
            onSelectWifi={(id) => setSelectedWifiId(id)}
          />
        </section>
      </main>

      {/* ── Player Modal (CCTV Live Stream) ── */}
      {selectedCamera && (
        <div
          className="modal-backdrop"
          onClick={closePlayer}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <CameraPlayer
              camera={streamInfo?.camera || selectedCamera}
              streamUrl={streamInfo?.wss || null}
              isLoadingUrl={streamBusy}
              streamError={streamError}
              onRefreshUrl={refreshStreamUrl}
              onClose={closePlayer}
              onRetry={() => void openCamera(selectedCamera)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
