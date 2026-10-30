/**
 * TypeScript shapes of the JSON Schemas in /schemas. The schemas are authoritative:
 * data becomes one of these types only after validateContract() accepts it.
 * Keep the two in step; tests/unit/contracts.test.ts exercises every schema with fixtures.
 */

export type Id = string;
export type AssetId = string;
export type ReleaseId = string;
/** ISO 8601 date-time. */
export type DateTime = string;
/** Fictional in-world date, YYYY-MM-DD in 1995 or 1996. */
export type StoryDate = string;
/** http://<host>.test/<path>[#anchor] */
export type VirtualAddress = string;
/** Virtual address, aol://keyword/<word>, same-site path or #anchor. */
export type LinkTarget = string;
/** C:\... on the virtual drive. */
export type VfsPath = string;
/** Rank then suit, e.g. "AS", "10H". */
export type Card = string;

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------- World releases

export interface WorldRelease {
  schemaVersion: 1;
  releaseId: ReleaseId;
  sequence: number;
  storyDate: StoryDate;
  title: string;
  publishedAt: DateTime;
  previousReleaseId: ReleaseId | null;
  compatibility: { minClientVersion: string; rollbackSafeTo: ReleaseId[] };
  sites: { siteId: Id; host: string; manifest: string; sha256: string }[];
  redirects: { from: VirtualAddress; to: VirtualAddress; sinceReleaseId: ReleaseId }[];
  retiredClues: { clueId: Id; retiredInReleaseId: ReleaseId; replacedBy: Id | null }[];
  clueChains: ClueChain[];
  aolKeywords: { keyword: string; target: VirtualAddress | `aol-area:${string}` }[];
  updates: { storyDate: StoryDate; headline: string; address: VirtualAddress }[];
  notes?: string;
}

export interface ClueChain {
  chainId: Id;
  title: string;
  steps: { clueId: Id; pageId: Id; blockId: Id; hints: string[] }[];
  reward: { documentId: Id; vfsPath: VfsPath; title: string; text: string };
}

export interface SiteManifest {
  schemaVersion: 1;
  siteId: Id;
  host: string;
  title: string;
  homePath: string;
  sinceReleaseId: ReleaseId;
  pages: { pageId: Id; path: string; aliases?: string[]; document: string }[];
}

// ---------------------------------------------------------------- Pages

export type Mark = 'bold' | 'italic' | 'underline' | 'code';
export type Align = 'left' | 'center' | 'right';

export type Inline =
  | { type: 'text'; text: string; marks?: Mark[] }
  | { type: 'link'; href: LinkTarget; text: string; marks?: Mark[] }
  | { type: 'break' };

export interface TableCell {
  content: Inline[];
  colspan?: number;
  align?: Align;
}

export type Block =
  | { type: 'heading'; id?: Id; level: 1 | 2 | 3 | 4; text: string; align?: Align }
  | { type: 'paragraph'; id?: Id; content: Inline[]; align?: Align }
  | { type: 'link'; id?: Id; href: LinkTarget; text: string; description?: string }
  | {
      type: 'image';
      id?: Id;
      assetId: AssetId;
      alt: string;
      width: number;
      height: number;
      declaredBytes: number;
      align?: Align;
      href?: LinkTarget;
    }
  | { type: 'list'; id?: Id; ordered: boolean; items: Inline[][] }
  | { type: 'rule'; id?: Id }
  | { type: 'table'; id?: Id; caption?: string; border?: number; header?: TableCell[]; rows: TableCell[][] }
  | { type: 'preformatted'; id?: Id; text: string; label?: string }
  | { type: 'widget'; id?: Id; widget: Widget };

export interface TransferChunk {
  index: number;
  kind: 'text' | 'image';
  blockIds: Id[];
  declaredBytes: number;
}

