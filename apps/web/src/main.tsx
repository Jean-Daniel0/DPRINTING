import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/archivo-black/400.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Élément racine absent.');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
