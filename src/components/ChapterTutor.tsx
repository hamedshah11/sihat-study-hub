import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Send, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { recordStudyActivity } from "@/lib/study-activity";
import { awardBadgesIfNeeded } from "@/lib/award-badges";

type Msg = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

const DAILY_LIMIT = 50;

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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
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
      await recordStudyActivity("tutor");
      await awardBadgesIfNeeded();
    } catch (err: any) {
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (isLoading) return <Skeleton className="h-64 rounded-xl mt-4" />;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div
        ref={scrollRef}
        className="rounded-xl bg-surface p-4 min-h-[280px] max-h-[60vh] overflow-y-auto flex flex-col gap-3"
      >
        {!messages?.length ? (
          <div className="m-auto text-center text-sm text-muted-foreground">
            <div className="mx-auto inline-flex items-center justify-center rounded-full bg-muted p-3 text-muted-foreground">
              <Sparkles className="size-6" />
            </div>
            <p className="mt-2">Ask anything about this chapter.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start bg-muted text-foreground"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          ))
        )}
        {sending && (
          <div className="self-start rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
            Thinking…
          </div>
        )}
      </div>

      {(error || limitMsg) && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-sm">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{limitMsg || error}</span>
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={overLimit ? "Daily limit reached" : "Ask something about this chapter..."}
          disabled={sending || overLimit}
          maxLength={1000}
          className="flex-1 rounded-full bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || overLimit || !input.trim()}
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground size-11 disabled:opacity-50"
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
