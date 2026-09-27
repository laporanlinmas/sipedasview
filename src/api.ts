import type { ApiResponse, Camera, StreamResponseData, WifiPoint } from './types';

const STORAGE_CAMERAS = 'sipedas_offline_cameras';
const STORAGE_WIFI = 'sipedas_offline_wifi';
const STORAGE_SYNCED_AT = 'sipedas_offline_synced_at';

/**
 * Mengambil data CCTV tersimpan dari localStorage.
 */
export function getCachedCameras(): Camera[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_CAMERAS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Mengambil data WiFi tersimpan dari localStorage.
 */
export function getCachedWifi(): WifiPoint[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_WIFI);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Mengambil timestamp waktu sinkronisasi terakhir.
 */
export function getLastSyncTime(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_SYNCED_AT);
  } catch {
    return null;
  }
}

/**
 * Menyimpan data ke localStorage untuk ketahanan offline.
 */
export function saveOfflineData(cameras: Camera[], wifi: WifiPoint[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (Array.isArray(cameras) && cameras.length > 0) {
      localStorage.setItem(STORAGE_CAMERAS, JSON.stringify(cameras));
    }
    if (Array.isArray(wifi) && wifi.length > 0) {
      localStorage.setItem(STORAGE_WIFI, JSON.stringify(wifi));
    }
    localStorage.setItem(STORAGE_SYNCED_AT, new Date().toISOString());
  } catch {
    // Ignore storage quota limits
  }
}

/**
 * Mengubah pesan error teknis menjadi kalimat bahasa Indonesia yang ramah & profesional.
 */
export function formatApiErrorMessage(err: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Koneksi internet perangkat Anda sedang offline.';
  }

  const raw = (err as Error)?.message || String(err || '');

  if (raw.includes('502') || raw.includes('Bad Gateway')) {
    return 'Server pusat (Nawasara) sedang tidak dapat dijangkau sementara waktu.';
  }
  if (raw.includes('503') || raw.includes('504') || raw.includes('Timeout') || raw.includes('timeout')) {
    return 'Server pusat sedang sibuk atau batas waktu koneksi habis.';
  }
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('fetch')) {
    return 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
  }

  return raw || 'Terjadi gangguan saat menghubungkan ke server data.';
}

/**
 * Mengambil daftar seluruh CCTV publik Ponorogo.
 */
export async function fetchCameras(signal?: AbortSignal): Promise<Camera[]> {
  let res: Response;
  try {
    res = await fetch('/api/cameras', { signal });
  } catch (netErr) {
    throw new Error(formatApiErrorMessage(netErr));
  }

  if (!res.ok) {
    if (res.status === 502) {
      throw new Error('Server pusat (Nawasara) sedang tidak dapat dijangkau sementara (HTTP 502).');
    }
    if (res.status === 503 || res.status === 504) {
      throw new Error('Server pusat sedang sibuk atau batas waktu habis.');
    }
    throw new Error(`Tidak dapat memuat daftar CCTV (HTTP ${res.status}).`);
  }

  const json = (await res.json()) as ApiResponse<Camera[]>;
  if (!Array.isArray(json.data)) {
    throw new Error('Format data kamera tidak dikenali dari server.');
  }
  return json.data;
}

/**
 * Mengambil titik hotspot WiFi publik Ponorogo.
 */
export async function fetchWifiPoints(signal?: AbortSignal): Promise<WifiPoint[]> {
  try {
    const res = await fetch('/api/wifi', { signal });
    if (!res.ok) return getCachedWifi();
    const json = (await res.json()) as ApiResponse<WifiPoint[]>;
    return Array.isArray(json.data) ? json.data : getCachedWifi();
  } catch {
    return getCachedWifi();
  }
}

export interface StreamUrlResult {
  wss: string;
  mode: string;
  expiresAt: Date | null;
}

/**
 * Meminta signed stream URL (masa berlaku ~5 menit) lalu mengubah https:// -> wss://
 * karena server go2rtc melayani stream live via WebSocket.
 */
export async function fetchStreamUrl(slug: string, signal?: AbortSignal): Promise<StreamUrlResult> {
  let res: Response;
  try {
    res = await fetch(`/api/stream/${encodeURIComponent(slug)}`, { signal });
  } catch (netErr) {
    throw new Error(formatApiErrorMessage(netErr));
  }

  if (!res.ok) {
    if (res.status === 502) {
      throw new Error('Server live stream go2rtc sedang tidak dapat dijangkau (HTTP 502). Coba sesaat lagi.');
    }
    if (res.status === 503 || res.status === 504) {
      throw new Error('Server live stream sedang sibuk. Silakan coba kembali.');
    }
    throw new Error(`Gagal membuka live stream kamera (HTTP ${res.status}).`);
  }

  const json = (await res.json()) as ApiResponse<StreamResponseData>;
  const data = json.data;
  if (!data?.stream_url) {
    throw new Error('Stream URL tidak ditemukan dalam respons API');
  }

  const wss = data.stream_url.replace(/^http/, 'ws');
  return {
    wss,
    mode: data.mode || 'mse',
    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
  };
}
