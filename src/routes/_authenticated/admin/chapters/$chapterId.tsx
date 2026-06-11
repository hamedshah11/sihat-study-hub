import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DiagramsManager } from "@/components/admin/DiagramsManager";
import { DiagramMarkdownImage } from "@/components/DiagramMarkdownImage";

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
    in_review: "bg-amber-100 text-amber-900",
    published: "bg-accent text-accent-foreground",
    approved: "bg-accent text-accent-foreground",
    rejected: "bg-destructive/15 text-destructive",
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

  const updateStatus = async (status: string) => {
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
        <Link to="/admin" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
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
      <Link to="/admin" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
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
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Students only see chapters with status <span className="font-mono">published</span>.
      </p>

      <Tabs defaultValue="source" className="mt-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
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
      </Tabs>
    </div>
  );
}

/* ------------------------------ SOURCE TAB ------------------------------ */

const MIN_SRC = 1;
const MAX_SRC = 50_000;

function SourceTab({ chapterId }: { chapterId: string }) {
  const qc = useQueryClient();
  const [source, setSource] = useState("");
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
        supabase.from("questions").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId),
        supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId),
      ]);
      return { questions: q ?? 0, flashcards: f ?? 0 };
    },
  });

  const len = source.length;
  const invalid = len < MIN_SRC || len > MAX_SRC;
  const hasExisting = (counts?.questions ?? 0) + (counts?.flashcards ?? 0) > 0;

  const runGenerate = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: { chapterId, sourceMaterial: source },
      });
      if (error) throw error;
      setResult(data);
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
          <span className={invalid && len > 0 ? "text-destructive" : "text-muted-foreground"}>
            {len.toLocaleString()} / {MAX_SRC.toLocaleString()} characters
          </span>
          <span className="text-muted-foreground">
            Existing: {counts?.questions ?? 0} questions · {counts?.flashcards ?? 0} flashcards
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onGenerateClick} disabled={busy || invalid}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? "Generating…" : "Generate content"}
          </Button>
          <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={busy || deleting}>
            <Trash2 className="size-4" /> Delete all draft content
          </Button>
        </div>
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
            <AlertDialogAction onClick={() => { setConfirmGen(false); runGenerate(); }}>
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
              This removes all draft questions and flashcards for this chapter. Approved and rejected items are kept.
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
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" onClick={() => { setDraft(chapter.summary_md ?? ""); setEditing(false); }}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => { setDraft(chapter.summary_md ?? ""); setEditing(true); }}>
          Edit
        </Button>
      </div>
      <div className="rounded-xl bg-surface p-5">
        <div className="prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data: questions, isLoading } = useQuery({
    queryKey: ["admin-chapter-questions", chapterId],
    queryFn: async () => {
      const { data } = await supabase
        .from("questions")
        .select("id, prompt, options, correct_index, explanation, status, difficulty")
        .eq("chapter_id", chapterId)
        .order("created_at", { ascending: true });
      return (data ?? []) as Question[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-chapter-questions", chapterId] });
    qc.invalidateQueries({ queryKey: ["admin-chapter-counts", chapterId] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from("questions").update({ status }).eq("id", id);
    invalidate();
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
              <Badge className={statusBadgeClass(st) + " shrink-0"}>{st}</Badge>
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

  const setStatus = async (id: string, status: string) => {
    await supabase.from("flashcards").update({ status }).eq("id", id);
    invalidate();
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
              <Badge className={statusBadgeClass(st) + " shrink-0"}>{st}</Badge>
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
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
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
      <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive">
        <Trash2 className="size-4" /> Delete
      </Button>
    </div>
  );
}
