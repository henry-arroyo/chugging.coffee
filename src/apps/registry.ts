import Clock from './clock/Clock';
import Help from './help/Help';
import { MANIFESTS } from './manifests';
import { notBuilt } from './system/NotBuilt';
import TaskbarProperties from './system/TaskbarProperties';
import type { AppDefinition, AppProps } from './types';
import type { ComponentType } from 'react';

const BUILT: Record<string, ComponentType<AppProps>> = {
  clock: Clock,
  help: Help,
  'taskbar-properties': TaskbarProperties,
};

const PLANNED: Record<string, 'M2' | 'M3'> = {
  'my-computer': 'M2',
  'recycle-bin': 'M2',
  explorer: 'M2',
  notepad: 'M2',
  solitaire: 'M2',
  minesweeper: 'M2',
  'control-panel': 'M2',
  find: 'M2',
  aol: 'M3',
  netscape: 'M3',
};

export const APPS: Record<string, AppDefinition> = Object.fromEntries(
  MANIFESTS.map((manifest) => {
    const built = BUILT[manifest.module];
    const plannedFor = PLANNED[manifest.appId];
    const definition: AppDefinition = built
      ? { manifest, component: built }
      : { manifest, component: notBuilt(manifest.appId === 'explorer' ? 'Windows Explorer' : manifest.title, plannedFor ?? 'M2'), plannedFor: plannedFor ?? 'M2' };
    return [manifest.appId, definition];
  }),
);
