import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Loader2, Trash2, Check, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DiagramsManager } from "@/components/admin/DiagramsManager";
import { VideosManager } from "@/components/admin/VideosManager";
import { DiagramMarkdownImage, diagramUrlTransform } from "@/components/DiagramMarkdownImage";
import { useServerFn } from "@tanstack/react-start";
import { listStaffQuestions } from "@/lib/admin.functions";
import { StudentReports } from "@/components/admin/StudentReports";
import { useOpenReports } from "@/lib/reports-data";

// A chapter goes live only when its checklist passes (Florence brand book,
// "For faculty"). Until then the publish option stays off.
export const PUBLISH_MIN_QUESTIONS = 15;
export const PUBLISH_MIN_FLASHCARDS = 25;

function usePublishChecklist(chapterId: string, summary: string | null) {
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

function PublishChecklist({ items }: { items: { ok: boolean; label: string }[] }) {
  return (
    <div className="mt-4 rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold">Before this chapter can publish</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2">
            {i.ok ? (
              <Check className="size-4 text-success-ink" aria-label="Done" />
            ) : (
              <X className="size-4 text-destructive-ink" aria-label="Not yet" />
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

export const Route = createFileRoute("/_authenticated/admin/chapters/$chapterId")({
  head: () => ({ meta: [{ title: "Chapter — Admin" }] }),
  component: AdminChapterDetail,
});

type Chapter = {
  id: string;
  title: string;
  status: string | null;
  summary_md: string | null;
  subject_id: string | null;
};
type Question = {
  id: string;
  prompt: string;
  options: unknown;
  correct_index: number;
  explanation: string | null;
  status: string | null;
  difficulty: string | null;
};
type Flashcard = {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  status: string | null;
};

const STATUS_OPTIONS = ["draft", "in_review", "published"] as const;

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    in_review: "bg-warning-bg text-warning-ink",
    published: "bg-success-bg text-success-ink",
    approved: "bg-success-bg text-success-ink",
    rejected: "bg-destructive-bg text-destructive-ink",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

function AdminChapterDetail() {
  const { chapterId } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-chapter", chapterId],
    queryFn: async () => {
      const { data: chapter } = await supabase
        .from("chapters")
        .select("id, title, status, summary_md, subject_id")
        .eq("id", chapterId)
        .maybeSingle();
      const subject = chapter?.subject_id
        ? (
            await supabase
              .from("subjects")
              .select("id, name")
              .eq("id", chapter.subject_id)
              .maybeSingle()
          ).data
        : null;
      return { chapter: chapter as Chapter | null, subject };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-chapter", chapterId] });
  const checklist = usePublishChecklist(chapterId, data?.chapter?.summary_md ?? null);

  const updateStatus = async (status: string) => {
    if (status === "published" && data?.chapter?.status !== "published" && !checklist.ready) {
      toast.error("This chapter can publish once every item on its checklist passes.");
      return;
    }
    await supabase.from("chapters").update({ status }).eq("id", chapterId);
    invalidate();
    qc.invalidateQueries({ queryKey: ["admin-content-tree"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading…</div>;
  }
  if (!data?.chapter) {
    return (
      <div>
        <Link
          to="/admin"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Admin
        </Link>
        <div className="mt-6 rounded-xl bg-surface p-6 text-sm text-muted-foreground">
          Chapter not found.
        </div>
      </div>
    );
  }

  const chapter = data.chapter;
  const status = chapter.status ?? "draft";

  return (
    <div>
      <Link
        to="/admin"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Admin
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{data.subject?.name ?? "—"}</p>
          <h1 className="text-2xl font-bold text-primary">{chapter.title}</h1>
          <div className="mt-2">
            <Badge className={statusBadgeClass(status)}>{status}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Status</span>
          <Select value={status} onValueChange={updateStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem
                  key={s}
                  value={s}
                  disabled={s === "published" && status !== "published" && !checklist.ready}
                >
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Students only see chapters with status <span className="font-mono">published</span>.
      </p>
      <PublishChecklist items={checklist.items} />

      <Tabs defaultValue="source" className="mt-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
          <TabsTrigger value="diagrams">Diagrams</TabsTrigger>
          <TabsTrigger value="videos">Videos</TabsTrigger>
          <TabsTrigger value="reports">
            Reports{checklist.openReports.length ? ` (${checklist.openReports.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="source">
          <SourceTab chapterId={chapterId} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesTab chapter={chapter} onSaved={invalidate} />
        </TabsContent>
        <TabsContent value="questions">
          <QuestionsTab chapterId={chapterId} />
        </TabsContent>
        <TabsContent value="flashcards">
          <FlashcardsTab chapterId={chapterId} />
        </TabsContent>
        <TabsContent value="diagrams">
          <DiagramsManager chapterId={chapterId} />
        </TabsContent>
        <TabsContent value="reports">
          <div className="mt-4">
            <StudentReports chapterId={chapterId} />
          </div>
        </TabsContent>
        <TabsContent value="videos">
          <VideosManager
            chapterId={chapterId}
            chapterTitle={chapter.title}
            subjectId={chapter.subject_id}
            subjectName={data.subject?.name ?? ""}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------ SOURCE TAB ------------------------------ */

const MIN_SRC = 1;
const MAX_SRC = 50_000;

type GenerateResult = {
  inserted?: { questions?: number; flashcards?: number };
  dropped_duplicates?: { questions?: number; flashcards?: number };
};

// e.g. "Generated 42 questions (18 duplicates filtered) and 50 flashcards".
// The "(N duplicates filtered)" suffix only appears when the count is non-zero.
function generateToastMessage(data: unknown): string {
  const res = (data ?? {}) as GenerateResult;
  const part = (count: number, noun: string, dropped: number) =>
    `${count} ${noun}${dropped > 0 ? ` (${dropped} duplicate${dropped === 1 ? "" : "s"} filtered)` : ""}`;
  const q = part(res.inserted?.questions ?? 0, "questions", res.dropped_duplicates?.questions ?? 0);
  const f = part(
    res.inserted?.flashcards ?? 0,
    "flashcards",
    res.dropped_duplicates?.flashcards ?? 0,
  );
  return `Generated ${q} and ${f}`;
}

const DEFAULT_QUESTION_COUNT = 30;
const DEFAULT_FLASHCARD_COUNT = 50;

function SourceTab({ chapterId }: { chapterId: string }) {
  const qc = useQueryClient();
  const [source, setSource] = useState("");
  const [questionCount, setQuestionCount] = useState(String(DEFAULT_QUESTION_COUNT));
  const [flashcardCount, setFlashcardCount] = useState(String(DEFAULT_FLASHCARD_COUNT));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmGen, setConfirmGen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: counts } = useQuery({
    queryKey: ["admin-chapter-counts", chapterId],
    queryFn: async () => {
      const [{ count: q }, { count: f }] = await Promise.all([
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("chapter_id", chapterId),
        supabase
          .from("flashcards")
          .select("id", { count: "exact", head: true })
          .eq("chapter_id", chapterId),
      ]);
      return { questions: q ?? 0, flashcards: f ?? 0 };
    },
  });

  const len = source.length;
  const qNum = Number(questionCount);
  const fNum = Number(flashcardCount);
  const countsValid =
    Number.isInteger(qNum) &&
    qNum >= 1 &&
    qNum <= 100 &&
    Number.isInteger(fNum) &&
    fNum >= 1 &&
    fNum <= 100;
  const invalid = len < MIN_SRC || len > MAX_SRC || !countsValid;
  const hasExisting = (counts?.questions ?? 0) + (counts?.flashcards ?? 0) > 0;

  const runGenerate = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          chapterId,
          sourceMaterial: source,
          questionCount: qNum,
          flashcardCount: fNum,
        },
      });

      if (error) throw error;
      setResult(data);
      toast.success(generateToastMessage(data));
      qc.invalidateQueries({ queryKey: ["admin-chapter-counts", chapterId] });
      qc.invalidateQueries({ queryKey: ["admin-chapter-questions", chapterId] });
      qc.invalidateQueries({ queryKey: ["admin-chapter-flashcards", chapterId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onGenerateClick = () => {
    if (invalid || busy) return;
    if (hasExisting) setConfirmGen(true);
    else runGenerate();
  };

  const deleteDrafts = async () => {
    setDeleting(true);
    await Promise.all([
      supabase.from("questions").delete().eq("chapter_id", chapterId).eq("status", "draft"),
      supabase.from("flashcards").delete().eq("chapter_id", chapterId).eq("status", "draft"),
    ]);
    setDeleting(false);
    setConfirmDelete(false);
    qc.invalidateQueries({ queryKey: ["admin-chapter-counts", chapterId] });
    qc.invalidateQueries({ queryKey: ["admin-chapter-questions", chapterId] });
    qc.invalidateQueries({ queryKey: ["admin-chapter-flashcards", chapterId] });
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Source material</p>
        <Textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste source material here…"
          className="mt-2 min-h-[280px]"
          disabled={busy}
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span
            className={
              len > 0 && (len < MIN_SRC || len > MAX_SRC)
                ? "text-destructive"
                : "text-muted-foreground"
            }
          >
            {len.toLocaleString()} / {MAX_SRC.toLocaleString()} characters
          </span>
          <span className="text-muted-foreground">
            Existing: {counts?.questions ?? 0} questions · {counts?.flashcards ?? 0} flashcards
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Questions
            <Input
              type="number"
              min={1}
              max={100}
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value)}
              disabled={busy}
              className="h-9 w-24"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Flashcards
            <Input
              type="number"
              min={1}
              max={100}
              value={flashcardCount}
              onChange={(e) => setFlashcardCount(e.target.value)}
              disabled={busy}
              className="h-9 w-24"
            />
          </label>
          <Button onClick={onGenerateClick} disabled={busy || invalid}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? "Generating…" : "Generate content"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmDelete(true)}
            disabled={busy || deleting}
          >
            <Trash2 className="size-4" /> Delete all draft content
          </Button>
        </div>
        {!countsValid && (
          <p className="mt-2 text-xs text-destructive">
            Counts must be whole numbers between 1 and 100.
          </p>
        )}

        {busy && (
          <p className="mt-2 text-xs text-muted-foreground">
            This usually takes 30–60 seconds. Keep this tab open.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-destructive break-words">{error}</p>}
      </div>

      {result !== null && (
        <div className="rounded-xl bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Result</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-3 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      <AlertDialog open={confirmGen} onOpenChange={setConfirmGen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This chapter already has content</AlertDialogTitle>
            <AlertDialogDescription>
              Generating again will ADD more drafts, not replace existing ones. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmGen(false);
                runGenerate();
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all draft content?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all draft questions and flashcards for this chapter. Approved and
              rejected items are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteDrafts} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete drafts"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------ NOTES TAB ------------------------------ */

function NotesTab({ chapter, onSaved }: { chapter: Chapter; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chapter.summary_md ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await supabase.from("chapters").update({ summary_md: draft }).eq("id", chapter.id);
    setBusy(false);
    setEditing(false);
    onSaved();
  };

  if (editing) {
    return (
      <div className="mt-4 space-y-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[400px] font-mono text-sm"
        />
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDraft(chapter.summary_md ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setDraft(chapter.summary_md ?? "");
            setEditing(true);
          }}
        >
          Edit
        </Button>
      </div>
      <div className="rounded-xl bg-surface p-5">
        <div className="prose">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={diagramUrlTransform}
            components={{ img: DiagramMarkdownImage }}
          >
            {chapter.summary_md || "_No notes yet._"}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ QUESTIONS TAB ------------------------------ */

const STATUS_FILTERS = ["all", "draft", "approved", "rejected"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function QuestionsTab({ chapterId }: { chapterId: string }) {
  const qc = useQueryClient();
  const loadQuestions = useServerFn(listStaffQuestions);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data: questions, isLoading } = useQuery({
    queryKey: ["admin-chapter-questions", chapterId],
    queryFn: async () => (await loadQuestions({ data: { chapterId } })) as Question[],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-chapter-questions", chapterId] });
    qc.invalidateQueries({ queryKey: ["admin-chapter-counts", chapterId] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const { data: reportData } = useOpenReports(chapterId);
  const flagged = new Set(
    (reportData?.reports ?? []).filter((r) => r.kind === "question").map((r) => r.item_id),
  );
  const setStatus = async (id: string, status: string) => {
    if (status === "approved" && flagged.has(id)) {
      toast.error("A student reported this question. Resolve the report first.");
      return;
    }
    await supabase.from("questions").update({ status }).eq("id", id);
    invalidate();
    qc.invalidateQueries({ queryKey: ["admin-chapter-approved", chapterId] });
  };
  const remove = async (id: string) => {
    await supabase.from("questions").delete().eq("id", id);
    invalidate();
  };
  const approveAllDrafts = async () => {
    await supabase
      .from("questions")
      .update({ status: "approved" })
      .eq("chapter_id", chapterId)
      .eq("status", "draft");
    invalidate();
    qc.invalidateQueries({ queryKey: ["admin-chapter-approved", chapterId] });
  };

  const visible = (questions ?? []).filter((q) =>
    filter === "all" ? true : (q.status ?? "draft") === filter,
  );

  return (
    <div className="mt-4 space-y-3">
      <ListToolbar
        filter={filter}
        setFilter={setFilter}
        onApproveAll={approveAllDrafts}
        total={questions?.length ?? 0}
      />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && visible.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-xl bg-surface p-4">No questions.</p>
      )}
      {visible.map((q) => {
        const options = Array.isArray(q.options) ? (q.options as unknown[]) : [];
        const st = q.status ?? "draft";
        return (
          <div key={q.id} className="rounded-xl bg-surface p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{q.prompt}</p>
              <div className="flex shrink-0 gap-1.5">
                {flagged.has(q.id) && (
                  <Badge className="bg-destructive-bg text-destructive-ink">Reported</Badge>
                )}
                <Badge className={statusBadgeClass(st)}>{st}</Badge>
              </div>
            </div>
            <ol className="space-y-1 text-sm">
              {options.map((opt, i) => (
                <li
                  key={i}
                  className={
                    "rounded-md px-2 py-1 " +
                    (i === q.correct_index
                      ? "bg-accent/15 text-foreground font-medium"
                      : "text-muted-foreground")
                  }
                >
                  {String.fromCharCode(65 + i)}. {String(opt)}
                  {i === q.correct_index && " ✓"}
                </li>
              ))}
            </ol>
            {q.explanation && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Explanation:</span> {q.explanation}
              </p>
            )}
            <RowActions
              onApprove={() => setStatus(q.id, "approved")}
              onReject={() => setStatus(q.id, "rejected")}
              onDelete={() => remove(q.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ FLASHCARDS TAB ------------------------------ */

function FlashcardsTab({ chapterId }: { chapterId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data: cards, isLoading } = useQuery({
    queryKey: ["admin-chapter-flashcards", chapterId],
    queryFn: async () => {
      const { data } = await supabase
        .from("flashcards")
        .select("id, front, back, hint, status")
        .eq("chapter_id", chapterId)
        .order("created_at", { ascending: true });
      return (data ?? []) as Flashcard[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-chapter-flashcards", chapterId] });
    qc.invalidateQueries({ queryKey: ["admin-chapter-counts", chapterId] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const { data: reportData } = useOpenReports(chapterId);
  const flagged = new Set(
    (reportData?.reports ?? []).filter((r) => r.kind === "flashcard").map((r) => r.item_id),
  );
  const setStatus = async (id: string, status: string) => {
    if (status === "approved" && flagged.has(id)) {
      toast.error("A student reported this flashcard. Resolve the report first.");
      return;
    }
    await supabase.from("flashcards").update({ status }).eq("id", id);
    invalidate();
    qc.invalidateQueries({ queryKey: ["admin-chapter-approved", chapterId] });
  };
  const remove = async (id: string) => {
    await supabase.from("flashcards").delete().eq("id", id);
    invalidate();
  };
  const approveAllDrafts = async () => {
    await supabase
      .from("flashcards")
      .update({ status: "approved" })
      .eq("chapter_id", chapterId)
      .eq("status", "draft");
    invalidate();
    qc.invalidateQueries({ queryKey: ["admin-chapter-approved", chapterId] });
  };

  const visible = (cards ?? []).filter((c) =>
    filter === "all" ? true : (c.status ?? "draft") === filter,
  );

  return (
    <div className="mt-4 space-y-3">
      <ListToolbar
        filter={filter}
        setFilter={setFilter}
        onApproveAll={approveAllDrafts}
        total={cards?.length ?? 0}
      />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && visible.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-xl bg-surface p-4">No flashcards.</p>
      )}
      {visible.map((c) => {
        const st = c.status ?? "draft";
        return (
          <div key={c.id} className="rounded-xl bg-surface p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Front</p>
                  <p className="text-sm font-medium text-foreground">{c.front}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Back</p>
                  <p className="text-sm text-foreground">{c.back}</p>
                </div>
                {c.hint && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Hint:</span> {c.hint}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                {flagged.has(c.id) && (
                  <Badge className="bg-destructive-bg text-destructive-ink">Reported</Badge>
                )}
                <Badge className={statusBadgeClass(st)}>{st}</Badge>
              </div>
            </div>
            <RowActions
              onApprove={() => setStatus(c.id, "approved")}
              onReject={() => setStatus(c.id, "rejected")}
              onDelete={() => remove(c.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ SHARED BITS ------------------------------ */

function ListToolbar({
  filter,
  setFilter,
  onApproveAll,
  total,
}: {
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  onApproveAll: () => void;
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{total} total</span>
      </div>
      <Button variant="outline" onClick={onApproveAll}>
        <Check className="size-4" /> Approve all drafts
      </Button>
    </div>
  );
}

function RowActions({
  onApprove,
  onReject,
  onDelete,
}: {
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={onApprove}>
        <Check className="size-4" /> Approve
      </Button>
      <Button size="sm" variant="outline" onClick={onReject}>
        <X className="size-4" /> Reject
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="size-4" /> Delete
      </Button>
    </div>
  );
}
