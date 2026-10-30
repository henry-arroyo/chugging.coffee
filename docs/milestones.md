# Milestones

| Milestone | Scope | Status |
|---|---|---|
| **M0** | References, rights, schemas, architecture and security design | **Complete (pending owner review)**: see below |
| M1 | Windows 95 desktop and window management | **Complete (pending owner review)** |
| M2 | Local applications and persistence | **Complete (pending owner review)** |
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

## M2 report (2026-10-30)

**Works**

- **Guest sign-on.** First run asks for a screen name only (3-16 letters, digits, single spaces;
  markup and control characters rejected). Names are unverified and local; renaming (Control Panel
  > Users) keeps everything.
- **Persistence** (`src/persistence/`):
  - **Storage:** IndexedDB with versioned schema upgrades plus data migrations. Every write is
    one transaction, and saves happen on each meaningful change (moves, files, settings,
    window positions).
  - **Untrusted data:** everything read back is validated against its contract, and games are
    re-checked for consistency. Invalid records are dropped with a notice.
  - **Failures:** storage that is denied, unavailable, full or failing falls back to a clearly
    labeled temporary session that keeps working. Data saved by a newer version is never
    overwritten.
  - **One saving tab:** only one tab saves at a time, using the Web Locks writer lock. A second
    tab is read-only, and "Use this tab" takes over. A freshly reloaded page waits up to 2 s for
    the lock.
  - **Export, import, reset:** export is a validated JSON file with no credential fields. Import
    is limited to 1 MiB, fully validated, and confirmed before it replaces anything. Reset asks
    twice.
  - **Reloads:** a full reload restores files, settings and games, but never reopens windows or
    dialogs.
- **Virtual C: drive** (`src/core/vfs/`):
  - **Paths:** Windows path rules; traversal, other drives, reserved names and bad characters
    are rejected.
  - **Protection:** seeded system files are protected by code-side metadata, never by stored
    flags.
  - **Limits:** 64 KiB per file and 5 MiB total (recycled files count until purged).
  - **Recycle Bin:** deleted items move to `C:\Recycled\Dn` with their original path, and
    restoring recreates missing folders.
  - **Copying:** copies are named "Copy of …" / "Copy (2) of …", as in Windows 95.
- **Programs:**
  - **My Computer and folder windows:** large icons or details, New Folder / New Text Document,
    inline rename (F2), Copy/Paste, Delete with confirmation, Backspace to go up.
  - **Windows Explorer:** a folder tree plus details.
  - **Recycle Bin:** restore, permanent delete with confirmation, and empty. The desktop icon
    shows full or empty.
  - **Notepad:** New, Open, Save and Save As through Open/Save As dialogs, Word Wrap, Time/Date
    (F5), the 64 KB limit, protected files steered to Save As, and an unsaved-changes prompt on
    close via a close guard.
  - **Image Viewer** for the wallpaper pictures.
  - **Find:** by name, `*`/`?` wildcards and contents.
  - **Documents menu:** recent files.
  - **Run:** opens C:\ paths.
  - **Control Panel applets,** each with OK, Cancel and Apply:
    - Display: pattern, wallpaper, six color schemes, desktop scale.
    - Sounds: on/off and volume. The setting is stored; audio itself arrives in M3.
    - Modems: connection speed, stored for M3.
    - Date/Time: 12- or 24-hour clock.
    - Accessibility: high contrast, larger text, reduced motion.
    - Users: rename.
    - Time Machine: storage status, export, import, reset.
  - **Solitaire (Klondike):**
    - **Rules:** draw one or three, legal moves only, unlimited stock recycling with no penalty,
      undo (up to 100 steps), win detection.
    - **Scoring:** exactly the handoff's (+10, +5, +5, −15, never below 0).
    - **Play:** click-to-select or drag, double-click to send home, and a full keyboard path with
      spoken announcements.
    - **Saving:** resumes after reload.
  - **Minesweeper:** Beginner, Intermediate and Expert; a safe first square with no no-guess
    guarantee; flood fill; flags and question marks; chording (middle click, both buttons,
    double-click, or C); keyboard and touch long-press marking; a timer that pauses while the tab
    is hidden; local best times; resume after reload; and the window sizing to fit each level.
