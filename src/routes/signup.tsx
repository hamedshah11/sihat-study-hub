import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Field, primaryButton } from "@/components/AuthShell";
import { CodeStep } from "@/components/CodeStep";
import { previewBatchCode, type BatchPreview } from "@/lib/invite.functions";
import { displayPhone, isEmail, isPhoneUnavailable, normalisePhone } from "@/lib/auth-otp";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: pageTitle("Join your batch") }] }),
  // Coordinators can share a link with the code filled in: /signup?code=…
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === "string" && s.code.length <= 64 ? s.code : undefined,
  }),
  component: JoinBatch,
});

type Found = Extract<BatchPreview, { ok: true }>;
type Sent = { method: "phone" | "email"; to: string };

const nameSchema = z.string().trim().min(1, "Enter your name").max(80);

/**
 * "Join your batch" (Join sheet, screen 3): the batch code shows the
 * college, programme and semester before anything is saved, then a name and
 * phone number. Sign-in is by a one-time code; email works too. The batch
 * code is redeemed once the account exists (AppShell's PendingInviteRedemption).
 */
function JoinBatch() {
  const { code: codeFromLink } = Route.useSearch();
  const navigate = useNavigate();
  const preview = useServerFn(previewBatchCode);
  const [code, setCode] = useState(codeFromLink ?? "");
  const [found, setFound] = useState<Found | null>(null);
  const [codeError, setCodeError] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [useEmail, setUseEmail] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; contact?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  // Look the code up as soon as it looks complete.
  useEffect(() => {
    const trimmed = code.trim();
    setFound(null);
    setCodeError(undefined);
    if (trimmed.length < 6) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setChecking(true);
      try {
        const res = await preview({ data: { code: trimmed } });
        if (cancelled) return;
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
        if (!cancelled) setCodeError("We couldn't check the code. Check your connection.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, preview]);

  const metadata = () => ({ display_name: name.trim(), pending_invite_code: code.trim() });

  async function send(): Promise<string | null> {
    if (useEmail) {
      const email = contact.trim();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: metadata(),
          emailRedirectTo: `${window.location.origin}/intro`,
        },
      });
      if (error) return error.message;
      setSent({ method: "email", to: email });
      return null;
    }
    const phone = normalisePhone(contact)!;
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true, data: metadata(), channel: "sms" },
    });
    if (error) {
      if (isPhoneUnavailable(error.message)) {
        setUseEmail(true);
        setContact("");
        return "Signing in by phone isn't switched on yet. Please use your email for now.";
      }
      return error.message;
    }
    setSent({ method: "phone", to: phone });
    return null;
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !found) return;
    const next: typeof errors = {};
    const parsedName = nameSchema.safeParse(name);
    if (!parsedName.success) next.name = parsedName.error.issues[0].message;
    if (useEmail ? !isEmail(contact) : !normalisePhone(contact)) {
      next.contact = useEmail
        ? "Enter a valid email address."
        : "Enter your mobile number, for example 0300 1234567.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const problem = await send();
    if (problem) setErrors({ contact: problem });
    setBusy(false);
  }

  async function verify(token: string): Promise<string | null> {
    if (!sent) return null;
    const { error } =
      sent.method === "phone"
        ? await supabase.auth.verifyOtp({ phone: sent.to, token, type: "sms" })
        : await supabase.auth.verifyOtp({ email: sent.to, token, type: "email" });
    if (error) return "That code didn't work. Check it, or send a new one.";
    navigate({ to: "/intro" });
    return null;
  }

  if (sent) {
    return (
      <AuthShell heading="Join your batch">
        <CodeStep
          method={sent.method}
          sentTo={sent.method === "phone" ? displayPhone(sent.to) : sent.to}
          onVerify={verify}
          onResend={async () => {
            await send();
          }}
          onChange={() => setSent(null)}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Join your batch"
      footer={
        <>
          <button
            form="join-form"
            type="submit"
            disabled={busy || !found}
            className={primaryButton}
          >
            {busy ? "Joining…" : "Join batch"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCode("");
              setFound(null);
            }}
            className="mt-2 flex min-h-11 w-full items-center justify-center text-[15px] font-semibold text-accent-ink"
          >
            Wrong college or semester?
          </button>
        </>
      }
    >
      <form id="join-form" onSubmit={join} noValidate className="space-y-5">
        <Field
          id="batch-code"
          label="Batch code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="SIHAT-26-BSN1"
          className="fl-number tracking-[0.04em]"
          hint={
            checking
              ? "Checking…"
              : !found
                ? "From your class coordinator. No college email needed."
                : undefined
          }
          error={codeError}
        />

        {found && (
          <div className="animate-fade-up rounded-[18px] bg-card p-4 shadow-soft">
            <p className="flex items-center gap-2.5 text-[15px] font-semibold">
              <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
                <circle cx="10" cy="10" r="10" fill="var(--success-ink)" />
                <path
                  d="M5.8 10.2l2.7 2.7 5.7-5.8"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Code found. Is this you?
            </p>
            <dl className="mt-3 grid grid-cols-[112px_1fr] gap-y-2 pl-1 text-[14.5px]">
              <dt className="text-muted-foreground">College</dt>
              <dd className="font-semibold">{found.college}</dd>
              <dt className="text-muted-foreground">Programme</dt>
              <dd className="font-semibold">{found.programme ?? found.batch}</dd>
              <dt className="text-muted-foreground">Semester</dt>
              <dd className="font-semibold">{found.semester ?? "To be set"}</dd>
              <dt className="text-muted-foreground">Subjects</dt>
              <dd className="font-semibold">
                {found.subjects}, with {found.chaptersReady} chapter
                {found.chaptersReady === 1 ? "" : "s"} ready
              </dd>
            </dl>
          </div>
        )}

        {found && (
          <>
            <Field
              id="your-name"
              label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Ayesha Memon"
              error={errors.name}
            />
            <Field
              id="contact"
              label={useEmail ? "Email" : "Phone number"}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              type={useEmail ? "email" : "tel"}
              inputMode={useEmail ? "email" : "tel"}
              autoComplete={useEmail ? "email" : "tel"}
              placeholder={useEmail ? "you@example.com" : "0300 1234567"}
              error={errors.contact}
              hint={
                <>
                  For signing in. We never show it to classmates.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setUseEmail((v) => !v);
                      setContact("");
                      setErrors({});
                    }}
                    className="font-semibold text-accent-ink"
                  >
                    {useEmail ? "Use a phone number" : "Use email instead"}
                  </button>
                </>
              }
            />
          </>
        )}
      </form>
    </AuthShell>
  );
}
