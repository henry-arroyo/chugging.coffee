# Milestones

| Milestone | Scope | Status |
|---|---|---|
| **M0** | References, rights, schemas, architecture and security design | **Complete (pending owner review)**: see below |
| M1 | Windows 95 desktop and window management | **Complete (pending owner review)** |
| M2 | Local applications and persistence | Not started |
| M3 | AOL, connection scheduler, Netscape | Not started |
| M4 | Seven-site world and clue chain | Not started |
| M5 | Accessibility, security, performance, browser QA, deployment-ready package | Not started |

## M0 report (2026-10-29)

**Works**

- Repository with pinned toolchain and lockfile. The Vite production build runs end to end
  (placeholder page only: 69 KB gzipped).
- 13 JSON Schemas covering every contract in handoff §10, plus save export. Compiled to
  standalone validators with no eval, and a stale-output check.
- Screen-name normalization per §5.
- Asset-rights registry, schema and build gate. Public builds reject pending, blocked,
  reference-only, expired, unevidenced and unregistered files.
- CDK v2 app: test and prod site stacks (private S3 + CloudFront OAC, security headers, narrow
  `/time-machine/` router), optional prod certificate stack, guarded `infra:*` commands.
- Owner-controlled foundation template (boundary and operator roles) and restricted bootstrap
  template, both passing cfn-lint 1.59.0.
- Documents: architecture, decisions, historical references, asset rights, security design,
  profile setup, runbooks, cost worksheet, open questions.

**Tests actually run**

- `npm test`: 240 passed (contracts with 59 targeted invalid cases, screen names, asset gate,
  site stacks, router function, policy invariants, argument/preflight/config guards, template
  validation).
- `npm run typecheck`: clean. `npm run build`: passes. `npm run infra:check`: passes for both
  environments. `cfn-lint` on all three templates: no findings.

**Not done / not verified**

- No AWS calls of any kind; IAM policies are verified only statically (tests and cfn-lint), not with
  Access Analyzer or a real deploy.
- No UI beyond a placeholder. No browser tests yet (Playwright installed; browsers not downloaded).
- Historical builds for AOL and Netscape are not fully resolved (dates to source).
- The publish step (`infra:publish`) is designed but not written (M5).

**Risks**

- Authentic branding very likely can't be cleared (decision 1).
- Root-path routing on `chugging.coffee` is unknown (decision 2).
- The first real deploy may show missing read permissions for CloudFormation's handlers; each
  becomes an expansion proposal.

**Next step:** M1, the window manager state machine and Windows 95 shell, after owner review of M0.

## M0 follow-up (2026-10-30)

Owner decisions recorded (open-questions.md): authentic skin (rights-gated), production on the
chugging.coffee apex, account 196691452297, AOL 2.5, Netscape 2.0 beta.

- Config confirmed for both environments; prod `domainName: chugging.coffee`. The certificate
  stack can deploy before the site attaches the alias.
- Foundation trusts one exact IAM user or role (parameter `TrustedPrincipalArn`).
- `npm run access:setup` (`--plan` / `--apply`) bootstraps from the owner's `aws login` session,
  with CloudFormation validation and blocking Access Analyzer checks first.
- `infra:*` now uses exported short-lived operator credentials (luna.is pattern).
- Applied with the owner's session: `ctm-foundation`, `CDKToolkit-ctmtest`, `CDKToolkit-ctmprod`
  (termination protection on; prod ACM limited to chugging.coffee). Access Analyzer: zero findings.
- Found that the CDK CLI can't meet the deploy role's resource-type condition; `infra:*` now drives
  change sets directly (D15). A live test preview change set succeeded and was cleaned up.
- `npm run access:verify`: 49/49 live allow/deny checks as designed.
- No site stack deployed; no DNS changed.

## M1 report (2026-10-30)

**Works**

- **Window manager** (`src/core/windows/`): a pure reducer covering focus and stacking; owner
  groups; owned modal dialogs that block only their owner and hand focus back on close;
  minimize, maximize and restore (including back to maximized); taskbar activate, minimize and
  restore; cascading; minimum sizes; reachable title bars; desktop resize (800×600 to 640×480);
  and Ctrl+F6 cycling.
- **Outline dragging and resizing from all eight edges**, as in Windows 95, using pointer
  capture. A lost capture keeps the outline's position; Escape or the browser losing focus
  abandons the drag. Move and Size also work from the keyboard via the window menu
  (Alt+Space / Alt+Hyphen).
- **Shell:**
  - Desktop icons: click, double-click, arrow keys, Enter.
  - Taskbar with Start, task buttons, and a tray (connection status, sound toggle, clock that
    resyncs after the tab sleeps).
  - Cascading Start menu (Programs from manifests, Documents, Settings, Find, Help, Run, Shut
    Down) with access keys, hover delay and edge flipping.
  - Run (aliases; C:\ paths answer that the file system arrives in M2), Shut Down (shut down or
    restart the simulation only), message boxes.
  - App crash boundary per window.
- **Programs that work now:** Clock (analog or digital, seconds option), Help topics, and Taskbar
  Properties (Show Clock, small Start-menu icons; OK, Cancel and Apply). Programs scheduled for
  M2 and M3 open a window that says so.
- **Host page:** Fit, 100% and zoom steps, scroll to pan when zoomed, 800×600 / 640×480 switch,
  and a Programs list. Choices persist per viewer, and it works without storage.
- **Art:** 33 original stand-in icons, each registered as `standIn` (authentic slots per D12).
  The Start banner is a stand-in wordmark. No Microsoft fonts or art are shipped; the font
  stack uses locally installed fonts.

**Tests actually run**

- `npm test`: 351 passed, including 45 window-manager, 13 drag/keyboard-geometry, and 32
  manifest/Programs/Run/menu-navigation tests.
- `npm run test:e2e`: 18/18 journeys in Chrome for Testing 156; 54/54 over three repeats. They
  cover mouse and keyboard Start menu, single-instance refocus, outline move and resize, zoomed
  pointer conversion, interrupted drag, maximize within the work area, taskbar
  minimize/restore, modal blocking and focus return, Run, keyboard Move, Ctrl+F6, desktop icon
  keyboard, Taskbar Properties Apply/Cancel/OK, 640×480 reachability, shut down and start
  again, and the host Programs list.
- Typecheck clean; build passes (initial bundle 87 KB JS + 3.4 KB CSS gzipped); public asset
  gate passes with 33 stand-ins listed.
- Nine screenshots in `tests/visual/pending/` await human review.

**Not done / not verified**

- My Computer, Explorer, Recycle Bin, Control Panel, Notepad, Find, Documents and the games
  are M2. AOL and Netscape are M3.
- Window geometry is not persisted yet (M2 persistence).
- Only Chromium was tested; other browsers are M5. The crash boundary has no automated test yet.
- Host-captured shortcuts (Alt+Tab, Alt+F4, Windows key) have documented alternatives rather
  than reproductions.

**Next step:** M2: identity and IndexedDB persistence, the virtual C: drive with Explorer, My
Computer and Recycle Bin, Notepad, Control Panel, Find and Documents, then Solitaire and
Minesweeper.
