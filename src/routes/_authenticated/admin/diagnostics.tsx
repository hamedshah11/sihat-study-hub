import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requireAdmin } from "@/lib/admin.functions";
import { Shield, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/diagnostics")({
  beforeLoad: async () => {
    try {
      await requireAdmin();
    } catch {
      throw redirect({ to: "/home" });
    }
  },
  head: () => ({ meta: [{ title: "Diagnostics — Sihat" }] }),
  component: DiagnosticsPage,
});

type CheckResult =
  | { status: "success"; value: string }
  | { status: "error"; message: string };

function DiagnosticsPage() {
  const { data: checks, isLoading } = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      const results: Record<string, CheckResult> = {};

      // 1. User email & role
      if (userErr || !user) {
        results["User session"] = {
          status: "error",
          message: userErr?.message ?? "No authenticated user",
        };
        return results;
      }

      // Fetch profile
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("email, role, batch_id, student_type")
        .eq("id", user.id)
        .maybeSingle();

      results["User session"] = {
        status: "success",
        value: `${user.email} (${profile?.role ?? "unknown"})`,
      };

      // 2. Profile row
      if (profileErr) {
        results["Profile row"] = { status: "error", message: profileErr.message };
      } else if (!profile) {
        results["Profile row"] = { status: "error", message: "Profile row missing" };
      } else {
        results["Profile row"] = { status: "success", value: "Exists" };
      }

      // 3. Streak row
      const { data: streak, error: streakErr } = await supabase
        .from("streaks")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (streakErr) {
        results["Streak row"] = { status: "error", message: streakErr.message };
      } else if (!streak) {
        results["Streak row"] = { status: "error", message: "Streak row missing" };
      } else {
        results["Streak row"] = { status: "success", value: "Exists" };
      }

      // 4. Subjects
      const { data: subjects, error: subjectsErr } = await supabase
        .from("subjects")
        .select("id")
        .limit(1);

      if (subjectsErr) {
        results["Subjects load"] = { status: "error", message: subjectsErr.message };
      } else {
        results["Subjects load"] = {
          status: "success",
          value: `${subjects?.length ?? 0} loaded`,
        };
      }

      // 5. Published chapters
      const { data: chapters, error: chaptersErr } = await supabase
        .from("chapters")
        .select("id")
        .eq("status", "published")
        .limit(1);

      if (chaptersErr) {
        results["Published chapters"] = { status: "error", message: chaptersErr.message };
      } else {
        results["Published chapters"] = {
          status: "success",
          value: `${chapters?.length ?? 0} loaded`,
        };
      }

      // 6. Approved questions
      const { data: questions, error: questionsErr } = await supabase
        .from("questions")
        .select("id")
        .eq("status", "approved")
        .limit(1);

      if (questionsErr) {
        results["Approved questions"] = { status: "error", message: questionsErr.message };
      } else {
        results["Approved questions"] = {
          status: "success",
          value: `${questions?.length ?? 0} loaded`,
        };
      }

      // 7. Approved flashcards
      const { data: flashcards, error: flashcardsErr } = await supabase
        .from("flashcards")
        .select("id")
        .eq("status", "approved")
        .limit(1);

      if (flashcardsErr) {
        results["Approved flashcards"] = { status: "error", message: flashcardsErr.message };
      } else {
        results["Approved flashcards"] = {
          status: "success",
          value: `${flashcards?.length ?? 0} loaded`,
        };
      }

      return results;
    },
  });

  const entries = checks ? Object.entries(checks) : [];

  return (
    <div>
      <div className="flex items-center gap-2">
        <Shield className="size-5 text-accent" />
        <h1 className="text-2xl font-bold text-primary">Diagnostics</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Admin-only system health checks.
      </p>

      <div className="mt-6 space-y-3">
        {isLoading &&
          Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl bg-surface p-4 h-[72px]"
            />
          ))}

        {entries.map(([name, result]) => (
          <div
            key={name}
            className="flex items-start gap-3 rounded-xl bg-surface p-4"
          >
            {result.status === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-red-500" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{name}</p>
              {result.status === "success" ? (
                <p className="text-sm text-muted-foreground">{result.value}</p>
              ) : (
                <p className="text-sm text-red-400 break-words">{result.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
