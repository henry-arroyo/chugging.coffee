import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// M0 placeholder. The Windows 95 shell replaces this in M1.
function M0Placeholder() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>chugging.coffee Time Machine</h1>
      <p>Milestone 0 scaffold. The desktop is not built yet.</p>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <M0Placeholder />
    </StrictMode>,
  );
}
