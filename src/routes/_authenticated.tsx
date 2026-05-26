import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useSession, AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGuard,
});

function AuthGuard() {
  const { loading, userId } = useSession();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!userId) {
    navigate({ to: "/login" });
    return null;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
