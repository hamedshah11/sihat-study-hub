import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ClipboardList,
  Image as ImageIcon,
  Layers,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { DiagramMarkdownImage, diagramUrlTransform } from "@/components/DiagramMarkdownImage";
import { ChapterNotesTable } from "@/components/ChapterNotesTable";
import remarkGfm from "remark-gfm";
import { ChapterQuiz } from "@/components/ChapterQuiz";
import { ChapterFlashcards } from "@/components/ChapterFlashcards";
import { ChapterTutor } from "@/components/ChapterTutor";
import { ChapterDiagramTest } from "@/components/ChapterDiagramTest";
import { ChapterNoteDiagrams } from "@/components/ChapterNoteDiagrams";
import { ChapterVideos } from "@/components/ChapterVideos";
import { subjectColourVariables } from "@/lib/subject-colours";

const CHAPTER_TABS = ["notes", "quiz", "flashcards", "diagrams", "tutor"] as const;
type ChapterTab = (typeof CHAPTER_TABS)[number];

// Short labels + icons so all five tabs fit on a phone.
const TAB_ITEMS: { value: ChapterTab; label: string; icon: typeof BookOpen }[] = [
  { value: "notes", label: "Notes", icon: BookOpen },
  { value: "quiz", label: "Quiz", icon: ClipboardList },
  { value: "flashcards", label: "Cards", icon: Layers },
  { value: "diagrams", label: "Diagrams", icon: ImageIcon },
  { value: "tutor", label: "Tutor", icon: Sparkles },
];

// ?tab= lets other screens (Home, Progress) open a chapter straight on the
// quiz or flashcards instead of always landing on Notes.
const searchSchema = z.object({
  tab: z.enum(CHAPTER_TABS).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/chapters/$chapterId")({
  head: () => ({ meta: [{ title: "Chapter — Sihat" }] }),
  validateSearch: (search) => searchSchema.parse(search),
  component: ChapterDetail,
});