- **Art:** three new stand-in wallpapers and seven applet icons, all registered as stand-ins. Card
  faces, backs and the Minesweeper face are original drawings.

**Tests actually run**

- `npm test`: 480 passed, including:
  - 48 virtual-drive tests: malicious paths, protection, quotas, copy naming, the Recycle Bin round
    trip, search, and untrusted loading.
  - 23 Klondike tests, including a 2,000-move random game that keeps all 52 cards, plus rejection
    of tampered saves.
  - 19 Minesweeper tests, including 200 safe first reveals across levels.
  - 28 persistence tests: hostile records, quota fallback, read-only tabs, newer data versions,
    export/import (oversized, non-JSON, smuggled fields, tampered games), reset, and IndexedDB
    upgrades.
- `npm run test:e2e`: 31/31 journeys in Chrome 156, and 93/93 over three repeats. New journeys:
  - **Sign-on and storage:** sign-on validation and reload behavior; export → reset → import;
    the read-only second tab and takeover; no-storage fallback.
  - **Files:** Notepad save, Documents, the unsaved-changes prompt and reload; protected-file
    Save As; Explorer create, rename, copy, delete and restore; the folder tree and image
    viewer; Find.
  - **Settings and games:** Control Panel Apply/Cancel and persistence; Minesweeper keyboard,
    marks, level sizes and resume; Solitaire draw, keyboard, undo and resume; remembered window
    positions.
- Typecheck clean. Build: initial bundle 113 KB gzipped JS plus 4.7 KB CSS, and the session with
  its validators loads as a separate 39 KB chunk during startup.
- Fifteen screenshots in `tests/visual/pending/` await human review.

**Bugs found and fixed while testing**

- A reloaded tab often opened read-only because the old page still held the writer lock. It now
  waits briefly.
- React StrictMode opened the session twice in development. The session now opens once per page.
- Game moves and window positions were batched, so a quick reload could lose the last change.
  These writes are now immediate.
- Keyboard focus dropped to the page after an inline rename. It now returns to the item.
- The memory fallback crashed on a stored file record without a path.

**Not done / not verified**

- No sounds play yet (settings only). AOL and Netscape are M3; the seven-site world is M4.
- Only Chromium was tested. Cross-browser, mobile and screen-reader passes are M5. The
  45-minute session for leaks is M5.
- The crash boundary still has no automated test.

**Next step:** M3: the AOL client and connection state machine, the shared FIFO transfer
scheduler, and Netscape.

## M2 follow-up (2026-10-30)

- **Logon (owner request, D27):** a Windows 95-style "Welcome to Windows" logon at every start,
  on an empty desktop. The user name is the screen name (also the AOL screen name in M3). The
  password field is a fixed, uneditable mask, and Cancel logs on as the last user. Shut Down
  gains "log on as a different user".
- **Fixed:** the "Start again" button on the turn-off screen was cut off, because it inherited
  the screen's large text.
- **Tests:** 480 unit; 32/32 journeys, 96/96 over three repeats. The visual captures were
  regenerated, including `00-logon.png`.

## Logos (2026-10-30)

- **Permission:** the owner reports verbal approval from Microsoft, AOL and the Netscape brand
  owner to use their brand likeness while the service is free (D29). The approval and its
  no-charge condition are recorded as evidence; written confirmation is still recommended.
- **Logos drawn:** project-drawn SVG versions of the Windows flag (Start button, startup
  splash), the AOL triangle and the Netscape "N" replace those three stand-ins. Public reference
  renders were viewed locally and not copied into the repository.
- **Text marks:** the Start menu banner reads "Windows 95", and the startup screen is a Windows
  95-style splash (sky, logo, wordmark, color bar; the bar stays still with reduced motion).
- **Checks:** 480 unit; 32/32 journeys; the public asset gate passes, with 41 stand-ins remaining
  (system icons, wallpapers).
