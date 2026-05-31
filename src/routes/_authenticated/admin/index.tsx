import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin Console — Sihat" }] }),
  component: AdminDashboard,
});

type ChapterRow = {
  id: string;
  title: string;
  status: string | null;
  display_order: number | null;
  subject_id: string | null;
};
type SubjectRow = {
  id: string;
  name: string;
  semester_id: string | null;
  display_order: number | null;
};
type SemesterRow = { id: string; name: string; number: number };

function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [subjects, chapters, questions, flashcards] = await Promise.all([
        supabase.from("subjects").select("id", { count: "exact", head: true }),
        supabase.from("chapters").select("id,status"),
        supabase.from("questions").select("id,status"),
        supabase.from("flashcards").select("id,status"),
      ]);
      const countByStatus = (rows: { status: string | null }[] | null) => {
        const m: Record<string, number> = {};
        for (const r of rows ?? []) {
          const k = r.status ?? "unknown";
          m[k] = (m[k] ?? 0) + 1;
        }
        return m;
      };
      return {
        subjects: subjects.count ?? 0,
        chapters: countByStatus(chapters.data as { status: string | null }[] | null),
        chaptersTotal: chapters.data?.length ?? 0,
        questions: countByStatus(questions.data as { status: string | null }[] | null),
        flashcards: countByStatus(flashcards.data as { status: string | null }[] | null),
      };
    },
  });

  const { data: tree } = useQuery({
    queryKey: ["admin-content-tree"],
    queryFn: async () => {
      const [{ data: semesters }, { data: subjects }, { data: chapters }, { data: questions }, { data: flashcards }] =
        await Promise.all([
          supabase.from("semesters").select("id, name, number").order("number"),
          supabase
            .from("subjects")
            .select("id, name, semester_id, display_order")
            .order("display_order"),
          supabase
            .from("chapters")
            .select("id, title, status, display_order, subject_id")
            .order("display_order"),
          supabase.from("questions").select("id, chapter_id, status"),
          supabase.from("flashcards").select("id, chapter_id, status"),
        ]);
      const qByChapter: Record<string, { draft: number; approved: number }> = {};
      for (const q of (questions ?? []) as { chapter_id: string | null; status: string | null }[]) {
        if (!q.chapter_id) continue;
        qByChapter[q.chapter_id] ??= { draft: 0, approved: 0 };
        if (q.status === "approved") qByChapter[q.chapter_id].approved++;
        else if (q.status === "draft") qByChapter[q.chapter_id].draft++;
      }
      const fByChapter: Record<string, { draft: number; approved: number }> = {};
      for (const f of (flashcards ?? []) as { chapter_id: string | null; status: string | null }[]) {
        if (!f.chapter_id) continue;
        fByChapter[f.chapter_id] ??= { draft: 0, approved: 0 };
        if (f.status === "approved") fByChapter[f.chapter_id].approved++;
        else if (f.status === "draft") fByChapter[f.chapter_id].draft++;
      }
      return {
        semesters: (semesters ?? []) as SemesterRow[],
        subjects: (subjects ?? []) as SubjectRow[],
        chapters: (chapters ?? []) as ChapterRow[],
        qByChapter,
        fByChapter,
      };
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Admin Console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage subjects, chapters, and review content.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Subjects" value={String(stats?.subjects ?? "—")} />
        <StatTile
          label="Chapters"
          value={String(stats?.chaptersTotal ?? "—")}
          sub={
            stats
              ? `${stats.chapters.draft ?? 0} draft · ${stats.chapters.in_review ?? 0} review · ${stats.chapters.published ?? 0} pub`
              : undefined
          }
        />
        <StatTile
          label="Questions"
          value={String(
            stats ? (stats.questions.draft ?? 0) + (stats.questions.approved ?? 0) : "—",
          )}
          sub={
            stats
              ? `${stats.questions.draft ?? 0} draft · ${stats.questions.approved ?? 0} approved`
              : undefined
          }
        />
        <StatTile
          label="Flashcards"
          value={String(
            stats ? (stats.flashcards.draft ?? 0) + (stats.flashcards.approved ?? 0) : "—",
          )}
          sub={
            stats
              ? `${stats.flashcards.draft ?? 0} draft · ${stats.flashcards.approved ?? 0} approved`
              : undefined
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <NewSubjectDialog semesters={tree?.semesters ?? []} />
        <NewChapterDialog subjects={tree?.subjects ?? []} />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Content tree</h2>
        <div className="mt-3 space-y-2">
          {tree?.subjects.map((s) => {
            const sem = tree.semesters.find((x) => x.id === s.semester_id);
            const subjectChapters = tree.chapters.filter((c) => c.subject_id === s.id);
            return (
              <SubjectNode
                key={s.id}
                subject={s}
                semesterName={sem?.name ?? "—"}
                semesters={tree.semesters}
                chapters={subjectChapters}
                qByChapter={tree.qByChapter}
                fByChapter={tree.fByChapter}
              />
            );
          })}
          {tree && tree.subjects.length === 0 && (
            <p className="text-sm text-muted-foreground">No subjects yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-primary">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SubjectNode({
  subject,
  semesterName,
  semesters,
  chapters,
  qByChapter,
  fByChapter,
}: {
  subject: SubjectRow;
  semesterName: string;
  semesters: SemesterRow[];
  chapters: ChapterRow[];
  qByChapter: Record<string, { draft: number; approved: number }>;
  fByChapter: Record<string, { draft: number; approved: number }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-surface">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <div>
            <p className="font-medium text-foreground">{subject.name}</p>
            <p className="text-xs text-muted-foreground">
              {semesterName} · {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
            </p>
          </div>
        </button>
        <EditSubjectDialog subject={subject} semesters={semesters} />
      </div>
      {open && (
        <div className="border-t border-border px-2 pb-2">
          {chapters.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">No chapters.</p>
          )}
          {chapters.map((ch) => {
            const q = qByChapter[ch.id] ?? { draft: 0, approved: 0 };
            const f = fByChapter[ch.id] ?? { draft: 0, approved: 0 };
            return (
              <a
                key={ch.id}
                href={`/admin/chapters/${ch.id}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-secondary"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{ch.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Q: {q.draft}d/{q.approved}a · FC: {f.draft}d/{f.approved}a
                  </p>
                </div>
                <StatusBadge status={ch.status ?? "draft"} />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    in_review: "bg-amber-100 text-amber-900",
    published: "bg-accent text-accent-foreground",
  };
  return <Badge className={"shrink-0 " + (map[status] ?? "bg-muted text-muted-foreground")}>{status}</Badge>;
}

function NewSubjectDialog({ semesters }: { semesters: SemesterRow[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [semesterId, setSemesterId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [order, setOrder] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setSemesterId("");
    setName("");
    setDescription("");
    setIcon("");
    setOrder("0");
    setErr(null);
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("subjects").insert({
      semester_id: semesterId || null,
      name,
      description: description || null,
      icon: icon || null,
      display_order: Number(order) || 0,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-content-tree"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" /> New subject</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New subject</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Semester">
            <Select value={semesterId} onValueChange={setSemesterId}>
              <SelectTrigger><SelectValue placeholder="Select semester" /></SelectTrigger>
              <SelectContent>
                {semesters.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Icon (lucide name or emoji)"><Input value={icon} onChange={(e) => setIcon(e.target.value)} /></Field>
          <Field label="Display order"><Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} /></Field>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !name || !semesterId}>
            {busy ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewChapterDialog({ subjects }: { subjects: SubjectRow[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [order, setOrder] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setSubjectId("");
    setTitle("");
    setOrder("0");
    setErr(null);
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("chapters").insert({
      subject_id: subjectId || null,
      title,
      display_order: Number(order) || 0,
      status: "draft",
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-content-tree"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="size-4" /> New chapter</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New chapter</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Subject">
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Display order"><Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} /></Field>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !title || !subjectId}>
            {busy ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSubjectDialog({
  subject,
  semesters,
}: {
  subject: SubjectRow;
  semesters: SemesterRow[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [semesterId, setSemesterId] = useState(subject.semester_id ?? "");
  const [name, setName] = useState(subject.name);
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [order, setOrder] = useState(String(subject.display_order ?? 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadFresh = async () => {
    const { data } = await supabase
      .from("subjects")
      .select("name, description, icon, display_order, semester_id")
      .eq("id", subject.id)
      .maybeSingle();
    if (data) {
      setName(data.name ?? "");
      setDescription(data.description ?? "");
      setIcon(data.icon ?? "");
      setOrder(String(data.display_order ?? 0));
      setSemesterId(data.semester_id ?? "");
    }
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from("subjects")
      .update({
        semester_id: semesterId || null,
        name,
        description: description || null,
        icon: icon || null,
        display_order: Number(order) || 0,
      })
      .eq("id", subject.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-content-tree"] });
    qc.invalidateQueries({ queryKey: ["subjects-list"] });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setErr(null);
          loadFresh();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => e.stopPropagation()}
          aria-label="Edit subject"
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit subject</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Semester">
            <Select value={semesterId} onValueChange={setSemesterId}>
              <SelectTrigger>
                <SelectValue placeholder="Select semester" />
              </SelectTrigger>
              <SelectContent>
                {semesters.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Changing the semester changes which students can see this subject.
            </p>
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Icon (lucide name or emoji)">
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} />
          </Field>
          <Field label="Display order">
            <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !name || !semesterId}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
