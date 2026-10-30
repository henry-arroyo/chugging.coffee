# Distributable assets

Every file in this folder needs an entry in `../registry.json` (see `docs/asset-rights.md`).
`npm run assets:check` fails on unregistered files, and public builds also fail on anything
that is not approved for public use, or has expired. This README is the only exception.
