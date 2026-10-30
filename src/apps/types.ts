import { useSyncExternalStore, type ComponentType } from 'react';
import type { AppManifest, KlondikeSnapshot, MinesweeperLevel, MinesweeperSnapshot, Preferences, SaveExport } from '../core/contracts/types';
import type { EntryInfo, VfsResult, VfsState } from '../core/vfs/vfs';
import type { BestTimes, StorageMode, ModeReason } from '../persistence/session';
import type { ShellPrefs } from '../shell/context';

export type ButtonChoice = 'ok' | 'cancel' | 'yes' | 'no';

export interface MessageBoxOptions {
  title: string;
  text: string;
  icon?: 'info' | 'warning' | 'error' | 'question';
  buttons?: ButtonChoice[];
}

export interface FileDialogOptions {
  mode: 'open' | 'save';
  title?: string;
  folder?: string;
  name?: string;
}

/** capability: vfs-read (and vfs-write for the mutating members). */
export interface FilesApi {
  stat(path: string): EntryInfo | null;
  list(folder: string, options?: { includeHidden?: boolean }): VfsResult<EntryInfo[]>;
  search(query: string, options?: { inFolder?: string; inContent?: boolean }): EntryInfo[];
  recycled(): EntryInfo[];
  usage(): { bytes: number; limit: number; files: number };
  writeText?(path: string, text: string): VfsResult;
  createFolder?(parent: string, name: string): VfsResult;
  rename?(path: string, name: string): VfsResult;
  copy?(source: string, destFolder: string): VfsResult<{ state: VfsState; path: string }>;
  remove?(path: string): VfsResult<{ state: VfsState; recycledPath: string }>;
  restore?(recycledPath: string): VfsResult<{ state: VfsState; path: string }>;
  purge?(recycledPath: string): VfsResult;
  emptyRecycleBin?(): void;
}

/** capability: storage */
export interface StorageApi {
  klondike(): KlondikeSnapshot | undefined;
  minesweeper(): MinesweeperSnapshot | undefined;
  saveGame(snapshot: KlondikeSnapshot | MinesweeperSnapshot): void;
  clearGame(game: 'klondike' | 'minesweeper'): void;
  bestTimes(): BestTimes;
  recordBestTime(level: MinesweeperLevel, seconds: number): boolean;
  preferences(): Preferences;
  setPreferences(preferences: Preferences): void;
}

/** capability: settings */
export interface SettingsApi {
  preferences(): Preferences;
  setPreferences(preferences: Preferences): void;
  screenName(): string;
  rename(name: string): { ok: true } | { ok: false; error: string };
  storage(): { mode: StorageMode; reason: ModeReason | null; bytes: number };
  exportSave(): SaveExport;
  importSave(text: string): Promise<{ ok: true; warnings: string[] } | { ok: false; error: string }>;
  reset(): Promise<void>;
  shellPrefs: { get(): ShellPrefs; set(prefs: ShellPrefs): void };
}

/**
 * What the shell hands an application window. Members appear only when the application's
 * manifest declares the matching capability.
 */
export interface AppHost {
  readonly windowId: string;
  /** Asks to close (runs the close guard, if any). */
  close(): void;
  /** Re-render when personal state changes. */
  subscribe(listener: () => void): () => void;
  version(): number;
  /** Arguments the window was opened with, such as a file to open. */
  readonly args: { path?: string };
  /** capability: windows */
  setTitle?(title: string): void;
  /** Sizes the window's outer frame (capability: windows). */
  setSize?(width: number, height: number): void;
  messageBox?(options: MessageBoxOptions): Promise<ButtonChoice>;
  launch?(appId: string): void;
  openFile?(path: string): void;
  chooseFile?(options: FileDialogOptions): Promise<string | null>;
  /** Called before the window closes; resolve false to keep it open. */
  setCloseGuard?(guard: (() => Promise<boolean>) | null): void;
  addRecent?(path: string): void;
  files?: FilesApi;
  storage?: StorageApi;
  settings?: SettingsApi;
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

/** Re-renders the calling component whenever the guest's state changes. */
export function useHostState(host: AppHost): number {
  return useSyncExternalStore(host.subscribe, host.version);
}
