# Asset rights

## Policy

- **Every distributable file has a registry entry** in [`assets/registry.json`](../assets/registry.json),
  validated by [`schemas/asset-rights.schema.json`](../schemas/asset-rights.schema.json).
  Each entry records source, creator, license, attribution, permission evidence, allowed use, status
  and expiry.
- **Public builds accept only** entries with status `approved`, allowed use `public-build`,
  non-empty permission evidence, and an expiry that has not passed. `npm run build` runs
  `assets:check:public` and fails on anything else, including files with no entry.
- **Development builds** may also include `pending` entries marked for `development` use.
  `blocked` and `reference-only` files may never be placed in `assets/public/`.
- **Development stand-ins** are original or openly licensed placeholders, marked `standIn: true`. The
  asset check lists them on every run so they can't silently become final art.
- **Reference-only material** (screenshots, manuals, installers, extracted graphics, sounds,
  proprietary fonts) stays in `assets/reference-only/`, which git ignores and the build never reads.
- **No executables, disk images or extracted program resources** are ever distributed.

## Skin decision (2026-10-30): authentic

The owner chose **authentic Microsoft, AOL and Netscape** branding and artwork. Under this policy:

- **Clearance comes before inclusion.** Authentic files enter `assets/public/` only with written
  permission recorded as `permissionEvidence`, status `approved`, and allowed use `public-build`.
  The build gate already enforces this.
- **Nothing is extracted or downloaded on the project's behalf in the meantime.** Copying icons,
  sounds, fonts or logos out of the original software, or from archive sites, is the
  distribution the handoff forbids. Reference screenshots for studying layout stay local in
  `assets/reference-only/`.
- **Every branded element is an asset slot** (registry ID), so approved files replace
  stand-ins with no code change. Layout, metrics, color values and behavior are built to the
  4.00.950 reference now.

The owner reaffirmed on 2026-10-30 that realistic Windows, AOL and Netscape logos are wanted. No
milestone schedules drawing them: they are clearance-gated. Lookalike redraws of the marks count
as the logos themselves, so they are not used either. Each logo slot (Start button and banner,
the AOL client and keyword artwork, the Netscape "N" and throbber) is ready to take the approved
file.

### Owner-reported approval (2026-10-30)

The owner reports verbal approval from contacts at Microsoft, AOL and the Netscape brand owner to
use their brand likeness (logos and marks) **as long as the service does not charge money**.
There is no written record yet. Registry entries for these marks record exactly that as their
permission evidence, plus the condition. Recommended: get a short written confirmation (an email
is enough) from each company and file it with the evidence, because verbal approval is hard to
show later, and the handoff's rights process expects evidence on file.

**Condition: the Time Machine must stay free.** Charging for it (or adding payments) would end
this permission. v1 has no payments, per the handoff.

### Clearance requests to make (owner)

| Rights holder | What to ask for |
|---|---|
| Microsoft (trademark and copyright permissions) | Windows 95 logo and Start-button artwork, system icons, cursors, sounds, MS Sans Serif / system fonts, boot and shutdown screens |
| AOL's current owner (AOL changed hands in 2025; confirm the current rights contact) | AOL logo, triangle mark, sign-on artwork, "Welcome" / "You've got mail" sounds, client artwork |
| The Netscape brand owner (historically AOL; confirm) | Netscape "N" and animated throbber, Navigator wordmark, toolbar icons |

Record each request and reply in the registry notes and keep the evidence (email or PDF) outside
the public repo, referenced by `permissionEvidence`.

### If clearance is refused or stalls

Public release stays blocked by the gate. Per the handoff, the owner then chooses between an
approved homage skin and postponement. The design is not silently redefined.

## Adding an asset

1. Put the file in `assets/public/<kind>/` with a lowercase name.
2. Add a registry entry. For project-made art, `origin: project-original`,
   `license: Project-owned`, `permissionEvidence: Created in-repo; see git history`.
3. For third-party files, add the license text to `assets/licenses/` and point
   `permissionEvidence` at it.
4. Run `npm run assets:check` (and `npm run assets:check:public` before a release).
