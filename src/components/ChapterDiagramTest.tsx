import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Eye, EyeOff, RotateCcw, ImageOff, ZoomIn, ZoomOut } from "lucide-react";
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

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function DiagramRunner({ diagram }: { diagram: Diagram }) {
  const pins = (diagram.pins ?? []).filter((p) => p.label?.trim());
  const imagePath = diagram.base_image_path || diagram.image_path;
  const url = useSignedUrl(imagePath);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [focusedPin, setFocusedPin] = useState<string | null>(null);

  // ---- zoom / pan ----
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const zoomAt = useCallback((nextZoomRaw: number, px: number, py: number) => {
    setView((v) => {
      const next = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
      const k = next / v.zoom;
      let x = px - (px - v.x) * k;
      let y = py - (py - v.y) * k;
      if (next === 1) {
        x = 0;
        y = 0;
      }
      return { zoom: next, x, y };
    });
  }, []);

  const pointFromEvent = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { px: clientX - (rect?.left ?? 0), py: clientY - (rect?.top ?? 0) };
  }, []);

  // wheel + trackpad pinch (non-passive)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const { px, py } = pointFromEvent(e.clientX, e.clientY);
      zoomAt(viewRef.current.zoom * Math.exp(-dy * 0.0015), px, py);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pointFromEvent, zoomAt]);

  // touch pinch / drag / double-tap
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const lastTap = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: viewRef.current.zoom,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const { px, py } = pointFromEvent((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt(pinchStart.current.zoom * (dist / pinchStart.current.dist), px, py);
      return;
    }
    if (pointers.current.size === 1 && viewRef.current.zoom > 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      const { px, py } = pointFromEvent(e.clientX, e.clientY);
      zoomAt(viewRef.current.zoom > 1.2 ? 1 : 2.5, px, py);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  // marker sizing: relative to rendered diagram width, constant visual size while zoomed
  const markerPx = clamp(width * 0.032, 14, 28) / view.zoom;
  const fontPx = Math.max(9, markerPx * 0.55);
  const hitPx = 44 / view.zoom;

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

      <div className="-mx-2 sm:mx-0">
        <div
          ref={viewportRef}
          className="relative w-full overflow-hidden rounded-lg select-none touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="relative w-full"
            style={{
              transformOrigin: "0 0",
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            }}
          >
            {url ? (
              <img
                src={url}
                alt={diagram.title}
                className="w-full h-auto rounded-lg block object-contain"
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
              const active = focusedPin === pin.id;
              return (
                <div
                  key={pin.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center group"
                  style={{
                    left: `${pin.x * 100}%`,
                    top: `${pin.y * 100}%`,
                    width: hitPx,
                    height: hitPx,
                  }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "rounded-full font-bold shadow-md ring-2 ring-background flex items-center justify-center transition-opacity group-hover:opacity-100",
                        correct
                          ? "bg-accent text-accent-foreground"
                          : wrong
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-primary text-primary-foreground",
                      )}
                      style={{
                        width: markerPx,
                        height: markerPx,
                        fontSize: fontPx,
                        lineHeight: 1,
                        opacity: active || submitted ? 1 : 0.85,
                      }}
                    >
                      {idx + 1}
                    </div>
                    {showLabels && (
                      <span
                        className="font-medium px-1.5 py-0.5 rounded bg-background/90 shadow whitespace-nowrap"
                        style={{ fontSize: Math.max(9, 10 / view.zoom) }}
                      >
                        {pin.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Pinch or double-tap to zoom</p>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            aria-label="Zoom out"
            onClick={() => zoomAt(view.zoom / 1.5, width / 2, (viewportRef.current?.clientHeight ?? 0) / 2)}
          >
            <ZoomOut className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Zoom in"
            onClick={() => zoomAt(view.zoom * 1.5, width / 2, (viewportRef.current?.clientHeight ?? 0) / 2)}
          >
            <ZoomIn className="size-4" />
          </Button>
        </div>
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
                onFocus={() => setFocusedPin(pin.id)}
                onBlur={() => setFocusedPin((p) => (p === pin.id ? null : p))}
                onChange={(e) => setAnswers((p) => ({ ...p, [pin.id]: e.target.value }))}
                className={cn(correct && "border-accent", wrong && "border-destructive")}
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
