import { useEffect } from "react";
import { beginStudySession } from "@/lib/theme";

/**
 * Hold the current theme while a flashcard, quiz or exam session is open, so
 * Automatic never switches to Lamplight mode in the middle of a question.
 */
export function useStudySessionLock(active = true) {
  useEffect(() => {
    if (!active) return;
    return beginStudySession();
  }, [active]);
}
