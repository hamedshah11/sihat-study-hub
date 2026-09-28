import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/bulk-generate")({
  head: () => ({
    meta: [
      { title: "Bulk generate — Sihat Admin" },
      { name: "description", content: "Generate notes, questions and flashcards for many chapters at once." },
    ],
  }),
  component: BulkGeneratePage,
});

const MAX_SRC = 50_000;
const DELAY_MS = 2000;

type RowStatus = "queued" | "running" | "done" | "skipped" | "failed";
type FileRow = {
  id: string;
  fileName: string;
  text: string;
  chapterId: string | null;
  status: RowStatus | null;
  message?: string;
};
type Chapter = { id: string; title: string; display_order: number };
type Counts = Record<string, { questions: number; flashcards: number }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function BulkGeneratePage() {
  const [subjectId, setSubjectId] = useState("");
  const [rows, setRows] = useState<FileRow[]>([]);
  const [qCount, setQCount] = useState("30");
  const [fCount, setFCount] = useState("50");
  const [skipExisting, setSkipExisting] = useState(true);
  const [running, setRunning] = useState(false);
  const [runEnded, setRunEnded] = useState(false);
  const [counts, setCounts] = useState<Counts>({});
  const [dragOver, setDragOver] = useState(false);
  const stopRef = useRef(false);
  const [stopping, setStopping] = useState(false);

  const { data: subjects } = useQuery({
    queryKey: ["bulk-subjects"],
    queryFn: async () => {
      const [{ data: subs }, { data: sems }] = await Promise.all([
        supabase.from("subjects").select("id, name, display_order, semester_id"),
        supabase.from("semesters").select("id, number, name"),
      ]);
      const semMap = new Map((sems ?? []).map((s) => [s.id, s]));
      return (subs ?? [])
        .map((s) => ({ ...s, semester: s.semester_id ? semMap.get(s.semester_id) : undefined }))
        .sort(
          (a, b) =>
            (a.semester?.number ?? 999) - (b.semester?.number ?? 999) ||
            (a.display_order ?? 999) - (b.display_order ?? 999),
        );
    },
  });

  const { data: chapters } = useQuery({
    queryKey: ["bulk-chapters", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chapters")
        .select("id, title, display_order")
        .eq("subject_id", subjectId)
        .order("display_order");
      return (data ?? []) as Chapter[];
    },
  });

  const fetchCounts = async (ids: string[]) => {
    const entries = await Promise.all(
      ids.map(async (id) => {
        const [q, f] = await Promise.all([
          supabase.from("questions").select("id", { count: "exact", head: true }).eq("chapter_id", id),
          supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("chapter_id", id),
        ]);
        return [id, { questions: q.count ?? 0, flashcards: f.count ?? 0 }] as const;
      }),
    );
    setCounts((c) => ({ ...c, ...Object.fromEntries(entries) }));
  };

  useEffect(() => {
    if (chapters?.length) fetchCounts(chapters.map((c) => c.id));
  }, [chapters]);

  // Re-match when subject/chapters change
  const matchChapter = (fileName: string): string | null => {
    const m = fileName.match(/^(\d{1,3})/);
    if (!m || !chapters) return null;
    const n = parseInt(m[1], 10);
    return chapters.find((c) => c.display_order === n)?.id ?? null;
  };
  useEffect(() => {
    setRows((rs) => rs.map((r) => ({ ...r, chapterId: matchChapter(r.fileName), status: null, message: undefined })));
    setRunEnded(false);
  }, [chapters]);

  useEffect(() => {
    if (!running) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [running]);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /\.(md|txt)$/i.test(f.name));
    const read = await Promise.all(
      list.map(async (f) => ({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`,
        fileName: f.name,
        text: await f.text(),
        chapterId: matchChapter(f.name),
        status: null,
      })),
    );
    setRows((rs) =>
      [...rs.filter((r) => !read.some((n) => n.fileName === r.fileName)), ...read].sort((a, b) =>
        a.fileName.localeCompare(b.fileName),
      ),
    );
    setRunEnded(false);
  };

  const qNum = Number(qCount);
  const fNum = Number(fCount);
  const countsValid =
    Number.isInteger(qNum) && qNum >= 1 && qNum <= 100 && Number.isInteger(fNum) && fNum >= 1 && fNum <= 100;

  const problems = useMemo(() => {
    const byChapter = new Map<string, number>();
    rows.forEach((r) => r.chapterId && byChapter.set(r.chapterId, (byChapter.get(r.chapterId) ?? 0) + 1));
    const out: Record<string, string | null> = {};
    for (const r of rows) {
      if (!r.chapterId) out[r.id] = "No chapter matched";
      else if (r.text.trim().length === 0) out[r.id] = "File is empty";
      else if (r.text.length > MAX_SRC) out[r.id] = "Over 50,000 characters";
      else if ((byChapter.get(r.chapterId) ?? 0) > 1) out[r.id] = "Another file matches this chapter";
      else out[r.id] = null;
    }
    return out;
  }, [rows]);

  const updateRow = (id: string, patch: Partial<FileRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const run = async (onlyFailed: boolean) => {
    const targets = rows.filter((r) => !problems[r.id] && (!onlyFailed || r.status === "failed"));
    if (!targets.length) return;
    stopRef.current = false;
    setStopping(false);
    setRunning(true);
    setRunEnded(false);
    setRows((rs) =>
      rs.map((r) => (targets.some((t) => t.id === r.id) ? { ...r, status: "queued", message: undefined } : r)),
    );
    let first = true;
    for (const t of targets) {
      if (stopRef.current) break;
      const c = counts[t.chapterId!];
      if (skipExisting && c && c.questions + c.flashcards > 0) {
        updateRow(t.id, { status: "skipped", message: "Already has content" });
        continue;
      }
      if (!first) await sleep(DELAY_MS);
      first = false;
      if (stopRef.current) break;
      updateRow(t.id, { status: "running" });
      try {
        const { data, error } = await supabase.functions.invoke("generate-content", {
          body: { chapterId: t.chapterId, sourceMaterial: t.text, questionCount: qNum, flashcardCount: fNum },
        });
        if (error) {
          let msg = error.message;
          try {
            const ctx = (error as { context?: Response }).context;
            const j = ctx ? await ctx.json() : null;
            if (j?.error) msg = j.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const ins = data?.inserted ?? {};
        const dup = data?.dropped_duplicates ?? {};
        updateRow(t.id, {
          status: "done",
          message: `+${ins.questions ?? 0} Q, +${ins.flashcards ?? 0} FC · dropped ${dup.questions ?? 0} Q / ${dup.flashcards ?? 0} FC duplicates`,
        });
      } catch (e) {
        updateRow(t.id, { status: "failed", message: e instanceof Error ? e.message : String(e) });
      }
      await fetchCounts([t.chapterId!]);
    }
    // Anything left queued after a stop goes back to idle
    setRows((rs) => rs.map((r) => (r.status === "queued" ? { ...r, status: null } : r)));
    setRunning(false);
    setStopping(false);
    setRunEnded(true);
  };

  const active = rows.filter((r) => r.status && r.status !== null);
  const finished = active.filter((r) => ["done", "skipped", "failed"].includes(r.status!)).length;
  const failedCount = rows.filter((r) => r.status === "failed").length;
  const eligible = rows.filter((r) => !problems[r.id]).length;
  const chapterTitle = (id: string | null) => chapters?.find((c) => c.id === id)?.title;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary">Bulk generate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate notes, questions and flashcards for many chapters at once. Everything is saved as a draft for review.
        </p>
      </div>

      <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <select
            id="subject"
            value={subjectId}
            disabled={running}
            onChange={(e) => setSubjectId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select a subject…</option>
            {subjects?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.semester ? `Semester ${s.semester.number} · ` : ""}
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!running) addFiles(e.dataTransfer.files);
          }}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center text-sm transition-colors " +
            (dragOver ? "border-primary bg-accent" : "border-border hover:bg-secondary")
          }
        >
          <Upload className="size-5 text-muted-foreground" />
          <span>Drop .md or .txt files here, or click to choose</span>
          <span className="text-xs text-muted-foreground">Names should start with the chapter number, e.g. 03-…</span>
          <input
            type="file"
            multiple
            accept=".md,.txt,text/markdown,text/plain"
            className="hidden"
            disabled={running}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1">
          <Label htmlFor="qc">Questions per chapter</Label>
          <Input id="qc" type="number" min={1} max={100} className="w-32" value={qCount} disabled={running} onChange={(e) => setQCount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fc">Flashcards per chapter</Label>
          <Input id="fc" type="number" min={1} max={100} className="w-32" value={fCount} disabled={running} onChange={(e) => setFCount(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox checked={skipExisting} disabled={running} onCheckedChange={(v) => setSkipExisting(v === true)} />
          Skip chapters that already have questions or flashcards
        </label>
        {!countsValid && <p className="w-full text-sm text-destructive">Counts must be whole numbers from 1 to 100.</p>}
      </div>

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {active.length > 0
                ? `${finished} of ${active.length} done`
                : `${eligible} of ${rows.length} files ready`}
            </p>
            <div className="flex flex-wrap gap-2">
              {!running && (
                <Button variant="ghost" onClick={() => { setRows([]); setRunEnded(false); }}>
                  Clear files
                </Button>
              )}
              {running ? (
                <Button variant="outline" disabled={stopping} onClick={() => { stopRef.current = true; setStopping(true); }}>
                  {stopping ? "Stopping after this chapter…" : "Stop"}
                </Button>
              ) : (
                <>
                  {runEnded && failedCount > 0 && (
                    <Button variant="outline" disabled={!countsValid} onClick={() => run(true)}>
                      Retry failed ({failedCount})
                    </Button>
                  )}
                  <Button disabled={!countsValid || eligible === 0 || !subjectId} onClick={() => run(false)}>
                    Generate all
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold">File</th>
                  <th className="px-3 py-2 font-semibold">Characters</th>
                  <th className="px-3 py-2 font-semibold">Chapter</th>
                  <th className="px-3 py-2 font-semibold">Q / FC</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const problem = problems[r.id];
                  const c = r.chapterId ? counts[r.chapterId] : undefined;
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 font-medium">{r.fileName}</td>
                      <td className={"px-3 py-2 " + (r.text.length > MAX_SRC ? "text-destructive" : "")}>
                        {r.text.length.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.chapterId ?? ""}
                          disabled={running || !chapters}
                          onChange={(e) => updateRow(r.id, { chapterId: e.target.value || null, status: null, message: undefined })}
                          className="h-8 w-full min-w-48 rounded-md border border-input bg-background px-2 text-sm"
                          title={chapterTitle(r.chapterId)}
                        >
                          <option value="">— No chapter —</option>
                          {chapters?.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {String(ch.display_order).padStart(2, "0")} · {ch.title}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{c ? `${c.questions} / ${c.flashcards}` : "—"}</td>
                      <td className="px-3 py-2">
                        {problem ? (
                          <Badge variant="destructive">{problem}</Badge>
                        ) : (
                          <StatusCell status={r.status} message={r.message} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCell({ status, message }: { status: RowStatus | null; message?: string }) {
  if (!status) return <span className="text-muted-foreground">Ready</span>;
  const label = { queued: "Queued", running: "Running", done: "Done", skipped: "Skipped", failed: "Failed" }[status];
  return (
    <div className="space-y-1">
      <Badge variant={status === "failed" ? "destructive" : status === "done" ? "default" : "secondary"}>
        {status === "running" && <Loader2 className="mr-1 size-3 animate-spin" />}
        {label}
      </Badge>
      {message && <p className={"text-xs " + (status === "failed" ? "text-destructive" : "text-muted-foreground")}>{message}</p>}
    </div>
  );
}
