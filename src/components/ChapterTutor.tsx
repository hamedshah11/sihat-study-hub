import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight, WifiOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { FlorenceMark } from "@/components/brand/FlorenceMark";
import { useOnline } from "@/components/OfflineBanner";
import { awardBadgesIfNeeded } from "@/lib/award-badges";

type Msg = { id: string; role: string; content: string; created_at: string };

const DAILY_LIMIT = 50;

/** Answers end with "Source: <section>"; split it off to show as a chip. */
export function splitSource(content: string): { body: string; source: string | null } {
  const lines = content.trimEnd().split("\n");
  const match = lines
    .at(-1)
    ?.trim()
    .match(/^source:\s*(.+)$/i);
  if (!match) return { body: content, source: null };
  return { body: lines.slice(0, -1).join("\n").trimEnd(), source: match[1].trim() };
}

/**
 * Ask Florence: the AI tutor, scoped to one chapter. Labelled as AI, answers
 * only from the chapter's approved notes, and shows the source section under
 * every answer. Offline, it says so plainly instead of spinning.
 */
export function ChapterTutor({
  chapterId,
  chapterTitle,
  onBack,
  onOpenSource,
}: {
  chapterId: string;
  chapterTitle?: string;
  onBack?: () => void;
  onOpenSource?: (heading: string) => void;
}) {
  const qc = useQueryClient();
  const online = useOnline();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["tutor-messages", chapterId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [] as Msg[];
      const { data, error } = await supabase
        .from("tutor_messages")
        .select("id, role, content, created_at")
        .eq("chapter_id", chapterId)
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const { data: todayCount } = useQuery({
    queryKey: ["tutor-today-count"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("tutor_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.user.id)
        .eq("role", "user")
        .gte("created_at", since.toISOString());
      return count ?? 0;
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length, sending]);

  const overLimit = (todayCount ?? 0) >= DAILY_LIMIT;
  const remaining = Math.max(0, DAILY_LIMIT - (todayCount ?? 0));

  async function sendQuestion(question: string) {
    if (!question || sending || overLimit || !online) return;
    setError(null);
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("tutor-ask", {
        body: { chapterId, question },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        if (ctx?.status === 429) {
          setError(
            `You've asked ${DAILY_LIMIT} questions today, the daily limit. Ask Florence is back tomorrow.`,
          );
        } else {
          setError("Ask Florence isn't available right now. Try again in a minute.");
        }
        return;
      }
      setInput("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tutor-messages", chapterId] }),
        qc.invalidateQueries({ queryKey: ["tutor-today-count"] }),
      ]);
      void awardBadgesIfNeeded();
    } catch {
      setError("That didn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col">
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-2 pt-[max(0.25rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-1">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to the chapter"
              className="-ml-2 grid size-11 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-6" />
            </button>
          )}
          <h1 className="text-[16px] font-semibold">
            Ask Florence
            {chapterTitle && <span className="sr-only">, about {chapterTitle}</span>}
          </h1>
        </div>
      </div>

      <p className="mt-2 rounded-2xl bg-muted px-4 py-3 text-[13px] leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground">AI tutor.</span> Answers only from this
        chapter's notes, which your teachers approved. Check anything important with your teacher.
      </p>

      <div className="mt-4 flex flex-1 flex-col gap-4 pb-4">
        {isLoading ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : !messages?.length ? (
          <div className="my-auto py-8 text-center">
            <FlorenceMark size={40} className="mx-auto" />
            <p className="mt-3 text-[15px] font-semibold">Ask anything about this chapter.</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              For example, "Why does the autoclave work better than boiling?"
            </p>
          </div>
        ) : (
          messages.map((m) => {
            if (m.role !== "assistant") {
              return (
                <div
                  key={m.id}
                  className="max-w-[85%] self-end rounded-[20px] rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-snug text-primary-foreground"
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              );
            }
            const { body, source } = splitSource(m.content);
            return (
              <div key={m.id} className="flex max-w-[92%] items-end gap-2 self-start">
                <FlorenceMark size={22} className="mb-1 shrink-0" title="Ask Florence" />
                <div className="rounded-[20px] rounded-bl-md border bg-card px-4 py-3 text-[15px] leading-relaxed">
                  <div className="prose max-w-none prose-p:mb-2 prose-p:text-[15px] prose-p:leading-relaxed [&>*:last-child]:mb-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                  </div>
                  {source && (
                    <button
                      type="button"
                      disabled={!onOpenSource}
                      onClick={() => onOpenSource?.(source)}
                      className="mt-3 inline-flex min-h-8 items-center gap-1 rounded-[10px] bg-streak-bg px-3 text-[13px] font-semibold text-accent-ink"
                    >
                      Source: {source}
                      {onOpenSource && <ChevronRight className="size-3.5" aria-hidden />}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        {sending && (
          <div className="flex items-end gap-2 self-start">
            <FlorenceMark size={22} className="mb-1 shrink-0" />
            <div
              className="flex gap-1 rounded-[20px] rounded-bl-md border bg-card px-4 py-3.5"
              aria-label="Florence is writing"
            >
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
              ))}
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <div className="sticky bottom-0 -mx-4 space-y-2 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        {!online ? (
          <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-[13.5px]">
            <WifiOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            Ask Florence needs internet. Your notes are still here.
          </p>
        ) : error ? (
          <p
            role="alert"
            className="rounded-xl bg-destructive-bg px-3 py-2.5 text-[13.5px] text-destructive-ink"
          >
            {error}
          </p>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendQuestion(input.trim());
          }}
          className="flex items-center gap-2"
        >
          <label htmlFor="ask-florence" className="sr-only">
            Ask about this chapter
          </label>
          <input
            id="ask-florence"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={overLimit ? "Back tomorrow" : "Ask about this chapter"}
            disabled={sending || overLimit || !online}
            maxLength={1000}
            className="h-12 min-w-0 flex-1 rounded-full border border-border-strong/60 bg-card px-5 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || overLimit || !online || !input.trim()}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-100"
            aria-label="Send"
          >
            <ArrowRight className="size-5" />
          </button>
        </form>
        {remaining <= 10 && (
          <p className="text-center text-[12px] text-muted-foreground">
            {overLimit
              ? "You've used today's questions. Ask Florence is back tomorrow."
              : `${remaining} questions left today`}
          </p>
        )}
      </div>
    </div>
  );
}
