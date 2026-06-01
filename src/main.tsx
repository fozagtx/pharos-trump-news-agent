import { DAppKitProvider } from '@mysten/dapp-kit-react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { dAppKit } from './dapp-kit';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DAppKitProvider dAppKit={dAppKit}>
      <App />
    </DAppKitProvider>
  </React.StrictMode>,
);
