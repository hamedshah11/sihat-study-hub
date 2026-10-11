import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUserId } from "@/hooks/use-session-user";
import {
  downloadFallbackQueryOptions,
  downloadStore,
  readWithDownloadFallback,
} from "@/lib/downloads";
import type { ReviewState } from "@/lib/spacedRepetition";
import type { DownloadedCard, DownloadedDiagram } from "@/lib/offline-store";

// Chapter and flashcard reads for the student's chapter page: from Supabase
// when there's signal, from the student's own download when the device is
// offline or the request fails.

export type ChapterDetail = {
  chapter: {
    id: string;
    title: string;
    summary_md: string | null;
    updated_at: string | null;
  } | null;
  subject: { id: string; name: string; colour: string | null } | null;
  /** Approved diagrams: figures under the notes, and the Diagrams tab when online. */
  diagrams: DownloadedDiagram[];
  source: "network" | "download";
};

async function chapterFromNetwork(chapterId: string): Promise<ChapterDetail> {
  // The subject comes embedded with the chapter, and the diagrams alongside:
  // one round trip.
  const [chapterResult, diagramsResult] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, summary_md, updated_at, subjects(id, name, colour)")
      .eq("id", chapterId)
      .maybeSingle(),
    supabase
      .from("diagram_labels")
      .select("id, title, image_path")
      .eq("chapter_id", chapterId)
      .eq("status", "approved")
      .order("display_order", { ascending: true }),
  ]);
  if (chapterResult.error) throw new Error(chapterResult.error.message);
  if (diagramsResult.error) throw new Error(diagramsResult.error.message);
  const row = chapterResult.data as
    (NonNullable<ChapterDetail["chapter"]> & { subjects: ChapterDetail["subject"] }) | null;
  if (!row) return { chapter: null, subject: null, diagrams: [], source: "network" };
  const { subjects, ...chapter } = row;
  return {
    chapter,
    subject: subjects,
    diagrams: (diagramsResult.data ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      imagePath: d.image_path,
    })),
    source: "network",
  };
}

async function chapterFromDownload(
  userId: string | null,
  chapterId: string,
): Promise<ChapterDetail | null> {
  const saved = userId ? await downloadStore()?.getChapter(userId, chapterId) : null;
  if (!saved) return null;
  return {
    chapter: {
      id: saved.chapterId,
      title: saved.title,
      summary_md: saved.summaryMd,
      updated_at: saved.updatedAt,
    },
    subject: saved.subject,
    diagrams: saved.diagrams,
    source: "download",
  };
}

export function useChapterDetail(chapterId: string) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: ["chapter-detail", chapterId, userId],
    ...downloadFallbackQueryOptions,
    queryFn: () =>
      readWithDownloadFallback(
        () => chapterFromNetwork(chapterId),
        () => chapterFromDownload(userId, chapterId),
      ),
  });
}

export type ReviewRow = Partial<ReviewState> & { flashcard_id: string };

export type ChapterCards = {
  cards: DownloadedCard[];
  /** The student's review state per card; empty when read from a download. */
  reviews: ReviewRow[];
  source: "network" | "download";
};

async function cardsFromNetwork(userId: string | null, chapterId: string): Promise<ChapterCards> {
  const { data: cards, error } = await supabase
    .from("flashcards")
    .select("id, front, back, hint")
    .eq("chapter_id", chapterId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  let reviews: ReviewRow[] = [];
  if (userId && cards?.length) {
    const { data, error: reviewError } = await supabase
      .from("flashcard_reviews")
      .select(
        "flashcard_id, reps, lapses, state, stability, difficulty, scheduled_days, elapsed_days, learning_steps, last_review, due_at",
      )
      .eq("user_id", userId)
      .in(
        "flashcard_id",
        cards.map((c) => c.id),
      );
    if (reviewError) throw new Error(reviewError.message);
    reviews = (data ?? []) as ReviewRow[];
  }
  return { cards: cards ?? [], reviews, source: "network" };
}

/** A chapter's approved cards with the student's review state, or the downloaded cards. */
export function useChapterCards(chapterId: string, round: number) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: ["chapter-flashcards", chapterId, userId, round],
    ...downloadFallbackQueryOptions,
    refetchOnWindowFocus: false,
    queryFn: () =>
      readWithDownloadFallback(
        () => cardsFromNetwork(userId, chapterId),
        async (): Promise<ChapterCards | null> => {
          const saved = userId ? await downloadStore()?.getChapter(userId, chapterId) : null;
          return saved ? { cards: saved.flashcards, reviews: [], source: "download" } : null;
        },
      ),
  });
}
