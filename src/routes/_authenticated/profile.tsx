import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Lockup } from "@/components/brand/Lockup";
import { applyInviteCode } from "@/lib/invite.functions";
import {
  getStudentSettings,
  updateStudentSettings,
  type StudentSettings,
} from "@/lib/settings.functions";
import { getThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";
import { invalidateProgress } from "@/lib/progress-data";
import { useSessionUserId } from "@/hooks/use-session-user";
import {
  formatBytes,
  invalidateDownloads,
  removeAllDownloads,
  removeChapterDownload,
  storageEstimate,
  useDownloads,
} from "@/lib/downloads";
import { logOut } from "@/lib/log-out";
import { deleteMyAccount } from "@/lib/account.functions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { pageTitle } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: pageTitle("Settings") }] }),
  component: SettingsPage,
});

const APP_VERSION = "1.0";

/** "21:40" → "9:40 pm" */
function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}
const SETTINGS_KEY = ["student-settings"] as const;

function SettingsPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const [theme, setTheme] = useState<ThemePreference>("auto");
  useEffect(() => setTheme(getThemePreference()), []);

  const { data: account } = useQuery({
    queryKey: ["profile-page"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email, batch_id, role")
        .eq("id", user.id)
        .maybeSingle();
      let batch: string | null = null;
      if (profile?.batch_id) {
        const { data: b } = await supabase
          .from("batches")
          .select("name")
          .eq("id", profile.batch_id)
          .maybeSingle();
        batch = b?.name ?? null;
      }
      return {
        name: profile?.display_name || "",
        email: profile?.email || user.email || "",
        batch,
        role: profile?.role ?? "student",
      };
    },
  });

  const loadSettings = useServerFn(getStudentSettings);
  const saveSettings = useServerFn(updateStudentSettings);
  const { data: settings } = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => loadSettings() });

  async function update(patch: Partial<Omit<StudentSettings, "available">>) {
    const previous = qc.getQueryData<StudentSettings>(SETTINGS_KEY);
    if (previous) qc.setQueryData(SETTINGS_KEY, { ...previous, ...patch });
    try {
      const res = await saveSettings({ data: patch });
      if (!res.ok) throw new Error("not saved");
      void qc.invalidateQueries({ queryKey: ["batch-overview"] });
    } catch {
      if (previous) qc.setQueryData(SETTINGS_KEY, previous);
      toast.error("That setting didn't save. Try again.");
    }
  }

  const userId = useSessionUserId();
  const handleLogout = async () => {
    // Removes this account's downloads from the phone first.
    await logOut(userId);
    qc.clear();
    router.invalidate();
    navigate({ to: "/login" });
  };

  const staff = account?.role === "admin" || account?.role === "instructor";

  return (
    <div className="mx-auto max-w-xl pb-6 pt-2">
      <Link
        to="/home"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 pr-3 text-[16px] font-semibold text-foreground"
      >
        <ChevronLeft className="size-5" /> Settings
      </Link>

      <h2 className="mt-5 text-[14px] font-semibold">Theme</h2>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="mt-2.5 grid grid-cols-3 rounded-[14px] bg-muted p-1"
      >
        {(
          [
            ["light", "Light"],
            ["dark", "Dark"],
            ["auto", "Automatic"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="radio"
            aria-checked={theme === value}
            onClick={() => {
              setTheme(value);
              setThemePreference(value);
            }}
            className={cn(
              "h-11 rounded-[11px] text-[14.5px] font-medium",
              theme === value
                ? "bg-card font-semibold text-foreground shadow-soft"
                : "text-foreground/80",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-[13.5px] leading-snug text-muted-foreground">
        Automatic uses Lamplight mode from 8 pm to 6 am and never switches during a session.
      </p>

      <div className="mt-4 divide-y overflow-hidden rounded-[20px] border bg-card">
        <Row label="Daily reminder">
          <label className="relative text-[15px] text-muted-foreground">
            <span className="tabular-nums">{formatTime(settings?.reminderTime ?? "21:00")}</span>
            <input
              type="time"
              value={settings?.reminderTime ?? "21:00"}
              disabled={!settings?.available}
              onChange={(e) => e.target.value && void update({ reminderTime: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Daily reminder time"
            />
          </label>
        </Row>
        <Row label="App notifications" hint="One a day at most">
          <Switch
            checked={settings?.reminderEnabled ?? false}
            disabled={!settings?.available}
            onCheckedChange={(on) => {
              void update({ reminderEnabled: on });
              if (on && "Notification" in window && Notification.permission === "default") {
                void Notification.requestPermission();
              }
            }}
            aria-label="App notifications"
          />
        </Row>
        <Row
          label="WhatsApp reminders"
          hint={settings?.whatsappOptIn ? "On" : "Off until you allow it"}
        >
          <Switch
            checked={settings?.whatsappOptIn ?? false}
            disabled={!settings?.available}
            onCheckedChange={(on) => void update({ whatsappOptIn: on })}
            aria-label="WhatsApp reminders"
          />
        </Row>
        <Row label="Show me in study circles" hint={settings?.showInCircles ? "On" : "Off"}>
          <Switch
            checked={settings?.showInCircles ?? false}
            disabled={!settings?.available}
            onCheckedChange={(on) => void update({ showInCircles: on })}
            aria-label="Show me in study circles"
          />
        </Row>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">
        Reminders start in a coming update. Your choices are saved now.
      </p>

      <Group title="Your batch">
        <BatchRow batch={account?.batch ?? null} />
      </Group>

      <Group title="For offline">
        <DownloadsRow />
      </Group>

      <Group title="Account">
        <Row label="Name">
          <span className="max-w-[55%] truncate text-[14px] text-muted-foreground">
            {account?.name || "–"}
          </span>
        </Row>
        <Row label="Email">
          <span className="max-w-[60%] truncate text-[14px] text-muted-foreground">
            {account?.email || "–"}
          </span>
        </Row>
        <Row label="Privacy notice">
          <Link to="/privacy" className="text-[14px] font-semibold text-accent-ink">
            Read
          </Link>
        </Row>
        {staff && (
          <Row label="Faculty console">
            <Link to="/admin" className="text-[14px] font-semibold text-accent-ink">
              Open
            </Link>
          </Row>
        )}
      </Group>

      <button
        onClick={handleLogout}
        className="mt-6 h-12 w-full rounded-full border border-border-strong text-[15px] font-semibold"
      >
        Log out
      </button>

      {!staff && account && <DeleteAccount userId={userId} />}

      <footer className="mt-12 flex flex-col items-center gap-2.5 text-center">
        <Lockup height={30} />
        <p className="text-[13px] text-muted-foreground">
          Content reviewed by SIHAT faculty. Version {APP_VERSION}
        </p>
      </footer>
    </div>
  );
}

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">{title}</h2>
      <div className="mt-2 divide-y overflow-hidden rounded-[20px] border bg-card">{children}</div>
      {note && <p className="mt-1.5 px-1 text-[12.5px] text-muted-foreground">{note}</p>}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15.5px] font-semibold">{label}</p>
        {hint && <p className="text-[12.5px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** What's downloaded to this phone, the space it takes, and removing it. */
function DownloadsRow() {
  const userId = useSessionUserId();
  const qc = useQueryClient();
  const { data } = useDownloads();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<number | null>(null);
  const chapters = data?.chapters ?? [];
  const bytes = chapters.reduce((sum, c) => sum + c.bytes, 0);

  useEffect(() => {
    if (open) void storageEstimate().then((estimate) => setUsage(estimate?.usage ?? null));
  }, [open, data]);

  async function remove(chapterId?: string) {
    if (!userId) return;
    try {
      if (chapterId) await removeChapterDownload(userId, chapterId);
      else await removeAllDownloads(userId);
    } catch {
      toast.error("That download wasn't removed. Try again.");
    } finally {
      await invalidateDownloads(qc);
    }
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-semibold">Downloads</span>
          <span className="block text-[12.5px] leading-snug text-muted-foreground">
            {chapters.length === 0
              ? "Nothing downloaded"
              : `${chapters.length} chapter${chapters.length === 1 ? "" : "s"} · ${formatBytes(bytes)}`}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t px-4 pb-4">
          {chapters.length === 0 ? (
            <p className="pt-3 text-[13.5px] leading-snug text-muted-foreground">
              Open a chapter or a subject and choose Download for offline to read it with no signal.
            </p>
          ) : (
            <ul aria-label="Downloaded chapters" className="divide-y">
              {chapters.map((c) => (
                <li key={c.chapterId} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{c.title}</span>
                    <span className="block text-[12.5px] text-muted-foreground">
                      {c.subject ? `${c.subject.name} · ` : ""}
                      <span className="fl-number">{formatBytes(c.bytes)}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(c.chapterId)}
                    aria-label={`Remove ${c.title}`}
                    className="min-h-11 shrink-0 px-2 text-[14px] font-semibold text-accent-ink"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {usage != null && (
            <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">
              Florence uses <span className="fl-number">{formatBytes(usage)}</span> on this phone in
              all, with the pages it keeps for offline.
            </p>
          )}
          {chapters.length > 0 && (
            <button
              type="button"
              onClick={() => void remove()}
              className="mt-3 h-11 w-full rounded-full border border-border-strong text-[14px] font-semibold"
            >
              Remove all downloads
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BatchRow({ batch }: { batch: string | null }) {
  const qc = useQueryClient();
  const apply = useServerFn(applyInviteCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const reasons: Record<string, string> = {
    not_found: "That batch code didn't work. Check it with your class coordinator.",
    expired: "That batch code has expired. Ask your class coordinator for a new one.",
    exhausted: "That batch code is full. Ask your class coordinator for a new one.",
    already_enrolled: "You're already in a batch. Ask your coordinator if it's wrong.",
  };

  if (batch) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14.5px] font-medium">Your batch</p>
          <p className="truncate text-[14px] text-muted-foreground">{batch}</p>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          If this isn't your batch, ask your class coordinator to move you.
        </p>
      </div>
    );
  }

  return (
    <form
      className="px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code.trim() || busy) return;
        setBusy(true);
        try {
          const res = await apply({ data: { code: code.trim() } });
          if (res.ok) {
            toast.success("You've joined your batch.");
            setCode("");
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["profile-page"] }),
              invalidateProgress(qc),
            ]);
          } else toast.error(reasons[res.reason] ?? "That code didn't work.");
        } catch {
          toast.error("That didn't work. Check your connection and try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="batch-code" className="text-[14.5px] font-medium">
        Batch code
      </label>
      <p className="text-[12.5px] text-muted-foreground">
        From your class coordinator. No college email needed.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          id="batch-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. SI-BSN-7K2Q"
          autoCapitalize="characters"
          className="fl-number h-11 min-w-0 flex-1 rounded-full border border-input bg-card px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          disabled={busy || !code.trim()}
          className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Join"}
        </button>
      </div>
    </form>
  );
}

/**
 * "Delete my account": typed confirmation, then the server removes the account
 * and everything kept with it (account.functions.ts), and the phone forgets
 * the session and downloads.
 */
function DeleteAccount({ userId }: { userId: string | null }) {
  const remove = useServerFn(deleteMyAccount);
  const qc = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res = await remove({ data: { confirm: "DELETE" } });
      if (!res.ok) {
        toast.error(
          res.reason === "staff"
            ? "Faculty accounts are removed by an admin."
            : "Your account wasn't deleted. Check your connection and try again.",
        );
        setBusy(false);
        return;
      }
    } catch {
      toast.error("Your account wasn't deleted. Check your connection and try again.");
      setBusy(false);
      return;
    }
    await logOut(userId);
    qc.clear();
    router.invalidate();
    toast.success("Your account and everything kept with it have been deleted.");
    navigate({ to: "/" });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        setOpen(v);
        if (!v) setTyped("");
      }}
    >
      <AlertDialogTrigger asChild>
        <button className="mt-3 flex min-h-11 w-full items-center justify-center text-[14.5px] font-semibold text-destructive-ink">
          Delete my account
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[400px] rounded-[24px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes your progress, flashcard reviews, quiz and exam history, Ask
            Florence chats and settings. It can&apos;t be undone. Type DELETE to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Type DELETE to confirm"
          placeholder="DELETE"
          className="fl-number h-12 w-full rounded-[14px] border border-border-strong/55 bg-card px-4 text-[16px] outline-none focus-visible:border-foreground"
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep my account</AlertDialogCancel>
          <button
            onClick={() => void confirm()}
            disabled={busy || typed.trim().toUpperCase() !== "DELETE"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-destructive px-5 text-[14.5px] font-semibold text-destructive-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}Delete account
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
