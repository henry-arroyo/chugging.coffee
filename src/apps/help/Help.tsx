import { useState } from 'react';
import type { AppProps } from '../types';

const TOPICS: { id: string; title: string; body: string[] }[] = [
  {
    id: 'start',
    title: 'Starting a program',
    body: [
      'Click Start, point to Programs, and then click the program you want.',
      'You can also double-click an icon on the desktop, or click Start, click Run, and type the program’s name (for example clock or notepad).',
    ],
  },
  {
    id: 'switch',
    title: 'Switching between windows',
    body: [
      'Every open program has a button on the taskbar. Click a button to bring its window to the front; click it again to minimize the window.',
      'From the keyboard: Ctrl+F6 moves to the next window, Ctrl+Shift+F6 to the previous one. You can also press Tab until a taskbar button is focused and press Enter.',
    ],
  },
  {
    id: 'move',
    title: 'Moving and sizing windows',
    body: [
      'Drag a window’s title bar to move it, or drag an edge or corner to size it. Double-click the title bar to maximize or restore it.',
      'Without a mouse: press Alt+Space (or Alt+Hyphen) to open the window menu, choose Move or Size, use the arrow keys, and press Enter. Esc cancels.',
    ],
  },
  {
    id: 'keyboard',
    title: 'Using the keyboard',
    body: [
      'Ctrl+Esc opens the Start menu. Arrow keys move through menus; the underlined letter chooses an item.',
      'F1 opens Help. On the desktop, the arrow keys select icons and Enter opens them.',
      'Some Windows 95 shortcuts (Alt+Tab, Alt+F4, the Windows key) belong to your real computer, so the alternatives above are provided.',
    ],
  },
  {
    id: 'shutdown',
    title: 'Shutting down',
    body: ['Click Start, then Shut Down. Shutting down or restarting only affects this simulation; your real computer is not touched.'],
  },
  {
    id: 'about',
    title: 'About this Time Machine',
    body: [
      'This is a recreation of a 1995 desktop running in your web browser. The online world it connects to is fictional.',
      'Some artwork is a labeled stand-in while permission for the original artwork is pending.',
      'Your files and settings stay in this browser only. Nothing is sent anywhere.',
    ],
  },
];

export default function Help(_props: AppProps) {
  const [selected, setSelected] = useState(TOPICS[0]!.id);
  const topic = TOPICS.find((t) => t.id === selected)!;
  return (
    <div className="w95-dialog-content" style={{ flexDirection: 'row', gap: 8 }}>
      <div style={{ width: 170, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor="help-topics">Click a topic:</label>
        <select
          id="help-topics"
          className="w95-sunken-panel"
          size={TOPICS.length}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ flex: 1, font: 'inherit', border: 0, padding: 2 }}
          data-autofocus=""
        >
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
      <article className="w95-sunken-panel" style={{ flex: 1, padding: '6px 8px', userSelect: 'text' }} aria-live="polite">
        <h2 style={{ fontSize: 13, margin: '2px 0 8px' }}>{topic.title}</h2>
        {topic.body.map((p, i) => (
          <p key={i} style={{ margin: '0 0 8px' }}>
            {p}
          </p>
        ))}
      </article>
    </div>
  );
}
