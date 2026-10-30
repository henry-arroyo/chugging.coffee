/**
 * The trusted system contents of drive C:. Everything here is protected because it is listed
 * here, in code; a stored record can never make itself (or anything else) protected.
 */
export interface SeedEntry {
  path: string;
  kind: 'folder' | 'text' | 'image' | 'shortcut';
  text?: string;
  assetId?: string;
  target?: string;
  /** Folders users may create files in. */
  writable?: boolean;
  /** Not listed in folder views (like the Recycled folder). */
  hidden?: boolean;
}

export const RECYCLED = 'C:\\Recycled';
export const MY_DOCUMENTS = 'C:\\My Documents';

const SEED_TIME = '1995-08-24T09:00:00.000Z';
export const SEED_TIMESTAMP = SEED_TIME;

export const SEED: readonly SeedEntry[] = [
  { path: 'C:\\', kind: 'folder', writable: true },
  { path: 'C:\\My Documents', kind: 'folder', writable: true },
  {
    path: 'C:\\My Documents\\Welcome.txt',
    kind: 'text',
    text: [
      'Welcome to the Time Machine.',
      '',
      'This computer is set to December 1995. Everything you create here is saved in this',
      'web browser only: files, settings, bookmarks and game scores. Nothing is sent anywhere.',
      '',
      'Things to try:',
      '  - Start > Programs > Accessories > Notepad, then save a note in My Documents.',
      '  - Drag files to the Recycle Bin... or press Delete. Deleted files can be restored.',
      '  - Start > Settings > Control Panel to change colors, wallpaper and sounds.',
      '',
      'This file is part of the system and cannot be changed, but you can save a copy.',
    ].join('\r\n'),
  },
  { path: 'C:\\Program Files', kind: 'folder' },
  { path: 'C:\\Program Files\\Accessories', kind: 'folder' },
  { path: 'C:\\Program Files\\Accessories\\Clock', kind: 'shortcut', target: 'app:clock' },
  { path: 'C:\\Program Files\\Accessories\\Notepad', kind: 'shortcut', target: 'app:notepad' },
  { path: 'C:\\Program Files\\Accessories\\Solitaire', kind: 'shortcut', target: 'app:solitaire' },
  { path: 'C:\\Program Files\\Accessories\\Minesweeper', kind: 'shortcut', target: 'app:minesweeper' },
  { path: 'C:\\Program Files\\America Online', kind: 'folder' },
  { path: 'C:\\Program Files\\America Online\\America Online', kind: 'shortcut', target: 'app:aol' },
  { path: 'C:\\Program Files\\Netscape', kind: 'folder' },
  { path: 'C:\\Program Files\\Netscape\\Netscape Navigator', kind: 'shortcut', target: 'app:netscape' },
  { path: 'C:\\Windows', kind: 'folder' },
  { path: 'C:\\Windows\\Wallpapers', kind: 'folder' },
  { path: 'C:\\Windows\\Wallpapers\\Coffee Beans.bmp', kind: 'image', assetId: 'wallpaper.coffee-beans' },
  { path: 'C:\\Windows\\Wallpapers\\Night Sky.bmp', kind: 'image', assetId: 'wallpaper.night-sky' },
  { path: 'C:\\Windows\\Wallpapers\\Grid Paper.bmp', kind: 'image', assetId: 'wallpaper.grid-paper' },
  {
    path: 'C:\\Windows\\Readme.txt',
    kind: 'text',
    text: 'System files live in this folder. They are protected so the computer keeps working.\r\n',
  },
  { path: 'C:\\Recycled', kind: 'folder', hidden: true },
  { path: 'C:\\Autoexec.bat', kind: 'text', text: '@ECHO OFF\r\nPROMPT $p$g\r\nSET TEMP=C:\\WINDOWS\\TEMP\r\n' },
  { path: 'C:\\Config.sys', kind: 'text', text: 'DEVICE=C:\\WINDOWS\\HIMEM.SYS\r\nFILES=40\r\n' },
];
