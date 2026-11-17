// EXPO_PUBLIC_* values are inlined into the bundle at build time. They are
// configured per environment — Vercel project env for the site, EAS project
// env for the APK — and are deliberately NOT committed as literals: rotation
// must never require a source change. The anon key is publishable by design
// (it ships in the client bundle regardless), but the service-role key and
// Meta app secret must never appear here. With no env configured the app
// degrades to its explicit "not configured" states instead of crashing.
const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseUrl = (rawSupabaseUrl ?? '').replace(/\/+$/, '');

export const supabaseAnonKey = rawSupabaseAnonKey ?? '';

export const instagramFunctionUrl = supabaseUrl
  ? `${supabaseUrl}/functions/v1/instagram-oauth`
  : null;

export const creatorAiFunctionUrl = supabaseUrl
  ? `${supabaseUrl}/functions/v1/creator-ai`
  : null;
