# Security Notes

## Environment Variable Hygiene

### VITE_ prefixed variables (public)
- Any variable prefixed with `VITE_` is **injected at build time** and bundled into the client-side JavaScript.
- These values are **visible to anyone** who inspects the browser's network or source tabs.
- Only store **public** configuration here:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- **Never** put secrets, API keys, or passwords into a `VITE_` variable.

### Server-only variables (private)
- Variables without the `VITE_` prefix are **only available at runtime on the server**.
- These are **never bundled into the frontend** and are safe for secrets:
  - `SUPABASE_SERVICE_ROLE_KEY` — used only in `src/integrations/supabase/client.server.ts` and trusted server functions.
  - `ANTHROPIC_API_KEY` — used only inside secure server functions or Supabase Edge Functions.
- **Never** import `client.server.ts` or reference `SUPABASE_SERVICE_ROLE_KEY` from any file that runs in the browser.

## Service Role Key
- The `SUPABASE_SERVICE_ROLE_KEY` bypasses **all Row Level Security (RLS)** policies.
- It must **only** be used in server-side code (TanStack server functions, server routes, or Edge Functions).
- Treat it with the same care as a database root password.

## Anthropic API Key
- The `ANTHROPIC_API_KEY` must **only** be used inside:
  - Supabase Edge Functions
  - TanStack server functions (`createServerFn`)
- It must **never** be sent to the browser or used in client-side code.

## General Best Practices
- Keep `.env` and `.env.*` out of version control (already in `.gitignore`).
- Only commit `.env.example` with **empty values** as a reference for required variables.
- Rotate keys immediately if they are ever accidentally committed or exposed.
