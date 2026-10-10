import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const RATINGS = [
  ["Again · Forgot", "You didn't remember it. The card comes back in a few minutes."],
  ["Hard · Barely", "You got there, but it was a struggle. It comes back sooner than usual."],
  ["Good · Got it", "You remembered it with a little thought. It comes back after a normal gap."],
  ["Easy · Instant", "You knew it straight away. It comes back after a longer gap."],
] as const;

/** "What do these mean?": the four plain-word ratings explained. */
export function RatingHelp() {
  return (
    <Dialog>
      <DialogTrigger className="max-w-[110px] text-right text-[13.5px] font-semibold leading-snug text-accent-ink underline-offset-2 hover:underline">
        What do these mean?
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-[24px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[22px]">
            How well did you remember it?
          </DialogTitle>
          <DialogDescription>
            Be honest: Florence uses your answer to decide when you'll see the card again.
          </DialogDescription>
        </DialogHeader>
        <dl className="mt-2 space-y-3">
          {RATINGS.map(([term, meaning]) => (
            <div key={term}>
              <dt className="text-[14px] font-semibold">{term}</dt>
              <dd className="text-[14px] leading-snug text-muted-foreground">{meaning}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