function ChapterDetail() {
  const [readingProgress, setReadingProgress] = useState(0);
  const { chapterId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab: ChapterTab = tab ?? "notes";
  const setTab = (value: string) =>
    navigate({
      search: { tab: value === "notes" ? undefined : (value as ChapterTab) },
      replace: true,
      resetScroll: false,
    });

  const { data, isLoading } = useQuery({
    queryKey: ["chapter-detail", chapterId],
    queryFn: async () => {
      const { data: chapter } = await supabase
        .from("chapters")
        .select("id, title, summary_md, status, updated_at, subject_id")
        .eq("id", chapterId)
        .maybeSingle();
      if (!chapter) return { chapter: null, subject: null };
      const { data: subject } = chapter.subject_id
        ? await supabase
            .from("subjects")
            .select("id, name, colour")
            .eq("id", chapter.subject_id)
            .maybeSingle()
        : { data: null };
      return { chapter, subject };
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

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;

  if (!data?.chapter) {
    return (
      <div>
        <Link
          to="/subjects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Subjects
        </Link>
        <div className="mt-6 rounded-xl bg-surface p-6 text-sm text-muted-foreground">
          Chapter not found.
        </div>
      </div>
    );
  }

  const { chapter, subject } = data;
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

  const focusMode = activeTab === "quiz" || activeTab === "flashcards";

  return (
    <div
      className="subject-colour -mx-4 -mt-6 md:mx-0 md:mt-0"
      style={subjectColourVariables(subject?.colour)}
    >
      {!focusMode && (
        <header className="animate-fade-up relative h-[300px] overflow-hidden rounded-b-[34px] bg-[var(--subject)] px-5 pt-6 text-white md:rounded-[34px]">
          <div className="absolute inset-x-0 top-0 h-1 bg-white/25">
            <div
              className="h-full bg-white transition-[width]"
              style={{ width: `${readingProgress}%` }}
            />
          </div>
          <span
            aria-hidden
            className="absolute -right-16 -top-16 size-52 rounded-full bg-white/10"
          />
          <div className="relative flex items-center justify-between">
            {subject ? (
              <Link
                to="/subjects/$subjectId"
                params={{ subjectId: subject.id }}
                className="grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm"
                aria-label={`Back to ${subject.name}`}
              >
                <ChevronLeft className="size-5" />
              </Link>
            ) : (
              <Link
                to="/subjects"
                className="grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm"
                aria-label="Back to subjects"
              >
                <ChevronLeft className="size-5" />
              </Link>
            )}
            <button
              onClick={() => setTab("tutor")}
              className="grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm"
              aria-label="Ask tutor"
            >
              <Sparkles className="size-[18px]" />
            </button>
          </div>
          <p className="relative mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
            {subject?.name ?? "Chapter"}
          </p>
          <h1 className="relative mt-2 max-w-xl font-display text-[40px] leading-[1.02]">
            {chapter.title}
          </h1>
        </header>
      )}

      <Tabs
        value={activeTab}
        onValueChange={setTab}
        className={focusMode ? "" : "animate-fade-up stagger-1 relative -mt-[68px]"}
      >
        {!focusMode && (
          <TabsList className="mx-5 grid h-[52px] w-[calc(100%-2.5rem)] grid-cols-5 gap-0.5 rounded-2xl bg-white/15 p-1 backdrop-blur-sm">
            {TAB_ITEMS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex min-h-11 flex-col gap-0.5 rounded-xl px-0.5 py-1.5 text-[11px] leading-none text-white data-[state=active]:bg-white data-[state=active]:text-[var(--subject-light-ink)] data-[state=active]:shadow-none"
              >
                <Icon className="size-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <TabsContent value="notes">
          <div className="relative z-10 mx-4 mt-4 rounded-[28px] bg-card p-5 shadow-lifted md:mx-5">
            <div className="prose prose-headings:text-foreground prose-h2:text-lg prose-h2:font-bold prose-p:text-[14.5px] prose-p:leading-[1.65] prose-table:border prose-th:border prose-th:p-2 prose-td:border prose-td:p-2">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={diagramUrlTransform}
                components={{
                  img: DiagramMarkdownImage,
                  table: ChapterNotesTable,
                  blockquote: ({ children }) => (
                    <blockquote className="not-prose my-5 flex gap-3 rounded-2xl border-0 bg-warning-bg p-4 text-sm leading-relaxed text-warning-ink">
                      <Lightbulb className="mt-0.5 size-5 shrink-0" />
                      <div>{children}</div>
                    </blockquote>
                  ),
                }}
              >
                {chapter.summary_md || "_No notes yet._"}
              </ReactMarkdown>
            </div>
            <ChapterNoteDiagrams chapterId={chapterId} excludedPaths={embeddedDiagramPaths} />
          </div>
          <div className="mx-4 md:mx-5">
            <NextStepCard onPick={setTab} />
          </div>
          <div className="mx-4 md:mx-5">
            <ChapterVideos chapterId={chapterId} />
          </div>
          {updated && (
            <div className="mx-4 mt-3 rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground md:mx-5">
              Last updated {updated}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quiz">
          <ChapterQuiz chapterId={chapterId} />
        </TabsContent>
        <TabsContent value="flashcards">
          <ChapterFlashcards
            chapterId={chapterId}
            chapterTitle={chapter.title}
            subjectName={subject?.name ?? null}
          />
        </TabsContent>
        <TabsContent value="diagrams">
          <ChapterDiagramTest chapterId={chapterId} />
        </TabsContent>
        <TabsContent value="tutor">
          <ChapterTutor chapterId={chapterId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Shown after the notes: turn reading into practice straight away. */
function NextStepCard({ onPick }: { onPick: (tab: string) => void }) {
  const go = (tab: ChapterTab) => {
    onPick(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="mt-4 flex items-center gap-4 rounded-[20px] bg-[var(--subject-light-deep)] p-4 text-white">
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl">Done reading?</p>
        <p className="mt-0.5 text-xs text-white/70">Review the key ideas while they are fresh.</p>
      </div>
      <button
        onClick={() => go("flashcards")}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-[var(--subject-light-ink)]"
      >
        Review <ArrowRight className="size-4" />
      </button>
    </div>
  );
}
