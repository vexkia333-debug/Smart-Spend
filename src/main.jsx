import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Đăng ký Service Worker cho Thông báo ứng dụng (Web Push)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => {
        console.log('[SW] Service Worker đăng ký thành công:', reg.scope);
      },
      (err) => {
        console.warn('[SW] Lỗi đăng ký Service Worker:', err);
      }
    );
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

