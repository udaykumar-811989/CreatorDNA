// Minimal Deno globals used by the edge functions, so they can be typechecked
// with the repo's TypeScript instead of only failing at runtime.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

// Supabase's edge runtime keeps a background promise alive past the response.
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};
