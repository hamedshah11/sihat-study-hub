import { useQuery } from "@tanstack/react-query";
import { Check, CircleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOpenReports } from "@/lib/reports-data";

// A chapter goes live only when its checklist passes (Florence brand book,
// "For faculty"). Until then the publish option stays off.
export const PUBLISH_MIN_QUESTIONS = 15;
export const PUBLISH_MIN_FLASHCARDS = 25;

export function usePublishChecklist(chapterId: string, summary: string | null) {
  const { data: counts } = useQuery({
    queryKey: ["admin-chapter-approved", chapterId],
    queryFn: async () => {
      const [{ count: q }, { count: f }] = await Promise.all([
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("chapter_id", chapterId)
          .eq("status", "approved"),
        supabase
          .from("flashcards")
          .select("id", { count: "exact", head: true })
          .eq("chapter_id", chapterId)
          .eq("status", "approved"),
      ]);
      return { questions: q ?? 0, flashcards: f ?? 0 };
    },
  });
  const { data: reports } = useOpenReports(chapterId);
  const open = reports?.reports.length ?? 0;
  const items = [
    {
      ok: (counts?.questions ?? 0) >= PUBLISH_MIN_QUESTIONS,
      label: `At least ${PUBLISH_MIN_QUESTIONS} approved questions (${counts?.questions ?? 0})`,
    },
    {
      ok: (counts?.flashcards ?? 0) >= PUBLISH_MIN_FLASHCARDS,
      label: `At least ${PUBLISH_MIN_FLASHCARDS} approved flashcards (${counts?.flashcards ?? 0})`,
    },
    { ok: Boolean(summary?.trim()), label: "Summary notes written and reviewed" },
    {
      ok: open === 0,
      label:
        open === 0
          ? "No open student reports"
          : `${open} open student report${open === 1 ? "" : "s"}`,
    },
  ];
  return {
    items,
    ready: counts !== undefined && items.every((i) => i.ok),
    openReports: reports?.reports ?? [],
  };
}

export function PublishChecklist({ items }: { items: { ok: boolean; label: string }[] }) {
  return (
    <div className="mt-4 rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold">Before this chapter can publish</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2">
            {i.ok ? (
              <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-success-ink text-white">
                <Check className="size-3" strokeWidth={3} aria-label="Done" />
              </span>
            ) : (
              <CircleAlert
                className="size-[18px] shrink-0 text-destructive-ink"
                aria-label="Not yet"
              />
            )}
            <span className={i.ok ? "" : "text-foreground"}>{i.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-muted-foreground">
          <span className="size-4 text-center">·</span> Learning objectives coverage isn't tracked
          yet
        </li>
      </ul>
    </div>
  );
}
