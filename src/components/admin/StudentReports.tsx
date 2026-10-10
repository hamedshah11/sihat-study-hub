import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { REPORT_REASON_LABEL, useOpenReports, useResolveReport } from "@/lib/reports-data";

/**
 * "Reported by students": problems students report from inside a question
 * or flashcard, so mistakes reach a teacher quickly. An open report blocks
 * approving that item and publishing its chapter until it's resolved.
 */
export function StudentReports({ chapterId }: { chapterId?: string }) {
  const { data, isLoading } = useOpenReports(chapterId);
  const resolve = useResolveReport();
  const [busy, setBusy] = useState<string | null>(null);
  const reports = data?.reports ?? [];

  const { data: previews } = useQuery({
    queryKey: ["content-report-previews", reports.map((r) => r.id).join(",")],
    enabled: reports.length > 0,
    queryFn: async () => {
      const qIds = reports.filter((r) => r.kind === "question").map((r) => r.item_id);
      const fIds = reports.filter((r) => r.kind === "flashcard").map((r) => r.item_id);
      const cIds = [
        ...new Set(reports.map((r) => r.chapter_id).filter((c): c is string => Boolean(c))),
      ];
      const [{ data: qs }, { data: fs }, { data: cs }] = await Promise.all([
        qIds.length
          ? supabase.from("questions").select("id, prompt").in("id", qIds)
          : Promise.resolve({ data: [] }),
        fIds.length
          ? supabase.from("flashcards").select("id, front").in("id", fIds)
          : Promise.resolve({ data: [] }),
        cIds.length
          ? supabase.from("chapters").select("id, title").in("id", cIds)
          : Promise.resolve({ data: [] }),
      ]);
      const text = new Map<string, string>();
      for (const q of (qs ?? []) as { id: string; prompt: string }[]) text.set(q.id, q.prompt);
      for (const f of (fs ?? []) as { id: string; front: string }[]) text.set(f.id, f.front);
      const chapter = new Map(
        ((cs ?? []) as { id: string; title: string }[]).map((c) => [c.id, c.title]),
      );
      return { text, chapter };
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading reports…</p>;
  if (!data?.available) {
    return (
      <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        Student reports start working once the Florence database update is applied.
      </p>
    );
  }
  if (reports.length === 0) {
    return (
      <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        No open reports. Nice.
      </p>
    );
  }

  async function act(id: string, status: "resolved" | "dismissed") {
    setBusy(id);
    try {
      await resolve(id, status);
    } catch {
      toast.error("That didn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="space-y-2.5">
      {reports.map((r) => (
        <li key={r.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="rounded-full bg-chip px-2 py-0.5 font-semibold text-chip-foreground">
              {r.kind === "question" ? "Question" : "Flashcard"}
            </span>
            <span className="font-semibold text-foreground">
              {REPORT_REASON_LABEL[r.reason] ?? r.reason}
            </span>
            <span>
              ·{" "}
              {new Date(r.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </span>
            {!chapterId && r.chapter_id && (
              <Link
                to="/admin/chapters/$chapterId"
                params={{ chapterId: r.chapter_id }}
                className="font-semibold text-accent-ink"
              >
                {previews?.chapter.get(r.chapter_id) ?? "Open chapter"}
              </Link>
            )}
          </div>
          <p className="mt-2 text-sm font-medium">{previews?.text.get(r.item_id) ?? "…"}</p>
          {r.note && <p className="mt-1 text-sm text-muted-foreground">“{r.note}”</p>}
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy === r.id}
              onClick={() => void act(r.id, "resolved")}
              className="h-9 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Fixed
            </button>
            <button
              disabled={busy === r.id}
              onClick={() => void act(r.id, "dismissed")}
              className="h-9 rounded-full border border-border-strong px-4 text-[13px] font-semibold disabled:opacity-50"
            >
              Nothing to change
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
