# CreatorDNA

CreatorDNA's Expo app uses Supabase Edge Functions and Supabase Postgres for
Instagram Login. Instagram authorization-code exchange and profile lookup run
server-side. The long-lived access token is encrypted with AES-256-GCM before
being stored. The app exchanges a five-minute, single-use receipt for a
30-day-or-less opaque connection session; only its hash is stored in Postgres.
The app session is held in Expo SecureStore on native and tab-scoped
`sessionStorage` on web. Instagram access tokens and Meta secrets are never
sent to the app.

For web development on `http://localhost:8081`, the Supabase Edge Function
redirects the browser back to
`http://localhost:8081/instagram-connected`. This is CreatorDNA's frontend return
route; it is not the Meta OAuth `redirect_uri`. Meta must redirect to the
Supabase callback below so the backend can validate state, exchange the
authorization code, persist the encrypted token, and fetch the profile. The
app then consumes the one-time receipt and renders the
`/instagram-connected` route. The route removes the receipt and state from the
browser address bar after reading them.

After a successful connection, the app shows the Instagram Connected screen.
Continue requests the creator dashboard through the same Edge Function. The
function decrypts the Instagram token server-side, retrieves current profile
and recent media, and requests 30-day account insights. Unavailable insight
metrics are returned as `null` and shown as `--`; media engagement counts are
only shown when the API returns them. Video media is labelled Video because
the Instagram Login API does not provide the media product type used to
distinguish Reels from other videos.

## Supabase project setup

1. Create or select a Supabase project and copy its project URL, project ref,
   and anon/publishable key.
2. Copy `.env.example` to `.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Install/use the Supabase CLI, authenticate, and link this repo to your
   project:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <YOUR_PROJECT_REF>
   npm run supabase:db:push
   npm run supabase:function:deploy
   ```

4. In Supabase Dashboard → Edge Functions → Secrets, set these server-side
   values. Do not prefix any of these with `EXPO_PUBLIC_`.
   - `INSTAGRAM_APP_ID`: the Instagram App ID from Instagram API setup with
     Instagram Login
   - `INSTAGRAM_APP_SECRET`: a newly rotated Instagram App Secret
   - `INSTAGRAM_REDIRECT_URI`: the exact callback URL shown below
   - `TOKEN_ENCRYPTION_KEY`: base64 encoding of a fresh, random 32-byte key
   - `APP_WEB_ORIGIN`: the exact origin serving the web app, e.g.
     `https://your-creatordna-domain.example`
   - `APP_NATIVE_REDIRECT_URI`: `creatordna://instagram/callback`
   - `ALLOW_EXPO_GO_REDIRECTS`: `true` only while testing with Expo Go; remove
     or set to `false` for production

   Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge
   Functions. Never add the service-role key or Meta App Secret to the app's
   `.env`, source code, or Expo `EXPO_PUBLIC_` variables.

5. In Meta Developer Dashboard → Instagram → API setup with Instagram Login →
   Business login settings → OAuth redirect URIs, add the callback URL exactly.
   Request the `instagram_business_basic` and
   `instagram_business_manage_insights` permissions in the app's Instagram
   Login configuration.
6. Set your Instagram Login product's App ID and newly rotated App Secret in
   the Supabase Edge Function secrets. Restart/rebuild Expo after changing the
   client `.env`.
7. Apply pending database migrations and deploy the Edge Function:

   ```powershell
   npm run supabase:db:push
   npm run supabase:function:deploy
   ```

Generate the encryption key locally (save its output directly in Supabase
Edge Function Secrets):

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

## Meta callback URL

The Meta OAuth redirect/callback URL is:

```text
https://kwsigghvjgyxrwvnrfqg.supabase.co/functions/v1/instagram-oauth/callback
```

Use this exact same URL as the `INSTAGRAM_REDIRECT_URI` Edge Function secret.
No separate API server or externally hosted Postgres instance is needed.

For the existing local web preview, `APP_WEB_ORIGIN` must be
`http://localhost:8081`; the app return route is
`http://localhost:8081/instagram-connected`. For another dev port or
production host, configure `APP_WEB_ORIGIN` to that exact origin and add the
matching `/instagram-connected` route as a redirect URI in the Edge Function's
OAuth allowlist. The Meta `INSTAGRAM_REDIRECT_URI` remains the Supabase
callback URL above.

For local Supabase development, the callback URL must still be reachable by
Meta over HTTPS; use an HTTPS tunnel to your local Supabase Functions endpoint.
Never register a localhost callback with Meta.

## Run the app

```powershell
npm run web
```

For Expo Go, enable `ALLOW_EXPO_GO_REDIRECTS` only during development. It
accepts Expo Go callback URLs on private LAN IPs and official Expo hosts; a
native build uses the fixed `creatordna://instagram/callback` URI. Expo Go on a
phone also needs a Supabase API URL and web origin reachable from that device.

The connection tables have RLS enabled and no anon/authenticated table access.
Only the Edge Function's service role can call the database RPCs. Since CreatorDNA
does not yet have user sign-in, saved connections are keyed by Instagram
professional-account ID; add CreatorDNA user ownership before implementing
persistent connection-management screens.

The flow requests `instagram_business_basic` and
`instagram_business_manage_insights`, the permissions listed in Meta's
Instagram Insights guide for Instagram Login, and rejects a connection if
either permission is not granted.
Instagram authorization uses `force_reauth=true` so an already signed-in
personal Instagram web session does not silently get reused instead of the
professional account the creator intends to connect.

