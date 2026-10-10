import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SESSION_KEY = "florence:install-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

export function InstallPrompt() {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setDismissed(true);
      return;
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS fallback
    if (isIOS()) setShowIOSHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setDismissed(true);
  };

  const install = async () => {
    if (!bip) return;
    await bip.prompt();
    await bip.userChoice.catch(() => undefined);
    setBip(null);
    dismiss();
  };

  if (dismissed) return null;

  if (!bip && !showIOSHint) return null;

  return (
    <div className="flex items-start gap-3 rounded-[20px] border border-dashed border-border-strong px-4 py-3">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
        {bip ? <Download className="size-4" /> : <Share className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">Add Florence to your home screen</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
          {bip ? (
            "It opens faster, like an app."
          ) : (
            <>
              Tap <span className="font-semibold text-foreground">Share</span>, then{" "}
              <span className="font-semibold text-foreground">Add to Home Screen</span>.
            </>
          )}
        </p>
        {bip && (
          <Button size="sm" onClick={install} className="mt-2.5 h-9 rounded-full px-4">
            Add to home screen
          </Button>
        )}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
