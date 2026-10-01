import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, BookOpen, Sparkles, TrendingUp, User, Shield, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyInviteCode } from "@/lib/invite.functions";

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
  const focusMode = useFocusMode();
  return (
    <div className="relative isolate min-h-dvh bg-background">
      <PendingInviteRedemption />
      <div
        className={`mx-auto w-full max-w-[480px] px-4 pt-6 md:max-w-none md:pl-8 md:pr-8 ${focusMode ? "" : "md:ml-[220px]"}`}
        style={
          focusMode
            ? undefined
            : { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6.5rem)" }
        }
      >
        <div className={`md:max-w-[740px] ${focusMode ? "md:mx-auto" : ""}`}>{children}</div>
      </div>
      {focusMode ? <FocusModeClose /> : <BottomNav />}
      {!focusMode && <SideNav />}
    </div>
  );
}

/** Complete enrolment after the student's first authenticated session. */
function PendingInviteRedemption() {
  const apply = useServerFn(applyInviteCode);
  const queryClient = useQueryClient();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const code = user?.user_metadata?.pending_invite_code;
      if (!user || typeof code !== "string" || !code.trim()) return;

      try {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("batch_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;

        if (!profile?.batch_id) {
          const result = await apply({ data: { code: code.trim() } });
          if (result.ok) {
            toast.success("Invite accepted — your batch is now assigned.");
          } else {
            const messages = {
              not_found: "That invite code isn't valid. You can enter another code in Profile.",
              expired: "That invite code has expired. Ask your coordinator for a new one.",
              exhausted: "That invite code has been used up. Ask your coordinator for a new one.",
              already_enrolled: "Your batch is already assigned.",
            } as const;
            toast.error(messages[result.reason]);
          }
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["app-shell-role"] }),
          queryClient.invalidateQueries({ queryKey: ["profile-page"] }),
          queryClient.invalidateQueries({ queryKey: ["home-today"] }),
        ]);
      } catch (error) {
        console.error("Pending invite redemption failed", error);
        toast.error("We couldn't assign your batch yet. Sihat will try again next time.");
        return;
      }

      // Clear only after a definitive result. Failure to clean up metadata
      // must not report that a successful batch assignment failed.
      const { error: cleanupError } = await supabase.auth.updateUser({
        data: { pending_invite_code: null },
      });
      if (cleanupError) {
        console.warn("Could not clear redeemed invite metadata", cleanupError);
      }
    })();
  }, [apply, queryClient]);

  return null;
}

function useFocusMode() {
  const location = useLocation();
  const tab = (location.search as { tab?: string }).tab;
  return (
    location.pathname.endsWith("/exam") ||
    (location.pathname.includes("/chapters/") && (tab === "quiz" || tab === "flashcards"))
  );
}

function FocusModeClose() {
  const location = useLocation();
  const chapterMatch = location.pathname.match(/\/chapters\/([^/]+)/);
  const subjectMatch = location.pathname.match(/\/subjects\/([^/]+)\/exam$/);

  if (chapterMatch) return null;

  return subjectMatch ? (
    <Link
      to="/subjects/$subjectId"
      params={{ subjectId: subjectMatch[1] }}
      aria-label="Close exam"
      className="fixed top-[max(1rem,env(safe-area-inset-top))] left-4 z-50 grid size-11 place-items-center rounded-full border bg-card text-foreground shadow-soft"
    >
      <X className="size-5" />
    </Link>
  ) : null;
}

function BottomNav() {
  const items = useNavItems();
  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-4 z-40 md:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
    >
      <div className="mx-auto flex h-16 max-w-[440px] items-center justify-around rounded-[22px] border bg-card px-2 shadow-lifted">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to as "/home"}
            aria-label={label}
            className="nav-pill group flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-muted-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
          >
            <Icon className="size-5 shrink-0" />
            <span className="hidden text-xs font-semibold group-data-[status=active]:inline">
              {label}
            </span>
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
    <nav
      aria-label="Primary navigation"
      className="fixed inset-y-0 left-0 hidden w-[220px] flex-col border-r bg-surface p-4 md:flex"
    >
      <Link to="/home" className="mb-6 flex items-center gap-2.5 px-2 py-3">
        <span className="grid size-10 place-items-center rounded-[14px] bg-primary font-display text-xl text-primary-foreground">
          S
        </span>
        <span className="font-display text-2xl text-foreground">Sihat</span>
      </Link>
      <div className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to as "/home"}
            className="group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary-tint hover:text-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
          >
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  return { loading, userId };
}
