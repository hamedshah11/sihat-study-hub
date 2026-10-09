import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell } from "@/components/AuthShell";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: pageTitle("New password") }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Your password is updated.");
    navigate({ to: "/home" });
  };

  return (
    <AuthShell title="Set a new password." back={{ to: "/login", label: "Sign in" }}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="reset-password" className="text-[14px] font-semibold">
            New password
          </label>
          <input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            className="w-full px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[12.5px] text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="reset-confirm" className="text-[14px] font-semibold">
            Type it again
          </label>
          <input
            id="reset-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            className="w-full px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="h-[52px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save password"}
        </button>
      </form>
    </AuthShell>
  );
}
