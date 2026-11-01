import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from '@/hooks/useLanguage';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { startServerClockSync } from '@/lib/serverClock';
import './index.css';

startServerClockSync();

const cleanPath = window.location.pathname.match(/^\/((?:a\/[a-z0-9-]{3,30})(?:\/report\/.+)?|report\/.+)\/?$/i);
if (cleanPath) {
  window.history.replaceState(null, '', `/${window.location.search}#/${cleanPath[1]}`);
}

const renamedLink = window.location.hash.match(/^#\/a\/followreade(\/.*)?$/i);
if (renamedLink) {
  window.history.replaceState(null, '', `/${window.location.search}#/a/royalmaster${renamedLink[1] ?? ''}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </LanguageProvider>
  </StrictMode>
);
