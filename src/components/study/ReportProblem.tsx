import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { REPORT_REASONS, reportProblem, type ReportReason } from "@/lib/report.functions";
import { cn } from "@/lib/utils";

/** "Report a problem" from inside a question or flashcard. */
export function ReportProblem({
  kind,
  itemId,
  className,
}: {
  kind: "question" | "flashcard";
  itemId: string;
  className?: string;
}) {
  const send = useServerFn(reportProblem);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("wrong_answer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await send({ data: { kind, itemId, reason, note: note.trim() || undefined } });
      if (res.ok) {
        toast.success("Thank you. A teacher will look at it.");
        setOpen(false);
        setNote("");
      } else if (res.reason === "limit") {
        toast.error("You've sent a lot of reports today. Please try again tomorrow.");
      } else {
        toast.error("Reporting isn't available yet. Please tell your teacher directly.");
      }
    } catch {
      toast.error("That didn't send. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Flag className="size-3.5" aria-hidden /> Report a problem
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-[24px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="font-display text-[22px]">Report a problem</DialogTitle>
          <DialogDescription>
            Your teachers review every report. Your name isn't shown to classmates.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-1 space-y-3">
          <fieldset className="space-y-1.5">
            <legend className="sr-only">What's wrong?</legend>
            {(Object.entries(REPORT_REASONS) as [ReportReason, string][]).map(([key, label]) => (
              <label
                key={key}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-[14px]",
                  reason === key ? "border-foreground" : "border-border-strong/60",
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={key}
                  checked={reason === key}
                  onChange={() => setReason(key)}
                  className="size-4 accent-[var(--foreground)]"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Anything else? (optional)"
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send report"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
