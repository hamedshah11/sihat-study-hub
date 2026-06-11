import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Eye, EyeOff, RotateCcw, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Pin = { id: string; x: number; y: number; label: string; aliases?: string[] };
type Diagram = {
  id: string;
  title: string;
  image_path: string;
  base_image_path: string | null;
  pins: Pin[];
};

function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let cancelled = false;
    supabase.storage.from("diagrams").createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ");
}

function isMatch(answer: string, pin: Pin) {
  const a = normalize(answer);
  if (!a) return false;
  const targets = [pin.label, ...(pin.aliases ?? [])].map(normalize).filter(Boolean);
  return targets.includes(a);
}

export function ChapterDiagramTest({ chapterId }: { chapterId: string }) {
  const { data: diagrams, isLoading } = useQuery({
    queryKey: ["chapter-diagrams-test", chapterId],
    queryFn: async (): Promise<Diagram[]> => {
      const { data, error } = await supabase
        .from("diagram_labels")
        .select("id, title, image_path, base_image_path, pins")
        .eq("chapter_id", chapterId)
        .eq("status", "approved")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        ...d,
        pins: Array.isArray(d.pins) ? (d.pins as unknown as Pin[]) : [],
      }));
    },
  });

  if (isLoading) return <Skeleton className="h-64 rounded-xl mt-4" />;
  if (!diagrams || diagrams.length === 0) {
    return (
      <div className="mt-4 rounded-xl bg-surface p-10 text-center text-sm text-muted-foreground">
        No diagrams to label for this chapter yet.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {diagrams.map((d) => (
        <DiagramRunner key={d.id} diagram={d} />
      ))}
    </div>
  );
}

function DiagramRunner({ diagram }: { diagram: Diagram }) {
  const pins = (diagram.pins ?? []).filter((p) => p.label?.trim());
  const imagePath = diagram.base_image_path || diagram.image_path;
  const url = useSignedUrl(imagePath);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showLabels, setShowLabels] = useState(false);

  const score = useMemo(() => {
    if (!submitted) return 0;
    return pins.reduce((acc, p) => acc + (isMatch(answers[p.id] ?? "", p) ? 1 : 0), 0);
  }, [submitted, answers, pins]);

  const reset = () => {
    setAnswers({});
    setSubmitted(false);
    setShowLabels(false);
  };

  if (pins.length === 0) return null;

  return (
    <div className="rounded-xl bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-primary">{diagram.title}</h3>
        {submitted && (
          <Badge variant={score === pins.length ? "default" : "secondary"}>
            {score}/{pins.length}
          </Badge>
        )}
      </div>

      <div className="relative w-full select-none">
        {url ? (
          <img
            src={url}
            alt={diagram.title}
            className="w-full h-auto rounded-lg block"
            draggable={false}
          />
        ) : (
          <div className="flex items-center justify-center h-48 rounded-lg bg-background text-muted-foreground text-sm">
            <ImageOff className="size-4 mr-2" /> Loading image…
          </div>
        )}
        {pins.map((pin, idx) => {
          const correct = submitted && isMatch(answers[pin.id] ?? "", pin);
          const wrong = submitted && !correct;
          return (
            <div
              key={pin.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
              style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            >
              <div
                className={cn(
                  "size-6 rounded-full text-xs font-bold shadow-md ring-2 ring-background flex items-center justify-center",
                  correct ? "bg-accent text-accent-foreground"
                    : wrong ? "bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {idx + 1}
              </div>
              {showLabels && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-background/90 shadow whitespace-nowrap">
                  {pin.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {pins.map((pin, idx) => {
          const val = answers[pin.id] ?? "";
          const correct = submitted && isMatch(val, pin);
          const wrong = submitted && !correct;
          return (
            <div key={pin.id} className="flex items-center gap-2">
              <span className="size-6 shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                {idx + 1}
              </span>
              <Input
                placeholder="Type the label…"
                value={val}
                disabled={submitted}
                onChange={(e) => setAnswers((p) => ({ ...p, [pin.id]: e.target.value }))}
                className={cn(
                  correct && "border-accent",
                  wrong && "border-destructive",
                )}
              />
              {correct && <CheckCircle2 className="size-4 text-accent shrink-0" />}
              {wrong && (
                <div className="flex items-center gap-1 shrink-0">
                  <XCircle className="size-4 text-destructive" />
                  <span className="text-xs text-muted-foreground">{pin.label}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {submitted ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setShowLabels((s) => !s)}>
              {showLabels ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showLabels ? "Hide answers" : "Show answers"}
            </Button>
            <Button size="sm" onClick={reset}>
              <RotateCcw className="size-4" /> Try again
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setSubmitted(true)} disabled={pins.some((p) => !(answers[p.id] ?? "").trim())}>
            Submit
          </Button>
        )}
      </div>
    </div>
  );
}
