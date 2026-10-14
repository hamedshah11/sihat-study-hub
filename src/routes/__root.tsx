import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { BRAND } from "@/lib/brand";

const DESCRIPTION =
  "Florence: short daily reviews for BSN nursing students. Flashcards, MCQs and summaries, reviewed by SIHAT faculty.";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="fl-label text-muted-foreground">404</p>
        <h1 className="mt-3 font-display text-[34px] leading-tight text-foreground">
          This page isn't here.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have moved. Let's take you back to today's review.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Go to Today
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => reportError("render", error), [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-[28px] leading-tight text-foreground">
          This page didn't load.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our side. Your progress is safe. Try again, or go back to Today.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full border border-border-strong px-6 text-sm font-semibold text-foreground"
          >
            Go to Today
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: BRAND.storeName },
      { name: "description", content: DESCRIPTION },
      { name: "author", content: "Florence, powered by SIHAT" },
      { name: "theme-color", content: "#FBF6EC" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: BRAND.name },
      { name: "application-name", content: BRAND.name },
      { property: "og:title", content: BRAND.storeName },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-florence.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: BRAND.storeName },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: "/og-florence.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,600,100,0..1&family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon-48.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_BOOT_SCRIPT,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { Toaster } from "@/components/ui/sonner";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/register-sw";
import { recordPhoneSpeed } from "@/lib/phone-speed";
import { applyTheme, getThemePreference, THEME_BOOT_SCRIPT } from "@/lib/theme";
import { installErrorReporting, reportError } from "@/lib/error-reporting";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    registerServiceWorker();
    // Errors on phones reach staff on /admin/diagnostics.
    const stopReportingErrors = installErrorReporting();
    // Request timings for the speed page (/speed, /admin/diagnostics).
    const stopRecordingSpeed = recordPhoneSpeed();
    // Automatic switches to Lamplight mode at 8 pm and back at 6 am; check
    // each minute. applyTheme waits while a study session is open.
    const syncTheme = () => applyTheme(getThemePreference());
    syncTheme();
    const timer = window.setInterval(syncTheme, 60_000);
    const onVisible = () => document.visibilityState === "visible" && syncTheme();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", syncTheme);
      stopRecordingSpeed();
      stopReportingErrors();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
