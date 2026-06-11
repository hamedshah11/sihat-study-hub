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
    <div className="relative isolate min-h-dvh bg-background">
      <AmbientBackdrop />
      <div
        className="w-full max-w-[480px] mx-auto px-4 pt-6 md:max-w-none md:mx-0 md:ml-[220px] md:pl-8 md:pr-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6.5rem)" }}
      >
        <div className="md:max-w-[740px]">{children}</div>
      </div>
      <BottomNav />
      <SideNav />
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="animate-float-slow absolute -top-32 -right-24 size-[420px] rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute top-1/3 -left-36 size-[400px] rounded-full bg-primary/[0.06] blur-3xl" />
      <div className="animate-float-slow absolute -bottom-44 right-1/4 size-[380px] rounded-full bg-streak/[0.06] blur-3xl [animation-delay:-4s]" />
    </div>
  );
}

function BottomNav() {
  const items = useNavItems();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 px-3 md:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.625rem)" }}
    >
      <div className="glass-nav mx-auto flex max-w-[440px] items-center justify-around rounded-2xl border border-border/70 px-1.5 py-1.5 shadow-lifted">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to as "/home"}
            className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors data-[status=active]:text-accent"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200 group-data-[status=active]:bg-accent group-data-[status=active]:text-accent-foreground group-data-[status=active]:shadow-glow">
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
    <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-[220px] flex-col border-r border-border bg-surface/80 backdrop-blur-xl p-4">
      <Link to="/home" className="mb-6 flex items-center gap-2.5 px-2 py-3">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground shadow-soft">
          S
        </span>
        <span className="font-display text-xl font-bold text-primary">Sihat</span>
      </Link>
      <div className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to as "/home"}
            className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-accent/10 data-[status=active]:text-accent"
          >
            <span className="absolute left-0 top-1/2 h-0 w-1 -translate-y-1/2 rounded-full bg-accent transition-all duration-200 group-data-[status=active]:h-5" />
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </div>
      <button
        onClick={handleLogout}
        className="mt-auto rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
