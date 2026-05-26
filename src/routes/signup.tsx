import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { applyInviteCode, markExternalStudent } from "@/lib/invite.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up — Sihat" }] }),
  component: SignUp,
});

const schema = z.object({
  displayName: z.string().trim().min(1, "Required").max(80),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(128),
  confirm: z.string(),
  inviteCode: z.string().trim().max(64).optional(),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

function SignUp() {
  const navigate = useNavigate();
  const apply = useServerFn(applyInviteCode);
  const markExternal = useServerFn(markExternalStudent);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      displayName: fd.get("displayName"),
      email: fd.get("email"),
      password: fd.get("password"),
      confirm: fd.get("confirm"),
      inviteCode: (fd.get("inviteCode") as string) || undefined,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      console.log("[signup] submitting", { email: parsed.data.email });
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/home`,
          data: { display_name: parsed.data.displayName },
        },
      });
      if (error) {
        console.error("[signup] failed", error);
        toast.error(error.message);
        return;
      }
      console.log("[signup] success", { userId: data.user?.id, hasSession: !!data.session });

      if (data.user?.id) {
        try {
          if (parsed.data.inviteCode) {
            const res = await apply({ data: { userId: data.user.id, code: parsed.data.inviteCode } });
            if (!res.ok) {
              const message =
                res.reason === "not_found" ? "That invite code doesn't exist. Check it and try again, or continue without one."
                : res.reason === "expired" ? "That invite code has expired. Ask your coordinator for a new one."
                : "That invite code has reached its maximum uses. Ask your coordinator for a new one.";
              toast.error(message);
              await markExternal({ data: { userId: data.user.id } }).catch((e) => console.warn("[signup] markExternal failed", e));
            } else {
              toast.success("Invite code applied — you're enrolled as an internal student.");
            }
          } else {
            await markExternal({ data: { userId: data.user.id } });
          }
        } catch (e) {
          // Don't block signup completion if invite/enrollment side-effects fail.
          console.warn("[signup] post-signup enrollment step failed", e);
        }
      }

      if (data.session) {
        toast.success("Account created. Welcome!");
        navigate({ to: "/home" });
      } else {
        setSent(true);
      }
    } catch (e) {
      console.error("[signup] unexpected error", e);
      toast.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start studying with Sihat.">
      {sent ? (
        <div className="rounded-xl bg-surface p-6 text-center">
          <h2 className="font-semibold text-primary">Check your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to verify your account. Open it to finish signing up.
          </p>
          <Button asChild variant="outline" className="mt-6 w-full rounded-lg">
            <Link to="/login">Back to log in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Display name" error={errors.displayName}>
            <Input name="displayName" autoComplete="name" />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input name="email" type="email" autoComplete="email" />
          </Field>
          <Field label="Password" error={errors.password}>
            <Input name="password" type="password" autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" error={errors.confirm}>
            <Input name="confirm" type="password" autoComplete="new-password" />
          </Field>
          <Field label="Invite code" hint="Optional — for Sindh Institute students">
            <Input name="inviteCode" autoComplete="off" />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full h-12 rounded-lg text-base">
            {submitting ? "Creating account…" : "Sign up"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-accent font-medium">Log in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[480px] md:max-w-[480px] px-6 pt-10 pb-12">
        <Link to="/" className="inline-flex items-center gap-2 mb-8">
          <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-sm">S</div>
          <span className="text-lg font-bold text-primary">Sihat</span>
        </Link>
        <h1 className="text-2xl font-bold text-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground mb-8">{subtitle}</p>}
        {!subtitle && <div className="mb-6" />}
        {children}
      </div>
    </div>
  );
}
