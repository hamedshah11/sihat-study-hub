import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listStaffQuestions, updateStaffQuestion } from "@/lib/admin.functions";
import { useOpenReports } from "@/lib/reports-data";
import { PublishChecklist, usePublishChecklist } from "@/components/admin/PublishChecklist";
import { findSourcePassage, highlightParts } from "@/lib/source-passage";
import { pageTitle } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/review")({
  head: () => ({ meta: [{ title: pageTitle("Review") }] }),
  validateSearch: z.object({ chapter: z.string().uuid().optional().catch(undefined) }),
  component: ReviewPage,
});

type StaffQuestion = {
  id: string;
  prompt: string;
  options: unknown;
  correct_index: number;
  explanation: string | null;
  status: string | null;
};

type ChapterRow = {
  id: string;
  title: string;
  status: string | null;
  summary_md: string | null;
  display_order: number | null;
  subject_id: string | null;
  subjects: { name: string } | null;
};

/**
 * For faculty, review: AI drafts on the left, the draft with each option in
 * the middle, and the matching passage of the notes plus the publish
 * checklist on the right. Editing a question resets its approval; an open
 * student report blocks approving it.
 */
function ReviewPage() {
  const { chapter: chapterParam } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: chapters } = useQuery({
    queryKey: ["faculty-review-chapters"],
    queryFn: async () => {
      const [{ data: rows }, { data: drafts }] = await Promise.all([
        supabase
          .from("chapters")
          .select("id, title, status, summary_md, display_order, subject_id, subjects(name)")
          .order("display_order", { ascending: true }),
        supabase.from("questions").select("chapter_id").eq("status", "draft").limit(5000),
      ]);
      const draftCount = new Map<string, number>();
      for (const d of drafts ?? []) {
        if (d.chapter_id) draftCount.set(d.chapter_id, (draftCount.get(d.chapter_id) ?? 0) + 1);
      }
      return ((rows ?? []) as unknown as ChapterRow[]).map((c) => ({
        ...c,
        drafts: draftCount.get(c.id) ?? 0,
      }));
    },
  });

  const chapter = useMemo(() => {
    if (!chapters?.length) return null;
    return (
      chapters.find((c) => c.id === chapterParam) ??
      [...chapters].sort((a, b) => b.drafts - a.drafts)[0]
    );
  }, [chapters, chapterParam]);

  if (!chapters) return <p className="text-muted-foreground">Loading…</p>;
  if (!chapter) return <p className="text-muted-foreground">No chapters yet.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          Chapter
          <select
            value={chapter.id}
            onChange={(e) => navigate({ search: { chapter: e.target.value } })}
            className="h-9 max-w-[360px] rounded-lg border border-border-strong/50 bg-card px-2 text-[13.5px] text-foreground"
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.subjects?.name ? `${c.subjects.name} · ` : ""}
                {c.title}
                {c.drafts ? ` (${c.drafts} to review)` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ChapterReview key={chapter.id} chapter={chapter} />
    </div>
  );
}

function statusChip(status: string, flagged: boolean) {
  if (flagged) return { label: "Flagged", cls: "bg-destructive-bg text-destructive-ink" };
  if (status === "approved") return { label: "Approved", cls: "bg-success-bg text-success-ink" };
  if (status === "rejected")
    return { label: "Rejected", cls: "bg-muted text-muted-foreground line-through" };
  return { label: "To review", cls: "bg-chip text-chip-foreground" };
}

