import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Target } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { DiagramMarkdownImage, diagramUrlTransform } from "@/components/DiagramMarkdownImage";
import remarkGfm from "remark-gfm";
import { ChapterQuiz } from "@/components/ChapterQuiz";
import { ChapterFlashcards } from "@/components/ChapterFlashcards";
import { ChapterTutor } from "@/components/ChapterTutor";
import { ChapterDiagramTest } from "@/components/ChapterDiagramTest";
import { ChapterNoteDiagrams } from "@/components/ChapterNoteDiagrams";
import { parseLearningObjectives } from "@/lib/learningObjectives";

export const Route = createFileRoute("/_authenticated/chapters/$chapterId")({
  head: () => ({ meta: [{ title: "Chapter — Sihat" }] }),
  component: ChapterDetail,
});

function ChapterDetail() {
  const { chapterId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["chapter-detail", chapterId],
    queryFn: async () => {
      const { data: chapter } = await supabase
        .from("chapters")
        .select("id, title, summary_md, status, updated_at, subject_id, learning_objectives")
        .eq("id", chapterId)
        .maybeSingle();
      if (!chapter) return { chapter: null, subject: null };
      const { data: subject } = chapter.subject_id
        ? await supabase.from("subjects").select("id, name").eq("id", chapter.subject_id).maybeSingle()
        : { data: null };
      return { chapter, subject };
    },
  });

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;

  if (!data?.chapter) {
    return (
      <div>
        <Link to="/subjects" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
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
  // NULL, [], and any malformed value all collapse to [], which hides the
  // block entirely — chapters without objectives render exactly as before.
  const objectives = parseLearningObjectives(chapter.learning_objectives);
  const updated = chapter.updated_at
    ? new Date(chapter.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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

      <Tabs defaultValue="notes" className="animate-fade-up stagger-1 mt-6">
        <TabsList className="grid h-auto w-full grid-cols-5 rounded-xl border bg-secondary/80 p-1 shadow-soft">
          <TabsTrigger className="rounded-lg py-1.5 data-[state=active]:shadow-soft" value="notes">Notes</TabsTrigger>
          <TabsTrigger className="rounded-lg py-1.5 data-[state=active]:shadow-soft" value="quiz">Quiz</TabsTrigger>
          <TabsTrigger className="rounded-lg py-1.5 data-[state=active]:shadow-soft" value="flashcards">Flashcards</TabsTrigger>
          <TabsTrigger className="rounded-lg py-1.5 data-[state=active]:shadow-soft" value="diagrams">Diagrams</TabsTrigger>
          <TabsTrigger className="rounded-lg py-1.5 data-[state=active]:shadow-soft" value="tutor">Tutor</TabsTrigger>
        </TabsList>

        <TabsContent value="notes">
          {objectives.length > 0 && (
            <section className="mt-4 rounded-2xl border bg-card p-5 shadow-soft">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Target className="size-4 text-accent" /> Learning objectives
              </h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-foreground">
                {objectives.map((objective, i) => (
                  <li key={i}>{objective}</li>
                ))}
              </ul>
            </section>
          )}
          <div className="rounded-2xl border bg-card p-5 mt-4 shadow-soft">
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={diagramUrlTransform} components={{ img: DiagramMarkdownImage }}>
                {chapter.summary_md || "_No notes yet._"}
              </ReactMarkdown>
            </div>
            <ChapterNoteDiagrams chapterId={chapterId} excludedPaths={embeddedDiagramPaths} />
          </div>
          {updated && (
            <div className="mt-3 rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground shadow-soft">
              Last updated {updated}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quiz"><ChapterQuiz chapterId={chapterId} /></TabsContent>
        <TabsContent value="flashcards"><ChapterFlashcards chapterId={chapterId} /></TabsContent>
        <TabsContent value="diagrams"><ChapterDiagramTest chapterId={chapterId} /></TabsContent>
        <TabsContent value="tutor"><ChapterTutor chapterId={chapterId} /></TabsContent>
      </Tabs>
    </div>
  );
}
