import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ImageIcon, Lightbulb, MessageCircleQuestion } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { DiagramMarkdownImage, diagramUrlTransform } from "@/components/DiagramMarkdownImage";
import { ChapterNotesTable } from "@/components/ChapterNotesTable";
import { ChapterQuiz } from "@/components/ChapterQuiz";
import { ChapterFlashcards } from "@/components/ChapterFlashcards";
import { ChapterTutor } from "@/components/ChapterTutor";
import { ChapterDiagramTest } from "@/components/ChapterDiagramTest";
import { ChapterNoteDiagrams } from "@/components/ChapterNoteDiagrams";
import { ChapterVideos } from "@/components/ChapterVideos";
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
  const [readingProgress, setReadingProgress] = useState(0);
  const setTab = (value: ChapterTab) =>
    navigate({
      search: { tab: value === "notes" ? undefined : value },
      replace: activeTab === "notes" && value !== "notes" ? false : true,
      resetScroll: true,
    });

  const { data: progress } = useProgress();

  const { data, isLoading } = useQuery({
    queryKey: ["chapter-detail", chapterId],
    queryFn: async () => {
      const { data: chapter } = await supabase
        .from("chapters")
        .select("id, title, summary_md, status, updated_at, subject_id, display_order")
        .eq("id", chapterId)
        .maybeSingle();
      if (!chapter) return { chapter: null, subject: null, diagrams: 0 };
      const [{ data: subject }, { count }] = await Promise.all([
        chapter.subject_id
          ? supabase
              .from("subjects")
              .select("id, name, colour")
              .eq("id", chapter.subject_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("diagram_labels")
          .select("id", { count: "exact", head: true })
          .eq("chapter_id", chapterId)
          .eq("status", "approved"),
      ]);
      return { chapter, subject, diagrams: count ?? 0 };
    },
  });

  useEffect(() => {
    if (activeTab !== "notes") return;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setReadingProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 100);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [activeTab, data?.chapter]);

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
        <div className="mt-4 rounded-[22px] border bg-card p-6 text-sm text-muted-foreground">
          This chapter isn't available.
        </div>
      </div>
    );
  }

  const { chapter, subject } = data;
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

  const embeddedDiagramPaths = Array.from(
    chapter.summary_md?.matchAll(/diagram:\/\/([^\s)]+)/g) ?? [],
    (match) => match[1],
  );
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
    ...(data.diagrams > 0 ? [{ value: "diagrams" as const, label: "Diagrams" }] : []),
  ];

  const due = chapterSnapshot?.cardsDue ?? 0;
  const fresh = chapterSnapshot?.cardsNew ?? 0;
  const practiseTab: ChapterTab = due > 0 || fresh > 0 ? "flashcards" : "quiz";
  const practiseDetail =
    due > 0
      ? ` · ${due} card${due === 1 ? "" : "s"} due`
      : fresh > 0
        ? ` · ${Math.min(fresh, 10)} new cards`
        : " · Quiz";

  return (
    <div className="mx-auto max-w-2xl pb-[136px] pt-2 md:pb-10">
      <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-[3px]">
        <div
          className="h-full bg-accent transition-[width]"
          style={{ width: `${readingProgress}%` }}
        />
      </div>
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
          <article className="mt-4 rounded-[22px] border bg-card p-5 md:p-7">
            <div className="prose max-w-none prose-p:text-[15.5px] prose-p:leading-[1.7]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={diagramUrlTransform}
                components={{
                  img: DiagramMarkdownImage,
                  table: ChapterNotesTable,
                  blockquote: ({ children }) => (
                    <blockquote className="not-prose my-5 flex gap-3 rounded-2xl bg-muted p-4 text-[14.5px] leading-relaxed text-foreground">
                      <Lightbulb className="mt-0.5 size-5 shrink-0 text-accent-ink" aria-hidden />
                      <div>{children}</div>
                    </blockquote>
                  ),
                }}
              >
                {chapter.summary_md || "_These notes are still being reviewed by your teachers._"}
              </ReactMarkdown>
            </div>
            <ChapterNoteDiagrams chapterId={chapterId} excludedPaths={embeddedDiagramPaths} />
            {data.diagrams > 0 && (
              <button
                onClick={() => setTab("diagrams")}
                className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-2.5 text-left text-[14px] font-semibold"
              >
                <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                Label the diagrams to test yourself
              </button>
            )}
          </article>
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
                <MessageCircleQuestion className="size-4" aria-hidden /> Ask Florence about this
                chapter
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