export interface PageDocument {
  schemaVersion: 1;
  pageId: Id;
  siteId: Id;
  path: string;
  title: string;
  layout: 'plain' | 'centered' | 'sidebar' | 'newspaper' | 'catalog' | 'terminal' | 'homepage' | 'academic';
  theme?: {
    background?: string;
    backgroundAssetId?: AssetId;
    text?: string;
    link?: string;
    visitedLink?: string;
    font?: 'serif' | 'sans' | 'mono';
  };
  meta?: { lastModified?: StoryDate; author?: string };
  blocks: Block[];
  transfer?: { chunks: TransferChunk[] };
}

export type Widget =
  | { name: 'hit-counter'; props: { count: number; digits: number } }
  | { name: 'brew-calculator'; props: { defaultCups: number; gramsPerCup: number } }
  | { name: 'download-time-calculator'; props: { speedsBps: number[] } }
  | { name: 'directory-search'; props: { scope: 'all-sites' | 'release-updates' } }
  | { name: 'guestbook-archive'; props: { entries: { name: string; storyDate: StoryDate; message: string }[] } }
  | { name: 'clue-logbook'; props: { chainId: Id } };

// ---------------------------------------------------------------- Asset rights

export type AssetStatus = 'approved' | 'pending' | 'blocked' | 'reference-only';
export type AssetUse = 'public-build' | 'development' | 'documentation';

export interface AssetRecord {
  assetId: AssetId;
  file: string;
  kind: 'image' | 'icon' | 'font' | 'sound' | 'cursor' | 'data';
  origin: 'project-original' | 'third-party' | 'historical';
  source: string;
  creator: string;
  license: string;
  attribution: string;
  permissionEvidence: string;
  allowedUse: AssetUse[];
  status: AssetStatus;
  standIn: boolean;
  expires: string | null;
  notes?: string;
}

export interface AssetRegistry {
  schemaVersion: 1;
  assets: AssetRecord[];
}

// ---------------------------------------------------------------- Personal data

export interface Preferences {
  desktop: {
    colorScheme: 'standard' | 'slate' | 'spruce' | 'brick' | 'high-contrast-black' | 'high-contrast-white';
    wallpaper: AssetId | null;
    pattern: 'bricks' | 'weave' | 'diamonds' | 'dots' | 'scales' | null;
    scale: 1 | 1.25 | 1.5 | 2;
  };
  sound: { enabled: boolean; volume: number };
  connection: { speed: 'normal' | 'fast' };
  accessibility: { reducedMotion: boolean; highContrast: boolean; largerText: boolean };
  clock: { format: '12h' | '24h' };
  solitaire: { drawCount: 1 | 3 };
  minesweeper: { level: MinesweeperLevel };
}

export interface Profile {
  schemaVersion: 1;
  screenName: string;
  createdAt: DateTime;
  updatedAt: DateTime;
  preferences: Preferences;
}

export type WindowState = 'normal' | 'maximized' | 'minimized';

export interface WindowGeometry {
  schemaVersion: 1;
  desktop: { width: number; height: number };
  windows: Record<Id, { normal: Geometry; state: WindowState }>;
}

export interface VirtualFile {
  path: VfsPath;
  kind: 'folder' | 'text' | 'image' | 'shortcut';
  origin: 'user' | 'collected';
  createdAt: DateTime;
  modifiedAt: DateTime;
  text?: string;
  assetId?: AssetId;
  /** `app:<appId>` or a VFS path. */
  target?: string;
  sourceDocumentId?: Id;
  deleted?: { originalPath: VfsPath; deletedAt: DateTime };
}

// ---------------------------------------------------------------- Games

export interface KlondikeState {
  stock: Card[];
  waste: Card[];
  foundations: [Card[], Card[], Card[], Card[]];
  tableau: { faceDown: Card[]; faceUp: Card[] }[];
  score: number;
  stockPasses: number;
}

export interface KlondikeSnapshot {
  game: 'klondike';
  schemaVersion: 1;
  drawCount: 1 | 3;
  seed: number;
  state: KlondikeState;
  undo: KlondikeState[];
  moves: number;
  elapsedMs: number;
  status: 'playing' | 'won';
}

