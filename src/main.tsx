import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Host } from './host/Host';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Host />
    </StrictMode>,
  );
}
