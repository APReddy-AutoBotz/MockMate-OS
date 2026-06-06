
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const isPwaStandalone = () => {
  try {
    // iOS Safari uses navigator.standalone, others use display-mode media query
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  } catch {
    return false;
  }
};

const isMobileUa = () => {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
};

if (isPwaStandalone() && isMobileUa()) {
  document.documentElement.classList.add('pwa-mobile');
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
