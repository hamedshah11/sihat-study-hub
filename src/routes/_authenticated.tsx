import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession, AppShell } from "@/components/AppShell";
import { SessionUserContext } from "@/hooks/use-session-user";
import { useKeepDownloadsFresh } from "@/lib/downloads";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGuard,
});

function AuthGuard() {
  // Offline, the session stored on the phone counts: no signal is not a
  // reason to send the student to /login (see useSession).
  const { loading, userId } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !userId) navigate({ to: "/login" });
  }, [loading, userId, navigate]);

  if (loading || !userId) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>
    );
  }
  return (
    <SessionUserContext.Provider value={userId}>
      <DownloadsKeeper />
      <AppShell>
        <Outlet />
      </AppShell>
    </SessionUserContext.Provider>
  );
}

function DownloadsKeeper() {
  useKeepDownloadsFresh();
  return null;
}
