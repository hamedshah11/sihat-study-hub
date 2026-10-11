import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ChevronLeft, ImageIcon } from "lucide-react";
import { FlorenceMark } from "@/components/brand/FlorenceMark";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Skeleton } from "@/components/ui/skeleton";
import { DiagramMarkdownImage, diagramUrlTransform } from "@/components/DiagramMarkdownImage";
import { DownloadedImagesContext } from "@/hooks/use-diagram-image";
import { ChapterNotesTable } from "@/components/ChapterNotesTable";
import { ChapterQuiz } from "@/components/ChapterQuiz";
import { ChapterFlashcards } from "@/components/ChapterFlashcards";
import { ChapterTutor } from "@/components/ChapterTutor";
import { ChapterDiagramTest } from "@/components/ChapterDiagramTest";
import { ChapterNoteDiagrams } from "@/components/ChapterNoteDiagrams";
import { ChapterVideos } from "@/components/ChapterVideos";
import { ChapterDownload } from "@/components/DownloadForOffline";
import { NeedsInternet } from "@/components/OfflineBanner";
import { useSessionUserId } from "@/hooks/use-session-user";
import { useChapterDetail } from "@/lib/chapter-data";
import { NotDownloadedError } from "@/lib/downloads";
import { embeddedImagePaths } from "@/lib/offline-store";
import { useProgress } from "@/lib/progress-data";
import { petalColour } from "@/lib/subject-colours";
import { pageTitle } from "@/lib/brand";
import { cn } from "@/lib/utils";

const CHAPTER_TABS = ["notes", "quiz", "flashcards", "diagrams", "tutor"] as const;
type ChapterTab = (typeof CHAPTER_TABS)[number];

// ?tab= lets other screens (Today, Subjects) open a chapter straight on the
// quiz or flashcards instead of always landing on the notes.
const searchSchema = z.object({
  tab: z.enum(CHAPTER_TABS).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/chapters/$chapterId")({
  head: () => ({ meta: [{ title: pageTitle("Chapter") }] }),
  validateSearch: (search) => searchSchema.parse(search),
  component: ChapterDetail,
});

