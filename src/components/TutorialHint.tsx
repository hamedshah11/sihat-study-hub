import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  hintDismissedHere,
  hintSeenMetadata,
  markHintDismissedHere,
  shouldShowHint,
  type HintId,
} from "@/lib/tutorial";

/**
 * A one-time pointer for a student who has just finished the tour: one per
 * screen, dismissed for good with "Got it". Accounts that never took the
 * tour don't see hints (see `shouldShowHint`). Reads the session stored on
 * the phone, so it costs no request and works with no signal.
 */
export function TutorialHint({
  id,
  title,
  children,
  className = "",
}: {
  id: HintId;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      const metadata = data.session?.user.user_metadata;
      if (!cancelled && shouldShowHint(id, metadata, hintDismissedHere(id))) setShow(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!show) return null;

  async function dismiss() {
    setShow(false);
    markHintDismissedHere(id);
    // Best effort: with no signal this phone's copy is enough.
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await supabase.auth.updateUser({
        data: hintSeenMetadata(id, data.session.user.user_metadata),
      });
    } catch {
      // Stays dismissed on this phone.
    }
  }

  return (
    <aside
      aria-label={`Tip: ${title}`}
      className={`animate-fade-up flex items-start gap-3 rounded-[20px] border border-border-strong bg-card px-4 py-3.5 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold">{title}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-muted-foreground">{children}</p>
        <button
          onClick={() => void dismiss()}
          className="mt-2 -ml-1 min-h-9 px-1 text-[14px] font-semibold text-accent-ink"
        >
          Got it
        </button>
      </div>
      <button
        onClick={() => void dismiss()}
        aria-label="Dismiss tip"
        className="-mr-2 -mt-1.5 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}