The Edge Function calls these official Instagram Login API endpoints:

- `GET /v25.0/me` for the connected profile and follower count
- `GET /v25.0/me/media` for the ten most recent media items and available
  per-item likes/comments
- `GET /v25.0/{instagram-user-id}/insights` for views, likes, and comments
  over the last 30 days

Supabase email/password sign-in is available from the welcome flow. The Auth
access token is held in memory for the current app session and is not persisted
or refreshed. Separately, the Instagram opaque connection session remains a
bearer credential scoped to one Instagram connection and expires no later than
its Instagram access token.

## Creator AI content analysis (Phase 1–2)

The `creator-ai` Edge Function is a backend-only, authenticated content
analysis endpoint. The Create tab starts a Supabase anonymous Auth session
when needed, so a guest can submit analysis without entering an email or
password. The function verifies each access token with Supabase Auth, derives
the owner ID from that verified user, and uses service-role database RPCs only
on the server. The content, job, and analysis tables have RLS enabled; data is
scoped to the verified user, including anonymous users. Guest sessions are
held in memory for the current app session and are not linked to a later
registered account. The AI provider key and system prompt are not sent to the
app.

Enable **Anonymous Sign-Ins** in Supabase Dashboard → Authentication → Sign In
/ Providers. This project enables anonymous sign-ins in `supabase/config.toml`
for local Supabase development. The function accepts one manually submitted
content item as JSON and analyzes provided transcript/caption text,
creator-supplied metrics, and optional image, audio, or video media. Gemini
native API configuration is required for media analysis and voice
transcription. Media is sent directly to the Edge Function for the request,
is not persisted in the database, and is limited to 3 MB per file. Audio
recording is limited to 30 seconds and its transcription is added to the
transcript field. Pacing remains marked not assessable. After an analysis,
creators can ask follow-up questions in a conversational chat. The Ideas mode
generates five Reel concepts from a topic, audience, and goal. Instagram OAuth
remains separate and unchanged.

The Expo Create screen uses the `expo-audio`, `expo-image-picker`, and
`expo-document-picker` modules. A native rebuild is required to apply the
microphone permission provided by the `expo-audio` config plugin.

Set these values as Supabase Edge Function secrets (not in Expo `.env` and
never with an `EXPO_PUBLIC_` prefix):

- `AI_API_URL`: HTTPS provider endpoint. For Gemini's native API, use
  `https://generativelanguage.googleapis.com/v1beta`; for Gemini's
  OpenAI-compatible API, use
  `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`.
- `AI_API_KEY`: provider secret
- `AI_MODEL_FAST`: exact provider model identifier (for example, the Gemini
  model enabled for your API key)
- `AI_WEB_ORIGIN`: optional exact browser app origin allowed by the AI function
  for a non-local web deployment. Localhost/loopback origins on any port are
  accepted for development.
- `APP_WEB_ORIGIN`: exact browser app origin used by Instagram OAuth (leave it
  unchanged when configuring a separate AI preview origin)

Supabase Edge Functions must also have their normal `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` values. Gemini's native
endpoint uses the model's `generateContent` API and returns candidate text;
the function requests JSON output and validates it against the analysis
contract. The OpenAI-compatible Gemini endpoint uses chat completions. Other
OpenAI-compatible providers are also supported.

Apply the new schema and deploy the function:

```powershell
npm run supabase:db:push
npm run supabase:creator-ai:deploy
```

The deployed endpoint is
`https://<project-ref>.supabase.co/functions/v1/creator-ai/analyze`.
Create a test user in Supabase Authentication (the app does not yet provide
user sign-in), then obtain that user's Supabase Auth access token with the
password grant. Do not use the Instagram connection session token:

```powershell
curl.exe -X POST "https://<project-ref>.supabase.co/auth/v1/token?grant_type=password" `
  -H "apikey: <SUPABASE_ANON_KEY>" `
  -H "Content-Type: application/json" `
  -d '{"email":"<TEST_USER_EMAIL>","password":"<TEST_USER_PASSWORD>"}'
```

Use the returned `access_token` as the bearer token for one manual content
analysis request:

```powershell
curl.exe -X POST "https://<project-ref>.supabase.co/functions/v1/creator-ai/analyze" `
  -H "apikey: <SUPABASE_ANON_KEY>" `
  -H "Authorization: Bearer <SUPABASE_AUTH_ACCESS_TOKEN>" `
  -H "Content-Type: application/json" `
  -d '{"idempotencyKey":"reel-analysis-001","title":"Weekly content planning","transcript":"Stop guessing what to post. Start with one audience question.","caption":"A simple weekly planning routine.","durationSeconds":25,"metrics":{"views":1200,"likes":42}}'
```

The endpoint returns a durable job ID and `processing` status without waiting
for the model. Poll `GET /functions/v1/creator-ai/jobs/<job-id>` using the
same authenticated headers; a completed job includes the validated analysis.
Repeating the same idempotency key for that user reuses the same content/job
and returns a cached result after completion. Failed jobs return a safe error
code and can be retried with the same idempotency key. If provider
configuration is missing, the endpoint returns `AI analysis isn't configured
yet.` No sample recommendations or synthetic metrics are generated.
