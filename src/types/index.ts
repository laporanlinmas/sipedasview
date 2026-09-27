export interface Camera {
  slug: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  status: 'online' | 'offline' | string;
  device_status?: string;
  last_seen_at?: string;
  channel?: number;
  codec?: string;
  expiresAt?: Date | null;
}

export interface WifiPoint {
  id: number;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  status?: string;
  status_changed_at?: string;
}

export interface StreamResponseData {
  stream_url: string;
  mode: string;
  expires_at: string;
}

export interface StreamInfo {
  wss: string;
  mode: string;
  expiresAt: Date | null;
  camera: Camera;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export type PlayerPhase = 'loading' | 'connecting' | 'live' | 'error' | 'offline';

export interface HTMLVideoElementWithCaptureStream extends HTMLVideoElement {
  captureStream?(fps?: number): MediaStream;
}

export interface VideoRTCElement extends HTMLElement {
  mode: string;
  media: string;
  src: string;
  wsState?: number;
  pcState?: number;
  video?: HTMLVideoElementWithCaptureStream;
  ondisconnect(): void;
}

