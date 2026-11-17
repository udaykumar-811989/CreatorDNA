// Upstream-controlled URLs (feed items, story links, chat media, Instagram
// permalinks) are opened in the browser with Linking.openURL. On the web
// build that is a navigation in this page's context, so a `javascript:` or
// `data:` scheme from a bad feed would execute — only real web/mail/phone
// targets are allowed out. Anything schemeless ("example.com/post") is
// treated as https, and everything else is rejected for the caller to report.
const SAFE_SCHEMES = ['https:', 'http:', 'mailto:', 'tel:'];

const SCHEMELESS_HOST = /^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i;

/** Returns a normalized safe URL, or null when `raw` must not be opened. */
export function safeExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    return SAFE_SCHEMES.includes(parsed.protocol) ? parsed.href : null;
  } catch {
    // No scheme at all: only a plain host-looking value is promoted to https.
    if (!SCHEMELESS_HOST.test(trimmed)) {
      return null;
    }
    try {
      const parsed = new URL(`https://${trimmed}`);
      return SAFE_SCHEMES.includes(parsed.protocol) ? parsed.href : null;
    } catch {
      return null;
    }
  }
}
