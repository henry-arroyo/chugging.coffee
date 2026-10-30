import { programsTree, type ProgramsNode } from '../apps/manifests';
import { METRICS } from '../core/windows/geometry';
import { BRANDING } from './branding';
import { useShell } from './context';
import { Menu, type MenuItem } from './Menu';

interface StartMenuProps {
  onClose: (reason: 'select' | 'escape' | 'left') => void;
  keyboard: boolean;
}

export function StartMenu({ onClose, keyboard }: StartMenuProps) {
  const shell = useShell();
  const { launch, desktop, prefs } = shell;

  const programs = (nodes: ProgramsNode[], path: string): MenuItem[] => {
    const items: MenuItem[] = nodes.map((n) =>
      n.kind === 'folder'
        ? { id: `${path}/${n.name}`, label: n.name, accessKey: 0, icon: 'icon.programs', submenu: () => programs(n.children, `${path}/${n.name}`) }
        : { id: `${path}/${n.appId}`, label: n.title, accessKey: 0, icon: n.icon, onSelect: () => launch(n.appId) },
    );
    return items.length > 0 ? items : [{ id: `${path}/empty`, label: '(Empty)', disabled: true }];
  };

  const items: MenuItem[] = [
    { id: 'programs', label: 'Programs', accessKey: 0, icon: 'icon.programs', submenu: () => programs(programsTree(), 'programs') },
    // Recently opened documents arrive with the virtual file system (M2).
    { id: 'documents', label: 'Documents', accessKey: 0, icon: 'icon.documents', submenu: () => [{ id: 'documents/empty', label: '(Empty)', disabled: true }] },
    {
      id: 'settings',
      label: 'Settings',
      accessKey: 0,
      icon: 'icon.settings',
      submenu: () => [
        { id: 'settings/control', label: 'Control Panel', accessKey: 0, icon: 'icon.control-panel', onSelect: () => launch('control-panel') },
        { id: 'settings/taskbar', label: 'Taskbar...', accessKey: 0, icon: 'icon.taskbar', onSelect: () => launch('taskbar-properties') },
      ],
    },
    {
      id: 'find',
      label: 'Find',
      accessKey: 0,
      icon: 'icon.find',
      submenu: () => [{ id: 'find/files', label: 'Files or Folders...', accessKey: 0, icon: 'icon.find', onSelect: () => launch('find') }],
    },
    { id: 'help', label: 'Help', accessKey: 0, icon: 'icon.help', onSelect: () => launch('help') },
    { id: 'run', label: 'Run...', accessKey: 0, icon: 'icon.run', onSelect: () => shell.openRun() },
    { id: 'sep', separator: true },
    { id: 'shutdown', label: 'Shut Down...', accessKey: 2, icon: 'icon.shutdown', onSelect: () => shell.openShutDown() },
  ];

  return (
    <Menu
      items={items}
      position={{ x: 2, y: 0 }}
      bottom={desktop.height - METRICS.taskbarHeight + 2}
      desktop={desktop}
      large={!prefs.smallStartIcons}
      label="Start menu"
      highlightFirst={keyboard}
      banner={
        prefs.smallStartIcons ? undefined : (
          <div className="w95-start-banner" aria-hidden="true">
            <span>
              {BRANDING.startBanner.lead}
              <b>{BRANDING.startBanner.tail}</b>
            </span>
          </div>
        )
      }
      onClose={onClose}
    />
  );
}
