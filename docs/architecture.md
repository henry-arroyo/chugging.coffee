# Architecture

Status: **M2 built** (shell, window manager, persistence, virtual drive, local programs and
games). AOL, Netscape and the world content are planned (M3-M4).

## Shape of the system

```text
Browser tab  https://<host>/time-machine/
├── Host page (src/host)          fit/zoom/pan, accessibility controls, app list, error boundary
│   └── Virtual desktop 800×600 (src/shell)
│       ├── Window manager        pure state machine: focus, z-order, geometry, modals, taskbar
│       ├── Start menu, taskbar, tray, desktop icons
│       └── Applications (src/apps)   bundled, reviewed modules with scoped capabilities
│             Control Panel · Explorer/My Computer/Recycle Bin · Notepad · Clock
│             Solitaire · Minesweeper · AOL · Netscape
├── Core services (src/core)      no React, unit-tested in Node
│   ├── contracts/   schemas → precompiled validators + TypeScript types
│   ├── identity/    screen-name rules
│   ├── windows/     window manager reducer, geometry, outline drag/resize math   [M1]
│   ├── menu.ts      menu keyboard navigation and access keys                     [M1]
│   ├── run.ts       Start > Run parsing (aliases and C:\ paths only)              [M1]
│   ├── events.ts    typed host event bus                                         [M1]
│   ├── connection/  AOL handshake state machine (generation IDs)        [M3]
│   ├── transfer/    shared FIFO byte scheduler on an injectable clock   [M3]
│   ├── urls/        virtual address parsing and resolution              [M3]
│   ├── vfs/         virtual C: drive, protection, quotas, Recycle Bin   [M2]
│   └── games/       Klondike and Minesweeper rules, seeded RNG          [M2]
├── Persistence (src/persistence) Session, IndexedDB/memory backends, migrations,
│                                  export/import, Web Locks single writer                [M2]
└── World content (src/content)   StaticWorldRepository reading released JSON           [M3/M4]

Static hosting: CloudFront → private S3 (OAC). No backend in v1.
```

## Boundaries that must stay independent

| Module | Inputs | Outputs | Tested with |
|---|---|---|---|
| Window manager | actions (open, focus, drag, resize, minimize, ...) and work area | next state | Vitest, no DOM |
| Connection | user intents, clock | states with a generation number | fake clock |
| Transfer scheduler | requests (declared bytes, chunks), speed, clock | progressive chunk reveals, cancellations | fake clock |
| URL resolver | raw address text, release index | resolved page, redirect or fictional error | table tests |
| VFS | operations, trusted seed metadata | new tree or a typed error | table and fuzz tests |
| Games | moves, seeded RNG | new state, score, win/loss | rule and conservation tests |

The React layer subscribes to these modules; it holds no rules of its own.

## Contracts

All untrusted data (world content fetched from the CDN, IndexedDB records, imported save files,
host events) passes a schema validator before use. Schemas in [`schemas/`](../schemas) are
authoritative; `npm run contracts:build` compiles them into
`src/core/contracts/generated/validators.js`, plain ESM with no `eval` and no runtime dependency on
ajv, so the page's CSP can forbid `unsafe-eval`. A test fails when the generated file is stale.

The validators are about 55 KB gzipped. They will be **loaded lazily** (on first content fetch or
import), not in the initial shell bundle, to keep the shell under the 1 MiB budget with room to spare.

Contracts: world release, site manifest, page document (with transfer chunks), widget, asset
rights, profile and preferences, window geometry, virtual file, game snapshot, application
manifest, host event, and save export.

## World content and persistence of canon

- A **release** (`world/rel-NNNN/release.json`) is immutable once published and lists its
  sites, manifests (with SHA-256), redirects, retired clues, clue chains, AOL keywords and world
  updates, plus its fictional story date.
- `world/current.json` (short cache) points at the current release. A tab loads it once and
  **pins** that release for the session. If a newer release appears, the tab offers a restart; it
  never swaps content underneath the user.
- **Rollback** means repointing `current.json` at an earlier release listed in `rollbackSafeTo`.
  Releases are never edited in place.
- Personal progress (discoveries, bookmarks) is keyed by stable IDs plus the release it happened
  in, so it survives new releases. Retired clues map through `retiredClues`.
- `StaticWorldRepository` is the only reader of world content. `SharedWorldGateway` is a declared
  interface only. A future backend (BBS, mail, chat) would implement it after its own security
  and cost review.

## Pages

Pages are JSON documents of safe blocks: heading, paragraph (text, links, line breaks), link,
image, list, rule, table, preformatted text (with an accessible label) and registered widgets.
There is no field that can hold HTML, script, styles beyond a fixed colour and font palette, event
handlers or frames. Links may only point to `http://<name>.test/...`, `aol://keyword/...`,
same-site paths or same-page anchors. *Preformatted* is a small, text-only addition to the
handoff's block list, for BBS and ASCII art.

## Simulation timing

One FIFO scheduler shared by AOL and Netscape. Goodput is 2,880 B/s normally and 11,520 B/s fast,
with 600 ms / 150 ms setup latency. Content is revealed only once both the real fetch and the
virtual transfer have finished. Timing uses declared bytes, not HTTP sizes. The clock is injected
so tests are deterministic; hidden documents freeze the simulation.

## Routing

Everything lives under `/time-machine/`. A CloudFront Function redirects `/time-machine` to
`/time-machine/`, serves `index.html` for `/time-machine/` and `/time-machine/open/...` deep links
only, and passes all other paths straight through. A missing asset is a 404, never a copy of the
shell. Requests outside `/time-machine/` are answered 404 by this distribution, which never claims
other routes.

## Infrastructure

See [security-design.md](security-design.md) and [runbooks.md](runbooks.md). In short: CDK v2
(TypeScript), one app synthesized per environment, separate bootstrap qualifiers `ctmprod` and
`ctmtest`, a site stack of exactly six resource types, and an optional production certificate
stack with its own lifecycle.
