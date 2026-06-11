import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Custom <img> renderer for ReactMarkdown that resolves `diagram://<path>`
 * URIs to short-lived signed URLs from the private `diagrams` bucket.
 * Regular http(s) urls are rendered as-is.
 */
export function DiagramMarkdownImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { src, alt, ...rest } = props;
  const [resolved, setResolved] = useState<string | undefined>(
    typeof src === "string" && src.startsWith("diagram://") ? undefined : (src as string | undefined),
  );

  useEffect(() => {
    if (typeof src !== "string" || !src.startsWith("diagram://")) {
      setResolved(src as string | undefined);
      return;
    }
    const path = src.replace(/^diagram:\/\//, "");
    let cancelled = false;
    supabase.storage
      .from("diagrams")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setResolved(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!resolved) {
    return <span className="text-xs text-muted-foreground">Loading image…</span>;
  }
  return <img src={resolved} alt={alt ?? ""} {...rest} className="rounded-lg max-w-full h-auto" />;
}
