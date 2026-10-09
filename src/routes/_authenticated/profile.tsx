import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Lockup } from "@/components/brand/Lockup";
import { applyInviteCode } from "@/lib/invite.functions";
import { getStudentSettings, updateStudentSettings, type StudentSettings } from "@/lib/settings.functions";
import { getThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";
import { invalidateProgress } from "@/lib/progress-data";
import { pageTitle } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: pageTitle("Settings") }] }),
  component: SettingsPage,
});

const APP_VERSION = "2.0";
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
        const { data: b } = await supabase.from("batches").select("name").eq("id", profile.batch_id).maybeSingle();
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    qc.clear();
    router.invalidate();
    navigate({ to: "/login" });
  };

  const staff = account?.role === "admin" || account?.role === "instructor";

  return (
    <div className="mx-auto max-w-xl pb-6 pt-2">
      <Link
        to="/home"
        className="-ml-2 inline-flex min-h-11 items-center gap-0.5 pr-3 text-[14px] font-medium text-muted-foreground hover:text-foreground md:hidden"
      >
        <ChevronLeft className="size-5" /> Today
      </Link>
      <h1 className="mt-1 font-display text-[30px] leading-tight">Settings</h1>

      <Group title="Theme">
        <div className="p-3">
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 rounded-full bg-muted p-1">
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
                  "h-10 rounded-full text-[13.5px] font-semibold",
                  theme === value ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 px-1 text-[13px] leading-snug text-muted-foreground">
            Automatic uses Lamplight mode from 8 pm to 6 am and never switches during a session.
          </p>
        </div>
      </Group>

      <Group title="Reminders" note="Off until you turn them on, and never more than one a day.">
        <Row label="Daily reminder" hint="One a day at most">
          <Switch
            checked={settings?.reminderEnabled ?? false}
            disabled={!settings?.available}
            onCheckedChange={(on) => {
              void update({ reminderEnabled: on });
              if (on && "Notification" in window && Notification.permission === "default") {
                void Notification.requestPermission();
              }
            }}
            aria-label="Daily reminder"
          />
        </Row>
        <Row label="Time" hint="When the reminder comes">
          <input
            type="time"
            value={settings?.reminderTime ?? "21:00"}
            disabled={!settings?.available || !settings?.reminderEnabled}
            onChange={(e) => e.target.value && void update({ reminderTime: e.target.value })}
            className="fl-number h-10 rounded-xl border border-input bg-card px-2 text-[14px] disabled:opacity-50"
            aria-label="Reminder time"
          />
        </Row>
        <Row label="WhatsApp reminders" hint="Off until you allow it">
          <Switch
            checked={settings?.whatsappOptIn ?? false}
            disabled={!settings?.available}
            onCheckedChange={(on) => void update({ whatsappOptIn: on })}
            aria-label="WhatsApp reminders"
          />
        </Row>
        <p className="px-4 pb-3 text-[12.5px] leading-snug text-muted-foreground">
          Reminders are being switched on in a coming update. Your choices are saved now.
        </p>
      </Group>

      <Group title="Batch">
        <Row label="Show me in study circles" hint="Friends in your circle see only whether you studied today">
          <Switch
            checked={settings?.showInCircles ?? false}
            disabled={!settings?.available}
            onCheckedChange={(on) => void update({ showInCircles: on })}
            aria-label="Show me in study circles"
          />
        </Row>
        <BatchRow batch={account?.batch ?? null} />
      </Group>

      <Group title="Account">
        <Row label="Name">
          <span className="max-w-[55%] truncate text-[14px] text-muted-foreground">{account?.name || "–"}</span>
        </Row>
        <Row label="Email">
          <span className="max-w-[60%] truncate text-[14px] text-muted-foreground">{account?.email || "–"}</span>
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

      <footer className="mt-10 flex flex-col items-center gap-2 text-center">
        <Lockup height={24} />
        <p className="text-[12.5px] text-muted-foreground">
          Content reviewed by SIHAT faculty · Version {APP_VERSION}
        </p>
      </footer>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">{title}</h2>
      <div className="mt-2 divide-y overflow-hidden rounded-[20px] border bg-card">{children}</div>
      {note && <p className="mt-1.5 px-1 text-[12.5px] text-muted-foreground">{note}</p>}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium">{label}</p>
        {hint && <p className="text-[12.5px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
      {children}
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
            await Promise.all([qc.invalidateQueries({ queryKey: ["profile-page"] }), invalidateProgress(qc)]);
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
      <p className="text-[12.5px] text-muted-foreground">From your class coordinator. No college email needed.</p>
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
