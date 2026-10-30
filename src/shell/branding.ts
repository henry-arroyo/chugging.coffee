/**
 * Branded text and wordmarks. Product names used as plain labels ("Netscape Navigator",
 * "America Online") describe what is being simulated. Wordmark-style elements are slots that hold
 * stand-ins until authentic artwork is cleared (docs/asset-rights.md).
 */
export const BRANDING = {
  /** Vertical Start-menu banner: stand-in for the authentic wordmark. */
  startBanner: { lead: 'Time Machine', tail: '95' },
  bootMessage: 'Starting the Time Machine…',
  shutdownWait: 'Please wait while your computer shuts down.',
  safeToTurnOff: 'It’s now safe to turn off\nyour computer.',
} as const;
