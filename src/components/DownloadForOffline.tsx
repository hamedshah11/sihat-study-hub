import { ArrowDownToLine } from "lucide-react";
import { OfflineChip } from "@/components/brand/StatusChip";
import { useOnline } from "@/components/OfflineBanner";
import { formatBytes, useDownloadAction, useDownloads, type DownloadState } from "@/lib/downloads";
import type { DownloadedSubjectInfo } from "@/lib/offline-store";
import { cn } from "@/lib/utils";

function DownloadButton({
  state,
  label,
  note,
  onClick,
}: {
  state: DownloadState;
  label: string;
  note?: string;
  onClick: () => void;
}) {
  if (state.status === "downloading") {
    return (
      <div role="status" aria-live="polite" className="w-full max-w-[260px]">
        <p className="text-[13.5px] font-semibold">
          Downloading… <span className="fl-number font-normal">{state.percent}%</span>
        </p>
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className="block h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${state.percent}%` }}
          />
        </span>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={onClick}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong px-4 text-[13.5px] font-semibold"
        >
          <ArrowDownToLine className="size-4" aria-hidden />
          {label}
        </button>
        {note && <span className="text-[12.5px] text-muted-foreground">{note}</span>}
      </div>
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-[13px] text-destructive-ink">
          That download didn't finish. Check your connection and try again.
        </p>
      )}
    </div>
  );
}

function Downloaded({ detail, className }: { detail: string; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <OfflineChip />
      <span className="fl-number text-[12.5px] text-muted-foreground">{detail}</span>
    </div>
  );
}

/** On the chapter page: download its notes, flashcards and diagrams, or show that it's saved. */
export function ChapterDownload({
  chapterId,
  className,
}: {
  chapterId: string;
  className?: string;
}) {
  const { data: downloads } = useDownloads();
  const online = useOnline();
  const { state, start } = useDownloadAction();
  if (!downloads) return null;

  const saved = downloads.chapters.find((c) => c.chapterId === chapterId);
  if (saved && state.status !== "downloading") {
    return <Downloaded detail={formatBytes(saved.bytes)} className={className} />;
  }
  if (!online && state.status !== "downloading") return null;
  return (
    <div className={className}>
      <DownloadButton
        state={state}
        label="Download for offline"
        onClick={() => void start([chapterId])}
      />
    </div>
  );
}

/** On the subject page: download every published chapter, and new ones as they're published. */
export function SubjectDownload({
  subject,
  chapterIds,
  className,
}: {
  subject: DownloadedSubjectInfo;
  chapterIds: string[];
  className?: string;
}) {
  const { data: downloads } = useDownloads();
  const online = useOnline();
  const { state, start } = useDownloadAction();
  if (!downloads || chapterIds.length === 0) return null;

  const saved = downloads.chapters.filter((c) => chapterIds.includes(c.chapterId));
  const missing = chapterIds.filter((id) => !saved.some((c) => c.chapterId === id));
  if (missing.length === 0 && state.status !== "downloading") {
    const bytes = saved.reduce((sum, c) => sum + c.bytes, 0);
    const count = `${saved.length} chapter${saved.length === 1 ? "" : "s"}`;
    return <Downloaded detail={`${count} · ${formatBytes(bytes)}`} className={className} />;
  }
  if (!online && state.status !== "downloading") return null;
  return (
    <div className={className}>
      <DownloadButton
        state={state}
        label="Download for offline"
        note={
          saved.length > 0
            ? `${saved.length} of ${chapterIds.length} chapters downloaded`
            : undefined
        }
        onClick={() => void start(missing, subject)}
      />
    </div>
  );
}
