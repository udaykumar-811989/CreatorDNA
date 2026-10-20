// EXPO_PUBLIC_* values are inlined into the bundle at build time. The committed
// fallbacks keep hosted builds (Vercel, CI) working when no .env file exists in
// the build environment, exactly like local dev. A configured environment always
// takes precedence. These are publishable anon keys by design; never put the
// service-role key or Meta app secret here.
export const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ??
  'https://kwsigghvjgyxrwvnrfqg.supabase.co').replace(/\/+$/, '');

export const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3c2lnZ2h2amd5eHJ3dm5yZnFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NDIxNzcsImV4cCI6MjEwNzMxODE3N30.ZXTHyj2HCP2m-EfN4R-FnCgkopqlzBSiM0z3hxNaR6Q';

export const instagramFunctionUrl = supabaseUrl
  ? `${supabaseUrl}/functions/v1/instagram-oauth`
  : null;

export const creatorAiFunctionUrl = supabaseUrl
  ? `${supabaseUrl}/functions/v1/creator-ai`
  : null;
