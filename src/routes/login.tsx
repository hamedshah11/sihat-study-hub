import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AuthShell } from "./signup";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in — Sihat" }] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    if (!email || !password) { toast.error("Email and password are required."); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/home" });
  };

  const onForgot = async () => {
    const email = (document.querySelector('input[name="email"]') as HTMLInputElement | null)?.value?.trim();
    if (!email) { toast.error("Enter your email above first."); return; }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent.");
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue your studies.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Email</Label>
          <Input name="email" type="email" autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Password</Label>
          <Input name="password" type="password" autoComplete="current-password" />
        </div>
        <button
          type="button"
          onClick={onForgot}
          disabled={resetting}
          className="text-sm text-accent font-medium"
        >
          Forgot password?
        </button>
        <Button type="submit" disabled={submitting} className="w-full h-12 rounded-lg text-base">
          {submitting ? "Logging in…" : "Log in"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link to="/signup" className="text-accent font-medium">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
