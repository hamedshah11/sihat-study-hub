import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, PanelLeft, Users, Shield, X, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyInviteCode } from "@/lib/invite.functions";
import { FlorenceMark } from "@/components/brand/FlorenceMark";
import { Lockup } from "@/components/brand/Lockup";
import { OfflineBanner } from "@/components/OfflineBanner";
import { invalidateProgress } from "@/lib/progress-data";
import { resolveSession, verifySessionOnline, type SessionCheck } from "@/lib/offline-session";
import { logOut } from "@/lib/log-out";
import { useSessionUserId } from "@/hooks/use-session-user";
import { ConsentGate } from "@/components/PrivacyAgreement";
import { hasCurrentConsent } from "@/lib/privacy";

type IconComponent = (props: { className?: string }) => React.ReactNode;

/** The Progress tab's icon is the rose itself, in one colour. */
const RoseIcon: IconComponent = ({ className }) => (
  <FlorenceMark size={20} variant="mono" className={className} />
);

const baseNav: NavItem[] = [
  { to: "/home", label: "Today", icon: Home },
  { to: "/subjects", label: "Subjects", icon: PanelLeft },
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
  const faculty = useLocation().pathname.startsWith("/admin");
  return (
    <div className="relative isolate min-h-dvh bg-background">
      <PendingInviteRedemption />
      <PrivacyConsentCheck />
      <div
        className={`mx-auto w-full max-w-[480px] px-4 md:w-auto md:max-w-none md:px-8 ${
          focusMode
            ? "pt-[max(1rem,env(safe-area-inset-top))]"
            : `pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-8 ${faculty ? "md:ml-[260px]" : "md:ml-[232px]"}`
        }`}
        style={
          focusMode ? undefined : { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }
        }
      >
        <div
          className={
            faculty ? "md:max-w-[1280px]" : `md:max-w-[720px] ${focusMode ? "md:mx-auto" : ""}`
          }
        >
          <OfflineBanner />
          {children}
        </div>
      </div>
      {focusMode ? <FocusModeClose /> : <BottomNav />}
      {!focusMode && (faculty ? <FacultySidebar /> : <SideNav />)}
    </div>
  );
}

/**
 * Accounts that haven't agreed to the current privacy notice (made before it
 * existed, or after PRIVACY_VERSION went up) are asked once. Skipped offline,
 * where the answer couldn't be saved; it asks next time instead.
 */
function PrivacyConsentCheck() {
  const [needed, setNeeded] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const userId = useSessionUserId();

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user && !hasCurrentConsent(data.user.user_metadata)) setNeeded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!needed) return null;
  return (
    <ConsentGate
      onAgreed={() => setNeeded(false)}
      onLogOut={async () => {
        await logOut(userId);
        qc.clear();
        router.invalidate();
        navigate({ to: "/login" });
      }}
    />
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
  const userId = useSessionUserId();
  const handleLogout = async () => {
    await logOut(userId);
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

/** The faculty console's sidebar: always Night ward, as on the For faculty sheet. */
function FacultySidebar() {
  const { data } = useQuery({
    queryKey: ["faculty-sidebar"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [{ data: profile }, { count: drafts }, reports] = await Promise.all([
        user
          ? supabase.from("profiles").select("display_name, role").eq("id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft"),
        (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
          .from("content_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
      ]);
      return {
        name: profile?.display_name ?? "",
        role: profile?.role === "admin" ? "Admin" : "Faculty",
        drafts: drafts ?? 0,
        reports: reports.error ? 0 : (reports.count ?? 0),
      };
    },
    staleTime: 30_000,
  });
  const items = [
    { to: "/admin/review", label: "Review", count: data?.drafts },
    { to: "/admin", label: "Chapters", exact: true },
    { to: "/admin/reports", label: "Reported by students", count: data?.reports },
    { to: "/admin/invite-codes", label: "Batches" },
    { to: "/admin/diagnostics", label: "Diagnostics" },
  ];
  return (
    <nav
      aria-label="Faculty navigation"
      className="dark fixed inset-y-0 left-0 hidden w-[260px] flex-col bg-night p-4 text-linen md:flex"
    >
      <Link to="/admin/review" className="mb-8 px-2 pt-3" aria-label="Florence for faculty">
        <Lockup height={30} variant="night" />
      </Link>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to as "/admin"}
            activeOptions={{ exact: Boolean(item.exact) }}
            className="flex min-h-11 items-center justify-between rounded-xl px-3 text-[15px] font-medium text-linen/85 hover:bg-white/5 data-[status=active]:bg-white/10 data-[status=active]:font-semibold data-[status=active]:text-lamp"
          >
            {item.label}
            {item.count ? (
              <span className="fl-number min-w-6 rounded-full bg-lamp px-1.5 text-center text-[12px] leading-6 text-night">
                {item.count}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
      <div className="mt-auto space-y-2">
        <Link to="/home" className="block px-3 py-2 text-[13.5px] text-mist hover:text-linen">
          Student app
        </Link>
        <div className="rounded-2xl bg-night-panel px-4 py-3">
          <p className="truncate text-[14.5px] font-semibold">{data?.name || "Faculty"}</p>
          <p className="text-[13px] text-mist">{data?.role ?? "Faculty"} · SIHAT</p>
        </div>
      </div>
    </nav>
  );
}

/**
 * Who is signed in. Offline, the session stored on the phone is trusted (a
 * dropped signal is not a reason to sign out); when the signal comes back it
 * is checked with the server.
 */
export function useSession() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let trustedOffline = false;
    const apply = ({ userId: id, trustedOffline: offline }: SessionCheck) => {
      if (!active) return;
      trustedOffline = offline;
      setUserId(id);
      setLoading(false);
    };
    const check = () => resolveSession().then(apply);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) apply({ userId: session.user.id, trustedOffline: false });
      else if (event === "SIGNED_OUT") apply({ userId: null, trustedOffline: false });
      // No session without a sign-out (e.g. a refresh that failed offline):
      // fall back to the stored session.
      else void check();
    });
    void check();

    const onOnline = () => {
      if (trustedOffline) void verifySessionOnline().then(apply);
    };
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return { loading, userId };
}
