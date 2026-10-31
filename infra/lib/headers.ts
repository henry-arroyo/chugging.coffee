/**
 * Content-Security-Policy for the simulation. Everything is same-origin; no eval, no frames,
 * no plugins, no form posts. 'unsafe-inline' styles cover React style attributes (window positions).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Extra response headers CloudFront adds (besides its built-in security headers). */
export const CUSTOM_HEADERS: Record<string, string> = {
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * The same headers as plain HTTP headers, for serving the production build locally
 * (`npm run test:prod`), so the build is tested under the policy it will ship with.
 * Strict-Transport-Security is left out because the local server speaks plain HTTP.
 */
export const PRODUCTION_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  ...CUSTOM_HEADERS,
};
