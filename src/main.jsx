import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { ligarPuxarParaAtualizar } from './puxar.js';

// App de celular: sem zoom de pinça nem de toque duplo (inclusive dentro do WhatsApp e do Safari, que ignoram o "user-scalable=no")
const semZoom = (e) => e.preventDefault();
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, semZoom, { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

ligarPuxarParaAtualizar();

createRoot(document.getElementById('root')).render(<App />);
