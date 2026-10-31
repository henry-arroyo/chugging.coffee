import { useSyncExternalStore, type ComponentType } from 'react';
import type { AppManifest, KlondikeSnapshot, MinesweeperLevel, MinesweeperSnapshot, Preferences, SaveExport } from '../core/contracts/types';
import type { LoadResult, PageLoadCallbacks } from '../content/network';
import type { PinnedWorld } from '../content/repository';
import type { WebAddress } from '../core/net/address';
import type { ConnectionState, Phase, Speed } from '../core/net/connection';
import type { EntryInfo, VfsResult, VfsState } from '../core/vfs/vfs';
import type { BestTimes, StorageMode, ModeReason } from '../persistence/session';
import type { ShellPrefs } from '../shell/context';

export interface LaunchArgs {
  path?: string;
  /** A virtual address for Netscape to open. */
  address?: string;
}

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

/** capability: network. One shared connection for every program. */
export interface NetworkApi {
  state(): ConnectionState;
  subscribe(listener: (state: ConnectionState) => void): () => void;
  /** Starts dialing. Call it from a click: that also starts the modem sound when sound is on. */
  connect(options?: { failAt?: Phase }): boolean;
  /** Cancels an attempt in progress. */
  cancel(): boolean;
  /** Signs off: every transfer in flight is cancelled. */
  disconnect(): boolean;
  speed(): Speed;
  /** Saved in preferences; applies to transfers at once and to the next connection. */
  setSpeed(speed: Speed): void;
}

export interface Bookmark {
  address: string;
  title: string;
  addedAt: string;
}

/** capability: audio. Silent when the guest has sound turned off. */
export interface AudioApi {
  /** Speaks a short phrase with the browser's speech synthesis, if available. */
  speak(text: string): void;
}

/** capability: navigation */
export interface NavigationApi {
  load(raw: string, base: WebAddress | undefined, callbacks: PageLoadCallbacks): LoadResult;
  /** The release this tab has pinned. */
  world(): Promise<PinnedWorld>;
  /** Opens an address in a new Netscape window. */
  openInBrowser(address: string): void;
  bookmarks(): Bookmark[];
  addBookmark(address: string, title: string): boolean;
  removeBookmark(address: string): void;
  /** Clue ids found so far, mapped through the pinned release's retired clues. */
  discoveries(): ReadonlySet<string>;
  /** Records the clues on a page the guest has fully loaded; returns the newly found ones. */
  noticePage(pageId: string): string[];
  /** Forgets one chain's clues so it can be played again. */
  resetChain(chainId: string): void;
  /** Saves a completed chain's reward document to My Documents. */
  collectReward(chainId: string): Promise<{ ok: true; path: string; existed: boolean } | { ok: false; error: string }>;
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
  /** The guest's screen name (also their AOL screen name). */
  screenName(): string;
  /** Arguments the window was opened with, such as a file to open. */
  readonly args: LaunchArgs;
  /** capability: windows */
  setTitle?(title: string): void;
  /** Sizes the window's outer frame (capability: windows). */
  setSize?(width: number, height: number): void;
  messageBox?(options: MessageBoxOptions): Promise<ButtonChoice>;
  launch?(appId: string, args?: LaunchArgs): void;
  openFile?(path: string): void;
  chooseFile?(options: FileDialogOptions): Promise<string | null>;
  /** Called before the window closes; resolve false to keep it open. */
  setCloseGuard?(guard: (() => Promise<boolean>) | null): void;
  addRecent?(path: string): void;
  files?: FilesApi;
  storage?: StorageApi;
  settings?: SettingsApi;
  network?: NetworkApi;
  navigation?: NavigationApi;
  audio?: AudioApi;
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
