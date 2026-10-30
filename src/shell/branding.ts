/**
 * Branded text and wordmarks. Microsoft, AOL and Netscape marks are used under the owner-reported
 * permission recorded in docs/asset-rights.md (D29): free service only.
 */
export const BRANDING = {
  /** Vertical Start-menu banner. */
  startBanner: { lead: 'Windows', tail: '95' },
  /** Startup splash wordmark. */
  wordmark: { company: 'Microsoft', product: 'Windows', version: '95' },
  bootMessage: 'Starting Windows 95...',
  /** Plain-text name of the simulated system, as in its logon dialog (not a logo or wordmark). */
  logonTitle: 'Welcome to Windows',
  logonPrompt: 'Type a user name and password to log on to Windows.',
  shutdownWait: 'Please wait while your computer shuts down.',
  safeToTurnOff: 'It’s now safe to turn off\nyour computer.',
} as const;
