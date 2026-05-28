import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Sihat" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-gate-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { role: null as string | null };
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      return { role: profile?.role ?? null };
    },
  });

  const allowed = data?.role === "admin" || data?.role === "instructor";

  useEffect(() => {
    if (!isLoading && data && !allowed) {
      navigate({ to: "/home" });
    }
  }, [isLoading, data, allowed, navigate]);

  if (isLoading || !data) {
    return <div className="text-muted-foreground">Loading…</div>;
  }
  if (!allowed) {
    return <div className="text-muted-foreground">Redirecting…</div>;
  }

  return (
    <div>
      <AdminNav />
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}

function AdminNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/admin", label: "Dashboard", exact: true },
    { to: "/admin/invite-codes", label: "Invite codes" },
    { to: "/admin/diagnostics", label: "Diagnostics" },
  ] as const;
  const isActive = (t: { to: string; exact?: boolean }) =>
    t.exact ? pathname === t.to : pathname.startsWith(t.to);
  return (
    <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
      {tabs.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          className={
            "rounded-lg px-3 py-1.5 text-sm transition-colors " +
            (isActive(t)
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-secondary")
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
