# Milestones

| Milestone | Scope | Status |
|---|---|---|
| **M0** | References, rights, schemas, architecture and security design | **Complete (pending owner review)**: see below |
| M1 | Windows 95 desktop and window management | **Complete (pending owner review)** |
| M2 | Local applications and persistence | **Complete (pending owner review)** |
| M3 | AOL, connection scheduler, Netscape | **Complete (pending owner review)** |
| M4 | Seven-site world and clue chain | **Complete (pending owner review)** |
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

## M3 report (2026-10-30)

**Works**

- **World content pipeline** (`content/`, `scripts/world/`, `src/content/`):
  - **Seed release:** `rel-0001` ("First of December", story date 1995-12-01) has three of the
    seven sites (Switchboard, Chugging Coffee House, The Packet) and six pages. It also has a
    redirect (`menu.htm` → `menu.html`), ten AOL keywords and three news updates. M4 completes
    the seven sites.
  - **Build-time checks** (`npm run content:check`, also part of `npm run build`):
    - Every release, manifest and page is validated against its contract.
    - Each page must match its manifest entry.
    - Every link must resolve inside the release, using the same resolver the browser uses, and
      every same-page anchor must exist.
    - Every keyword target must exist, and every image must be a registered, usable asset.
    - Manifests are hashed (SHA-256) into the release.
  - **Serving:** a Vite plugin serves `/time-machine/world/` in development and emits it into
    the build (`dist/time-machine/world/`).
  - **`StaticWorldRepository`** is the only reader of world content:
    - It reads `current.json` once and pins that release for the tab.
    - It checks each manifest against the release checksum and validates every document before
      rendering. Validators still load lazily.
    - It caches pages, can retry after a failed first load, and reports a newer release without
      swapping the pinned one.
    - `SharedWorldGateway` is declared only.
- **One shared network** (`src/content/network.ts`, built on the M3 core modules in
  `src/core/net/`):
  - **Connection:** the dial-up state machine with generation IDs. Normal timing is
    1 / 3 / 8 / 2 s; fast mode is a quarter of that.
  - **Transfers:** one FIFO scheduler shared by AOL and Netscape, at 2,880 or 11,520 B/s with
    600 or 150 ms setup.
    - A chunk is revealed only when its virtual bytes have arrived and its image has actually
      loaded.
    - Signing off cancels every transfer in flight; a hidden tab freezes everything.
  - **Tray:** the connection icon lights while dialing or online and names the state. Clicking it
    opens AOL.
  - **Modem sound:** synthesized with Web Audio, with no recordings. It has a dial tone, touch-tone
    digits for a fictional 555 number, ringing, and the answer tone and handshake noise.
    - It starts only from the SIGN ON click, only when sound is on, and at the saved volume.
    - It follows the phases and stops on cancel, failure or connect.
- **Safe page renderer** (`src/content/render/`):
  - **Blocks:** the eight layouts, the validated colour and font palette, and visited-link
    colours.
  - **Images:** sized placeholders while an image is on its way, as Netscape drew them.
  - **Widgets:** hit counter, brew calculator, download-time calculator, directory search,
    guestbook archive and clue logbook.
  - **Links** never carry a real `href`. There is no HTML, no script and no frame anywhere.
- **Netscape Navigator 2.0b3** (the English beta current on the 1 December story date; D31):
  - **Controls:** menus (File, View, Go, Bookmarks, Options, Directory, Help); a text toolbar
    (Back, Forward, Home, Reload, Open, Print, Stop); Location / "Go to:"; directory buttons.
  - **Throbber:** the N logo with meteors while loading (still with reduced motion).
  - **Status bar:** "Looking up host", "Contacting host", "Received 3.0K of 8.1K", "Done", and
    link targets on hover, plus a progress bar.
  - **Pages:** Back/Forward history and the Go menu; same-page anchors scroll without a transfer;
    a bare `chugging.test` gets `http://` added.
  - **Bookmarks:** saved in the profile and included in exports.
  - **Errors:**
    - **Not connected:** a 1995-style alert.
    - **Unknown host:** "unable to locate the server ... does not have a DNS entry".
    - **Missing page:** the server's 404 page.
    - **Real Internet:** "only visit the 1995 Web".
    - **AOL keyword in Netscape:** points back to AOL.
  - **Connection:** nothing loads offline. A page already on screen stays after sign-off, and
    closing Netscape does not disconnect. There are no tabs.
