import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, BookOpen, Users, Shield, X, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyInviteCode } from "@/lib/invite.functions";
import { FlorenceMark } from "@/components/brand/FlorenceMark";
import { Lockup } from "@/components/brand/Lockup";
import { OfflineBanner } from "@/components/OfflineBanner";
import { invalidateProgress } from "@/lib/progress-data";

type IconComponent = (props: { className?: string }) => React.ReactNode;

/** The Progress tab's icon is the rose itself, in one colour. */
const RoseIcon: IconComponent = ({ className }) => (
  <FlorenceMark size={20} variant="mono" className={className} />
);

const baseNav: NavItem[] = [
  { to: "/home", label: "Today", icon: Home },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
  { to: "/progress", label: "Progress", icon: RoseIcon },
  { to: "/batch", label: "Batch", icon: Users },
];

const adminNavItem: NavItem = { to: "/admin", label: "Faculty", icon: Shield };

type NavItem = { to: string; label: string; icon: IconComponent };

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
        className={`mx-auto w-full max-w-[480px] px-4 md:max-w-none md:px-8 ${focusMode ? "pt-[max(1rem,env(safe-area-inset-top))]" : "pt-[max(0.75rem,env(safe-area-inset-top))] md:ml-[232px] md:pt-8"}`}
        style={
          focusMode ? undefined : { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }
        }
      >
        <div className={`md:max-w-[720px] ${focusMode ? "md:mx-auto" : ""}`}>
          <OfflineBanner />
          {children}
        </div>
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
            toast.success("You've joined your batch.");
          } else {
            const messages = {
              not_found: "That batch code didn't work. You can enter another one in Settings.",
              expired: "That batch code has expired. Ask your class coordinator for a new one.",
              exhausted: "That batch code is full. Ask your class coordinator for a new one.",
              already_enrolled: "You're already in a batch.",
            } as const;
            toast.error(messages[result.reason]);
          }
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["app-shell-role"] }),
          queryClient.invalidateQueries({ queryKey: ["profile-page"] }),
          invalidateProgress(queryClient),
        ]);
      } catch (error) {
        console.error("Pending invite redemption failed", error);
        toast.error("We couldn't join your batch yet. Florence will try again next time.");
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
  // Study screens get the whole screen: chapters (notes have their own
  // bottom actions), review sessions, mistake review and exams.
  return (
    location.pathname.endsWith("/exam") ||
    location.pathname === "/session" ||
    location.pathname === "/review" ||
    location.pathname.startsWith("/chapters/")
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
      className="fixed top-[max(1rem,env(safe-area-inset-top))] left-4 z-50 grid size-11 place-items-center rounded-full border border-border-strong bg-card text-foreground"
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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex h-[64px] max-w-[480px] items-stretch justify-around px-2">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to as "/home"}
            className="group flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 text-[11.5px] font-semibold text-muted-foreground data-[status=active]:text-accent-ink"
          >
            <Icon className="size-[22px] shrink-0" />
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
    <nav
      aria-label="Primary navigation"
      className="fixed inset-y-0 left-0 hidden w-[232px] flex-col border-r bg-card p-4 md:flex"
    >
      <Link to="/home" className="mb-8 px-2 pt-3 pb-2" aria-label="Florence, Today">
        <Lockup height={32} />
      </Link>
      <div className="flex flex-col gap-1">
        {[...items, { to: "/profile", label: "Settings", icon: Settings }].map(
          ({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to as "/home"}
              className="group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          ),
        )}
      </div>
      <button
        onClick={handleLogout}
        className="mt-auto min-h-11 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
