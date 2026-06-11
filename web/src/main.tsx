/* © 2026 Aditum — Aditum FieldOps — entry point */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './styles/tokens.css';
import './styles/layout.css';
import { AuthProvider } from './lib/auth';
import { TenantProvider } from './lib/tenant';
import { DataProvider } from './lib/store';
import { bootBranding } from './lib/branding';
import App from './App';

// Aplica la marca cacheada (paleta) antes del primer render: evita el flash del fallback.
bootBranding();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
