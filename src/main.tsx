import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AuthGate from './components/AuthGate';
import './index.css';
import { installApiAuthFetch } from './utils/apiAuthFetch';

// Attach the sign-in token to every /api request before anything renders.
installApiAuthFetch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
);
