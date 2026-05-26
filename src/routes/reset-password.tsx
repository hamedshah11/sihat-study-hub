import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AuthShell } from "./signup";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Sihat" }] }),
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
    if (password.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated.");
    navigate({ to: "/home" });
  };

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm">New password</Label>
          <Input name="password" type="password" autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Confirm password</Label>
          <Input name="confirm" type="password" autoComplete="new-password" />
        </div>
        <Button type="submit" disabled={submitting} className="w-full h-12 rounded-lg text-base">
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
