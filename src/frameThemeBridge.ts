/**
 * Jembatan tema untuk aplikasi yang ditampilkan di dalam iframe.
 *
 * Protokol (dipakai seragam oleh sipedasadmin, sapapedestrian, laporsipedas,
 * dan sipedas-view):
 *   parent → child : { type: 'SIPEDAS_THEME_CHANGE', theme: 'dark'|'light' }
 *   child  → parent: { type: 'SIPEDAS_VIEWER_READY' }
 *   child  → parent: { type: 'sipedas:frame-ready' }   (sinyal "saya hidup")
 *   URL param      : ?theme=dark|light  (dipakai untuk frame pertama, agar
 *                    tidak ada kedipan tema sebelum script berjalan)
 *
 * Tanpa jembatan ini, aplikasi yang dibungkus iframe selalu memakai tema
 * simpanan lokalnya sendiri sehingga terlihat "salah tema" dibanding induknya.
 */

export type ThemeMode = 'dark' | 'light';

export const THEME_MSG = 'SIPEDAS_THEME_CHANGE';
export const READY_MSG = 'SIPEDAS_VIEWER_READY';
export const FRAME_READY_MSG = 'sipedas:frame-ready';

const isTheme = (v: unknown): v is ThemeMode => v === 'dark' || v === 'light';

/** Tema dari query param `?theme=` (kalau ada). */
export function themeFromLocation(): ThemeMode | null {
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    return isTheme(q) ? q : null;
  } catch {
    return null;
  }
}

/** Tambahkan/ubah parameter `theme` pada URL tanpa merusak query yang ada. */
export function withThemeParam(url: string, theme: ThemeMode): string {
  if (!url) return url;
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('theme', theme);
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}theme=${encodeURIComponent(theme)}`;
  }
}

/**
 * Pasang jembatan tema di sisi anak (frame).
 *
 * @param applyTheme  fungsi menerapkan tema ke DOM aplikasi ini
 * @param onThemeFromParent dipanggil bila tema datang dari induk (berguna
 *                          untuk menyetel state React, bukan hanya DOM)
 */
export function installThemeBridge(opts: {
  applyTheme: (theme: ThemeMode) => void;
  onThemeFromParent?: (theme: ThemeMode) => void;
  /** Simpan tema induk ke localStorage? default: tidak (hanya untuk sesi ini). */
  persist?: boolean;
}): () => void {
  const framed = window.parent !== window;

  const handle = (theme: ThemeMode) => {
    opts.applyTheme(theme);
    opts.onThemeFromParent?.(theme);
  };

  // 1. Tema awal dari URL (agar frame pertama langsung benar).
  const initial = themeFromLocation();
  if (initial) handle(initial);

  // 2. Perubahan tema dari induk.
  const onMessage = (ev: MessageEvent) => {
    const data = ev?.data;
    if (data && typeof data === 'object' && (data as { type?: string }).type === THEME_MSG) {
      const theme = (data as { theme?: unknown }).theme;
      if (isTheme(theme)) handle(theme);
    }
  };
  window.addEventListener('message', onMessage);

  // 3. Beri tahu induk bahwa kita siap menerima tema.
  const announce = () => {
    try {
      window.parent.postMessage({ type: READY_MSG }, '*');
      window.parent.postMessage({ type: FRAME_READY_MSG }, '*');
    } catch {
      /* induk sudah ditutup — abaikan */
    }
  };

  let timers: number[] = [];
  if (framed) {
    announce();
    // Some iframe baru siap setelah komponen mount; kirim ulang berkali-kali.
    timers = [400, 1200, 2500, 4000].map((ms) => window.setTimeout(announce, ms));
  }

  return () => {
    window.removeEventListener('message', onMessage);
    timers.forEach((t) => clearTimeout(t));
  };
}