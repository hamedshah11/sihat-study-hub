import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Diagram = { id: string; title: string; image_path: string };

function DiagramFigure({ diagram }: { diagram: Diagram }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage.from("diagrams").createSignedUrl(diagram.image_path, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [diagram.image_path]);
  return (
    <figure className="my-4">
      {url ? (
        <img src={url} alt={diagram.title} className="w-full h-auto rounded-lg" />
      ) : (
        <div className="h-48 rounded-lg bg-surface" />
      )}
      <figcaption className="mt-2 text-xs text-muted-foreground text-center">{diagram.title}</figcaption>
    </figure>
  );
}

export function ChapterNoteDiagrams({
  chapterId,
  excludedPaths = [],
}: {
  chapterId: string;
  excludedPaths?: string[];
}) {
  const { data: diagrams } = useQuery({
    queryKey: ["chapter-note-diagrams", chapterId],
    queryFn: async (): Promise<Diagram[]> => {
      const { data, error } = await supabase
        .from("diagram_labels")
        .select("id, title, image_path")
        .eq("chapter_id", chapterId)
        .eq("status", "approved")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const visibleDiagrams = diagrams?.filter((diagram) => !excludedPaths.includes(diagram.image_path));
  if (!visibleDiagrams || visibleDiagrams.length === 0) return null;
  return (
    <div className="mt-4 space-y-4">
      {visibleDiagrams.map((d) => <DiagramFigure key={d.id} diagram={d} />)}
    </div>
  );
}
