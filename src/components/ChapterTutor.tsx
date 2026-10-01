import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Send, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { awardBadgesIfNeeded } from "@/lib/award-badges";

type Msg = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  source?: string | null;
};

const DAILY_LIMIT = 50;
const SUGGESTIONS = ["Quiz me on this", "Give me a mnemonic", "Explain simply"];

export function ChapterTutor({ chapterId }: { chapterId: string }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
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
    queryKey: ["tutor-today-count", chapterId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const since = new Date();
      since.setHours(0, 0, 0, 0);
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length, sending]);

  const remaining = Math.max(0, DAILY_LIMIT - (todayCount ?? 0));
  const overLimit = (todayCount ?? 0) >= DAILY_LIMIT;

  async function sendQuestion(question: string) {
    if (!question || sending || overLimit) return;
    setError(null);
    setLimitMsg(null);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("tutor-ask", {
        body: { chapterId, question },
      });
      if (error) {
        // FunctionsHttpError includes context with the response
        const ctx = (error as any).context;
        if (ctx?.status === 429) {
          let msg = `You've reached your daily limit of ${DAILY_LIMIT} tutor questions. Try again tomorrow.`;
          try {
            const body = await ctx.json();
            if (body?.message) msg = body.message;
          } catch {}
          setLimitMsg(msg);
        } else {
          setError(error.message || "Something went wrong. Please try again.");
        }
        return;
      }
      setInput("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tutor-messages", chapterId] }),
        qc.invalidateQueries({ queryKey: ["tutor-today-count", chapterId] }),
      ]);
      await awardBadgesIfNeeded();
    } catch (err: any) {
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    void sendQuestion(input.trim());
  }

  if (isLoading) return <Skeleton className="h-64 rounded-xl mt-4" />;

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div
        ref={scrollRef}
        className="min-h-[320px] max-h-[60vh] overflow-y-auto rounded-[28px] bg-primary-tint/40 p-4 flex flex-col gap-4"
      >
        {!messages?.length ? (
          <div className="m-auto text-center text-sm text-muted-foreground">
            <div className="mx-auto inline-flex items-center justify-center rounded-2xl bg-primary-tint p-3 text-primary">
              <Sparkles className="size-6" />
            </div>
            <p className="mt-2">Ask anything about this chapter.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex max-w-[88%] gap-2 ${m.role === "user" ? "self-end" : "self-start"}`}
            >
              {m.role === "assistant" && (
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary">
                  <Sparkles className="size-4" />
                </span>
              )}
              <div
                className={`rounded-[20px] px-4 py-3 text-sm leading-relaxed shadow-soft ${
                  m.role === "user"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-tl-md bg-card text-foreground"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
                {m.role === "assistant" && m.source && (
                  <span className="mt-3 inline-flex rounded-full bg-primary-tint px-2.5 py-1 text-[11px] font-semibold text-primary-deep">
                    From {m.source}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex self-start items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-primary-tint text-primary">
              <Sparkles className="size-4" />
            </span>
            <div
              className="flex gap-1 rounded-[20px] rounded-tl-md bg-card px-4 py-3 shadow-soft"
              aria-label="Tutor is typing"
            >
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="typing-dot size-1.5 rounded-full bg-primary" />
              ))}
            </div>
          </div>
        )}
      </div>

      {(error || limitMsg) && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-sm">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{limitMsg || error}</span>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={sending || overLimit}
            onClick={() => void sendQuestion(suggestion)}
            className="shrink-0 rounded-full border bg-card px-3.5 py-2 text-xs font-semibold text-primary-deep disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 rounded-[18px] bg-card p-1.5 shadow-soft"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={overLimit ? "Daily limit reached" : "Ask something about this chapter..."}
          disabled={sending || overLimit}
          maxLength={1000}
          className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || overLimit || !input.trim()}
          className="inline-flex size-11 items-center justify-center rounded-[14px] bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>

      <p className="text-xs text-muted-foreground text-center">
        {overLimit
          ? "You've used all 50 tutor questions for today."
          : `${remaining} of ${DAILY_LIMIT} questions left today`}
      </p>
    </div>
  );
}
