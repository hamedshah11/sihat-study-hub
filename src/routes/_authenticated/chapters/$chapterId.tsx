import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Sparkles, Brain, ClipboardList } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
        .select("id, title, summary_md, status, updated_at, subject_id")
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
  const updated = chapter.updated_at
    ? new Date(chapter.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div>
      {subject ? (
        <Link
          to="/subjects/$subjectId"
          params={{ subjectId: subject.id }}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> {subject.name}
        </Link>
      ) : (
        <Link to="/subjects" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Subjects
        </Link>
      )}
      <h1 className="mt-2 text-2xl font-bold text-primary">{chapter.title}</h1>

      <Tabs defaultValue="notes" className="mt-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="quiz">Quiz</TabsTrigger>
          <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
          <TabsTrigger value="tutor">Tutor</TabsTrigger>
        </TabsList>

        <TabsContent value="notes">
          <div className="rounded-xl bg-surface p-5 mt-4">
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {chapter.summary_md || "_No notes yet._"}
              </ReactMarkdown>
            </div>
          </div>
          {updated && (
            <div className="mt-3 rounded-xl bg-surface px-4 py-3 text-xs text-muted-foreground">
              Last updated {updated}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quiz"><ComingSoon icon={<ClipboardList className="size-8" />} label="Quiz coming soon" /></TabsContent>
        <TabsContent value="flashcards"><ComingSoon icon={<Brain className="size-8" />} label="Flashcards coming soon" /></TabsContent>
        <TabsContent value="tutor"><ComingSoon icon={<Sparkles className="size-8" />} label="Tutor coming soon" /></TabsContent>
      </Tabs>
    </div>
  );
}

function ComingSoon({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mt-4 rounded-xl bg-surface p-10 text-center">
      <div className="mx-auto inline-flex items-center justify-center rounded-full bg-muted p-4 text-muted-foreground">
        {icon}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
