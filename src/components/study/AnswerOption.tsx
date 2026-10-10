import { cn } from "@/lib/utils";

export type OptionState = "idle" | "picked" | "wrong" | "correct";

/**
 * One multiple-choice option, as on the Practise sheet: the letter, the
 * answer, and after answering a rose "Your answer" or sage "Correct answer"
 * outline. The label words carry the meaning; colour only helps.
 */
export function AnswerOption({
  index,
  text,
  state,
  disabled,
  onClick,
}: {
  index: number;
  text: string;
  state: OptionState;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const tone =
    state === "wrong" ? "var(--rate-again)" : state === "correct" ? "var(--rate-good)" : undefined;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={state !== "idle"}
      disabled={disabled}
      onClick={onClick}
      style={
        tone
          ? { borderColor: tone, backgroundColor: `color-mix(in srgb, ${tone} 9%, var(--card))` }
          : undefined
      }
      className={cn(
        "flex min-h-[54px] w-full items-center gap-3.5 rounded-[14px] border-2 bg-card px-4 py-2.5 text-left transition-colors disabled:cursor-default",
        state === "idle" && "border-border-strong/45 enabled:hover:border-border-strong",
        state === "picked" && "border-foreground",
      )}
    >
      <span
        className="fl-number w-3 shrink-0 text-[13px] font-normal text-muted-foreground"
        style={tone ? { color: tone } : undefined}
      >
        {String.fromCharCode(65 + index)}
      </span>
      <span className="flex-1 text-[16px] font-semibold leading-snug">{text}</span>
      {state === "wrong" && (
        <span className="shrink-0 text-[13px] font-semibold" style={{ color: tone }}>
          Your answer
        </span>
      )}
      {state === "correct" && (
        <span
          className="max-w-[80px] shrink-0 text-right text-[13px] font-semibold leading-tight"
          style={{ color: tone }}
        >
          Correct answer
        </span>
      )}
    </button>
  );
}

/** "Not quite." or "That's right." with the one-line reason. */
export function AnswerFeedback({
  correct,
  explanation,
  children,
}: {
  correct: boolean;
  explanation: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-up mt-4 rounded-[16px] bg-muted px-4 py-3.5" aria-live="polite">
      <p className="text-[14.5px] font-semibold">{correct ? "That's right." : "Not quite."}</p>
      {explanation && (
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{explanation}</p>
      )}
      {children}
    </div>
  );
}

/** "You chose boiling water. The answer is the autoclave…" */
export function lowerFirst(text: string) {
  return text.length > 1 && text[1] === text[1].toLowerCase()
    ? text[0].toLowerCase() + text.slice(1)
    : text;
}
