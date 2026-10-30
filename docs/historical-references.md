# Historical reference ledger

The setting is **December 1995**. Each product below needs one exact reference build that was
publicly available by then. Nothing here is final until the owner signs off on the row's
**Status**. Do not guess past what a source supports, and do not substitute graphics from
later releases.

Reference-only material (screenshots, manuals, installers) stays out of the repository: keep it in
`assets/reference-only/` (git-ignored) and log each item in the table at the end.

## Reference builds

| Product | Candidate | Public availability | Evidence | Status |
|---|---|---|---|---|
| Windows 95 | **Retail release, version 4.00.950** | Production July 14, 1995; retail Aug 24, 1995 | [EDM2: Windows 95](https://www.edm2.com/index.php/Windows_95), [InvGate ITDB](https://invgate.com/es/itdb/windows-95) | Proposed, needs owner sign-off |
| Windows 95 (excluded) | OSR1 / 4.00.950a | Feb 14, 1996: after the setting | [EDM2](https://www.edm2.com/index.php/Windows_95) | Excluded |
| AOL for Windows | **America Online for Windows 2.5** | 1995 (exact month not yet sourced) | [Smithsonian NMAH catalog](https://si.edu/object/software-america-online-windows-version-25:nmah_1395720), [WinWorld AOL 2.x](https://winworldpc.com/product/aol/20) | **Chosen by owner 2026-10-30**; exact build still to source |
| AOL (excluded) | America Online 3.0 | 1996 | [WinWorld AOL 3.0](https://winworldpc.com/product/aol/30) | Excluded |
| Netscape | **Netscape Navigator 2.0 public beta** (latest beta public by Dec 31, 1995) | First beta Oct 1995; Dec 1995 beta added JavaScript; final Mar 1996 | [Blooberry Netscape history](https://hepwww.pp.rl.ac.uk/users/adye/blooberry/indexdot/history/netscape.htm) | **Chosen by owner 2026-10-30**; exact beta number still to source |
| Netscape (not chosen) | Netscape Navigator 1.22 for Windows | 1.2 final July 1995 | [Netscape 1.22 patch notes](https://ftp.uv.es/pub/windows/network/wsock/Netscape/patch122/patch.txt) | Not chosen |

## Notes and open questions

1. **AOL 2.5 is a Windows 3.1 program.** Running it on Windows 95 in December 1995 is plausible,
   but its windows would use Windows 3.1-style controls inside the Windows 95 shell. Default, in
   keeping with the authentic target: reproduce that mix faithfully (open question 9).
2. **AOL's own web browser.** AOL 2.5 shipped a built-in browser, not Netscape. The AOL Directory
   opening Netscape is the creative simplification the handoff acknowledges.
3. **Windows 95 extras.** Microsoft Plus! (desktop themes) and Internet Explorer 1.0 were separate
   products. The reference is the base retail release without Plus!.
4. **Connection hardware.** 28.8 kbps (V.34, ratified 1994) modems were common by late 1995. That's
   consistent with the setting.
5. **Netscape 2.0 beta and JavaScript:** the simulated browser never runs page scripts (content is
   safe blocks), so the beta's JavaScript support appears only as period detail, such as an About box
   or an "unsupported" notice.
6. **Still to source:** exact AOL 2.5 build number and date; which 2.0 beta was current in late December 1995; the AOL
   2.5 sign-on screen sequence and sounds (for behavior only, not for copying assets).

## Reference material log (local only, not committed)

| Item | Where it came from | Used for | Stored at (local) | Logged by / date |
|---|---|---|---|---|
| *(none yet)* | | | | |
