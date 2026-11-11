// Browser-origin allowlist shared by the Edge Functions.
//
// APP_WEB_ORIGIN (and creator-ai's optional AI_WEB_ORIGIN) historically held
// a single origin. Parsing a comma-separated list lets several origins be
// served at once — the production creatordna.in domain, the legacy
// creatordna-app.vercel.app deployment, and http://localhost:8081 during
// local development — without weakening the gate: every entry must be a bare
// origin (HTTPS, or localhost for development) with no path, query, fragment,
// or credentials, and origins that are not listed are still rejected.
//
// A secret holding one origin (as every existing environment does) parses to
// a one-element list, so behaviour is unchanged until the secret is widened.
export function parseAllowedOrigins(
  secretName: string,
  value: string,
): string[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    throw new Error(`${secretName} must contain at least one origin.`);
  }

  const origins: string[] = [];
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(invalid(secretName));
    }
    if (
      (url.protocol !== 'https:' && url.hostname !== 'localhost') ||
      url.origin !== entry.replace(/\/$/, '')
    ) {
      throw new Error(invalid(secretName));
    }
    if (!origins.includes(url.origin)) {
      origins.push(url.origin);
    }
  }
  return origins;
}

function invalid(secretName: string): string {
  return `${secretName} must be a comma-separated list of HTTPS origins (or localhost in development), each without a path.`;
}
