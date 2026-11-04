import { createRoot } from 'react-dom/client';
import App from './App';
import './coach.css';

const okProtocol = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (okProtocol && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* sin soporte: la app funciona igual en línea */
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
