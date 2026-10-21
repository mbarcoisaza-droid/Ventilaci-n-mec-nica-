import { createRoot } from 'react-dom/client';
import App from './App';
import { initPwa } from './pwa';
import './styles.css';

initPwa();
createRoot(document.getElementById('root')!).render(<App />);
