import React, { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ZoomControls from './ZoomControls';
import type { Camera, WifiPoint } from './types';

// Pembuatan DivIcon kustom untuk CCTV dengan icon CCTV resmi Lucide React
function createCameraMarkerIcon(status: string, isSelected: boolean): L.DivIcon {
  const isOnline = status === 'online';
  const color = isOnline ? '#10b981' : '#6b7280';
  const pulseClass = isOnline ? 'marker-pulse-online' : '';
  const selectedClass = isSelected ? 'marker-selected' : '';

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div class="camera-marker-pin ${pulseClass} ${selectedClass}" style="--marker-color: ${color}">
        <div class="pin-inner" title="CCTV ${isOnline ? 'Online' : 'Offline'}">
          <!-- Icon CCTV Lucide React Resmi -->
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97"/>
            <path d="M17.106 9.053a1 1 0 0 1 .447 1.341l-3.106 6.211a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3z"/>
            <path d="M2 19h3.76a2 2 0 0 0 1.8-1.1L9 15"/>
            <path d="M2 21v-4"/>
            <path d="M7 9h.01"/>
          </svg>
        </div>
        <div class="pin-pointer"></div>
      </div>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
  });
}

// Pembuatan DivIcon kustom untuk WiFi Hotspot dengan icon Wifi resmi Lucide React
function createWifiMarkerIcon(isSelected = false): L.DivIcon {
  const selectedClass = isSelected ? 'marker-selected' : '';
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div class="wifi-marker-pin ${selectedClass}" title="Klik untuk membuka info WiFi">
        <div class="wifi-pin-inner">
          <!-- Icon Wifi Lucide React Resmi -->
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h.01"/>
            <path d="M2 8.82a15 15 0 0 1 20 0"/>
            <path d="M5 12.859a10 10 0 0 1 14 0"/>
            <path d="M8.5 16.429a5 5 0 0 1 7 0"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// Cache icon marker agar tidak membuat DOM instance baru berulang-ulang pada setiap render
const cameraIconCache = new Map<string, L.DivIcon>();
function getCameraMarkerIcon(status: string, isSelected: boolean): L.DivIcon {
  const key = `${status}-${isSelected}`;
  let icon = cameraIconCache.get(key);
  if (!icon) {
    icon = createCameraMarkerIcon(status, isSelected);
    cameraIconCache.set(key, icon);
  }
  return icon;
}

const wifiIconCache = new Map<boolean, L.DivIcon>();
function getWifiMarkerIcon(isSelected = false): L.DivIcon {
  let icon = wifiIconCache.get(isSelected);
  if (!icon) {
    icon = createWifiMarkerIcon(isSelected);
    wifiIconCache.set(isSelected, icon);
  }
  return icon;
}

interface MapControllerProps {
  items: Array<{ latitude: number; longitude: number }>;
  selectedCamera?: Camera | null;
  focusedLocation?: { latitude: number; longitude: number } | null;
}

// Pengontrol peta responsif (auto-resize, fitBounds, & flyTo)
function MapController({ items, selectedCamera, focusedLocation }: MapControllerProps): null {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    map.invalidateSize();
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 250);

    const handleResize = (): void => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  // Fit bounds pada pemuatan awal
  useEffect(() => {
    if (!items.length || hasFittedRef.current) return;
    const coords: [number, number][] = items.map((i) => [i.latitude, i.longitude]);
    const bounds = L.latLngBounds(coords);
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12));
      hasFittedRef.current = true;
    }
  }, [items, map]);

  // Terbang ke koordinat kamera jika dipilih
  useEffect(() => {
    if (selectedCamera) {
      map.flyTo([selectedCamera.latitude, selectedCamera.longitude], 16, {
        duration: 1.2,
      });
    }
  }, [selectedCamera, map]);

  // Terbang ke koordinat lokasi umum jika diarahkan dari sidebar
  useEffect(() => {
    if (focusedLocation) {
      map.flyTo([focusedLocation.latitude, focusedLocation.longitude], 16, {
        duration: 1.2,
      });
    }
  }, [focusedLocation, map]);

  return null;
}

interface CameraMarkerItemProps {
  camera: Camera;
  isSelected: boolean;
  onSelect: (cam: Camera) => void;
}

