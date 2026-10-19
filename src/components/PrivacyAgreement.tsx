import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { consentMetadata } from "@/lib/privacy";

/** The privacy notice link. Opens in a new tab so a half-filled form survives. */
export function PrivacyLink({ children = "privacy notice" }: { children?: React.ReactNode }) {
  return (
    <a
      href="/privacy"
      target="_blank"
      rel="noopener"
      className="font-semibold text-accent-ink underline underline-offset-2"
    >
      {children}
    </a>
  );
}

/** "I've read the privacy notice" tick box on Join your batch. */
export function PrivacyAgreement({
  checked,
  onChange,
  error,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="privacy-agree" className="flex items-start gap-3 text-[14.5px] leading-snug">
        <Checkbox
          id="privacy-agree"
          checked={checked}
          onCheckedChange={(v) => onChange(v === true)}
          className="mt-0.5 size-5 rounded-[6px]"
          aria-invalid={Boolean(error)}
        />
        <span>
          I&apos;ve read the <PrivacyLink /> and agree to Florence keeping my study progress and my
          questions to Ask Florence.
        </span>
      </label>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/**
 * Shown once to anyone signed in who hasn't agreed to the current notice
 * (accounts made before it existed, or after PRIVACY_VERSION goes up).
 */
export function ConsentGate({
  onAgreed,
  onLogOut,
}: {
  onAgreed: () => void;
  onLogOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function agree() {
    setBusy(true);
    setError(undefined);
    const { error } = await supabase.auth.updateUser({ data: consentMetadata() });
    setBusy(false);
    if (error) {
      setError("That didn't save. Check your connection and try again.");
      return;
    }
    onAgreed();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-[440px] rounded-[24px] bg-background p-6 shadow-lg">
        <h2 id="consent-title" className="font-display text-[24px] leading-tight">
          Before you carry on
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Florence keeps your study progress, quiz answers and questions to Ask Florence so it can
          plan your reviews and show your progress. SIHAT faculty can see your progress to support
          your learning. Classmates never see your scores. You can delete your account at any time
          in Settings.
        </p>
        <p className="mt-3 text-[15px]">
          Read the full <PrivacyLink />.
        </p>
        <FieldError>{error}</FieldError>
        <button
          onClick={() => void agree()}
          disabled={busy}
          className="mt-5 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}I agree
        </button>
        <button
          onClick={onLogOut}
          disabled={busy}
          className="mt-2 flex min-h-11 w-full items-center justify-center text-[15px] font-semibold text-accent-ink"
        >
          Not now, log me out
        </button>
      </div>
    </div>
  );
}