function ChapterDetail() {
  const { chapterId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab: ChapterTab = tab ?? "notes";
  const setTab = (value: ChapterTab) =>
    navigate({
      search: { tab: value === "notes" ? undefined : value },
      replace: activeTab === "notes" && value !== "notes" ? false : true,
      resetScroll: true,
    });

  const { data: progress } = useProgress();

  const userId = useSessionUserId();
  // From Supabase, or from the student's download with no signal.
  const { data, isLoading, error } = useChapterDetail(chapterId);

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-12 w-3/4 rounded-lg" />
        <Skeleton className="h-11 rounded-full" />
        <Skeleton className="h-64 rounded-[22px]" />
      </div>
    );
  }

  if (!data?.chapter) {
    return (
      <div className="pt-2">
        <Link
          to="/subjects"
          className="-ml-2 inline-flex min-h-11 items-center text-sm text-muted-foreground"
        >
          <ChevronLeft className="size-5" /> Subjects
        </Link>
        {error instanceof NotDownloadedError ? (
          <NeedsInternet title="This chapter isn't downloaded." className="mt-4">
            <p className="mt-1 text-sm text-muted-foreground">
              Connect to the internet to open it, then choose Download for offline to keep it on
              this phone.
            </p>
          </NeedsInternet>
        ) : (
          <div className="mt-4 rounded-[22px] border bg-card p-6 text-sm text-muted-foreground">
            {error
              ? "This chapter didn't load. Check your connection and try again."
              : "This chapter isn't available."}
          </div>
        )}
      </div>
    );
  }

  const { chapter, subject } = data;
  const fromDownload = data.source === "download";
  const subjectSnapshot = progress?.subjects.find((s) => s.id === subject?.id);
  const chapterSnapshot = subjectSnapshot?.chapters.find((c) => c.id === chapterId);
  const backToChapter = () => setTab("notes");

  if (activeTab === "flashcards") {
    return (
      <ChapterFlashcards
        chapterId={chapterId}
        chapterTitle={chapter.title}
        subjectId={subject?.id ?? null}
        subjectName={subject?.name ?? null}
      />
    );
  }
  if (activeTab === "quiz") {
    return <ChapterQuiz chapterId={chapterId} subjectName={subject?.name} onExit={backToChapter} />;
  }
  if (activeTab === "tutor") {
    const openSource = (heading: string) => {
      setTab("notes");
      // Scroll to the cited section once the notes have rendered.
      window.setTimeout(() => {
        const target = Array.from(
          document.querySelectorAll("article h1, article h2, article h3, article h4"),
        ).find((el) => el.textContent?.trim().toLowerCase() === heading.toLowerCase());
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
    };
    return (
      <ChapterTutor
        chapterId={chapterId}
        chapterTitle={chapter.title}
        onBack={backToChapter}
        onOpenSource={openSource}
      />
    );
  }

  const embeddedDiagramPaths = embeddedImagePaths(chapter.summary_md);
  const updated = chapter.updated_at
    ? new Date(chapter.updated_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const segments: { value: ChapterTab; label: string }[] = [
    { value: "notes", label: "Notes" },
    { value: "flashcards", label: "Flashcards" },
    { value: "quiz", label: "Quiz" },
    // Labelling the diagrams loads them from the server, so not from a download.
    ...(data.diagrams.length > 0 && !fromDownload
      ? [{ value: "diagrams" as const, label: "Diagrams" }]
      : []),
  ];

  const due = chapterSnapshot?.cardsDue ?? 0;
  const fresh = chapterSnapshot?.cardsNew ?? 0;
  // From a download (no signal), practising means flipping through the cards.
  const practiseTab: ChapterTab = fromDownload || due > 0 || fresh > 0 ? "flashcards" : "quiz";
  const practiseDetail = fromDownload
    ? " · Flashcards"
    : due > 0
      ? ` · ${due} card${due === 1 ? "" : "s"} due`
      : fresh > 0
        ? ` · ${Math.min(fresh, 10)} new cards`
        : " · Quiz";

  return (
    <div className="mx-auto max-w-2xl pb-[136px] pt-2 md:pb-10">
      {subject ? (
        <Link
          to="/subjects/$subjectId"
          params={{ subjectId: subject.id }}
          className="-ml-2 inline-flex min-h-11 items-center gap-0.5 pr-3 text-[14px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-5" /> {subject.name}
        </Link>
      ) : (
        <Link
          to="/subjects"
          className="-ml-2 inline-flex min-h-11 items-center text-[14px] text-muted-foreground"
        >
          <ChevronLeft className="size-5" /> Subjects
        </Link>
      )}
      <div className="mt-1 flex items-start gap-3">
        {subject && (
          <span
            aria-hidden
            className="mt-2 h-8 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: petalColour(subject.colour, subjectSnapshot?.index ?? 0) }}
          />
        )}
        <h1 className="font-display text-[28px] leading-[1.12] md:text-[34px]">{chapter.title}</h1>
      </div>
      <ChapterDownload chapterId={chapterId} className="mt-3" />

      <div
        role="tablist"
        aria-label="Chapter sections"
        className="mt-4 grid rounded-full bg-muted p-1"
        style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
      >
        {segments.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            aria-selected={activeTab === value}
            onClick={() => setTab(value)}
            className={cn(
              "h-10 rounded-full text-[13.5px] font-semibold transition-colors",
              activeTab === value ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "diagrams" ? (
        <div className="mt-4">
          <ChapterDiagramTest chapterId={chapterId} />
        </div>
      ) : (
        <>
          <DownloadedImagesContext.Provider value={userId ? { userId, chapterId } : null}>
            <article className="mt-5">
              <div className="prose max-w-none prose-p:text-[15.5px] prose-p:leading-[1.7]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  urlTransform={diagramUrlTransform}
                  components={{
                    img: DiagramMarkdownImage,
                    table: ChapterNotesTable,
                    blockquote: ({ children }) => (
                      <blockquote className="not-prose my-4 text-[13.5px] leading-relaxed text-muted-foreground [&_p]:mb-1.5 [&_p]:text-[13.5px] [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_strong]:text-foreground">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {chapter.summary_md || "_These notes are still being reviewed by your teachers._"}
                </ReactMarkdown>
              </div>
              <ChapterNoteDiagrams diagrams={data.diagrams} excludedPaths={embeddedDiagramPaths} />
              {data.diagrams.length > 0 && !fromDownload && (
                <button
                  onClick={() => setTab("diagrams")}
                  className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-2.5 text-left text-[14px] font-semibold"
                >
                  <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                  Label the diagrams to test yourself
                </button>
              )}
            </article>
          </DownloadedImagesContext.Provider>
          <ChapterVideos chapterId={chapterId} />
          {updated && (
            <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
              Content reviewed by SIHAT faculty · Updated {updated}
            </p>
          )}

          {/* Practising is the main action; Ask Florence is the second. */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
            <div className="mx-auto max-w-[480px] space-y-2 md:max-w-none">
              <button
                onClick={() => setTab(practiseTab)}
                className="h-[50px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
              >
                Practise this chapter{practiseDetail}
              </button>
              <button
                onClick={() => setTab("tutor")}
                className="flex h-[46px] w-full items-center justify-center gap-2 rounded-full border border-border-strong text-[14.5px] font-semibold"
              >
                <FlorenceMark size={20} /> Ask Florence about this chapter
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
