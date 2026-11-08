# Edge Functions

Reserved for external callers that MUST land inside the Supabase network (provider webhooks that verify signatures against Supabase secrets, database-trigger fan-outs).

For app-internal server logic use TanStack `createServerFn`. For public webhooks the app owns, use `src/routes/api/public/*`.
