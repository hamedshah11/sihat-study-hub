import { useState } from "react";
import { Field, primaryButton } from "@/components/AuthShell";

/** Enter the one-time code sent by SMS or email. */
export function CodeStep({
  method,
  sentTo,
  onVerify,
  onResend,
  onChange,
}: {
  method: "phone" | "email";
  sentTo: string;
  onVerify: (code: string) => Promise<string | null>;
  onResend: () => Promise<void>;
  onChange: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.length < 6) return;
    setBusy(true);
    setError(undefined);
    const problem = await onVerify(code);
    if (problem) setError(problem);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        {method === "phone" ? (
          <>
            We sent a 6-digit code by SMS to{" "}
            <span className="font-semibold text-foreground">{sentTo}</span>.
          </>
        ) : (
          <>
            We sent a 6-digit code to{" "}
            <span className="font-semibold text-foreground">{sentTo}</span>. You can also tap the
            link in that email.
          </>
        )}
      </p>
      <div className="mt-5">
        <Field
          id="one-time-code"
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          className="fl-number tracking-[0.3em]"
          error={error}
          autoFocus
        />
      </div>
      <div className="mt-3 flex items-center gap-4 text-[14px]">
        <button
          type="button"
          disabled={resent}
          onClick={async () => {
            await onResend();
            setResent(true);
          }}
          className="min-h-11 font-semibold text-accent-ink disabled:text-muted-foreground"
        >
          {resent ? "Sent again" : "Send it again"}
        </button>
        <button type="button" onClick={onChange} className="min-h-11 text-muted-foreground">
          {method === "phone" ? "Change number" : "Change email"}
        </button>
      </div>
      <div className="mt-auto pt-8">
        <button type="submit" disabled={busy || code.length < 6} className={primaryButton}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </div>
    </form>
  );
}