function ChapterReview({ chapter }: { chapter: ChapterRow & { drafts: number } }) {
  const qc = useQueryClient();
  const loadQuestions = useServerFn(listStaffQuestions);
  const { data: questions } = useQuery({
    queryKey: ["admin-chapter-questions", chapter.id],
    queryFn: async () =>
      (await loadQuestions({ data: { chapterId: chapter.id } })) as StaffQuestion[],
  });
  const { data: flashcardCounts } = useQuery({
    queryKey: ["faculty-flashcard-counts", chapter.id],
    queryFn: async () => {
      const [{ count: approved }, { count: all }] = await Promise.all([
        supabase
          .from("flashcards")
          .select("id", { count: "exact", head: true })
          .eq("chapter_id", chapter.id)
          .eq("status", "approved"),
        supabase
          .from("flashcards")
          .select("id", { count: "exact", head: true })
          .eq("chapter_id", chapter.id)
          .neq("status", "rejected"),
      ]);
      return { approved: approved ?? 0, all: all ?? 0 };
    },
  });
  const { data: reports } = useOpenReports(chapter.id);
  const flagged = new Set(
    (reports?.reports ?? []).filter((r) => r.kind === "question").map((r) => r.item_id),
  );
  const checklist = usePublishChecklist(chapter.id, chapter.summary_md);
  const visible = (questions ?? []).filter((q) => q.status !== "rejected");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    visible.find((q) => q.id === selectedId) ??
    visible.find((q) => (q.status ?? "draft") === "draft") ??
    visible[0];
  const approvedQuestions = visible.filter((q) => q.status === "approved").length;

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-chapter-questions", chapter.id] }),
      qc.invalidateQueries({ queryKey: ["admin-chapter-approved", chapter.id] }),
      qc.invalidateQueries({ queryKey: ["faculty-review-chapters"] }),
    ]);

  async function setStatus(q: StaffQuestion, status: "approved" | "rejected") {
    if (status === "approved" && flagged.has(q.id)) {
      toast.error("A student reported this question. Resolve the report first.");
      return;
    }
    const { error } = await supabase.from("questions").update({ status }).eq("id", q.id);
    if (error) toast.error(error.message);
    await refresh();
    // Move on to the next draft.
    const next = visible.find((v) => v.id !== q.id && (v.status ?? "draft") === "draft");
    if (next) setSelectedId(next.id);
  }

  async function publish() {
    if (!checklist.ready) return;
    const { error } = await supabase
      .from("chapters")
      .update({ status: "published" })
      .eq("id", chapter.id);
    if (error) toast.error(error.message);
    else toast.success("Published. Students see it at their next sync.");
    await qc.invalidateQueries({ queryKey: ["faculty-review-chapters"] });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-[13.5px] text-muted-foreground">
            {chapter.subjects?.name ?? "Subject"}
            {chapter.display_order ? ` · Chapter ${chapter.display_order}` : ""}
          </p>
          <h1 className="font-display text-[30px] leading-tight">{chapter.title}</h1>
        </div>
        <p className="flex flex-wrap gap-x-5 text-[13.5px] text-muted-foreground">
          <span>
            <b className="text-foreground">
              {approvedQuestions} of {visible.length}
            </b>{" "}
            questions approved
          </span>
          <span>
            <b className="text-foreground">
              {flashcardCounts?.approved ?? 0} of {flashcardCounts?.all ?? 0}
            </b>{" "}
            flashcards approved
          </span>
          <span>
            <b className="text-foreground">Summary</b>{" "}
            {chapter.summary_md?.trim() ? "written" : "missing"}
          </span>
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        {/* Draft list */}
        <section>
          <h2 className="px-2 text-[13.5px] font-semibold text-muted-foreground">Questions</h2>
          <ol className="mt-2 max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {visible.map((q, i) => {
              const chip = statusChip(q.status ?? "draft", flagged.has(q.id));
              return (
                <li key={q.id}>
                  <button
                    onClick={() => setSelectedId(q.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left",
                      selected?.id === q.id
                        ? "border-2 border-border-strong/40 bg-card"
                        : "border-2 border-transparent hover:bg-card/60",
                    )}
                  >
                    <span className="fl-number w-6 shrink-0 text-[12.5px] font-normal text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-[14px] leading-snug">{q.prompt}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold",
                        chip.cls,
                      )}
                    >
                      {chip.label}
                    </span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="rounded-xl bg-muted p-4 text-[13.5px] text-muted-foreground">
                No questions yet. Generate drafts from the chapter's Source tab.
              </li>
            )}
          </ol>
        </section>

        {/* The draft */}
        <section className="flex min-h-[520px] flex-col rounded-[20px] border bg-card p-5">
          {selected ? (
            <DraftView
              key={selected.id}
              q={selected}
              number={visible.indexOf(selected) + 1}
              flagged={flagged.has(selected.id)}
              onApprove={() => void setStatus(selected, "approved")}
              onReject={() => void setStatus(selected, "rejected")}
              onSaved={refresh}
            />
          ) : (
            <p className="m-auto text-[14px] text-muted-foreground">Nothing to review here.</p>
          )}
        </section>

        {/* Evidence and checklist */}
        <aside className="space-y-4 lg:col-span-2 xl:col-span-1">
          {selected && <SourcePanel chapter={chapter} q={selected} />}
          <div>
            <PublishChecklist items={checklist.items} />
            <button
              onClick={() => void publish()}
              disabled={!checklist.ready || chapter.status === "published"}
              className="mt-3 h-11 w-full rounded-full bg-primary text-[14px] font-semibold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
            >
              {chapter.status === "published" ? "Published" : "Publish to students"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function optionsOf(q: StaffQuestion) {
  return Array.isArray(q.options) ? (q.options as unknown[]).map(String) : [];
}

function DraftView({
  q,
  number,
  flagged,
  onApprove,
  onReject,
  onSaved,
}: {
  q: StaffQuestion;
  number: number;
  flagged: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const save = useServerFn(updateStaffQuestion);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(q.prompt);
  const [options, setOptions] = useState(optionsOf(q));
  const [correct, setCorrect] = useState(q.correct_index);
  const [explanation, setExplanation] = useState(q.explanation ?? "");
  const [busy, setBusy] = useState(false);
  const status = q.status ?? "draft";

  async function submitEdit() {
    setBusy(true);
    try {
      await save({
        data: {
          id: q.id,
          prompt,
          options,
          correctIndex: correct,
          explanation: explanation || null,
        },
      });
      toast.success("Saved. It needs approving again.");
      setEditing(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13.5px] text-muted-foreground">
          Question {number} · {status === "approved" ? "approved" : "AI draft · not yet reviewed"}
        </p>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[12px] font-semibold",
            statusChip(status, flagged).cls,
          )}
        >
          {statusChip(status, flagged).label}
        </span>
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border-strong/50 bg-background p-3 text-[16px] font-semibold"
          />
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                checked={correct === i}
                onChange={() => setCorrect(i)}
                aria-label={`Option ${String.fromCharCode(65 + i)} is correct`}
              />
              <input
                value={o}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-10 flex-1 rounded-lg border border-border-strong/50 bg-background px-3 text-[14px]"
              />
            </div>
          ))}
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={2}
            placeholder="Why the correct answer is right (shown to students)"
            className="w-full rounded-xl border border-border-strong/50 bg-background p-3 text-[14px]"
          />
        </div>
      ) : (
        <>
          <h2 className="mt-2 text-[19px] font-semibold leading-snug">{q.prompt}</h2>
          <div className="mt-4 space-y-2.5">
            {optionsOf(q).map((o, i) => {
              const isCorrect = i === q.correct_index;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex gap-4 rounded-[14px] border px-4 py-3",
                    isCorrect
                      ? "border-success-ink/30 bg-success-bg"
                      : "border-border bg-background/60",
                  )}
                >
                  <span className="fl-number pt-0.5 text-[13px]">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">
                      {o}
                      {isCorrect && " · correct"}
                    </span>
                    {isCorrect && q.explanation && (
                      <span className="mt-0.5 block text-[13.5px] text-muted-foreground">
                        {q.explanation}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
        {editing ? (
          <>
            <button
              onClick={() => void submitEdit()}
              disabled={busy}
              className="h-11 rounded-xl bg-primary px-5 text-[14.5px] font-semibold text-primary-foreground"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="h-11 rounded-xl border px-5 text-[14.5px] font-semibold"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onApprove}
              disabled={flagged || status === "approved"}
              className="h-11 rounded-xl bg-primary px-5 text-[14.5px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              Approve
            </button>
            <button
              onClick={() => setEditing(true)}
              className="h-11 rounded-xl border border-border-strong/60 px-5 text-[14.5px] font-semibold"
            >
              Edit
            </button>
            <button
              onClick={onReject}
              className="h-11 px-2 text-[14.5px] font-semibold text-destructive-ink"
            >
              Reject
            </button>
          </>
        )}
        <span className="text-[13px] text-muted-foreground">
          {flagged
            ? "A student reported this question. Resolve the report to approve it."
            : "Editing the question resets approval."}
        </span>
      </div>
    </>
  );
}

function SourcePanel({ chapter, q }: { chapter: ChapterRow; q: StaffQuestion }) {
  const answer = optionsOf(q)[q.correct_index] ?? "";
  const match = findSourcePassage(
    chapter.summary_md,
    `${q.prompt} ${answer} ${q.explanation ?? ""}`,
  );
  return (
    <div className="rounded-[20px] border bg-card p-4">
      <p className="text-[13.5px] text-muted-foreground">
        {match
          ? `Source · Notes · "${match.heading ?? chapter.title}", paragraph ${match.paragraphIndex}`
          : "Source · Notes"}
      </p>
      {match ? (
        <blockquote className="mt-3 border-l-[3px] border-lamp pl-3 text-[14.5px] leading-relaxed whitespace-pre-line">
          {highlightParts(match.text, match.terms).map((p, i) =>
            p.hit ? (
              <mark key={i} className="rounded-sm bg-streak-bg px-0.5 text-foreground">
                {p.text}
              </mark>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </blockquote>
      ) : (
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          No passage in the notes matches this question. Check it against the textbook before
          approving.
        </p>
      )}
      <p className="mt-2 text-[12px] text-muted-foreground">
        Closest matching passage in the approved notes.
      </p>
      <Link
        to="/admin/chapters/$chapterId"
        params={{ chapterId: chapter.id }}
        className="mt-2 inline-block text-[13.5px] font-semibold text-accent-ink"
      >
        Open full notes
      </Link>
    </div>
  );
}
