import { defaultUrlTransform } from "react-markdown";
import { useDiagramImage } from "@/hooks/use-diagram-image";

/**
 * ReactMarkdown strips URLs with unknown schemes by default, which turned
 * `diagram://…` images into an empty src. Keep our custom scheme intact.
 */
export function diagramUrlTransform(url: string) {
  if (url.startsWith("diagram://")) return url;
  return defaultUrlTransform(url);
}

/**
 * Custom <img> renderer for ReactMarkdown that resolves `diagram://<path>`
 * URIs (see useDiagramImage). Regular http(s) urls are rendered as-is.
 */
export function DiagramMarkdownImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { src, alt, ...rest } = props;
  const diagramPath =
    typeof src === "string" && src.startsWith("diagram://")
      ? src.replace(/^diagram:\/\//, "")
      : null;
  const diagram = useDiagramImage(diagramPath);
  const resolved = diagramPath ? diagram.url : (src as string | undefined);

  if (diagramPath && diagram.failed) {
    return (
      <span className="text-xs text-destructive">Image unavailable{alt ? `: ${alt}` : ""}</span>
    );
  }

  if (!resolved) {
    return <span className="text-xs text-muted-foreground">Loading image…</span>;
  }
  return <img src={resolved} alt={alt ?? ""} {...rest} className="rounded-lg max-w-full h-auto" />;
}
