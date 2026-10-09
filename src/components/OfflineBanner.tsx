import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * Says plainly what works without a connection. There is no offline save
 * queue yet, so it does not promise one: reviews and quizzes need a
 * connection to save.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-[18px] bg-muted px-4 py-3 text-[13.5px] leading-snug text-foreground"
    >
      <WifiOff className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-semibold">You're offline</p>
        <p className="text-muted-foreground">
          Pages you've already opened may still show. Reviews and quizzes save, and Ask Florence
          answers, once you're back online.
        </p>
      </div>
    </div>
  );
}