// Marker CCTV yang ter-memoize untuk mencegah render ulang saat pencarian atau ganti tab
const CameraMarkerItem = React.memo<CameraMarkerItemProps>(({ camera, isSelected, onSelect }) => {
  const isOnline = camera.status === 'online';
  const markerRef = useRef<L.Marker | null>(null);
  const icon = useMemo(() => getCameraMarkerIcon(camera.status, isSelected), [camera.status, isSelected]);

  useEffect(() => {
    if (isSelected && markerRef.current) markerRef.current.openPopup();
  }, [isSelected]);

  return (
    <Marker ref={markerRef} position={[camera.latitude, camera.longitude]} icon={icon}>
      <Tooltip direction="top" offset={[0, -42]} opacity={0.96} className="sipedas-tooltip">
        <div className="tooltip-inner">
          <b>{camera.name}</b>
          <div className={`status-badge-mini ${isOnline ? 'online' : 'offline'}`}>
            ● {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>
      </Tooltip>

      <Popup className="sipedas-popup">
        <div className="popup-card">
          <div className="popup-badge-row">
            <span className={`popup-status ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? '● Online' : '○ Offline'}
            </span>
            {camera.channel && <span className="popup-channel">CH {camera.channel}</span>}
          </div>

          <div className="popup-title">{camera.name}</div>
          <div className="popup-loc">{camera.location}</div>

          {isOnline ? (
            <button
              type="button"
              className="popup-play-btn"
              onClick={() => onSelect(camera)}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Tonton Live Stream</span>
            </button>
          ) : (
            <div className="popup-unavailable">Tidak tersedia</div>
          )}
        </div>
      </Popup>
    </Marker>
  );
});
CameraMarkerItem.displayName = 'CameraMarkerItem';

interface WifiMarkerItemProps {
  wifi: WifiPoint;
  isSelected: boolean;
  focusKey?: number;
  onSelect?: (id: number) => void;
}

// Marker item WiFi yang otomatis membuka popup ketika dipilih dari sidebar atau peta
const WifiMarkerItem = React.memo<WifiMarkerItemProps>(({
  wifi,
  isSelected,
  focusKey = 0,
  onSelect,
}) => {
  const markerRef = useRef<L.Marker | null>(null);
  const icon = useMemo(() => getWifiMarkerIcon(isSelected), [isSelected]);

  useEffect(() => {
    if (isSelected && markerRef.current) {
      markerRef.current.openPopup();
      const timer = window.setTimeout(() => {
        if (markerRef.current) {
          markerRef.current.openPopup();
        }
      }, 350);
      return () => window.clearTimeout(timer);
    }
  }, [isSelected, focusKey]);

  return (
    <Marker
      ref={markerRef}
      position={[wifi.latitude, wifi.longitude]}
      icon={icon}
      eventHandlers={{
        click: () => {
          onSelect?.(wifi.id);
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -16]} opacity={0.96} className="sipedas-tooltip">
        <div className="tooltip-inner">
          <b>{wifi.name}</b>
          <div className="tooltip-muted">{wifi.location}</div>
        </div>
      </Tooltip>

      <Popup className="sipedas-popup" autoPan={false}>
        <div className="popup-card">
          <div className="popup-badge-row">
            <span className="popup-wifi-tag">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 20h.01"/>
                <path d="M2 8.82a15 15 0 0 1 20 0"/>
                <path d="M5 12.859a10 10 0 0 1 14 0"/>
                <path d="M8.5 16.429a5 5 0 0 1 7 0"/>
              </svg>
              <span>WiFi Publik</span>
            </span>
            <span className="popup-status online">● Terhubung</span>
          </div>

          <div className="popup-title">{wifi.name}</div>
          <div className="popup-loc">{wifi.location}</div>

          <a
            href={`https://www.google.com/maps/search/?api=1&query=${wifi.latitude},${wifi.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="popup-gmaps-btn"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            <span>Buka di Google Maps</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </Popup>
    </Marker>
  );
});
WifiMarkerItem.displayName = 'WifiMarkerItem';

export interface MapViewProps {
  cameras: Camera[];
  wifiPoints: WifiPoint[];
  selectedSlug?: string | null;
  selectedCamera?: Camera | null;
  selectedWifiId?: number | null;
  wifiFocusKey?: number;
  focusedLocation?: { latitude: number; longitude: number } | null;
  theme?: 'dark' | 'light';
  onSelect: (camera: Camera) => void;
  onSelectWifi?: (id: number) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  cameras,
  wifiPoints,
  selectedSlug,
  selectedCamera,
  selectedWifiId,
  wifiFocusKey,
  focusedLocation,
  theme = 'dark',
  onSelect,
  onSelectWifi,
}) => {
  const allCoordinates = useMemo(
    () => [...cameras, ...wifiPoints].map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
    [cameras, wifiPoints]
  );

  // Gunakan OpenStreetMap tanpa API key; tile gelap diberi filter pada pane peta.
  const tileConfig = useMemo(() => {
    if (theme === 'dark') {
      return {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c'],
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        maxZoom: 19,
      };
    }
    return {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c'],
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      maxZoom: 19,
    };
  }, [theme]);

  return (
    <MapContainer
      center={[-7.8694, 111.47]}
      zoom={14}
      className="sipedas-map"
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer
        key={`tile-layer-${theme}`}
        attribution={tileConfig.attribution}
        url={tileConfig.url}
        subdomains={tileConfig.subdomains}
        maxZoom={tileConfig.maxZoom}
      />

      <ZoomControls defaultCenter={[-7.8694, 111.47]} defaultZoom={14} />

      <MapController
        items={allCoordinates}
        selectedCamera={selectedCamera}
        focusedLocation={focusedLocation}
      />

      {/* Markers CCTV (Memoized) */}
      {cameras.map((camera) => (
        <CameraMarkerItem
          key={camera.slug}
          camera={camera}
          isSelected={camera.slug === selectedSlug}
          onSelect={onSelect}
        />
      ))}

      {/* Markers WiFi dengan Popup Otomatis Terbuka Saat Dipilih */}
      {wifiPoints.map((wifi) => (
        <WifiMarkerItem
          key={`wifi-${wifi.id}`}
          wifi={wifi}
          isSelected={wifi.id === selectedWifiId}
          focusKey={wifiFocusKey}
          onSelect={onSelectWifi}
        />
      ))}
    </MapContainer>
  );
};

export default MapView;
