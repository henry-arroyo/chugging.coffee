import type { SiteManifest, WorldRelease } from '../core/contracts/types';
import type { SiteIndex } from '../core/net/address';

/** Builds the resolver's index from a release and its site manifests (same code at build time and in the browser). */
export function buildSiteIndex(release: Pick<WorldRelease, 'redirects'>, manifests: Iterable<SiteManifest>): SiteIndex {
  return {
    sites: new Map(
      [...manifests].map((m) => [
        m.host,
        {
          siteId: m.siteId,
          pages: new Map(m.pages.flatMap((p) => [p.path, ...(p.aliases ?? [])].map((path) => [path, { pageId: p.pageId, document: p.document }] as const))),
        },
      ]),
    ),
    redirects: new Map(release.redirects.map((r) => [r.from, r.to])),
  };
}