export type MinesweeperLevel = 'beginner' | 'intermediate' | 'expert';

export interface MinesweeperSnapshot {
  game: 'minesweeper';
  schemaVersion: 1;
  level: MinesweeperLevel;
  width: 9 | 16 | 30;
  height: 9 | 16;
  mines: 10 | 40 | 99;
  mineCells: number[];
  revealed: number[];
  flagged: number[];
  questioned: number[];
  elapsedMs: number;
  status: 'ready' | 'playing' | 'won' | 'lost';
}

export type GameSnapshot = KlondikeSnapshot | MinesweeperSnapshot;

// ---------------------------------------------------------------- Applications and events

export type Capability =
  | 'windows'
  | 'storage'
  | 'vfs-read'
  | 'vfs-write'
  | 'navigation'
  | 'network'
  | 'audio'
  | 'settings';

export interface AppManifest {
  schemaVersion: 1;
  appId: Id;
  title: string;
  icon: AssetId;
  module: Id;
  capabilities: Capability[];
  instancing: 'single' | 'multiple';
  window: {
    defaultWidth: number;
    defaultHeight: number;
    minWidth: number;
    minHeight: number;
    resizable: boolean;
    maximizable: boolean;
  };
  startMenu?: { folders: string[]; order: number };
  desktopIcon?: boolean;
  runAliases?: string[];
  opensKinds?: ('text' | 'image')[];
}

export type ConnectionState =
  | 'offline'
  | 'initializing'
  | 'dialing'
  | 'negotiating'
  | 'authenticating'
  | 'online'
  | 'disconnecting';

export type HostEvent =
  | { type: 'app.launch'; appId: Id; path?: VfsPath; address?: LinkTarget }
  | {
      type: 'window.focused' | 'window.closed' | 'window.minimized' | 'window.restored' | 'window.maximized';
      windowId: string;
    }
  | { type: 'net.state'; state: ConnectionState; generation: number; error?: string }
  | {
      type: 'net.transfer';
      requestId: string;
      phase: 'queued' | 'latency' | 'progress' | 'complete' | 'cancelled' | 'failed';
      bytesDone: number;
      bytesTotal: number;
    }
  | { type: 'nav.request'; address: string; source: 'netscape' | 'aol' }
  | { type: 'vfs.changed'; paths: VfsPath[] }
  | {
      type: 'storage.status';
      mode: 'persistent' | 'temporary' | 'read-only-other-tab';
      reason?: 'denied' | 'quota' | 'corrupt' | 'unavailable' | 'other-tab';
    }
  | { type: 'release.available'; releaseId: ReleaseId }
  | { type: 'discovery.recorded'; clueId: Id; releaseId: ReleaseId }
  | { type: 'audio.play'; soundId: AssetId }
  | { type: 'settings.applied'; keys: (keyof Preferences)[] }
  | { type: 'app.crashed'; appId: Id; message: string };

// ---------------------------------------------------------------- Export / import

export interface BestTime {
  seconds: number;
  name: string;
  at: DateTime;
}

export interface SaveExport {
  format: 'chugging-time-machine-save';
  schemaVersion: 1;
  exportedAt: DateTime;
  profile: Profile;
  bookmarks: { address: VirtualAddress; title: string; addedAt: DateTime }[];
  discoveries: { clueId: Id; releaseId: ReleaseId; at: DateTime }[];
  files: VirtualFile[];
  windows: WindowGeometry;
  games: { klondike?: KlondikeSnapshot; minesweeper?: MinesweeperSnapshot };
  bestTimes: Partial<Record<MinesweeperLevel, BestTime>>;
  recentDocuments: VfsPath[];
}

/** Largest save file accepted for import, checked before parsing. */
export const SAVE_EXPORT_MAX_BYTES = 1024 * 1024;
