import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, ExternalLink, Link2, Loader2, Search, X, ArrowUp, ArrowDown } from "lucide-react";
import { formatDuration } from "@/lib/format-duration";

type Resource = {
  id: string;
  external_id: string;
  title: string;
  channel_title: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  thumbnail_url: string | null;
  status: string;
  source: string;
  instructor_note: string | null;
  display_order: number;
};

type Filter = "all" | "draft" | "approved" | "rejected";

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-accent text-accent-foreground",
  rejected: "bg-destructive/15 text-destructive",
};

// Mirrors defaultQuery() in supabase/functions/curate-videos so staff see
// the query that will run and can edit it before searching.
const SUBJECT_HINTS: Array<[RegExp, string]> = [
  [/anatomy|physiology/i, "anatomy and physiology"],
  [/microbiology/i, "microbiology nursing"],
  [/fundamentals of nursing/i, "nursing fundamentals"],
  [/biochemistry/i, "biochemistry"],
  [/ideology|constitution|pakistan/i, "Pakistan studies"],
  [/ict|information|computer/i, "computer basics"],
];
function defaultQuery(title: string, subject: string) {
  const hint = SUBJECT_HINTS.find(([re]) => re.test(subject))?.[1] ?? subject;
  return `${title
    .replace(/[:&()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} ${hint}`.trim();
}

