import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type AuthorizationDetails = {
  client?: { name?: string; redirect_uri?: string } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

// The Supabase JS client's auth.oauth namespace is beta. Add a local typed
// wrapper so TypeScript sees the three methods we call.
type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold mb-2">Could not load this authorization</h1>
      <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as AuthorizationDetails | null;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";
  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Connect {clientName} to Sihat</h1>
        <p className="text-sm text-muted-foreground mt-1">
          This lets {clientName} use Sihat as you. It can read approved study
          notes, flashcards, and your progress — subject to your account's
          permissions.
        </p>
      </div>
      {details?.client?.redirect_uri && (
        <p className="text-xs text-muted-foreground break-all">
          Redirects to: {details.client.redirect_uri}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}
      <div className="flex gap-3">
        <Button onClick={() => decide(true)} disabled={busy} className="flex-1">
          {busy ? "Working…" : "Approve"}
        </Button>
        <Button
          onClick={() => decide(false)}
          disabled={busy}
          variant="outline"
          className="flex-1"
        >
          Cancel connection
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Approving does not bypass Sihat's own permissions or role checks.
      </p>
    </main>
  );
}
