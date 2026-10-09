import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, FieldError } from "@/components/AuthShell";
import { previewBatchCode, type BatchPreview } from "@/lib/invite.functions";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: pageTitle("Join your batch") }] }),
  // Coordinators can share a link with the code filled in: /signup?code=…
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === "string" && s.code.length <= 64 ? s.code : undefined,
  }),
  component: JoinBatch,
});

const accountSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(128),
});

type Found = Extract<BatchPreview, { ok: true }>;

/**
 * Joining starts with the batch code the college hands out, so every student
 * lands in the right college, programme and semester on day one. The code is
 * checked and shown before anything is saved; it's redeemed only after the
 * account exists (AppShell's PendingInviteRedemption).
 */
function JoinBatch() {
  const { code: codeFromLink } = Route.useSearch();
  const navigate = useNavigate();
  const preview = useServerFn(previewBatchCode);
  const [code, setCode] = useState(codeFromLink ?? "");
  const [found, setFound] = useState<Found | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ids = { code: useId(), name: useId(), email: useId(), password: useId() };

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || checking) return;
    setChecking(true);
    setCodeError(null);
    try {
      const res = await preview({ data: { code: code.trim() } });
      if (res.ok) setFound(res);
      else
        setCodeError(
          res.reason === "expired"
            ? "That code has expired. Ask your class coordinator for a new one."
            : res.reason === "exhausted"
              ? "That code is full. Ask your class coordinator for a new one."
              : "That code didn't work. Check it with your class coordinator.",
        );
    } catch {
      setCodeError("We couldn't check the code. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  async function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !found) return;
    const fd = new FormData(e.currentTarget);
    const parsed = accountSchema.safeParse({
      displayName: fd.get("displayName"),
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/home`,
          data: {
            display_name: parsed.data.displayName,
            // Survives email confirmation (even on another device); the app
            // redeems it against the signed-in student's own profile.
            pending_invite_code: code.trim(),
          },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data.session) navigate({ to: "/intro" });
      else setSentTo(parsed.data.email);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email." back={{ to: "/login", label: "Sign in" }}>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          We sent a link to <span className="font-semibold text-foreground">{sentTo}</span>. Open it on this phone to
          finish joining {found?.batch ?? "your batch"}.
        </p>
        <p className="mt-3 text-[13.5px] text-muted-foreground">
          Can't find it? Look in your spam or promotions folder.
        </p>
      </AuthShell>
    );
  }

  if (!found) {
    return (
      <AuthShell
        title="Join your batch."
        subtitle="Enter the batch code from your class coordinator. No college email needed."
      >
        <form onSubmit={checkCode} className="space-y-2">
          <label htmlFor={ids.code} className="text-[14px] font-semibold">
            Batch code
          </label>
          <input
            id={ids.code}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. SI-BSN-7K2Q"
            className="fl-number w-full px-4 tracking-[0.06em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <FieldError>{codeError ?? undefined}</FieldError>
          <button
            type="submit"
            disabled={checking || !code.trim()}
            className="mt-3 h-[52px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {checking ? "Checking…" : "Find my batch"}
          </button>
        </form>
        <p className="mt-6 text-center text-[14px] text-muted-foreground">
          Already joined?{" "}
          <Link to="/login" className="font-semibold text-accent-ink">
            Sign in
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Join your batch." back={null}>
      <div className="rounded-[20px] border bg-card p-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <CheckCircle2 className="size-[18px] text-success-ink" aria-hidden /> Code found. Is this you?
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
          <dt className="text-muted-foreground">College</dt>
          <dd className="font-medium">{found.college}</dd>
          <dt className="text-muted-foreground">Programme</dt>
          <dd className="font-medium">{found.programme ?? found.batch}</dd>
          <dt className="text-muted-foreground">Semester</dt>
          <dd className="font-medium">{found.semester ?? "To be set"}</dd>
          <dt className="text-muted-foreground">Subjects</dt>
          <dd className="font-medium">
            {found.subjects}, with {found.chaptersReady} chapter{found.chaptersReady === 1 ? "" : "s"} ready
          </dd>
        </dl>
      </div>

      <form onSubmit={join} className="mt-5 space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor={ids.name} className="text-[14px] font-semibold">
            Your name
          </label>
          <input id={ids.name} name="displayName" autoComplete="name" className="w-full px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <FieldError>{errors.displayName}</FieldError>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.email} className="text-[14px] font-semibold">
            Email
          </label>
          <input
            id={ids.email}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            className="w-full px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[12.5px] text-muted-foreground">For signing in. We never show it to classmates.</p>
          <FieldError>{errors.email}</FieldError>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.password} className="text-[14px] font-semibold">
            Password
          </label>
          <input
            id={ids.password}
            name="password"
            type="password"
            autoComplete="new-password"
            className="w-full px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[12.5px] text-muted-foreground">At least 8 characters.</p>
          <FieldError>{errors.password}</FieldError>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="h-[52px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Joining…" : "Join batch"}
        </button>
        <button
          type="button"
          onClick={() => {
            setFound(null);
            setCodeError(null);
          }}
          className="min-h-11 w-full text-[14px] font-semibold text-accent-ink"
        >
          Wrong college or semester?
        </button>
      </form>
    </AuthShell>
  );
}
