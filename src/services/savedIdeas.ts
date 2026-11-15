import { supabaseAnonKey, supabaseUrl } from '../lib/config';
import type { StudioIdea, StudioStory } from './creatorAi';

// Talks to `public.saved_ideas` over PostgREST with nothing but the publishable
// anon key and the creator's own session token — no service-role key ever
// reaches the app. The table's row level security ties every row to `auth.uid()`,
// so one creator's saved ideas are unreachable from another's session no
// matter what id is put in a filter.

const REST = `${supabaseUrl}/rest/v1`;
const TABLE = 'saved_ideas';
const TIMEOUT_MS = 15_000;

export type SavedIdeaStatus = 'draft' | 'scheduled' | 'published' | 'skipped';

/** One saved idea, exactly as the Content tab will render and edit it. */
export type SavedIdea = {
  id: string;
  title: string;
  platform: string;
  angle: string | null;
  hook: string | null;
  outline: string[];
  script: string;
  caption: string;
  hashtags: string[];
  thumbnailConcept: string | null;
  sourceUrl: string;
  sourceTitle: string;
  sourcePublisher: string | null;
  sourceCategory: string | null;
  sourceImageUrl: string | null;
  status: SavedIdeaStatus;
  createdAt: string;
  updatedAt: string;
};

export type SavedIdeaFailureKind = 'offline' | 'unauthorized' | 'rejected';

export type SavedIdeaResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; kind: SavedIdeaFailureKind };

function fail<T>(kind: SavedIdeaFailureKind, message: string): SavedIdeaResult<T> {
  return { ok: false, kind, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function isStatus(value: unknown): value is SavedIdeaStatus {
  return value === 'draft' || value === 'scheduled' || value === 'published' || value === 'skipped';
}

function rowFrom(value: unknown): SavedIdea | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const title = text(value.title).trim();
  const sourceUrl = text(value.source_url).trim();
  const sourceTitle = text(value.source_title).trim();
  if (!id || !title || !sourceUrl || !sourceTitle) return null;
  return {
    id,
    title,
    platform: text(value.platform).trim() || 'Instagram Reels',
    angle: nullableText(value.angle),
    hook: nullableText(value.hook),
    outline: textList(value.outline),
    script: text(value.script),
    caption: text(value.caption),
    hashtags: textList(value.hashtags),
    thumbnailConcept: nullableText(value.thumbnail_concept),
    sourceUrl,
    sourceTitle,
    sourcePublisher: nullableText(value.source_publisher),
    sourceCategory: nullableText(value.source_category),
    sourceImageUrl: nullableText(value.source_image_url),
    status: isStatus(value.status) ? value.status : 'draft',
    createdAt: text(value.created_at),
    updatedAt: text(value.updated_at),
  };
}

/** The exact idea + story pair the studio saved; sent verbatim on insert. */
function bodyFrom(input: { idea: StudioIdea; story: StudioStory }): Record<string, unknown> {
  return {
    title: input.idea.title,
    platform: input.idea.platform,
    angle: input.idea.angle,
    hook: input.idea.hook,
    outline: input.idea.outline,
    script: input.idea.script,
    caption: input.idea.caption,
    hashtags: input.idea.hashtags,
    thumbnail_concept: input.idea.thumbnail_concept,
    source_url: input.story.url,
    source_title: input.story.title,
    source_publisher: input.story.publisher,
    source_category: input.story.category,
    source_image_url: input.story.imageUrl,
    status: 'draft',
  };
}

function friendly(body: unknown, status: number): string {
  if (isRecord(body)) {
    const message = text(body.message);
    const code = text(body.code);
    if (code === '42501' || message.toLowerCase().includes('row-level security')) {
      return 'That saved idea belongs to another account. Sign in again to continue.';
    }
    if (message && status >= 400 && status < 500) return message;
  }
  if (status === 401 || status === 403) {
    return 'Your session has expired. Sign in again to continue.';
  }
  return 'Could not save that right now. Please try again.';
}

async function call<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  token: string,
  parse: (data: unknown) => SavedIdeaResult<T>,
  body?: Record<string, unknown>,
): Promise<SavedIdeaResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${REST}${path}`, {
      method,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(method === 'POST' ? { Prefer: 'return=representation' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return fail<T>('offline', 'Could not reach CreatorDNA. Check your connection and retry.');
  }

  if (response.status === 204) {
    if (response.ok) return parse(null);
    return fail<T>('rejected', 'Could not complete that. Please try again.');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const kind: SavedIdeaFailureKind =
      response.status === 401 || response.status === 403 ? 'unauthorized' : 'rejected';
    return fail<T>(kind, friendly(payload, response.status));
  }
  return parse(payload);
}

/**
 * Every saved idea for the signed-in creator, newest first. RLS scopes the
 * rows to the session's user, so no user id ever appears in the query.
 */
export async function listSavedIdeas(token: string): Promise<SavedIdeaResult<SavedIdea[]>> {
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'created_at.desc');
  params.set('limit', '200');
  return call<SavedIdea[]>('GET', `/${TABLE}?${params.toString()}`, token, (data) => {
    if (!Array.isArray(data)) {
      return fail<SavedIdea[]>('rejected', 'Could not read your saved ideas. Please retry.');
    }
    const items = data.map(rowFrom).filter((item): item is SavedIdea => item !== null);
    return { ok: true, data: items };
  });
}

/** Save one studio idea, with the exact story it came from, to this account. */
export async function saveStudioIdea(
  token: string,
  input: { idea: StudioIdea; story: StudioStory },
): Promise<SavedIdeaResult<SavedIdea>> {
  return call<SavedIdea>('POST', `/${TABLE}`, token, (data) => {
    const row = rowFrom(Array.isArray(data) ? data[0] : data);
    if (!row) {
      return fail<SavedIdea>('rejected', 'Your idea was not saved. Please try again.');
    }
    return { ok: true, data: row };
  }, bodyFrom(input));
}

/** Edit a saved idea's own words (and its plan status) — never its story. */
export async function updateSavedIdea(
  token: string,
  id: string,
  patch: Partial<{
    title: string;
    script: string;
    caption: string;
    status: SavedIdeaStatus;
  }>,
): Promise<SavedIdeaResult<SavedIdea>> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.script !== undefined) body.script = patch.script;
  if (patch.caption !== undefined) body.caption = patch.caption;
  if (patch.status !== undefined) body.status = patch.status;
  if (Object.keys(body).length === 0) {
    return fail<SavedIdea>('rejected', 'Nothing to update.');
  }
  body.updated_at = new Date().toISOString();
  const params = new URLSearchParams();
  params.set('id', `eq.${encodeURIComponent(id)}`);
  return call<SavedIdea>('PATCH', `/${TABLE}?${params.toString()}`, token, (data) => {
    const row = rowFrom(Array.isArray(data) ? data[0] : data);
    if (!row) {
      return fail<SavedIdea>('rejected', 'That saved idea could not be updated. Please retry.');
    }
    return { ok: true, data: row };
  }, body);
}

/** Remove one saved idea from this account. */
export async function deleteSavedIdea(token: string, id: string): Promise<SavedIdeaResult<null>> {
  const params = new URLSearchParams();
  params.set('id', `eq.${encodeURIComponent(id)}`);
  return call<null>('DELETE', `/${TABLE}?${params.toString()}`, token, () => ({
    ok: true,
    data: null,
  }));
}
