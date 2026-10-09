import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell } from "@/components/AuthShell";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: pageTitle("Sign in") }] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") ? s.next : undefined,
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Already signed in? Don't leave the user stranded on the login page.
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

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    if (!email || !password) {
      toast.error("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(
        /invalid login/i.test(error.message)
          ? "That email and password don't match. Try again, or reset your password."
          : error.message,
      );
      return;
    }
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/home" });
  };

  const onForgot = async () => {
    const email = (
      document.querySelector('input[name="email"]') as HTMLInputElement | null
    )?.value?.trim();
    if (!email) {
      toast.error("Enter your email first, then tap Forgot password.");
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) toast.error(error.message);
    else toast.success("We've emailed you a link to reset your password.");
  };

  return (
    <AuthShell title="Welcome back." subtitle="Sign in to pick up where you left off.">
      <form onSubmit={onSubmit} method="post" className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="login-email" className="text-[14px] font-semibold">
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            className="w-full px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="login-password" className="text-[14px] font-semibold">
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="w-full px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={onForgot}
          disabled={resetting}
          className="min-h-11 text-[14px] font-semibold text-accent-ink"
        >
          {resetting ? "Sending…" : "Forgot password?"}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="h-[52px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <p className="pt-2 text-center text-[14px] text-muted-foreground">
          New here?{" "}
          <Link to="/signup" className="font-semibold text-accent-ink">
            I have a batch code
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
