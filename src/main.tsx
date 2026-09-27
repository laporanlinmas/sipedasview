import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemen #root tidak ditemukan pada DOM.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registrasi Service Worker PWA untuk caching offline & performa tinggi di semua device
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.info('[PWA] Versi baru tersedia.');
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[PWA] Gagal registrasi service worker:', err);
      });
  });
}

