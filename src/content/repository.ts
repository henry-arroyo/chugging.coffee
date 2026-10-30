/**
 * StaticWorldRepository is the only reader of world content. It reads `world/current.json` once,
 * pins that release for the life of the tab, checks each site manifest against the SHA-256 listed in
 * the release, and validates every document before anything renders it.
 */
import type { PageDocument, SiteManifest, WorldRelease } from '../core/contracts/types';
import { resolve, type Resolution, type SiteIndex, type WebAddress } from '../core/net/address';
import { buildSiteIndex } from './site-index';

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class WorldError extends Error {
  constructor(
    readonly reason: 'network' | 'invalid' | 'integrity',
    message: string,
  ) {
    super(message);
  }
}

export interface PinnedWorld {
  release: WorldRelease;
  index: SiteIndex;
  manifests: ReadonlyMap<string, SiteManifest>;
}

/** Future shared services (BBS, mail, chat). Declared only; nothing implements it in v1. */
export interface SharedWorldGateway {
  readonly available: false;
}

const MAX_BYTES = 512 * 1024;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class StaticWorldRepository {
  private pinned: Promise<PinnedWorld> | null = null;
  private readonly pages = new Map<string, Promise<PageDocument>>();

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = (url) => fetch(url, { credentials: 'omit', cache: 'no-cache' }),
  ) {}

  private async text(path: string): Promise<string> {
    let res;
    try {
      res = await this.fetcher(`${this.baseUrl}${path}`);
    } catch {
      throw new WorldError('network', `Could not load ${path}`);
    }
    if (!res.ok) throw new WorldError('network', `${path}: HTTP ${res.status}`);
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new WorldError('invalid', `${path} is too large`);
    return body;
  }

  private async json(path: string): Promise<unknown> {
    const body = await this.text(path);
    try {
      return JSON.parse(body);
    } catch {
      throw new WorldError('invalid', `${path} is not JSON`);
    }
  }

  private async validate<N extends 'world-release' | 'site-manifest' | 'page-document'>(name: N, data: unknown, where: string) {
    const { validateContract } = await import('../core/contracts/validate');
    const result = validateContract(name, data);
    if (!result.ok) throw new WorldError('invalid', `${where}: ${result.errors.join('; ')}`);
    return result.value;
  }

  private async currentId(): Promise<string> {
    const current = (await this.json('current.json')) as { releaseId?: unknown };
    if (typeof current?.releaseId !== 'string' || !/^rel-[0-9]{4}$/.test(current.releaseId)) throw new WorldError('invalid', 'current.json has no release id');
    return current.releaseId;
  }

  private async load(): Promise<PinnedWorld> {
    const id = await this.currentId();
    const release = await this.validate('world-release', await this.json(`${id}/release.json`), `${id}/release.json`);
    if (release.releaseId !== id) throw new WorldError('invalid', `${id}/release.json names ${release.releaseId}`);
    const manifests = new Map<string, SiteManifest>();
    await Promise.all(
      release.sites.map(async (site) => {
        const path = `${id}/${site.manifest}`;
        const body = await this.text(path);
        if ((await sha256Hex(body)) !== site.sha256) throw new WorldError('integrity', `${path} does not match the release checksum`);
        let data: unknown;
        try {
          data = JSON.parse(body);
        } catch {
          throw new WorldError('invalid', `${path} is not JSON`);
        }
        const manifest = await this.validate('site-manifest', data, path);
        if (manifest.siteId !== site.siteId || manifest.host !== site.host) throw new WorldError('integrity', `${path} does not match the release`);
        manifests.set(manifest.siteId, manifest);
      }),
    );
    return { release, manifests, index: buildSiteIndex(release, manifests.values()) };
  }

  /** The pinned release. The first call fetches it; a failed load can be retried. */
  world(): Promise<PinnedWorld> {
    if (!this.pinned) {
      this.pinned = this.load();
      this.pinned.catch(() => {
        this.pinned = null;
      });
    }
    return this.pinned;
  }

  async resolve(address: WebAddress): Promise<Resolution> {
    return resolve(address, (await this.world()).index);
  }

  /** Loads and validates a page document of the pinned release (cached per tab). */
  page(siteId: string, document: string): Promise<PageDocument> {
    const key = `${siteId}/${document}`;
    let pending = this.pages.get(key);
    if (!pending) {
      pending = (async () => {
        const { release, manifests } = await this.world();
        const manifest = manifests.get(siteId);
        const entry = manifest?.pages.find((p) => p.document === document);
        if (!manifest || !entry) throw new WorldError('invalid', `${key} is not in ${release.releaseId}`);
        const path = `${release.releaseId}/sites/${siteId}/${document}`;
        const doc = await this.validate('page-document', await this.json(path), path);
        if (doc.siteId !== siteId || doc.pageId !== entry.pageId) throw new WorldError('integrity', `${path} does not match its manifest`);
        return doc;
      })();
      pending.catch(() => this.pages.delete(key));
      this.pages.set(key, pending);
    }
    return pending;
  }

  /** Returns a newer release id if `current.json` has moved on; the pinned release never changes. */
  async checkForUpdate(): Promise<string | null> {
    const pinned = await this.world();
    const id = await this.currentId();
    return id !== pinned.release.releaseId ? id : null;
  }
}
