import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Field, primaryButton } from "@/components/AuthShell";
import { CodeStep } from "@/components/CodeStep";
import { displayPhone, isEmail, isPhoneUnavailable, normalisePhone } from "@/lib/auth-otp";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: pageTitle("Sign in") }] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") ? s.next : undefined,
  }),
  component: Login,
});

type Sent = { method: "phone" | "email"; to: string };

/**
 * Sign in with phone or email. A phone number gets a code by SMS; an email
 * can use its password (accounts made before Florence have one) or a code.
 */
function Login() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) {
        if (next) window.location.href = next;
        else navigate({ to: "/home", replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  const email = isEmail(contact) ? contact.trim() : null;
  const phone = email ? null : normalisePhone(contact);

  const done = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/home" });
  };

  async function sendCode(): Promise<string | null> {
    if (phone) {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false, channel: "sms" },
      });
      if (error) {
        return isPhoneUnavailable(error.message)
          ? "Signing in by phone isn't switched on yet. Please use your email."
          : /not found|signups not allowed/i.test(error.message)
            ? "We couldn't find an account with that number. New here? Use your batch code."
            : error.message;
      }
      setSent({ method: "phone", to: phone });
      return null;
    }
    if (email) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/home` },
      });
      if (error) return error.message;
      setSent({ method: "email", to: email });
      return null;
    }
    return "Enter your phone number or email.";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(undefined);
    if (!email && !phone) {
      setError("Enter your phone number (0300 1234567) or your email.");
      return;
    }
    setBusy(true);
    if (email && password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        setError(
          /invalid login/i.test(error.message)
            ? "That email and password don't match. Try again, or get a code instead."
            : error.message,
        );
        return;
      }
      done();
      return;
    }
    const problem = await sendCode();
    setBusy(false);
    if (problem) setError(problem);
  }

  async function forgot() {
    if (!email) {
      setError("Enter your email first, then tap Forgot password.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("We've emailed you a link to reset your password.");
  }

  if (sent) {
    return (
      <AuthShell heading="Sign in">
        <CodeStep
          method={sent.method}
          sentTo={sent.method === "phone" ? displayPhone(sent.to) : sent.to}
          onVerify={async (token) => {
            const { error } =
              sent.method === "phone"
                ? await supabase.auth.verifyOtp({ phone: sent.to, token, type: "sms" })
                : await supabase.auth.verifyOtp({ email: sent.to, token, type: "email" });
            if (error) return "That code didn't work. Check it, or send a new one.";
            done();
            return null;
          }}
          onResend={async () => {
            await sendCode();
          }}
          onChange={() => setSent(null)}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Sign in"
      footer={
        <>
          <button form="sign-in" type="submit" disabled={busy} className={primaryButton}>
            {busy ? "One moment…" : email && password ? "Sign in" : "Send me a code"}
          </button>
          <p className="mt-3 text-center text-[14px] text-muted-foreground">
            New here?{" "}
            <Link to="/signup" className="font-semibold text-accent-ink">
              I have a batch code
            </Link>
          </p>
        </>
      }
    >
      <form id="sign-in" onSubmit={submit} noValidate className="space-y-5">
        <Field
          id="contact"
          label="Phone number or email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          autoComplete="username"
          placeholder="0300 1234567"
          error={error}
        />
        {email && (
          <div className="animate-fade-up">
            <Field
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              hint={
                <>
                  Leave it empty to get a sign-in code by email instead.{" "}
                  <button
                    type="button"
                    onClick={() => void forgot()}
                    className="font-semibold text-accent-ink"
                  >
                    Forgot password?
                  </button>
                </>
              }
            />
          </div>
        )}
      </form>
    </AuthShell>
  );
}
