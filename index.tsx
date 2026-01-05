
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { factoryReset, clearLibrary, syncAllData } from './services/storageService';

declare global {
  interface Window {
    DEBUG_factoryReset?: () => Promise<any>;
    DEBUG_clearLibrary?: () => Promise<any>;
    DEBUG_syncAllData?: () => Promise<any>;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Expose debug helpers for quick maintenance via DevTools console
if (typeof window !== 'undefined') {
  window.DEBUG_factoryReset = async () => {
    try { return await factoryReset(); } catch (e) { console.error('DEBUG_factoryReset failed', e); throw e; }
  };
  window.DEBUG_clearLibrary = async () => {
    try { return await clearLibrary(); } catch (e) { console.error('DEBUG_clearLibrary failed', e); throw e; }
  };
  window.DEBUG_syncAllData = async () => {
    try { return await syncAllData(); } catch (e) { console.error('DEBUG_syncAllData failed', e); throw e; }
  };
  window.DEBUG_dedupeLibrary = async () => {
    try { return await (await import('./services/storageService')).dedupeLibrary(); } catch (e) { console.error('DEBUG_dedupeLibrary failed', e); throw e; }
  };
  window.DEBUG_startPeriodicSync = async (ms?: number) => {
    try { return await (await import('./services/storageService')).startPeriodicSync(ms || 60000); } catch (e) { console.error('DEBUG_startPeriodicSync failed', e); throw e; }
  };
  window.DEBUG_stopPeriodicSync = async () => {
    try { return await (await import('./services/storageService')).stopPeriodicSync(); } catch (e) { console.error('DEBUG_stopPeriodicSync failed', e); throw e; }
  };
}