function formatViews(n: number | null) {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K views`;
  return `${n} views`;
}

async function invokeCurate(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("curate-videos", { body });
  if (error) {
    // functions.invoke hides the JSON error body behind a generic message.
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) msg = parsed.error;
    } catch {
      /* keep generic message */
    }
    throw new Error(msg);
  }
  return data;
}

export function VideosManager({
  chapterId,
  chapterTitle,
  subjectId,
  subjectName,
}: {
  chapterId: string;
  chapterTitle: string;
  subjectId: string | null;
  subjectName: string;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState(() => defaultQuery(chapterTitle, subjectName));
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"search" | "subject" | "manual" | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-chapter-videos", chapterId],
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await supabase
        .from("chapter_resources")
        .select(
          "id, external_id, title, channel_title, duration_seconds, view_count, thumbnail_url, status, source, instructor_note, display_order",
        )
        .eq("chapter_id", chapterId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-chapter-videos", chapterId] });
    qc.invalidateQueries({ queryKey: ["chapter-videos", chapterId] });
  };

  const run = async (kind: "search" | "subject" | "manual") => {
    setBusy(kind);
    try {
      if (kind === "manual") {
        const data = await invokeCurate({ chapterId, videoUrl: url.trim() });
        toast.success(data?.reapproved ? "Video re-approved" : `Added: ${data?.title ?? "video"}`);
        setUrl("");
      } else if (kind === "search") {
        const data = await invokeCurate({ chapterId, query: query.trim() });
        const ch = data?.chapters?.[0];
        if (ch?.error) throw new Error(ch.error);
        toast.success(
          ch?.inserted
            ? `Found ${ch.inserted} new video${ch.inserted === 1 ? "" : "s"} to review`
            : "No new videos passed the checks. Try a different search.",
        );
      } else {
        const data = await invokeCurate({ subjectId });
        const failed = (data?.chapters ?? []).filter((c: { error?: string }) => c.error);
        toast.success(
          `Staged ${data?.inserted ?? 0} videos across ${data?.chapters?.length ?? 0} chapters` +
            (failed.length ? ` (${failed.length} failed: ${failed[0].error})` : ""),
        );
      }
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("chapter_resources").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  };

  const approveAllDrafts = async () => {
    const { error } = await supabase
      .from("chapter_resources")
      .update({ status: "approved" })
      .eq("chapter_id", chapterId)
      .eq("status", "draft");
    if (error) toast.error(error.message);
    refresh();
  };

  const saveNote = async (id: string, note: string) => {
    const { error } = await supabase
      .from("chapter_resources")
      .update({ instructor_note: note.trim() || null })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Note saved");
    refresh();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const list = rows ?? [];
    const a = list[index];
    const b = list[index + dir];
    if (!a || !b) return;
    // Swap orders; if they collide, nudge so the swap is visible.
    const ao = a.display_order === b.display_order ? b.display_order + dir : b.display_order;
    await Promise.all([
      supabase.from("chapter_resources").update({ display_order: ao }).eq("id", a.id),
      supabase.from("chapter_resources").update({ display_order: a.display_order }).eq("id", b.id),
    ]);
    refresh();
  };

  const all = rows ?? [];
  const visible = all.filter((r) => filter === "all" || r.status === filter);
  const counts = {
    draft: all.filter((r) => r.status === "draft").length,
    approved: all.filter((r) => r.status === "approved").length,
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-3 rounded-xl bg-surface p-4">
        <p className="text-sm font-medium text-foreground">Find videos on YouTube</p>
        <p className="text-xs text-muted-foreground">
          Results are checked for embedding, Pakistan availability and length (3 to 75 minutes),
          then saved as drafts. Students only see approved videos.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search query"
          />
          <Button onClick={() => run("search")} disabled={busy !== null || !query.trim()}>
            {busy === "search" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Find videos
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Or paste a YouTube link you already trust"
          />
          <Button
            variant="outline"
            onClick={() => run("manual")}
            disabled={busy !== null || !url.trim()}
          >
            {busy === "manual" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            Add link
          </Button>
        </div>
        {subjectId && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Run the default search for every chapter in {subjectName}. Takes about a minute and
              uses roughly 100 quota units per chapter.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => run("subject")}
              disabled={busy !== null}
            >
              {busy === "subject" && <Loader2 className="size-4 animate-spin" />}
              Find for whole subject
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(["all", "draft", "approved", "rejected"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "ghost"}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
          <span className="self-center pl-2 text-xs text-muted-foreground">
            {counts.draft} to review · {counts.approved} live
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={approveAllDrafts}
          disabled={counts.draft === 0}
        >
          <Check className="size-4" /> Approve all drafts
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && visible.length === 0 && (
        <p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">No videos yet.</p>
      )}

      {visible.map((r) => (
        <ResourceRow
          key={r.id}
          r={r}
          canMove={filter === "all"}
          onUp={() => move(all.indexOf(r), -1)}
          onDown={() => move(all.indexOf(r), 1)}
          onApprove={() => setStatus(r.id, "approved")}
          onReject={() => setStatus(r.id, "rejected")}
          onSaveNote={(n) => saveNote(r.id, n)}
        />
      ))}
    </div>
  );
}

function ResourceRow({
  r,
  canMove,
  onUp,
  onDown,
  onApprove,
  onReject,
  onSaveNote,
}: {
  r: Resource;
  canMove: boolean;
  onUp: () => void;
  onDown: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSaveNote: (note: string) => void;
}) {
  const [note, setNote] = useState(r.instructor_note ?? "");
  const meta = [r.channel_title, formatDuration(r.duration_seconds), formatViews(r.view_count)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface p-4 sm:flex-row">
      <a
        href={`https://www.youtube.com/watch?v=${r.external_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-48"
      >
        {r.thumbnail_url && (
          <img src={r.thumbnail_url} alt="" className="h-full w-full object-cover" />
        )}
        <ExternalLink className="absolute right-1.5 top-1.5 size-4 text-white drop-shadow" />
      </a>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{r.title}</p>
          <div className="flex shrink-0 gap-1">
            {r.source === "manual" && <Badge variant="outline">added by link</Badge>}
            <Badge className={STATUS_CLASS[r.status] ?? STATUS_CLASS.draft}>{r.status}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{meta}</p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for students, e.g. 'Watch 4:10 to 12:00 for the cardiac cycle'"
          className="min-h-[60px] text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          {r.status !== "approved" && (
            <Button size="sm" onClick={onApprove}>
              <Check className="size-4" /> Approve
            </Button>
          )}
          {r.status !== "rejected" && (
            <Button size="sm" variant="outline" onClick={onReject}>
              <X className="size-4" /> Reject
            </Button>
          )}
          {note !== (r.instructor_note ?? "") && (
            <Button size="sm" variant="ghost" onClick={() => onSaveNote(note)}>
              Save note
            </Button>
          )}
          {canMove && (
            <span className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" onClick={onUp} aria-label="Move up">
                <ArrowUp className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={onDown} aria-label="Move down">
                <ArrowDown className="size-4" />
              </Button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