- **America Online 2.5** with Windows 3.1-style controls (open question 9's default):
  - **Sign-on:** the screen name is the logon user. The password is the fixed mask. There are
    SETUP, SIGN ON and HELP, plus toggles for connection sounds and fast connection (shared with
    Control Panel). Four connection steps show with Cancel. Errors return to sign-on, and signing
    off shows "Goodbye from America Online!".
  - **Online:**
    - **Navigation:** a Flashbar (Read Mail, Main Menu, News, People, Internet, Keyword, Sign
      Off).
    - **Welcome:** "You have mail!", the story date and the release's headlines, which open in
      Netscape.
    - **Main Menu:** departments.
    - **Keywords:** go to an AOL area or open Netscape. Unknown keywords get a 1995-style notice.
    - **News:** the release's updates.
    - **Mail:** seeded, fictional and per-name; read state lasts for the window. Compose explains
      that it is not available.
    - **People Connection:** a scripted Lobby, labeled as scripted on screen.
    - **Games:** launches Solitaire and Minesweeper.
    - **Internet Connection:** the Web plus a directory of the release's sites.
  - **Sign Off and close:** both ask first, then disconnect. Minimizing keeps the connection.
    Logging off or shutting down Windows drops the line.

**Tests actually run**

- `npm test`: 564 passed (84 new for M3), including:
  - **Addresses:** the resolver's hostile inputs (real hosts, ports, credentials, schemes,
    traversal, queries, `%`, `localhost`).
  - **Timing:** the connection and scheduler on a fake clock (generations, cancel, freeze,
    speed changes, exact byte timing).
  - **Content:** the chunk planner, and the world build.
  - **Repository:** pinning, a tampered manifest (integrity error), a page with an injected
    `html` block (rejected), update detection without swapping, and retry.
  - **Network:** offline refusal, progressive reveal, fictional errors, cancel on sign-off,
    freeze while hidden.
  - **Stability:** three consecutive full runs were green.
- `npm run test:e2e`: 37/37 journeys in Chrome 156, plus 108/108 for the earlier 36 over three
  repeats. The six new journeys:
  - **Sign-on to browsing:** AOL sign-on and keyword to Netscape; progressive load, widget,
    links, Back, visited colour, the redirect and bookmarks.
  - **Errors:** fictional errors, plus a check that **no request leaves `localhost`**.
  - **Signing off:** the confirmation, the page staying on screen, and Reload refused offline.
  - **AOL areas:** cancelling a sign-on, mail, the scripted chat, and close-asks-then-signs-off.
  - **Sound:** the modem sound starts exactly one audio context with no errors.
- **Build:** typecheck clean, with the content check and public asset gate passing (41 stand-ins
  remain).
  - The initial bundle is 133 KB gzipped JS plus 7 KB CSS. Validators stay a separate lazy chunk.
  - The world adds 12 small JSON files.
- **Screenshots:** 15-22 in `tests/visual/pending/` (AOL sign-on, connecting, welcome, chat;
  Netscape loading, page, DNS error, newspaper page) await human review.

**Bugs found and fixed while testing**

- After a link was clicked, the status bar kept showing its address, because the link
  disappeared without a mouse-leave. It now clears when navigation starts.
- The progress text showed fractional bytes.
- The Vite config pulled source files in through a static import, which drew a config-loader
  warning. The world builder now loads through Vite's module runner (D30).
- A Connection test expected an extra "offline" event on connect, and a scheduler test had the
  wrong expected timing. The code was right; the tests were fixed.

**Not done / not verified**

- **Audio:** the modem sound was verified to start without errors, but it has not been listened
  to by a person. Please try it with sound on.
- **AOL title-bar icon:** the navy AOL logo is nearly invisible on the navy title bar. This is
  carried over from M2 and is a candidate for the icon follow-up.
- **Content:** only three of the seven sites. Clue chains, discoveries and the clue logbook's
  progress come in M4.
- **Cache headers:** `world/current.json` needs a short cache when publishing (M5
  `infra:publish`). The client already revalidates it on every load.
- **Coverage:** only Chromium. Cross-browser, mobile, screen reader and the 45-minute session are
  M5.

**Next step:** M4: the remaining four sites, the clue chain, discoveries and the release
update flow.

## M3 follow-up: authentic AOL (2026-10-30)

- **Owner request:** the AOL screens now follow the owner's three screenshots (D37). AOL is a
  frame window with its own menus and Flashbar, and its child windows sit on a gray workspace:
  - **Welcome:** the sign-on window.
  - **Connecting:** the marbled progress panel with three pictures and steps 1-6.
  - **Main Menu:** 14 department buttons plus the Spotlight, Post Office and Discover AOL corner.
- **Corrected:** open question 9. AOL on Windows 95 used Windows 95 controls, so the Windows 3.1
  styling was removed.
- **Art:**
  - **Traced:** the AOL wordmark, from the owner's screenshot (D29), plus a green title-bar
    triangle.
  - **Drawn:** 44 pieces drawn as SVG for the project (Flashbar icons, department buttons, step
    pictures, textures).
  - **Checks:** 92 registered assets; the public gate passes.
- **Fixed:** a click on a child window behind another could be lost, because bringing it to the
  front re-ordered the DOM between pointer-down and click. Stacking now uses z-order only.
- **Tests:** 564 unit; 38/38 journeys, including a new one that walks the Main Menu departments.
  Screenshots 15-17 (sign-on, connecting, Main Menu) were regenerated for review.
- **Not done:**
  - The outer AOL window's title-bar icon is still the navy triangle, because the shell uses one
    icon per program. The child windows use the green one.
  - Flashbar tooltips and most step texts are educated guesses.
