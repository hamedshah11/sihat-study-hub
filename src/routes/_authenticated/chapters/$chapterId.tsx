import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
            .select("id, name")
            .eq("id", chapter.subject_id)
            .maybeSingle()
        : { data: null };
      return { chapter, subject };
    },
  });

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

  return (
    <div>
      <header className="animate-fade-up">
        {subject ? (
          <Link
            to="/subjects/$subjectId"
            params={{ subjectId: subject.id }}
            className="inline-flex items-center gap-1 rounded-full border bg-card py-1.5 pl-2 pr-3.5 text-sm font-medium text-muted-foreground shadow-soft transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {subject.name}
          </Link>
        ) : (
          <Link
            to="/subjects"
            className="inline-flex items-center gap-1 rounded-full border bg-card py-1.5 pl-2 pr-3.5 text-sm font-medium text-muted-foreground shadow-soft transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Subjects
          </Link>
        )}
        <h1 className="font-display mt-4 text-2xl font-bold text-primary">{chapter.title}</h1>
      </header>

      <Tabs value={activeTab} onValueChange={setTab} className="animate-fade-up stagger-1 mt-6">
        <TabsList className="grid h-auto w-full grid-cols-5 gap-0.5 rounded-xl border bg-secondary/80 p-1 shadow-soft">
          {TAB_ITEMS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex min-h-[48px] flex-col gap-0.5 rounded-lg px-0.5 py-1.5 text-[11px] leading-none data-[state=active]:shadow-soft"
            >
              <Icon className="size-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="notes">
          <div className="rounded-2xl border bg-card p-5 mt-4 shadow-soft">
            <div className="prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={diagramUrlTransform}
                components={{ img: DiagramMarkdownImage, table: ChapterNotesTable }}
              >
                {chapter.summary_md || "_No notes yet._"}
              </ReactMarkdown>
            </div>
            <ChapterNoteDiagrams chapterId={chapterId} excludedPaths={embeddedDiagramPaths} />
          </div>
          <NextStepCard onPick={setTab} />
          <ChapterVideos chapterId={chapterId} />
          {updated && (
            <div className="mt-3 rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground shadow-soft">
              Last updated {updated}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quiz">
          <ChapterQuiz chapterId={chapterId} />
        </TabsContent>
        <TabsContent value="flashcards">
          <ChapterFlashcards chapterId={chapterId} />
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
    <div className="mt-4 rounded-2xl border bg-card p-5 shadow-soft">
      <p className="font-display text-base font-bold text-primary">Finished reading?</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Test yourself now while it's fresh. It's the fastest way to remember it.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => go("quiz")}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform active:scale-[0.98]"
        >
          Take quiz <ArrowRight className="size-4" />
        </button>
        <button
          onClick={() => go("flashcards")}
          className="inline-flex items-center justify-center gap-1.5 rounded-full border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-soft transition-transform active:scale-[0.98]"
        >
          <Layers className="size-4" /> Flashcards
        </button>
      </div>
    </div>
  );
}
