import { useState } from 'react';
import { ItemList } from '../../shell/ItemList';
import type { AppProps } from '../types';

export const APPLETS = [
  { appId: 'accessibility-properties', name: 'Accessibility Options', icon: 'icon.accessibility' },
  { appId: 'datetime-properties', name: 'Date/Time', icon: 'icon.datetime' },
  { appId: 'display-properties', name: 'Display', icon: 'icon.display' },
  { appId: 'modem-properties', name: 'Modems', icon: 'icon.modem' },
  { appId: 'sound-properties', name: 'Sounds', icon: 'icon.speaker' },
  { appId: 'taskbar-properties', name: 'Taskbar', icon: 'icon.taskbar' },
  { appId: 'storage-properties', name: 'Time Machine', icon: 'icon.storage' },
  { appId: 'user-properties', name: 'Users', icon: 'icon.users' },
];

export default function ControlPanel({ host }: AppProps) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <ItemList
        items={APPLETS.map((a) => ({ id: a.appId, name: a.name, icon: a.icon }))}
        view="icons"
        label="Control Panel"
        selected={selected}
        onSelect={setSelected}
        onOpen={(id) => host.launch!(id)}
      />
      <div className="w95-statusbar">
        <span>{APPLETS.length} object(s)</span>
      </div>
    </>
  );
}
