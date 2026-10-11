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
 * queue, so it does not promise one: reviews and quizzes need a connection
 * to save.
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
          Downloaded chapters still open. Saving reviews and quizzes, and Ask Florence, need
          internet.
        </p>
      </div>
    </div>
  );
}

/** A plain card for screens that need the server, shown instead of failing silently. */
export function NeedsInternet({
  title,
  children,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[22px] border bg-card p-5 ${className ?? ""}`}>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <WifiOff className="size-4" aria-hidden /> Offline
      </p>
      <h2 className="mt-2 font-display text-[22px] leading-tight">{title}</h2>
      {children}
    </div>
  );
}
