import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration } from "@/lib/format-duration";

type Video = {
  id: string;
  external_id: string;
  title: string;
  channel_title: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  instructor_note: string | null;
};

/**
 * Click-to-load facade. A live YouTube iframe pulls over a megabyte before
 * anyone presses play, so each card shows only a small thumbnail until the
 * student taps it. Duration is shown up front so they can judge the data
 * cost first.
 */
function VideoCard({ video }: { video: Video }) {
  const [playing, setPlaying] = useState(false);
  const duration = formatDuration(video.duration_seconds);
  const thumb = video.thumbnail_url ?? `https://i.ytimg.com/vi/${video.external_id}/mqdefault.jpg`;
  const watchUrl = `https://www.youtube.com/watch?v=${video.external_id}`;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="relative aspect-video w-full bg-muted">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.external_id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 h-full w-full"
            aria-label={`Play ${video.title}`}
          >
            <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
              <span className="flex size-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                <Play className="size-5 translate-x-0.5 fill-primary text-primary" />
              </span>
            </span>
            {duration && (
              <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
                {duration}
              </span>
            )}
          </button>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-medium text-foreground">{video.title}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{video.channel_title}</span>
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 hover:text-foreground"
          >
            YouTube <ExternalLink className="size-3" />
          </a>
        </div>
        {video.instructor_note && (
          <p className="pt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Instructor note:</span>{" "}
            {video.instructor_note}
          </p>
        )}
      </div>
    </div>
  );
}

export function ChapterVideos({ chapterId }: { chapterId: string }) {
  const { data: videos } = useQuery({
    queryKey: ["chapter-videos", chapterId],
    queryFn: async (): Promise<Video[]> => {
      const { data, error } = await supabase
        .from("chapter_resources")
        .select(
          "id, external_id, title, channel_title, duration_seconds, thumbnail_url, instructor_note",
        )
        .eq("chapter_id", chapterId)
        .eq("status", "approved")
        .eq("embeddable", true)
        .eq("region_blocked", false)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!videos || videos.length === 0) return null;

  return (
    <section className="mt-4 rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-display text-lg font-semibold text-primary">Watch</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Videos picked by your instructors for this chapter. They load only when you tap play.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>
    </section>
  );
}
