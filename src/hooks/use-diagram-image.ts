import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { downloadStore } from "@/lib/downloads";

/** Set by the chapter page: whose download, and which chapter, to read images from. */
export const DownloadedImagesContext = createContext<{ userId: string; chapterId: string } | null>(
  null,
);

/**
 * A diagram image from the private `diagrams` bucket. When the chapter is
 * downloaded the stored file is shown (no signal or data needed); otherwise
 * a short-lived signed URL.
 */
export function useDiagramImage(path: string | null | undefined) {
  const downloaded = useContext(DownloadedImagesContext);
  const userId = downloaded?.userId;
  const chapterId = downloaded?.chapterId;
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({
    url: null,
    failed: false,
  });

  useEffect(() => {
    if (!path) {
      setState({ url: null, failed: false });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, failed: false });
    void (async () => {
      const blob =
        userId && chapterId
          ? await downloadStore()
              ?.getImage(userId, chapterId, path)
              .catch(() => null)
          : null;
      if (cancelled) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, failed: false });
        return;
      }
      try {
        const { data, error } = await supabase.storage
          .from("diagrams")
          .createSignedUrl(path, 60 * 60);
        if (cancelled) return;
        if (data?.signedUrl) setState({ url: data.signedUrl, failed: false });
        else {
          console.error("Failed to sign diagram image", path, error);
          setState({ url: null, failed: true });
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to sign diagram image", path, err);
        setState({ url: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, userId, chapterId]);

  return state;
}
