import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, BookOpen, Sparkles, TrendingUp, User, Shield } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const baseNav = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
  { to: "/tutor", label: "Tutor", icon: Sparkles },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const adminNavItem = { to: "/admin", label: "Admin", icon: Shield } as const;

type NavItem = { to: string; label: string; icon: typeof Home };

function useNavItems(): NavItem[] {
  const { data: role } = useQuery({
    queryKey: ["app-shell-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      return profile?.role ?? null;
    },
  });
  const items: NavItem[] = [...baseNav];
  if (role === "admin" || role === "instructor") items.push(adminNavItem);
  return items;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <div
        className="w-full max-w-[480px] mx-auto px-4 pt-6 md:max-w-none md:mx-0 md:ml-[200px] md:pl-8 md:pr-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
      >
        <div className="md:max-w-[740px]">{children}</div>
      </div>
      <BottomNav />
      <SideNav />
    </div>
  );
}

function BottomNav() {
  const items = useNavItems();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto max-w-[480px] flex items-center justify-around px-2 py-1.5">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to as "/home"}
            className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors data-[status=active]:text-accent"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-data-[status=active]:bg-accent/10">
              <Icon className="size-5" />
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}


function SideNav() {
  const items = useNavItems();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    qc.clear();
    router.invalidate();
    navigate({ to: "/login" });
  };
  return (
    <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-[200px] flex-col border-r border-border bg-surface p-4">
      <Link to="/home" className="px-2 py-3 mb-4">
        <span className="text-xl font-bold text-primary">Sihat</span>
      </Link>
      <div className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to as "/home"}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-secondary data-[status=active]:bg-secondary data-[status=active]:text-accent"
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </div>
      <button
        onClick={handleLogout}
        className="mt-auto rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary text-left"
      >
        Log out
      </button>
    </nav>
  );
}

export function useSession() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user?.id ?? null);
      },
    );
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  return { loading, userId };
}
