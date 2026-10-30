import type { ComponentType } from 'react';
import { AccessibilityProperties, DateTimeProperties, DisplayProperties, ModemProperties, SoundProperties, StorageProperties, UserProperties } from './control/Applets';
import Aol from './aol/Aol';
import ControlPanel from './control/ControlPanel';
import Clock from './clock/Clock';
import Find from './files/Find';
import { Explorer, Folder, MyComputer } from './files/FolderWindow';
import ImageView from './files/ImageView';
import Notepad from './files/Notepad';
import RecycleBin from './files/RecycleBin';
import Minesweeper from './games/Minesweeper';
import Solitaire from './games/Solitaire';
import Help from './help/Help';
import Netscape from './netscape/Netscape';
import { MANIFESTS } from './manifests';
import { notBuilt } from './system/NotBuilt';
import TaskbarProperties from './system/TaskbarProperties';
import type { AppDefinition, AppProps } from './types';

const BUILT: Record<string, ComponentType<AppProps>> = {
  clock: Clock,
  help: Help,
  'taskbar-properties': TaskbarProperties,
  'my-computer': MyComputer,
  folder: Folder,
  explorer: Explorer,
  'recycle-bin': RecycleBin,
  notepad: Notepad,
  imageview: ImageView,
  find: Find,
  'control-panel': ControlPanel,
  'display-properties': DisplayProperties,
  'sound-properties': SoundProperties,
  'modem-properties': ModemProperties,
  'datetime-properties': DateTimeProperties,
  'accessibility-properties': AccessibilityProperties,
  'user-properties': UserProperties,
  'storage-properties': StorageProperties,
  solitaire: Solitaire,
  minesweeper: Minesweeper,
  netscape: Netscape,
  aol: Aol,
};

const PLANNED: Record<string, 'M2' | 'M3'> = {};

export const APPS: Record<string, AppDefinition> = Object.fromEntries(
  MANIFESTS.map((manifest) => {
    const built = BUILT[manifest.module];
    const plannedFor = PLANNED[manifest.appId] ?? 'M3';
    const definition: AppDefinition = built ? { manifest, component: built } : { manifest, component: notBuilt(manifest.title, plannedFor), plannedFor };
    return [manifest.appId, definition];
  }),
);
