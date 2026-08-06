import { useEffect, useState } from "react";
import { defaultUrlTransform } from "react-markdown";
import { supabase } from "@/integrations/supabase/client";

/**
 * Custom <img> renderer for ReactMarkdown that resolves `diagram://<path>`
 * URIs to short-lived signed URLs from the private `diagrams` bucket.
 * Regular http(s) urls are rendered as-is.
 */
/**
 * ReactMarkdown strips URLs with unknown schemes by default, which turned
 * `diagram://…` images into an empty src. Keep our custom scheme intact.
 */
export function diagramUrlTransform(url: string) {
  if (url.startsWith("diagram://")) return url;
  return defaultUrlTransform(url);
}

export function DiagramMarkdownImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { src, alt, ...rest } = props;
  const isDiagram = typeof src === "string" && src.startsWith("diagram://");
  const [resolved, setResolved] = useState<string | undefined>(
    isDiagram ? undefined : (src as string | undefined),
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof src !== "string" || !src.startsWith("diagram://")) {
      setResolved(src as string | undefined);
      setFailed(false);
      return;
    }
    const path = src.replace(/^diagram:\/\//, "");
    let cancelled = false;
    setFailed(false);
    supabase.storage
      .from("diagrams")
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data?.signedUrl) setResolved(data.signedUrl);
        else {
          console.error("Failed to sign diagram image", path, error);
          setFailed(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to sign diagram image", path, err);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <span className="text-xs text-destructive">
        Image unavailable{alt ? `: ${alt}` : ""}
      </span>
    );
  }

  if (!resolved) {
    return <span className="text-xs text-muted-foreground">Loading image…</span>;
  }
  return <img src={resolved} alt={alt ?? ""} {...rest} className="rounded-lg max-w-full h-auto" />;
}
