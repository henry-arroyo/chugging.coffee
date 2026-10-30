import type { ComponentType } from 'react';
import type { AppManifest } from '../core/contracts/types';
import type { ShellPrefs } from '../shell/context';

export type ButtonChoice = 'ok' | 'cancel' | 'yes' | 'no';

export interface MessageBoxOptions {
  title: string;
  text: string;
  icon?: 'info' | 'warning' | 'error' | 'question';
  buttons?: ButtonChoice[];
}

/**
 * What the shell hands an application window. Members appear only when the application's
 * manifest declares the matching capability.
 */
export interface AppHost {
  readonly windowId: string;
  close(): void;
  /** capability: windows */
  setTitle?(title: string): void;
  /** capability: windows. Opens an owned, modal message box and resolves with the button pressed. */
  messageBox?(options: MessageBoxOptions): Promise<ButtonChoice>;
  /** capability: windows. Starts another registered application. */
  launch?(appId: string): void;
  /** capability: settings. Shell preferences (taskbar options, sound). */
  shellPrefs?: {
    get(): ShellPrefs;
    set(prefs: ShellPrefs): void;
  };
}

export interface AppProps {
  host: AppHost;
}

export interface AppDefinition {
  manifest: AppManifest;
  component: ComponentType<AppProps>;
  /** Milestone in which a placeholder application becomes real, if it is not built yet. */
  plannedFor?: 'M2' | 'M3';
}
