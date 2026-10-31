# Performance

Measured by `npm run test:prod` (Chromium, production build served by `vite preview` with the
CloudFront headers) on 2026-10-30. Targets come from the handoff: initial shell at most 1 MiB
compressed, usable within three seconds on a documented broadband/device profile, smooth window
dragging.

## Documented profile

10 Mbit/s down, 2 Mbit/s up, 40 ms round trip, CPU slowed 4x (Chrome DevTools throttling), cold
cache, 800x600 desktop. This stands in for a mid-range laptop on ordinary home broadband.

## Results

| Measure | Target | Result |
|---|---|---|
| Logon usable after navigation (includes the deliberate 1.5 s Windows startup screen) | under 3 s | **2.4 s** |
| Initial download, gzip-compressed (shell, styles, art, session chunk) | at most 1 MiB | **about 195 KiB** (885 KiB uncompressed) |
| Window drag, 95th-percentile frame time with CPU 4x slower | smooth | **16.7 ms** (60 frames per second) |
| 45-minute exploration session | no leaks | **pending a clean run.** An interrupted run showed flat memory (about 6.7 MB), DOM nodes and listeners over 68 cycles |

Notes:

- Validators load as a separate chunk with the saved session; AOL, Netscape and the world content
  are loaded when used. World pages are small JSON (about 1-2 KiB each).
- Simulated modem speeds slow the *display* of pages on purpose; they do not reduce billed bytes.
