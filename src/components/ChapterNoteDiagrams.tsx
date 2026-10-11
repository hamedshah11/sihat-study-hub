import { useDiagramImage } from "@/hooks/use-diagram-image";
import type { DownloadedDiagram } from "@/lib/offline-store";

function DiagramFigure({ diagram }: { diagram: DownloadedDiagram }) {
  const { url } = useDiagramImage(diagram.imagePath);
  return (
    <figure className="my-4">
      {url ? (
        <img src={url} alt={diagram.title} className="w-full h-auto rounded-lg" />
      ) : (
        <div className="h-48 rounded-lg bg-surface" />
      )}
      <figcaption className="mt-2 text-xs text-muted-foreground text-center">
        {diagram.title}
      </figcaption>
    </figure>
  );
}

/** Approved diagrams not already shown inside the notes, as figures below them. */
export function ChapterNoteDiagrams({
  diagrams,
  excludedPaths = [],
}: {
  diagrams: DownloadedDiagram[];
  excludedPaths?: string[];
}) {
  const visibleDiagrams = diagrams.filter((diagram) => !excludedPaths.includes(diagram.imagePath));
  if (visibleDiagrams.length === 0) return null;
  return (
    <div className="mt-4 space-y-4">
      {visibleDiagrams.map((d) => (
        <DiagramFigure key={d.id} diagram={d} />
      ))}
    </div>
  );
}