- **Chat room (owner request, later the same day):** the Lobby follows the owner's chat-room
  screenshot.
  - **Layout:** the log with bold blue screen names and each member's own colour and font; an
    "N people here" list (double-click a name for a fictional profile); and the More Chat,
    Private Chat, Notify AOL, Member Directory and Chat Preferences buttons.
  - **Typing:** a font, colour, bold, italic and underline bar, plus a Send button.
  - **Safety:** styles come from a fixed palette, so they are never free-form. The room is still
    labeled as scripted.
  - **Tests:** the chat journey now covers formatting and profiles.
- **Readability fix (owner report):** on a dark-mode system, text boxes inside the simulation
  (Notepad, AOL and Netscape fields) took the browser's dark-mode light-gray text on a white
  background. The simulated computer now always renders in light mode, with black text on its
  white surfaces, and AOL's dates are dark gray. A new journey runs in dark mode and scans every
  visible text node and field for light text on white. Disabled items stay gray, as in Windows 95.

## M4 report (2026-10-30)

**Works**

- **Release `rel-0002`** ("Second week of December", story date 1995-12-08) has **all seven
  sites** and **23 meaningful pages**:

  | Site | Pages |
  |---|---|
  | Switchboard | home, what's new, directory search, help |
  | Chugging Coffee House | home, menu, notice board |
  | The Daily Packet | home, the coffee story, library modem lines |
  | Northstar Campus | home, physics and astronomy, astronomy club, Mira's student page |
  | Byte Market | catalog, classifieds, download-time calculator |
  | Night Owl Bulletin | BBS welcome, message archive, sysop notes |
  | Lantern Point | home and guestbook, photo gallery, the keeper's logbook |

  The layouts vary across sidebar, academic, catalog, terminal, homepage, newspaper and
  centered. Five new original images were added. There are eight more AOL keywords (NORTHSTAR,
  STARS, BYTE MARKET, COMPUTERS, BBS, NIGHT OWL, LANTERN, LIGHTHOUSE) and a new redirect
  (`northstar.test/astronomy/` → `/astro/`).
- **The world hangs together, and the build checks it:**
  - Every site links to at least two other sites, and every site is reachable from Switchboard.
  - There is a loop through three sites: Chugging notices → Lantern Point → Night Owl → Chugging
    notices.
  - Every link resolves, and every clue points at a real block on a real page.
  - Rewards may only be `.txt` files directly in `C:\My Documents`, and retired clues are never
    reused.
- **Immutable releases (D38):**
  - **Frozen:** `rel-0001` is frozen in `content/world/published/` and served byte for byte
    beside `rel-0002`, so open tabs pinned to it keep working and rollback stays possible
    (`rollbackSafeTo: [rel-0001]`).
  - **Freezing:** `npm run content:freeze` freezes the newest release when it is published. The
    build refuses an unfrozen release that has newer ones after it.
- **New edition prompt:** once a tab has pinned a release, it checks `current.json` when it
  becomes visible and every 10 minutes. When a newer edition appears, it offers a restart once
  ("Your files, settings and discoveries are kept"). Saying no keeps the tab on its edition.
- **The Lantern Keeper's Logbook (optional clue chain):**
  - **The pieces:** four pieces on Northstar, Night Owl, Byte Market and Chugging. A piece
    counts when its page has fully loaded, and Netscape's status bar says "You found a piece of
    ...".
  - **The logbook page** on Lantern Point shows progress and up to two hints per step, revealed
    one at a time. Start over asks first and then forgets that chain's pieces.
  - **The reward:** with every piece found, "Save to My Documents" writes
    `C:\My Documents\Keepers Log.txt` through the drive's `addCollected` operation, which never
    overwrites anything. "Open it" opens the file in Notepad.
  - **Storage:** discoveries are personal. They live in this browser and its exports, and never
    change canon. A saved clue retired from canon counts for its replacement.

**Tests actually run**

- `npm test`: 571 passed (7 new):
  - **Clue logic:** progress, retired-clue mapping including chains and cycles, and clues on a
    page.
  - **Releases:** the seven-site release; the frozen release served byte for byte; the
    three-site loop; loading a pinned older release.
- `npm run test:e2e`: 43/43 journeys. The five new ones:
  - **The full clue chain:** hints, four pieces, no double counting, the reward in Notepad,
    Start over, and progress kept across a reload.
  - **Switchboard and redirects:** Switchboard reaches all six sites, the directory search
    works, and the old Northstar address redirects.
  - **New edition:** the restart prompt appears once, and the tab stays on its edition.
  - **Dark pages:** they keep their light text.
- **Build:** the content check and asset gate pass, with 97 registered assets.
- **Screenshots:** 23-31 in `tests/visual/pending/` show the new sites and the logbook.

**Bugs found and fixed while testing**

- The readability fix had forced preformatted text black, which made it invisible on dark pages
  (the Northstar log and Night Owl). Pages now keep their own text colour, and a journey checks
  it.

**Not done / not verified**

- **Not deployed:** freezing `rel-0002` happens when it is published (M5 `infra:publish`), not
  now.
- **One chain:** there is only one clue chain. The schema allows more.
- **Coverage:** only Chromium.

**Next step:** M5: accessibility, security, performance, browser QA and the deployment-ready
package.
