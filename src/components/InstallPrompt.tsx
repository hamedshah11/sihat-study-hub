import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SESSION_KEY = "sihat:install-dismissed";

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

  if (bip) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="inline-flex size-9 items-center justify-center rounded-lg bg-accent/15 text-accent shrink-0">
            <Download className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">Install Sihat</p>
            <p className="text-xs text-muted-foreground truncate">
              Add to your home screen for quick access.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" onClick={install}>Install</Button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  if (showIOSHint) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="inline-flex size-9 items-center justify-center rounded-lg bg-accent/15 text-accent shrink-0">
          <Share className="size-4" />
        </div>
        <p className="flex-1 text-xs text-muted-foreground">
          Install Sihat: tap <span className="font-medium text-primary">Share</span>, then{" "}
          <span className="font-medium text-primary">Add to Home Screen</span>.
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted shrink-0"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return null;
}
